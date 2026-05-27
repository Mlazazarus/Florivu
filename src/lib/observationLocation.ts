import { logError, logInfo } from './logger';

type LocationSource = 'photo-metadata' | 'device-location' | 'unavailable';

interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface ObservationLocationResult {
  zipCode: string | null;
  source: LocationSource;
}

interface ExifEntry {
  count: number;
  entryOffset: number;
  type: number;
}

const JPEG_SOI_MARKER = 0xffd8;
const JPEG_EXIF_MARKER = 0xffe1;
const JPEG_SCAN_MARKER = 0xffda;
const JPEG_END_MARKER = 0xffd9;
const TIFF_LITTLE_ENDIAN = 0x4949;
const TIFF_BIG_ENDIAN = 0x4d4d;
const TIFF_HEADER_MAGIC = 0x002a;
const EXIF_TAG_GPS_IFD = 0x8825;
const GPS_TAG_LATITUDE_REF = 0x0001;
const GPS_TAG_LATITUDE = 0x0002;
const GPS_TAG_LONGITUDE_REF = 0x0003;
const GPS_TAG_LONGITUDE = 0x0004;

function exifTypeSize(type: number) {
  switch (type) {
    case 1:
    case 2:
    case 7:
      return 1;
    case 3:
      return 2;
    case 4:
    case 9:
      return 4;
    case 5:
    case 10:
      return 8;
    default:
      return 0;
  }
}

function canRead(view: DataView, offset: number, length: number) {
  return offset >= 0 && length >= 0 && offset + length <= view.byteLength;
}

function getEntryDataOffset(
  view: DataView,
  entryOffset: number,
  type: number,
  count: number,
  tiffStart: number,
  littleEndian: boolean,
) {
  const byteLength = exifTypeSize(type) * count;
  if (byteLength <= 4) {
    return entryOffset + 8;
  }

  const relativeOffset = view.getUint32(entryOffset + 8, littleEndian);
  return tiffStart + relativeOffset;
}

function findIfdEntry(
  view: DataView,
  tiffStart: number,
  ifdOffset: number,
  tag: number,
  littleEndian: boolean,
): ExifEntry | null {
  const absoluteIfdOffset = tiffStart + ifdOffset;
  if (!canRead(view, absoluteIfdOffset, 2)) {
    return null;
  }

  const entryCount = view.getUint16(absoluteIfdOffset, littleEndian);
  for (let index = 0; index < entryCount; index += 1) {
    const entryOffset = absoluteIfdOffset + 2 + index * 12;
    if (!canRead(view, entryOffset, 12)) {
      return null;
    }

    if (view.getUint16(entryOffset, littleEndian) !== tag) {
      continue;
    }

    return {
      count: view.getUint32(entryOffset + 4, littleEndian),
      entryOffset,
      type: view.getUint16(entryOffset + 2, littleEndian),
    };
  }

  return null;
}

function readAsciiEntry(
  view: DataView,
  entry: ExifEntry,
  tiffStart: number,
  littleEndian: boolean,
) {
  const dataOffset = getEntryDataOffset(
    view,
    entry.entryOffset,
    entry.type,
    entry.count,
    tiffStart,
    littleEndian,
  );

  if (!canRead(view, dataOffset, entry.count)) {
    return null;
  }

  let value = '';
  for (let index = 0; index < entry.count; index += 1) {
    const code = view.getUint8(dataOffset + index);
    if (code === 0) {
      break;
    }

    value += String.fromCharCode(code);
  }

  return value || null;
}

function readRationalArray(
  view: DataView,
  entry: ExifEntry,
  tiffStart: number,
  littleEndian: boolean,
) {
  const dataOffset = getEntryDataOffset(
    view,
    entry.entryOffset,
    entry.type,
    entry.count,
    tiffStart,
    littleEndian,
  );
  const values: number[] = [];

  for (let index = 0; index < entry.count; index += 1) {
    const rationalOffset = dataOffset + index * 8;
    if (!canRead(view, rationalOffset, 8)) {
      return null;
    }

    const numerator = view.getUint32(rationalOffset, littleEndian);
    const denominator = view.getUint32(rationalOffset + 4, littleEndian);
    if (denominator === 0) {
      return null;
    }

    values.push(numerator / denominator);
  }

  return values;
}

function decimalCoordinate(values: number[], reference: string) {
  if (values.length < 3) {
    return null;
  }

  const coordinate = values[0] + values[1] / 60 + values[2] / 3600;
  if (reference === 'S' || reference === 'W') {
    return coordinate * -1;
  }

  return coordinate;
}

async function extractExifCoordinates(file: File): Promise<Coordinates | null> {
  const buffer = await file.arrayBuffer();
  const view = new DataView(buffer);

  if (!canRead(view, 0, 4) || view.getUint16(0, false) !== JPEG_SOI_MARKER) {
    return null;
  }

  let segmentOffset = 2;
  while (canRead(view, segmentOffset, 4)) {
    const marker = view.getUint16(segmentOffset, false);

    if (marker === JPEG_SCAN_MARKER || marker === JPEG_END_MARKER) {
      break;
    }

    const segmentLength = view.getUint16(segmentOffset + 2, false);
    if (segmentLength < 2 || !canRead(view, segmentOffset + 2, segmentLength)) {
      break;
    }

    if (marker === JPEG_EXIF_MARKER && canRead(view, segmentOffset + 4, 6)) {
      const exifHeader =
        String.fromCharCode(view.getUint8(segmentOffset + 4)) +
        String.fromCharCode(view.getUint8(segmentOffset + 5)) +
        String.fromCharCode(view.getUint8(segmentOffset + 6)) +
        String.fromCharCode(view.getUint8(segmentOffset + 7));

      if (exifHeader !== 'Exif') {
        segmentOffset += 2 + segmentLength;
        continue;
      }

      const tiffStart = segmentOffset + 10;
      if (!canRead(view, tiffStart, 8)) {
        return null;
      }

      const byteOrder = view.getUint16(tiffStart, false);
      const littleEndian =
        byteOrder === TIFF_LITTLE_ENDIAN
          ? true
          : byteOrder === TIFF_BIG_ENDIAN
            ? false
            : null;

      if (littleEndian === null) {
        return null;
      }

      if (view.getUint16(tiffStart + 2, littleEndian) !== TIFF_HEADER_MAGIC) {
        return null;
      }

      const firstIfdOffset = view.getUint32(tiffStart + 4, littleEndian);
      const gpsIfdEntry = findIfdEntry(
        view,
        tiffStart,
        firstIfdOffset,
        EXIF_TAG_GPS_IFD,
        littleEndian,
      );

      if (!gpsIfdEntry || !canRead(view, gpsIfdEntry.entryOffset + 8, 4)) {
        return null;
      }

      const gpsIfdOffset = view.getUint32(gpsIfdEntry.entryOffset + 8, littleEndian);
      const latitudeRefEntry = findIfdEntry(
        view,
        tiffStart,
        gpsIfdOffset,
        GPS_TAG_LATITUDE_REF,
        littleEndian,
      );
      const latitudeEntry = findIfdEntry(
        view,
        tiffStart,
        gpsIfdOffset,
        GPS_TAG_LATITUDE,
        littleEndian,
      );
      const longitudeRefEntry = findIfdEntry(
        view,
        tiffStart,
        gpsIfdOffset,
        GPS_TAG_LONGITUDE_REF,
        littleEndian,
      );
      const longitudeEntry = findIfdEntry(
        view,
        tiffStart,
        gpsIfdOffset,
        GPS_TAG_LONGITUDE,
        littleEndian,
      );

      if (!latitudeRefEntry || !latitudeEntry || !longitudeRefEntry || !longitudeEntry) {
        return null;
      }

      const latitudeReference = readAsciiEntry(view, latitudeRefEntry, tiffStart, littleEndian);
      const longitudeReference = readAsciiEntry(view, longitudeRefEntry, tiffStart, littleEndian);
      const latitudeValues = readRationalArray(view, latitudeEntry, tiffStart, littleEndian);
      const longitudeValues = readRationalArray(view, longitudeEntry, tiffStart, littleEndian);

      if (
        !latitudeReference ||
        !longitudeReference ||
        !latitudeValues ||
        !longitudeValues
      ) {
        return null;
      }

      const latitude = decimalCoordinate(latitudeValues, latitudeReference);
      const longitude = decimalCoordinate(longitudeValues, longitudeReference);

      if (latitude === null || longitude === null) {
        return null;
      }

      return { latitude, longitude };
    }

    segmentOffset += 2 + segmentLength;
  }

  return null;
}

function getDeviceCoordinates(): Promise<Coordinates | null> {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      (error) => {
        logInfo('ObservationLocation', 'Browser geolocation unavailable.', {
          code: error.code,
          message: error.message,
        });
        resolve(null);
      },
      {
        enableHighAccuracy: false,
        maximumAge: 300000,
        timeout: 12000,
      },
    );
  });
}

async function reverseGeocodeZipCode(coordinates: Coordinates) {
  const query = new URLSearchParams({
    latitude: coordinates.latitude.toString(),
    longitude: coordinates.longitude.toString(),
  });
  const response = await fetch(`/api/reverse-geocode?${query.toString()}`, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(`Reverse geocoding failed with ${response.status}: ${bodyText}`);
  }

  const payload = (await response.json()) as { zipCode?: unknown };
  return typeof payload.zipCode === 'string' && payload.zipCode.trim()
    ? payload.zipCode.trim()
    : null;
}

export async function resolveObservationLocation(
  file: File,
): Promise<ObservationLocationResult> {
  try {
    const exifCoordinates = await extractExifCoordinates(file);
    if (exifCoordinates) {
      const zipCode = await reverseGeocodeZipCode(exifCoordinates);
      logInfo('ObservationLocation', 'Resolved ZIP code from photo metadata.', {
        fileName: file.name,
        zipCode,
      });

      return {
        source: zipCode ? 'photo-metadata' : 'unavailable',
        zipCode,
      };
    }
  } catch (error) {
    logError('ObservationLocation', 'Failed to resolve location from photo metadata.', error);
    return { source: 'unavailable', zipCode: null };
  }

  try {
    const deviceCoordinates = await getDeviceCoordinates();
    if (!deviceCoordinates) {
      return { source: 'unavailable', zipCode: null };
    }

    const zipCode = await reverseGeocodeZipCode(deviceCoordinates);
    logInfo('ObservationLocation', 'Resolved ZIP code from current device location.', {
      zipCode,
    });

    return {
      source: zipCode ? 'device-location' : 'unavailable',
      zipCode,
    };
  } catch (error) {
    logError('ObservationLocation', 'Failed to resolve location from current device position.', error);
    return { source: 'unavailable', zipCode: null };
  }
}
