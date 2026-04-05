// Client-safe barrel export
// Uses fetch in browser, Prisma on server
// API routes should import directly from service files (e.g., '@/lib/services/deals')
export {
  boardsService,
  boardStagesService,
  contactsService,
  companiesService,
  dealsService,
  activitiesService,
  productsService,
  settingsService,
  lifecycleStagesService,
} from './client'
