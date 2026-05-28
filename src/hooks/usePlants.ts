import { useState, useCallback } from 'react';
import {
  deleteLocalObservation,
  fetchLocalObservations,
  saveLocalObservation,
  updateLocalObservation,
} from '../lib/localObservationApi';
import { logError, logInfo } from '../lib/logger';
import { supabase } from '../lib/supabase';
import { Observation, TaxonomyFamily } from '../types';

function shouldUseLocalObservationFallback(error: unknown) {
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message: unknown }).message).toLowerCase()
      : String(error ?? '').toLowerCase();

  return (
    message.includes("could not find the table 'public.observations'") ||
    message.includes('schema cache')
  );
}

function isZipCodeColumnMissing(error: unknown) {
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message: unknown }).message).toLowerCase()
      : String(error ?? '').toLowerCase();

  return message.includes('zip_code') && (message.includes('column') || message.includes('schema cache'));
}

function normalizeZipCode(zipCode: string | null) {
  const trimmed = zipCode?.trim();
  return trimmed ? trimmed : null;
}

export function usePlants(userId: string | undefined) {
  const [observations, setObservations] = useState<Observation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storageMode, setStorageMode] = useState<'supabase' | 'local'>('supabase');

  const fetchObservations = useCallback(async () => {
    if (!userId) {
      setObservations([]);
      logInfo('Plants', 'Skipped observation fetch because no user is signed in.');
      return;
    }

    setLoading(true);
    setError(null);
    logInfo('Plants', 'Fetching observations.', { userId });

    try {
      const { data, error } = await supabase
        .from('observations')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      setObservations(data ?? []);
      setStorageMode('supabase');
      logInfo('Plants', 'Observation fetch complete.', {
        userId,
        count: data?.length ?? 0,
      });
    } catch (fetchError: any) {
      if (shouldUseLocalObservationFallback(fetchError)) {
        const localObservations = await fetchLocalObservations(userId);
        setObservations(localObservations);
        setStorageMode('local');
        setError(null);
        logInfo('Plants', 'Observations table missing. Using local collection fallback.', {
          userId,
          count: localObservations.length,
        });
      } else {
        setError(fetchError.message ?? 'Unknown error');
        logError('Plants', 'Observation fetch failed.', fetchError);
      }
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const saveObservation = async (
    observation: Omit<Observation, 'id' | 'created_at'>,
  ): Promise<Observation> => {
    logInfo('Plants', 'Saving observation.', {
      userId: observation.user_id,
      species: observation.species,
      commonName: observation.common_name,
    });

    let { data, error } = await supabase
      .from('observations')
      .insert(observation)
      .select()
      .single();

    if (error && observation.zip_code && isZipCodeColumnMissing(error)) {
      const { zip_code: _zipCode, ...observationWithoutZipCode } = observation;
      logInfo('Plants', 'Observations table does not support zip_code yet. Retrying without ZIP code.', {
        userId: observation.user_id,
        species: observation.species,
      });

      ({ data, error } = await supabase
        .from('observations')
        .insert(observationWithoutZipCode)
        .select()
        .single());
    }

    if (error) {
      if (userId && shouldUseLocalObservationFallback(error)) {
        const saved = await saveLocalObservation(observation);
        setObservations((previous) => [saved, ...previous]);
        setStorageMode('local');
        logInfo('Plants', 'Observations table missing. Saved observation locally instead.', {
          id: saved.id,
          species: saved.species,
        });
        return saved;
      }

      logError('Plants', 'Observation save failed.', error);
      throw error;
    }

    const saved = data as Observation;
    setObservations((previous) => [saved, ...previous]);
    setStorageMode('supabase');
    logInfo('Plants', 'Observation saved.', { id: saved.id, species: saved.species });
    return saved;
  };

  const updateObservationZipCode = async (
    id: string,
    zipCode: string | null,
  ): Promise<Observation> => {
    if (!userId) {
      throw new Error('No signed-in user.');
    }

    const normalizedZipCode = normalizeZipCode(zipCode);
    logInfo('Plants', 'Updating observation ZIP code.', {
      id,
      userId,
      zipCode: normalizedZipCode,
    });

    let { data, error } = await supabase
      .from('observations')
      .update({ zip_code: normalizedZipCode })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      if (shouldUseLocalObservationFallback(error)) {
        const updated = await updateLocalObservation(id, userId, { zip_code: normalizedZipCode });
        setObservations((previous) =>
          previous.map((observation) => (observation.id === id ? updated : observation)),
        );
        setStorageMode('local');
        logInfo('Plants', 'Updated local observation ZIP code.', {
          id: updated.id,
          zipCode: updated.zip_code ?? null,
        });
        return updated;
      }

      logError('Plants', 'Observation ZIP update failed.', error);
      throw error;
    }

    const updated = data as Observation;
    setObservations((previous) =>
      previous.map((observation) => (observation.id === id ? updated : observation)),
    );
    setStorageMode('supabase');
    logInfo('Plants', 'Observation ZIP code updated.', {
      id: updated.id,
      zipCode: updated.zip_code ?? null,
    });
    return updated;
  };

  const deleteObservation = async (id: string) => {
    logInfo('Plants', 'Deleting observation.', { id });
    const { error } = await supabase.from('observations').delete().eq('id', id);

    if (error) {
      if (userId && shouldUseLocalObservationFallback(error)) {
        await deleteLocalObservation(id, userId);
        setObservations((previous) => previous.filter((observation) => observation.id !== id));
        setStorageMode('local');
        logInfo('Plants', 'Observations table missing. Deleted local observation instead.', {
          id,
        });
        return;
      }

      logError('Plants', 'Observation delete failed.', error);
      throw error;
    }

    setObservations((previous) => previous.filter((observation) => observation.id !== id));
    setStorageMode('supabase');
    logInfo('Plants', 'Observation deleted.', { id });
  };

  const getTaxonomyTree = (): TaxonomyFamily[] => {
    const familyMap = new Map<string, Map<string, Map<string, Observation[]>>>();

    for (const observation of observations) {
      if (!familyMap.has(observation.family)) {
        familyMap.set(observation.family, new Map());
      }

      const genusMap = familyMap.get(observation.family)!;
      if (!genusMap.has(observation.genus)) {
        genusMap.set(observation.genus, new Map());
      }

      const speciesMap = genusMap.get(observation.genus)!;
      const key = observation.species || observation.scientific_name;

      if (!speciesMap.has(key)) {
        speciesMap.set(key, []);
      }

      speciesMap.get(key)!.push(observation);
    }

    return Array.from(familyMap.entries()).map(([family, genusMap]) => ({
      family,
      genera: Array.from(genusMap.entries()).map(([genus, speciesMap]) => ({
        genus,
        species: Array.from(speciesMap.entries()).map(([species, items]) => ({
          species,
          scientificName: items[0].scientific_name,
          observations: items,
        })),
      })),
    }));
  };

  return {
    observations,
    loading,
    error,
    fetchObservations,
    saveObservation,
    updateObservationZipCode,
    deleteObservation,
    getTaxonomyTree,
    storageMode,
  };
}
