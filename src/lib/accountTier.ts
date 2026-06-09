import { type AccountTier, type Observation } from '../types';

export const FREE_ACCOUNT_TIER: AccountTier = 'free';
export const PLUS_ACCOUNT_TIER: AccountTier = 'plus';
export const FREE_DAILY_DISCOVERY_LIMIT = 10;
export const FREE_DISCOVERY_LIMIT_ERROR =
  `Free accounts can save up to ${FREE_DAILY_DISCOVERY_LIMIT} plant discoveries per day. Upgrade to Plus for unlimited discoveries.`;

export function normalizeAccountTier(value: string | null | undefined): AccountTier {
  return value === PLUS_ACCOUNT_TIER ? PLUS_ACCOUNT_TIER : FREE_ACCOUNT_TIER;
}

export function getUtcDayKey(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsedValue = new Date(value);
  if (Number.isNaN(parsedValue.getTime())) {
    return null;
  }

  return parsedValue.toISOString().slice(0, 10);
}

export function getObservationDiscoveryDayKey(
  observation: Pick<Observation, 'created_at' | 'date_found'>,
) {
  return getUtcDayKey(observation.created_at) ?? getUtcDayKey(observation.date_found);
}

export function countObservationsForUtcDay(
  observations: Array<Pick<Observation, 'created_at' | 'date_found'>>,
  dayKey: string | null,
) {
  if (!dayKey) {
    return 0;
  }

  return observations.reduce((count, observation) => {
    return count + Number(getObservationDiscoveryDayKey(observation) === dayKey);
  }, 0);
}

export function getFreeDiscoveriesRemaining(observationCount: number) {
  return Math.max(0, FREE_DAILY_DISCOVERY_LIMIT - observationCount);
}

export function hasReachedFreeDiscoveryLimit(observationCount: number) {
  return observationCount >= FREE_DAILY_DISCOVERY_LIMIT;
}
