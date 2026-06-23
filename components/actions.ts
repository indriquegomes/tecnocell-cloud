'use server'

import { createServiceClient, requireAuth } from '@/lib/supabase/server'

export async function uploadFotoReport(formData: FormData): Promise<string | null> {
  await requireAuth()
  try {
    const file = formData.get('file') as File | null
    if (!file || file.size === 0) return null

    const supabase = await createServiceClient()
    const ext = file.name.split('.').pop() ?? 'png'
    const nome = `report-${Date.now()}.${ext}`
    const bytes = await file.arrayBuffer()

    const { error } = await supabase.storage
      .from('reports')
      .upload(nome, bytes, { contentType: file.type, upsert: false })

    if (error) return null

    return supabase.storage.from('reports').getPublicUrl(nome).data.publicUrl
  } catch {
    return null
  }
}
