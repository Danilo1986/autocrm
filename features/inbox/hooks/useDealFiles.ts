/**
 * Deal Files Hook
 * React Query wrapper for deal files upload/download
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dealFilesService, DealFile } from '@/lib/services/dealFiles';

/**
 * Hook React `useDealFiles` que encapsula uma lógica reutilizável.
 *
 * @param {string | undefined} dealId - Identificador do recurso.
 * @returns {{ files: DealFile[]; isLoading: boolean; error: Error | null; uploadFile: UseMutationResult<DealFile | null, Error, File, unknown>; deleteFile: UseMutationResult<...>; downloadFile: (file: DealFile) => Promise<...>; formatFileSize: (bytes: number | null) => string; }} Retorna um valor do tipo `{ files: DealFile[]; isLoading: boolean; error: Error | null; uploadFile: UseMutationResult<DealFile | null, Error, File, unknown>; deleteFile: UseMutationResult<...>; downloadFile: (file: DealFile) => Promise<...>; formatFileSize: (bytes: number | null) => string; }`.
 */
export function useDealFiles(dealId: string | undefined) {
    const queryClient = useQueryClient();
    const queryKey = ['deal-files', dealId];

    // Fetch files
    const filesQuery = useQuery({
        queryKey,
        queryFn: async () => {
            if (!dealId) return [];
            const { data, error } = await dealFilesService.getFilesForDeal(dealId);
            if (error) throw error;
            return data || [];
        },
        enabled: !!dealId,
    });

    // Upload file
    const uploadFile = useMutation({
        mutationFn: async (file: File) => {
            if (!dealId) throw new Error('No deal ID');
            const { data, error } = await dealFilesService.uploadFile(dealId, file);
            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey });
        },
    });

    // Delete file
    const deleteFile = useMutation({
        mutationFn: async ({ fileId, filePath }: { fileId: string; filePath: string }) => {
            const { error } = await dealFilesService.deleteFile(fileId, filePath);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey });
        },
    });

    // Download file
    const downloadFile = async (file: DealFile) => {
        const { url, error } = await dealFilesService.getDownloadUrl(file.filePath);
        if (error || !url) {
            console.error('Download error:', error);
            return;
        }

        // Open in new tab or trigger download
        const a = document.createElement('a');
        a.href = url;
        a.download = file.fileName;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    return {
        files: filesQuery.data || [] as DealFile[],
        isLoading: filesQuery.isLoading,
        error: filesQuery.error,
        uploadFile,
        deleteFile,
        downloadFile,
        formatFileSize: dealFilesService.formatFileSize,
    };
}
