import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { backupFilename, parseBackup, type ParseResult } from '@/lib/backup-format';

/**
 * Saving and loading backup files.
 *
 * The pure format logic lives in `backup-format.ts`; this is only the platform
 * plumbing around it. Two platforms, two mechanisms:
 *
 *  - **native** — write into the cache directory, then hand the file to the OS
 *    share sheet so the user can put it in Files, iCloud, or send it to
 *    themselves. Reading uses the system file picker.
 *  - **web** — an object-URL download and a hidden `<input type="file">`, since
 *    neither the share sheet nor the native picker exists in a browser.
 */

/** Write `contents` to a cache file and offer it to the OS share sheet. */
async function shareNative(contents: string, filename: string, mimeType: string): Promise<void> {
  const file = new File(Paths.cache, filename);
  // A previous export of the same name would otherwise make `create` throw.
  if (file.exists) file.delete();
  file.create();
  file.write(contents);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType, UTI: 'public.json' });
  }
}

/** Trigger a browser download without leaving the page. */
function downloadWeb(contents: string, filename: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type: mimeType }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Save a backup file, by whatever means the platform offers. */
export async function saveFile(
  contents: string,
  filename: string,
  mimeType = 'application/json',
): Promise<void> {
  if (Platform.OS === 'web') downloadWeb(contents, filename, mimeType);
  else await shareNative(contents, filename, mimeType);
}

/** Convenience wrapper that names the file for today. */
export async function exportBackup(json: string): Promise<void> {
  await saveFile(json, backupFilename(), 'application/json');
}

/** Read a file the user picks in the browser. Resolves null if they cancel. */
function pickWeb(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(value);
    };
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return finish(null);
      file
        .text()
        .then(finish)
        .catch(() => finish(null));
    };
    // Fires when the picker closes, including on cancel — the only cancel
    // signal a file input gives us.
    input.oncancel = () => finish(null);
    document.body.appendChild(input);
    input.click();
  });
}

/**
 * Ask the user for a backup file and parse it.
 *
 * Resolves `null` when they cancel — the caller should treat that as a no-op,
 * not an error.
 */
export async function pickBackup(): Promise<ParseResult | null> {
  let json: string | null;

  if (Platform.OS === 'web') {
    json = await pickWeb();
  } else {
    const result = await File.pickFileAsync({ mimeTypes: ['application/json'] });
    if (result.canceled) return null;
    json = await result.result.text();
  }

  if (json == null) return null;
  return parseBackup(json);
}
