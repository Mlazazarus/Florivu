type FacebookLoginStatusResponse = {
  authResponse?: {
    accessToken: string;
    userID: string;
  };
  status?: string;
};

type FacebookMeResponse = {
  error?: { message?: string };
  id?: string;
  name?: string;
};

export type FacebookConnectionResult = {
  connectedAt: string;
  name: string;
  profileUrl: string;
  userId: string;
};

const FACEBOOK_SDK_SCRIPT_ID = 'facebook-jssdk';
let facebookSdkPromise: Promise<void> | null = null;

function getFacebookAppId() {
  return import.meta.env.VITE_FACEBOOK_APP_ID?.trim() || '';
}

function getFacebookApiVersion() {
  return import.meta.env.VITE_FACEBOOK_API_VERSION?.trim() || 'v22.0';
}

function createFacebookProfileUrl(userId: string) {
  return `https://www.facebook.com/profile.php?id=${encodeURIComponent(userId)}`;
}

export function isFacebookLoginConfigured() {
  return Boolean(getFacebookAppId());
}

function initializeFacebookSdk() {
  const appId = getFacebookAppId();
  if (!appId) {
    throw new Error('Facebook Login is not configured for this Florivu build.');
  }

  if (!window.FB) {
    throw new Error('Facebook Login SDK did not load.');
  }

  window.FB.init({
    appId,
    cookie: true,
    status: true,
    version: getFacebookApiVersion(),
    xfbml: false,
  });
}

export async function loadFacebookSdk() {
  if (window.FB) {
    initializeFacebookSdk();
    return;
  }

  if (facebookSdkPromise) {
    return facebookSdkPromise;
  }

  facebookSdkPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.getElementById(FACEBOOK_SDK_SCRIPT_ID) as HTMLScriptElement | null;

    window.fbAsyncInit = () => {
      try {
        initializeFacebookSdk();
        resolve();
      } catch (error) {
        reject(error);
      }
    };

    if (existingScript) {
      return;
    }

    const script = document.createElement('script');
    script.id = FACEBOOK_SDK_SCRIPT_ID;
    script.async = true;
    script.defer = true;
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    script.onerror = () => reject(new Error('Failed to load the Facebook Login SDK.'));
    document.head.appendChild(script);
  });

  return facebookSdkPromise;
}

async function loginWithFacebook(): Promise<FacebookLoginStatusResponse> {
  await loadFacebookSdk();

  return new Promise((resolve) => {
    window.FB!.login((response: FacebookLoginStatusResponse) => resolve(response), {
      scope: 'public_profile',
    });
  });
}

async function fetchFacebookProfile() {
  await loadFacebookSdk();

  return new Promise<FacebookMeResponse>((resolve) => {
    window.FB!.api('/me', { fields: 'id,name' }, (response: FacebookMeResponse) => resolve(response));
  });
}

export async function connectFacebookAccount(): Promise<FacebookConnectionResult> {
  const loginResponse = await loginWithFacebook();

  if (!loginResponse.authResponse?.userID) {
    throw new Error('Facebook Login was canceled or access was not granted.');
  }

  const profileResponse = await fetchFacebookProfile();
  const userId = profileResponse.id ?? loginResponse.authResponse.userID;
  const name = profileResponse.name?.trim() || 'Facebook user';

  if (!userId) {
    throw new Error(profileResponse.error?.message || 'Facebook Login did not return a user ID.');
  }

  return {
    connectedAt: new Date().toISOString(),
    name,
    profileUrl: createFacebookProfileUrl(userId),
    userId,
  };
}
