import { useRef } from 'react'
import type { CardMeta } from '@/markdown/types'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Upload } from 'lucide-react'

export function MetaPanel({
  value,
  onChange,
}: {
  value: CardMeta
  onChange: (m: CardMeta) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)

  const uploadAvatar = (file: File) => {
    const r = new FileReader()
    r.onload = () => onChange({ ...value, avatar: r.result as string })
    r.readAsDataURL(file)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <img
          src={value.avatar}
          alt=""
          className="size-12 rounded-full object-cover ring-1 ring-black/10"
        />
        <div className="flex flex-col gap-1">
          <Label className="text-muted-foreground text-xs">头像</Label>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) uploadAvatar(f)
              e.target.value = ''
            }}
          />
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <Upload data-icon="inline-start" /> 上传
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <Label className="text-muted-foreground text-xs">用户名</Label>
        <Input value={value.username} onChange={(e) => onChange({ ...value, username: e.target.value })} />
      </div>

      <div className="flex flex-col gap-1">
        <Label className="text-muted-foreground text-xs">小红书号 @</Label>
        <Input
          value={value.handle}
          onChange={(e) => onChange({ ...value, handle: e.target.value.replace(/\s/g, '') })}
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label className="text-muted-foreground text-xs">日期</Label>
        <Input
          type="date"
          value={value.date}
          onChange={(e) => onChange({ ...value, date: e.target.value })}
        />
      </div>
    </div>
  )
}
