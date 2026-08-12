import type { StyleParams } from '@/markdown/types'
import { FONT_LABELS } from '@/fonts'
import { Slider } from '@/components/ui/slider'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

type Field = {
  key: Exclude<keyof StyleParams, 'font'>
  label: string
  min: number
  max: number
  step: number
  unit?: string
}

const FIELDS: Field[] = [
  { key: 'bodySize', label: '正文字号', min: 20, max: 64, step: 1, unit: 'px' },
  { key: 'lineHeight', label: '行高', min: 1.2, max: 3, step: 0.05 },
  { key: 'letterSpacing', label: '字间距', min: -3, max: 10, step: 0.5, unit: 'px' },
  { key: 'padTop', label: '上边距', min: 16, max: 240, step: 4, unit: 'px' },
  { key: 'padBottom', label: '下边距', min: 16, max: 240, step: 4, unit: 'px' },
  { key: 'padLeft', label: '左边距', min: 16, max: 200, step: 4, unit: 'px' },
  { key: 'padRight', label: '右边距', min: 16, max: 200, step: 4, unit: 'px' },
]

export function StylePanel({
  value,
  onChange,
}: {
  value: StyleParams
  onChange: (p: StyleParams) => void
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label className="text-muted-foreground text-xs">字体</Label>
        <ToggleGroup
          type="single"
          value={value.font}
          onValueChange={(v) => {
            if (v) onChange({ ...value, font: v as StyleParams['font'] })
          }}
          className="justify-start"
        >
          {(Object.keys(FONT_LABELS) as (keyof typeof FONT_LABELS)[]).map((k) => (
            <ToggleGroupItem key={k} value={k} className="px-3 text-xs">
              {FONT_LABELS[k]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      {FIELDS.map((f) => (
        <div key={f.key} className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label className="text-muted-foreground text-xs">{f.label}</Label>
            <div className="flex items-center gap-1">
              <Input
                type="number"
                className="h-7 w-16 text-xs"
                value={value[f.key]}
                min={f.min}
                max={f.max}
                step={f.step}
                onChange={(e) => onChange({ ...value, [f.key]: Number(e.target.value) })}
              />
              {f.unit && <span className="text-muted-foreground text-xs">{f.unit}</span>}
            </div>
          </div>
          <Slider
            value={[value[f.key]]}
            min={f.min}
            max={f.max}
            step={f.step}
            onValueChange={(v) => onChange({ ...value, [f.key]: v[0] })}
          />
        </div>
      ))}
    </div>
  )
}
