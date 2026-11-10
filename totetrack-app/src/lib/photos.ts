import { Directory, File, Paths } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

function photoDir(): Directory {
  const dir = new Directory(Paths.document, 'photos');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/** Copies a picked image into permanent storage and returns its file name. */
export async function savePhoto(sourceUri: string): Promise<string> {
  const ext = sourceUri.split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpg';
  const name = `${Crypto.randomUUID()}.${ext}`;
  await new File(sourceUri).copy(new File(photoDir(), name));
  return name;
}

/**
 * Saves a photo of a tote's contents, shrunk to at most 1600px wide so a tote full of photos stays
 * small on the phone and quick to back up. Returns its file name.
 */
export async function saveInsidePhoto(sourceUri: string, width?: number): Promise<string> {
  try {
    const ctx = ImageManipulator.manipulate(sourceUri);
    if (!width || width > 1600) ctx.resize({ width: 1600 });
    const ref = await ctx.renderAsync();
    const out = await ref.saveAsync({ compress: 0.7, format: SaveFormat.JPEG });
    const name = `${Crypto.randomUUID()}.jpg`;
    await new File(out.uri).copy(new File(photoDir(), name));
    try {
      new File(out.uri).delete();
    } catch {
      // temp file; the system clears it eventually
    }
    return name;
  } catch {
    return savePhoto(sourceUri);
  }
}

/** Resolves a stored photo name to a URI (the documents path can change between app updates). */
export function photoUri(name?: string): string | undefined {
  if (!name) return undefined;
  return new File(photoDir(), name).uri;
}

export function deletePhoto(name?: string) {
  if (!name) return;
  try {
    const f = new File(photoDir(), name);
    if (f.exists) f.delete();
  } catch {
    // best effort
  }
}

// Lets photo views redraw when sync downloads a photo that wasn't on this phone yet.
let photoVersion = 0;
const photoListeners = new Set<() => void>();
export function notifyPhotosChanged() {
  photoVersion++;
  photoListeners.forEach((l) => l());
}
export function subscribePhotos(listener: () => void) {
  photoListeners.add(listener);
  return () => {
    photoListeners.delete(listener);
  };
}
export const getPhotoVersion = () => photoVersion;
