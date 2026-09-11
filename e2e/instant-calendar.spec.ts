import { test, expect } from '@playwright/test'
import { instant } from '@next/playwright'

// The plan's draft used a link named "달력" - the actual header link on both
// /checkin and /jobposts reads "달력 보기" (see app/(app)/checkin/page.tsx and
// app/(app)/jobposts/page.tsx), so the selectors below use the real text.

test.describe('calendar pages navigate instantly', () => {
  test('checkin calendar shell appears before data resolves', async ({ page }) => {
    await page.goto('/checkin')

    await instant(page, async () => {
      await page.getByRole('link', { name: '달력 보기' }).click()
      await expect(page.getByRole('heading', { name: '인증 달력' })).toBeVisible()
    })

    await expect(page.getByText(/\d{4}년 \d{1,2}월/)).toBeVisible()
  })

  test('jobposts calendar shell appears before data resolves', async ({ page }) => {
    await page.goto('/jobposts')

    await instant(page, async () => {
      await page.getByRole('link', { name: '달력 보기' }).click()
      await expect(page.getByRole('heading', { name: '자소서 달력' })).toBeVisible()
    })

    await expect(page.getByText(/\d{4}년 \d{1,2}월/)).toBeVisible()
  })
})
