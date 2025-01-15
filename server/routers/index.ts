import { router } from '../trpc'
import { campaignsRouter } from './campaigns'
import { companiesRouter } from './companies'
import { emailsRouter } from './emails'
import { profileRouter } from './profile'
import { gmailRouter } from './gmail'

export const appRouter = router({
  campaigns: campaignsRouter,
  companies: companiesRouter,
  emails: emailsRouter,
  profile: profileRouter,
  gmail: gmailRouter,
})

export type AppRouter = typeof appRouter
