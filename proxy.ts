/**
 * Next.js 16+ Proxy (ex-"middleware")
 *
 * Handles:
 * - Session check via NextAuth
 * - Redirect to /login for unauthenticated users
 * - Redirect to /setup if instance not initialized
 *
 * NÃO intercepta /api/* - Route Handlers tratam auth diretamente.
 */

import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/auth/middleware'

/**
 * Função pública `proxy` do projeto.
 *
 * @param {NextRequest} request - Objeto da requisição.
 * @returns {Promise<NextResponse<unknown>>} Retorna um valor do tipo `Promise<NextResponse<unknown>>`.
 */
export async function proxy(request: NextRequest) {
    return await updateSession(request)
}

export const config = {
    matcher: [
        /*
         * Match all request paths exceto:
         * - api (Route Handlers)
         * - _next/static, _next/image
         * - _next/data (mesmo excluindo, o Next pode ainda invocar o Proxy para /_next/data por segurança)
         * - arquivos de metadata (manifest, sitemap, robots)
         * - assets (imagens)
         */
        '/((?!api|_next/static|_next/image|_next/data|favicon.ico|sitemap.xml|robots.txt|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}
