// =============================================================================
// DataStorageSettings - Configurações de armazenamento de dados (SIMPLIFICADO)
// =============================================================================

import React, { useState } from 'react';
import { Database, AlertTriangle, Trash2, Loader2 } from 'lucide-react';
import { useCRM } from '@/context/CRMContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
// Migration: supabase removed, using fetch API for data operations
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query';

/**
 * Componente React `DataStorageSettings`.
 * @returns {Element} Retorna um valor do tipo `Element`.
 */
export const DataStorageSettings: React.FC = () => {
    const { deals, contacts, companies, activities, boards, refresh } = useCRM();
    const { profile } = useAuth();
    const { addToast } = useToast();
    const queryClient = useQueryClient();

    const [showDangerZone, setShowDangerZone] = useState(false);
    const [confirmText, setConfirmText] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);

    const isAdmin = profile?.role === 'admin';

    // Estatísticas
    const stats = {
        companies: companies.length,
        contacts: contacts.length,
        deals: deals.length,
        activities: activities.length,
        boards: boards.length,
    };

    const totalRecords = stats.companies + stats.contacts + stats.deals + stats.activities + stats.boards;

    const handleNukeDatabase = async () => {
        if (confirmText !== 'DELETAR TUDO') {
            addToast('Digite "DELETAR TUDO" para confirmar', 'error');
            return;
        }

        setIsDeleting(true);

        try {
            // Nuke database via API route
            const res = await fetch('/api/settings/nuke-database', { method: 'POST' });
            if (!res.ok) {
                const json = await res.json().catch(() => ({}));
                throw new Error(json.error || 'Failed to nuke database');
            }

            // Invalida todo o cache do React Query
            await queryClient.invalidateQueries();

            // IMPORTANT: invalidate does not clear cached data; if user navigates back to /boards,
            // stale cached boards can still render until a refetch happens (which we intentionally reduced).
            // For the nuke flow, we want the UI to reflect "zero boards" immediately.
            queryClient.removeQueries({ queryKey: queryKeys.boards.all });
            queryClient.removeQueries({ queryKey: [...queryKeys.boards.all, 'default'] as const });
            // Also clear deals cache because /boards renders deals for active board.
            queryClient.removeQueries({ queryKey: queryKeys.deals.all });

            // Força refresh de todos os contexts (Activities, Deals, etc.)
            await refresh();

            addToast('🔥 Database zerado com sucesso!', 'success');
            setConfirmText('');
            setShowDangerZone(false);

        } catch (error: any) {
            console.error('Erro ao zerar database:', error);
            addToast(`Erro: ${error.message}`, 'error');
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Data Statistics */}
            <div className="bg-white dark:bg-dark-card rounded-lg border border-gray-200 dark:border-dark-border p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <Database className="w-5 h-5" />
                    Estatísticas do Sistema
                </h3>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <div className="p-4 bg-gray-50 dark:bg-dark-bg rounded-lg text-center">
                        <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.companies}</div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">Empresas</div>
                    </div>
                    <div className="p-4 bg-gray-50 dark:bg-dark-bg rounded-lg text-center">
                        <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.contacts}</div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">Contatos</div>
                    </div>
                    <div className="p-4 bg-gray-50 dark:bg-dark-bg rounded-lg text-center">
                        <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.deals}</div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">Negócios</div>
                    </div>
                    <div className="p-4 bg-gray-50 dark:bg-dark-bg rounded-lg text-center">
                        <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.activities}</div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">Atividades</div>
                    </div>
                    <div className="p-4 bg-gray-50 dark:bg-dark-bg rounded-lg text-center">
                        <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.boards}</div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">Boards</div>
                    </div>
                </div>
            </div>

            {/* Danger Zone - Só para Admin */}
            {isAdmin && (
                <div className="bg-white dark:bg-dark-card rounded-lg border border-red-200 dark:border-red-900/50 p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-red-600 dark:text-red-400 flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5" />
                            Zona de Perigo
                        </h3>
                        <button
                            onClick={() => setShowDangerZone(!showDangerZone)}
                            className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                        >
                            {showDangerZone ? 'Esconder' : 'Mostrar'}
                        </button>
                    </div>

                    {showDangerZone && (
                        <div className="space-y-4">
                            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
                                <p className="text-sm text-red-700 dark:text-red-300 mb-2">
                                    <strong>⚠️ ATENÇÃO:</strong> Esta ação vai excluir permanentemente:
                                </p>
                                <ul className="text-sm text-red-600 dark:text-red-400 list-disc list-inside space-y-1">
                                    <li>{stats.deals} negócios</li>
                                    <li>{stats.contacts} contatos</li>
                                    <li>{stats.companies} empresas de clientes</li>
                                    <li>{stats.activities} atividades</li>
                                    <li>{stats.boards} boards (e seus stages)</li>
                                    <li>Todas as tags e produtos</li>
                                </ul>
                                <p className="text-sm text-red-700 dark:text-red-300 mt-3 font-medium">
                                    Total: {totalRecords} registros serão apagados!
                                </p>
                            </div>

                            <div className="space-y-3">
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                    Digite <span className="font-mono bg-red-100 dark:bg-red-900/30 px-1 rounded">DELETAR TUDO</span> para confirmar:
                                </label>
                                <input
                                    type="text"
                                    value={confirmText}
                                    onChange={(e) => setConfirmText(e.target.value)}
                                    placeholder="DELETAR TUDO"
                                    className="w-full px-4 py-2 bg-white dark:bg-dark-bg border border-red-300 dark:border-red-800 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-red-500 focus:border-transparent"
                                />
                                <button
                                    onClick={handleNukeDatabase}
                                    disabled={confirmText !== 'DELETAR TUDO' || isDeleting}
                                    className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-medium transition-all ${confirmText === 'DELETAR TUDO' && !isDeleting
                                            ? 'bg-red-600 hover:bg-red-700 text-white'
                                            : 'bg-slate-200 dark:bg-dark-hover text-slate-400 cursor-not-allowed'
                                        }`}
                                >
                                    {isDeleting ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Deletando...
                                        </>
                                    ) : (
                                        <>
                                            <Trash2 className="w-4 h-4" />
                                            💣 Zerar Database
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default DataStorageSettings;
