#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR"
echo "🌿 Creating PlantDex project in $PROJECT_DIR ..."
mkdir -p "$PROJECT_DIR"
cd "$PROJECT_DIR"

# ── Directories ──────────────────────────────────────────────────────────────
mkdir -p supabase \
         src/types \
         src/lib \
         src/hooks \
         src/navigation \
         src/components \
         src/screens

# ─────────────────────────────────────────────────────────────────────────────
# Root config files
# ─────────────────────────────────────────────────────────────────────────────

cat > package.json << 'EOF'
{
  "name": "plantdex",
  "version": "1.0.0",
  "main": "expo/AppEntry.js",
  "scripts": {
    "start": "expo start",
    "android": "expo run:android",
    "ios": "expo run:ios"
  },
  "dependencies": {
    "@expo/vector-icons": "^14.0.2",
    "@react-navigation/bottom-tabs": "^6.5.20",
    "@react-navigation/native": "^6.1.17",
    "@react-navigation/native-stack": "^6.9.26",
    "@supabase/supabase-js": "^2.43.4",
    "base64-arraybuffer": "^1.0.2",
    "date-fns": "^3.6.0",
    "expo": "~51.0.0",
    "expo-file-system": "~17.0.1",
    "expo-image-picker": "~15.0.7",
    "expo-secure-store": "~13.0.2",
    "expo-status-bar": "~1.12.1",
    "react": "18.2.0",
    "react-native": "0.74.1",
    "react-native-safe-area-context": "4.10.1",
    "react-native-screens": "3.31.1"
  },
  "devDependencies": {
    "@babel/core": "^7.24.0",
    "@types/react": "~18.2.45",
    "typescript": "^5.3.3"
  }
}
EOF

cat > app.json << 'EOF'
{
  "expo": {
    "name": "PlantDex",
    "slug": "plantdex",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "light",
    "splash": { "backgroundColor": "#F0FDF4" },
    "ios": {
      "supportsTablet": false,
      "bundleIdentifier": "com.yourname.plantdex",
      "infoPlist": {
        "NSCameraUsageDescription": "PlantDex needs camera access to photograph plants.",
        "NSPhotoLibraryUsageDescription": "PlantDex needs photo library access to select plant images."
      }
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#F0FDF4"
      },
      "permissions": ["CAMERA", "READ_EXTERNAL_STORAGE"],
      "package": "com.yourname.plantdex"
    },
    "plugins": [
      ["expo-image-picker", {
        "photosPermission": "PlantDex needs access to your photos to identify plants.",
        "cameraPermission": "PlantDex needs camera access to photograph plants."
      }]
    ]
  }
}
EOF

cat > tsconfig.json << 'EOF'
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  }
}
EOF

cat > babel.config.js << 'EOF'
module.exports = function (api) {
  api.cache(true);
  return { presets: ['babel-preset-expo'] };
};
EOF

cat > .env.example << 'EOF'
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key-here
EXPO_PUBLIC_PLANTNET_API_KEY=your-plantnet-key-here
EOF

cat > App.tsx << 'EOF'
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import Navigation from './src/navigation';

export default function App() {
  return (
    <>
      <StatusBar style="dark" />
      <Navigation />
    </>
  );
}
EOF

# ─────────────────────────────────────────────────────────────────────────────
# Supabase
# ─────────────────────────────────────────────────────────────────────────────

cat > supabase/schema.sql << 'EOF'
create extension if not exists "pgcrypto";

create table if not exists observations (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users(id) on delete cascade not null,
  photo_url       text not null,
  common_name     text not null,
  scientific_name text not null,
  family          text not null,
  genus           text not null,
  species         text not null,
  confidence      numeric not null,
  date_found      timestamptz not null default now(),
  notes           text,
  created_at      timestamptz not null default now()
);

alter table observations enable row level security;

create policy "Users can view own observations"
  on observations for select using (auth.uid() = user_id);
create policy "Users can insert own observations"
  on observations for insert with check (auth.uid() = user_id);
create policy "Users can delete own observations"
  on observations for delete using (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('plant-photos', 'plant-photos', true) on conflict do nothing;

create policy "Anyone can view plant photos"
  on storage.objects for select using (bucket_id = 'plant-photos');
create policy "Authenticated users can upload plant photos"
  on storage.objects for insert
  with check (bucket_id = 'plant-photos' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "Users can delete own plant photos"
  on storage.objects for delete
  using (bucket_id = 'plant-photos' and auth.uid()::text = (storage.foldername(name))[1]);
EOF

# ─────────────────────────────────────────────────────────────────────────────
# src/types/index.ts
# ─────────────────────────────────────────────────────────────────────────────

cat > src/types/index.ts << 'EOF'
export interface PlantNetSpecies {
  scientificName: string;
  scientificNameWithoutAuthor: string;
  commonNames: string[];
  family: { scientificName: string; commonNames: string[] };
  genus:  { scientificName: string; commonNames: string[] };
}

export interface PlantNetResult {
  score: number;
  species: PlantNetSpecies;
  images: { url: { m: string; o: string; s: string } }[];
}

export interface PlantNetResponse {
  bestMatch: string;
  results: PlantNetResult[];
  remainingIdentificationRequests: number;
}

export interface Observation {
  id: string;
  user_id: string;
  photo_url: string;
  common_name: string;
  scientific_name: string;
  family: string;
  genus: string;
  species: string;
  confidence: number;
  date_found: string;
  notes?: string;
  created_at: string;
}

export interface SpeciesGroup {
  species: string;
  scientificName: string;
  observations: Observation[];
}

export interface GenusGroup {
  genus: string;
  species: SpeciesGroup[];
}

export interface TaxonomyFamily {
  family: string;
  genera: GenusGroup[];
}

export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
  Result:      { results: PlantNetResponse; photoUri: string };
  PlantDetail: { observation: Observation };
};

export type MainTabParamList = {
  Home:       undefined;
  Collection: undefined;
  Taxonomy:   undefined;
};
EOF

# ─────────────────────────────────────────────────────────────────────────────
# src/lib/supabase.ts
# ─────────────────────────────────────────────────────────────────────────────

cat > src/lib/supabase.ts << 'EOF'
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_PUBLISHABLE_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  '';

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  console.warn('[Supabase] Missing env vars — auth and DB will not work.');
}

const SecureStoreAdapter = {
  getItem:    (key: string) => SecureStore.getItemAsync(key),
  setItem:    (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage:            SecureStoreAdapter,
    autoRefreshToken:   true,
    persistSession:     true,
    detectSessionInUrl: false,
  },
});
EOF

# ─────────────────────────────────────────────────────────────────────────────
# src/lib/plantApi.ts
# ─────────────────────────────────────────────────────────────────────────────

cat > src/lib/plantApi.ts << 'EOF'
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
EOF

# ─────────────────────────────────────────────────────────────────────────────
# src/lib/storageHelper.ts
# ─────────────────────────────────────────────────────────────────────────────

cat > src/lib/storageHelper.ts << 'EOF'
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
EOF

# ─────────────────────────────────────────────────────────────────────────────
# src/hooks/useAuth.ts
# ─────────────────────────────────────────────────────────────────────────────

cat > src/hooks/useAuth.ts << 'EOF'
import { useState, useEffect } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user,    setUser]    = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session);
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const signIn  = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };
  const signUp  = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
  };
  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  return { session, user, loading, signIn, signUp, signOut };
}
EOF

# ─────────────────────────────────────────────────────────────────────────────
# src/hooks/usePlants.ts
# ─────────────────────────────────────────────────────────────────────────────

cat > src/hooks/usePlants.ts << 'EOF'
import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Observation, TaxonomyFamily } from '../types';

export function usePlants(userId: string | undefined) {
  const [observations, setObservations] = useState<Observation[]>([]);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  const fetchObservations = useCallback(async () => {
    if (!userId) return;
    setLoading(true); setError(null);
    try {
      const { data, error } = await supabase
        .from('observations').select('*')
        .eq('user_id', userId).order('created_at', { ascending: false });
      if (error) throw error;
      setObservations(data ?? []);
    } catch (e: any) {
      setError(e.message ?? 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const saveObservation = async (obs: Omit<Observation, 'id' | 'created_at'>): Promise<Observation> => {
    const { data, error } = await supabase.from('observations').insert(obs).select().single();
    if (error) throw error;
    const saved = data as Observation;
    setObservations(prev => [saved, ...prev]);
    return saved;
  };

  const deleteObservation = async (id: string) => {
    const { error } = await supabase.from('observations').delete().eq('id', id);
    if (error) throw error;
    setObservations(prev => prev.filter(o => o.id !== id));
  };

  const getTaxonomyTree = (): TaxonomyFamily[] => {
    const familyMap = new Map<string, Map<string, Map<string, Observation[]>>>();
    for (const obs of observations) {
      if (!familyMap.has(obs.family)) familyMap.set(obs.family, new Map());
      const genusMap = familyMap.get(obs.family)!;
      if (!genusMap.has(obs.genus)) genusMap.set(obs.genus, new Map());
      const speciesMap = genusMap.get(obs.genus)!;
      const key = obs.species || obs.scientific_name;
      if (!speciesMap.has(key)) speciesMap.set(key, []);
      speciesMap.get(key)!.push(obs);
    }
    return Array.from(familyMap.entries()).map(([family, genusMap]) => ({
      family,
      genera: Array.from(genusMap.entries()).map(([genus, speciesMap]) => ({
        genus,
        species: Array.from(speciesMap.entries()).map(([species, obs]) => ({
          species, scientificName: obs[0].scientific_name, observations: obs,
        })),
      })),
    }));
  };

  return { observations, loading, error, fetchObservations, saveObservation, deleteObservation, getTaxonomyTree };
}
EOF

# ─────────────────────────────────────────────────────────────────────────────
# src/navigation/index.tsx
# ─────────────────────────────────────────────────────────────────────────────

cat > src/navigation/index.tsx << 'EOF'
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../hooks/useAuth';
import { RootStackParamList, MainTabParamList } from '../types';
import AuthScreen        from '../screens/AuthScreen';
import HomeScreen        from '../screens/HomeScreen';
import CollectionScreen  from '../screens/CollectionScreen';
import TaxonomyScreen    from '../screens/TaxonomyScreen';
import ResultScreen      from '../screens/ResultScreen';
import PlantDetailScreen from '../screens/PlantDetailScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab   = createBottomTabNavigator<MainTabParamList>();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: '#2D6A4F', tabBarInactiveTintColor: '#9CA3AF',
        tabBarStyle: { borderTopColor: '#D1FAE5' },
        tabBarIcon: ({ focused, color, size }) => {
          const icons: Record<string, [string, string]> = {
            Home:       ['camera',     'camera-outline'],
            Collection: ['grid',       'grid-outline'],
            Taxonomy:   ['git-branch', 'git-branch-outline'],
          };
          const [a, i] = icons[route.name] ?? ['help', 'help-outline'];
          return <Ionicons name={(focused ? a : i) as any} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home"       component={HomeScreen}       options={{ title: 'Identify' }} />
      <Tab.Screen name="Collection" component={CollectionScreen} />
      <Tab.Screen name="Taxonomy"   component={TaxonomyScreen}   />
    </Tab.Navigator>
  );
}

export default function Navigation() {
  const { session, loading } = useAuth();
  if (loading) return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F0FDF4' }}>
      <ActivityIndicator size="large" color="#2D6A4F" />
    </View>
  );
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!session ? (
          <Stack.Screen name="Auth" component={AuthScreen} />
        ) : (
          <>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen name="Result" component={ResultScreen}
              options={{ headerShown: true, title: 'Identification Result', headerTintColor: '#2D6A4F', headerStyle: { backgroundColor: '#F0FDF4' } }} />
            <Stack.Screen name="PlantDetail" component={PlantDetailScreen}
              options={{ headerShown: true, title: 'Plant Detail', headerTintColor: '#2D6A4F', headerStyle: { backgroundColor: '#F0FDF4' } }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
EOF

# ─────────────────────────────────────────────────────────────────────────────
# src/components/PlantCard.tsx
# ─────────────────────────────────────────────────────────────────────────────

cat > src/components/PlantCard.tsx << 'EOF'
import React from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { Observation } from '../types';

interface Props { observation: Observation; index: number; onPress: () => void }
const BG = ['#D1FAE5','#DBEAFE','#FCE7F3','#FEF3C7','#EDE9FE','#FFEDD5'];

export default function PlantCard({ observation, index, onPress }: Props) {
  return (
    <TouchableOpacity style={s.card} onPress={onPress} activeOpacity={0.85}>
      <View style={[s.imgWrap, { backgroundColor: BG[(index - 1) % BG.length] }]}>
        {observation.photo_url
          ? <Image source={{ uri: observation.photo_url }} style={s.image} />
          : <Text style={s.emoji}>🌿</Text>
        }
        <View style={s.badge}>
          <Text style={s.badgeTxt}>#{String(index).padStart(3, '0')}</Text>
        </View>
      </View>
      <View style={s.info}>
        <Text style={s.common}    numberOfLines={1}>{observation.common_name}</Text>
        <Text style={s.sci}       numberOfLines={1}>{observation.scientific_name}</Text>
        <View style={s.pill}><Text style={s.pillTxt} numberOfLines={1}>{observation.family}</Text></View>
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card:     { width: '48%', backgroundColor: '#fff', borderRadius: 16, marginBottom: 12, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 10, elevation: 3 },
  imgWrap:  { height: 130, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  image:    { width: '100%', height: '100%' },
  emoji:    { fontSize: 48 },
  badge:    { position: 'absolute', top: 8, left: 8, backgroundColor: 'rgba(0,0,0,0.38)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  badgeTxt: { color: '#fff', fontSize: 10, fontWeight: '700' },
  info:     { padding: 10 },
  common:   { fontSize: 13, fontWeight: '700', color: '#1A3C34' },
  sci:      { fontSize: 11, fontStyle: 'italic', color: '#9CA3AF', marginTop: 2 },
  pill:     { marginTop: 6, alignSelf: 'flex-start', backgroundColor: '#D1FAE5', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  pillTxt:  { fontSize: 10, color: '#2D6A4F', fontWeight: '600' },
});
EOF

# ─────────────────────────────────────────────────────────────────────────────
# src/components/ConfidenceBar.tsx
# ─────────────────────────────────────────────────────────────────────────────

cat > src/components/ConfidenceBar.tsx << 'EOF'
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function ConfidenceBar({ score }: { score: number }) {
  const pct   = score * 100;
  const color = pct >= 70 ? '#22C55E' : pct >= 40 ? '#F59E0B' : '#EF4444';
  return (
    <View>
      <View style={s.row}>
        <Text style={s.label}>Confidence</Text>
        <Text style={[s.value, { color }]}>{pct.toFixed(1)}%</Text>
      </View>
      <View style={s.track}>
        <View style={[s.fill, { width: `${pct}%` as any, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  row:   { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  label: { fontSize: 13, color: '#6B7280', fontWeight: '500' },
  value: { fontSize: 13, fontWeight: '700' },
  track: { height: 8, backgroundColor: '#F3F4F6', borderRadius: 4, overflow: 'hidden' },
  fill:  { height: '100%', borderRadius: 4 },
});
EOF

# ─────────────────────────────────────────────────────────────────────────────
# src/components/TaxonomyNode.tsx
# ─────────────────────────────────────────────────────────────────────────────

cat > src/components/TaxonomyNode.tsx << 'EOF'
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type NodeType = 'family' | 'genus' | 'species';
interface Props { label: string; type: NodeType; count: number; children?: React.ReactNode; onPress?: () => void; defaultExpanded?: boolean }

const CFG: Record<NodeType, { icon: string; color: string; bg: string; indent: number }> = {
  family:  { icon: 'layers',     color: '#2D6A4F', bg: '#D1FAE5', indent: 0  },
  genus:   { icon: 'git-branch', color: '#1D4ED8', bg: '#DBEAFE', indent: 16 },
  species: { icon: 'leaf',       color: '#7C3AED', bg: '#EDE9FE', indent: 32 },
};

export default function TaxonomyNode({ label, type, count, children, onPress, defaultExpanded = false }: Props) {
  const [open, setOpen] = useState(defaultExpanded);
  const c = CFG[type];
  return (
    <View style={{ marginLeft: c.indent, marginBottom: 6 }}>
      <TouchableOpacity style={[s.node, { backgroundColor: c.bg }]}
        onPress={() => { setOpen(v => !v); onPress?.(); }} activeOpacity={0.75}>
        <View style={[s.icon, { backgroundColor: c.color }]}>
          <Ionicons name={c.icon as any} size={13} color="#fff" />
        </View>
        <Text style={[s.label, { color: c.color }]} numberOfLines={1}>{label}</Text>
        <View style={[s.count, { backgroundColor: c.color }]}>
          <Text style={s.countTxt}>{count}</Text>
        </View>
        {!!children && <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={15} color={c.color} />}
      </TouchableOpacity>
      {open && !!children && <View style={s.children}>{children}</View>}
    </View>
  );
}

const s = StyleSheet.create({
  node:     { flexDirection: 'row', alignItems: 'center', borderRadius: 12, padding: 12, gap: 10 },
  icon:     { width: 26, height: 26, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  label:    { flex: 1, fontSize: 14, fontWeight: '600' },
  count:    { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 },
  countTxt: { color: '#fff', fontSize: 11, fontWeight: '700' },
  children: { marginTop: 6 },
});
EOF

# ─────────────────────────────────────────────────────────────────────────────
# src/screens/AuthScreen.tsx
# ─────────────────────────────────────────────────────────────────────────────

cat > src/screens/AuthScreen.tsx << 'EOF'
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../hooks/useAuth';

export default function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading]   = useState(false);

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) { Alert.alert('Error', 'Please enter your email and password.'); return; }
    setLoading(true);
    try {
      if (isSignUp) { await signUp(email.trim(), password); Alert.alert('Account created!', 'Check your email to confirm before signing in.'); }
      else { await signIn(email.trim(), password); }
    } catch (e: any) { Alert.alert('Error', e.message ?? 'Something went wrong.'); }
    finally { setLoading(false); }
  };

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={s.inner} keyboardShouldPersistTaps="handled">
        <View style={s.logo}>
          <Ionicons name="leaf" size={68} color="#2D6A4F" />
          <Text style={s.appName}>PlantDex</Text>
          <Text style={s.tagline}>Discover & collect plants</Text>
        </View>
        <TextInput style={s.input} placeholder="Email" placeholderTextColor="#9CA3AF" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
        <TextInput style={s.input} placeholder="Password" placeholderTextColor="#9CA3AF" value={password} onChangeText={setPassword} secureTextEntry />
        <TouchableOpacity style={s.btn} onPress={handleSubmit} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnTxt}>{isSignUp ? 'Create Account' : 'Sign In'}</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={s.toggle} onPress={() => setIsSignUp(v => !v)}>
          <Text style={s.toggleTxt}>{isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F0FDF4' },
  inner: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 32, paddingVertical: 60 },
  logo: { alignItems: 'center', marginBottom: 48 },
  appName: { fontSize: 38, fontWeight: '800', color: '#1A3C34', marginTop: 12 },
  tagline: { fontSize: 16, color: '#6B7280', marginTop: 4 },
  input: { backgroundColor: '#fff', borderRadius: 14, padding: 16, fontSize: 16, color: '#1A3C34', borderWidth: 1.5, borderColor: '#D1FAE5', marginBottom: 12 },
  btn: { backgroundColor: '#2D6A4F', borderRadius: 14, padding: 17, alignItems: 'center', marginTop: 6 },
  btnTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
  toggle: { alignItems: 'center', marginTop: 20 },
  toggleTxt: { color: '#2D6A4F', fontSize: 14, fontWeight: '500' },
});
EOF

# ─────────────────────────────────────────────────────────────────────────────
# src/screens/HomeScreen.tsx
# ─────────────────────────────────────────────────────────────────────────────

cat > src/screens/HomeScreen.tsx << 'EOF'
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Image, ScrollView, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { identifyPlant } from '../lib/plantApi';
import { RootStackParamList } from '../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function HomeScreen() {
  const nav = useNavigation<Nav>();
  const [imageUri, setImageUri]       = useState<string | null>(null);
  const [identifying, setIdentifying] = useState(false);

  const pickFrom = async (src: 'camera' | 'library') => {
    if (src === 'camera') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission needed', 'Camera access is required.'); return; }
      const res = await ImagePicker.launchCameraAsync({ quality: 0.8 });
      if (!res.canceled) setImageUri(res.assets[0].uri);
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission needed', 'Photo library access is required.'); return; }
      const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.8 });
      if (!res.canceled) setImageUri(res.assets[0].uri);
    }
  };

  const identify = async () => {
    if (!imageUri) return;
    setIdentifying(true);
    try {
      const results = await identifyPlant(imageUri);
      nav.navigate('Result', { results, photoUri: imageUri });
    } catch (e: any) { Alert.alert('Identification failed', e.message ?? 'Please try again.'); }
    finally { setIdentifying(false); }
  };

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content}>
      <View style={s.header}><Ionicons name="leaf" size={26} color="#2D6A4F" /><Text style={s.title}>PlantDex</Text></View>
      <Text style={s.sub}>Take or upload a photo to identify a plant</Text>
      {imageUri ? (
        <View style={s.previewWrap}>
          <Image source={{ uri: imageUri }} style={s.preview} />
          <TouchableOpacity style={s.clearBtn} onPress={() => setImageUri(null)}>
            <Ionicons name="close-circle" size={32} color="#EF4444" />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={s.placeholder}>
          <Ionicons name="image-outline" size={64} color="#D1FAE5" />
          <Text style={s.placeholderTxt}>No photo selected</Text>
        </View>
      )}
      <View style={s.row}>
        <TouchableOpacity style={s.btn} onPress={() => pickFrom('camera')}>
          <Ionicons name="camera" size={22} color="#fff" /><Text style={s.btnTxt}>Camera</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.btn, s.btnOutline]} onPress={() => pickFrom('library')}>
          <Ionicons name="images" size={22} color="#2D6A4F" /><Text style={[s.btnTxt, { color: '#2D6A4F' }]}>Gallery</Text>
        </TouchableOpacity>
      </View>
      {imageUri && (
        <TouchableOpacity style={[s.identifyBtn, identifying && { opacity: 0.6 }]} onPress={identify} disabled={identifying}>
          {identifying ? <ActivityIndicator color="#fff" /> : <><Ionicons name="search" size={20} color="#fff" /><Text style={s.identifyTxt}>Identify Plant</Text></>}
        </TouchableOpacity>
      )}
      <View style={s.tip}>
        <Ionicons name="information-circle-outline" size={16} color="#9CA3AF" />
        <Text style={s.tipTxt}>Best results: photograph leaves, flowers, or fruit in good light.</Text>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F0FDF4' },
  content: { padding: 24, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 48 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  title: { fontSize: 24, fontWeight: '800', color: '#1A3C34' },
  sub: { fontSize: 14, color: '#6B7280', marginBottom: 24 },
  previewWrap: { position: 'relative', marginBottom: 20 },
  preview: { width: '100%', height: 280, borderRadius: 18, backgroundColor: '#D1FAE5' },
  clearBtn: { position: 'absolute', top: 10, right: 10 },
  placeholder: { height: 200, backgroundColor: '#fff', borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 20, borderWidth: 2, borderColor: '#D1FAE5', borderStyle: 'dashed' },
  placeholderTxt: { color: '#9CA3AF', marginTop: 10, fontSize: 15 },
  row: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  btn: { flex: 1, backgroundColor: '#2D6A4F', borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  btnOutline: { backgroundColor: '#fff', borderWidth: 2, borderColor: '#2D6A4F' },
  btnTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
  identifyBtn: { backgroundColor: '#52B788', borderRadius: 16, padding: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 20 },
  identifyTxt: { color: '#fff', fontSize: 17, fontWeight: '700' },
  tip: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tipTxt: { color: '#9CA3AF', fontSize: 12, flex: 1 },
});
EOF

# ─────────────────────────────────────────────────────────────────────────────
# src/screens/ResultScreen.tsx
# ─────────────────────────────────────────────────────────────────────────────

cat > src/screens/ResultScreen.tsx << 'EOF'
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList, PlantNetResult } from '../types';
import { useAuth } from '../hooks/useAuth';
import { usePlants } from '../hooks/usePlants';
import { uploadPlantPhoto } from '../lib/storageHelper';
import ConfidenceBar from '../components/ConfidenceBar';

type Nav   = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'Result'>;

export default function ResultScreen() {
  const nav   = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { results, photoUri } = route.params;
  const { user }              = useAuth();
  const { saveObservation }   = usePlants(user?.id);
  const [saving,  setSaving]  = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const best = results.results[0];

  const handleSave = async (result: PlantNetResult) => {
    if (!user) { Alert.alert('Sign in required'); return; }
    setSaving(true);
    try {
      const photoUrl = await uploadPlantPhoto(user.id, photoUri);
      const saved = await saveObservation({
        user_id: user.id, photo_url: photoUrl,
        common_name: result.species.commonNames[0] ?? result.species.scientificNameWithoutAuthor,
        scientific_name: result.species.scientificName,
        family: result.species.family.scientificName,
        genus:  result.species.genus.scientificName,
        species: result.species.scientificNameWithoutAuthor,
        confidence: result.score, date_found: new Date().toISOString(),
      });
      setSavedId(saved.id);
      Alert.alert('Saved! 🌿', 'Added to your collection.', [
        { text: 'View Collection', onPress: () => nav.navigate('Main') },
        { text: 'Stay here', style: 'cancel' },
      ]);
    } catch (e: any) { Alert.alert('Error saving', e.message); }
    finally { setSaving(false); }
  };

  return (
    <ScrollView style={s.root} contentContainerStyle={{ paddingBottom: 48 }}>
      <Image source={{ uri: photoUri }} style={s.photo} />
      <View style={s.section}>
        <Text style={s.sectionLabel}>BEST MATCH</Text>
        <View style={s.card}>
          <Text style={s.common}>{best.species.commonNames[0] ?? 'Unknown plant'}</Text>
          <Text style={s.sci}>{best.species.scientificName}</Text>
          <View style={s.pills}>
            {[best.species.family.scientificName, best.species.genus.scientificName].map(t => (
              <View key={t} style={s.pill}><Text style={s.pillTxt}>{t}</Text></View>
            ))}
          </View>
          <View style={{ marginTop: 12 }}><ConfidenceBar score={best.score} /></View>
          <TouchableOpacity style={[s.saveBtn, savedId && s.saveBtnDone]} onPress={() => handleSave(best)} disabled={saving || !!savedId}>
            {saving ? <ActivityIndicator color="#fff" size="small" /> : <><Ionicons name={savedId ? 'checkmark-circle' : 'add-circle'} size={20} color="#fff" /><Text style={s.saveTxt}>{savedId ? 'Saved!' : 'Save to Collection'}</Text></>}
          </TouchableOpacity>
        </View>
      </View>
      {results.results.length > 1 && (
        <View style={s.section}>
          <Text style={s.sectionLabel}>OTHER POSSIBLE MATCHES</Text>
          {results.results.slice(1).map((r, i) => (
            <View key={i} style={s.altCard}>
              <View style={{ flex: 1 }}>
                <Text style={s.altName}>{r.species.commonNames[0] ?? r.species.scientificNameWithoutAuthor}</Text>
                <Text style={s.altSci}>{r.species.scientificName}</Text>
              </View>
              <Text style={s.altScore}>{(r.score * 100).toFixed(0)}%</Text>
              <TouchableOpacity onPress={() => handleSave(r)} disabled={saving || !!savedId}>
                <Ionicons name="add-circle-outline" size={28} color="#2D6A4F" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F0FDF4' },
  photo: { width: '100%', height: 260 },
  section: { padding: 20 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#9CA3AF', letterSpacing: 1.5, marginBottom: 12 },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 20, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12, elevation: 3 },
  common: { fontSize: 24, fontWeight: '800', color: '#1A3C34', marginBottom: 4 },
  sci: { fontSize: 15, fontStyle: 'italic', color: '#6B7280' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  pill: { backgroundColor: '#D1FAE5', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 },
  pillTxt: { color: '#2D6A4F', fontSize: 12, fontWeight: '600' },
  saveBtn: { backgroundColor: '#2D6A4F', borderRadius: 14, padding: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 18 },
  saveBtnDone: { backgroundColor: '#52B788' },
  saveTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
  altCard: { backgroundColor: '#fff', borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  altName: { fontSize: 14, fontWeight: '600', color: '#1A3C34' },
  altSci: { fontSize: 12, fontStyle: 'italic', color: '#9CA3AF' },
  altScore: { fontSize: 14, fontWeight: '700', color: '#2D6A4F', marginRight: 6 },
});
EOF

# ─────────────────────────────────────────────────────────────────────────────
# src/screens/CollectionScreen.tsx
# ─────────────────────────────────────────────────────────────────────────────

cat > src/screens/CollectionScreen.tsx << 'EOF'
import React, { useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator, Platform, RefreshControl } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList, Observation } from '../types';
import { useAuth } from '../hooks/useAuth';
import { usePlants } from '../hooks/usePlants';
import PlantCard from '../components/PlantCard';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function CollectionScreen() {
  const nav = useNavigation<Nav>();
  const { user, signOut }                            = useAuth();
  const { observations, loading, fetchObservations } = usePlants(user?.id);

  useFocusEffect(useCallback(() => { fetchObservations(); }, [fetchObservations]));

  return (
    <View style={s.root}>
      <View style={s.header}>
        <View>
          <Text style={s.title}>My Collection</Text>
          <Text style={s.sub}>{observations.length} plant{observations.length !== 1 ? 's' : ''} recorded</Text>
        </View>
        <TouchableOpacity onPress={signOut} style={s.signOut}>
          <Ionicons name="log-out-outline" size={22} color="#6B7280" />
        </TouchableOpacity>
      </View>
      {loading && observations.length === 0 ? (
        <View style={s.centered}><ActivityIndicator size="large" color="#2D6A4F" /></View>
      ) : observations.length === 0 ? (
        <View style={s.centered}>
          <Ionicons name="leaf-outline" size={72} color="#D1FAE5" />
          <Text style={s.emptyTitle}>No plants yet</Text>
          <Text style={s.emptySub}>Use the Identify tab to log your first plant!</Text>
        </View>
      ) : (
        <FlatList
          data={observations}
          renderItem={({ item, index }) => (
            <PlantCard observation={item} index={index + 1} onPress={() => nav.navigate('PlantDetail', { observation: item })} />
          )}
          keyExtractor={o => o.id}
          numColumns={2}
          contentContainerStyle={s.grid}
          columnWrapperStyle={s.row}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchObservations} tintColor="#2D6A4F" />}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F0FDF4' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#D1FAE5' },
  title: { fontSize: 22, fontWeight: '800', color: '#1A3C34' },
  sub: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  signOut: { padding: 8 },
  grid: { padding: 12, paddingBottom: 40 },
  row: { justifyContent: 'space-between' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#374151' },
  emptySub: { fontSize: 14, color: '#9CA3AF', textAlign: 'center', paddingHorizontal: 40 },
});
EOF

# ─────────────────────────────────────────────────────────────────────────────
# src/screens/PlantDetailScreen.tsx
# ─────────────────────────────────────────────────────────────────────────────

cat > src/screens/PlantDetailScreen.tsx << 'EOF'
import React from 'react';
import { View, Text, ScrollView, Image, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { RootStackParamList } from '../types';
import { useAuth } from '../hooks/useAuth';
import { usePlants } from '../hooks/usePlants';
import ConfidenceBar from '../components/ConfidenceBar';

type Route = RouteProp<RootStackParamList, 'PlantDetail'>;
type Nav   = NativeStackNavigationProp<RootStackParamList>;

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.rowValue}>{value}</Text>
    </View>
  );
}

export default function PlantDetailScreen() {
  const route = useRoute<Route>();
  const nav   = useNavigation<Nav>();
  const { observation }       = route.params;
  const { user }              = useAuth();
  const { deleteObservation } = usePlants(user?.id);

  const confirmDelete = () =>
    Alert.alert('Remove Plant', 'Delete this observation from your collection?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deleteObservation(observation.id); nav.goBack(); } },
    ]);

  return (
    <ScrollView style={s.root} contentContainerStyle={{ paddingBottom: 60 }}>
      <Image source={{ uri: observation.photo_url }} style={s.photo} />
      <View style={s.content}>
        <View style={s.titleRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.commonName}>{observation.common_name}</Text>
            <Text style={s.sciName}>{observation.scientific_name}</Text>
          </View>
          <TouchableOpacity onPress={confirmDelete} style={s.deleteBtn}>
            <Ionicons name="trash-outline" size={22} color="#EF4444" />
          </TouchableOpacity>
        </View>
        <View style={s.card}>
          <Text style={s.cardLabel}>CONFIDENCE</Text>
          <ConfidenceBar score={observation.confidence} />
        </View>
        <View style={s.card}>
          <Text style={s.cardLabel}>TAXONOMY</Text>
          <InfoRow label="Family"  value={observation.family}  />
          <InfoRow label="Genus"   value={observation.genus}   />
          <InfoRow label="Species" value={observation.species} />
        </View>
        <View style={s.card}>
          <Text style={s.cardLabel}>OBSERVATION</Text>
          <InfoRow label="Date found" value={format(new Date(observation.date_found), 'MMMM d, yyyy')} />
          {observation.notes && <InfoRow label="Notes" value={observation.notes} />}
        </View>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F0FDF4' },
  photo: { width: '100%', height: 300 },
  content: { padding: 20 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 20 },
  commonName: { fontSize: 26, fontWeight: '800', color: '#1A3C34' },
  sciName: { fontSize: 15, fontStyle: 'italic', color: '#6B7280', marginTop: 4 },
  deleteBtn: { padding: 8 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 18, marginBottom: 14, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  cardLabel: { fontSize: 11, fontWeight: '700', color: '#9CA3AF', letterSpacing: 1.5, marginBottom: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F9FAFB' },
  rowLabel: { fontSize: 14, color: '#6B7280', fontWeight: '500' },
  rowValue: { fontSize: 14, color: '#1A3C34', fontWeight: '600', flex: 1, textAlign: 'right' },
});
EOF

# ─────────────────────────────────────────────────────────────────────────────
# src/screens/TaxonomyScreen.tsx
# ─────────────────────────────────────────────────────────────────────────────

cat > src/screens/TaxonomyScreen.tsx << 'EOF'
import React, { useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../hooks/useAuth';
import { usePlants } from '../hooks/usePlants';
import { RootStackParamList } from '../types';
import TaxonomyNode from '../components/TaxonomyNode';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function TaxonomyScreen() {
  const nav  = useNavigation<Nav>();
  const { user }                                        = useAuth();
  const { loading, fetchObservations, getTaxonomyTree } = usePlants(user?.id);

  useFocusEffect(useCallback(() => { fetchObservations(); }, [fetchObservations]));

  const tree = getTaxonomyTree();

  return (
    <View style={s.root}>
      <View style={s.header}>
        <Text style={s.title}>Taxonomy Tree</Text>
        <Text style={s.sub}>Family → Genus → Species</Text>
      </View>
      {loading ? (
        <View style={s.centered}><ActivityIndicator size="large" color="#2D6A4F" /></View>
      ) : tree.length === 0 ? (
        <View style={s.centered}><Text style={s.emptyTxt}>No plants in your collection yet.</Text></View>
      ) : (
        <ScrollView contentContainerStyle={s.tree}>
          {tree.map(fam => {
            const famCount = fam.genera.reduce((a, g) => a + g.species.reduce((b, sp) => b + sp.observations.length, 0), 0);
            return (
              <TaxonomyNode key={fam.family} label={fam.family} type="family" count={famCount} defaultExpanded>
                {fam.genera.map(gen => {
                  const genCount = gen.species.reduce((a, sp) => a + sp.observations.length, 0);
                  return (
                    <TaxonomyNode key={gen.genus} label={gen.genus} type="genus" count={genCount}>
                      {gen.species.map(sp => (
                        <TaxonomyNode key={sp.species} label={sp.scientificName} type="species" count={sp.observations.length}
                          onPress={() => nav.navigate('PlantDetail', { observation: sp.observations[0] })} />
                      ))}
                    </TaxonomyNode>
                  );
                })}
              </TaxonomyNode>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F0FDF4' },
  header: { paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#D1FAE5' },
  title: { fontSize: 22, fontWeight: '800', color: '#1A3C34' },
  sub: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  tree: { padding: 16, paddingBottom: 48 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyTxt: { color: '#9CA3AF', fontSize: 15 },
});
EOF

# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "✅  PlantDex scaffold complete!"
echo ""
echo "Next steps:"
echo "  cd \"$PROJECT_DIR\""
echo "  cp .env.example .env          # fill in your Supabase + PlantNet keys"
echo "  npm install"
echo "  # Paste supabase/schema.sql into Supabase SQL Editor"
echo "  npx expo start"
echo ""
