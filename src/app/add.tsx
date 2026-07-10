import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BarcodeScanner } from '@/components/barcode-scanner';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Field } from '@/components/field';
import { Appear, PressableScale } from '@/components/motion';
import { ScanOverlay } from '@/components/scan-overlay';
import { FoodEstimateSkeleton } from '@/components/skeleton';
import { Segmented } from '@/components/segmented';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Radius, Shadow, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useCelebration } from '@/context/CelebrationContext';
import { useDiary } from '@/context/DiaryContext';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/lib/haptics';
import { estimateFood, type FoodEstimate } from '@/lib/ai';
import { lookupBarcode } from '@/lib/barcode';
import { compressForUpload, pickPhoto, takePhoto, type PickedPhoto } from '@/lib/image';
import { isStreakMilestone, relativeDayLabel, toDateKey } from '@/lib/nutrition';
import { uploadPhoto } from '@/lib/remote';
import { MEAL_TYPES, type MealType } from '@/types';

const MEAL_OPTIONS = MEAL_TYPES.map((m) => ({ value: m, label: m[0].toUpperCase() + m.slice(1) }));

interface Draft {
  name: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  quantity: string;
  confidence: number;
}

function draftFrom(e: FoodEstimate): Draft {
  return {
    name: e.name,
    calories: String(e.calories),
    protein: String(Math.round(e.macros.protein)),
    carbs: String(Math.round(e.macros.carbs)),
    fat: String(Math.round(e.macros.fat)),
    quantity: '1',
    confidence: e.confidence,
  };
}

export default function AddFoodScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { date } = useLocalSearchParams<{ date?: string }>();
  const { addEntry, updateEntry, entriesForDate, streak } = useDiary();
  const { userId, usesSupabase } = useAuth();
  const { celebrate } = useCelebration();

  const targetDate = date ?? toDateKey();
  const isToday = targetDate === toDateKey();

  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [meal, setMeal] = useState<MealType>(defaultMeal());
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  /** Where the current draft came from — drives the review badge and how it's logged. */
  const [source, setSource] = useState<'ai' | 'barcode' | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const canEstimate = description.trim().length > 0 || photo !== null;

  async function onPickCamera() {
    const p = await takePhoto();
    if (p) {
      setPhoto(p);
      setDraft(null);
    }
  }
  async function onPickLibrary() {
    const p = await pickPhoto();
    if (p) {
      setPhoto(p);
      setDraft(null);
    }
  }

  async function onEstimate() {
    if (!canEstimate) return;
    setLoading(true);
    setDraft(null);
    setScanError(null);
    try {
      const est = await estimateFood({
        description,
        photoUri: photo?.uri,
        photoBase64: photo?.base64,
        photoMediaType: photo?.mimeType,
      });
      setSource('ai');
      setDraft(draftFrom(est));
    } finally {
      setLoading(false);
    }
  }

  async function onScanned(code: string) {
    setScanning(false);
    setLoading(true);
    setDraft(null);
    setScanError(null);
    try {
      const est = await lookupBarcode(code);
      if (!est) {
        setScanError(`No product found for barcode ${code}. Try a photo or description instead.`);
        return;
      }
      setSource('barcode');
      setDraft(draftFrom(est));
    } catch {
      setScanError('Could not reach the food database. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  function onAdd() {
    if (!draft) return;
    const calories = Math.max(0, Math.round(Number(draft.calories) || 0));
    const quantity = Math.max(0.25, Number(draft.quantity) || 1);
    // First log of the day extends the streak — celebrate milestones with confetti.
    const firstOfDay = entriesForDate(targetDate).length === 0 && targetDate === toDateKey();
    const milestone = firstOfDay && isStreakMilestone(streak + 1);
    const created = addEntry({
      name: draft.name.trim() || 'Food',
      date: targetDate,
      meal,
      calories,
      macros: {
        protein: Math.max(0, Number(draft.protein) || 0),
        carbs: Math.max(0, Number(draft.carbs) || 0),
        fat: Math.max(0, Number(draft.fat) || 0),
      },
      quantity,
      aiEstimated: source !== 'barcode',
      photoUri: photo?.uri ?? undefined,
    });

    // When signed into Supabase, compress the photo and upload it to the private
    // bucket in the background, then attach its path. Never blocks logging.
    if (usesSupabase && userId && photo?.uri) {
      const localUri = photo.uri;
      (async () => {
        try {
          const base64 = await compressForUpload(localUri);
          if (!base64) return;
          const path = await uploadPhoto(userId, created.id, base64);
          updateEntry(created.id, { photoPath: path });
        } catch (err) {
          console.warn('[add] photo upload failed', err);
        }
      })();
    }

    celebrate(
      milestone
        ? `🔥 ${streak + 1} day streak!`
        : `+${Math.round(calories * quantity)} kcal logged`,
      { confetti: milestone },
    );
    router.back();
  }

  const setField = (key: keyof Draft) => (v: string) => setDraft((d) => (d ? { ...d, [key]: v } : d));

  return (
    <ThemedView style={styles.flex}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View
          style={[
            styles.header,
            { paddingTop: Platform.OS === 'ios' ? Spacing.two : insets.top + Spacing.two },
          ]}>
          <ThemedText type="title" style={styles.title}>
            {isToday ? 'Log food' : `Log · ${relativeDayLabel(targetDate)}`}
          </ThemedText>
          <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Close">
            <Ionicons name="close" size={26} color={theme.text} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.column}>
            <Card>
              {photo ? (
                <View>
                  <Image source={{ uri: photo.uri }} style={styles.photo} contentFit="cover" />
                  {loading ? <ScanOverlay height={250} /> : null}
                  {!loading ? (
                    <Pressable
                      style={[styles.removePhoto, { backgroundColor: theme.overlay }]}
                      onPress={() => {
                        setPhoto(null);
                        setDraft(null);
                      }}
                      hitSlop={8}
                      accessibilityLabel="Remove photo">
                      <Ionicons name="close" size={18} color="#FFFFFF" />
                    </Pressable>
                  ) : null}
                </View>
              ) : (
                <View style={styles.photoActions}>
                  <PhotoButton icon="camera" label="Photo" onPress={onPickCamera} />
                  <PhotoButton icon="images" label="Gallery" onPress={onPickLibrary} />
                  <PhotoButton
                    icon="barcode-outline"
                    label="Scan"
                    onPress={() => {
                      setScanError(null);
                      setScanning(true);
                    }}
                  />
                </View>
              )}

              {scanError ? (
                <View style={styles.scanError}>
                  <Ionicons name="alert-circle-outline" size={16} color={theme.textSecondary} />
                  <ThemedText type="small" themeColor="textSecondary" style={styles.scanErrorText}>
                    {scanError}
                  </ThemedText>
                </View>
              ) : null}

              <ThemedText type="smallBold">Description {photo ? '(optional)' : ''}</ThemedText>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="e.g. 2 eggs, toast with butter, black coffee"
                placeholderTextColor={theme.textSecondary}
                multiline
                style={[
                  styles.input,
                  { color: theme.text, backgroundColor: theme.backgroundSelected, borderColor: theme.border },
                ]}
              />

              <ThemedText type="smallBold">Meal</ThemedText>
              <Segmented wrap value={meal} onChange={setMeal} options={MEAL_OPTIONS} />

              <Button
                title={draft ? 'Re-analyze with AI' : photo ? 'Analyze with AI' : 'Estimate with AI'}
                onPress={onEstimate}
                loading={loading}
                disabled={!canEstimate}
              />
              {draft ? (
                <ThemedText type="small" themeColor="textSecondary">
                  Tweak the description above and re-analyze to refine the estimate.
                </ThemedText>
              ) : null}
            </Card>

            {loading && !draft ? (
              <Appear>
                <Card>
                  <FoodEstimateSkeleton />
                </Card>
              </Appear>
            ) : null}

            {draft && (
              <Appear>
              <Card>
                <View style={styles.estimateHeader}>
                  <ThemedText type="subtitle" style={styles.estimateTitle}>
                    Review & adjust
                  </ThemedText>
                  <View style={[styles.badge, { backgroundColor: theme.backgroundSelected }]}>
                    <Ionicons
                      name={source === 'barcode' ? 'barcode-outline' : 'sparkles'}
                      size={12}
                      color={theme.tint}
                    />
                    <ThemedText type="small" themeColor="textSecondary">
                      {source === 'barcode' ? 'From label' : `${Math.round(draft.confidence * 100)}% sure`}
                    </ThemedText>
                  </View>
                </View>

                <Field label="Name" value={draft.name} onChangeText={setField('name')} />

                <View style={styles.grid}>
                  <View style={styles.gridItem}>
                    <Field label="Calories" value={draft.calories} onChangeText={setField('calories')} keyboardType="number-pad" suffix="kcal" />
                  </View>
                  <View style={styles.gridItem}>
                    <Field label="Servings" value={draft.quantity} onChangeText={setField('quantity')} keyboardType="decimal-pad" />
                  </View>
                </View>

                <View style={styles.grid}>
                  <View style={styles.gridItem}>
                    <Field label="Protein" value={draft.protein} onChangeText={setField('protein')} keyboardType="number-pad" suffix="g" />
                  </View>
                  <View style={styles.gridItem}>
                    <Field label="Carbs" value={draft.carbs} onChangeText={setField('carbs')} keyboardType="number-pad" suffix="g" />
                  </View>
                  <View style={styles.gridItem}>
                    <Field label="Fat" value={draft.fat} onChangeText={setField('fat')} keyboardType="number-pad" suffix="g" />
                  </View>
                </View>

                <Button title="Add to diary" icon="checkmark-circle" onPress={onAdd} />
              </Card>
              </Appear>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <BarcodeScanner
        visible={scanning}
        onClose={() => setScanning(false)}
        onScanned={onScanned}
      />
    </ThemedView>
  );
}

function PhotoButton({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <PressableScale
      onPress={() => {
        haptics.light();
        onPress();
      }}
      scaleTo={0.94}
      accessibilityRole="button"
      style={[styles.photoButton, { backgroundColor: theme.tintSoft, borderColor: theme.border }]}>
      <View style={[styles.photoButtonIcon, { backgroundColor: theme.backgroundElement }, Shadow.card]}>
        <Ionicons name={icon} size={22} color={theme.tint} />
      </View>
      <ThemedText type="smallBold">{label}</ThemedText>
    </PressableScale>
  );
}

function defaultMeal(): MealType {
  const h = new Date().getHours();
  if (h < 11) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 21) return 'dinner';
  return 'snack';
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.two,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
  },
  content: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.six,
    alignItems: 'center',
  },
  column: {
    width: '100%',
    maxWidth: MaxContentWidth,
    gap: Spacing.three,
  },
  photoActions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  scanError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  scanErrorText: {
    flex: 1,
  },
  photoButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.four,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  photoButtonIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photo: {
    width: '100%',
    height: 250,
    borderRadius: Radius.lg,
  },
  removePhoto: {
    position: 'absolute',
    top: Spacing.two,
    right: Spacing.two,
    borderRadius: Radius.full,
    padding: Spacing.one,
  },
  input: {
    minHeight: 72,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
    fontSize: 16,
    textAlignVertical: 'top',
  },
  estimateHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
  estimateTitle: {
    fontSize: 20,
    lineHeight: 26,
    flex: 1,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
    paddingVertical: Spacing.half,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.full,
  },
  grid: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  gridItem: {
    flex: 1,
  },
});
