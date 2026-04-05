/**
 * TanStack Query hooks for AI Suggestion Interactions
 * Provides cached access to dismissed/accepted suggestions
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';

export type SuggestionAction = 'ACCEPTED' | 'DISMISSED' | 'SNOOZED';
export type SuggestionType = 'UPSELL' | 'STALLED' | 'BIRTHDAY' | 'RESCUE';

// Query key factory
const suggestionKeys = {
    all: ['ai_suggestions'] as const,
    hidden: () => [...suggestionKeys.all, 'hidden'] as const,
    interactions: () => [...suggestionKeys.all, 'interactions'] as const,
};

/**
 * Hook to get Set of hidden suggestion IDs (dismissed, accepted, or snoozed)
 * This is the main hook used by useInboxController to filter suggestions
 */
export const useHiddenSuggestionIds = () => {
    const { user, loading: authLoading } = useAuth();

    return useQuery({
        queryKey: suggestionKeys.hidden(),
        queryFn: async () => {
            const res = await fetch('/api/internal/ai-suggestions/hidden');
            const json = await res.json();
            if (json.error) throw new Error(json.error);
            return new Set<string>(json.data || []);
        },
        enabled: !authLoading && !!user,
        staleTime: 5 * 60 * 1000, // 5 minutes
    });
};

/**
 * Hook to record a suggestion interaction (dismiss, accept, snooze)
 */
export const useRecordSuggestionInteraction = () => {
    const queryClient = useQueryClient();
    const { user } = useAuth();

    return useMutation({
        mutationFn: async ({
            suggestionType,
            entityType,
            entityId,
            action,
            snoozedUntil,
        }: {
            suggestionType: SuggestionType;
            entityType: 'deal' | 'contact';
            entityId: string;
            action: SuggestionAction;
            snoozedUntil?: Date;
        }) => {
            const res = await fetch('/api/internal/ai-suggestions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    suggestionType,
                    entityType,
                    entityId,
                    action,
                    snoozedUntil: snoozedUntil?.toISOString(),
                }),
            });
            const json = await res.json();
            if (json.error) throw new Error(json.error);
            return json.data;
        },
        onMutate: async ({ suggestionType, entityId }) => {
            // Optimistically update the hidden set
            await queryClient.cancelQueries({ queryKey: suggestionKeys.hidden() });

            const previousHidden = queryClient.getQueryData<Set<string>>(suggestionKeys.hidden());

            // Add to hidden set immediately
            const newHidden = new Set(previousHidden || []);
            newHidden.add(`${suggestionType}-${entityId}`);
            queryClient.setQueryData(suggestionKeys.hidden(), newHidden);

            return { previousHidden };
        },
        onError: (_error, _variables, context) => {
            // Rollback on error
            if (context?.previousHidden) {
                queryClient.setQueryData(suggestionKeys.hidden(), context.previousHidden);
            }
        },
        onSettled: () => {
            // Refetch to ensure consistency
            queryClient.invalidateQueries({ queryKey: suggestionKeys.hidden() });
        },
    });
};

/**
 * Hook to clear a snoozed suggestion
 */
export const useClearSnooze = () => {
    const queryClient = useQueryClient();
    const { user } = useAuth();

    return useMutation({
        mutationFn: async ({
            suggestionType,
            entityId,
        }: {
            suggestionType: SuggestionType;
            entityId: string;
        }) => {
            const res = await fetch('/api/internal/ai-suggestions', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ suggestionType, entityId }),
            });
            const json = await res.json();
            if (json.error) throw new Error(json.error);
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: suggestionKeys.hidden() });
        },
    });
};
