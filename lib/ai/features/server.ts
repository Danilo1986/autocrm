import 'server-only';

import { prisma } from '@/lib/db/prisma';

/**
 * Checks if a specific AI feature is enabled for the organization.
 * The first parameter (_supabase) is kept for backward compatibility but ignored.
 */
export async function isAIFeatureEnabled(
  _supabase: any,
  organizationId: string,
  key: string
): Promise<boolean> {
  try {
    const flag = await prisma.aiFeatureFlag.findFirst({
      where: {
        organizationId,
        key,
      },
      select: { enabled: true },
    });

    // Default: enabled when missing
    return flag?.enabled !== false;
  } catch (error: any) {
    console.warn('[ai/features] Failed to load feature flag; defaulting to enabled.', {
      key,
      message: error?.message,
    });
    return true;
  }
}
