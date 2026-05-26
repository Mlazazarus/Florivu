import * as FileSystem from 'expo-file-system';
import { decode } from 'base64-arraybuffer';
import { supabase } from './supabase';

const BUCKET = 'plant-photos';

export async function uploadPlantPhoto(userId: string, localUri: string): Promise<string> {
  const ext      = localUri.split('.').pop() ?? 'jpg';
  const fileName = `${userId}/${Date.now()}.${ext}`;

  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(fileName, decode(base64), { contentType: `image/${ext}`, upsert: false });

  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(fileName);
  return data.publicUrl;
}
