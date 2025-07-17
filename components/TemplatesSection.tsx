'use client'

import { useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import { useState } from 'react'
import Link from 'next/link'
import { Layers, Play, Trash2, MapPin, Briefcase, Bot } from 'lucide-react'
import { StaggerItem } from '@/components/Motion'

export function TemplatesSection() {
  const router = useRouter()
  const templates = trpc.templates.list.useQuery()
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const deleteTemplate = trpc.templates.delete.useMutation({
    onSuccess: () => {
      templates.refetch()
      toast.success('Template deleted')
      setDeleteId(null)
    },
    onError: (e) => toast.error(e.message),
  })

  const list = templates.data ?? []
  if (list.length === 0) return null

  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Layers className="h-4 w-4" />
            My Templates ({list.length})
          </CardTitle>
          <Link
            href="/templates"
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <Bot className="h-3 w-3" /> Autopilot settings →
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex gap-3 overflow-x-auto pb-1">
          {list.map((tpl, idx) => (
            <StaggerItem key={tpl.id} index={idx}>
              <div className="shrink-0 w-[280px] rounded-lg border p-3 space-y-2.5 hover:border-primary/50 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{tpl.name}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Updated {new Date(tpl.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDeleteId(tpl.id)}
                    className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Roles */}
                {tpl.selectedRoles.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {tpl.selectedRoles.slice(0, 3).map((role) => (
                      <Badge key={role} variant="secondary" className="text-[10px] font-normal">
                        {role}
                      </Badge>
                    ))}
                    {tpl.selectedRoles.length > 3 && (
                      <Badge variant="outline" className="text-[10px]">+{tpl.selectedRoles.length - 3}</Badge>
                    )}
                  </div>
                )}

                {/* Meta */}
                <div className="space-y-1">
                  {tpl.region && (
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="truncate">{tpl.region}</span>
                    </div>
                  )}
                  {tpl.industry && (
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Briefcase className="h-3 w-3 shrink-0" />
                      <span className="truncate">{tpl.industry}</span>
                    </div>
                  )}
                </div>

                {/* Feature flags */}
                <div className="flex flex-wrap gap-1 pt-1 border-t">
                  {tpl.useEmailTemplate && <Badge variant="outline" className="text-[9px]">Custom email</Badge>}
                  {tpl.followUpEnabled && <Badge variant="outline" className="text-[9px]">{tpl.maxFollowUps} follow-up{tpl.maxFollowUps > 1 ? 's' : ''}</Badge>}
                  {tpl.abTestEnabled && <Badge variant="outline" className="text-[9px]">A/B test</Badge>}
                  {tpl.attachCv && <Badge variant="outline" className="text-[9px]">CV attached</Badge>}
                </div>

                {/* Action */}
                <Button
                  size="sm"
                  className="w-full"
                  onClick={() => router.push(`/discover?templateId=${tpl.id}`)}
                >
                  <Play className="h-3 w-3 mr-1.5" /> Start Campaign
                </Button>
              </div>
            </StaggerItem>
          ))}
        </div>
      </CardContent>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete template?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the template. Any campaigns created from it will stay.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (deleteId) deleteTemplate.mutate({ id: deleteId }) }}
              disabled={deleteTemplate.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteTemplate.isPending ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
