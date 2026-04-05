/**
 * Deal Notes Hook
 * React Query wrapper for deal notes CRUD
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dealNotesService, DealNote } from '@/lib/services/dealNotes';

/**
 * Hook React `useDealNotes` que encapsula uma lógica reutilizável.
 *
 * @param {string | undefined} dealId - Identificador do recurso.
 * @returns {{ notes: DealNote[]; isLoading: boolean; error: Error | null; createNote: UseMutationResult<DealNote | null, Error, string, unknown>; updateNote: UseMutationResult<...>; deleteNote: UseMutationResult<...>; }} Retorna um valor do tipo `{ notes: DealNote[]; isLoading: boolean; error: Error | null; createNote: UseMutationResult<DealNote | null, Error, string, unknown>; updateNote: UseMutationResult<...>; deleteNote: UseMutationResult<...>; }`.
 */
export function useDealNotes(dealId: string | undefined) {
    const queryClient = useQueryClient();
    const queryKey = ['deal-notes', dealId];

    // Fetch notes
    const notesQuery = useQuery({
        queryKey,
        queryFn: async () => {
            if (!dealId) return [];
            const { data, error } = await dealNotesService.getNotesForDeal(dealId);
            if (error) throw error;
            return data || [];
        },
        enabled: !!dealId,
    });

    // Create note
    const createNote = useMutation({
        mutationFn: async (content: string) => {
            if (!dealId) throw new Error('No deal ID');
            const { data, error } = await dealNotesService.createNote(dealId, content);
            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey });
        },
    });

    // Update note
    const updateNote = useMutation({
        mutationFn: async ({ noteId, content }: { noteId: string; content: string }) => {
            const { data, error } = await dealNotesService.updateNote(noteId, content);
            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey });
        },
    });

    // Delete note
    const deleteNote = useMutation({
        mutationFn: async (noteId: string) => {
            const { error } = await dealNotesService.deleteNote(noteId);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey });
        },
    });

    return {
        notes: notesQuery.data || [] as DealNote[],
        isLoading: notesQuery.isLoading,
        error: notesQuery.error,
        createNote,
        updateNote,
        deleteNote,
    };
}
