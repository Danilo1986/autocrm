import 'server-only';

import { prisma } from '@/lib/db/prisma';
import { auth } from '@/lib/auth/auth';
import { isAllowedOrigin } from '@/lib/security/sameOrigin';
import { getModel, type AIProvider } from '@/lib/ai/config';

export type AITaskContext = {
  userId: string;
  organizationId: string;
  provider: AIProvider;
  modelId: string;
  apiKey: string;
  model: ReturnType<typeof getModel>;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export class AITaskHttpError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }

  toResponse() {
    return json({ error: { code: this.code, message: this.message } }, this.status);
  }
}

export async function requireAITaskContext(req: Request): Promise<AITaskContext> {
  if (!isAllowedOrigin(req)) {
    throw new AITaskHttpError(403, 'FORBIDDEN', 'Forbidden');
  }

  const session = await auth();
  if (!session?.user?.id) {
    throw new AITaskHttpError(401, 'UNAUTHORIZED', 'Unauthorized');
  }

  const profile = await prisma.profile.findUnique({
    where: { id: session.user.id },
    select: { organizationId: true },
  });

  if (!profile?.organizationId) {
    throw new AITaskHttpError(404, 'PROFILE_NOT_FOUND', 'Profile not found');
  }

  const organizationId = profile.organizationId as string;

  const orgSettings = await prisma.organizationSettings.findUnique({
    where: { organizationId },
  });

  const aiEnabled = typeof orgSettings?.aiEnabled === 'boolean' ? orgSettings.aiEnabled : true;
  if (!aiEnabled) {
    throw new AITaskHttpError(403, 'AI_DISABLED', 'IA desativada pela organização. Um admin pode ativar em Configurações → Central de I.A.');
  }

  const provider: AIProvider = (orgSettings?.aiProvider ?? 'google') as AIProvider;

  const apiKey: string | null =
    provider === 'google'
      ? (orgSettings?.aiGoogleKey ?? null)
      : provider === 'openai'
        ? (orgSettings?.aiOpenaiKey ?? null)
        : (orgSettings?.aiAnthropicKey ?? null);

  if (!apiKey) {
    const providerLabel = provider === 'google' ? 'Google Gemini' : provider === 'openai' ? 'OpenAI' : 'Anthropic';
    throw new AITaskHttpError(
      400,
      'AI_KEY_NOT_CONFIGURED',
      `API key não configurada para ${providerLabel}. Configure em Configurações → Inteligência Artificial.`
    );
  }

  const modelId = orgSettings?.aiModel || '';
  const model = getModel(provider, apiKey, modelId);

  return {
    userId: session.user.id,
    organizationId,
    provider,
    modelId,
    apiKey,
    model,
  };
}
