import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { auth } from '@/lib/auth/auth';
import { isAllowedOrigin } from '@/lib/security/sameOrigin';
import { AI_DEFAULT_MODELS } from '@/lib/ai/defaults';

function json<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
  });
}

type Provider = 'google' | 'openai' | 'anthropic';

const UpdateOrgAISettingsSchema = z
  .object({
    aiEnabled: z.boolean().optional(),
    aiProvider: z.enum(['google', 'openai', 'anthropic']).optional(),
    aiModel: z.string().min(1).max(200).optional(),
    aiGoogleKey: z.string().optional(),
    aiOpenaiKey: z.string().optional(),
    aiAnthropicKey: z.string().optional(),
  })
  .strict();

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return json({ error: 'Unauthorized' }, 401);

  const profile = await prisma.profile.findUnique({
    where: { id: session.user.id },
    select: { organizationId: true, role: true },
  });

  if (!profile?.organizationId) return json({ error: 'Profile not found' }, 404);

  const orgSettings = await prisma.organizationSettings.findUnique({
    where: { organizationId: profile.organizationId },
  });

  const aiEnabled = typeof orgSettings?.aiEnabled === 'boolean' ? orgSettings.aiEnabled : true;

  if (profile.role !== 'admin') {
    return json({
      aiEnabled,
      aiProvider: (orgSettings?.aiProvider || 'google') as Provider,
      aiModel: orgSettings?.aiModel || AI_DEFAULT_MODELS.google,
      aiGoogleKey: '',
      aiOpenaiKey: '',
      aiAnthropicKey: '',
      aiHasGoogleKey: Boolean(orgSettings?.aiGoogleKey),
      aiHasOpenaiKey: Boolean(orgSettings?.aiOpenaiKey),
      aiHasAnthropicKey: Boolean(orgSettings?.aiAnthropicKey),
    });
  }

  return json({
    aiEnabled,
    aiProvider: (orgSettings?.aiProvider || 'google') as Provider,
    aiModel: orgSettings?.aiModel || AI_DEFAULT_MODELS.google,
    aiGoogleKey: orgSettings?.aiGoogleKey || '',
    aiOpenaiKey: orgSettings?.aiOpenaiKey || '',
    aiAnthropicKey: orgSettings?.aiAnthropicKey || '',
    aiHasGoogleKey: Boolean(orgSettings?.aiGoogleKey),
    aiHasOpenaiKey: Boolean(orgSettings?.aiOpenaiKey),
    aiHasAnthropicKey: Boolean(orgSettings?.aiAnthropicKey),
  });
}

export async function POST(req: Request) {
  if (!isAllowedOrigin(req)) return json({ error: 'Forbidden' }, 403);

  const session = await auth();
  if (!session?.user?.id) return json({ error: 'Unauthorized' }, 401);

  const profile = await prisma.profile.findUnique({
    where: { id: session.user.id },
    select: { organizationId: true, role: true },
  });

  if (!profile?.organizationId) return json({ error: 'Profile not found' }, 404);
  if (profile.role !== 'admin') return json({ error: 'Forbidden' }, 403);

  const rawBody = await req.json().catch(() => null);
  const parsed = UpdateOrgAISettingsSchema.safeParse(rawBody);
  if (!parsed.success) {
    return json({ error: 'Invalid payload', details: parsed.error.flatten() }, 400);
  }

  const updates = parsed.data;

  const normalizeKey = (value: string | undefined) => {
    if (value === undefined) return undefined;
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  };

  const dbUpdates: any = {};

  if (updates.aiEnabled !== undefined) dbUpdates.aiEnabled = updates.aiEnabled;
  if (updates.aiProvider !== undefined) dbUpdates.aiProvider = updates.aiProvider;
  if (updates.aiModel !== undefined) dbUpdates.aiModel = updates.aiModel;

  const googleKey = normalizeKey(updates.aiGoogleKey);
  if (googleKey !== undefined) dbUpdates.aiGoogleKey = googleKey;

  const openaiKey = normalizeKey(updates.aiOpenaiKey);
  if (openaiKey !== undefined) dbUpdates.aiOpenaiKey = openaiKey;

  const anthropicKey = normalizeKey(updates.aiAnthropicKey);
  if (anthropicKey !== undefined) dbUpdates.aiAnthropicKey = anthropicKey;

  try {
    await prisma.organizationSettings.upsert({
      where: { organizationId: profile.organizationId },
      create: {
        organizationId: profile.organizationId,
        ...dbUpdates,
      },
      update: dbUpdates,
    });
  } catch (err: any) {
    return json({ error: err.message }, 500);
  }

  return json({ ok: true });
}
