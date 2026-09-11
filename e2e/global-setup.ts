import { chromium, type FullConfig } from '@playwright/test'
import { signSessionCache } from '../lib/auth/session-cache'

export default async function globalSetup(config: FullConfig) {
  const secret = process.env.SESSION_CACHE_SECRET
  if (!secret) {
    throw new Error('SESSION_CACHE_SECRET must be set in .env.local for e2e tests to authenticate')
  }

  const token = signSessionCache(
    { userId: '00000000-0000-0000-0000-000000000000', role: 'member', status: 'approved' },
    secret,
    Date.now()
  )

  const baseURL = config.projects[0]?.use?.baseURL ?? 'http://localhost:3000'
  const browser = await chromium.launch()
  const context = await browser.newContext()
  await context.addCookies([
    {
      name: 'eoe-session-cache',
      value: token,
      url: baseURL,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ])
  await context.storageState({ path: 'e2e/.auth/approved-member.json' })
  await browser.close()
}
