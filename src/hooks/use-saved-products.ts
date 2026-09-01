import { useCallback, useEffect, useRef, useState } from 'react';

import {
  rememberProduct,
  type SavedProduct,
  type ScannedProductInput,
} from '@/lib/product-memory';
import { StorageKeys, storage } from '@/lib/storage';

/**
 * Persistence for scanned-product memory.
 *
 * Deliberately a hook rather than a sixth context: only the logger screen reads
 * or writes it, it is not part of the splash gate, and an empty list while it
 * hydrates is harmless — the worst case is one meal that resolves "protein
 * powder" generically instead of to the saved tub.
 *
 * All the decisions live in `lib/product-memory.ts` as pure functions; this
 * only moves them to and from storage.
 */
export function useSavedProducts() {
  const [products, setProducts] = useState<SavedProduct[]>([]);
  const [ready, setReady] = useState(false);
  // Hydration must never write defaults back over real data, so writes are
  // suppressed until the first read has landed.
  const hydrated = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await storage.get<SavedProduct[]>(StorageKeys.savedProducts);
      if (cancelled) return;
      if (saved?.length) setProducts(saved);
      hydrated.current = true;
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback((next: SavedProduct[]) => {
    setProducts(next);
    if (hydrated.current) void storage.set(StorageKeys.savedProducts, next);
  }, []);

  /** Record a successful scan. This product becomes the default for its category. */
  const remember = useCallback(
    (scan: ScannedProductInput) => {
      setProducts((current) => {
        const next = rememberProduct(current, scan);
        if (hydrated.current) void storage.set(StorageKeys.savedProducts, next);
        return next;
      });
    },
    [],
  );

  return { products, ready, remember, persist };
}
