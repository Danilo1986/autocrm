import 'server-only';

import { prisma } from '@/lib/db/prisma';
import { getPromptCatalogMap } from './catalog';

export type PromptResolution = {
  key: string;
  content: string;
  source: 'override' | 'default';
  version?: number;
  updatedAt?: string;
};

/**
 * Resolves a prompt template, checking for organization-level overrides first.
 * The first parameter (_supabase) is kept for backward compatibility but ignored.
 */
export async function getResolvedPrompt(
  _supabase: any,
  organizationId: string,
  key: string
): Promise<PromptResolution | null> {
  const catalog = getPromptCatalogMap();
  const fallback = catalog[key];

  try {
    const row = await prisma.aiPromptTemplate.findFirst({
      where: {
        organizationId,
        key,
        isActive: true,
      },
      select: { key: true, content: true, version: true, isActive: true, updatedAt: true },
    });

    if (row?.content) {
      return {
        key,
        content: row.content,
        source: 'override',
        version: row.version,
        updatedAt: row.updatedAt?.toISOString(),
      };
    }
  } catch (error: any) {
    console.warn('[ai/prompts] Failed to load override; using default.', { key, message: error?.message });
  }

  if (!fallback) return null;

  return {
    key,
    content: fallback.defaultTemplate,
    source: 'default',
  };
}
