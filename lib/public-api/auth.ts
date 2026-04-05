import { apiKeysService } from '@/lib/services/apiKeys'

export type PublicApiAuthResult =
  | { ok: true; organizationId: string; organizationName: string; apiKeyId: string; apiKeyPrefix: string }
  | { ok: false; status: number; body: { error: string; code?: string } };

export async function authPublicApi(request: Request): Promise<PublicApiAuthResult> {
  const token = request.headers.get('x-api-key') || '';
  if (!token.trim()) {
    return { ok: false, status: 401, body: { error: 'Missing X-Api-Key', code: 'AUTH_MISSING' } };
  }

  const { data, error } = await apiKeysService.validate(token);

  if (error || !data) {
    return { ok: false, status: 401, body: { error: 'Invalid API key', code: 'AUTH_INVALID' } };
  }

  return {
    ok: true,
    apiKeyId: data.apiKeyId,
    apiKeyPrefix: data.apiKeyPrefix,
    organizationId: data.organizationId,
    organizationName: data.organizationName,
  };
}
