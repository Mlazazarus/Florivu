import {
  createSupabaseAdminClient,
  errorResponse,
  jsonResponse,
  requireAuthenticatedUser,
  type AppEnv,
  type PagesFunctionContext,
} from '../../_shared/runtime';

export async function onRequestPost(
  context: PagesFunctionContext<AppEnv>,
) {
  const auth = await requireAuthenticatedUser(context);
  if ('response' in auth) {
    return auth.response;
  }

  try {
    const body = (await context.request.json()) as { userId?: unknown };
    const userId = typeof body.userId === 'string' ? body.userId : '';

    if (!userId) {
      return errorResponse(400, 'userId is required.');
    }

    if (auth.user.id !== userId) {
      return errorResponse(403, 'You can only delete your own account.');
    }

    const adminClient = createSupabaseAdminClient(context.env);
    if (!adminClient) {
      return errorResponse(
        501,
        'Account deletion requires SUPABASE_SERVICE_ROLE_KEY on the server.',
      );
    }

    const { error } = await adminClient.auth.admin.deleteUser(userId);
    if (error) {
      return errorResponse(500, error.message);
    }

    return jsonResponse({ ok: true });
  } catch (error) {
    return errorResponse(
      500,
      error instanceof Error ? error.message : 'Unexpected account deletion failure.',
    );
  }
}
