import {
  errorResponse,
  getEnvValue,
  type AppEnv,
  type PagesFunctionContext,
} from '../../_shared/runtime';

export async function onRequestPost({
  env,
  request,
}: PagesFunctionContext<AppEnv>) {
  const apiKey = getEnvValue(
    env,
    'PLANTNET_API_KEY',
    'EXPO_PUBLIC_PLANTNET_API_KEY',
    'VITE_PLANTNET_API_KEY',
  );

  if (!apiKey) {
    return errorResponse(500, 'PLANTNET_API_KEY is not configured on the server.');
  }

  try {
    const formData = await request.formData();
    const image = formData.get('image');
    const organ = String(formData.get('organ') ?? 'auto');

    if (!(image instanceof File)) {
      return errorResponse(400, 'Missing image file upload.');
    }

    const upstreamUrl = new URL('https://my-api.plantnet.org/v2/identify/all');
    upstreamUrl.searchParams.set('api-key', apiKey);
    upstreamUrl.searchParams.set('nb-results', '5');
    upstreamUrl.searchParams.set('lang', 'en');
    upstreamUrl.searchParams.set('include-related-images', 'false');

    const upstreamBody = new FormData();
    upstreamBody.set('organs', organ);
    upstreamBody.append('images', image, image.name);

    const upstreamResponse = await fetch(upstreamUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
      },
      body: upstreamBody,
    });
    const bodyText = await upstreamResponse.text();

    return new Response(bodyText, {
      status: upstreamResponse.status,
      headers: {
        'Content-Type': upstreamResponse.headers.get('Content-Type') ?? 'application/json',
      },
    });
  } catch (error) {
    return errorResponse(
      504,
      error instanceof Error ? error.message : 'Unexpected proxy failure.',
    );
  }
}
