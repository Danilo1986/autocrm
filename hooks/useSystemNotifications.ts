import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/context/AuthContext'
import { useMemo } from 'react'

export interface SystemNotification {
    id: string
    type: string
    title: string
    message: string
    timestamp: Date
    actionLink?: string
    severity: 'high' | 'medium' | 'low'
    readAt?: string | null
}

export const useSystemNotifications = () => {
    const { user } = useAuth()
    const queryClient = useQueryClient()

    const { data: notifications = [] } = useQuery({
        queryKey: ['system_notifications'],
        queryFn: async () => {
            const res = await fetch('/api/notifications', { credentials: 'include' })
            if (!res.ok) return []
            const { data } = await res.json()
            return (data || []).map((n: any) => ({
                id: n.id,
                type: n.type,
                title: n.title,
                message: n.message,
                timestamp: new Date(n.createdAt),
                actionLink: n.link,
                severity: (n.severity || 'medium') as 'high' | 'medium' | 'low',
                readAt: n.readAt,
            }))
        },
        enabled: !!user,
        staleTime: 1000 * 60 * 5,
    })

    const unreadCount = useMemo(() =>
        notifications.filter((n: SystemNotification) => !n.readAt).length, [notifications])

    const hasHighSeverity = useMemo(() =>
        notifications.some((n: SystemNotification) => n.severity === 'high' && !n.readAt), [notifications])

    const markAsRead = useMutation({
        mutationFn: async (id: string) => {
            const res = await fetch('/api/notifications', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ action: 'mark_read', id }),
            })
            if (!res.ok) throw new Error('Failed to mark as read')
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['system_notifications'] })
        },
    })

    const markAllAsRead = useMutation({
        mutationFn: async () => {
            const res = await fetch('/api/notifications', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ action: 'mark_all_read' }),
            })
            if (!res.ok) throw new Error('Failed to mark all as read')
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['system_notifications'] })
        },
    })

    return {
        notifications,
        count: unreadCount,
        hasHighSeverity,
        markAsRead,
        markAllAsRead,
    }
}
