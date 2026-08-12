import type { CSSProperties, ReactNode } from 'react'
import type { InlineNode } from '@/markdown/types'

type TextRun = { text: string; bold?: boolean; italic?: boolean; code?: boolean }

// 字体族和 font-synthesis 必须内联，供截图克隆层稳定读取；普通文字的字重必须继承
// 上下文，否则标题父层的 700 会被叶子节点错误覆盖成 400。
//
// font-family 来自 props；由父 CardTemplate 调用 makeCssVars 输出 inline 注入到 .xhs-card。
const baseStyle: CSSProperties = {
  fontSynthesis: 'none',
}

function renderText(n: TextRun, family: string): ReactNode {
  const weight: CSSProperties['fontWeight'] = n.bold ? 700 : undefined
  if (n.code) {
    return <code style={{ ...baseStyle, fontFamily: family, fontWeight: weight, fontStyle: 'normal' }}>{n.text}</code>
  }
  if (n.bold && n.italic) {
    return (
      <strong style={{ ...baseStyle, fontFamily: family, fontWeight: 700 }}>
        <em style={{ ...baseStyle, fontFamily: family, fontWeight: 700, fontStyle: 'normal' }}>{n.text}</em>
      </strong>
    )
  }
  if (n.bold) {
    return <strong style={{ ...baseStyle, fontFamily: family, fontWeight: 700 }}>{n.text}</strong>
  }
  if (n.italic) {
    return <em style={{ ...baseStyle, fontFamily: family, fontStyle: 'normal' }}>{n.text}</em>
  }
  return <span style={{ ...baseStyle, fontFamily: family }}>{n.text}</span>
}

export function InlineText({ nodes, fontFamily }: { nodes: InlineNode[]; fontFamily: string }) {
  return (
    <>
      {nodes.map((n, i) =>
        n.type === 'break' ? (
          <br key={i} />
        ) : (
          <span key={i} style={{ ...baseStyle, fontFamily }}>
            {renderText(n, fontFamily)}
          </span>
        ),
      )}
    </>
  )
}
