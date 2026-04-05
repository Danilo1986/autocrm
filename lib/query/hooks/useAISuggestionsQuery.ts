/**
 * TanStack Query hooks for AI Suggestion Interactions
 * Provides cached access to dismissed/accepted suggestions
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { aiSuggestionsService, SuggestionAction, SuggestionType } from '@/lib/services/aiSuggestions';
import { useAuth } from '@/context/AuthContext';
import { queryKeys } from '../index';

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
            const { data, error } = await aiSuggestionsService.getHiddenSuggestionIds(user!.id);
            if (error) throw error;
            return data;
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
            const { data, error } = await aiSuggestionsService.recordInteraction(
                user!.id,
                suggestionType,
                entityType,
                entityId,
                action,
                snoozedUntil
            );
            if (error) throw error;
            return data;
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
            const { error } = await aiSuggestionsService.clearSnooze(user!.id, suggestionType, entityId);
            if (error) throw error;
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: suggestionKeys.hidden() });
        },
    });
};
