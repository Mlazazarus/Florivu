import { PlantNetResponse } from '../types';

const API_KEY  = process.env.EXPO_PUBLIC_PLANTNET_API_KEY ?? '';
const BASE_URL = 'https://my-api.plantnet.org/v2';

export async function identifyPlant(
  imageUri: string,
  organ: 'flower' | 'leaf' | 'fruit' | 'bark' | 'auto' = 'auto',
): Promise<PlantNetResponse> {
  if (!API_KEY) {
    console.warn('[PlantAPI] No key set — returning mock data');
    return MOCK_RESPONSE;
  }

  const form = new FormData();
  form.append('organs', organ);
  form.append('images', { uri: imageUri, name: 'plant.jpg', type: 'image/jpeg' } as any);

  const url =
    `${BASE_URL}/identify/all` +
    `?api-key=${API_KEY}&nb-results=5&lang=en&include-related-images=false`;

  const res = await fetch(url, { method: 'POST', body: form, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`PlantNet ${res.status}: ${await res.text()}`);
  return res.json() as Promise<PlantNetResponse>;
}

const MOCK_RESPONSE: PlantNetResponse = {
  bestMatch: 'Rosa canina',
  remainingIdentificationRequests: 500,
  results: [
    {
      score: 0.87,
      species: {
        scientificName: 'Rosa canina L.', scientificNameWithoutAuthor: 'Rosa canina',
        commonNames: ['Dog Rose', 'Wild Rose', 'Briar Rose'],
        family: { scientificName: 'Rosaceae', commonNames: ['Rose family'] },
        genus:  { scientificName: 'Rosa',     commonNames: ['Roses']       },
      },
      images: [{ url: { m: '', o: '', s: '' } }],
    },
    {
      score: 0.08,
      species: {
        scientificName: 'Rosa rubiginosa L.', scientificNameWithoutAuthor: 'Rosa rubiginosa',
        commonNames: ['Sweet Briar', 'Eglantine'],
        family: { scientificName: 'Rosaceae', commonNames: ['Rose family'] },
        genus:  { scientificName: 'Rosa',     commonNames: ['Roses']       },
      },
      images: [{ url: { m: '', o: '', s: '' } }],
    },
    {
      score: 0.05,
      species: {
        scientificName: 'Rosa gallica L.', scientificNameWithoutAuthor: 'Rosa gallica',
        commonNames: ['French Rose', 'Gallic Rose'],
        family: { scientificName: 'Rosaceae', commonNames: ['Rose family'] },
        genus:  { scientificName: 'Rosa',     commonNames: ['Roses']       },
      },
      images: [{ url: { m: '', o: '', s: '' } }],
    },
  ],
};
