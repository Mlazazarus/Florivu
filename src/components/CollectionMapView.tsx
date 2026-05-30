import { useEffect, useState } from 'react';
import { fetchZipCodeMapLocations, normalizeZipCodeForMap } from '../lib/zipCodeMap';
import { formatError } from '../lib/logger';
import { Observation, ZipCodeMapLocation } from '../types';

interface CollectionMapViewProps {
  observations: Observation[];
  onSelectObservation: (observation: Observation) => void;
}

interface ZipObservationGroup {
  zipCode: string;
  observations: Observation[];
}

interface MappedZipObservationGroup extends ZipObservationGroup {
  location: ZipCodeMapLocation;
}

const MAP_WIDTH = 960;
const MAP_HEIGHT = 560;
const MAP_PADDING = 42;
const MAP_MIN_LATITUDE = 24.2;
const MAP_MAX_LATITUDE = 49.8;
const MAP_MIN_LONGITUDE = -125;
const MAP_MAX_LONGITUDE = -66.5;
const CONTINENTAL_US_OUTLINE =
  'M104 176 L132 148 L170 126 L224 112 L274 118 L318 104 L360 110 L408 102 L456 116 L506 126 L554 128 L610 146 L666 150 L726 170 L790 206 L836 246 L854 284 L852 316 L836 352 L802 374 L756 392 L714 420 L666 430 L618 434 L572 452 L520 476 L478 468 L442 446 L406 420 L360 410 L320 390 L272 384 L228 366 L190 338 L158 310 L134 284 L118 254 L102 220 Z';

function sortObservationsByCreatedAtDescending(left: Observation, right: Observation) {
  return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
}

function buildZipObservationGroups(observations: Observation[]) {
  const groupMap = new Map<string, Observation[]>();

  for (const observation of observations) {
    const normalizedZipCode = normalizeZipCodeForMap(observation.zip_code);
    if (!normalizedZipCode) {
      continue;
    }

    const existing = groupMap.get(normalizedZipCode) ?? [];
    existing.push(observation);
    groupMap.set(normalizedZipCode, existing);
  }

  return Array.from(groupMap.entries())
    .map(([zipCode, items]) => ({
      zipCode,
      observations: [...items].sort(sortObservationsByCreatedAtDescending),
    }))
    .sort(
      (left, right) =>
        right.observations.length - left.observations.length ||
        left.zipCode.localeCompare(right.zipCode, undefined, { sensitivity: 'base' }),
    );
}

function mercatorLatitude(latitude: number) {
  const radians = (latitude * Math.PI) / 180;
  return Math.log(Math.tan(Math.PI / 4 + radians / 2));
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function projectLocationToMap(location: ZipCodeMapLocation) {
  const innerWidth = MAP_WIDTH - MAP_PADDING * 2;
  const innerHeight = MAP_HEIGHT - MAP_PADDING * 2;
  const normalizedLongitude =
    (location.longitude - MAP_MIN_LONGITUDE) / (MAP_MAX_LONGITUDE - MAP_MIN_LONGITUDE);
  const minMercator = mercatorLatitude(MAP_MIN_LATITUDE);
  const maxMercator = mercatorLatitude(MAP_MAX_LATITUDE);
  const latitudeMercator = mercatorLatitude(location.latitude);
  const normalizedLatitude =
    (maxMercator - latitudeMercator) / (maxMercator - minMercator);
  const x = MAP_PADDING + clamp(normalizedLongitude, 0, 1) * innerWidth;
  const y = MAP_PADDING + clamp(normalizedLatitude, 0, 1) * innerHeight;

  return {
    xPercent: (x / MAP_WIDTH) * 100,
    yPercent: (y / MAP_HEIGHT) * 100,
  };
}

function getMarkerSize(observationCount: number) {
  return clamp(24 + (observationCount - 1) * 4, 24, 42);
}

function getLocationSubtitle(location: ZipCodeMapLocation) {
  if (location.city && location.state) {
    return `${location.city}, ${location.state}`;
  }

  if (location.city) {
    return location.city;
  }

  if (location.state) {
    return location.state;
  }

  return 'Approximate ZIP centroid';
}

function getLocationLabel(location: ZipCodeMapLocation) {
  return location.label.trim() || `ZIP ${location.zipCode}`;
}

export default function CollectionMapView({
  observations,
  onSelectObservation,
}: CollectionMapViewProps) {
  const zipGroups = buildZipObservationGroups(observations);
  const zipCodeKey = zipGroups.map((group) => group.zipCode).join('|');
  const [locations, setLocations] = useState<ZipCodeMapLocation[]>([]);
  const [unresolvedZipCodes, setUnresolvedZipCodes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedZipCode, setSelectedZipCode] = useState<string | null>(null);

  useEffect(() => {
    if (!zipCodeKey) {
      setLocations([]);
      setUnresolvedZipCodes([]);
      setSelectedZipCode(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const zipCodes = zipCodeKey.split('|');

    setLoading(true);
    setError(null);
    setLocations([]);
    setUnresolvedZipCodes([]);

    void fetchZipCodeMapLocations(zipCodes)
      .then((result) => {
        if (cancelled) {
          return;
        }

        setLocations(result.locations);
        setUnresolvedZipCodes(result.unresolvedZipCodes);
        setSelectedZipCode((currentZipCode) =>
          currentZipCode && result.locations.some((location) => location.zipCode === currentZipCode)
            ? currentZipCode
            : result.locations[0]?.zipCode ?? null,
        );
      })
      .catch((fetchError) => {
        if (cancelled) {
          return;
        }

        setLocations([]);
        setUnresolvedZipCodes([]);
        setSelectedZipCode(null);
        setError(formatError(fetchError));
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [zipCodeKey]);

  const locationMap = new Map(locations.map((location) => [location.zipCode, location]));
  const mappedGroups: MappedZipObservationGroup[] = zipGroups.flatMap((group) => {
    const location = locationMap.get(group.zipCode);
    return location ? [{ ...group, location }] : [];
  });
  const selectedGroup =
    mappedGroups.find((group) => group.zipCode === selectedZipCode) ?? mappedGroups[0] ?? null;
  const mappedObservationCount = mappedGroups.reduce(
    (total, group) => total + group.observations.length,
    0,
  );
  const missingZipObservationCount = observations.length - zipGroups.reduce(
    (total, group) => total + group.observations.length,
    0,
  );

  if (zipGroups.length === 0) {
    return (
      <div className="empty-state">
        <strong>No saved ZIP codes yet.</strong>
        <span>Add location notes to your plants and they will appear on the collection map.</span>
      </div>
    );
  }

  return (
    <div className="collection-map-view">
      <div className="collection-map-view__summary">
        <div className="collection-map-view__metric">
          <span>Mapped plants</span>
          <strong>{mappedObservationCount}</strong>
        </div>
        <div className="collection-map-view__metric">
          <span>ZIP locations</span>
          <strong>{mappedGroups.length}</strong>
        </div>
        <div className="collection-map-view__metric">
          <span>Without ZIP</span>
          <strong>{missingZipObservationCount}</strong>
        </div>
      </div>

      <div className="collection-map-view__layout">
        <section className="collection-map-stage" aria-label="ZIP code map">
          <div className="collection-map-stage__header">
            <div>
              <p className="eyebrow">Map View</p>
              <h3>Approximate plant locations by ZIP code</h3>
            </div>
            {loading ? <span className="collection-map-stage__status">Refreshing map...</span> : null}
          </div>

          {error ? (
            <div className="empty-state collection-map-stage__empty">
              <strong>Map lookup failed.</strong>
              <span>{error}</span>
            </div>
          ) : mappedGroups.length === 0 ? (
            <div className="empty-state collection-map-stage__empty">
              <strong>No ZIP codes could be placed yet.</strong>
              <span>Saved ZIP codes are present, but Florivu could not translate them into map points.</span>
            </div>
          ) : (
            <div className="collection-map-stage__canvas">
              <svg
                aria-hidden="true"
                className="collection-map-stage__svg"
                viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
              >
                <defs>
                  <linearGradient id="collection-map-surface" x1="0%" x2="100%" y1="0%" y2="100%">
                    <stop offset="0%" stopColor="#e4efea" stopOpacity="0.96" />
                    <stop offset="100%" stopColor="#faf6ed" stopOpacity="0.96" />
                  </linearGradient>
                  <linearGradient id="collection-map-land" x1="0%" x2="100%" y1="0%" y2="100%">
                    <stop offset="0%" stopColor="#508f6b" stopOpacity="0.28" />
                    <stop offset="100%" stopColor="#d2a963" stopOpacity="0.18" />
                  </linearGradient>
                </defs>

                <rect
                  fill="url(#collection-map-surface)"
                  height={MAP_HEIGHT}
                  rx="28"
                  width={MAP_WIDTH}
                  x="0"
                  y="0"
                />

                {Array.from({ length: 5 }).map((_, index) => {
                  const y = MAP_PADDING + (index * (MAP_HEIGHT - MAP_PADDING * 2)) / 4;
                  return (
                    <line
                      key={`horizontal-${index}`}
                      stroke="rgba(32, 76, 56, 0.08)"
                      strokeDasharray="10 10"
                      strokeWidth="2"
                      x1={MAP_PADDING}
                      x2={MAP_WIDTH - MAP_PADDING}
                      y1={y}
                      y2={y}
                    />
                  );
                })}

                {Array.from({ length: 6 }).map((_, index) => {
                  const x = MAP_PADDING + (index * (MAP_WIDTH - MAP_PADDING * 2)) / 5;
                  return (
                    <line
                      key={`vertical-${index}`}
                      stroke="rgba(32, 76, 56, 0.06)"
                      strokeDasharray="10 10"
                      strokeWidth="2"
                      x1={x}
                      x2={x}
                      y1={MAP_PADDING}
                      y2={MAP_HEIGHT - MAP_PADDING}
                    />
                  );
                })}

                <path
                  d={CONTINENTAL_US_OUTLINE}
                  fill="url(#collection-map-land)"
                  stroke="rgba(33, 74, 55, 0.14)"
                  strokeWidth="8"
                  strokeLinejoin="round"
                />

                <text
                  fill="rgba(30, 62, 48, 0.36)"
                  fontFamily="Space Grotesk, Trebuchet MS, sans-serif"
                  fontSize="20"
                  x="148"
                  y="156"
                >
                  Pacific
                </text>
                <text
                  fill="rgba(30, 62, 48, 0.3)"
                  fontFamily="Space Grotesk, Trebuchet MS, sans-serif"
                  fontSize="18"
                  x="760"
                  y="166"
                >
                  Atlantic
                </text>
                <text
                  fill="rgba(30, 62, 48, 0.34)"
                  fontFamily="Fraunces, Georgia, serif"
                  fontSize="28"
                  x="318"
                  y="238"
                >
                  United States
                </text>
              </svg>

              {mappedGroups.map((group) => {
                const position = projectLocationToMap(group.location);
                const markerSize = getMarkerSize(group.observations.length);
                const isSelected = selectedGroup?.zipCode === group.zipCode;

                return (
                  <button
                    aria-label={`${group.observations.length} plants near ZIP ${group.zipCode}`}
                    className={
                      isSelected
                        ? 'collection-map-marker collection-map-marker--active'
                        : 'collection-map-marker'
                    }
                    key={group.zipCode}
                    onClick={() => setSelectedZipCode(group.zipCode)}
                    style={{
                      height: `${markerSize}px`,
                      left: `${position.xPercent}%`,
                      top: `${position.yPercent}%`,
                      width: `${markerSize}px`,
                    }}
                    type="button"
                  >
                    <span>{group.observations.length}</span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <aside className="collection-map-sidebar" aria-label="ZIP code locations">
          <div className="collection-map-sidebar__header">
            <strong>Mapped ZIP locations</strong>
            <span>{mappedGroups.length} pinned</span>
          </div>

          <div className="collection-map-sidebar__list">
            {mappedGroups.map((group) => (
              <button
                className={
                  selectedGroup?.zipCode === group.zipCode
                    ? 'collection-map-location-card collection-map-location-card--active'
                    : 'collection-map-location-card'
                }
                key={group.zipCode}
                onClick={() => setSelectedZipCode(group.zipCode)}
                type="button"
              >
                <div className="collection-map-location-card__copy">
                  <strong>{getLocationLabel(group.location)}</strong>
                  <span>ZIP {group.zipCode}</span>
                  <span>{getLocationSubtitle(group.location)}</span>
                </div>
                <span className="collection-map-location-card__count">
                  {group.observations.length}
                </span>
              </button>
            ))}
          </div>

          {unresolvedZipCodes.length > 0 ? (
            <div className="collection-map-sidebar__note">
              <strong>Still unresolved</strong>
              <span>{unresolvedZipCodes.join(', ')}</span>
            </div>
          ) : null}
        </aside>
      </div>

      {selectedGroup ? (
        <section className="collection-map-detail" aria-label="Plants at selected ZIP code">
          <div className="collection-map-detail__header">
            <div>
              <p className="eyebrow">Selected Location</p>
              <h3>{getLocationLabel(selectedGroup.location)}</h3>
            </div>
            <span>
              ZIP {selectedGroup.zipCode} | {selectedGroup.observations.length} plants
            </span>
          </div>

          <div className="collection-map-detail__grid">
            {selectedGroup.observations.map((observation) => (
              <button
                className="collection-map-observation-card"
                key={observation.id}
                onClick={() => onSelectObservation(observation)}
                type="button"
              >
                <img
                  alt={observation.common_name}
                  className="collection-map-observation-card__image"
                  src={observation.photo_url}
                />
                <div className="collection-map-observation-card__copy">
                  <span>{observation.family}</span>
                  <strong>{observation.common_name}</strong>
                  <p>{observation.scientific_name}</p>
                </div>
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
