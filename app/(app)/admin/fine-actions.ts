'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function setCheckinPostPaid(postId: string, paid: boolean) {
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
    .from('checkin_posts')
    .update({
      paid,
      paid_at: paid ? new Date().toISOString() : null,
      paid_by: paid ? user.id : null,
    })
    .eq('id', postId)

  if (error) throw new Error(error.message)

  revalidatePath('/admin')
  revalidatePath('/')
}

export async function cancelCheckinFine(postId: string) {
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

  const { error } = await supabase.from('checkin_posts').update({ fine_amount: 0 }).eq('id', postId)

  if (error) throw new Error(error.message)

  revalidatePath('/admin')
  revalidatePath('/')
}

export async function addManualFine(formData: FormData) {
  const userId = (formData.get('userId') as string) || ''
  const amount = Number(formData.get('amount'))
  const reason = ((formData.get('reason') as string) || '').trim()

  if (!userId) throw new Error('대상 멤버를 선택해주세요')
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('금액은 1 이상의 정수여야 합니다')
  if (!reason) throw new Error('사유를 입력해주세요')

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

  const { data: targetProfile, error: targetError } = await supabase
    .from('profiles')
    .select('status')
    .eq('id', userId)
    .single()

  if (targetError) throw new Error(targetError.message)
  if (!targetProfile || targetProfile.status !== 'approved') {
    throw new Error('승인된 멤버에게만 벌금을 부과할 수 있습니다')
  }

  const { error } = await supabase.from('manual_fines').insert({
    user_id: userId,
    amount,
    reason,
    created_by: user.id,
  })

  if (error) throw new Error(error.message)

  revalidatePath('/admin')
  revalidatePath('/')
}

export async function deleteManualFine(fineId: string) {
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

  const { error } = await supabase.from('manual_fines').delete().eq('id', fineId)

  if (error) throw new Error(error.message)

  revalidatePath('/admin')
  revalidatePath('/')
}
