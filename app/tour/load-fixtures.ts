import { connection } from 'next/server'
import { getKstDateString } from '@/lib/checkin/time'
import { buildTourFixtures, type TourFixtures } from '@/lib/tour/fixtures'

export const TOUR_BASE_PATH = '/tour'

/**
 * The demo's dates are relative to "today", so every /tour page renders per request.
 * `connection()` comes first because this Next.js version's prerenderer refuses a `new Date()`
 * that is not preceded by a request-time read (see `markDynamic` in app/(app)/page.tsx). With
 * no database behind it, a per-request render costs nothing.
 */
export async function loadTourFixtures(): Promise<TourFixtures> {
  await connection()
  return buildTourFixtures(getKstDateString(new Date().toISOString()))
}
