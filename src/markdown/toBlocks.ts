// 归一化边界：tiptap JSON → 自有 ContentBlock[]。
// unsupported node/mark 一律 throw（不 silent ignore）—— v2.1 adviser 要求。
import type { JSONContent } from '@tiptap/core'
import type { ContentBlock, InlineNode } from './types'

const SUPPORTED_MARKS = new Set(['bold', 'italic', 'code'])

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
      out.push({
        type: 'text',
        text: n.text ?? '',
        bold: ms.has('bold'),
        italic: ms.has('italic'),
        code: ms.has('code'),
      })
    } else if (n.type === 'hardBreak') {
      out.push({ type: 'break' })
    } else {
      throw new Error(`段落内不支持的节点: ${n.type ?? '(空)'}`)
    }
  }
  return out
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
        return imgs.map((im) => ({
          type: 'image',
          src: (im.attrs?.src as string) ?? '',
          alt: im.attrs?.alt as string | undefined,
        }))
      }
      return [{ type: 'paragraph', inline: inlineFromContent(c) }]
    }
    case 'image':
      return [
        {
          type: 'image',
          src: (node.attrs?.src as string) ?? '',
          alt: node.attrs?.alt as string | undefined,
        },
      ]
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
