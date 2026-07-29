'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function approveUser(userId: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('profiles').update({ status: 'approved' }).eq('id', userId)

  if (error) throw new Error(error.message)

  revalidatePath('/admin')
}

export async function rejectUser(userId: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('profiles').update({ status: 'rejected' }).eq('id', userId)

  if (error) throw new Error(error.message)

  revalidatePath('/admin')
}
