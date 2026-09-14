import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { revalidateTag } from 'next/cache'
import { CODING_BOARD_TAG } from '@/lib/cache-tags'

function verifySignature(body: string, signature: string | null): boolean {
  if (!signature) return false
  const secret = process.env.GITHUB_WEBHOOK_SECRET!
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex')
  const expectedBuffer = Buffer.from(expected)
  const actualBuffer = Buffer.from(signature)
  if (expectedBuffer.length !== actualBuffer.length) return false
  return crypto.timingSafeEqual(expectedBuffer, actualBuffer)
}

export async function POST(request: NextRequest) {
  const signature = request.headers.get('x-hub-signature-256')
  const body = await request.text()

  if (!verifySignature(body, signature)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }

  if (request.headers.get('x-github-event') !== 'push') {
    return NextResponse.json({ ok: true, skipped: 'not a push event' })
  }

  const payload = JSON.parse(body)

  if (payload.repository?.full_name !== process.env.GITHUB_SOURCE_REPO) {
    return NextResponse.json({ ok: true, skipped: 'unexpected repository' })
  }

  const pusherLogin = payload.sender?.login as string | undefined

  if (!pusherLogin) {
    return NextResponse.json({ ok: true, skipped: 'no pusher login' })
  }

  // Map changed file path -> the sha of the commit that touched it. Commits
  // arrive oldest-first, so a later commit for the same path overwrites the
  // earlier one, leaving the most recent sha per path.
  const changedFiles = new Map<string, string>()
  for (const commit of payload.commits ?? []) {
    const sha = commit.id as string
    for (const path of [...(commit.added ?? []), ...(commit.modified ?? [])]) {
      changedFiles.set(path, sha)
    }
  }

  if (changedFiles.size === 0) {
    return NextResponse.json({ ok: true, skipped: 'no file changes' })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: member } = await supabase
    .from('profiles')
    .select('id')
    .ilike('github_username', pusherLogin)
    .maybeSingle()

  if (!member) {
    return NextResponse.json({ ok: true, skipped: 'no matching member' })
  }

  const { data: problems } = await supabase
    .from('coding_problems')
    .select('id, title, match_keyword')

  const checkedProblemIds: string[] = []

  for (const problem of problems ?? []) {
    const keyword = ((problem.match_keyword as string | null) || (problem.title as string))
      .trim()
      .toLowerCase()
    const matchedPath = Array.from(changedFiles.keys()).find((path) =>
      path.toLowerCase().includes(keyword)
    )

    if (matchedPath) {
      const commitSha = changedFiles.get(matchedPath)!
      const { error } = await supabase.from('coding_checks').upsert(
        {
          problem_id: problem.id,
          user_id: member.id,
          commit_sha: commitSha,
          file_path: matchedPath,
          source: 'auto',
        },
        { onConflict: 'problem_id,user_id' }
      )
      if (!error) checkedProblemIds.push(problem.id)
    }
  }

  // Required, not cosmetic: this handler upserts coding_checks, and /coding plus the
  // dashboard widget now read those rows from `'use cache'` scopes tagged `CODING_BOARD_TAG`.
  // Without this, an auto-detected completion would stay invisible until that scope's
  // `minutes` profile's `revalidate` window turns over — up to about a minute server-side plus
  // up to five more minutes for a client sitting on a warm router cache (`stale`), not the full
  // hour of `expire`, which only bounds a completely idle entry. `revalidateTag`, not
  // `updateTag`: there is no acting user session to give read-your-own-writes to — GitHub is
  // the caller — so stale-while-revalidate is right. `'max'` is the second-argument profile
  // this installed Next.js requires (this build's `revalidateTag` signature is
  // `(tag, profile: string | { expire?: number })` with no single-argument overload — see
  // node_modules/next/dist/server/web/spec-extension/revalidate.d.ts) — it is the documented
  // recommendation for exactly this stale-while-revalidate case.
  if (checkedProblemIds.length > 0) {
    revalidateTag(CODING_BOARD_TAG, 'max')
  }

  return NextResponse.json({ ok: true, memberId: member.id, checkedProblemIds })
}
