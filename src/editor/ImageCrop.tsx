// 图片裁剪覆盖层：悬浮在被裁剪的图片上方，裁剪框初始覆盖全图，
// 四角 + 四边中点可拖动调整大小，拖动框体内部可整体移动，Esc 取消。
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

type Rect = { x: number; y: number; w: number; h: number }
type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'move'

const MIN_SIZE = 24
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

function applyDrag(kind: Handle, orig: Rect, dx: number, dy: number, W: number, H: number): Rect {
  if (kind === 'move') {
    return { x: clamp(orig.x + dx, 0, W - orig.w), y: clamp(orig.y + dy, 0, H - orig.h), w: orig.w, h: orig.h }
  }
  // 图片本身比最小尺寸还小时，放宽下限避免出现负宽高
  const minW = Math.min(MIN_SIZE, W)
  const minH = Math.min(MIN_SIZE, H)
  let x1 = orig.x
  let y1 = orig.y
  let x2 = orig.x + orig.w
  let y2 = orig.y + orig.h
  if (kind.includes('w')) x1 = clamp(x1 + dx, 0, x2 - minW)
  if (kind.includes('e')) x2 = clamp(x2 + dx, x1 + minW, W)
  if (kind.includes('n')) y1 = clamp(y1 + dy, 0, y2 - minH)
  if (kind.includes('s')) y2 = clamp(y2 + dy, y1 + minH, H)
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }
}

export function ImageCropOverlay({
  img,
  onConfirm,
  onCancel,
}: {
  img: HTMLImageElement
  onConfirm: (dataUrl: string) => void
  onCancel: () => void
}) {
  // 图片在视口中的显示位置（fixed 定位，随编辑器滚动/窗口变化重算）
  const [box, setBox] = useState<{ left: number; top: number; w: number; h: number } | null>(null)
  // 裁剪框，坐标相对图片显示区域，初始覆盖全图
  const [rect, setRect] = useState<Rect | null>(null)
  const dragRef = useRef<{ kind: Handle; startX: number; startY: number; orig: Rect } | null>(null)

  const measure = useCallback(() => {
    const r = img.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) return
    setBox({ left: r.left, top: r.top, w: r.width, h: r.height })
    setRect((cur) => cur ?? { x: 0, y: 0, w: r.width, h: r.height })
  }, [img])

  useLayoutEffect(() => {
    measure()
    // scroll 事件不冒泡，capture 阶段监听 window 才能捕获编辑器内部滚动
    window.addEventListener('scroll', measure, true)
    window.addEventListener('resize', measure)
    return () => {
      window.removeEventListener('scroll', measure, true)
      window.removeEventListener('resize', measure)
    }
  }, [measure])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const startDrag = (kind: Handle) => (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!rect) return
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { kind, startX: e.clientX, startY: e.clientY, orig: { ...rect } }
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (!d || !box) return
    setRect(applyDrag(d.kind, d.orig, e.clientX - d.startX, e.clientY - d.startY, box.w, box.h))
  }

  const endDrag = () => {
    dragRef.current = null
  }

  const confirm = () => {
    const nw = img.naturalWidth
    const nh = img.naturalHeight
    if (!box || !rect || !nw || !nh || rect.w < 1 || rect.h < 1) {
      onCancel()
      return
    }
    // 显示坐标 → 原图像素坐标（显示时保持纵横比，等比映射），按原图分辨率裁剪保证导出清晰度
    const x1 = clamp(Math.round((rect.x / box.w) * nw), 0, nw - 1)
    const y1 = clamp(Math.round((rect.y / box.h) * nh), 0, nh - 1)
    const x2 = clamp(Math.round(((rect.x + rect.w) / box.w) * nw), x1 + 1, nw)
    const y2 = clamp(Math.round(((rect.y + rect.h) / box.h) * nh), y1 + 1, nh)
    const w = x2 - x1
    const h = y2 - y1
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      onCancel()
      return
    }
    ctx.drawImage(img, x1, y1, w, h, 0, 0, w, h)
    const isJpeg = img.src.startsWith('data:image/jpeg')
    onConfirm(isJpeg ? canvas.toDataURL('image/jpeg', 0.92) : canvas.toDataURL('image/png'))
  }

  if (!box || !rect) return null

  return (
    <div
      className="xhs-crop-overlay"
      style={{ left: box.left, top: box.top, width: box.w, height: box.h }}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {/* 四块遮罩盖住裁剪框之外的区域 */}
      <div className="xhs-crop-mask" style={{ left: 0, top: 0, width: box.w, height: rect.y }} />
      <div
        className="xhs-crop-mask"
        style={{ left: 0, top: rect.y + rect.h, width: box.w, height: Math.max(0, box.h - rect.y - rect.h) }}
      />
      <div className="xhs-crop-mask" style={{ left: 0, top: rect.y, width: rect.x, height: rect.h }} />
      <div
        className="xhs-crop-mask"
        style={{ left: rect.x + rect.w, top: rect.y, width: Math.max(0, box.w - rect.x - rect.w), height: rect.h }}
      />

      <div
        className="xhs-crop-rect"
        style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
        onPointerDown={startDrag('move')}
      >
        {/* 三分参考线 */}
        <div className="xhs-crop-guide v" style={{ left: '33.3%' }} />
        <div className="xhs-crop-guide v" style={{ left: '66.6%' }} />
        <div className="xhs-crop-guide h" style={{ top: '33.3%' }} />
        <div className="xhs-crop-guide h" style={{ top: '66.6%' }} />
        {HANDLES.map((k) => (
          <div key={k} className={`xhs-crop-handle ${k}`} onPointerDown={startDrag(k)} />
        ))}
      </div>

      <div className="xhs-crop-actions">
        <Button size="sm" variant="secondary" onClick={onCancel}>
          <X data-icon="inline-start" /> 取消
        </Button>
        <Button size="sm" onClick={confirm}>
          <Check data-icon="inline-start" /> 确定
        </Button>
      </div>
    </div>
  )
}
