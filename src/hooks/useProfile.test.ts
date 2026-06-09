import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/supabase', () => ({
  supabase: {},
}));

import { buildProfileForSave, SaveProfileInput } from './useProfile';
import { UserProfile } from '../types';

function createProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    user_id: 'user-1',
    display_name: 'Myles',
    account_tier: 'free',
    profile_photo_url: 'https://example.com/profile.jpg',
    home_zip_code: '92121',
    marketplace_zip_code: '92037',
    facebook_url: 'https://facebook.com/florivu',
    facebook_user_id: 'fb-user',
    facebook_name: 'Florivu Tester',
    facebook_connected_at: '2026-06-01T00:00:00.000Z',
    earned_achievement_ids: ['seed-spreader'],
    referred_by_user_id: 'friend-1',
    selected_avatar_border_id: 'light-green-border',
    selected_profile_title_id: 'propagator',
    featured_house_plant_observation_id: 'house-1',
    featured_non_house_plant_observation_id: 'outdoor-1',
    care_alerts_enabled: true,
    care_alert_email: 'florivu@laztronics.com',
    care_alert_timezone: 'America/Los_Angeles',
    care_alert_last_sent_at: '2026-06-06T00:00:00.000Z',
    is_public: true,
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-06T00:00:00.000Z',
    ...overrides,
  };
}

describe('buildProfileForSave', () => {
  it('preserves existing optional choices when the save input omits them', () => {
    const existingProfile = createProfile();
    const input: SaveProfileInput = {
      display_name: 'Updated Myles',
      is_public: false,
    };

    const nextProfile = buildProfileForSave({
      existingProfile,
      input,
      userId: existingProfile.user_id,
      userEmail: 'florivu@laztronics.com',
      now: '2026-06-07T20:00:00.000Z',
    });

    expect(nextProfile.display_name).toBe('Updated Myles');
    expect(nextProfile.profile_photo_url).toBe(existingProfile.profile_photo_url);
    expect(nextProfile.marketplace_zip_code).toBe(existingProfile.marketplace_zip_code);
    expect(nextProfile.selected_avatar_border_id).toBe(existingProfile.selected_avatar_border_id);
    expect(nextProfile.selected_profile_title_id).toBe(existingProfile.selected_profile_title_id);
    expect(nextProfile.facebook_url).toBe(existingProfile.facebook_url);
    expect(nextProfile.updated_at).toBe('2026-06-07T20:00:00.000Z');
  });

  it('clears a field only when the caller explicitly sends null or blank', () => {
    const existingProfile = createProfile();
    const input: SaveProfileInput = {
      display_name: existingProfile.display_name,
      profile_photo_url: null,
      home_zip_code: '',
      marketplace_zip_code: '',
      facebook_url: '',
      facebook_user_id: '',
      facebook_name: '',
      facebook_connected_at: '',
      selected_avatar_border_id: null,
      selected_profile_title_id: null,
      is_public: existingProfile.is_public,
    };

    const nextProfile = buildProfileForSave({
      existingProfile,
      input,
      userId: existingProfile.user_id,
      userEmail: 'florivu@laztronics.com',
      now: '2026-06-07T20:00:00.000Z',
    });

    expect(nextProfile.profile_photo_url).toBeNull();
    expect(nextProfile.home_zip_code).toBeNull();
    expect(nextProfile.marketplace_zip_code).toBeNull();
    expect(nextProfile.facebook_url).toBeNull();
    expect(nextProfile.facebook_user_id).toBeNull();
    expect(nextProfile.facebook_name).toBeNull();
    expect(nextProfile.facebook_connected_at).toBeNull();
    expect(nextProfile.selected_avatar_border_id).toBeNull();
    expect(nextProfile.selected_profile_title_id).toBeNull();
  });
});
