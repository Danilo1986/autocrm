import { redirect } from 'next/navigation'

import { prisma } from '@/lib/db/prisma'

export const dynamic = 'force-dynamic'

export default async function Home() {
    // Bypass em desenvolvimento local: sempre vai para o dashboard
    if (process.env.NODE_ENV === 'development') {
        redirect('/dashboard')
    }

    const installerEnabled = process.env.INSTALLER_ENABLED !== 'false'

    // Detecta se a instância já foi inicializada (any organization exists).
    let isInitialized: boolean | null = null
    try {
        const orgCount = await prisma.organization.count()
        isInitialized = orgCount > 0
    } catch {
        isInitialized = null
    }

    if (installerEnabled) {
        if (isInitialized === true) {
            redirect('/dashboard')
        }
        redirect('/install')
    }

    if (isInitialized === false) {
        redirect('/setup')
    }

    redirect('/dashboard')
}
