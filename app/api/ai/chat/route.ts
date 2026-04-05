// Route Handler for AI Chat - /api/ai/chat
// Full integration with AI SDK v6 ToolLoopAgent + createAgentUIStreamResponse

import { createAgentUIStreamResponse, UIMessage } from 'ai';
import { createCRMAgent } from '@/lib/ai/crmAgent';
import { prisma } from '@/lib/db/prisma';
import { auth } from '@/lib/auth/auth';
import { AI_DEFAULT_MODELS } from '@/lib/ai/defaults';
import type { CRMCallOptions } from '@/types/ai';
import { isAllowedOrigin } from '@/lib/security/sameOrigin';
import { isAIFeatureEnabled } from '@/lib/ai/features/server';

export const maxDuration = 60;

type AIProvider = 'google' | 'openai' | 'anthropic';

function asOptionalString(v: unknown): string | undefined {
    return typeof v === 'string' ? v : undefined;
}

function asOptionalNumber(v: unknown): number | undefined {
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function asOptionalStages(
    v: unknown
): Array<{ id: string; name: string }> | undefined {
    if (!Array.isArray(v)) return undefined;

    const stages: Array<{ id: string; name: string }> = [];
    for (const item of v) {
        const maybe = item as any;
        if (typeof maybe?.id === 'string' && typeof maybe?.name === 'string') {
            stages.push({ id: maybe.id, name: maybe.name });
        }
    }

    return stages.length ? stages : undefined;
}

function asOptionalCockpitSnapshot(v: unknown): unknown | undefined {
    if (v == null) return undefined;
    if (typeof v !== 'object') return undefined;

    try {
        const text = JSON.stringify(v);
        if (text.length > 80_000) {
            console.warn('[AI Chat] cockpitSnapshot too large; ignoring.', {
                bytes: text.length,
            });
            return undefined;
        }
    } catch {
        return undefined;
    }

    return v;
}

export async function POST(req: Request) {
    if (!isAllowedOrigin(req)) {
        return new Response('Forbidden', { status: 403 });
    }

    // 0. Parse request body early
    const body = await req.json().catch(() => null);
    const messages: UIMessage[] = (body?.messages ?? []) as UIMessage[];
    const rawContext = (body?.context ?? {}) as Record<string, unknown>;

    // 1. Auth check
    const session = await auth();
    if (!session?.user?.id) {
        return new Response('Unauthorized', { status: 401 });
    }
    const user = session.user;

    // 2. Get profile with organization + role (RBAC)
    const profile = await prisma.profile.findUnique({
        where: { id: user.id },
        select: { organizationId: true, firstName: true, nickname: true, role: true },
    });

    let organizationId = profile?.organizationId ?? null;
    if (!organizationId) {
        const boardId = typeof rawContext?.boardId === 'string' ? rawContext.boardId : null;
        if (boardId) {
            const board = await prisma.board.findUnique({
                where: { id: boardId },
                select: { organizationId: true },
            });

            if (board?.organizationId) {
                organizationId = board.organizationId;

                // Best-effort: backfill profile
                await prisma.profile.update({
                    where: { id: user.id },
                    data: { organizationId },
                }).catch(() => {});
            }
        }
    }

    if (!organizationId) {
        return new Response(
            'Profile sem organização. Finalize o setup (ou re-login) para vincular seu usuário a uma organização antes de usar a IA.',
            { status: 409 }
        );
    }

    // 3. Get AI settings
    const orgSettings = await prisma.organizationSettings.findUnique({
        where: { organizationId },
    });

    const aiEnabled = typeof orgSettings?.aiEnabled === 'boolean' ? orgSettings.aiEnabled : true;
    if (!aiEnabled) {
        return new Response(
            'IA desativada pela organização. Um admin pode ativar em Configurações → Central de I.A.',
            { status: 403 }
        );
    }

    const chatEnabled = await isAIFeatureEnabled(organizationId, 'ai_chat_agent');
    if (!chatEnabled) {
        return new Response(
            'Função de IA desativada: Chat do agente (Pilot).',
            { status: 403 }
        );
    }

    const provider = (orgSettings?.aiProvider ?? 'google') as AIProvider;
    const modelId: string | null = orgSettings?.aiModel ?? null;

    const apiKey: string | null =
        provider === 'google'
            ? (orgSettings?.aiGoogleKey ?? null)
            : provider === 'openai'
                ? (orgSettings?.aiOpenaiKey ?? null)
                : (orgSettings?.aiAnthropicKey ?? null);

    if (!apiKey) {
        const providerLabel = provider === 'google' ? 'Google Gemini' : provider === 'openai' ? 'OpenAI' : 'Anthropic';
        return new Response(
            `API key não configurada para ${providerLabel}. Configure em Configurações → Inteligência Artificial.`,
            { status: 400 }
        );
    }

    const resolvedModelId =
        modelId || AI_DEFAULT_MODELS[provider as keyof typeof AI_DEFAULT_MODELS] || AI_DEFAULT_MODELS.google;

    // 5. Build type-safe context for agent
    const context: CRMCallOptions = {
        organizationId,
        boardId: asOptionalString(rawContext.boardId),
        dealId: asOptionalString(rawContext.dealId),
        contactId: asOptionalString(rawContext.contactId),
        boardName: asOptionalString(rawContext.boardName),
        stages: asOptionalStages(rawContext.stages),
        dealCount: asOptionalNumber(rawContext.dealCount),
        pipelineValue: asOptionalNumber(rawContext.pipelineValue),
        stagnantDeals: asOptionalNumber(rawContext.stagnantDeals),
        overdueDeals: asOptionalNumber(rawContext.overdueDeals),
        wonStage: asOptionalString(rawContext.wonStage),
        lostStage: asOptionalString(rawContext.lostStage),
        cockpitSnapshot: asOptionalCockpitSnapshot((rawContext as any)?.cockpitSnapshot),
        userId: user.id,
        userName: profile?.nickname || profile?.firstName || user.email || undefined,
        userRole: (profile as any)?.role,
    };

    const rawContextSummary = {
        ...rawContext,
        cockpitSnapshot: (rawContext as any)?.cockpitSnapshot ? '[provided]' : undefined,
    };

    console.log('[AI Chat] Request received:', {
        messagesCount: messages?.length,
        rawContext: rawContextSummary,
        context: {
            organizationId: context.organizationId,
            boardId: context.boardId,
            dealId: context.dealId,
            boardName: context.boardName,
            stagesCount: context.stages?.length,
            cockpitSnapshot: context.cockpitSnapshot ? '[provided]' : undefined,
            userName: context.userName,
        },
        ai: {
            provider,
            modelId: resolvedModelId,
        },
    });

    // 6. Create agent with API key and context
    let agent: Awaited<ReturnType<typeof createCRMAgent>>;
    try {
        agent = await createCRMAgent(context, user.id, apiKey, resolvedModelId, provider);
    } catch (err: any) {
        const message = String(err?.message || err || 'Erro desconhecido');
        console.warn('[AI Chat] Failed to create agent/model:', { provider, modelId: resolvedModelId, message });
        return new Response(
            `Falha ao inicializar o modelo de IA (${provider} / ${resolvedModelId}). Verifique o provedor, o modelo selecionado e a chave de API.\n\nDetalhes: ${message}`,
            { status: 400 }
        );
    }

    // 7. Return streaming response using AI SDK v6 createAgentUIStreamResponse
    return createAgentUIStreamResponse<CRMCallOptions>({
        agent,
        uiMessages: messages,
        options: context,
    });
}
