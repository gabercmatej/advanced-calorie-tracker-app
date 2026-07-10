import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

/**
 * Thin wrappers around expo-image-picker. On web, `launchCameraAsync` falls
 * back to the system file chooser automatically, so both work everywhere.
 *
 * We request `base64: true` so the picked image can be sent straight to the
 * vision model (see `src/lib/ai.ts`) without a separate file-read step.
 */

export interface PickedPhoto {
  /** Local URI, used for on-screen preview and stored on the entry. */
  uri: string;
  /** Base64-encoded image bytes for the AI estimator (no data: prefix). */
  base64?: string;
  /** MIME type, e.g. "image/jpeg" — defaults handled by the caller. */
  mimeType?: string;
}

// A lower quality keeps the base64 payload (and vision token cost) small while
// staying legible enough for the model to identify the food.
const COMMON: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  allowsEditing: true,
  aspect: [1, 1],
  quality: 0.5,
  base64: true,
};

function toPicked(res: ImagePicker.ImagePickerResult): PickedPhoto | null {
  if (res.canceled) return null;
  const a = res.assets[0];
  return { uri: a.uri, base64: a.base64 ?? undefined, mimeType: a.mimeType };
}

/** Launch the camera. Returns the photo, or null if cancelled/denied. */
export async function takePhoto(): Promise<PickedPhoto | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return null;
  return toPicked(await ImagePicker.launchCameraAsync(COMMON));
}

/** Pick a photo from the library. Returns the photo, or null if cancelled. */
export async function pickPhoto(): Promise<PickedPhoto | null> {
  return toPicked(await ImagePicker.launchImageLibraryAsync(COMMON));
}

/**
 * Compress a picked photo to a small JPEG for cloud storage: downscale to a max
 * width and re-encode at moderate quality. Returns base64 (no data: prefix)
 * suitable for uploading to Supabase Storage. Keeps upload/storage size tiny.
 */
export async function compressForUpload(uri: string, maxWidth = 1024): Promise<string> {
  const ctx = ImageManipulator.manipulate(uri).resize({ width: maxWidth });
  const image = await ctx.renderAsync();
  const result = await image.saveAsync({
    compress: 0.6,
    format: SaveFormat.JPEG,
    base64: true,
  });
  return result.base64 ?? '';
}
