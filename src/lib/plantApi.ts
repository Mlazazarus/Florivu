import { OrganType, PlantNetResponse } from '../types';

const API_KEY =
  import.meta.env.EXPO_PUBLIC_PLANTNET_API_KEY ??
  import.meta.env.VITE_PLANTNET_API_KEY ??
  '';

const BASE_URL = 'https://my-api.plantnet.org/v2';

export async function identifyPlant(
  file: File,
  organ: OrganType = 'auto',
): Promise<PlantNetResponse> {
  if (!API_KEY) {
    console.warn('[PlantAPI] No key set - returning mock data');
    return MOCK_RESPONSE;
  }

  const form = new FormData();
  form.append('organs', organ);
  form.append('images', file, file.name);

  const url =
    `${BASE_URL}/identify/all` +
    `?api-key=${API_KEY}&nb-results=5&lang=en&include-related-images=false`;

  const response = await fetch(url, {
    method: 'POST',
    body: form,
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`PlantNet ${response.status}: ${await response.text()}`);
  }

  return response.json() as Promise<PlantNetResponse>;
}

const MOCK_RESPONSE: PlantNetResponse = {
  bestMatch: 'Rosa canina',
  remainingIdentificationRequests: 500,
  results: [
    {
      score: 0.87,
      species: {
        scientificName: 'Rosa canina L.',
        scientificNameWithoutAuthor: 'Rosa canina',
        commonNames: ['Dog Rose', 'Wild Rose', 'Briar Rose'],
        family: { scientificName: 'Rosaceae', commonNames: ['Rose family'] },
        genus: { scientificName: 'Rosa', commonNames: ['Roses'] },
      },
      images: [{ url: { m: '', o: '', s: '' } }],
    },
    {
      score: 0.08,
      species: {
        scientificName: 'Rosa rubiginosa L.',
        scientificNameWithoutAuthor: 'Rosa rubiginosa',
        commonNames: ['Sweet Briar', 'Eglantine'],
        family: { scientificName: 'Rosaceae', commonNames: ['Rose family'] },
        genus: { scientificName: 'Rosa', commonNames: ['Roses'] },
      },
      images: [{ url: { m: '', o: '', s: '' } }],
    },
    {
      score: 0.05,
      species: {
        scientificName: 'Rosa gallica L.',
        scientificNameWithoutAuthor: 'Rosa gallica',
        commonNames: ['French Rose', 'Gallic Rose'],
        family: { scientificName: 'Rosaceae', commonNames: ['Rose family'] },
        genus: { scientificName: 'Rosa', commonNames: ['Roses'] },
      },
      images: [{ url: { m: '', o: '', s: '' } }],
    },
  ],
};
