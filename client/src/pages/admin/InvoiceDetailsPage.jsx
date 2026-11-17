import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import PageHeader from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import SlipPreview from '@/components/feature/admin/SlipPreview'
import { useStoreProfile } from '@/hooks/useStoreProfile'

const EMPTY_FORM = {
  name: '',
  branch: '',
  address: '',
  phone: '',
  warning: '',
  returnInstructions: '',
}

export default function InvoiceDetailsPage() {
  const { t } = useTranslation()
  const { storeProfile, saveStoreProfile, isSaving, isLoading, isLoaded } =
    useStoreProfile()
  const [form, setForm] = useState(EMPTY_FORM)

  // Sync from server only after a successful load — never wipe while typing.
  useEffect(() => {
    if (!isLoaded) return
    setForm(storeProfile)
  }, [isLoaded, storeProfile])

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))

  const isDirty =
    isLoaded && JSON.stringify(form) !== JSON.stringify(storeProfile)

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error(t('invoiceDetailsAdmin.nameRequired'))
      return
    }
    const result = await saveStoreProfile(form)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    toast.success(t('invoiceDetailsAdmin.savedToast'))
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <PageHeader
        title={t('invoiceDetailsAdmin.title')}
        subtitle={t('invoiceDetailsAdmin.subtitle')}
      />

      <Card className="mx-auto w-full max-w-2xl overflow-visible border-border shadow-sm">
        <CardContent className="space-y-4 overflow-visible p-5">
          {isLoading && !isLoaded ? (
            <p className="text-sm text-muted-foreground">
              {t('invoiceDetailsAdmin.loading')}
            </p>
          ) : null}

          {/* Live preview from form state — real saved/edited values, no dummy copy */}
          <SlipPreview profile={form} />
        </CardContent>
      </Card>
    </div>
  )
}
