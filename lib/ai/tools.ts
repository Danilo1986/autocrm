import { tool } from 'ai';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import type { CRMCallOptions } from '@/types/ai';

/**
 * Creates all CRM tools with context injection
 * Context is provided at runtime via the agent's callOptionsSchema
 *
 * NOTE: Uses prisma directly for data access.
 */
export function createCRMTools(context: CRMCallOptions, userId: string) {
    const organizationId = context.organizationId;

    // Em UI normal, ações são gateadas por um card de Aprovar/Negar.
    // Em scripts/CI (sem UI), isso pode impedir a execução real das tools.
    // Use AI_TOOL_APPROVAL_BYPASS=true para permitir execução direta (somente dev/test).
    const bypassApproval = process.env.AI_TOOL_APPROVAL_BYPASS === 'true';

    const formatPrismaError = (error: any) => {
        const msg = (error?.message || String(error || '')).trim();
        return `Falha ao consultar o banco de dados. ${msg || 'Erro desconhecido.'}`;
    };

    const ensureBoardBelongsToOrganization = async (boardId: string) => {
        try {
            const board = await prisma.board.findFirst({
                where: { organizationId, id: boardId },
                select: { id: true },
            });

            if (!board) {
                return {
                    ok: false as const,
                    error:
                        'O board selecionado não pertence à sua organização no backend da IA. Se você acabou de trocar de organização/board, recarregue a página. Se persistir, verifique se a IA está apontando para o mesmo projeto Supabase do app.'
                };
            }

            return { ok: true as const };
        } catch (err) {
            return { ok: false as const, error: formatPrismaError(err) };
        }
    };

    const ensureDealBelongsToOrganization = async (dealId: string) => {
        try {
            const deal = await prisma.deal.findFirst({
                where: { organizationId, id: dealId },
                select: { id: true, title: true, boardId: true, stageId: true, contactId: true },
            });

            if (!deal) {
                return { ok: false as const, error: 'Deal não encontrado nesta organização.' };
            }

            return { ok: true as const, deal };
        } catch (err) {
            return { ok: false as const, error: formatPrismaError(err) };
        }
    };

    const resolveStageIdForBoard = async (params: {
        boardId: string;
        stageId?: string;
        stageName?: string;
    }) => {
        if (params.stageId) return { ok: true as const, stageId: params.stageId };

        const stageName = (params.stageName || '').trim();
        if (!stageName) {
            return { ok: false as const, error: 'Especifique o estágio destino.' };
        }

        // "primeiro estágio" / "último estágio" (atalhos úteis)
        const lowered = stageName.toLowerCase();
        if (/(primeiro|in[íi]cio|inicial)/.test(lowered)) {
            try {
                const first = await prisma.boardStage.findFirst({
                    where: { organizationId, boardId: params.boardId },
                    select: { id: true },
                    orderBy: { order: 'asc' },
                });
                if (!first?.id) return { ok: false as const, error: 'Board não tem estágios configurados.' };
                return { ok: true as const, stageId: first.id };
            } catch (err) {
                return { ok: false as const, error: formatPrismaError(err) };
            }
        }

        if (/(u[úu]ltimo|final)/.test(lowered)) {
            try {
                const last = await prisma.boardStage.findFirst({
                    where: { organizationId, boardId: params.boardId },
                    select: { id: true },
                    orderBy: { order: 'desc' },
                });
                if (!last?.id) return { ok: false as const, error: 'Board não tem estágios configurados.' };
                return { ok: true as const, stageId: last.id };
            } catch (err) {
                return { ok: false as const, error: formatPrismaError(err) };
            }
        }

        try {
            const stages = await prisma.boardStage.findMany({
                where: {
                    organizationId,
                    boardId: params.boardId,
                    OR: [
                        { name: { contains: stageName, mode: 'insensitive' } },
                        { label: { contains: stageName, mode: 'insensitive' } },
                    ],
                },
                select: { id: true, name: true, label: true },
                take: 5,
            });

            if (!stages || stages.length === 0) {
                const allStages = await prisma.boardStage.findMany({
                    where: { organizationId, boardId: params.boardId },
                    select: { name: true, label: true },
                });

                const stageNames = allStages?.map((s) => s.name || s.label).filter(Boolean).join(', ') || 'nenhum';
                return { ok: false as const, error: `Estágio "${stageName}" não encontrado. Estágios disponíveis: ${stageNames}` };
            }

            if (stages.length > 1) {
                const opts = stages.map((s) => s.name || s.label || s.id).join(', ');
                return { ok: false as const, error: `Estágio "${stageName}" está ambíguo. Possíveis: ${opts}` };
            }

            return { ok: true as const, stageId: stages[0].id };
        } catch (err) {
            return { ok: false as const, error: formatPrismaError(err) };
        }
    };

    const tools = {
        // ============= ANÁLISE =============
        analyzePipeline: tool({
            description: 'Analisa o pipeline de vendas completo com métricas e breakdown por estágio',
            inputSchema: z.object({
                boardId: z.string().optional().describe('ID do board (usa contexto se não fornecido)'),
            }),
            execute: async ({ boardId }) => {
                const targetBoardId = boardId || context.boardId;
                console.log('[AI] 🚀 analyzePipeline EXECUTED!', { targetBoardId });

                if (!targetBoardId) {
                    return { error: 'Nenhum board selecionado. Vá para um board ou especifique qual.' };
                }

                try {
                    const deals = await prisma.deal.findMany({
                        where: { organizationId, boardId: targetBoardId },
                        select: {
                            id: true,
                            title: true,
                            value: true,
                            isWon: true,
                            isLost: true,
                            stage: { select: { name: true, label: true } },
                        },
                    });

                    const openDeals = deals.filter(d => !d.isWon && !d.isLost);
                    const wonDeals = deals.filter(d => d.isWon);
                    const lostDeals = deals.filter(d => d.isLost);

                    const totalValue = openDeals.reduce((sum, d) => sum + Number(d.value || 0), 0);
                    const wonValue = wonDeals.reduce((sum, d) => sum + Number(d.value || 0), 0);
                    const winRate = wonDeals.length + lostDeals.length > 0
                        ? Math.round(wonDeals.length / (wonDeals.length + lostDeals.length) * 100)
                        : 0;

                    // Agrupar por estágio
                    const stageMap = new Map<string, { count: number; value: number }>();
                    openDeals.forEach((deal: any) => {
                        const stageName = deal.stage?.name || deal.stage?.label || 'Sem estágio';
                        const existing = stageMap.get(stageName) || { count: 0, value: 0 };
                        stageMap.set(stageName, {
                            count: existing.count + 1,
                            value: existing.value + Number(deal.value || 0)
                        });
                    });

                    return {
                        totalDeals: deals.length,
                        openDeals: openDeals.length,
                        wonDeals: wonDeals.length,
                        lostDeals: lostDeals.length,
                        winRate: `${winRate}%`,
                        pipelineValue: `R$ ${totalValue.toLocaleString('pt-BR')}`,
                        wonValue: `R$ ${wonValue.toLocaleString('pt-BR')}`,
                        stageBreakdown: Object.fromEntries(stageMap)
                    };
                } catch (err) {
                    return { error: formatPrismaError(err) };
                }
            },
        }),

        getBoardMetrics: tool({
            description: 'Calcula métricas e KPIs do board: Win Rate, Total Pipeline, contagem de deals',
            inputSchema: z.object({
                boardId: z.string().optional(),
            }),
            execute: async ({ boardId }) => {
                const targetBoardId = boardId || context.boardId;
                console.log('[AI] 📊 getBoardMetrics EXECUTED!');

                if (!targetBoardId) {
                    return { error: 'Nenhum board selecionado.' };
                }

                try {
                    const deals = await prisma.deal.findMany({
                        where: { organizationId, boardId: targetBoardId },
                        select: { id: true, value: true, isWon: true, isLost: true, createdAt: true },
                    });

                    const total = deals.length;
                    const won = deals.filter(d => d.isWon);
                    const lost = deals.filter(d => d.isLost);
                    const open = deals.filter(d => !d.isWon && !d.isLost);

                    const winRate = won.length + lost.length > 0
                        ? Math.round(won.length / (won.length + lost.length) * 100)
                        : 0;

                    return {
                        totalDeals: total,
                        openDeals: open.length,
                        wonDeals: won.length,
                        lostDeals: lost.length,
                        winRate: `${winRate}%`,
                        pipelineValue: `R$ ${open.reduce((s, d) => s + Number(d.value || 0), 0).toLocaleString('pt-BR')}`,
                        closedValue: `R$ ${won.reduce((s, d) => s + Number(d.value || 0), 0).toLocaleString('pt-BR')}`
                    };
                } catch (err) {
                    return { error: formatPrismaError(err) };
                }
            },
        }),

        // ============= BUSCA =============
        searchDeals: tool({
            description: 'Busca deals por título',
            inputSchema: z.object({
                query: z.string().describe('Termo de busca'),
                limit: z.number().optional().default(5),
            }),
            execute: async ({ query, limit }) => {
                const cleanedQuery = String(query)
                    .trim()
                    // remove aspas comuns no início/fim (modelo costuma mandar "Nike")
                    .replace(/^["'""'']+/, '')
                    .replace(/["'""'']+$/, '')
                    .trim();

                // Normalize pontuação e remova palavras "decorativas" que o modelo costuma incluir
                // (ex.: "buscar deal Nike"), para evitar falso negativo.
                const normalizedQuery = cleanedQuery
                    // troca pontuações por espaço
                    .replace(/[^\p{L}\p{N}\s.-]+/gu, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();

                const strippedQuery = normalizedQuery
                    .replace(/\b(buscar|busque|procure|procurar|encontre|encontrar|mostrar|liste|listar|deal|deals|neg[oó]cio|neg[oó]cios|oportunidade|oportunidades|card|cards)\b/gi, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();

                const effectiveQuery = strippedQuery || normalizedQuery;

                console.log('[AI] 🔍 searchDeals EXECUTED!', { query, cleanedQuery, effectiveQuery });

                if (!effectiveQuery) {
                    return { error: 'Informe um termo de busca.' };
                }

                try {
                    const terms = effectiveQuery
                        .split(' ')
                        .map((t) => t.trim())
                        .filter(Boolean);

                    const titleFilter = terms.length <= 1
                        ? { title: { contains: effectiveQuery, mode: 'insensitive' as const } }
                        : { OR: terms.map((t) => ({ title: { contains: t, mode: 'insensitive' as const } })) };

                    let orgFilter: any;
                    let boardFilter: any = {};

                    if (context.boardId) {
                        // Segurança: só permite consultar por board_id se o board for do mesmo tenant.
                        const guard = await ensureBoardBelongsToOrganization(context.boardId);
                        if (!guard.ok) return { error: guard.error };

                        // Compat: inclui deals legados que ficaram com organization_id NULL.
                        // Como o board já foi validado no tenant, isso não vaza dados.
                        boardFilter = { boardId: context.boardId };
                        orgFilter = { OR: [{ organizationId }, { organizationId: null }] };
                    } else {
                        // Sem board no contexto: sempre filtra por organization_id.
                        orgFilter = { organizationId };
                    }

                    const deals = await prisma.deal.findMany({
                        where: {
                            ...titleFilter,
                            ...boardFilter,
                            ...orgFilter,
                        },
                        select: {
                            id: true,
                            title: true,
                            value: true,
                            isWon: true,
                            isLost: true,
                            stage: { select: { name: true, label: true } },
                            contact: { select: { name: true } },
                        },
                        take: limit,
                    });

                    return {
                        count: deals.length,
                        deals: deals.map((d: any) => ({
                            id: d.id,
                            title: d.title,
                            value: `R$ ${Number(d.value || 0).toLocaleString('pt-BR')}`,
                            stage: d.stage?.name || d.stage?.label || 'N/A',
                            contact: d.contact?.name || 'N/A',
                            status: d.isWon ? '✅ Ganho' : d.isLost ? '❌ Perdido' : '🔄 Aberto'
                        }))
                    };
                } catch (err) {
                    return { error: formatPrismaError(err) };
                }
            },
        }),

        searchContacts: tool({
            description: 'Busca contatos por nome ou email',
            inputSchema: z.object({
                query: z.string().describe('Termo de busca'),
                limit: z.number().optional().default(5),
            }),
            execute: async ({ query, limit }) => {
                console.log('[AI] 🔍 searchContacts EXECUTED!', query);

                try {
                    const contacts = await prisma.contact.findMany({
                        where: {
                            organizationId,
                            OR: [
                                { name: { contains: query, mode: 'insensitive' } },
                                { email: { contains: query, mode: 'insensitive' } },
                            ],
                        },
                        select: { id: true, name: true, email: true, phone: true, companyName: true },
                        take: limit,
                    });

                    return {
                        count: contacts.length,
                        contacts: contacts.map(c => ({
                            id: c.id,
                            name: c.name,
                            email: c.email || 'N/A',
                            phone: c.phone || 'N/A',
                            company: c.companyName || 'N/A'
                        }))
                    };
                } catch (err) {
                    return { error: formatPrismaError(err) };
                }
            },
        }),

        listDealsByStage: tool({
            description: 'Lista todos os deals em um estágio específico do funil',
            inputSchema: z.object({
                stageName: z.string().optional().describe('Nome do estágio (ex: Proposta, Negociação)'),
                stageId: z.string().optional().describe('ID do estágio'),
                boardId: z.string().optional(),
                limit: z.number().optional().default(10),
            }),
            execute: async ({ stageName, stageId, boardId, limit }) => {
                const targetBoardId = boardId || context.boardId;

                console.log('[AI] 📋 listDealsByStage EXECUTING:', {
                    stageName,
                    stageId,
                    boardId,
                    targetBoardId,
                    contextBoardId: context.boardId
                });

                if (!targetBoardId) {
                    return { error: 'Nenhum board selecionado.' };
                }

                // Segurança + compat: valida board no tenant e permite ler deals legados com organization_id NULL.
                const boardGuard = await ensureBoardBelongsToOrganization(targetBoardId);
                if (!boardGuard.ok) return { error: boardGuard.error };

                // UUID regex for validation (full or prefix)
                const isValidUuid = (str: string) =>
                    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
                const isUuidPrefix = (str: string) =>
                    /^[0-9a-f]{8}$/i.test(str) || /^[0-9a-f]{8}-[0-9a-f]{1,4}$/i.test(str);

                // Find stage by ID, partial ID, or name
                let finalStageId = stageId;
                let effectiveStageName = stageName;

                // If stageId looks like a stage NAME (not hex), treat it as stageName
                if (finalStageId && !isValidUuid(finalStageId) && !isUuidPrefix(finalStageId)) {
                    // This is a stage name, not a UUID
                    console.log('[AI] ⚠️ stageId is a name, converting to stageName:', finalStageId);
                    effectiveStageName = finalStageId;
                    finalStageId = undefined;
                }

                // If stageId is a partial UUID, search by prefix
                if (finalStageId && !isValidUuid(finalStageId) && isUuidPrefix(finalStageId)) {
                    console.log('[AI] ⚠️ Partial UUID, searching by prefix:', finalStageId);
                    try {
                        const stages = await prisma.boardStage.findMany({
                            where: {
                                organizationId,
                                boardId: targetBoardId,
                                id: finalStageId,
                            },
                            select: { id: true, name: true },
                        });

                        if (stages && stages.length > 0) {
                            finalStageId = stages[0].id;
                            console.log('[AI] ✅ Found stage by prefix:', stages[0].name, finalStageId);
                        } else {
                            finalStageId = undefined;
                        }
                    } catch {
                        finalStageId = undefined;
                    }
                }

                // If no valid stageId, search by name
                if (!finalStageId && effectiveStageName) {
                    try {
                        const stages = await prisma.boardStage.findMany({
                            where: {
                                organizationId,
                                boardId: targetBoardId,
                                OR: [
                                    { name: { contains: effectiveStageName, mode: 'insensitive' } },
                                    { label: { contains: effectiveStageName, mode: 'insensitive' } },
                                ],
                            },
                            select: { id: true, name: true, label: true },
                        });

                        console.log('[AI] 📋 Stage search by name:', {
                            stageName: effectiveStageName,
                            foundStages: stages,
                        });

                        if (stages && stages.length > 0) {
                            finalStageId = stages[0].id;
                        } else {
                            const allStages = await prisma.boardStage.findMany({
                                where: { organizationId, boardId: targetBoardId },
                                select: { name: true, label: true },
                            });

                            const stageNames = allStages?.map(s => s.name || s.label).join(', ') || 'nenhum';
                            return { error: `Estágio "${effectiveStageName}" não encontrado. Estágios disponíveis: ${stageNames}` };
                        }
                    } catch (err) {
                        return { error: formatPrismaError(err) };
                    }
                }

                if (!finalStageId) {
                    return { error: 'Estágio não identificado. Informe o nome do estágio (ex: "Proposta", "Descoberta").' };
                }

                console.log('[AI] 📋 Querying deals with stageId:', finalStageId);

                try {
                    const deals = await prisma.deal.findMany({
                        where: {
                            boardId: targetBoardId,
                            stageId: finalStageId,
                            organizationId,
                        },
                        select: {
                            id: true,
                            title: true,
                            value: true,
                            updatedAt: true,
                            isWon: true,
                            isLost: true,
                            contact: { select: { name: true } },
                        },
                        orderBy: { value: 'desc' },
                        // Busca mais do que o necessário e filtra client-side para tratar legacy NULL
                        take: Math.max(limit * 5, 50),
                    });

                    console.log('[AI] 📋 Deals query result:', {
                        dealsCount: deals.length,
                        deals,
                    });

                    // Compat: alguns deals legados podem ter is_won/is_lost = NULL.
                    // Nesse caso, consideramos como "aberto".
                    const openDeals = deals.filter((d: any) => !d.isWon && !d.isLost);
                    const finalDeals = openDeals.slice(0, limit);
                    const totalValue = finalDeals.reduce((s: number, d: any) => s + Number(d.value || 0), 0);

                    return {
                        count: finalDeals.length,
                        totalValue: `R$ ${totalValue.toLocaleString('pt-BR')}`,
                        deals: finalDeals.map((d: any) => ({
                            id: d.id,
                            title: d.title,
                            value: `R$ ${Number(d.value || 0).toLocaleString('pt-BR')}`,
                            contact: d.contact?.name || 'N/A'
                        }))
                    };
                } catch (err) {
                    return { error: formatPrismaError(err) };
                }
            },
        }),
        listStagnantDeals: tool({
            description: 'Lista deals parados/estagnados há mais de X dias sem atualização',
            inputSchema: z.object({
                boardId: z.string().optional(),
                daysStagnant: z.number().int().positive().optional().default(7).describe('Dias sem atualização'),
                limit: z.number().int().positive().optional().default(10),
            }),
            execute: async ({ boardId, daysStagnant, limit }) => {
                const targetBoardId = boardId || context.boardId;
                console.log('[AI] ⏰ listStagnantDeals EXECUTED!');

                if (!targetBoardId) {
                    return { error: 'Nenhum board selecionado.' };
                }

                const boardGuard = await ensureBoardBelongsToOrganization(targetBoardId);
                if (!boardGuard.ok) return { error: boardGuard.error };

                const cutoffDate = new Date();
                cutoffDate.setDate(cutoffDate.getDate() - daysStagnant);

                try {
                    const deals = await prisma.deal.findMany({
                        where: {
                            boardId: targetBoardId,
                            organizationId,
                            updatedAt: { lt: cutoffDate },
                        },
                        select: {
                            id: true,
                            title: true,
                            value: true,
                            updatedAt: true,
                            isWon: true,
                            isLost: true,
                            contact: { select: { name: true } },
                        },
                        orderBy: { updatedAt: 'asc' },
                        // Busca mais e filtra client-side para tratar legacy NULL
                        take: Math.max(limit * 5, 50),
                    });

                    const openDeals = deals.filter((d: any) => !d.isWon && !d.isLost);
                    const finalDeals = openDeals.slice(0, limit);

                    return {
                        count: finalDeals.length,
                        message: `${finalDeals.length} deals parados há mais de ${daysStagnant} dias`,
                        deals: finalDeals.map((d: any) => {
                            const days = Math.floor((Date.now() - new Date(d.updatedAt).getTime()) / (1000 * 60 * 60 * 24));
                            return {
                                id: d.id,
                                title: d.title,
                                diasParado: days,
                                value: `R$ ${Number(d.value || 0).toLocaleString('pt-BR')}`,
                                contact: d.contact?.name || 'N/A'
                            };
                        })
                    };
                } catch (err) {
                    return { error: formatPrismaError(err) };
                }
            },
        }),

        listOverdueDeals: tool({
            description: 'Lista deals que possuem atividades atrasadas',
            inputSchema: z.object({
                boardId: z.string().optional(),
                limit: z.number().int().positive().optional().default(10),
            }),
            execute: async ({ boardId, limit }) => {
                const targetBoardId = boardId || context.boardId;

                if (!targetBoardId) {
                    return { error: 'Nenhum board selecionado.' };
                }

                const now = new Date();

                try {
                    const overdueActivities = await prisma.activity.findMany({
                        where: {
                            organizationId,
                            date: { lt: now },
                            completed: false,
                        },
                        select: { dealId: true, date: true, title: true },
                        orderBy: { date: 'asc' },
                    });

                    if (overdueActivities.length === 0) {
                        return { count: 0, message: 'Nenhuma atividade atrasada encontrada! 🎉', deals: [] };
                    }

                    const dealIds = [...new Set(overdueActivities.map(a => a.dealId).filter(Boolean))] as string[];

                    const deals = await prisma.deal.findMany({
                        where: {
                            organizationId,
                            boardId: targetBoardId,
                            id: { in: dealIds },
                        },
                        select: {
                            id: true,
                            title: true,
                            value: true,
                            contact: { select: { name: true } },
                        },
                        take: limit,
                    });

                    return {
                        count: deals.length,
                        message: `⚠️ ${deals.length} deals com atividades atrasadas`,
                        deals: deals.map((d: any) => ({
                            id: d.id,
                            title: d.title,
                            value: `R$ ${Number(d.value || 0).toLocaleString('pt-BR')}`,
                            contact: d.contact?.name || 'N/A',
                            overdueCount: overdueActivities.filter(a => a.dealId === d.id).length
                        }))
                    };
                } catch (err) {
                    return { error: formatPrismaError(err) };
                }
            },
        }),

        getDealDetails: tool({
            description: 'Mostra os detalhes completos de um deal específico',
            inputSchema: z.object({
                dealId: z.string().optional().describe('ID do deal (usa contexto se não fornecido)'),
            }),
            execute: async ({ dealId }) => {
                const targetDealId = dealId || context.dealId;
                console.log('[AI] 🔎 getDealDetails EXECUTED!');

                if (!targetDealId) {
                    return { error: 'Nenhum deal especificado.' };
                }

                try {
                    const deal = await prisma.deal.findFirst({
                        where: { organizationId, id: targetDealId },
                        include: {
                            contact: { select: { name: true, email: true, phone: true } },
                            stage: { select: { name: true, label: true } },
                            activities: { select: { id: true, type: true, title: true, completed: true, date: true } },
                        },
                    });

                    if (!deal) {
                        return { error: 'Deal não encontrado.' };
                    }

                    const pendingActivities = deal.activities?.filter((a: any) => !a.completed) || [];

                    return {
                        id: deal.id,
                        title: deal.title,
                        value: `R$ ${Number(deal.value || 0).toLocaleString('pt-BR')}`,
                        status: deal.isWon ? '✅ Ganho' : deal.isLost ? '❌ Perdido' : '🔄 Aberto',
                        stage: (deal.stage as any)?.name || (deal.stage as any)?.label || 'N/A',
                        priority: deal.priority || 'medium',
                        contact: (deal.contact as any)?.name || 'N/A',
                        contactEmail: (deal.contact as any)?.email || 'N/A',
                        pendingActivities: pendingActivities.length,
                        createdAt: deal.createdAt
                    };
                } catch (err) {
                    return { error: formatPrismaError(err) };
                }
            },
        }),

        // ============= AÇÕES (COM APROVAÇÃO) =============
        moveDeal: tool({
            description: 'Move um deal para outro estágio do funil. Requer aprovação no card (Aprovar/Negar) — não peça confirmação em texto.',
            inputSchema: z.object({
                dealId: z.string().optional().describe('ID do deal (usa contexto se não fornecido)'),
                stageName: z.string().optional().describe('Nome do estágio destino'),
                stageId: z.string().optional().describe('ID do estágio destino'),
            }),
            needsApproval: !bypassApproval,
            execute: async ({ dealId, stageName, stageId }) => {
                const targetDealId = dealId || context.dealId;
                console.log('[AI] 🔄 moveDeal EXECUTED!');

                if (!targetDealId) {
                    return { error: 'Nenhum deal especificado.' };
                }

                try {
                    const deal = await prisma.deal.findFirst({
                        where: { organizationId, id: targetDealId },
                        select: { boardId: true, title: true },
                    });

                    if (!deal) {
                        return { error: 'Deal não encontrado.' };
                    }

                    let targetStageId = stageId;
                    if (!targetStageId && stageName) {
                        const stages = await prisma.boardStage.findMany({
                            where: {
                                organizationId,
                                boardId: deal.boardId,
                                OR: [
                                    { name: { contains: stageName, mode: 'insensitive' } },
                                    { label: { contains: stageName, mode: 'insensitive' } },
                                ],
                            },
                            select: { id: true, name: true, label: true },
                        });

                        if (stages && stages.length > 0) {
                            targetStageId = stages[0].id;
                        } else {
                            return { error: `Estágio "${stageName}" não encontrado.` };
                        }
                    }

                    if (!targetStageId) {
                        return { error: 'Especifique o estágio destino.' };
                    }

                    await prisma.deal.updateMany({
                        where: { organizationId, id: targetDealId },
                        data: { stageId: targetStageId },
                    });

                    return { success: true, message: `Deal "${deal.title}" movido com sucesso!` };
                } catch (err) {
                    return { success: false, error: (err as Error).message };
                }
            },
        }),

        createDeal: tool({
            description: 'Cria um novo deal no board atual (ou informado). Requer aprovação no card (Aprovar/Negar) — não peça confirmação em texto.',
            inputSchema: z.object({
                title: z.string().min(1).describe('Título do deal'),
                value: z.number().optional().default(0).describe('Valor do deal em reais'),
                contactName: z.string().optional().describe('Nome do contato'),
                boardId: z.string().optional(),
            }),
            needsApproval: !bypassApproval,
            execute: async ({ title, value, contactName, boardId }) => {
                const targetBoardId = boardId || context.boardId;
                console.log('[AI] ➕ createDeal EXECUTED!', title);

                if (!targetBoardId) {
                    return { error: 'Nenhum board selecionado.' };
                }

                try {
                    const firstStage = await prisma.boardStage.findFirst({
                        where: { organizationId, boardId: targetBoardId },
                        select: { id: true },
                        orderBy: { order: 'asc' },
                    });

                    const firstStageId = firstStage?.id;
                    if (!firstStageId) {
                        return { error: 'Board não tem estágios configurados.' };
                    }

                    let contactId: string | null = null;
                    if (contactName) {
                        const existing = await prisma.contact.findFirst({
                            where: {
                                organizationId,
                                name: { equals: contactName, mode: 'insensitive' },
                            },
                            select: { id: true },
                        });

                        if (existing) {
                            contactId = existing.id;
                        } else {
                            const newContact = await prisma.contact.create({
                                data: {
                                    organizationId,
                                    name: contactName,
                                    ownerId: userId,
                                },
                                select: { id: true },
                            });
                            contactId = newContact.id;
                        }
                    }

                    const deal = await prisma.deal.create({
                        data: {
                            organizationId,
                            boardId: targetBoardId,
                            title,
                            value,
                            contactId,
                            stageId: firstStageId,
                            priority: 'medium',
                            isWon: false,
                            isLost: false,
                            ownerId: userId,
                        },
                        select: { id: true, title: true, value: true },
                    });

                    return {
                        success: true,
                        deal: {
                            id: deal.id,
                            title: deal.title,
                            value: `R$ ${Number(deal.value || 0).toLocaleString('pt-BR')}`
                        },
                        message: `Deal "${title}" criado com sucesso!`
                    };
                } catch (err) {
                    return { success: false, error: (err as Error).message };
                }
            },
        }),

        updateDeal: tool({
            description: 'Atualiza campos de um deal existente. Requer aprovação no card (Aprovar/Negar) — não peça confirmação em texto.',
            inputSchema: z.object({
                dealId: z.string().optional().describe('ID do deal (usa contexto se não fornecido)'),
                title: z.string().optional().describe('Novo título'),
                value: z.number().optional().describe('Novo valor'),
                priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
            }),
            needsApproval: !bypassApproval,
            execute: async ({ dealId, title, value, priority }) => {
                const targetDealId = dealId || context.dealId;
                console.log('[AI] ✏️ updateDeal EXECUTED!');

                if (!targetDealId) {
                    return { error: 'Nenhum deal especificado.' };
                }

                const updateData: Record<string, unknown> = {};
                if (title) updateData.title = title;
                if (value !== undefined) updateData.value = value;
                if (priority) updateData.priority = priority;

                try {
                    await prisma.deal.updateMany({
                        where: { organizationId, id: targetDealId },
                        data: updateData,
                    });

                    return { success: true, message: 'Deal atualizado com sucesso!' };
                } catch (err) {
                    return { success: false, error: (err as Error).message };
                }
            },
        }),

        markDealAsWon: tool({
            description: 'Marca um deal como GANHO/fechado com sucesso! 🎉 Pode encontrar o deal por ID, título, ou estágio. Requer aprovação no card (Aprovar/Negar) — não peça confirmação em texto.',
            inputSchema: z.object({
                dealId: z.string().optional().describe('ID do deal (opcional se fornecer outros identificadores)'),
                dealTitle: z.string().optional().describe('Título/nome do deal para buscar'),
                stageName: z.string().optional().describe('Nome do estágio onde o deal está (ex: "Proposta")'),
                wonValue: z.number().optional().describe('Valor final do fechamento'),
            }),
            needsApproval: !bypassApproval,
            execute: async ({ dealId, dealTitle, stageName, wonValue }) => {
                let targetDealId = dealId || context.dealId;
                const targetBoardId = context.boardId;

                console.log('[AI] 🎉 markDealAsWon EXECUTING:', { dealId, dealTitle, stageName, targetBoardId });

                try {
                    // Smart lookup: find deal by title or stage if no dealId
                    if (!targetDealId && targetBoardId) {
                        const whereClause: any = {
                            organizationId,
                            boardId: targetBoardId,
                        };

                        // Find by title
                        if (dealTitle) {
                            whereClause.title = { contains: dealTitle, mode: 'insensitive' };
                        }

                        const foundDeals = await prisma.deal.findMany({
                            where: whereClause,
                            select: {
                                id: true,
                                title: true,
                                value: true,
                                isWon: true,
                                isLost: true,
                                stage: { select: { name: true } },
                            },
                            take: 20,
                        });

                        // Compat: deals legados podem ter is_won/is_lost = NULL.
                        // Consideramos como "aberto" na busca.
                        const openFoundDeals = foundDeals.filter((d: any) => !d.isWon && !d.isLost);

                        console.log('[AI] 🔍 Found deals:', {
                            foundDealsCount: foundDeals.length,
                            openFoundDealsCount: openFoundDeals.length,
                            openFoundDeals
                        });

                        // If looking for stage, filter by stage name
                        if (stageName && openFoundDeals) {
                            const filtered = openFoundDeals.filter((d: any) =>
                                d.stage?.name?.toLowerCase().includes(stageName.toLowerCase())
                            );
                            if (filtered.length === 1) {
                                targetDealId = filtered[0].id;
                            } else if (filtered.length > 1) {
                                return {
                                    error: `Encontrei ${filtered.length} deals em "${stageName}". Especifique qual: ${filtered.map((d: any) => d.title).join(', ')}`
                                };
                            }
                        } else if (openFoundDeals.length === 1) {
                            targetDealId = openFoundDeals[0].id;
                        } else if (dealTitle && openFoundDeals.length > 0) {
                            // Multiple matches by title
                            return {
                                error: `Encontrei ${openFoundDeals.length} deals com "${dealTitle}". Especifique qual: ${openFoundDeals.map((d: any) => d.title).join(', ')}`
                            };
                        }
                    }

                    if (!targetDealId) {
                        return { error: 'Não consegui identificar o deal. Forneça o ID, título ou nome do estágio.' };
                    }

                    // Se existir um estágio de "Ganho" no board, também mova o card para ele.
                    // Isso evita a sensação de "não moveu" quando a UI do kanban é baseada em stage_id.
                    let wonStageId: string | null = null;
                    const wonStageNameFromContext = context.wonStage || 'Ganho';

                    if (targetBoardId && wonStageNameFromContext) {
                        const wonStages = await prisma.boardStage.findMany({
                            where: {
                                organizationId,
                                boardId: targetBoardId,
                                OR: [
                                    { name: { contains: wonStageNameFromContext, mode: 'insensitive' } },
                                    { label: { contains: wonStageNameFromContext, mode: 'insensitive' } },
                                ],
                            },
                            select: { id: true, name: true, label: true },
                            take: 1,
                        });

                        if (wonStages && wonStages.length > 0) {
                            wonStageId = wonStages[0].id;
                        }
                    }

                    const updateData: any = {
                        isWon: true,
                        isLost: false,
                        closedAt: new Date(),
                    };
                    if (wonValue !== undefined) updateData.value = wonValue;
                    if (wonStageId) updateData.stageId = wonStageId;

                    // Use update (not updateMany) so we can get back select fields
                    const deal = await prisma.deal.update({
                        where: { id: targetDealId },
                        data: updateData,
                        select: { title: true, value: true },
                    });

                    return {
                        success: true,
                        message: `🎉 Parabéns! Deal "${deal.title}" marcado como GANHO!`,
                        value: `R$ ${Number(deal.value || 0).toLocaleString('pt-BR')}`
                    };
                } catch (err) {
                    return { success: false, error: (err as Error).message };
                }
            },
        }),

        markDealAsLost: tool({
            description: 'Marca um deal como PERDIDO. Requer motivo da perda. Requer aprovação no card (Aprovar/Negar) — não peça confirmação em texto.',
            inputSchema: z.object({
                dealId: z.string().optional().describe('ID do deal'),
                reason: z.string().describe('Motivo da perda (ex: Preço, Concorrente, Timing)'),
            }),
            needsApproval: !bypassApproval, // ✅ Requer aprovação (bypassável em dev/test)
            execute: async ({ dealId, reason }) => {
                const targetDealId = dealId || context.dealId;
                console.log('[AI] ❌ markDealAsLost EXECUTED!');

                if (!targetDealId) {
                    return { error: 'Nenhum deal especificado.' };
                }

                try {
                    const deal = await prisma.deal.update({
                        where: { id: targetDealId },
                        data: {
                            isWon: false,
                            isLost: true,
                            lossReason: reason,
                            closedAt: new Date(),
                        },
                        select: { title: true },
                    });

                    return {
                        success: true,
                        message: `Deal "${deal.title}" marcado como perdido. Motivo: ${reason}`
                    };
                } catch (err) {
                    return { success: false, error: (err as Error).message };
                }
            },
        }),

        assignDeal: tool({
            description: 'Reatribui um deal para outro vendedor/responsável. Requer aprovação no card (Aprovar/Negar) — não peça confirmação em texto.',
            inputSchema: z.object({
                dealId: z.string().optional().describe('ID do deal'),
                newOwnerId: z.string().describe('ID do novo responsável (UUID)'),
            }),
            needsApproval: !bypassApproval, // ✅ Requer aprovação (bypassável em dev/test)
            execute: async ({ dealId, newOwnerId }) => {
                const targetDealId = dealId || context.dealId;
                console.log('[AI] 👤 assignDeal EXECUTED!');

                if (!targetDealId) {
                    return { error: 'Nenhum deal especificado.' };
                }

                try {
                    const ownerProfile = await prisma.profile.findFirst({
                        where: { organizationId, id: newOwnerId },
                        select: { firstName: true, nickname: true },
                    });

                    const ownerName = ownerProfile?.nickname || ownerProfile?.firstName || 'Novo responsável';

                    const deal = await prisma.deal.update({
                        where: { id: targetDealId },
                        data: { ownerId: newOwnerId },
                        select: { title: true },
                    });

                    return {
                        success: true,
                        message: `Deal "${deal.title}" reatribuído para ${ownerName}`
                    };
                } catch (err) {
                    return { success: false, error: (err as Error).message };
                }
            },
        }),

        createTask: tool({
            description: 'Cria uma nova tarefa ou atividade para acompanhamento. Requer aprovação no card (Aprovar/Negar) — não peça confirmação em texto.',
            inputSchema: z.object({
                title: z.string().describe('Título da tarefa'),
                description: z.string().optional(),
                dueDate: z.string().optional().describe('Data de vencimento ISO'),
                dealId: z.string().optional(),
                type: z.enum(['CALL', 'MEETING', 'EMAIL', 'TASK']).optional().default('TASK'),
            }),
            needsApproval: !bypassApproval,
            execute: async ({ title, description, dueDate, dealId, type }) => {
                const targetDealId = dealId || context.dealId;
                console.log('[AI] ✏️ createTask EXECUTED!', title);

                const date = dueDate || new Date().toISOString();

                try {
                    const data = await prisma.activity.create({
                        data: {
                            organizationId,
                            title,
                            description: description || null,
                            date: new Date(date),
                            dealId: targetDealId || null,
                            type: type || 'TASK',
                            ownerId: userId,
                            completed: false,
                        },
                        select: { id: true, title: true, type: true },
                    });

                    return {
                        success: true,
                        activity: { id: data.id, title: data.title, type: data.type },
                        message: `Atividade "${title}" criada com sucesso!`
                    };
                } catch (err) {
                    return { success: false, error: (err as Error).message };
                }
            },
        }),

        moveDealsBulk: tool({
            description:
                'Move vários deals de uma vez para outro estágio. Requer aprovação no card (Aprovar/Negar) — não peça confirmação em texto.',
            inputSchema: z.object({
                dealIds: z.array(z.string()).min(1).describe('IDs dos deals a mover'),
                boardId: z.string().optional().describe('Board alvo (usa contexto se não fornecido)'),
                stageName: z.string().optional().describe('Nome do estágio destino (ex: "Contatado")'),
                stageId: z.string().optional().describe('ID do estágio destino'),
                allowPartial: z.boolean().optional().default(true).describe('Se true, ignora IDs que não pertencem ao tenant e move o restante'),
                maxDeals: z.number().int().positive().optional().default(50).describe('Guardrail: máximo de deals por ação'),
                createFollowUpTask: z.boolean().optional().default(false).describe('Se true, cria 1 tarefa por deal após mover (guardrails aplicados)'),
                followUpTitle: z.string().optional().describe('Título da tarefa de follow-up'),
                followUpDueInDays: z.number().int().positive().optional().default(2),
                followUpType: z.enum(['CALL', 'MEETING', 'EMAIL', 'TASK']).optional().default('TASK'),
            }),
            needsApproval: !bypassApproval,
            execute: async ({ dealIds, boardId, stageName, stageId, allowPartial, maxDeals, createFollowUpTask, followUpTitle, followUpDueInDays, followUpType }) => {
                const unique = Array.from(new Set((dealIds || []).filter(Boolean)));
                if (unique.length === 0) return { error: 'Informe pelo menos 1 deal.' };
                if (unique.length > maxDeals) {
                    return { error: `Muitos deals (${unique.length}). Por segurança, o máximo por ação é ${maxDeals}. Filtre ou faça em lotes.` };
                }

                const targetBoardId = boardId || context.boardId;
                if (!targetBoardId) {
                    return { error: 'Nenhum board selecionado. Vá para um board ou informe qual.' };
                }

                const boardGuard = await ensureBoardBelongsToOrganization(targetBoardId);
                if (!boardGuard.ok) return { error: boardGuard.error };

                try {
                    // 1) Carrega deals do tenant e do board (sem vazar outros boards/tenants)
                    const deals = await prisma.deal.findMany({
                        where: {
                            organizationId,
                            boardId: targetBoardId,
                            id: { in: unique },
                        },
                        select: { id: true, title: true, boardId: true },
                    });

                    const foundIds = new Set(deals.map((d: any) => d.id));
                    const missingIds = unique.filter((id) => !foundIds.has(id));

                    if (missingIds.length > 0 && !allowPartial) {
                        return { error: `Alguns deals não foram encontrados neste board/organização (${missingIds.length}).` };
                    }

                    const stageRes = await resolveStageIdForBoard({ boardId: targetBoardId, stageId, stageName });
                    if (!stageRes.ok) return { error: stageRes.error };

                    const idsToMove = deals.map((d: any) => d.id);
                    if (idsToMove.length === 0) {
                        return { error: 'Nenhum deal válido encontrado para mover (cheque board/organização).' };
                    }

                    // 2) Atualiza em lote
                    await prisma.deal.updateMany({
                        where: {
                            organizationId,
                            boardId: targetBoardId,
                            id: { in: idsToMove },
                        },
                        data: { stageId: stageRes.stageId },
                    });

                    // 3) "Automação simples": cria 1 tarefa por deal (com guardrail extra)
                    let followUpCreated = 0;
                    if (createFollowUpTask) {
                        const maxTasks = Math.min(idsToMove.length, 20);
                        const due = new Date();
                        due.setDate(due.getDate() + (followUpDueInDays || 2));

                        const taskTitle = (followUpTitle || 'Follow-up após mudança de estágio').trim();
                        const inserts = idsToMove.slice(0, maxTasks).map((id: string) => ({
                            organizationId,
                            title: taskTitle,
                            description: null as string | null,
                            date: due,
                            dealId: id,
                            type: followUpType || 'TASK',
                            ownerId: userId,
                            completed: false,
                        }));

                        try {
                            await prisma.activity.createMany({ data: inserts });
                            followUpCreated = inserts.length;
                        } catch {
                            // ignore follow-up creation failure
                        }
                    }

                    return {
                        success: true,
                        movedCount: idsToMove.length,
                        skippedCount: missingIds.length,
                        followUpCreated,
                        deals: deals.map((d: any) => ({ id: d.id, title: d.title })),
                        message:
                            `Movi ${idsToMove.length} deal(s) com sucesso.` +
                            (missingIds.length ? ` (${missingIds.length} ignorado(s) por não pertencerem ao board/organização.)` : '') +
                            (followUpCreated ? ` Criei ${followUpCreated} tarefa(s) de follow-up.` : ''),
                    };
                } catch (err) {
                    return { error: formatPrismaError(err) };
                }
            },
        }),

        // =================== ATIVIDADES (P0) ===================
        listActivities: tool({
            description: 'Lista atividades (tarefas/ligações/reuniões) filtrando por deal/contato/board e status.',
            inputSchema: z.object({
                boardId: z.string().optional(),
                dealId: z.string().optional(),
                contactId: z.string().optional(),
                completed: z.boolean().optional(),
                fromDate: z.string().optional().describe('ISO'),
                toDate: z.string().optional().describe('ISO'),
                limit: z.number().int().positive().optional().default(10),
            }),
            execute: async ({ boardId, dealId, contactId, completed, fromDate, toDate, limit }) => {
                const targetBoardId = boardId || context.boardId;

                if (targetBoardId) {
                    const guard = await ensureBoardBelongsToOrganization(targetBoardId);
                    if (!guard.ok) return { error: guard.error };
                }

                try {
                    const where: any = {
                        organizationId,
                        deletedAt: null,
                    };

                    if (dealId) where.dealId = dealId;
                    if (contactId) where.contactId = contactId;
                    if (completed !== undefined) where.completed = completed;
                    if (fromDate) where.date = { ...(where.date || {}), gte: new Date(fromDate) };
                    if (toDate) where.date = { ...(where.date || {}), lte: new Date(toDate) };

                    // If board filter, use relation filter on deal
                    if (targetBoardId) {
                        where.deal = { boardId: targetBoardId };
                    }

                    const data = await prisma.activity.findMany({
                        where,
                        select: {
                            id: true,
                            title: true,
                            description: true,
                            type: true,
                            date: true,
                            completed: true,
                            dealId: true,
                            contactId: true,
                            deal: { select: { title: true, boardId: true } },
                            contact: { select: { name: true } },
                        },
                        orderBy: { date: 'asc' },
                        take: limit,
                    });

                    return {
                        count: data.length,
                        activities: data.map((a: any) => ({
                            id: a.id,
                            title: a.title,
                            type: a.type,
                            date: a.date,
                            completed: !!a.completed,
                            dealTitle: a.deal?.title || null,
                            contactName: a.contact?.name || null,
                        })),
                    };
                } catch (err) {
                    return { error: formatPrismaError(err) };
                }
            },
        }),

        completeActivity: tool({
            description: 'Marca uma atividade como concluída. Requer aprovação no card (Aprovar/Negar) — não peça confirmação em texto.',
            inputSchema: z.object({
                activityId: z.string(),
            }),
            needsApproval: !bypassApproval,
            execute: async ({ activityId }) => {
                try {
                    // First check the activity belongs to this org
                    const existing = await prisma.activity.findFirst({
                        where: { organizationId, id: activityId },
                        select: { id: true },
                    });
                    if (!existing) return { error: 'Atividade não encontrada nesta organização.' };

                    const data = await prisma.activity.update({
                        where: { id: activityId },
                        data: { completed: true },
                        select: { id: true, title: true },
                    });

                    return { success: true, message: `Atividade "${data.title}" marcada como concluída.` };
                } catch (err) {
                    return { error: formatPrismaError(err) };
                }
            },
        }),

        rescheduleActivity: tool({
            description: 'Reagenda uma atividade (altera a data). Requer aprovação no card (Aprovar/Negar) — não peça confirmação em texto.',
            inputSchema: z.object({
                activityId: z.string(),
                newDate: z.string().describe('Nova data/hora (ISO)'),
            }),
            needsApproval: !bypassApproval,
            execute: async ({ activityId, newDate }) => {
                try {
                    // First check the activity belongs to this org
                    const existing = await prisma.activity.findFirst({
                        where: { organizationId, id: activityId },
                        select: { id: true },
                    });
                    if (!existing) return { error: 'Atividade não encontrada nesta organização.' };

                    const data = await prisma.activity.update({
                        where: { id: activityId },
                        data: { date: new Date(newDate) },
                        select: { id: true, title: true, date: true },
                    });

                    return { success: true, message: `Atividade "${data.title}" reagendada.`, date: data.date };
                } catch (err) {
                    return { error: formatPrismaError(err) };
                }
            },
        }),

        logActivity: tool({
            description: 'Registra uma interação (ligação/email/reunião) e já marca como concluída. Requer aprovação no card (Aprovar/Negar) — não peça confirmação em texto.',
            inputSchema: z.object({
                title: z.string().min(1),
                description: z.string().optional(),
                dealId: z.string().optional(),
                contactId: z.string().optional(),
                type: z.enum(['CALL', 'MEETING', 'EMAIL', 'TASK']).optional().default('CALL'),
                date: z.string().optional().describe('ISO (padrão: agora)'),
            }),
            needsApproval: !bypassApproval,
            execute: async ({ title, description, dealId, contactId, type, date }) => {
                try {
                    const data = await prisma.activity.create({
                        data: {
                            organizationId,
                            title,
                            description: description || null,
                            type: type || 'CALL',
                            date: new Date(date || new Date().toISOString()),
                            dealId: dealId || context.dealId || null,
                            contactId: contactId || null,
                            ownerId: userId,
                            completed: true,
                        },
                        select: { id: true, title: true, type: true, date: true },
                    });

                    return { success: true, activity: data, message: `Registro criado: "${data.title}".` };
                } catch (err) {
                    return { error: formatPrismaError(err) };
                }
            },
        }),

        // =================== DEAL NOTES (P0) ===================
        addDealNote: tool({
            description: 'Adiciona uma nota a um deal. Requer aprovação no card (Aprovar/Negar) — não peça confirmação em texto.',
            inputSchema: z.object({
                dealId: z.string().optional().describe('ID do deal (usa contexto se não fornecido)'),
                content: z.string().min(1).describe('Conteúdo da nota'),
            }),
            needsApproval: !bypassApproval,
            execute: async ({ dealId, content }) => {
                const targetDealId = dealId || context.dealId;
                if (!targetDealId) return { error: 'Nenhum deal especificado.' };

                const guard = await ensureDealBelongsToOrganization(targetDealId);
                if (!guard.ok) return { error: guard.error };

                try {
                    const data = await prisma.dealNote.create({
                        data: { dealId: targetDealId, content, createdBy: userId },
                        select: { id: true, content: true, createdAt: true },
                    });

                    return { success: true, note: data, message: `Nota adicionada no deal "${guard.deal.title}".` };
                } catch (err) {
                    return { error: formatPrismaError(err) };
                }
            },
        }),

        listDealNotes: tool({
            description: 'Lista as últimas notas de um deal.',
            inputSchema: z.object({
                dealId: z.string().optional().describe('ID do deal (usa contexto se não fornecido)'),
                limit: z.number().int().positive().optional().default(5),
            }),
            execute: async ({ dealId, limit }) => {
                const targetDealId = dealId || context.dealId;
                if (!targetDealId) return { error: 'Nenhum deal especificado.' };

                const guard = await ensureDealBelongsToOrganization(targetDealId);
                if (!guard.ok) return { error: guard.error };

                try {
                    const data = await prisma.dealNote.findMany({
                        where: { dealId: targetDealId },
                        select: { id: true, content: true, createdAt: true, createdBy: true },
                        orderBy: { createdAt: 'desc' },
                        take: limit,
                    });

                    return {
                        count: data.length,
                        dealTitle: guard.deal.title,
                        notes: data.map((n: any) => ({ id: n.id, content: n.content, createdAt: n.createdAt, createdBy: n.createdBy })),
                    };
                } catch (err) {
                    return { error: formatPrismaError(err) };
                }
            },
        }),

        // =================== CONTATOS (P1) ===================
        createContact: tool({
            description: 'Cria um novo contato. Requer aprovação no card (Aprovar/Negar) — não peça confirmação em texto.',
            inputSchema: z.object({
                name: z.string().min(1),
                email: z.string().email().optional(),
                phone: z.string().optional(),
                role: z.string().optional(),
                companyName: z.string().optional(),
                notes: z.string().optional(),
                status: z.string().optional().default('ACTIVE'),
                stage: z.string().optional().default('LEAD'),
                source: z.string().optional(),
            }),
            needsApproval: !bypassApproval,
            execute: async ({ name, email, phone, role, companyName, notes, status, stage, source }) => {
                try {
                    const data = await prisma.contact.create({
                        data: {
                            organizationId,
                            name,
                            email: email || null,
                            phone: phone || null,
                            role: role || null,
                            companyName: companyName || null,
                            notes: notes || null,
                            status: status || 'ACTIVE',
                            stage: stage || 'LEAD',
                            source: source || null,
                            ownerId: userId,
                        },
                        select: { id: true, name: true, email: true, phone: true, companyName: true },
                    });
                    return { success: true, contact: data, message: `Contato "${data.name}" criado.` };
                } catch (err) {
                    return { error: formatPrismaError(err) };
                }
            },
        }),

        updateContact: tool({
            description: 'Atualiza campos de um contato. Requer aprovação no card (Aprovar/Negar) — não peça confirmação em texto.',
            inputSchema: z.object({
                contactId: z.string(),
                name: z.string().optional(),
                email: z.string().email().optional(),
                phone: z.string().optional(),
                role: z.string().optional(),
                companyName: z.string().optional(),
                notes: z.string().optional(),
                status: z.string().optional(),
                stage: z.string().optional(),
                source: z.string().optional(),
            }),
            needsApproval: !bypassApproval,
            execute: async ({ contactId, ...patch }) => {
                const updateData: Record<string, unknown> = {};
                if (patch.name !== undefined) updateData.name = patch.name;
                if (patch.email !== undefined) updateData.email = patch.email;
                if (patch.phone !== undefined) updateData.phone = patch.phone;
                if (patch.role !== undefined) updateData.role = patch.role;
                if (patch.companyName !== undefined) updateData.companyName = patch.companyName;
                if (patch.notes !== undefined) updateData.notes = patch.notes;
                if (patch.status !== undefined) updateData.status = patch.status;
                if (patch.stage !== undefined) updateData.stage = patch.stage;
                if (patch.source !== undefined) updateData.source = patch.source;

                try {
                    // First check the contact belongs to this org
                    const existing = await prisma.contact.findFirst({
                        where: { organizationId, id: contactId },
                        select: { id: true },
                    });
                    if (!existing) return { error: 'Contato não encontrado nesta organização.' };

                    const data = await prisma.contact.update({
                        where: { id: contactId },
                        data: updateData,
                        select: { id: true, name: true, email: true, phone: true, companyName: true },
                    });
                    return { success: true, contact: data, message: `Contato "${data.name}" atualizado.` };
                } catch (err) {
                    return { error: formatPrismaError(err) };
                }
            },
        }),

        getContactDetails: tool({
            description: 'Mostra detalhes de um contato.',
            inputSchema: z.object({
                contactId: z.string(),
            }),
            execute: async ({ contactId }) => {
                try {
                    const data = await prisma.contact.findFirst({
                        where: { organizationId, id: contactId },
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            phone: true,
                            role: true,
                            companyName: true,
                            notes: true,
                            status: true,
                            stage: true,
                            source: true,
                            createdAt: true,
                            updatedAt: true,
                        },
                    });
                    if (!data) return { error: 'Contato não encontrado nesta organização.' };
                    return data;
                } catch (err) {
                    return { error: formatPrismaError(err) };
                }
            },
        }),

        linkDealToContact: tool({
            description: 'Associa um deal a um contato (define deal.contact_id). Requer aprovação no card (Aprovar/Negar) — não peça confirmação em texto.',
            inputSchema: z.object({
                dealId: z.string().optional().describe('ID do deal (usa contexto se não fornecido)'),
                contactId: z.string().describe('ID do contato'),
            }),
            needsApproval: !bypassApproval,
            execute: async ({ dealId, contactId }) => {
                const targetDealId = dealId || context.dealId;
                if (!targetDealId) return { error: 'Nenhum deal especificado.' };

                const dealGuard = await ensureDealBelongsToOrganization(targetDealId);
                if (!dealGuard.ok) return { error: dealGuard.error };

                try {
                    const contact = await prisma.contact.findFirst({
                        where: { organizationId, id: contactId },
                        select: { id: true, name: true },
                    });
                    if (!contact) return { error: 'Contato não encontrado nesta organização.' };

                    await prisma.deal.updateMany({
                        where: { organizationId, id: targetDealId },
                        data: { contactId },
                    });

                    return { success: true, message: `Deal "${dealGuard.deal.title}" associado ao contato "${contact.name}".` };
                } catch (err) {
                    return { error: formatPrismaError(err) };
                }
            },
        }),

        // =================== ESTÁGIOS (P2) ===================
        listStages: tool({
            description: 'Lista estágios de um board (colunas).',
            inputSchema: z.object({
                boardId: z.string().optional(),
            }),
            execute: async ({ boardId }) => {
                const targetBoardId = boardId || context.boardId;
                if (!targetBoardId) return { error: 'Nenhum board selecionado.' };
                const guard = await ensureBoardBelongsToOrganization(targetBoardId);
                if (!guard.ok) return { error: guard.error };

                try {
                    const data = await prisma.boardStage.findMany({
                        where: { organizationId, boardId: targetBoardId },
                        select: { id: true, name: true, label: true, color: true, order: true, isDefault: true },
                        orderBy: { order: 'asc' },
                    });

                    return { count: data.length, stages: data };
                } catch (err) {
                    return { error: formatPrismaError(err) };
                }
            },
        }),

        updateStage: tool({
            description: 'Atualiza um estágio (nome/label/cor/ordem). Requer aprovação no card (Aprovar/Negar) — não peça confirmação em texto.',
            inputSchema: z.object({
                stageId: z.string(),
                name: z.string().optional(),
                label: z.string().optional(),
                color: z.string().optional(),
                order: z.number().int().optional(),
                isDefault: z.boolean().optional(),
            }),
            needsApproval: !bypassApproval,
            execute: async ({ stageId, name, label, color, order, isDefault }) => {
                const updateData: Record<string, unknown> = {};
                if (name !== undefined) updateData.name = name;
                if (label !== undefined) updateData.label = label;
                if (color !== undefined) updateData.color = color;
                if (order !== undefined) updateData.order = order;
                if (isDefault !== undefined) updateData.isDefault = isDefault;

                try {
                    // First check the stage belongs to this org
                    const existing = await prisma.boardStage.findFirst({
                        where: { organizationId, id: stageId },
                        select: { id: true },
                    });
                    if (!existing) return { error: 'Estágio não encontrado nesta organização.' };

                    const data = await prisma.boardStage.update({
                        where: { id: stageId },
                        data: updateData,
                        select: { id: true, name: true, label: true, color: true, order: true, isDefault: true },
                    });

                    return { success: true, stage: data, message: `Estágio atualizado: ${data.name}` };
                } catch (err) {
                    return { error: formatPrismaError(err) };
                }
            },
        }),

        reorderStages: tool({
            description: 'Reordena os estágios de um board. Requer aprovação no card (Aprovar/Negar) — não peça confirmação em texto.',
            inputSchema: z.object({
                boardId: z.string().optional(),
                orderedStageIds: z.array(z.string()).min(2),
            }),
            needsApproval: !bypassApproval,
            execute: async ({ boardId, orderedStageIds }) => {
                const targetBoardId = boardId || context.boardId;
                if (!targetBoardId) return { error: 'Nenhum board selecionado.' };
                const guard = await ensureBoardBelongsToOrganization(targetBoardId);
                if (!guard.ok) return { error: guard.error };

                try {
                    // valida que os IDs pertencem ao board+org
                    const stages = await prisma.boardStage.findMany({
                        where: {
                            organizationId,
                            boardId: targetBoardId,
                            id: { in: orderedStageIds },
                        },
                        select: { id: true },
                    });

                    const found = new Set(stages.map((s: any) => s.id));
                    const missing = orderedStageIds.filter((id) => !found.has(id));
                    if (missing.length) return { error: 'Alguns estágios não pertencem a este board/organização.' };

                    // atualiza em série (n pequeno). Se crescer, migrar para RPC.
                    for (let i = 0; i < orderedStageIds.length; i++) {
                        const id = orderedStageIds[i];
                        await prisma.boardStage.updateMany({
                            where: { organizationId, boardId: targetBoardId, id },
                            data: { order: i },
                        });
                    }

                    return { success: true, message: `Reordenei ${orderedStageIds.length} estágio(s).` };
                } catch (err) {
                    return { error: formatPrismaError(err) };
                }
            },
        }),
    } as Record<string, any>;

    // Debug/diagnóstico (scripts): registra chamadas de tools, independentemente do formato do stream.
    // IMPORTANTE: desabilitado por padrão.
    if (String(process.env.AI_TOOL_CALLS_DEBUG || '').toLowerCase() === 'true') {
        const g = globalThis as any;
        if (!Array.isArray(g.__AI_TOOL_CALLS__)) g.__AI_TOOL_CALLS__ = [];

        for (const [name, t] of Object.entries(tools)) {
            const original = (t as any)?.execute;
            if (typeof original !== 'function') continue;

            (t as any).execute = async (args: any) => {
                try {
                    g.__AI_TOOL_CALLS__.push(name);
                } catch {
                    // ignore
                }
                return await original(args);
            };
        }
    }

    return tools;
}
