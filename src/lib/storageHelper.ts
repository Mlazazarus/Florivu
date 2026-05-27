import { supabase } from './supabase';
import { formatError, logError, logInfo, logWarn } from './logger';

const BUCKET = 'plant-photos';
const INLINE_IMAGE_MAX_DIMENSION = 1600;
const INLINE_IMAGE_QUALITY = 0.82;

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '-');
}

function shouldInlineFallback(error: unknown) {
  const message = formatError(error).toLowerCase();
  return message.includes('bucket not found');
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file.'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

async function createInlinePhotoDataUrl(file: File) {
  if (!file.type.startsWith('image/')) {
    return readFileAsDataUrl(file);
  }

  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new Image();
      nextImage.onload = () => resolve(nextImage);
      nextImage.onerror = () => reject(new Error('Failed to decode image.'));
      nextImage.src = objectUrl;
    });

    const largestDimension = Math.max(image.naturalWidth, image.naturalHeight);
    const scale =
      largestDimension > INLINE_IMAGE_MAX_DIMENSION
        ? INLINE_IMAGE_MAX_DIMENSION / largestDimension
        : 1;

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Canvas 2D context unavailable.');
    }

    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', INLINE_IMAGE_QUALITY);
  } catch (error) {
    logWarn('Storage', 'Inline image compression failed. Falling back to raw data URL.', error);
    return readFileAsDataUrl(file);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export interface UploadedPhotoResult {
  photoUrl: string;
  storageMode: 'bucket' | 'inline';
}

async function uploadPublicImage(
  userId: string,
  file: File,
  folder: 'plants' | 'profiles',
): Promise<UploadedPhotoResult> {
  const ext = file.name.split('.').pop() ?? 'jpg';
  const fileName = `${userId}/${folder}/${Date.now()}-${sanitizeFileName(file.name)}`;
  logInfo('Storage', 'Uploading public image.', {
    userId,
    folder,
    fileName,
    fileType: file.type,
    fileSize: file.size,
  });

  const { error } = await supabase.storage.from(BUCKET).upload(fileName, file, {
    cacheControl: '3600',
    contentType: file.type || `image/${ext}`,
    upsert: false,
  });

  if (error) {
    if (shouldInlineFallback(error)) {
      logWarn('Storage', 'Bucket missing. Falling back to inline image storage.', error);
      const photoUrl = await createInlinePhotoDataUrl(file);
      logInfo('Storage', 'Inline image fallback prepared.', {
        folder,
        length: photoUrl.length,
      });
      return { photoUrl, storageMode: 'inline' };
    }

    logError('Storage', 'Public image upload failed.', error);
    throw error;
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(fileName);
  logInfo('Storage', 'Public image upload complete.', {
    folder,
    publicUrl: data.publicUrl,
  });
  return { photoUrl: data.publicUrl, storageMode: 'bucket' };
}

export async function uploadPlantPhoto(userId: string, file: File): Promise<UploadedPhotoResult> {
  return uploadPublicImage(userId, file, 'plants');
}

export async function uploadProfilePhoto(userId: string, file: File): Promise<UploadedPhotoResult> {
  return uploadPublicImage(userId, file, 'profiles');
}
