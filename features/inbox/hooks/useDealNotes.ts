/**
 * Deal Notes Hook
 * React Query wrapper for deal notes CRUD
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface DealNote {
    id: string;
    dealId: string;
    content: string;
    createdBy: string | null;
    createdAt: Date;
    updatedAt: Date;
}

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
            const res = await fetch(`/api/internal/deal-notes?dealId=${encodeURIComponent(dealId)}`);
            const json = await res.json();
            if (json.error) throw new Error(json.error);
            return (json.data || []) as DealNote[];
        },
        enabled: !!dealId,
    });

    // Create note
    const createNote = useMutation({
        mutationFn: async (content: string) => {
            if (!dealId) throw new Error('No deal ID');
            const res = await fetch('/api/internal/deal-notes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dealId, content }),
            });
            const json = await res.json();
            if (json.error) throw new Error(json.error);
            return json.data as DealNote | null;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey });
        },
    });

    // Update note
    const updateNote = useMutation({
        mutationFn: async ({ noteId, content }: { noteId: string; content: string }) => {
            const res = await fetch(`/api/internal/deal-notes/${encodeURIComponent(noteId)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content }),
            });
            const json = await res.json();
            if (json.error) throw new Error(json.error);
            return json.data as DealNote | null;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey });
        },
    });

    // Delete note
    const deleteNote = useMutation({
        mutationFn: async (noteId: string) => {
            const res = await fetch(`/api/internal/deal-notes/${encodeURIComponent(noteId)}`, {
                method: 'DELETE',
            });
            const json = await res.json();
            if (json.error) throw new Error(json.error);
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
