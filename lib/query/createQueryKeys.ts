/**
 * @fileoverview Fábrica de Query Keys para TanStack Query.
 * 
 * Este módulo cria estruturas padronizadas de query keys para qualquer entidade,
 * eliminando definições repetitivas e garantindo consistência no cache.
 * 
 * ## Padrão de Query Keys
 * 
 * - `entity.all` - Key base para todas as queries da entidade
 * - `entity.lists()` - Key para listagens
 * - `entity.list(filters)` - Key para listagem filtrada
 * - `entity.details()` - Key base para detalhes
 * - `entity.detail(id)` - Key para detalhe específico
 * 
 * @module lib/query/createQueryKeys
 * 
 * @example
 * ```typescript
 * const dealsKeys = createQueryKeys('deals');
 * 
 * // Invalidar todas as queries de deals
 * queryClient.invalidateQueries({ queryKey: dealsKeys.all });
 * 
 * // Invalidar apenas listagens
 * queryClient.invalidateQueries({ queryKey: dealsKeys.lists() });
 * 
 * // Invalidar um deal específico
 * queryClient.invalidateQueries({ queryKey: dealsKeys.detail('deal-id') });
 * ```
 */

/**
 * Conjunto de query keys para uma entidade.
 * 
 * @template T Nome da entidade.
 * @interface QueryKeySet
 */
export interface QueryKeySet<T extends string> {
  /** Key base para todas as queries desta entidade. */
  all: readonly [T];
  /** Key para queries de listagem. */
  lists: () => readonly [T, 'list'];
  /** Key para queries de listagem com filtros. */
  list: (filters: Record<string, unknown>) => readonly [T, 'list', Record<string, unknown>];
  /** Key base para queries de detalhe. */
  details: () => readonly [T, 'detail'];
  /** Key para query de detalhe específico. */
  detail: (id: string) => readonly [T, 'detail', string];
}

/**
 * Cria um conjunto padronizado de query keys para uma entidade.
 * 
 * @template T Nome da entidade (string literal type).
 * @param entity - Nome da entidade (ex: 'deals', 'contacts').
 * @returns Objeto com query keys padronizadas.
 * 
 * @example
 * ```typescript
 * const dealsKeys = createQueryKeys('deals');
 * dealsKeys.all        // ['deals']
 * dealsKeys.lists()    // ['deals', 'list']
 * dealsKeys.detail(id) // ['deals', 'detail', id]
 * ```
 */
export function createQueryKeys<T extends string>(entity: T): QueryKeySet<T> {
  const all = [entity] as const;
  
  return {
    all,
    lists: () => [...all, 'list'] as const,
    list: (filters: Record<string, unknown>) => [...all, 'list', filters] as const,
    details: () => [...all, 'detail'] as const,
    detail: (id: string) => [...all, 'detail', id] as const,
  };
}

/**
 * Cria query keys estendidas com chaves customizadas.
 * 
 * Útil para entidades que precisam de keys adicionais como 'byDeal', 'byContact', etc.
 * 
 * @template T Nome da entidade.
 * @template E Extensões customizadas.
 * @param entity - Nome da entidade.
 * @param extensions - Função que recebe as keys base e retorna extensões.
 * @returns Objeto com query keys base + extensões.
 * 
 * @example
 * ```typescript
 * const activitiesKeys = createExtendedQueryKeys('activities', (base) => ({
 *   byDeal: (dealId: string) => [...base.all, 'byDeal', dealId] as const,
 *   pending: () => [...base.all, 'pending'] as const,
 * }));
 * 
 * activitiesKeys.byDeal('deal-123'); // ['activities', 'byDeal', 'deal-123']
 * ```
 */
export function createExtendedQueryKeys<
  T extends string,
  E extends Record<string, (...args: any[]) => readonly unknown[]>
>(entity: T, extensions: (base: QueryKeySet<T>) => E): QueryKeySet<T> & E {
  const base = createQueryKeys(entity);
  return {
    ...base,
    ...extensions(base),
  };
}
