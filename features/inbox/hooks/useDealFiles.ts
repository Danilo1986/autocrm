/**
 * Deal Files Hook
 * React Query wrapper for deal files upload/download
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface DealFile {
    id: string;
    dealId: string;
    fileName: string;
    filePath: string;
    fileSize: number | null;
    mimeType: string | null;
    createdAt: Date;
    createdBy: string | null;
}

function formatFileSize(bytes: number | null): string {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let size = bytes;
    while (size >= 1024 && i < units.length - 1) {
        size /= 1024;
        i++;
    }
    return `${size.toFixed(1)} ${units[i]}`;
}

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
            const res = await fetch(`/api/internal/deal-files?dealId=${encodeURIComponent(dealId)}`);
            const json = await res.json();
            if (json.error) throw new Error(json.error);
            return (json.data || []) as DealFile[];
        },
        enabled: !!dealId,
    });

    // Upload file
    const uploadFile = useMutation({
        mutationFn: async (file: File) => {
            if (!dealId) throw new Error('No deal ID');
            const formData = new FormData();
            formData.append('file', file);
            formData.append('dealId', dealId);
            const res = await fetch('/api/internal/deal-files', {
                method: 'POST',
                body: formData,
            });
            const json = await res.json();
            if (json.error) throw new Error(json.error);
            return json.data as DealFile | null;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey });
        },
    });

    // Delete file
    const deleteFile = useMutation({
        mutationFn: async ({ fileId, filePath }: { fileId: string; filePath: string }) => {
            const res = await fetch(
                `/api/internal/deal-files/${encodeURIComponent(fileId)}?filePath=${encodeURIComponent(filePath)}`,
                { method: 'DELETE' }
            );
            const json = await res.json();
            if (json.error) throw new Error(json.error);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey });
        },
    });

    // Download file
    const downloadFile = async (file: DealFile) => {
        const res = await fetch(
            `/api/internal/deal-files/${encodeURIComponent(file.id)}?filePath=${encodeURIComponent(file.filePath)}`
        );
        const json = await res.json();
        if (json.error || !json.url) {
            console.error('Download error:', json.error);
            return;
        }

        // Open in new tab or trigger download
        const a = document.createElement('a');
        a.href = json.url;
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
        formatFileSize,
    };
}
