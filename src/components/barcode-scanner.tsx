import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useEffect, useRef } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';

// Retail food barcodes are EAN/UPC; QR/Code128 are included since the user may
// point the scanner at other codes. Non-product codes just fail the lookup.
const BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'qr'] as const;

/** How long to ignore the camera after a hit, so one product scans once. */
const REARM_MS = 1600;

/**
 * Full-screen camera modal that scans product barcodes and reports each raw
 * code via `onScanned`.
 *
 * It stays open and re-arms after every hit, because a single meal often
 * contains several packaged items — closing after the first would make
 * scanning two tins a four-tap round trip. The parent looks each code up, feeds
 * a line of `feedback` back in, and closes when the user is done.
 *
 * Camera colors are fixed light-on-dark regardless of theme, since the preview
 * is always a dark camera feed.
 */
export function BarcodeScanner({
  visible,
  onClose,
  onScanned,
  feedback,
}: {
  visible: boolean;
  onClose: () => void;
  onScanned: (code: string) => void;
  /** Result of the last lookup, shown over the preview. */
  feedback?: string | null;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const insets = useSafeAreaInsets();
  // Guards the rapid-fire onBarcodeScanned callback: one report per product.
  const handled = useRef(false);
  const lastCode = useRef<string | null>(null);
  const rearmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible) return;
    handled.current = false;
    lastCode.current = null;
    // Ask for camera access the first time the scanner is opened. Idempotent:
    // if already granted, this resolves without prompting.
    requestPermission();
  }, [visible, requestPermission]);

  // Don't leave a timer running against an unmounted modal.
  useEffect(
    () => () => {
      if (rearmTimer.current) clearTimeout(rearmTimer.current);
    },
    [],
  );

  function handleScan(result: BarcodeScanningResult) {
    if (handled.current) return;
    // The same barcode held in frame shouldn't add the product twice.
    if (result.data === lastCode.current) return;

    handled.current = true;
    lastCode.current = result.data;
    onScanned(result.data);

    if (rearmTimer.current) clearTimeout(rearmTimer.current);
    rearmTimer.current = setTimeout(() => {
      handled.current = false;
      lastCode.current = null;
    }, REARM_MS);
  }

  const granted = permission?.granted ?? false;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.container}>
        {granted && visible ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
            onBarcodeScanned={handleScan}
          />
        ) : null}

        <View style={styles.overlay} pointerEvents="box-none">
          <View style={[styles.topBar, { paddingTop: insets.top + Spacing.two }]}>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Done scanning"
              style={styles.doneButton}>
              <ThemedText style={styles.doneText}>Done</ThemedText>
            </Pressable>
          </View>

          {granted ? (
            <>
              <View style={styles.center} pointerEvents="none">
                <View style={styles.reticle} />
                <ThemedText style={styles.hint}>
                  Point at a product barcode — scan as many as you like
                </ThemedText>
              </View>

              {feedback ? (
                <View
                  style={[styles.feedback, { paddingBottom: insets.bottom + Spacing.four }]}
                  pointerEvents="none">
                  <View style={styles.feedbackPill}>
                    <Ionicons name="checkmark-circle" size={16} color="#fff" />
                    <ThemedText style={styles.feedbackText} numberOfLines={2}>
                      {feedback}
                    </ThemedText>
                  </View>
                </View>
              ) : null}
            </>
          ) : (
            <View style={styles.permission}>
              <Ionicons name="barcode-outline" size={48} color="#fff" />
              <ThemedText style={styles.permText}>
                {permission
                  ? 'Camera access is needed to scan barcodes.'
                  : 'Checking camera access…'}
              </ThemedText>
              {permission && !permission.granted ? (
                <Button title="Allow camera" onPress={requestPermission} />
              ) : null}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-start',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: Spacing.four,
  },
  doneButton: {
    minHeight: 40,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  doneText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  feedback: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
  },
  feedbackPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(0,0,0,0.65)',
    maxWidth: '100%',
  },
  feedbackText: {
    color: '#fff',
    fontSize: 14,
    flexShrink: 1,
  },
  center: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.four,
  },
  reticle: {
    width: '70%',
    aspectRatio: 1.6,
    borderWidth: 3,
    borderColor: '#fff',
    borderRadius: Radius.md,
    backgroundColor: 'transparent',
  },
  hint: {
    color: '#fff',
    fontSize: 15,
  },
  permission: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.six,
  },
  permText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
  },
});
