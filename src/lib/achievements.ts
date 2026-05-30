export interface AchievementMetrics {
  observationCount: number;
  speciesCount: number;
  familyCount: number;
  repeatSpeciesCount: number;
  friendCount: number;
  completedReferralCount: number;
  housePlantCount: number;
  cityCount: number;
  countryCount: number;
  continentCount: number;
}

export interface AvatarBorderDefinition {
  id: string;
  label: string;
  description: string;
}

export interface ProfileTitleDefinition {
  id: string;
  label: string;
  description: string;
}

export type AchievementReward =
  | {
      kind: 'avatar-border';
      label: string;
      description: string;
      avatarBorderId: string;
    }
  | {
      kind: 'title';
      label: string;
      description: string;
      profileTitleId: string;
    };

export interface AchievementDefinition {
  id: string;
  name: string;
  description: string;
  accentLabel?: string;
  flavorText?: string;
  metricKey: keyof AchievementMetrics;
  targetValue: number;
  reward: AchievementReward;
}

export interface AchievementStatus extends AchievementDefinition {
  currentValue: number;
  progressRatio: number;
  unlocked: boolean;
}

function avatarBorderReward(
  label: string,
  description: string,
  avatarBorderId: string,
): AchievementReward {
  return {
    kind: 'avatar-border',
    label,
    description,
    avatarBorderId,
  };
}

function profileTitleReward(
  label: string,
  description: string,
  profileTitleId: string,
): AchievementReward {
  return {
    kind: 'title',
    label,
    description,
    profileTitleId,
  };
}

const avatarBorderCatalog: AvatarBorderDefinition[] = [
  {
    id: 'light-green-border',
    label: 'Light Green Border',
    description: 'A fresh light green ring for the first plants in your collection.',
  },
  {
    id: 'light-brown-gradient-border',
    label: 'Light Brown Gradient Border',
    description: 'A warm brown gradient that fades from sandy tan into rich earth tones.',
  },
  {
    id: 'golden-pothos-border',
    label: 'Golden Pothos Border',
    description: 'A golden green ring inspired by trailing pothos vines.',
  },
  {
    id: 'light-pink-border',
    label: 'Light Pink Border',
    description: 'A soft pink floral border for family-level collectors.',
  },
  {
    id: 'wandering-jew-border',
    label: 'Wandering Jew Border',
    description: 'A purple-and-silver travel border for city-to-city plant hunters.',
  },
  {
    id: 'string-of-hearts-border',
    label: 'String of Hearts Border',
    description: 'A delicate pink vine border for multi-country collectors.',
  },
  {
    id: 'silver-monstera-border',
    label: 'Silver Monstera Border',
    description: 'A cool silver border for collectors who span continents.',
  },
  {
    id: 'earth-border',
    label: 'Earth Border',
    description: 'A blue-and-green global border for serious international explorers.',
  },
  {
    id: 'sun-border',
    label: 'Sun Border',
    description: 'A radiant gold border reserved for all-continent collectors.',
  },
  {
    id: 'light-blue-border',
    label: 'Light Blue Border',
    description: 'A clear sky blue border for steady catalog growth.',
  },
  {
    id: 'common-dandilion-border',
    label: 'Common Dandilion Border',
    description: 'A bright yellow border for growers who spread Florivu far and wide.',
  },
  {
    id: 'magnifying-glass-border',
    label: 'Magnifying Glass Border',
    description: 'A cool glassy border for careful observers with deep collections.',
  },
  {
    id: 'string-of-turtles-border',
    label: 'String of Turtles Border',
    description: 'A patterned green border for patient collectors with hundreds of finds.',
  },
  {
    id: 'dark-green-border',
    label: 'Dark Green Border',
    description: 'A deep evergreen border for truly dense indoor collections.',
  },
  {
    id: 'dark-blue-border',
    label: 'Dark Blue Border',
    description: 'A midnight blue border for broad family-level expertise.',
  },
];

const avatarBorderMap = new Map(
  avatarBorderCatalog.map((border) => [border.id, border]),
);

const profileTitleCatalog: ProfileTitleDefinition[] = [
  {
    id: 'propogator',
    label: 'Propogator',
    description: 'A title for collectors who keep returning to the same plant type.',
  },
  {
    id: 'seed-spreader',
    label: 'Seed Spreader',
    description: 'A title for growers who bring new Florivu friends into the app.',
  },
  {
    id: 'gardener',
    label: 'Gardener',
    description: 'A title for users building a real indoor plant routine.',
  },
  {
    id: 'tourist',
    label: 'Tourist',
    description: 'A title for collectors whose plants cross borders.',
  },
  {
    id: 'traveler',
    label: 'Traveler',
    description: 'A title for collectors whose observations span continents.',
  },
  {
    id: 'explorer',
    label: 'Explorer',
    description: 'A title for users with a seriously international collection.',
  },
  {
    id: 'neighbor',
    label: 'Neighbor',
    description: 'A title for growers with a healthy Florivu friend circle.',
  },
  {
    id: 'party-animal',
    label: 'Party Animal',
    description: 'A title for users with a truly crowded plant network.',
  },
  {
    id: 'herbavore',
    label: 'Herbavore',
    description: 'A title for collectors whose home is overflowing with house plants.',
  },
  {
    id: 'curator',
    label: 'Curator',
    description: 'A title for catalogers who know plant families at scale.',
  },
];

const profileTitleMap = new Map(
  profileTitleCatalog.map((title) => [title.id, title]),
);

const achievementCatalog: AchievementDefinition[] = [
  {
    id: 'fresh-sprout',
    name: 'Fresh Sprout',
    description: 'Catalog 5 observations and put your first roots down.',
    accentLabel: 'Collection',
    metricKey: 'observationCount',
    targetValue: 5,
    reward: avatarBorderReward(
      'Light Green Border',
      'A bright light green border that marks the start of your Florivu collection.',
      'light-green-border',
    ),
  },
  {
    id: 'species-scout',
    name: 'Species Scout',
    description: 'Log 8 unique species.',
    accentLabel: 'Species',
    metricKey: 'speciesCount',
    targetValue: 8,
    reward: avatarBorderReward(
      'Light Brown Gradient Border',
      'An earthy brown gradient for collectors who keep finding new species.',
      'light-brown-gradient-border',
    ),
  },
  {
    id: 'propogator',
    name: 'Propogator',
    description: 'Catalog 3 observations of the same exact type of plant.',
    accentLabel: 'Collection',
    metricKey: 'repeatSpeciesCount',
    targetValue: 3,
    reward: profileTitleReward(
      'Propogator',
      'Equip the Propogator title on your Florivu profile.',
      'propogator',
    ),
  },
  {
    id: 'seed-spreader',
    name: 'Seed Spreader',
    description: 'Invite 2 new friends who join Florivu and add you back.',
    accentLabel: 'Social',
    metricKey: 'completedReferralCount',
    targetValue: 2,
    reward: profileTitleReward(
      'Seed Spreader',
      'Equip the Seed Spreader title on your Florivu profile.',
      'seed-spreader',
    ),
  },
  {
    id: 'forager',
    name: 'Forager',
    description: 'Observe plants from 2 different cities.',
    accentLabel: 'Travel',
    metricKey: 'cityCount',
    targetValue: 2,
    reward: avatarBorderReward(
      'Golden Pothos Border',
      'A golden vine border for collectors who are already branching into new cities.',
      'golden-pothos-border',
    ),
  },
  {
    id: 'indoor-garden',
    name: 'Indoor Garden',
    description: 'Add 8 house plants.',
    accentLabel: 'House Plants',
    metricKey: 'housePlantCount',
    targetValue: 8,
    reward: profileTitleReward(
      'Gardener',
      'Equip the Gardener title on your Florivu profile.',
      'gardener',
    ),
  },
  {
    id: 'flourist',
    name: 'Flourist',
    description: 'Discover 10 unique families.',
    accentLabel: 'Taxonomy',
    metricKey: 'familyCount',
    targetValue: 10,
    reward: avatarBorderReward(
      'Light Pink Border',
      'A soft pink border for users who branch out across plant families.',
      'light-pink-border',
    ),
  },
  {
    id: 'wanderer',
    name: 'Wanderer',
    description: 'Observe plants from 5 different cities.',
    accentLabel: 'Travel',
    metricKey: 'cityCount',
    targetValue: 5,
    reward: avatarBorderReward(
      'Wandering Jew Border',
      'A purple-and-silver border for collectors who keep moving from city to city.',
      'wandering-jew-border',
    ),
  },
  {
    id: 'tourist',
    name: 'Tourist',
    description: 'Observe plants from 2 different countries.',
    accentLabel: 'Travel',
    metricKey: 'countryCount',
    targetValue: 2,
    reward: profileTitleReward(
      'Tourist',
      'Equip the Tourist title on your Florivu profile.',
      'tourist',
    ),
  },
  {
    id: 'backpacker',
    name: 'Backpacker',
    description: 'Observe plants from 5 different countries.',
    accentLabel: 'Travel',
    metricKey: 'countryCount',
    targetValue: 5,
    reward: avatarBorderReward(
      'String of Hearts Border',
      'A trailing heart-shaped border for collectors building a multi-country record.',
      'string-of-hearts-border',
    ),
  },
  {
    id: 'traveler',
    name: 'Traveler',
    description: 'Observe plants from 2 different continents.',
    accentLabel: 'Travel',
    metricKey: 'continentCount',
    targetValue: 2,
    reward: profileTitleReward(
      'Traveler',
      'Equip the Traveler title on your Florivu profile.',
      'traveler',
    ),
  },
  {
    id: 'explorer',
    name: 'Explorer',
    description: 'Observe plants from 15 different countries.',
    accentLabel: 'Travel',
    metricKey: 'countryCount',
    targetValue: 15,
    reward: profileTitleReward(
      'Explorer',
      'Equip the Explorer title on your Florivu profile.',
      'explorer',
    ),
  },
  {
    id: 'jet-setter',
    name: 'Jet-setter',
    description: 'Observe plants from 4 different continents.',
    accentLabel: 'Travel',
    metricKey: 'continentCount',
    targetValue: 4,
    reward: avatarBorderReward(
      'Silver Monstera Border',
      'A silver border for collectors whose observations span much of the globe.',
      'silver-monstera-border',
    ),
  },
  {
    id: 'globetrotter',
    name: 'Globetrotter',
    description: 'Observe plants from 50 different countries.',
    accentLabel: 'Travel',
    metricKey: 'countryCount',
    targetValue: 50,
    reward: avatarBorderReward(
      'Earth Border',
      'A planetary blue-and-green border for world-scale plant hunters.',
      'earth-border',
    ),
  },
  {
    id: 'atlas',
    name: 'Atlas',
    description: 'Observe plants from all seven continents.',
    accentLabel: 'Travel',
    metricKey: 'continentCount',
    targetValue: 7,
    reward: avatarBorderReward(
      'Sun Border',
      'A radiant sun border for collectors who have reached every continent.',
      'sun-border',
    ),
  },
  {
    id: 'neighbor',
    name: 'Neighbor',
    description: 'Have 15 friends.',
    accentLabel: 'Social',
    metricKey: 'friendCount',
    targetValue: 15,
    reward: profileTitleReward(
      'Neighbor',
      'Equip the Neighbor title on your Florivu profile.',
      'neighbor',
    ),
  },
  {
    id: 'observer',
    name: 'Observer',
    description: 'Catalog 25 observations.',
    accentLabel: 'Collection',
    metricKey: 'observationCount',
    targetValue: 25,
    reward: avatarBorderReward(
      'Light Blue Border',
      'A light blue border for collectors who keep cataloging with consistency.',
      'light-blue-border',
    ),
  },
  {
    id: 'dandilion',
    name: 'Dandilion',
    description: 'Invite 5 new friends who join Florivu and add you back.',
    accentLabel: 'Social',
    metricKey: 'completedReferralCount',
    targetValue: 5,
    reward: avatarBorderReward(
      'Common Dandilion Border',
      'A bright yellow border for growers whose invites keep drifting farther.',
      'common-dandilion-border',
    ),
  },
  {
    id: 'party-animal',
    name: 'Party Animal',
    description: 'Have 50 friends.',
    accentLabel: 'Social',
    metricKey: 'friendCount',
    targetValue: 50,
    reward: profileTitleReward(
      'Party Animal',
      'Equip the Party Animal title on your Florivu profile.',
      'party-animal',
    ),
  },
  {
    id: 'curio',
    name: 'Curio',
    description: 'Catalog 100 observations.',
    accentLabel: 'Collection',
    metricKey: 'observationCount',
    targetValue: 100,
    reward: avatarBorderReward(
      'Magnifying Glass Border',
      'A clean glass-inspired border for serious plant observers.',
      'magnifying-glass-border',
    ),
  },
  {
    id: 'owl',
    name: 'Owl',
    description: 'Catalog 500 observations.',
    accentLabel: 'Collection',
    metricKey: 'observationCount',
    targetValue: 500,
    reward: avatarBorderReward(
      'String of Turtles Border',
      'A patterned collector border for long-term Florivu dedication.',
      'string-of-turtles-border',
    ),
  },
  {
    id: 'indoor-jungle',
    name: 'Indoor Jungle',
    description: 'Add 20 house plants.',
    accentLabel: 'House Plants',
    metricKey: 'housePlantCount',
    targetValue: 20,
    reward: avatarBorderReward(
      'Dark Green Border',
      'A dense evergreen border for real indoor jungles.',
      'dark-green-border',
    ),
  },
  {
    id: 'herbavore',
    name: 'Herbavore',
    description: 'Add 50 house plants.',
    accentLabel: 'House Plants',
    metricKey: 'housePlantCount',
    targetValue: 50,
    reward: profileTitleReward(
      'Herbavore',
      'Equip the Herbavore title on your Florivu profile.',
      'herbavore',
    ),
  },
  {
    id: 'collector',
    name: 'Collector',
    description: 'Discover 25 unique families.',
    accentLabel: 'Taxonomy',
    metricKey: 'familyCount',
    targetValue: 25,
    reward: avatarBorderReward(
      'Dark Blue Border',
      'A dark blue border for collectors with broad family-level coverage.',
      'dark-blue-border',
    ),
  },
  {
    id: 'curator',
    name: 'Curator',
    description: 'Discover 100 unique families.',
    accentLabel: 'Taxonomy',
    metricKey: 'familyCount',
    targetValue: 100,
    reward: profileTitleReward(
      'Curator',
      'Equip the Curator title on your Florivu profile.',
      'curator',
    ),
  },
];

const achievementIdSet = new Set(achievementCatalog.map((achievement) => achievement.id));

export function normalizeAchievementIds(ids: string[] | null | undefined) {
  return Array.from(
    new Set(
      (ids ?? [])
        .map((id) => id.trim())
        .filter((id) => Boolean(id) && achievementIdSet.has(id)),
    ),
  );
}

export function getAchievementStatuses(
  metrics: AchievementMetrics,
  storedEarnedIds: string[] | null | undefined,
): AchievementStatus[] {
  const earnedIdSet = new Set(getEarnedAchievementIds(metrics, storedEarnedIds));

  return achievementCatalog.map((achievement) => {
    const currentValue = metrics[achievement.metricKey];

    return {
      ...achievement,
      currentValue,
      progressRatio: Math.min(1, currentValue / achievement.targetValue),
      unlocked: earnedIdSet.has(achievement.id),
    };
  });
}

export function getAchievementCatalog() {
  return [...achievementCatalog];
}

export function getEarnedAchievements(ids: string[] | null | undefined) {
  const earnedIdSet = new Set(normalizeAchievementIds(ids));

  return achievementCatalog.filter((achievement) => earnedIdSet.has(achievement.id));
}

export function getEarnedAchievementIds(
  metrics: AchievementMetrics,
  storedEarnedIds: string[] | null | undefined,
) {
  const nextEarnedIds = new Set(normalizeAchievementIds(storedEarnedIds));

  for (const achievement of achievementCatalog) {
    if (metrics[achievement.metricKey] >= achievement.targetValue) {
      nextEarnedIds.add(achievement.id);
    }
  }

  return [...nextEarnedIds];
}

export function getAvatarBorder(borderId: string | null | undefined) {
  if (!borderId) {
    return null;
  }

  return avatarBorderMap.get(borderId) ?? null;
}

export function getAvatarBorderClassName(borderId: string | null | undefined) {
  return borderId ? `avatar-frame avatar-frame--${borderId}` : '';
}

export function getProfileTitle(titleId: string | null | undefined) {
  if (!titleId) {
    return null;
  }

  return profileTitleMap.get(titleId) ?? null;
}

export function getUnlockedAvatarBorders(achievements: AchievementStatus[]) {
  return achievements.flatMap((achievement) => {
    if (!achievement.unlocked || achievement.reward.kind !== 'avatar-border') {
      return [];
    }

    const border = getAvatarBorder(achievement.reward.avatarBorderId);
    return border
      ? [
          {
            ...border,
            description: achievement.description,
          },
        ]
      : [];
  });
}

export function getUnlockedProfileTitles(achievements: AchievementStatus[]) {
  return achievements.flatMap((achievement) => {
    if (!achievement.unlocked || achievement.reward.kind !== 'title') {
      return [];
    }

    const title = getProfileTitle(achievement.reward.profileTitleId);
    return title
      ? [
          {
            ...title,
            description: achievement.description,
          },
        ]
      : [];
  });
}

export function isAvatarBorderUnlocked(
  borderId: string | null | undefined,
  achievements: AchievementStatus[],
) {
  if (!borderId) {
    return false;
  }

  return getUnlockedAvatarBorders(achievements).some((border) => border.id === borderId);
}

export function isProfileTitleUnlocked(
  titleId: string | null | undefined,
  achievements: AchievementStatus[],
) {
  if (!titleId) {
    return false;
  }

  return getUnlockedProfileTitles(achievements).some((title) => title.id === titleId);
}
