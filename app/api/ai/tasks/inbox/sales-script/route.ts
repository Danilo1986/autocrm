import { generateText } from 'ai';
import { z } from 'zod';
import { requireAITaskContext, AITaskHttpError } from '@/lib/ai/tasks/server';
import { GenerateSalesScriptInputSchema } from '@/lib/ai/tasks/schemas';
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
    const enabled = await isAIFeatureEnabled(null, organizationId, 'ai_sales_script');
    if (!enabled) {
      return json({ error: { code: 'AI_FEATURE_DISABLED', message: 'Função de IA desativada: Script de vendas.' } }, 403);
    }

    const body = await req.json().catch(() => null);
    const { deal, scriptType, context } = GenerateSalesScriptInputSchema.parse(body);

    const resolved = await getResolvedPrompt(null, organizationId, 'task_inbox_sales_script');
    const template = resolved?.content || '';
    const prompt = renderPromptTemplate(template, {
      scriptType: scriptType || 'geral',
      dealTitle: deal?.title || '',
      context: context || '',
    });

    const result = await generateText({
      model,
      maxRetries: 3,
      prompt,
    });

    return json({ script: result.text, scriptType, generatedFor: deal?.title });
  } catch (err: unknown) {
    if (err instanceof AITaskHttpError) return err.toResponse();
    if (err instanceof z.ZodError) {
      return json({ error: { code: 'INVALID_INPUT', message: 'Payload inválido.' } }, 400);
    }

    console.error('[api/ai/tasks/inbox/sales-script] Error:', err);
    return json({ error: { code: 'INTERNAL_ERROR', message: 'Erro ao gerar script.' } }, 500);
  }
}
