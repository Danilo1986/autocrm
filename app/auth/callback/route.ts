import { NextResponse } from 'next/server'

/**
 * OAuth callback route.
 *
 * Previously used Supabase auth code exchange. Now uses NextAuth,
 * so this route simply redirects to the dashboard or the requested path.
 */
export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url)
    const next = searchParams.get('next') ?? '/dashboard'

    const forwardedHost = request.headers.get('x-forwarded-host')
    const isLocalEnv = process.env.NODE_ENV === 'development'

    if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${next}`)
    } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`)
    } else {
        return NextResponse.redirect(`${origin}${next}`)
    }
}
