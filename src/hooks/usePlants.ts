import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Observation, TaxonomyFamily } from '../types';

export function usePlants(userId: string | undefined) {
  const [observations, setObservations] = useState<Observation[]>([]);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  const fetchObservations = useCallback(async () => {
    if (!userId) {
      setObservations([]);
      return;
    }
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
