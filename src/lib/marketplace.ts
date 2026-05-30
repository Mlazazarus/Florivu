import type { Observation, UserProfile } from '../types';
import { formatCatalogLabel, resolveObservationCatalogMatch } from './plantCatalog';

export type MarketplacePlatform = 'facebook' | 'offerup';

export function getMarketplaceEligibleObservations(observations: Observation[]) {
  return [...observations]
    .filter((observation) => observation.is_house_plant)
    .sort(
      (left, right) =>
        Number(right.is_favorite) - Number(left.is_favorite) ||
        new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
    );
}

export function getDefaultMarketplaceZip(
  profile: Pick<UserProfile, 'home_zip_code' | 'marketplace_zip_code'> | null,
) {
  return profile?.marketplace_zip_code?.trim() || profile?.home_zip_code?.trim() || '';
}

export function getMarketplaceTitle(observation: Observation) {
  return observation.common_name.trim() || observation.scientific_name.trim();
}

export function getMarketplaceFlorivuDescription(observation: Observation) {
  const catalogMatch = resolveObservationCatalogMatch(observation);

  if (!catalogMatch) {
    return [
      `${observation.common_name} from my Florivu collection.`,
      `Identified as ${observation.scientific_name}.`,
      `Plant family: ${observation.family}.`,
    ].join('\n');
  }

  const careNotes = [
    catalogMatch.careProfile?.light && `Light: ${catalogMatch.careProfile.light}`,
    catalogMatch.careProfile?.water && `Water: ${catalogMatch.careProfile.water}`,
    catalogMatch.careProfile?.humidity && `Humidity: ${catalogMatch.careProfile.humidity}`,
    catalogMatch.careProfile?.soil && `Soil: ${catalogMatch.careProfile.soil}`,
    (catalogMatch.careProfile?.airflow || catalogMatch.plant.airflow_notes) &&
      `Airflow: ${catalogMatch.careProfile?.airflow ?? catalogMatch.plant.airflow_notes}`,
    (catalogMatch.careProfile?.difficulty || catalogMatch.plant.difficulty) &&
      `Difficulty: ${formatCatalogLabel(
        catalogMatch.careProfile?.difficulty ?? catalogMatch.plant.difficulty,
      )}`,
    catalogMatch.plant.pet_safety && `Pet safety: ${formatCatalogLabel(catalogMatch.plant.pet_safety)}`,
  ].filter(Boolean);

  return [
    catalogMatch.plant.description,
    `Florivu care notes: ${catalogMatch.plant.care_summary}`,
    ...careNotes,
  ].join('\n');
}

export function buildMarketplaceDescription(input: {
  customDescription: string;
  includeFlorivuDescription: boolean;
  observation: Observation;
}) {
  const customDescription = input.customDescription.trim();
  const florivuDescription = input.includeFlorivuDescription
    ? getMarketplaceFlorivuDescription(input.observation)
    : '';

  return [customDescription, florivuDescription].filter(Boolean).join('\n\n').trim();
}

export function buildMarketplaceClipboardText(input: {
  description: string;
  locationZip: string;
  observation: Observation;
  platform: MarketplacePlatform;
  price: string;
}) {
  const title = getMarketplaceTitle(input.observation);
  const description = input.description.trim();
  const price = input.price.trim();
  const locationZip = input.locationZip.trim();

  return [
    `Platform: ${input.platform === 'facebook' ? 'Facebook Marketplace' : 'OfferUp'}`,
    `Title: ${title}`,
    price ? `Price: $${price}` : '',
    locationZip ? `ZIP: ${locationZip}` : '',
    description ? `Description:\n${description}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function getMarketplacePlatformMeta(platform: MarketplacePlatform) {
  if (platform === 'facebook') {
    return {
      actionLabel: 'Open Facebook Marketplace',
      helperText: 'Florivu prepares the draft, then you finish the listing inside Facebook Marketplace.',
      openUrl: 'https://www.facebook.com/marketplace/create/item',
      platformLabel: 'Facebook Marketplace',
      statusTitle: 'Direct posting is not available',
    };
  }

  return {
    actionLabel: 'Open OfferUp posting help',
    helperText:
      'Florivu prepares the draft, then you finish the listing in the OfferUp app or your OfferUp Business tools.',
    openUrl: 'https://help.offerup.com/hc/en-us/articles/360031987592-Posting-an-item-for-sale',
    platformLabel: 'OfferUp',
    statusTitle: 'Use OfferUp handoff',
  };
}
