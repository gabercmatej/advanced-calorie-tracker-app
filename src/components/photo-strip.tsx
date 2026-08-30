import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { PressableScale } from '@/components/motion';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/lib/haptics';
import type { PickedPhoto } from '@/lib/image';

const TILE = 96;

interface PhotoStripProps {
  photos: PickedPhoto[];
  onRemove: (index: number) => void;
  onAdd: () => void;
  max: number;
  /** Hides the remove buttons while an estimate is running. */
  busy?: boolean;
}

/**
 * The capture surface's photo row: existing shots plus a trailing tile that
 * opens the add menu. Horizontal rather than a grid, because the natural action
 * is "one more angle", not "browse a gallery" — and it keeps the description
 * field on screen while shooting.
 */
export function PhotoStrip({ photos, onRemove, onAdd, max, busy }: PhotoStripProps) {
  const theme = useTheme();
  const full = photos.length >= max;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      keyboardShouldPersistTaps="handled">
      {photos.map((photo, index) => (
        <View key={`${photo.uri}-${index}`} style={styles.tile}>
          <Image
            source={{ uri: photo.uri }}
            style={styles.image}
            contentFit="cover"
            accessibilityLabel={`Meal photo ${index + 1} of ${photos.length}`}
          />
          {!busy ? (
            <Pressable
              onPress={() => {
                haptics.light();
                onRemove(index);
              }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Remove photo ${index + 1}`}
              style={[styles.remove, { backgroundColor: theme.overlay }]}>
              <Ionicons name="close" size={14} color="#FFFFFF" />
            </Pressable>
          ) : null}
        </View>
      ))}

      {!full ? (
        <PressableScale
          onPress={() => {
            haptics.light();
            onAdd();
          }}
          disabled={busy}
          scaleTo={0.94}
          accessibilityRole="button"
          accessibilityLabel={
            photos.length === 0 ? 'Add a photo or scan a barcode' : 'Add another photo or scan a barcode'
          }
          style={[
            styles.tile,
            styles.addTile,
            { backgroundColor: theme.tintSoft, borderColor: theme.border },
            busy && styles.busy,
          ]}>
          <Ionicons name="add" size={24} color={theme.tint} />
          <ThemedText type="small" style={{ color: theme.tint, textAlign: 'center' }}>
            {photos.length === 0 ? 'Add' : 'Angle'}
          </ThemedText>
        </PressableScale>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: Spacing.two,
    paddingRight: Spacing.two,
  },
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  addTile: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.half,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
  },
  busy: {
    opacity: 0.5,
  },
  remove: {
    position: 'absolute',
    top: Spacing.one,
    right: Spacing.one,
    borderRadius: Radius.full,
    padding: Spacing.half,
  },
});
