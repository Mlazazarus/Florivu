import { describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({
  supabase: {},
}));

import { mergeRecoveredProfile } from './localFallbackRecovery';
import { UserProfile } from '../types';

function createProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    user_id: 'user-1',
    display_name: 'Myles',
    account_tier: 'free',
    profile_photo_url: null,
    home_zip_code: null,
    marketplace_zip_code: null,
    facebook_url: null,
    facebook_user_id: null,
    facebook_name: null,
    facebook_connected_at: null,
    earned_achievement_ids: [],
    referred_by_user_id: null,
    selected_avatar_border_id: null,
    selected_profile_title_id: null,
    featured_house_plant_observation_id: null,
    featured_non_house_plant_observation_id: null,
    care_alerts_enabled: false,
    care_alert_email: 'florivu@laztronics.com',
    care_alert_timezone: 'America/Los_Angeles',
    care_alert_last_sent_at: null,
    is_public: false,
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('mergeRecoveredProfile', () => {
  it('preserves remote user choices when the local recovery snapshot is newer but blank', () => {
    const remoteProfile = createProfile({
      profile_photo_url: 'https://example.com/profile.jpg',
      marketplace_zip_code: '92037',
      earned_achievement_ids: ['seed-spreader'],
      selected_avatar_border_id: 'light-green-border',
      selected_profile_title_id: 'propagator',
      updated_at: '2026-06-07T18:00:00.000Z',
    });
    const localProfile = createProfile({
      updated_at: '2026-06-07T19:00:00.000Z',
    });

    const mergedProfile = mergeRecoveredProfile(
      remoteProfile,
      localProfile,
      remoteProfile.user_id,
      'florivu@laztronics.com',
    );

    expect(mergedProfile.profile_photo_url).toBe(remoteProfile.profile_photo_url);
    expect(mergedProfile.marketplace_zip_code).toBe(remoteProfile.marketplace_zip_code);
    expect(mergedProfile.selected_avatar_border_id).toBe(remoteProfile.selected_avatar_border_id);
    expect(mergedProfile.selected_profile_title_id).toBe(remoteProfile.selected_profile_title_id);
    expect(mergedProfile.earned_achievement_ids).toEqual(remoteProfile.earned_achievement_ids);
  });

  it('recovers local choices when the remote profile is still the default shell', () => {
    const remoteProfile = createProfile({
      display_name: 'florivu-abcdef',
      updated_at: '2026-06-07T17:00:00.000Z',
    });
    const localProfile = createProfile({
      profile_photo_url: 'https://example.com/local-profile.jpg',
      marketplace_zip_code: '92121',
      selected_avatar_border_id: 'light-green-border',
      selected_profile_title_id: 'propagator',
      earned_achievement_ids: ['seed-spreader'],
      updated_at: '2026-06-07T18:00:00.000Z',
    });

    const mergedProfile = mergeRecoveredProfile(
      remoteProfile,
      localProfile,
      remoteProfile.user_id,
      'florivu@laztronics.com',
    );

    expect(mergedProfile.profile_photo_url).toBe(localProfile.profile_photo_url);
    expect(mergedProfile.marketplace_zip_code).toBe(localProfile.marketplace_zip_code);
    expect(mergedProfile.selected_avatar_border_id).toBe(localProfile.selected_avatar_border_id);
    expect(mergedProfile.selected_profile_title_id).toBe(localProfile.selected_profile_title_id);
    expect(mergedProfile.earned_achievement_ids).toEqual(localProfile.earned_achievement_ids);
  });
});
