import { generateText } from 'ai';
import { z } from 'zod';
import { requireAITaskContext, AITaskHttpError } from '@/lib/ai/tasks/server';
import { GenerateEmailDraftInputSchema } from '@/lib/ai/tasks/schemas';
import { getResolvedPrompt } from '@/lib/ai/prompts/server';
import { renderPromptTemplate } from '@/lib/ai/prompts/render';
import { isAIFeatureEnabled } from '@/lib/ai/features/server';

export const maxDuration = 60;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

/**
 * Handler HTTP `POST` deste endpoint (Next.js Route Handler).
 *
 * @param {Request} req - Objeto da requisição.
 * @returns {Promise<Response>} Retorna um valor do tipo `Promise<Response>`.
 */
export async function POST(req: Request) {
  try {
    const { model, organizationId } = await requireAITaskContext(req);
    const enabled = await isAIFeatureEnabled(organizationId, 'ai_email_draft');
    if (!enabled) {
      return json({ error: { code: 'AI_FEATURE_DISABLED', message: 'Função de IA desativada: Rascunho de e-mail.' } }, 403);
    }

    const body = await req.json().catch(() => null);
    const { deal } = GenerateEmailDraftInputSchema.parse(body);

    const resolved = await getResolvedPrompt(organizationId, 'task_deals_email_draft');
    const prompt = renderPromptTemplate(resolved?.content || '', {
      contactName: deal?.contactName || 'Cliente',
      companyName: deal?.companyName || 'Empresa',
      dealTitle: deal?.title || '',
    });

    const result = await generateText({
      model,
      maxRetries: 3,
      prompt,
    });

    return json({ text: result.text });
  } catch (err: unknown) {
    if (err instanceof AITaskHttpError) return err.toResponse();
    if (err instanceof z.ZodError) {
      return json({ error: { code: 'INVALID_INPUT', message: 'Payload inválido.' } }, 400);
    }

    console.error('[api/ai/tasks/deals/email-draft] Error:', err);
    return json({ error: { code: 'INTERNAL_ERROR', message: 'Erro ao gerar rascunho de e-mail.' } }, 500);
  }
}
