import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AmbientBackground } from '@/components/ambient-background';
import { Button } from '@/components/button';
import { Field } from '@/components/field';
import { Appear, PressableScale } from '@/components/motion';
import { Segmented } from '@/components/segmented';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { haptics } from '@/lib/haptics';
import { useDiary } from '@/context/DiaryContext';
import { useEntryPhoto } from '@/hooks/use-entry-photo';
import { useTheme } from '@/hooks/use-theme';
import { MEAL_TYPES, type MealType } from '@/types';

const MEAL_OPTIONS = MEAL_TYPES.map((m) => ({ value: m, label: m[0].toUpperCase() + m.slice(1) }));

export default function EditEntryScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { entries, updateEntry, removeEntry } = useDiary();

  const entry = entries.find((e) => e.id === id);
  const photoUri = useEntryPhoto(entry ?? {});

  const [name, setName] = useState(entry?.name ?? '');
  const [meal, setMeal] = useState<MealType>(entry?.meal ?? 'snack');
  const [calories, setCalories] = useState(String(entry?.calories ?? ''));
  const [protein, setProtein] = useState(String(Math.round(entry?.macros.protein ?? 0)));
  const [carbs, setCarbs] = useState(String(Math.round(entry?.macros.carbs ?? 0)));
  const [fat, setFat] = useState(String(Math.round(entry?.macros.fat ?? 0)));
  const [quantity, setQuantity] = useState(String(entry?.quantity ?? 1));

  if (!entry) {
    return (
      <ThemedView style={[styles.flex, styles.centerContent]}>
        <ThemedText themeColor="textSecondary">This entry no longer exists.</ThemedText>
        <Button title="Close" variant="secondary" onPress={() => router.back()} />
      </ThemedView>
    );
  }

  function onSave() {
    updateEntry(entry!.id, {
      name: name.trim() || 'Food',
      meal,
      calories: Math.max(0, Math.round(Number(calories) || 0)),
      macros: {
        protein: Math.max(0, Number(protein) || 0),
        carbs: Math.max(0, Number(carbs) || 0),
        fat: Math.max(0, Number(fat) || 0),
      },
      quantity: Math.max(0.25, Number(quantity) || 1),
    });
    router.back();
  }

  function onDelete() {
    removeEntry(entry!.id);
    router.back();
  }

  return (
    <ThemedView style={styles.flex}>
      <AmbientBackground />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: Platform.OS === 'ios' ? Spacing.four : insets.top + Spacing.four },
        ]}>
        <Appear style={styles.column}>
          <View style={styles.header}>
            <ThemedText type="title" style={styles.title}>
              Edit food
            </ThemedText>
            <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Close">
              <ThemedText type="smallBold" themeColor="textSecondary">
                Cancel
              </ThemedText>
            </Pressable>
          </View>

          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.photo} contentFit="cover" />
          ) : null}

          <Field label="Name" value={name} onChangeText={setName} />

          <View style={styles.field}>
            <ThemedText type="smallBold">Meal</ThemedText>
            <Segmented wrap value={meal} onChange={setMeal} options={MEAL_OPTIONS} />
          </View>

          <View style={styles.grid}>
            <View style={styles.gridItem}>
              <Field
                label="Calories"
                value={calories}
                onChangeText={setCalories}
                keyboardType="number-pad"
                suffix="kcal"
              />
            </View>
            <View style={styles.gridItem}>
              <Field
                label="Servings"
                value={quantity}
                onChangeText={setQuantity}
                keyboardType="decimal-pad"
              />
            </View>
          </View>

          <View style={styles.grid}>
            <View style={styles.gridItem}>
              <Field label="Protein" value={protein} onChangeText={setProtein} keyboardType="number-pad" suffix="g" />
            </View>
            <View style={styles.gridItem}>
              <Field label="Carbs" value={carbs} onChangeText={setCarbs} keyboardType="number-pad" suffix="g" />
            </View>
            <View style={styles.gridItem}>
              <Field label="Fat" value={fat} onChangeText={setFat} keyboardType="number-pad" suffix="g" />
            </View>
          </View>

          <Button title="Save changes" icon="checkmark" onPress={onSave} />
          <PressableScale
            onPress={() => {
              haptics.warning();
              onDelete();
            }}
            scaleTo={0.96}
            style={styles.delete}
            accessibilityRole="button">
            <ThemedText type="smallBold" themeColor="danger">
              Delete entry
            </ThemedText>
          </PressableScale>
        </Appear>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centerContent: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
  },
  photo: {
    width: '100%',
    height: 220,
    borderRadius: Radius.lg,
  },
  field: {
    gap: Spacing.two,
  },
  grid: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  gridItem: {
    flex: 1,
  },
  delete: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
  },
});
