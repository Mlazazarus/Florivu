/// <reference types="vite/client" />

interface FacebookInitOptions {
  appId: string;
  cookie?: boolean;
  status?: boolean;
  version: string;
  xfbml?: boolean;
}

interface FacebookLoginStatusResponse {
  authResponse?: {
    accessToken: string;
    userID: string;
  };
  status?: string;
}

interface FacebookApiResponse {
  error?: { message?: string };
  id?: string;
  name?: string;
}

interface FacebookSdk {
  init(options: FacebookInitOptions): void;
  login(
    callback: (response: FacebookLoginStatusResponse) => void,
    options?: { scope?: string },
  ): void;
  api(
    path: string,
    params: Record<string, string>,
    callback: (response: FacebookApiResponse) => void,
  ): void;
}

interface Window {
  FB?: FacebookSdk;
  fbAsyncInit?: () => void;
}

interface ImportMetaEnv {
  readonly VITE_FACEBOOK_APP_ID?: string;
  readonly VITE_FACEBOOK_API_VERSION?: string;
  readonly VITE_PUBLIC_APP_URL?: string;
}
