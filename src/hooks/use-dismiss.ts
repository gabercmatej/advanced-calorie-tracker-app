import { useRouter, type Href } from 'expo-router';
import { useCallback } from 'react';

/**
 * Close a modal screen, with somewhere to land when there is no history.
 *
 * `router.back()` pops the navigation stack, which is right whenever the screen
 * was pushed from inside the app — the only way to reach these screens on
 * device. On web the URL is also an entry point: a bookmarked, shared or
 * hand-typed `/add` opens with an empty stack, and then `back()` has nothing to
 * pop. It fails silently in production (Expo Router only logs "The action
 * 'GO_BACK' was not handled by any navigator" in development), which leaves the
 * close button inert and a save appearing to do nothing at all.
 *
 * Falling back to the tab root is the honest equivalent: dismissing a modal
 * means "return to the app", and with no history that is where the app starts.
 */
export function useDismiss(fallback: Href = '/') {
  const router = useRouter();
  return useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace(fallback);
  }, [router, fallback]);
}
