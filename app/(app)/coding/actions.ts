'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function createProblem(formData: FormData) {
  const title = formData.get('title') as string
  const link = formData.get('link') as string
  const weekOf = formData.get('weekOf') as string
  const matchKeyword = (formData.get('matchKeyword') as string) || null

  if (!title || !link || !weekOf) {
    redirect('/coding?error=' + encodeURIComponent('문제명, 링크, 주차를 모두 입력해주세요'))
    return
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

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

  const { error } = await supabase
    .from('coding_problems')
    .insert({ title, link, week_of: weekOf, created_by: user.id, match_keyword: matchKeyword })

  if (error) {
    redirect('/coding?error=' + encodeURIComponent(error.message))
    return
  }

  revalidatePath('/coding')
}

export async function toggleCheck(problemId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) throw new Error('로그인이 필요합니다')

  const { data: existing, error: fetchError } = await supabase
    .from('coding_checks')
    .select('id')
    .eq('problem_id', problemId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (fetchError) throw new Error(fetchError.message)

  if (existing) {
    const { error } = await supabase.from('coding_checks').delete().eq('id', existing.id)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase
      .from('coding_checks')
      .insert({ problem_id: problemId, user_id: user.id })
    if (error) throw new Error(error.message)
  }

  revalidatePath('/coding')
}

export async function updateGithubUsername(formData: FormData) {
  const githubUsername = formData.get('githubUsername') as string

  if (!githubUsername) {
    redirect('/coding?error=' + encodeURIComponent('GitHub 아이디를 입력해주세요'))
    return
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

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
}

export async function deleteProblem(problemId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

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

  const {
    data: { user },
  } = await supabase.auth.getUser()

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
