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

/**
 * Full-screen camera modal that scans a product barcode and reports the raw
 * code via `onScanned` (exactly once per open). The parent looks the code up
 * and closes the modal. Camera colors are fixed light-on-dark regardless of
 * theme, since the preview is always a dark camera feed.
 */
export function BarcodeScanner({
  visible,
  onClose,
  onScanned,
}: {
  visible: boolean;
  onClose: () => void;
  onScanned: (code: string) => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const insets = useSafeAreaInsets();
  // Guard so the rapid-fire onBarcodeScanned callback only reports one code.
  const handled = useRef(false);

  useEffect(() => {
    if (!visible) return;
    handled.current = false;
    // Ask for camera access the first time the scanner is opened. Idempotent:
    // if already granted, this resolves without prompting.
    requestPermission();
  }, [visible, requestPermission]);

  function handleScan(result: BarcodeScanningResult) {
    if (handled.current) return;
    handled.current = true;
    onScanned(result.data);
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
              accessibilityLabel="Close scanner"
              style={styles.closeButton}>
              <Ionicons name="close" size={26} color="#fff" />
            </Pressable>
          </View>

          {granted ? (
            <View style={styles.center} pointerEvents="none">
              <View style={styles.reticle} />
              <ThemedText style={styles.hint}>Point at a product barcode</ThemedText>
            </View>
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
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
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
