import type { FoodEntry } from '@/types';

/**
 * Resolve the display URI for an entry's photo.
 *
 * Photos live only on the device that took them — they are never uploaded (see
 * the note in `lib/remote.ts`), so this is simply the local `photoUri`. An
 * entry synced from another device, or restored from a backup, has no photo;
 * callers render their placeholder in that case.
 */
export function useEntryPhoto(entry: Pick<FoodEntry, 'photoUri'>): string | undefined {
  return entry.photoUri;
}
