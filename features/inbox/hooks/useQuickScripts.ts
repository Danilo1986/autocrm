/**
 * Quick Scripts Hook
 * React Query wrapper for quick scripts CRUD
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { quickScriptsService, QuickScript, CreateScriptInput, ScriptCategory } from '@/lib/supabase/quickScripts';
import { useAuth } from '@/context/AuthContext';

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
            const { data, error } = category
                ? await quickScriptsService.getScriptsByCategory(category)
                : await quickScriptsService.getScripts();
            if (error) throw error;
            return data || [];
        },
    });

    // Create script
    const createScript = useMutation({
        mutationFn: async (input: CreateScriptInput) => {
            const { data, error } = await quickScriptsService.createScript(input, user!.id);
            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['quick-scripts'] });
        },
    });

    // Update script
    const updateScript = useMutation({
        mutationFn: async ({ scriptId, input }: { scriptId: string; input: Partial<CreateScriptInput> }) => {
            const { data, error } = await quickScriptsService.updateScript(scriptId, input);
            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['quick-scripts'] });
        },
    });

    // Delete script
    const deleteScript = useMutation({
        mutationFn: async (scriptId: string) => {
            const { error } = await quickScriptsService.deleteScript(scriptId);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['quick-scripts'] });
        },
    });

    // Apply variables to template
    const applyVariables = (template: string, variables: Record<string, string>) => {
        return quickScriptsService.applyVariables(template, variables);
    };

    // Get category info
    const getCategoryInfo = (cat: ScriptCategory) => {
        return quickScriptsService.getCategoryInfo(cat);
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
