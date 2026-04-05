// Route Handler for AI "actions" (RPC-style helpers)

import { generateObject, generateText } from 'ai';
import { getModel, type AIProvider } from '@/lib/ai/config';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { auth } from '@/lib/auth/auth';
import { isAllowedOrigin } from '@/lib/security/sameOrigin';
import { getResolvedPrompt } from '@/lib/ai/prompts/server';
import { renderPromptTemplate } from '@/lib/ai/prompts/render';
import { isAIFeatureEnabled } from '@/lib/ai/features/server';

export const maxDuration = 60;

type AIActionResponse<T = unknown> = {
  result?: T;
  error?: string;
  consentType?: string;
  retryAfter?: number;
};

type AIAction =
  | 'analyzeLead'
  | 'generateEmailDraft'
  | 'rewriteMessageDraft'
  | 'generateObjectionResponse'
  | 'generateDailyBriefing'
  | 'generateRescueMessage'
  | 'parseNaturalLanguageAction'
  | 'chatWithCRM'
  | 'generateBirthdayMessage'
  | 'generateBoardStructure'
  | 'generateBoardStrategy'
  | 'refineBoardWithAI'
  | 'chatWithBoardAgent'
  | 'generateSalesScript';

const AnalyzeLeadSchema = z.object({
  action: z.string().max(50).describe('Ação curta e direta, máximo 50 caracteres.'),
  reason: z.string().max(80).describe('Razão breve, máximo 80 caracteres.'),
  actionType: z.enum(['CALL', 'MEETING', 'EMAIL', 'TASK', 'WHATSAPP']).describe('Tipo de ação sugerida'),
  urgency: z.enum(['low', 'medium', 'high']).describe('Urgência da ação'),
  probabilityScore: z.number().min(0).max(100).describe('Score de probabilidade (0-100)'),
});

const BoardStructureSchema = z.object({
  boardName: z.string().describe('Nome do board em português'),
  description: z.string().describe('Descrição do propósito do board'),
  stages: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      color: z.string().describe('Classe Tailwind CSS, ex: bg-blue-500'),
      linkedLifecycleStage: z.string().describe('ID do lifecycle stage: LEAD, MQL, PROSPECT, CUSTOMER ou OTHER'),
      estimatedDuration: z.string().optional(),
    })
  ),
  automationSuggestions: z.array(z.string()),
});

const BoardStrategySchema = z.object({
  goal: z.object({
    description: z.string(),
    kpi: z.string(),
    targetValue: z.string(),
  }),
  agentPersona: z.object({
    name: z.string(),
    role: z.string(),
    behavior: z.string(),
  }),
  entryTrigger: z.string(),
});

const RefineBoardSchema = z.object({
  message: z.string().describe('Resposta conversacional explicando mudanças'),
  board: BoardStructureSchema.nullable().describe('Board modificado ou null se apenas pergunta'),
});

const ObjectionResponseSchema = z.array(z.string()).describe('3 respostas diferentes para contornar objeção');

const ParsedActionSchema = z.object({
  title: z.string(),
  type: z.enum(['CALL', 'MEETING', 'EMAIL', 'TASK']),
  date: z.string().optional(),
  contactName: z.string().optional(),
  companyName: z.string().optional(),
  confidence: z.number().min(0).max(1),
});

const RewriteMessageDraftSchema = z.object({
  subject: z
    .string()
    .max(120)
    .optional()
    .describe('Assunto do email (somente para canal EMAIL).'),
  message: z
    .string()
    .max(1600)
    .describe('Mensagem final para enviar no canal escolhido.'),
});

function safeContextText(v: unknown, maxBytes = 80_000): string {
  if (v == null) return '';
  try {
    const text = typeof v === 'string' ? v : JSON.stringify(v);
    if (text.length <= maxBytes) return text;
    return text.slice(0, maxBytes) + '\n... [TRUNCADO]';
  } catch {
    return '';
  }
}

function json<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
  });
}

export async function POST(req: Request) {
  if (!isAllowedOrigin(req)) {
    return json<AIActionResponse>({ error: 'Forbidden' }, 403);
  }

  const session = await auth();
  if (!session?.user?.id) {
    return json<AIActionResponse>({ error: 'Unauthorized' }, 401);
  }
  const user = session.user;

  const body = await req.json().catch(() => null);
  const action = body?.action as AIAction | undefined;
  const data = (body?.data ?? {}) as Record<string, unknown>;

  if (!action) {
    return json<AIActionResponse>({ error: "Invalid request format. Missing 'action'." }, 400);
  }

  const profile = await prisma.profile.findUnique({
    where: { id: user.id },
    select: { organizationId: true },
  });

  if (!profile?.organizationId) {
    return json<AIActionResponse>({ error: 'Profile not found' }, 404);
  }

  const orgSettings = await prisma.organizationSettings.findUnique({
    where: { organizationId: profile.organizationId },
  });

  const aiEnabled = typeof orgSettings?.aiEnabled === 'boolean' ? orgSettings.aiEnabled : true;
  if (!aiEnabled) {
    return json<AIActionResponse>(
      { error: 'IA desativada pela organização. Um admin pode ativar em Configurações → Central de I.A.' },
      403
    );
  }

  // Feature flag per action
  const featureKeyByAction: Partial<Record<AIAction, string>> = {
    analyzeLead: 'ai_deal_analyze',
    generateEmailDraft: 'ai_email_draft',
    generateObjectionResponse: 'ai_objection_responses',
    generateDailyBriefing: 'ai_daily_briefing',
    generateSalesScript: 'ai_sales_script',
    generateBoardStructure: 'ai_board_generate_structure',
    generateBoardStrategy: 'ai_board_generate_strategy',
    refineBoardWithAI: 'ai_board_refine',
    chatWithBoardAgent: 'ai_chat_agent',
    chatWithCRM: 'ai_chat_agent',
    rewriteMessageDraft: 'ai_email_draft',
  };

  const featureKey = featureKeyByAction[action];
  if (featureKey) {
    const enabled = await isAIFeatureEnabled(null as any, profile.organizationId as any, featureKey);
    if (!enabled) {
      return json<AIActionResponse>(
        { error: `Função de IA desativada para esta ação (${action}).` },
        403
      );
    }
  }

  const provider: AIProvider = (orgSettings?.aiProvider ?? 'google') as AIProvider;
  const apiKey: string | null =
    provider === 'google'
      ? (orgSettings?.aiGoogleKey ?? null)
      : provider === 'openai'
        ? (orgSettings?.aiOpenaiKey ?? null)
        : (orgSettings?.aiAnthropicKey ?? null);

  if (!apiKey) {
    return json<AIActionResponse>({ error: 'AI consent required', consentType: 'AI_CONSENT' }, 200);
  }

  const modelId = orgSettings?.aiModel || '';
  const model = getModel(provider, apiKey, modelId);

  // Helper for getResolvedPrompt - pass null as supabase since it should use prisma internally
  const orgId = profile.organizationId as string;

  try {
    switch (action) {
      case 'analyzeLead': {
        const { deal, stageLabel } = data as any;
        const resolved = await getResolvedPrompt(null as any, orgId as any, 'task_deals_analyze');
        const prompt = renderPromptTemplate(resolved?.content || '', {
          dealTitle: deal?.title || '',
          dealValue: deal?.value?.toLocaleString?.('pt-BR') ?? deal?.value ?? 0,
          stageLabel: stageLabel || deal?.status || '',
          probability: deal?.probability || 50,
        });
        const result = await generateObject({ model, maxRetries: 3, schema: AnalyzeLeadSchema, prompt });
        return json<AIActionResponse>({ result: result.object });
      }

      case 'generateEmailDraft': {
        const { deal } = data as any;
        const resolved = await getResolvedPrompt(null as any, orgId as any, 'task_deals_email_draft');
        const prompt = renderPromptTemplate(resolved?.content || '', {
          contactName: deal?.contactName || 'Cliente',
          companyName: deal?.companyName || 'Empresa',
          dealTitle: deal?.title || '',
        });
        const result = await generateText({ model, maxRetries: 3, prompt });
        return json<AIActionResponse>({ result: result.text });
      }

      case 'rewriteMessageDraft': {
        const { channel, currentSubject, currentMessage, nextBestAction, cockpitSnapshot } = data as any;
        const channelLabel = channel === 'EMAIL' ? 'EMAIL' : 'WHATSAPP';
        const snapshotText = safeContextText(cockpitSnapshot);
        const nbaText = safeContextText(nextBestAction);

        const result = await generateObject({
          model, maxRetries: 3, schema: RewriteMessageDraftSchema,
          prompt: `Você é um vendedor sênior e copywriter.
Sua tarefa é REESCREVER (melhorar) uma mensagem para enviar ao cliente.

CANAL: ${channelLabel}

RASCUNHO ATUAL:
- subject (se houver): ${String(currentSubject ?? '')}
- message: ${String(currentMessage ?? '')}

PRÓXIMA AÇÃO (sugestão/NBA):
${nbaText || '[não fornecida]'}

CONTEXTO COMPLETO (cockpitSnapshot):
${snapshotText || '[não fornecido]'}

REGRAS:
1) Português do Brasil, natural e humano. Evite jargão e evite rótulos tipo "Contexto:"/"Sobre:".
2) Use o contexto para personalizar (nome, deal, etapa, próximos passos), mas NÃO invente fatos.
3) Para WHATSAPP: curto, direto e MUITO legível no WhatsApp. Use quebras de linha (parágrafos) e, quando houver opções, use lista com marcadores no formato "- item" (hífen + espaço). Evite parágrafos longos. 3–10 linhas.
4) Para EMAIL: devolva subject + body (message = body). Aplique boas práticas de email de vendas/CRM:
   - Assunto curto e específico (<= 80), sem ALL CAPS e sem "RE:" falso.
   - Corpo SEMPRE bem escaneável: parágrafos curtos (1–2 frases), com linhas em branco entre blocos.
   - Estrutura sugerida (adapte ao contexto):
     a) Saudação breve (use o nome se tiver certeza).
     b) 1 frase de contexto (por que está falando agora).
     c) 1–2 bullets com valor/objetivo ou próximos passos (use "- ").
     d) CTA claro e simples (uma pergunta) e, se houver opções de agenda, liste em bullets ("- segunda 10h", "- terça 15h").
     e) Fechamento curto (ex.: "Obrigado!"), sem assinatura com dados pessoais.
   - Evite bloco único de texto: NÃO devolva tudo em um parágrafo.
   - Tamanho: 6–16 linhas no total (incluindo linhas em branco).
5) Não inclua placeholders (tipo "[nome]") e não inclua assinatura com dados pessoais.

Retorne APENAS no formato do schema (subject opcional, message obrigatório).`,
        });
        return json<AIActionResponse>({ result: result.object });
      }

      case 'generateRescueMessage': {
        const { deal, channel } = data as any;
        const result = await generateText({
          model, maxRetries: 3,
          prompt: `Gere uma mensagem de resgate/follow-up para reativar um deal parado.
DEAL: ${deal?.title} (${deal?.contactName || ''})
CANAL: ${channel}
Responda em português do Brasil.`,
        });
        return json<AIActionResponse>({ result: result.text });
      }

      case 'generateBoardStructure': {
        const { description, lifecycleStages } = data as any;
        const lifecycleList = Array.isArray(lifecycleStages) && lifecycleStages.length > 0
          ? lifecycleStages.map((s: any) => ({ id: s?.id || '', name: s?.name || String(s) }))
          : [
              { id: 'LEAD', name: 'Lead' }, { id: 'MQL', name: 'MQL' },
              { id: 'PROSPECT', name: 'Oportunidade' }, { id: 'CUSTOMER', name: 'Cliente' },
              { id: 'OTHER', name: 'Outros' },
            ];
        const resolved = await getResolvedPrompt(null as any, orgId as any, 'task_boards_generate_structure');
        const prompt = renderPromptTemplate(resolved?.content || '', { description, lifecycleJson: JSON.stringify(lifecycleList) });
        const result = await generateObject({ model, maxRetries: 3, schema: BoardStructureSchema, prompt });
        return json<AIActionResponse>({ result: result.object });
      }

      case 'generateBoardStrategy': {
        const { boardData } = data as any;
        const resolved = await getResolvedPrompt(null as any, orgId as any, 'task_boards_generate_strategy');
        const prompt = renderPromptTemplate(resolved?.content || '', { boardName: boardData?.boardName || '' });
        const result = await generateObject({ model, maxRetries: 3, schema: BoardStrategySchema, prompt });
        return json<AIActionResponse>({ result: result.object });
      }

      case 'refineBoardWithAI': {
        const { currentBoard, userInstruction, chatHistory } = data as any;
        const historyContext = chatHistory ? `\nHistórico:\n${JSON.stringify(chatHistory)}` : '';
        const boardContext = currentBoard ? `\nBoard atual (JSON):\n${JSON.stringify(currentBoard)}` : '';
        const resolved = await getResolvedPrompt(null as any, orgId as any, 'task_boards_refine');
        const prompt = renderPromptTemplate(resolved?.content || '', { userInstruction, boardContext, historyContext });
        const result = await generateObject({ model, maxRetries: 3, schema: RefineBoardSchema, prompt });
        return json<AIActionResponse>({ result: result.object });
      }

      case 'generateObjectionResponse': {
        const { deal, objection } = data as any;
        const resolved = await getResolvedPrompt(null as any, orgId as any, 'task_deals_objection_responses');
        const prompt = renderPromptTemplate(resolved?.content || '', { objection, dealTitle: deal?.title || '' });
        const result = await generateObject({ model, maxRetries: 3, schema: ObjectionResponseSchema, prompt });
        return json<AIActionResponse>({ result: result.object });
      }

      case 'parseNaturalLanguageAction': {
        const { text } = data as any;
        const result = await generateObject({
          model, maxRetries: 3, schema: ParsedActionSchema,
          prompt: `Parse para CRM Action: "${text}".
Campos: title, type (CALL/MEETING/EMAIL/TASK), date, contactName, companyName, confidence.`,
        });
        return json<AIActionResponse>({ result: result.object });
      }

      case 'chatWithCRM': {
        const { message, context } = data as any;
        const result = await generateText({
          model, maxRetries: 3,
          prompt: `Assistente CRM.\nContexto: ${JSON.stringify(context)}\nUsuário: ${message}\nResponda em português.`,
        });
        return json<AIActionResponse>({ result: result.text });
      }

      case 'generateBirthdayMessage': {
        const { contactName, age } = data as any;
        const result = await generateText({
          model, maxRetries: 3,
          prompt: `Parabéns para ${contactName} (${age || ''} anos). Curto e profissional.`,
        });
        return json<AIActionResponse>({ result: result.text });
      }

      case 'generateDailyBriefing': {
        const resolved = await getResolvedPrompt(null as any, orgId as any, 'task_inbox_daily_briefing');
        const prompt = renderPromptTemplate(resolved?.content || '', { dataJson: JSON.stringify(data) });
        const result = await generateText({ model, maxRetries: 3, prompt });
        return json<AIActionResponse>({ result: result.text });
      }

      case 'chatWithBoardAgent': {
        const { message, boardContext } = data as any;
        const result = await generateText({
          model, maxRetries: 3,
          prompt: `Persona: ${boardContext?.agentName}. Contexto: ${JSON.stringify(boardContext)}. Msg: ${message}`,
        });
        return json<AIActionResponse>({ result: result.text });
      }

      case 'generateSalesScript': {
        const { deal, scriptType, context } = data as any;
        const resolved = await getResolvedPrompt(null as any, orgId as any, 'task_inbox_sales_script');
        const prompt = renderPromptTemplate(resolved?.content || '', {
          scriptType: scriptType || 'geral', dealTitle: deal?.title || '', context: context || '',
        });
        const result = await generateText({ model, maxRetries: 3, prompt });
        return json<AIActionResponse>({ result: { script: result.text, scriptType, generatedFor: deal?.title } });
      }

      default: {
        const exhaustive: never = action;
        return json<AIActionResponse>({ error: `Unknown action: ${exhaustive}` }, 200);
      }
    }
  } catch (err: any) {
    console.error('[api/ai/actions] Error:', err);
    return json<AIActionResponse>({ error: err?.message || 'Internal Server Error' }, 200);
  }
}
