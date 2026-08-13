import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// 预设色板：中性 + 常用品牌色（含示例蓝 #117CEE、小红书红 #FF2442）
const PRESETS = [
  '#1A1A1A', '#666666', '#999999',
  '#FF2442', '#FF6B35', '#FFB800',
  '#2BA471', '#117CEE', '#5B5BD6',
  '#8B5CF6', '#EC4899', '#00B5C9',
]

export function ColorControl({
  color,
  onColor,
  onClear,
}: {
  color?: string
  onColor: (c: string) => void
  onClear: () => void
}) {
  const [open, setOpen] = useState(false)
  const [hex, setHex] = useState(color ?? '')
  const ref = useRef<HTMLDivElement>(null)

  // 打开时/选中颜色变化时，同步输入框
  useEffect(() => {
    setHex(color ?? '')
  }, [color, open])

  // 点击外部关闭
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const applyHex = (raw: string) => {
    const v = raw.trim()
    if (!v) return
    onColor(v)
    setOpen(false)
  }

  return (
    <div className="relative" ref={ref}>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen((o) => !o)}
        title="文字颜色"
        aria-label="文字颜色"
      >
        <span className="inline-flex flex-col items-center leading-none">
          <span className="text-[13px] font-semibold" style={{ color: color || undefined }}>
            A
          </span>
          <span
            className="mt-[2px] h-[3px] w-3.5 rounded-sm"
            style={{ background: color || 'var(--foreground)' }}
          />
        </span>
      </Button>
      {open && (
        <div className="xhs-color-popover" role="dialog">
          <div className="grid grid-cols-6 gap-1">
            {PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                className="h-5 w-5 rounded border border-border"
                style={{
                  background: c,
                  outline: color?.toLowerCase() === c.toLowerCase() ? '2px solid var(--ring)' : 'none',
                }}
                title={c}
                onClick={() => {
                  onColor(c)
                  setOpen(false)
                }}
              />
            ))}
          </div>
          <div className="mt-2 flex items-center gap-1">
            <Input
              className="h-7 flex-1 text-xs"
              placeholder="#117CEE"
              value={hex}
              onChange={(e) => setHex(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyHex(hex)
              }}
            />
            <Button size="sm" className="h-7 px-2 text-xs" onClick={() => applyHex(hex)}>
              应用
            </Button>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="mt-1 h-7 w-full text-xs"
            onClick={() => {
              onClear()
              setOpen(false)
            }}
          >
            清除颜色
          </Button>
        </div>
      )}
    </div>
  )
}
