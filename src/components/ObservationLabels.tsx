import type { ComponentType } from 'react';
import type { Observation } from '../types';

type ObservationLabelField = 'is_favorite' | 'is_house_plant';

type ObservationLabelIconProps = {
  className?: string;
};

function FavoriteIcon({ className }: ObservationLabelIconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M12 3.75 14.55 8.93 20.27 9.76 16.14 13.8 17.11 19.5 12 16.82 6.89 19.5 7.86 13.8 3.73 9.76 9.45 8.93 12 3.75Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function HousePlantIcon({ className }: ObservationLabelIconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M12.07 5.1c2.09 1.22 3.14 3 3.14 5.36-2.18-.1-3.83-.9-4.95-2.42-.1-1.43.5-2.41 1.81-2.94Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M10.55 8.9c-1.99.53-3.26 1.8-3.81 3.82 1.93.18 3.48-.31 4.63-1.48"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M13.45 8.9c1.99.53 3.26 1.8 3.81 3.82-1.93.18-3.48-.31-4.63-1.48"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M8 13.25h8"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="m8.95 13.25 1.02 5.25h4.06l1.02-5.25"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

export type ObservationLabelOption = {
  description: string;
  field: ObservationLabelField;
  Icon: ComponentType<ObservationLabelIconProps>;
  label: string;
};

export const observationLabelOptions: ObservationLabelOption[] = [
  {
    field: 'is_favorite',
    label: 'Favorite',
    description: 'Keep this one starred in your collection.',
    Icon: FavoriteIcon,
  },
  {
    field: 'is_house_plant',
    label: 'House Plant',
    description: 'Mark plants that live inside your home.',
    Icon: HousePlantIcon,
  },
];

type ObservationLabelsProps = {
  className?: string;
  observation: Pick<Observation, ObservationLabelField>;
};

export function ObservationLabelIcons({
  className,
  observation,
}: ObservationLabelsProps) {
  const activeLabels = observationLabelOptions.filter((option) => observation[option.field]);

  if (activeLabels.length === 0) {
    return null;
  }

  const classes = ['observation-label-icons', className].filter(Boolean).join(' ');

  return (
    <span
      aria-label={activeLabels.map((option) => option.label).join(', ')}
      className={classes}
      role="img"
    >
      {activeLabels.map(({ field, Icon, label }) => (
        <span className={`observation-label-icon observation-label-icon--${field}`} key={field} title={label}>
          <Icon className="observation-label-icon__svg" />
        </span>
      ))}
    </span>
  );
}
