/**
 * Installer Bootstrap - Migration Stub
 *
 * The original Supabase-based installer is no longer used.
 * Instance setup is now handled via POST /api/setup with Prisma + bcrypt.
 */

type BootstrapInput = {
  supabaseUrl: string;
  serviceRoleKey: string;
  companyName: string;
  email: string;
  password: string;
};

type BootstrapResult =
  | { ok: false; error: string }
  | { ok: true; organizationId: string; userId: string; mode: 'created' | 'updated' };

export async function bootstrapInstance(_input: BootstrapInput): Promise<BootstrapResult> {
  return {
    ok: false,
    error: 'Supabase installer removed. Use POST /api/setup for instance initialization.',
  };
}

export async function runMigrations(_supabaseUrl: string, _serviceRoleKey: string): Promise<{ ok: boolean; error?: string }> {
  return { ok: true };
}
