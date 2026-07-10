import { useEffect, useState } from 'react';

import { signedPhotoUrl } from '@/lib/remote';
import type { FoodEntry } from '@/types';

// Session cache of storage path -> signed URL, so a photo isn't re-signed on
// every render or list scroll. Signed URLs are time-limited but fine per session.
const cache = new Map<string, string>();

/**
 * Resolve the best display URI for an entry's photo:
 * - a local `photoUri` (just-captured, or local-only mode) is used directly;
 * - otherwise a cloud `photoPath` is turned into a signed URL from Storage.
 * Returns undefined when there's no photo (caller shows a placeholder).
 */
export function useEntryPhoto(entry: Pick<FoodEntry, 'photoUri' | 'photoPath'>): string | undefined {
  const { photoUri, photoPath } = entry;
  const [url, setUrl] = useState<string | undefined>(
    photoUri ?? (photoPath ? cache.get(photoPath) : undefined),
  );

  useEffect(() => {
    if (photoUri) {
      setUrl(photoUri);
      return;
    }
    if (!photoPath) {
      setUrl(undefined);
      return;
    }
    const cached = cache.get(photoPath);
    if (cached) {
      setUrl(cached);
      return;
    }
    let active = true;
    signedPhotoUrl(photoPath).then((signed) => {
      if (signed && active) {
        cache.set(photoPath, signed);
        setUrl(signed);
      }
    });
    return () => {
      active = false;
    };
  }, [photoUri, photoPath]);

  return url;
}
