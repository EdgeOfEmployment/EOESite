'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getVerifiedUser } from '@/lib/auth/verify'

export async function createProblems(formData: FormData) {
  const rowIds = ((formData.get('rowIds') as string) || '').split(',').filter(Boolean)

  if (rowIds.length === 0) {
    redirect('/coding?error=' + encodeURIComponent('문제를 최소 1개 이상 입력해주세요'))
    return
  }

  const weekMode = (formData.get('weekMode') as string) === 'new' ? 'new' : 'existing'
  const weekId = (formData.get('weekId') as string) || ''
  const weekLabel = (formData.get('weekLabel') as string) || ''
  const weekStartDate = (formData.get('weekStartDate') as string) || ''
  const weekEndDate = (formData.get('weekEndDate') as string) || ''

  if (weekMode === 'new') {
    if (!weekLabel || !weekStartDate || !weekEndDate) {
      redirect('/coding?error=' + encodeURIComponent('새 주차의 이름, 시작일, 종료일을 모두 입력해주세요'))
      return
    }
  } else if (!weekId) {
    redirect('/coding?error=' + encodeURIComponent('대상 주차를 선택해주세요'))
    return
  }

  const rows = rowIds.map((rowId) => ({
    title: (formData.get(`title-${rowId}`) as string) || '',
    link: (formData.get(`link-${rowId}`) as string) || '',
    matchKeyword: (formData.get(`matchKeyword-${rowId}`) as string) || null,
    assigneeIds: formData.getAll(`assigneeIds-${rowId}`) as string[],
  }))

  if (rows.some((row) => !row.title || !row.link)) {
    redirect('/coding?error=' + encodeURIComponent('모든 문제에 문제명과 링크를 입력해주세요'))
    return
  }

  const supabase = await createClient()

  const user = await getVerifiedUser(supabase)

  if (!user) {
    redirect('/login')
    return
  }

  const { data: callerProfile, error: callerError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (callerError) throw new Error(callerError.message)
  if (!callerProfile || callerProfile.role !== 'admin') throw new Error('권한이 없습니다')

  let targetWeekId = weekId

  if (weekMode === 'new') {
    const { data: newWeek, error: weekError } = await supabase
      .from('coding_weeks')
      .insert({
        label: weekLabel,
        start_date: weekStartDate,
        end_date: weekEndDate,
        created_by: user.id,
      })
      .select('id')
      .single()

    if (weekError || !newWeek) {
      redirect('/coding?error=' + encodeURIComponent(weekError?.message ?? '주차 생성에 실패했어요'))
      return
    }

    targetWeekId = newWeek.id
  }

  const { error } = await supabase.from('coding_problems').insert(
    rows.map((row) => ({
      title: row.title,
      link: row.link,
      week_id: targetWeekId,
      created_by: user.id,
      match_keyword: row.matchKeyword,
      assignee_ids: row.assigneeIds,
    }))
  )

  if (error) {
    redirect('/coding?error=' + encodeURIComponent(error.message))
    return
  }

  revalidatePath('/coding')
  redirect(`/coding?week=${targetWeekId}&success=` + encodeURIComponent(`문제 ${rows.length}개를 등록했어요`))
}

export async function updateGithubUsername(formData: FormData) {
  const githubUsername = formData.get('githubUsername') as string

  if (!githubUsername) {
    redirect('/coding?error=' + encodeURIComponent('GitHub 아이디를 입력해주세요'))
    return
  }

  const supabase = await createClient()

  const user = await getVerifiedUser(supabase)

  if (!user) {
    redirect('/login')
    return
  }

  const { error } = await supabase.rpc('update_own_github_username', {
    new_username: githubUsername,
  })

  if (error) {
    redirect('/coding?error=' + encodeURIComponent(error.message))
    return
  }

  revalidatePath('/coding')
  redirect('/coding?success=' + encodeURIComponent('GitHub 아이디를 저장했어요'))
}

export async function deleteProblem(problemId: string) {
  const supabase = await createClient()

  const user = await getVerifiedUser(supabase)

  if (!user) throw new Error('권한이 없습니다')

  const { data: callerProfile, error: callerError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (callerError) throw new Error(callerError.message)
  if (!callerProfile || callerProfile.role !== 'admin') throw new Error('권한이 없습니다')

  const { error } = await supabase.from('coding_problems').delete().eq('id', problemId)

  if (error) throw new Error(error.message)

  revalidatePath('/coding')
}

export async function adminRemoveCheck(problemId: string, userId: string) {
  const supabase = await createClient()

  const user = await getVerifiedUser(supabase)

  if (!user) throw new Error('권한이 없습니다')

  const { data: callerProfile, error: callerError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (callerError) throw new Error(callerError.message)
  if (!callerProfile || callerProfile.role !== 'admin') throw new Error('권한이 없습니다')

  const { error } = await supabase
    .from('coding_checks')
    .delete()
    .eq('problem_id', problemId)
    .eq('user_id', userId)

  if (error) throw new Error(error.message)

  revalidatePath('/coding')
}

export async function markSelfComplete(problemId: string) {
  const supabase = await createClient()

  const user = await getVerifiedUser(supabase)

  if (!user) throw new Error('권한이 없습니다')

  const { data: problem, error: problemError } = await supabase
    .from('coding_problems')
    .select('assignee_ids')
    .eq('id', problemId)
    .single()

  if (problemError) throw new Error(problemError.message)

  const assigneeIds = (problem?.assignee_ids as string[] | null) ?? []
  if (assigneeIds.length > 0 && !assigneeIds.includes(user.id)) {
    throw new Error('본인에게 배정된 문제가 아닙니다')
  }

  const { error } = await supabase
    .from('coding_checks')
    .insert({ problem_id: problemId, user_id: user.id, source: 'manual' })

  if (error && error.code !== '23505') throw new Error(error.message)

  revalidatePath('/coding')
}

export async function unmarkSelfComplete(problemId: string) {
  const supabase = await createClient()

  const user = await getVerifiedUser(supabase)

  if (!user) throw new Error('권한이 없습니다')

  const { error } = await supabase
    .from('coding_checks')
    .delete()
    .eq('problem_id', problemId)
    .eq('user_id', user.id)
    .eq('source', 'manual')

  if (error) throw new Error(error.message)

  revalidatePath('/coding')
}
