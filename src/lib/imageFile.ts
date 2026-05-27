const ACCEPTED_IMAGE_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'webp',
  'heic',
  'heif',
  'gif',
  'bmp',
  'avif',
]);

const ACCEPTED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/gif',
  'image/bmp',
  'image/avif',
]);

const PASSTHROUGH_MIME_TYPES = new Set(['image/jpeg', 'image/png']);

export const IMAGE_FILE_ACCEPT = [
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.heic',
  '.heif',
  '.gif',
  '.bmp',
  '.avif',
  ...Array.from(ACCEPTED_IMAGE_MIME_TYPES),
].join(',');

function getExtension(name: string) {
  const parts = name.split('.');
  return parts.length > 1 ? parts.pop()!.toLowerCase() : '';
}

function replaceExtensionWithJpeg(name: string) {
  return name.replace(/\.[^.]+$/, '') + '.jpg';
}

function isAcceptedImageFile(file: File) {
  const extension = getExtension(file.name);
  return ACCEPTED_IMAGE_MIME_TYPES.has(file.type) || ACCEPTED_IMAGE_EXTENSIONS.has(extension);
}

function isHeicLike(file: File) {
  const extension = getExtension(file.name);
  return (
    file.type === 'image/heic' ||
    file.type === 'image/heif' ||
    extension === 'heic' ||
    extension === 'heif'
  );
}

async function convertHeicToJpeg(file: File) {
  const { default: heic2any } = await import('heic2any');
  const result = await heic2any({
    blob: file,
    toType: 'image/jpeg',
    quality: 0.92,
  });
  const blob = Array.isArray(result) ? result[0] : result;

  if (!(blob instanceof Blob)) {
    throw new Error('HEIC conversion did not produce an image file.');
  }

  return new File([blob], replaceExtensionWithJpeg(file.name), {
    type: 'image/jpeg',
    lastModified: file.lastModified,
  });
}

async function convertBrowserImageToJpeg(file: File) {
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new Image();
      nextImage.onload = () => resolve(nextImage);
      nextImage.onerror = () => reject(new Error('Failed to decode the selected image.'));
      nextImage.src = objectUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Canvas 2D context unavailable.');
    }

    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (nextBlob) => {
          if (!nextBlob) {
            reject(new Error('Failed to convert the selected image.'));
            return;
          }

          resolve(nextBlob);
        },
        'image/jpeg',
        0.92,
      );
    });

    return new File([blob], replaceExtensionWithJpeg(file.name), {
      type: 'image/jpeg',
      lastModified: file.lastModified,
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function prepareImageFile(file: File): Promise<File> {
  if (!isAcceptedImageFile(file)) {
    throw new Error(
      'Unsupported image format. Use JPG, PNG, WebP, HEIC, HEIF, GIF, BMP, or AVIF.',
    );
  }

  if (PASSTHROUGH_MIME_TYPES.has(file.type)) {
    return file;
  }

  if (isHeicLike(file)) {
    return convertHeicToJpeg(file);
  }

  return convertBrowserImageToJpeg(file);
}
