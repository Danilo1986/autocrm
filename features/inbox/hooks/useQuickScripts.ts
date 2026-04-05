/**
 * Quick Scripts Hook
 * React Query wrapper for quick scripts CRUD
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';

export type ScriptCategory = 'followup' | 'objection' | 'closing' | 'intro' | 'rescue' | 'other';

export interface QuickScript {
    id: string;
    title: string;
    category: string;
    template: string;
    icon: string | null;
    isSystem: boolean;
    userId: string | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface CreateScriptInput {
    title: string;
    category: ScriptCategory;
    template: string;
    icon?: string;
}

const categoryInfo: Record<ScriptCategory, { label: string; color: string }> = {
    followup: { label: 'Follow-up', color: 'blue' },
    objection: { label: 'Objecao', color: 'orange' },
    closing: { label: 'Fechamento', color: 'green' },
    intro: { label: 'Apresentacao', color: 'purple' },
    rescue: { label: 'Resgate', color: 'red' },
    other: { label: 'Outros', color: 'gray' },
};

/**
 * Hook React `useQuickScripts` que encapsula uma lógica reutilizável.
 *
 * @param {ScriptCategory | undefined} category - Parâmetro `category`.
 * @returns {{ scripts: QuickScript[]; isLoading: boolean; error: Error | null; createScript: UseMutationResult<QuickScript | null, Error, CreateScriptInput, unknown>; updateScript: UseMutationResult<...>; deleteScript: UseMutationResult<...>; applyVariables: (template: string, variables: Record<...>) => string; getCategoryInfo:...} Retorna um valor do tipo `{ scripts: QuickScript[]; isLoading: boolean; error: Error | null; createScript: UseMutationResult<QuickScript | null, Error, CreateScriptInput, unknown>; updateScript: UseMutationResult<...>; deleteScript: UseMutationResult<...>; applyVariables: (template: string, variables: Record<...>) => string; getCategoryInfo:...`.
 */
export function useQuickScripts(category?: ScriptCategory) {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const queryKey = category ? ['quick-scripts', category] : ['quick-scripts'];

    // Fetch scripts
    const scriptsQuery = useQuery({
        queryKey,
        queryFn: async () => {
            const url = category
                ? `/api/internal/quick-scripts?category=${encodeURIComponent(category)}`
                : '/api/internal/quick-scripts';
            const res = await fetch(url);
            const json = await res.json();
            if (json.error) throw new Error(json.error);
            return (json.data || []) as QuickScript[];
        },
    });

    // Create script
    const createScript = useMutation({
        mutationFn: async (input: CreateScriptInput) => {
            const res = await fetch('/api/internal/quick-scripts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(input),
            });
            const json = await res.json();
            if (json.error) throw new Error(json.error);
            return json.data as QuickScript | null;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['quick-scripts'] });
        },
    });

    // Update script
    const updateScript = useMutation({
        mutationFn: async ({ scriptId, input }: { scriptId: string; input: Partial<CreateScriptInput> }) => {
            const res = await fetch(`/api/internal/quick-scripts/${encodeURIComponent(scriptId)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(input),
            });
            const json = await res.json();
            if (json.error) throw new Error(json.error);
            return json.data as QuickScript | null;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['quick-scripts'] });
        },
    });

    // Delete script
    const deleteScript = useMutation({
        mutationFn: async (scriptId: string) => {
            const res = await fetch(`/api/internal/quick-scripts/${encodeURIComponent(scriptId)}`, {
                method: 'DELETE',
            });
            const json = await res.json();
            if (json.error) throw new Error(json.error);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['quick-scripts'] });
        },
    });

    // Apply variables to template (pure client-side logic)
    const applyVariables = (template: string, variables: Record<string, string>) => {
        let result = template;
        for (const [key, value] of Object.entries(variables)) {
            result = result.replaceAll(`{${key}}`, value);
        }
        return result;
    };

    // Get category info (pure client-side logic)
    const getCategoryInfo = (cat: ScriptCategory) => {
        return categoryInfo[cat] ?? categoryInfo.other;
    };

    return {
        scripts: scriptsQuery.data || [] as QuickScript[],
        isLoading: scriptsQuery.isLoading,
        error: scriptsQuery.error,
        createScript,
        updateScript,
        deleteScript,
        applyVariables,
        getCategoryInfo,
    };
}
