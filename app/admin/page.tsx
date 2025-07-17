import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/admin'
import { AdminUsageClient } from './AdminUsageClient'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  try {
    await requireAdmin()
  } catch {
    redirect('/dashboard')
  }
  return <AdminUsageClient />
}
