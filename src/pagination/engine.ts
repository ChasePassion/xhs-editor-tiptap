// 分页引擎 —— off-screen measurement host 真实测量 + 段落内 Range 几何二分。
// v2：适配 TextRun 扁平模型；无水印（BOTTOM_SAFE 留底部呼吸）。
import type { ContentBlock, InlineNode, Page, PageItem } from '@/markdown/types'

export type MeasureHost = {
  cardEl: HTMLElement
  contentEl: HTMLElement
  headerEl: HTMLElement
}

const CARD_H = 1440
const BOTTOM_SAFE = 40

function inlineLen(n: InlineNode): number {
  return n.type === 'text' ? n.text.length : 1
}

export function splitInline(inline: InlineNode[], at: number): [InlineNode[], InlineNode[]] {
  let used = 0
  const left: InlineNode[] = []
  let i = 0
  for (; i < inline.length; i++) {
    const len = inlineLen(inline[i])
    if (used + len <= at) {
      left.push(inline[i])
      used += len
    } else break
  }
  const right: InlineNode[] = []
  if (i < inline.length) {
    const node = inline[i]
    const cut = at - used
    if (node.type === 'text' && cut > 0) {
      const lText = node.text.slice(0, cut)
      const rText = node.text.slice(cut)
      if (lText) left.push({ ...node, text: lText })
      if (rText) right.push({ ...node, text: rText })
    } else {
      right.push(node) // break 或 cut==0 → 归右
    }
    for (let j = i + 1; j < inline.length; j++) right.push(inline[j])
  }
  return [left, right]
}

function appendRun(n: InlineNode, parent: Node) {
  if (n.type === 'break') {
    parent.appendChild(document.createElement('br'))
    return
  }
  // 显式 inline style：防止 foreignObject 内 font-synthesis 自动合成加粗
  const SYN = 'font-synthesis: none'
  if (n.code) {
    const c = document.createElement('code')
    c.textContent = n.text
    c.style.cssText = SYN
    parent.appendChild(c)
    return
  }
  if (n.bold && n.italic) {
    const s = document.createElement('strong')
    s.style.cssText = `${SYN}; font-weight: 700`
    const e = document.createElement('em')
    e.textContent = n.text
    e.style.cssText = `${SYN}; font-weight: 700; font-style: normal`
    s.appendChild(e)
    parent.appendChild(s)
    return
  }
  if (n.bold) {
    const s = document.createElement('strong')
    s.style.cssText = `${SYN}; font-weight: 700`
    s.textContent = n.text
    parent.appendChild(s)
    return
  }
  if (n.italic) {
    const e = document.createElement('em')
    e.textContent = n.text
    e.style.cssText = `${SYN}; font-style: normal`
    parent.appendChild(e)
    return
  }
  const t = document.createTextNode(n.text)
  parent.appendChild(t)
}

function domFromInline(inline: InlineNode[], parent: Node) {
  for (const n of inline) appendRun(n, parent)
}

function makeBlockEl(block: ContentBlock): HTMLElement {
  switch (block.type) {
    case 'heading': {
      const div = document.createElement('div')
      div.className = 'xhs-h'
      div.dataset.level = String(block.level)
      const t = document.createElement('span')
      t.className = 'xhs-h-text'
      domFromInline(block.inline, t)
      div.appendChild(t)
      return div
    }
    case 'paragraph': {
      const p = document.createElement('p')
      p.className = 'xhs-p'
      domFromInline(block.inline, p)
      return p
    }
    case 'quote': {
      const q = document.createElement('blockquote')
      q.className = 'xhs-quote'
      domFromInline(block.inline, q)
      return q
    }
    case 'image': {
      const img = document.createElement('img')
      img.className = 'xhs-img'
      img.src = block.src
      return img
    }
    case 'list': {
      const list = document.createElement(block.ordered ? 'ol' : 'ul')
      list.className = 'xhs-list'
      for (const it of block.items) {
        const li = document.createElement('li')
        domFromInline(it, li)
        list.appendChild(li)
      }
      return list
    }
    case 'divider':
    case 'pagebreak':
      return document.createElement('div')
  }
}

function toPageItem(block: ContentBlock): PageItem {
  switch (block.type) {
    case 'heading':
      return { kind: 'heading', level: block.level, inline: block.inline }
    case 'paragraph':
      return { kind: 'paragraph', inline: block.inline }
    case 'image':
      return { kind: 'image', src: block.src, alt: block.alt }
    case 'quote':
      return { kind: 'quote', inline: block.inline }
    case 'list':
      return { kind: 'list', ordered: block.ordered, items: block.items }
    case 'divider':
    case 'pagebreak':
      return { kind: 'divider' }
  }
}

export function availableHeight(host: MeasureHost): number {
  const cs = getComputedStyle(host.cardEl)
  const padTop = parseFloat(cs.paddingTop) || 0
  const padBottom = parseFloat(cs.paddingBottom) || 0
  const headerH = host.headerEl.getBoundingClientRect().height
  return CARD_H - padTop - padBottom - headerH - BOTTOM_SAFE
}

export type PaginateResult = { pages: Page[]; warnings: string[] }

function bisectParagraphOffset(
  inline: InlineNode[],
  content: HTMLElement,
  max: number,
): number {
  const p = document.createElement('p')
  p.className = 'xhs-p'
  domFromInline(inline, p)
  content.appendChild(p)
  const contentTop = content.getBoundingClientRect().top
  const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT)
  const texts: { node: Text; len: number }[] = []
  let n: Node | null
  while ((n = walker.nextNode())) texts.push({ node: n as Text, len: (n as Text).length })
  const total = texts.reduce((s, t) => s + t.len, 0)
  const range = document.createRange()
  const bottomAt = (offset: number): number => {
    if (offset <= 0) return 0
    let acc = 0
    for (const t of texts) {
      if (acc + t.len >= offset) {
        range.setStart(texts[0].node, 0)
        range.setEnd(t.node, offset - acc)
        const r = range.getBoundingClientRect()
        return r.height > 0 ? r.bottom - contentTop : 0
      }
      acc += t.len
    }
    range.selectNodeContents(p)
    return range.getBoundingClientRect().bottom - contentTop
  }
  let lo = 0
  let hi = total
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (bottomAt(mid) <= max) lo = mid
    else hi = mid - 1
  }
  content.removeChild(p)
  return lo
}

export function paginate(blocks: ContentBlock[], host: MeasureHost): PaginateResult {
  const max = availableHeight(host)
  const warnings: string[] = []
  const pages: Page[] = []
  let cur: PageItem[] = []
  const content = host.contentEl
  content.innerHTML = ''
  const flush = () => {
    if (cur.length) pages.push({ items: cur })
    cur = []
    content.innerHTML = ''
  }
  const queue: ContentBlock[] = [...blocks]
  let guard = 0
  while (queue.length && guard++ < 20000) {
    const block = queue.shift()!
    if (block.type === 'pagebreak') {
      flush()
      continue
    }
    const el = makeBlockEl(block)
    content.appendChild(el)
    if (content.scrollHeight <= max) {
      cur.push(toPageItem(block))
      continue
    }
    content.removeChild(el)
    if (cur.length === 0) {
      if (block.type === 'paragraph') {
        const total = block.inline.reduce((s, n) => s + inlineLen(n), 0)
        const at = bisectParagraphOffset(block.inline, content, max)
        const [kept, rest] = splitInline(block.inline, at)
        if (kept.length) cur.push({ kind: 'paragraph', inline: kept, continued: true })
        flush()
        if (rest.length && at < total) queue.unshift({ type: 'paragraph', inline: rest })
        else if (!kept.length) warnings.push('段落过长或可用高度过小，无法完整切分，请减小字号/边距')
        continue
      }
      warnings.push(
        block.type === 'image'
          ? '单张图片高度超过一页，请裁剪或缩小后再用'
          : `${block.type} 块过高，已强制放置`,
      )
      content.appendChild(el)
      cur.push(toPageItem(block))
      flush()
      continue
    }
    flush()
    queue.unshift(block)
  }
  flush()
  return { pages, warnings }
}
