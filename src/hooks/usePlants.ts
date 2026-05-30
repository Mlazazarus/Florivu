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
  return isObservationColumnMissing(error, 'zip_code');
}

function isCatalogPlantIdColumnMissing(error: unknown) {
  return isObservationColumnMissing(error, 'catalog_plant_id');
}

function isCareProfileIdColumnMissing(error: unknown) {
  return isObservationColumnMissing(error, 'care_profile_id');
}

function isObservationColumnMissing(error: unknown, columnName: string) {
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message: unknown }).message).toLowerCase()
      : String(error ?? '').toLowerCase();

  return message.includes(columnName) && (message.includes('column') || message.includes('schema cache'));
}

function areEnhancedObservationColumnsMissing(error: unknown) {
  return (
    isObservationColumnMissing(error, 'zip_code') ||
    isObservationColumnMissing(error, 'is_favorite') ||
    isObservationColumnMissing(error, 'is_house_plant')
  );
}

function normalizeZipCode(zipCode: string | null) {
  const trimmed = zipCode?.trim();
  return trimmed ? trimmed : null;
}

function normalizeObservation(observation: Observation): Observation {
  return {
    ...observation,
    zip_code: observation.zip_code ?? null,
    is_favorite: Boolean(observation.is_favorite),
    is_house_plant: Boolean(observation.is_house_plant),
    catalog_plant_id: observation.catalog_plant_id ?? null,
    care_profile_id: observation.care_profile_id ?? null,
  };
}

function stripUnsupportedObservationFields(
  observation: Omit<Observation, 'id' | 'created_at'>,
  error: unknown,
) {
  const nextObservation = { ...observation } as Partial<Omit<Observation, 'id' | 'created_at'>>;
  const removedFields: string[] = [];

  if (isZipCodeColumnMissing(error)) {
    delete nextObservation.zip_code;
    removedFields.push('zip_code');
  }

  if (isObservationColumnMissing(error, 'is_favorite')) {
    delete nextObservation.is_favorite;
    removedFields.push('is_favorite');
  }

  if (isObservationColumnMissing(error, 'is_house_plant')) {
    delete nextObservation.is_house_plant;
    removedFields.push('is_house_plant');
  }

  if (isCatalogPlantIdColumnMissing(error)) {
    delete nextObservation.catalog_plant_id;
    removedFields.push('catalog_plant_id');
  }

  if (isCareProfileIdColumnMissing(error)) {
    delete nextObservation.care_profile_id;
    removedFields.push('care_profile_id');
  }

  return {
    nextObservation: nextObservation as Omit<Observation, 'id' | 'created_at'>,
    removedFields,
  };
}

type ObservationUpdate = Partial<Pick<Observation, 'zip_code' | 'is_favorite' | 'is_house_plant'>>;

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

      setObservations((data ?? []).map((observation) => normalizeObservation(observation as Observation)));
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

    if (error) {
      const { nextObservation, removedFields } = stripUnsupportedObservationFields(observation, error);

      if (removedFields.length > 0) {
        logInfo('Plants', 'Observations table is missing newer columns. Retrying save without unsupported fields.', {
          removedFields,
          userId: observation.user_id,
          species: observation.species,
        });

        ({ data, error } = await supabase
          .from('observations')
          .insert(nextObservation)
          .select()
          .single());
      }
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

    const saved = normalizeObservation(data as Observation);
    setObservations((previous) => [saved, ...previous]);
    setStorageMode('supabase');
    logInfo('Plants', 'Observation saved.', { id: saved.id, species: saved.species });
    return saved;
  };

  const updateObservation = async (id: string, updates: ObservationUpdate): Promise<Observation> => {
    if (!userId) {
      throw new Error('No signed-in user.');
    }

    let { data, error } = await supabase
      .from('observations')
      .update(updates)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      if (shouldUseLocalObservationFallback(error)) {
        const updated = normalizeObservation(await updateLocalObservation(id, userId, updates));
        setObservations((previous) =>
          previous.map((observation) => (observation.id === id ? updated : observation)),
        );
        setStorageMode('local');
        return updated;
      }

      if (areEnhancedObservationColumnsMissing(error)) {
        throw new Error(
          'Your Supabase observations table is missing newer Florivu columns. Run supabase/schema.sql, then try again.',
        );
      }

      logError('Plants', 'Observation update failed.', error);
      throw error;
    }

    const updated = normalizeObservation(data as Observation);
    setObservations((previous) =>
      previous.map((observation) => (observation.id === id ? updated : observation)),
    );
    setStorageMode('supabase');
    return updated;
  };

  const updateObservationZipCode = async (
    id: string,
    zipCode: string | null,
  ): Promise<Observation> => {
    const normalizedZipCode = normalizeZipCode(zipCode);
    logInfo('Plants', 'Updating observation ZIP code.', {
      id,
      userId,
      zipCode: normalizedZipCode,
    });

    const updated = await updateObservation(id, { zip_code: normalizedZipCode });
    logInfo('Plants', 'Observation ZIP code updated.', {
      id: updated.id,
      zipCode: updated.zip_code ?? null,
    });
    return updated;
  };

  const updateObservationLabels = async (
    id: string,
    labels: Pick<Observation, 'is_favorite' | 'is_house_plant'>,
  ): Promise<Observation> => {
    logInfo('Plants', 'Updating observation labels.', {
      id,
      userId,
      isFavorite: labels.is_favorite,
      isHousePlant: labels.is_house_plant,
    });

    const updated = await updateObservation(id, {
      is_favorite: labels.is_favorite,
      is_house_plant: labels.is_house_plant,
    });

    logInfo('Plants', 'Observation labels updated.', {
      id: updated.id,
      isFavorite: updated.is_favorite,
      isHousePlant: updated.is_house_plant,
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
    updateObservationLabels,
    updateObservationZipCode,
    deleteObservation,
    getTaxonomyTree,
    storageMode,
  };
}
