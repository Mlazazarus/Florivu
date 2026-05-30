import { ZipCodeMapLocation } from '../types';

export interface ObservationGeoMetrics {
  cityCount: number;
  countryCount: number;
  continentCount: number;
}

export const emptyObservationGeoMetrics: ObservationGeoMetrics = {
  cityCount: 0,
  countryCount: 0,
  continentCount: 0,
};

const continentCountryCodes = {
  africa: [
    'AO', 'BF', 'BI', 'BJ', 'BW', 'CD', 'CF', 'CG', 'CI', 'CM', 'CV', 'DJ', 'DZ', 'EG', 'EH',
    'ER', 'ET', 'GA', 'GH', 'GM', 'GN', 'GQ', 'GW', 'KE', 'KM', 'LR', 'LS', 'LY', 'MA', 'MG',
    'ML', 'MR', 'MU', 'MW', 'MZ', 'NA', 'NE', 'NG', 'RE', 'RW', 'SC', 'SD', 'SH', 'SL', 'SN',
    'SO', 'SS', 'ST', 'SZ', 'TD', 'TG', 'TN', 'TZ', 'UG', 'YT', 'ZA', 'ZM', 'ZW',
  ],
  antarctica: ['AQ', 'BV', 'HM', 'TF'],
  asia: [
    'AE', 'AF', 'AM', 'AZ', 'BD', 'BH', 'BN', 'BT', 'CC', 'CN', 'CX', 'CY', 'GE', 'HK', 'ID',
    'IL', 'IN', 'IQ', 'IR', 'JO', 'JP', 'KG', 'KH', 'KP', 'KR', 'KW', 'KZ', 'LA', 'LB', 'LK',
    'MM', 'MN', 'MO', 'MV', 'MY', 'NP', 'OM', 'PH', 'PK', 'PS', 'QA', 'SA', 'SG', 'SY', 'TH',
    'TJ', 'TL', 'TM', 'TR', 'TW', 'UZ', 'VN', 'YE',
  ],
  europe: [
    'AD', 'AL', 'AT', 'AX', 'BA', 'BE', 'BG', 'BY', 'CH', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI',
    'FO', 'FR', 'GB', 'GG', 'GI', 'GR', 'HR', 'HU', 'IE', 'IM', 'IS', 'IT', 'JE', 'LI', 'LT',
    'LU', 'LV', 'MC', 'MD', 'ME', 'MK', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'RS', 'RU', 'SE',
    'SI', 'SJ', 'SK', 'SM', 'UA', 'VA', 'XK',
  ],
  'north-america': [
    'AG', 'AI', 'AW', 'BB', 'BL', 'BM', 'BQ', 'BS', 'BZ', 'CA', 'CR', 'CU', 'CW', 'DM', 'DO',
    'GD', 'GL', 'GP', 'GT', 'HN', 'HT', 'JM', 'KN', 'KY', 'LC', 'MF', 'MQ', 'MS', 'MX', 'NI',
    'PA', 'PM', 'PR', 'SV', 'SX', 'TC', 'TT', 'US', 'VC', 'VG', 'VI',
  ],
  oceania: [
    'AS', 'AU', 'CK', 'FJ', 'FM', 'GU', 'KI', 'MH', 'MP', 'NC', 'NF', 'NR', 'NU', 'NZ', 'PF',
    'PG', 'PN', 'PW', 'SB', 'TK', 'TO', 'TV', 'UM', 'VU', 'WF', 'WS',
  ],
  'south-america': ['AR', 'BO', 'BR', 'CL', 'CO', 'EC', 'FK', 'GF', 'GY', 'PE', 'PY', 'SR', 'UY', 'VE'],
} as const;

const continentLabels = {
  africa: 'Africa',
  antarctica: 'Antarctica',
  asia: 'Asia',
  europe: 'Europe',
  'north-america': 'North America',
  oceania: 'Oceania',
  'south-america': 'South America',
} as const;

const countryCodeToContinent = new Map<string, keyof typeof continentLabels>();

for (const [continent, countryCodes] of Object.entries(continentCountryCodes) as Array<
  [keyof typeof continentLabels, readonly string[]]
>) {
  for (const countryCode of countryCodes) {
    countryCodeToContinent.set(countryCode, continent);
  }
}

function normalizeToken(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function getContinentFromCountryCode(countryCode: string | null | undefined) {
  const normalizedCountryCode = normalizeToken(countryCode)?.toUpperCase() ?? null;
  if (!normalizedCountryCode) {
    return null;
  }

  const continent = countryCodeToContinent.get(normalizedCountryCode);
  return continent ? continentLabels[continent] : null;
}

export function buildObservationGeoMetrics(
  locations: ZipCodeMapLocation[],
): ObservationGeoMetrics {
  const cityKeys = new Set<string>();
  const countryCodes = new Set<string>();
  const continents = new Set<string>();

  for (const location of locations) {
    const city = normalizeToken(location.city)?.toLowerCase();
    const state = normalizeToken(location.state)?.toLowerCase() ?? '';
    const countryCode = normalizeToken(location.countryCode)?.toUpperCase() ?? '';

    if (city) {
      cityKeys.add(`${city}|${state}|${countryCode}`);
    }

    if (!countryCode) {
      continue;
    }

    countryCodes.add(countryCode);

    const continent = getContinentFromCountryCode(countryCode);
    if (continent) {
      continents.add(continent);
    }
  }

  return {
    cityCount: cityKeys.size,
    countryCount: countryCodes.size,
    continentCount: continents.size,
  };
}
