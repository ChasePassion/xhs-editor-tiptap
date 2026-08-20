// 归一化边界：tiptap JSON → 自有 ContentBlock[]。
// unsupported node/mark 一律 throw（不 silent ignore）—— v2.1 adviser 要求。
import type { JSONContent } from '@tiptap/core'
import type { ContentBlock, ImageAlign, InlineNode } from './types'

const SUPPORTED_MARKS = new Set(['bold', 'italic', 'code', 'textColor'])

function inlineFromContent(nodes: JSONContent[] = []): InlineNode[] {
  const out: InlineNode[] = []
  for (const n of nodes) {
    if (n.type === 'text') {
      const marks = n.marks ?? []
      for (const m of marks) {
        if (!SUPPORTED_MARKS.has(m.type)) {
          throw new Error(`不支持的标记: ${m.type}（仅支持 加粗 / 斜体 / 行内代码）`)
        }
      }
      const ms = new Set(marks.map((m) => m.type))
      const colorMark = marks.find((m) => m.type === 'textColor')
      const color = colorMark?.attrs?.color as string | undefined
      out.push({
        type: 'text',
        text: n.text ?? '',
        bold: ms.has('bold'),
        italic: ms.has('italic'),
        code: ms.has('code'),
        ...(color ? { color } : {}),
      })
    } else if (n.type === 'hardBreak') {
      out.push({ type: 'break' })
    } else {
      throw new Error(`段落内不支持的节点: ${n.type ?? '(空)'}`)
    }
  }
  return out
}

function imageBlockFrom(im: JSONContent): ContentBlock {
  return {
    type: 'image',
    src: (im.attrs?.src as string) ?? '',
    alt: im.attrs?.alt as string | undefined,
    align: im.attrs?.align as ImageAlign | undefined,
    width: (im.attrs?.width as number | null) ?? undefined,
  }
}

function blockFromNode(node: JSONContent): ContentBlock[] {
  switch (node.type) {
    case 'heading':
      return [
        {
          type: 'heading',
          level: (node.attrs?.level as number) ?? 2,
          inline: inlineFromContent(node.content),
        },
      ]
    case 'paragraph': {
      const c = node.content ?? []
      const imgs = c.filter((n) => n.type === 'image')
      const onlyImgOrSpace = c.every(
        (n) =>
          n.type === 'image' ||
          (n.type === 'text' && !(n.text ?? '').trim()) ||
          n.type === 'hardBreak',
      )
      if (imgs.length >= 1 && onlyImgOrSpace) {
        return imgs.map(imageBlockFrom)
      }
      return [{ type: 'paragraph', inline: inlineFromContent(c) }]
    }
    case 'image':
      return [imageBlockFrom(node)]
    case 'bulletList':
    case 'orderedList': {
      const items = (node.content ?? [])
        .filter((n) => n.type === 'listItem')
        .map((li) => {
          const p = (li.content ?? []).find((n) => n.type === 'paragraph')
          return p ? inlineFromContent(p.content) : []
        })
      return [{ type: 'list', ordered: node.type === 'orderedList', items }]
    }
    case 'blockquote': {
      const p = (node.content ?? []).find((n) => n.type === 'paragraph')
      return p ? [{ type: 'quote', inline: inlineFromContent(p.content) }] : []
    }
    case 'table': {
      // 首行是表头（tableHeader 单元格）；单元格取第一个段落（单元格内多段落少见）
      const rows = (node.content ?? []).filter((r) => r.type === 'tableRow')
      const cellsOf = (row: JSONContent) => (row.content ?? []).filter((c) => c.type === 'tableCell' || c.type === 'tableHeader')
      const inlineOfCell = (cell: JSONContent): InlineNode[] => {
        const p = (cell.content ?? []).find((n) => n.type === 'paragraph')
        return p ? inlineFromContent(p.content) : []
      }
      const headerRow = rows[0]
      if (!headerRow) return []
      const headerCells = cellsOf(headerRow)
      const align = headerCells.map(
        (c) => (c.attrs?.textAlign as 'left' | 'center' | 'right' | null | undefined) ?? 'left',
      )
      return [
        {
          type: 'table',
          header: headerCells.map(inlineOfCell),
          rows: rows.slice(1).map((r) => cellsOf(r).map(inlineOfCell)),
          align,
        },
      ]
    }
    case 'codeBlock': {
      // codeBlock 的 content 是纯 text 节点（换行内嵌在文本里）
      const code = (node.content ?? []).map((n) => n.text ?? '').join('').replace(/\n$/, '')
      return [{ type: 'code', lang: (node.attrs?.language as string) || 'text', code }]
    }
    case 'horizontalRule':
      return [{ type: 'divider' }]
    default:
      throw new Error(`不支持的节点类型: ${node.type ?? '(空)'}`)
  }
}

export function normalizeTiptapDoc(doc: JSONContent): ContentBlock[] {
  const top = doc.content ?? []
  const blocks: ContentBlock[] = []
  for (const node of top) {
    blocks.push(...blockFromNode(node))
  }
  return blocks
}
