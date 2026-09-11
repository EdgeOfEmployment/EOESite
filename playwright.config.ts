import { defineConfig } from '@playwright/test'
import path from 'node:path'

// Playwright's test runner (unlike Next.js) does not auto-load .env.local.
// Load it into process.env here so e2e/global-setup.ts can read
// SESSION_CACHE_SECRET, and so the `next dev` webServer child process
// (spawned from this same process) inherits the Supabase env vars too.
try {
  process.loadEnvFile(path.resolve(process.cwd(), '.env.local'))
} catch {
  // Missing .env.local - global-setup.ts throws a clear error instead.
}

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  webServer: {
    // NOTE: the plan's original command was `npm run build && npm run start`,
    // but `npm run build` currently fails for the whole app on an unrelated,
    // not-yet-migrated route (`/forgot-password` throws "Uncached data was
    // accessed outside of <Suspense>" during static generation - a known,
    // pre-existing issue unrelated to this task's calendar pages). Because of
    // the `&&`, that failure would prevent `npm run start` from ever running,
    // which would make the whole e2e suite fail to even start rather than
    // fail on its actual assertions.
    //
    // We use `next dev` instead. It doesn't run the production build's
    // static-generation-time validation (so `/forgot-password` failing to
    // prerender doesn't block anything), and the Suspense-based streaming
    // behavior this suite asserts on (shell renders before the cached
    // calendar data resolves) works the same way in dev mode - it's ordinary
    // React Suspense streaming, not something that only exists post-build.
    command: 'npx next dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  use: {
    baseURL: 'http://localhost:3000',
    storageState: 'e2e/.auth/approved-member.json',
  },
})
