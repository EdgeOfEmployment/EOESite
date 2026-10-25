import { test, expect, type Page } from '@playwright/test'

// A visitor with no session at all, unlike the rest of the suite (approved member).
test.use({ storageState: { cookies: [], origins: [] } })

/** Every POST the page sends. A server action call is always a POST, so this must stay empty. */
function recordPosts(page: Page): string[] {
  const posts: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST') posts.push(request.url())
  })
  return posts
}

const PAGES: { path: string; heading: string }[] = [
  { path: '/tour', heading: 'EOE 둘러보기' },
  { path: '/tour/dashboard', heading: '대시보드' },
  { path: '/tour/checkin', heading: '10시 인증' },
  { path: '/tour/checkin/calendar', heading: '인증 달력' },
  { path: '/tour/coding', heading: '코테 스터디' },
  { path: '/tour/problems', heading: '문제은행' },
  { path: '/tour/jobposts', heading: '자소서 / 공고' },
  { path: '/tour/jobposts/calendar', heading: '자소서 달력' },
  { path: '/tour/interviews', heading: '모의면접' },
  { path: '/tour/feedback/tour-feedback-toss', heading: '토스 자소서 피드백' },
]

test.describe('public /tour demo', () => {
  for (const { path, heading } of PAGES) {
    test(`${path} renders for a logged-out visitor`, async ({ page }) => {
      const response = await page.goto(path)
      expect(response?.status()).toBe(200)
      await expect(page).toHaveURL(new RegExp(`${path.replace(/[/]/g, '\/')}$`))
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
      await expect(page.getByText('체험 모드: 모든 데이터는 가상이며 저장되지 않습니다.')).toBeVisible()
    })
  }

  test('is not indexed by search engines', async ({ page }) => {
    await page.goto('/tour')
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
  })

  test('write buttons show the demo toast and never call a server action', async ({ page }) => {
    const posts = recordPosts(page)
    // Filtered by text: dnd-kit renders its own empty role="status" live region on the page.
    const toast = page.getByRole('status').filter({ hasText: '체험 모드에서는 저장되지 않아요' })

    await page.goto('/tour/checkin')

    await page.getByRole('button', { name: /👍/ }).first().click()
    await expect(toast).toBeVisible()
    // Wait for it to go away so the next step cannot pass on a leftover toast.
    await expect(toast).toBeHidden()

    await page.getByPlaceholder('댓글 달기').first().fill('안녕하세요')
    await page.getByRole('button', { name: '등록' }).first().click()
    await expect(toast).toBeVisible()
    await expect(toast).toBeHidden()

    await page.goto('/tour/coding')
    await page.getByRole('button', { name: '완료 처리' }).click()
    await expect(toast).toBeVisible()

    expect(posts).toEqual([])
  })

  test('the problem search form still navigates', async ({ page }) => {
    await page.goto('/tour/problems')
    await page.getByRole('textbox', { name: '검색' }).fill('괄호')
    await page.getByRole('button', { name: '검색' }).click()

    await expect(page).toHaveURL(/\/tour\/problems\?.*q=%EA%B4%84%ED%98%B8/)
    await expect(page.getByText('[네이버]-올바른 괄호 문자열')).toBeVisible()
    await expect(page.getByText('[카카오]-두 배열의 교집합 크기')).not.toBeVisible()
  })

  test('the login page links to the demo', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('link', { name: '로그인 없이 둘러보기 →' }).click()
    await expect(page).toHaveURL(/\/tour$/)
  })
})
