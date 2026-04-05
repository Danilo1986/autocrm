// Re-export from Prisma-based services (migration shim)
// All imports from '@/lib/supabase' now use Prisma instead of Supabase client
export { boardsService, boardStagesService } from '../services/boards'
export { contactsService, companiesService } from '../services/contacts'
export { dealsService } from '../services/deals'
export { activitiesService } from '../services/activities'
export { productsService } from '../services/products'
export { settingsService, lifecycleStagesService } from '../services/settings'
