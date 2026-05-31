import { resolveObservationCatalogMatch } from './plantCatalog';
import { CareTaskKey, CareTaskSchedule, Observation } from '../types';

export interface CareTaskTemplate {
  task_key: CareTaskKey;
  title: string;
  instructions: string;
  cadence_days: number;
  sort_order: number;
}

const waterCadenceByCategory: Record<string, number> = {
  very_low_water: 21,
  low_water: 14,
  moderate_to_dry: 10,
  moderate_drydown: 7,
  moderate_consistent: 6,
  consistent_moist: 4,
  even_moist: 4,
  even_moist_seasonal: 5,
  frequent_check: 3,
  dry_cycle: 14,
  soak_and_dry: 7,
  wet_bog: 2,
  establish_then_moderate: 10,
  deep_establishment: 10,
  deep_establishment_then_moderate: 10,
};

const feedCadenceByDifficulty: Record<string, number> = {
  easy: 35,
  easy_to_intermediate: 30,
  intermediate: 28,
  intermediate_to_advanced: 21,
};

const soilCadenceByCategory: Record<string, number> = {
  no_soil_epiphyte: 120,
  epiphyte_chunky: 210,
  chunky_aroid_mix: 210,
  chunky_aroid_moist: 180,
  standard_well_draining: 180,
  rich_well_draining: 180,
  cactus_succulent_gritty: 300,
  cactus_mineral_gritty: 365,
  bonsai_gritty: 150,
  citrus_fast_draining: 240,
};

function normalizeCategory(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? '';
}

export function addDaysToIso(baseIso: string, days: number) {
  const nextDate = new Date(baseIso);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate.toISOString();
}

export function calculateNextDueAt(completedAtIso: string, cadenceDays: number) {
  return addDaysToIso(completedAtIso, cadenceDays);
}

export function isCareTaskDue(task: Pick<CareTaskSchedule, 'next_due_at'>, now = new Date()) {
  return new Date(task.next_due_at).getTime() <= now.getTime();
}

export function describeCareCadence(cadenceDays: number) {
  if (cadenceDays === 1) {
    return 'Every day';
  }

  if (cadenceDays % 30 === 0) {
    const months = cadenceDays / 30;
    return months === 1 ? 'Every month' : `Every ${months} months`;
  }

  if (cadenceDays % 7 === 0) {
    const weeks = cadenceDays / 7;
    return weeks === 1 ? 'Every week' : `Every ${weeks} weeks`;
  }

  return `Every ${cadenceDays} days`;
}

export function getBrowserTimeZone() {
  if (typeof Intl === 'undefined') {
    return 'UTC';
  }

  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

export function getCalendarDateKey(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

export function localDateInputToIso(dateInput: string) {
  const trimmed = dateInput.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = new Date(`${trimmed}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function isoToLocalDateInput(iso: string | null | undefined) {
  if (!iso) {
    return '';
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getBundledCareTaskTemplates(observation: Observation): CareTaskTemplate[] {
  if (!observation.is_house_plant) {
    return [];
  }

  const catalogMatch = resolveObservationCatalogMatch(observation);
  const careProfile = catalogMatch?.careProfile ?? null;
  const plant = catalogMatch?.plant ?? null;
  const waterCategory = normalizeCategory(careProfile?.water_category ?? plant?.water_category);
  const soilCategory = normalizeCategory(careProfile?.soil_category ?? plant?.soil_category);
  const difficulty = normalizeCategory(careProfile?.difficulty ?? plant?.difficulty);
  const waterSummary =
    careProfile?.water ??
    'Check the soil and water when the top layer feels appropriately dry for this houseplant.';
  const soilSummary =
    careProfile?.soil ??
    'Refresh depleted potting mix and check root room so growth stays healthy indoors.';
  const waterCadence = waterCadenceByCategory[waterCategory] ?? 7;
  const soilCadence = soilCadenceByCategory[soilCategory] ?? 180;
  const feedCadence = feedCadenceByDifficulty[difficulty] ?? 30;

  return [
    {
      task_key: 'water',
      title: 'Water',
      instructions: waterSummary,
      cadence_days: waterCadence,
      sort_order: 1,
    },
    {
      task_key: 'feed',
      title: 'Feed lightly',
      instructions:
        'Apply a light feeding during active growth, then reset the reminder after you fertilize.',
      cadence_days: feedCadence,
      sort_order: 2,
    },
    {
      task_key: 'refresh-soil',
      title: 'Refresh soil',
      instructions: soilSummary,
      cadence_days: soilCadence,
      sort_order: 3,
    },
  ];
}
