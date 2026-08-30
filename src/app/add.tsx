import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
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
import { PhotoStrip } from '@/components/photo-strip';
import { QuickLogList, type QuickTab } from '@/components/quick-log-list';
import { Segmented } from '@/components/segmented';
import { FoodEstimateSkeleton } from '@/components/skeleton';
import { Stepper } from '@/components/stepper';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Radius, Shadow, Spacing } from '@/constants/theme';
import { useCelebration } from '@/context/CelebrationContext';
import { useDiary } from '@/context/DiaryContext';
import { useTheme } from '@/hooks/use-theme';
import { useDismiss } from '@/hooks/use-dismiss';
import { estimateFood, type FoodEstimate, type KnownItem } from '@/lib/ai';
import {
  defaultPortion,
  findFood,
  scaleFood,
  searchFoods,
  type LibraryFood,
} from '@/lib/food-library';
import { lookupBarcode } from '@/lib/barcode';
import { haptics } from '@/lib/haptics';
import { pickPhoto, takePhoto, type PickedPhoto } from '@/lib/image';
import { currentMeal, isStreakMilestone, relativeDayLabel, toDateKey } from '@/lib/nutrition';
import {
  isSaved,
  quickToEntry,
  recentFoods,
  savedToQuick,
  type QuickFood,
} from '@/lib/quick-log';
import { MEAL_TYPES, type EntryItem, type MealType } from '@/types';

const MEAL_OPTIONS = MEAL_TYPES.map((m) => ({ value: m, label: m[0].toUpperCase() + m.slice(1) }));

/** More angles stop helping well before this, and each one costs vision tokens. */
const MAX_PHOTOS = 4;

/** A product the user scanned, with its exact per-unit label nutrition. */
interface ScannedItem extends KnownItem {
  key: string;
  code: string;
}

interface Draft {
  name: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  /** Blank when unknown — distinct from a known 0 g. */
  fiber: string;
  quantity: string;
  confidence: number;
  /**
   * Set when the draft came from the food library. Holds the amount in grams so
   * the numbers can be rescaled exactly rather than multiplied by a serving.
   */
  basis?: { foodId: string; grams: number };
  /** Provenance of the original estimate. Display only — edits don't rewrite it. */
  items?: EntryItem[];
  /** The photos were not analysed — offline keyword estimate only. */
  estimatedOffline?: boolean;
}

/** A draft for `grams` of a library food, with every field rescaled exactly. */
function draftFromLibrary(food: LibraryFood, grams: number): Draft {
  const n = scaleFood(food, grams);
  return {
    name: food.name,
    calories: String(n.calories),
    protein: String(Math.round(n.protein)),
    carbs: String(Math.round(n.carbs)),
    fat: String(Math.round(n.fat)),
    fiber: String(Math.round(n.fiber)),
    quantity: '1',
    // A reference lookup, not a guess.
    confidence: 1,
    basis: { foodId: food.id, grams },
  };
}

function draftFrom(e: FoodEstimate): Draft {
  return {
    name: e.name,
    calories: String(e.calories),
    protein: String(Math.round(e.macros.protein)),
    carbs: String(Math.round(e.macros.carbs)),
    fat: String(Math.round(e.macros.fat)),
    fiber: e.fiber == null ? '' : String(Math.round(e.fiber)),
    quantity: '1',
    confidence: e.confidence,
    items: e.items,
    estimatedOffline: e.estimatedOffline,
  };
}

/**
 * The capture surface. One screen, no modes: photos, a description and scanned
 * products all describe the same meal and are fused into a single estimate.
 * Scanned products keep their exact label numbers; the model only fills in
 * whatever else is on the plate.
 */
export default function AddFoodScreen() {
  const theme = useTheme();
  const dismiss = useDismiss('/');
  const insets = useSafeAreaInsets();
  const { date } = useLocalSearchParams<{ date?: string }>();
  const { addEntry, entries, entriesForDate, savedFoods, toggleSavedFood, streak } = useDiary();
  const { celebrate } = useCelebration();

  const targetDate = date ?? toDateKey();
  const isToday = targetDate === toDateKey();

  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [scanned, setScanned] = useState<ScannedItem[]>([]);
  const [description, setDescription] = useState('');
  const [meal, setMeal] = useState<MealType>(currentMeal());
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanFeedback, setScanFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [quickTab, setQuickTab] = useState<QuickTab>('recent');
  const [query, setQuery] = useState('');

  const recent = useMemo(
    () => recentFoods(entries, { today: toDateKey(), limit: 12 }),
    [entries],
  );
  const savedQuick = useMemo(() => savedFoods.map(savedToQuick), [savedFoods]);
  const results = useMemo(() => searchFoods(query, 20), [query]);

  const isEmpty = photos.length === 0 && scanned.length === 0;
  // Hidden as soon as the user starts describing or capturing a meal: at that
  // point they are logging something new, and two competing paths would only
  // be noise.
  // The search box is always worth showing, so unlike the recents list this
  // does not require prior history — only that nothing else is in progress.
  const showQuickLog = isEmpty && !draft && description.trim().length === 0;
  const canEstimate = !isEmpty || description.trim().length > 0;

  /** Any change to the inputs invalidates the estimate on screen. */
  function invalidate() {
    setDraft(null);
    setError(null);
  }

  async function addPhoto(source: 'camera' | 'library') {
    setMenuOpen(false);
    const photo = source === 'camera' ? await takePhoto() : await pickPhoto();
    if (!photo) return;
    setPhotos((prev) => (prev.length >= MAX_PHOTOS ? prev : [...prev, photo]));
    invalidate();
  }

  function removePhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
    invalidate();
  }

  function openScanner() {
    setMenuOpen(false);
    setScanFeedback(null);
    setError(null);
    setScanning(true);
  }

  async function onScanned(code: string) {
    haptics.light();
    try {
      const product = await lookupBarcode(code);
      if (!product) {
        setScanFeedback(`No product found for ${code}`);
        return;
      }
      setScanned((prev) => {
        // Scanning the same product again bumps its count rather than duplicating.
        const existing = prev.find((p) => p.code === code);
        if (existing) {
          return prev.map((p) => (p.code === code ? { ...p, quantity: p.quantity + 1 } : p));
        }
        return [
          ...prev,
          {
            key: `${code}-${Date.now()}`,
            code,
            name: product.name,
            calories: product.calories,
            macros: product.macros,
            fiber: product.fiber,
            quantity: 1,
          },
        ];
      });
      setScanFeedback(`Added ${product.name}`);
      invalidate();
    } catch {
      setScanFeedback('Could not reach the food database');
    }
  }

  function setQuantity(key: string, quantity: number) {
    setScanned((prev) => prev.map((p) => (p.key === key ? { ...p, quantity } : p)));
    invalidate();
  }

  function removeScanned(key: string) {
    setScanned((prev) => prev.filter((p) => p.key !== key));
    invalidate();
  }

  async function onEstimate() {
    if (!canEstimate || loading) return;
    setLoading(true);
    setDraft(null);
    setError(null);
    try {
      const estimate = await estimateFood({
        description,
        photos,
        knownItems: scanned.map(({ name, calories, macros, fiber, quantity }) => ({
          name,
          calories,
          macros,
          fiber,
          quantity,
        })),
      });
      setDraft(draftFrom(estimate));
    } catch {
      setError('Could not work out the calories. Adjust the details and try again.');
    } finally {
      setLoading(false);
    }
  }

  /**
   * Commit an entry and leave. Shared by the review card and the one-tap
   * quick-log path so both celebrate, both extend the streak, and neither can
   * drift from the other.
   */
  function commit(entry: Parameters<typeof addEntry>[0], kcal: number) {
    const firstOfDay = entriesForDate(targetDate).length === 0 && targetDate === toDateKey();
    const milestone = firstOfDay && isStreakMilestone(streak + 1);
    addEntry(entry);
    celebrate(milestone ? `🔥 ${streak + 1} day streak!` : `+${Math.round(kcal)} kcal logged`, {
      confetti: milestone,
    });
    dismiss();
  }

  /** Load a previous food into the editor so the portion can be adjusted. */
  function onQuickPick(food: QuickFood) {
    setMeal(food.usualMeal);
    setDraft({
      name: food.name,
      calories: String(food.calories),
      protein: String(Math.round(food.macros.protein)),
      carbs: String(Math.round(food.macros.carbs)),
      fat: String(Math.round(food.macros.fat)),
      fiber: food.fiber == null ? '' : String(Math.round(food.fiber)),
      quantity: '1',
      // Not a guess: these are the user's own numbers from last time.
      confidence: 1,
    });
    setError(null);
  }

  /** Log a previous food unchanged, in a single tap and with no model call. */
  function onQuickLogNow(food: QuickFood) {
    commit(quickToEntry(food, food.usualMeal, targetDate), food.calories);
  }

  /** Open a library food in the editor at its usual portion. */
  function onPickLibrary(food: LibraryFood) {
    setDraft(draftFromLibrary(food, defaultPortion(food).grams));
    setError(null);
  }

  /** Log a library food at its usual portion, in one tap and with no API call. */
  function onLogLibrary(food: LibraryFood) {
    const portion = defaultPortion(food);
    const n = scaleFood(food, portion.grams);
    commit(
      {
        name: food.name,
        date: targetDate,
        meal,
        calories: n.calories,
        macros: { protein: n.protein, carbs: n.carbs, fat: n.fat },
        fiber: n.fiber,
        quantity: 1,
        aiEstimated: false,
      },
      n.calories,
    );
  }

  /** Rescale the whole draft to a new weight of the same library food. */
  function setGrams(grams: number) {
    setDraft((d) => {
      if (!d?.basis) return d;
      const food = findFood(d.basis.foodId);
      if (!food) return d;
      // Rebuilt from the per-100 g base rather than adjusted from the current
      // numbers, so repeated changes cannot accumulate rounding drift.
      return { ...draftFromLibrary(food, Math.max(0, grams)), quantity: d.quantity };
    });
  }

  function onToggleSave() {
    if (!draft) return;
    toggleSavedFood({
      name: draft.name.trim() || 'Food',
      calories: Math.max(0, Math.round(Number(draft.calories) || 0)),
      macros: {
        protein: Math.max(0, Number(draft.protein) || 0),
        carbs: Math.max(0, Number(draft.carbs) || 0),
        fat: Math.max(0, Number(draft.fat) || 0),
      },
      fiber: draft.fiber.trim() === '' ? undefined : Math.max(0, Number(draft.fiber) || 0),
      usualMeal: meal,
    });
  }

  function onAdd() {
    if (!draft) return;
    const calories = Math.max(0, Math.round(Number(draft.calories) || 0));
    const quantity = Math.max(0.25, Number(draft.quantity) || 1);
    const uris = photos.map((p) => p.uri);
    const fiber = draft.fiber.trim() === '' ? undefined : Math.max(0, Number(draft.fiber) || 0);

    commit(
      {
        name: draft.name.trim() || 'Food',
        date: targetDate,
        meal,
        calories,
        macros: {
          protein: Math.max(0, Number(draft.protein) || 0),
          carbs: Math.max(0, Number(draft.carbs) || 0),
          fat: Math.max(0, Number(draft.fat) || 0),
        },
        fiber,
        quantity,
        // Purely scanned meals are label-derived, not estimated. A draft loaded
        // from a previous entry carries no items and no capture, so it lands
        // here as false too — which is correct, it was never a fresh guess.
        aiEstimated:
          draft.items?.some((i) => i.source === 'estimate') ??
          photos.length + description.trim().length > 0,
        photoUri: uris[0],
        photoUris: uris.length > 1 ? uris : undefined,
        items: draft.items,
      },
      calories * quantity,
    );
  }

  const setField = (key: keyof Draft) => (v: string) =>
    setDraft((d) => (d ? { ...d, [key]: v } : d));

  const labelCount = draft?.items?.filter((i) => i.source === 'label').length ?? 0;
  const basisFood = draft?.basis ? findFood(draft.basis.foodId) : undefined;
  const draftIsSaved = draft
    ? isSaved(savedFoods, { name: draft.name, calories: Number(draft.calories) || 0 })
    : false;

  return (
    <ThemedView style={styles.flex}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View
          style={[
            styles.header,
            { paddingTop: Platform.OS === 'ios' ? Spacing.two : insets.top + Spacing.two },
          ]}>
          <ThemedText type="title" style={styles.title}>
            {isToday ? 'Log food' : `Log · ${relativeDayLabel(targetDate)}`}
          </ThemedText>
          <Pressable
            onPress={() => dismiss()}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Close">
            <Ionicons name="close" size={26} color={theme.text} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.column}>
            {/* Re-logging is the common case on a long cut, so it sits above
                capture — but only while the screen is otherwise untouched, so
                there is never both a quick list and a pending estimate. */}
            {showQuickLog ? (
              <Appear>
                <Card>
                  <QuickLogList
                    tab={quickTab}
                    onTabChange={setQuickTab}
                    query={query}
                    onQueryChange={setQuery}
                    recent={recent}
                    saved={savedQuick}
                    results={results}
                    onPick={onQuickPick}
                    onLogNow={onQuickLogNow}
                    onPickLibrary={onPickLibrary}
                    onLogLibrary={onLogLibrary}
                  />
                </Card>
              </Appear>
            ) : null}

            <Card style={styles.captureCard}>
              {/* --- Capture ------------------------------------------------ */}
              {isEmpty ? (
                <View style={styles.emptyActions}>
                  <BigAction icon="camera" label="Photo" onPress={() => addPhoto('camera')} />
                  <BigAction icon="images" label="Gallery" onPress={() => addPhoto('library')} />
                  <BigAction icon="barcode-outline" label="Scan" onPress={openScanner} />
                </View>
              ) : (
                <>
                  <PhotoStrip
                    photos={photos}
                    onRemove={removePhoto}
                    onAdd={() => setMenuOpen((open) => !open)}
                    max={MAX_PHOTOS}
                    busy={loading}
                  />

                  {menuOpen ? (
                    <Appear distance={8}>
                      <View style={[styles.menu, { borderColor: theme.border }]}>
                        <MenuRow icon="camera" label="Take a photo" onPress={() => addPhoto('camera')} />
                        <MenuRow icon="images" label="Choose from gallery" onPress={() => addPhoto('library')} />
                        <MenuRow icon="barcode-outline" label="Scan a barcode" onPress={openScanner} />
                      </View>
                    </Appear>
                  ) : null}
                </>
              )}

              {photos.length >= MAX_PHOTOS ? (
                <ThemedText type="small" themeColor="textSecondary">
                  That&apos;s enough angles — more won&apos;t improve the estimate.
                </ThemedText>
              ) : null}

              {/* --- Scanned products --------------------------------------- */}
              {scanned.map((item) => (
                <Appear key={item.key} distance={8}>
                  <View style={[styles.scanChip, { backgroundColor: theme.tintSoft, borderColor: theme.border }]}>
                    <Ionicons name="pricetag" size={14} color={theme.tint} />
                    <View style={styles.scanText}>
                      <ThemedText type="smallBold" numberOfLines={1}>
                        {item.name}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {item.calories} kcal each · from label
                      </ThemedText>
                    </View>
                    <Stepper
                      value={item.quantity}
                      onChange={(q) => setQuantity(item.key, q)}
                      label={item.name}
                    />
                    <Pressable
                      onPress={() => removeScanned(item.key)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${item.name}`}>
                      <Ionicons name="close" size={18} color={theme.textSecondary} />
                    </Pressable>
                  </View>
                </Appear>
              ))}

              {/* --- Description -------------------------------------------- */}
              <ThemedText type="smallBold">
                Description {isEmpty ? '' : '(optional)'}
              </ThemedText>
              <TextInput
                value={description}
                onChangeText={(t) => {
                  setDescription(t);
                  if (draft) invalidate();
                }}
                placeholder="e.g. 2 cans of tuna, big salad, olive oil"
                placeholderTextColor={theme.textSecondary}
                multiline
                accessibilityLabel="Describe the meal"
                style={[
                  styles.input,
                  {
                    color: theme.text,
                    backgroundColor: theme.backgroundSelected,
                    borderColor: theme.border,
                  },
                ]}
              />

              <ThemedText type="smallBold">Meal</ThemedText>
              <Segmented wrap value={meal} onChange={setMeal} options={MEAL_OPTIONS} />

              {error ? (
                <View style={styles.errorRow}>
                  <Ionicons name="alert-circle-outline" size={16} color={theme.danger} />
                  <ThemedText type="small" style={[styles.errorText, { color: theme.danger }]}>
                    {error}
                  </ThemedText>
                </View>
              ) : null}

              <Button
                title={draft ? 'Recalculate' : 'Calculate calories'}
                icon={draft ? 'refresh' : 'sparkles'}
                onPress={onEstimate}
                loading={loading}
                disabled={!canEstimate}
              />
              {!canEstimate ? (
                <ThemedText type="small" themeColor="textSecondary">
                  Add a photo, scan a product, or describe what you ate.
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

            {/* --- Review -------------------------------------------------- */}
            {draft ? (
              <Appear>
                <Card style={styles.reviewCard}>
                  <View style={styles.estimateHeader}>
                    <ThemedText type="subtitle" style={styles.estimateTitle}>
                      Review &amp; adjust
                    </ThemedText>
                    <View style={[styles.badge, { backgroundColor: theme.backgroundSelected }]}>
                      <Ionicons
                        name={labelCount > 0 ? 'pricetag' : 'sparkles'}
                        size={12}
                        color={theme.tint}
                      />
                      <ThemedText type="small" themeColor="textSecondary">
                        {labelCount > 0
                          ? `${labelCount} exact · ${Math.round(draft.confidence * 100)}% sure`
                          : `${Math.round(draft.confidence * 100)}% sure`}
                      </ThemedText>
                    </View>
                  </View>

                  {/* Silent degradation on the headline feature would be worse
                      than a slightly noisier card — say the photos weren't read. */}
                  {draft.estimatedOffline && photos.length > 0 ? (
                    <View style={styles.errorRow}>
                      <Ionicons name="cloud-offline-outline" size={15} color={theme.textSecondary} />
                      <ThemedText type="small" themeColor="textSecondary" style={styles.errorText}>
                        Your {photos.length === 1 ? 'photo was' : 'photos were'} not analysed —
                        this is a keyword estimate from the description. Check the numbers.
                      </ThemedText>
                    </View>
                  ) : null}

                  {draft.items?.length ? (
                    <View style={[styles.breakdown, { borderColor: theme.border }]}>
                      {draft.items.map((item, i) => (
                        <View key={`${item.name}-${i}`} style={styles.breakdownRow}>
                          <Ionicons
                            name={item.source === 'label' ? 'pricetag' : 'sparkles-outline'}
                            size={12}
                            color={item.source === 'label' ? theme.success : theme.textSecondary}
                          />
                          <ThemedText type="small" style={styles.breakdownName} numberOfLines={1}>
                            {item.name}
                          </ThemedText>
                          <ThemedText type="small" themeColor="textSecondary">
                            {item.source === 'label' ? '' : '~'}
                            {item.calories} kcal
                          </ThemedText>
                        </View>
                      ))}
                    </View>
                  ) : null}

                  <Field label="Name" value={draft.name} onChangeText={setField('name')} />

                  {/* Amount, for foods that came from the library. Everything
                      below rescales from the per-100 g base as this changes, so
                      137 g is exact rather than "about one and a half servings". */}
                  {basisFood ? (
                    <View style={styles.field}>
                      <View style={styles.portionRow}>
                        {basisFood.portions.map((portion) => {
                          const active = draft.basis?.grams === portion.grams;
                          return (
                            <PressableScale
                              key={portion.label}
                              onPress={() => {
                                haptics.light();
                                setGrams(portion.grams);
                              }}
                              scaleTo={0.96}
                              accessibilityRole="button"
                              accessibilityState={{ selected: active }}
                              accessibilityLabel={portion.label}
                              style={[
                                styles.portionChip,
                                {
                                  backgroundColor: active ? theme.tint : theme.backgroundSelected,
                                  borderColor: active ? theme.tint : theme.border,
                                },
                              ]}>
                              <ThemedText
                                type="small"
                                style={active ? { color: theme.onTint } : undefined}>
                                {portion.label}
                              </ThemedText>
                            </PressableScale>
                          );
                        })}
                      </View>
                      <Field
                        label={basisFood.liquid ? 'Amount' : 'Weight'}
                        value={String(draft.basis?.grams ?? '')}
                        onChangeText={(v) => setGrams(Math.round(Number(v) || 0))}
                        keyboardType="number-pad"
                        suffix={basisFood.liquid ? 'ml' : 'g'}
                      />
                    </View>
                  ) : null}

                  <View style={styles.grid}>
                    <View style={styles.gridItem}>
                      <Field
                        label="Calories"
                        value={draft.calories}
                        onChangeText={setField('calories')}
                        keyboardType="number-pad"
                        suffix="kcal"
                      />
                    </View>
                    <View style={styles.gridItem}>
                      <Field
                        label="Servings"
                        value={draft.quantity}
                        onChangeText={setField('quantity')}
                        keyboardType="decimal-pad"
                      />
                    </View>
                  </View>

                  <View style={styles.macroGrid}>
                    <View style={styles.macroItem}>
                      <Field
                        label="Protein"
                        value={draft.protein}
                        onChangeText={setField('protein')}
                        keyboardType="number-pad"
                        suffix="g"
                      />
                    </View>
                    <View style={styles.macroItem}>
                      <Field
                        label="Carbs"
                        value={draft.carbs}
                        onChangeText={setField('carbs')}
                        keyboardType="number-pad"
                        suffix="g"
                      />
                    </View>
                    <View style={styles.macroItem}>
                      <Field
                        label="Fat"
                        value={draft.fat}
                        onChangeText={setField('fat')}
                        keyboardType="number-pad"
                        suffix="g"
                      />
                    </View>
                    <View style={styles.macroItem}>
                      <Field
                        label="Fibre"
                        value={draft.fiber}
                        onChangeText={setField('fiber')}
                        keyboardType="number-pad"
                        suffix="g"
                        placeholder="—"
                      />
                    </View>
                  </View>

                  <Button title="Add to diary" icon="checkmark-circle" onPress={onAdd} />
                  <Button
                    title={draftIsSaved ? 'Saved for one-tap logging' : 'Save for one-tap logging'}
                    icon={draftIsSaved ? 'bookmark' : 'bookmark-outline'}
                    variant="secondary"
                    onPress={onToggleSave}
                  />
                </Card>
              </Appear>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <BarcodeScanner
        visible={scanning}
        onClose={() => setScanning(false)}
        onScanned={onScanned}
        feedback={scanFeedback}
      />
    </ThemedView>
  );
}

/** The large first-run capture buttons, shown only while nothing is captured. */
function BigAction({
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
      accessibilityLabel={label}
      style={[styles.bigAction, { backgroundColor: theme.tintSoft, borderColor: theme.border }]}>
      <View style={[styles.bigActionIcon, { backgroundColor: theme.backgroundElement }, Shadow.card]}>
        <Ionicons name={icon} size={22} color={theme.tint} />
      </View>
      <ThemedText type="smallBold">{label}</ThemedText>
    </PressableScale>
  );
}

/** A row in the inline add menu — deliberately not a modal. */
function MenuRow({
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
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.menuRow}>
      <Ionicons name={icon} size={18} color={theme.tint} />
      <ThemedText type="small">{label}</ThemedText>
    </Pressable>
  );
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
  captureCard: {
    gap: Spacing.two,
  },
  emptyActions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  bigAction: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.four,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  bigActionIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menu: {
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    minHeight: 44,
  },
  scanChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  scanText: {
    flex: 1,
    gap: Spacing.half,
  },
  input: {
    minHeight: 72,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
    fontSize: 16,
    textAlignVertical: 'top',
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  errorText: {
    flex: 1,
  },
  reviewCard: {
    gap: Spacing.two,
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
  breakdown: {
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  breakdownName: {
    flex: 1,
  },
  grid: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  gridItem: {
    flex: 1,
  },
  // Protein/carbs/fat/fibre: four across where there's room, two-by-two on a
  // narrow phone rather than four unreadably thin columns.
  macroGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  macroItem: {
    flexGrow: 1,
    flexBasis: 78,
  },
  field: {
    gap: Spacing.two,
  },
  portionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  portionChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
  },
});
