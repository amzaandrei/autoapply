import { router } from '../trpc'
import { campaignsRouter } from './campaigns'
import { companiesRouter } from './companies'
import { emailsRouter } from './emails'
import { profileRouter } from './profile'
import { gmailRouter } from './gmail'
import { followupsRouter } from './followups'
import { blacklistRouter } from './blacklist'
import { interviewsRouter } from './interviews'
import { templatesRouter } from './templates'
import { regionsRouter } from './regions'

export const appRouter = router({
  campaigns: campaignsRouter,
  companies: companiesRouter,
  emails: emailsRouter,
  profile: profileRouter,
  gmail: gmailRouter,
  followups: followupsRouter,
  blacklist: blacklistRouter,
  interviews: interviewsRouter,
  templates: templatesRouter,
  regions: regionsRouter,
})

export type AppRouter = typeof appRouter
