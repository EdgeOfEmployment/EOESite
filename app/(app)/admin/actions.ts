'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

type UserStatus = 'approved' | 'rejected'

async function setUserStatus(userId: string, status: UserStatus) {
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

  if (userId === user.id) throw new Error('본인 계정에는 이 작업을 수행할 수 없습니다')

  const { error } = await supabase.from('profiles').update({ status }).eq('id', userId)

  if (error) throw new Error(error.message)

  revalidatePath('/admin')
}

export async function approveUser(userId: string) {
  await setUserStatus(userId, 'approved')
}

export async function rejectUser(userId: string) {
  await setUserStatus(userId, 'rejected')
}
