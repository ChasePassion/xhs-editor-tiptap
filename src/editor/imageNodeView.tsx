// 图片 NodeView：渲染 align / width，选中且可编辑时右下角出现拖拽手柄调整宽度（内容宽度百分比）。
// 拖拽过程中只更新本地 state，松手才 updateAttributes 提交事务，避免污染 undo 栈。
import { useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { NodeViewWrapper } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/core'
import type { ImageAlign } from '@/markdown/types'

const MIN_PCT = 5
const MAX_PCT = 100

export function ImageView({ node, updateAttributes, selected, editor }: NodeViewProps) {
  const align = (node.attrs.align as ImageAlign) ?? 'center'
  const attrWidth = node.attrs.width as number | null
  const [dragWidth, setDragWidth] = useState<number | null>(null)
  const dragRef = useRef<{ startX: number; startPct: number; containerW: number } | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const width = dragWidth ?? attrWidth

  const onHandleDown = (e: ReactPointerEvent<HTMLSpanElement>) => {
    e.preventDefault()
    e.stopPropagation()
    const containerW = wrapRef.current?.parentElement?.clientWidth ?? 0
    const displayW = wrapRef.current?.getBoundingClientRect().width ?? 0
    if (!containerW || !displayW) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = {
      startX: e.clientX,
      // 无 width 属性（自然宽度）时，以当前显示宽度换算成百分比作为起点
      startPct: attrWidth ?? (displayW / containerW) * 100,
      containerW,
    }
  }

  const onHandleMove = (e: ReactPointerEvent<HTMLSpanElement>) => {
    const d = dragRef.current
    if (!d) return
    const pct = Math.min(MAX_PCT, Math.max(MIN_PCT, d.startPct + ((e.clientX - d.startX) / d.containerW) * 100))
    setDragWidth(Math.round(pct))
  }

  const onHandleUp = () => {
    if (!dragRef.current) return
    dragRef.current = null
    if (dragWidth != null && dragWidth !== attrWidth) updateAttributes({ width: dragWidth })
    setDragWidth(null)
  }

  return (
    <NodeViewWrapper>
      <div
        ref={wrapRef}
        className="xhs-img-wrap"
        data-align={align}
        style={width ? { width: `${width}%` } : undefined}
      >
        <img src={node.attrs.src} alt={(node.attrs.alt as string) ?? ''} />
        {selected && editor.isEditable && (
          <span
            className="xhs-img-resize"
            title="拖动调整宽度"
            onPointerDown={onHandleDown}
            onPointerMove={onHandleMove}
            onPointerUp={onHandleUp}
            onPointerCancel={onHandleUp}
          />
        )}
      </div>
    </NodeViewWrapper>
  )
}
