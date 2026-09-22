'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath, updateTag } from 'next/cache'
import { MEMBER_NAMES_TAG } from '@/lib/cache-tags'
import { getVerifiedUser } from '@/lib/auth/verify'

type UserStatus = 'approved' | 'rejected'

async function setUserStatus(userId: string, status: UserStatus) {
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

  if (userId === user.id) throw new Error('본인 계정에는 이 작업을 수행할 수 없습니다')

  const { data: targetProfile, error: targetError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single()

  if (targetError) throw new Error(targetError.message)
  if (targetProfile?.role === 'admin') throw new Error('다른 관리자의 상태는 변경할 수 없습니다')

  const { error } = await supabase.from('profiles').update({ status }).eq('id', userId)

  if (error) throw new Error(error.message)

  revalidatePath('/admin')
  // Task 2's getCodingMembers() and Task 4's getTodayCheckinStatus()/getMonthlyFines() all
  // filter on `status = 'approved'`, so a status change must invalidate every cache scope
  // tagged `MEMBER_NAMES_TAG` or an approved/rejected member sits (in)correctly filtered until
  // those scopes' cache windows turn over. `revalidatePath('/admin')` above is unaffected by
  // this and stays for the same reason it always has: /admin itself has no `'use cache'` scope.
  updateTag(MEMBER_NAMES_TAG)
}

export async function approveUser(userId: string) {
  await setUserStatus(userId, 'approved')
}

export async function rejectUser(userId: string) {
  await setUserStatus(userId, 'rejected')
}
