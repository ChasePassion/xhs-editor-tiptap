// 分页引擎 —— off-screen measurement host 真实测量 + 段内 Range 几何二分。
// v3：文本块（段落/引用）按行级切分 —— 分页边界落在块中间就从中间切开，
//     不再把整个块推到下一页；支持 code（纯代码）与 diagram（mermaid svg）块。
import type { ContentBlock, DiagramSvg, InlineNode, Page, PageItem } from '@/markdown/types'

export type MeasureHost = {
  cardEl: HTMLElement
  contentEl: HTMLElement
  headerEl: HTMLElement
}

const CARD_H = 1440
const BOTTOM_SAFE = 40

/** 段内文本长度（hardBreak 不占文本位，只影响换行） */
function textLen(inline: InlineNode[]): number {
  return inline.reduce((s, n) => s + (n.type === 'text' ? n.text.length : 0), 0)
}

/**
 * 在文本偏移处切开 inline（break 归左侧）。at 是「文本位」而非「节点位」，
 * 与 bisectTextOffset 的 Range 度量空间一致，含 hardBreak 的段落才不会切错位置。
 */
export function splitInlineAtText(inline: InlineNode[], at: number): [InlineNode[], InlineNode[]] {
  const left: InlineNode[] = []
  let used = 0
  let i = 0
  for (; i < inline.length; i++) {
    const n = inline[i]
    if (n.type === 'break') {
      left.push(n)
      continue
    }
    if (used + n.text.length <= at) {
      left.push(n)
      used += n.text.length
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
    e.style.cssText = `${SYN}; font-style: normal`
    e.textContent = n.text
    parent.appendChild(e)
    return
  }
  const t = document.createTextNode(n.text)
  parent.appendChild(t)
}

function domFromInline(inline: InlineNode[], parent: Node) {
  for (const n of inline) appendRun(n, parent)
}

/** diagram 按页内可用空间等比缩放（小图最多放大 2 倍，文字观感与正文协调） */
function diagramSize(d: DiagramSvg, avail: { w: number; h: number }): { w: number; h: number } {
  const scale = Math.min(avail.w / d.w, avail.h / d.h, 2)
  return { w: Math.round(d.w * scale), h: Math.round(d.h * scale) }
}

function makeBlockEl(block: ContentBlock, avail: { w: number; h: number }): HTMLElement {
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
      img.dataset.align = block.align ?? 'center'
      if (block.width) img.style.width = `${block.width}%`
      return img
    }
    case 'code': {
      if (block.diagram) {
        // svg 的 font-family 已剥掉 → 继承 .xhs-card 根节点 inline 字体（导出 remap 一并生效）
        const wrap = document.createElement('div')
        wrap.className = 'xhs-diagram'
        const { w, h } = diagramSize(block.diagram, avail)
        wrap.style.width = `${w}px`
        wrap.style.height = `${h}px`
        wrap.innerHTML = block.diagram.html
        return wrap
      }
      const pre = document.createElement('pre')
      pre.className = 'xhs-code'
      pre.dataset.lang = block.lang
      const code = document.createElement('code')
      code.textContent = block.code
      pre.appendChild(code)
      return pre
    }
    case 'list': {
      const list = document.createElement(block.ordered ? 'ol' : 'ul')
      list.className = 'xhs-list'
      // 分页切出的续页有序列表：从断点编号继续（<ol start>）
      if (block.ordered && block.start) list.setAttribute('start', String(block.start))
      for (const it of block.items) {
        const li = document.createElement('li')
        domFromInline(it, li)
        list.appendChild(li)
      }
      return list
    }
    case 'table': {
      const table = document.createElement('table')
      table.className = 'xhs-table'
      const thead = document.createElement('thead')
      const headTr = document.createElement('tr')
      block.header.forEach((cell, i) => {
        const th = document.createElement('th')
        th.dataset.align = block.align[i] ?? 'left'
        domFromInline(cell, th)
        headTr.appendChild(th)
      })
      thead.appendChild(headTr)
      table.appendChild(thead)
      const tbody = document.createElement('tbody')
      for (const row of block.rows) {
        const tr = document.createElement('tr')
        row.forEach((cell, i) => {
          const td = document.createElement('td')
          td.dataset.align = block.align[i] ?? 'left'
          domFromInline(cell, td)
          tr.appendChild(td)
        })
        tbody.appendChild(tr)
      }
      table.appendChild(tbody)
      return table
    }
    case 'divider':
    case 'pagebreak':
      return document.createElement('div')
  }
}

function toPageItem(block: ContentBlock, el: HTMLElement, avail: { w: number; h: number }): PageItem {
  switch (block.type) {
    case 'heading':
      return { kind: 'heading', level: block.level, inline: block.inline }
    case 'paragraph':
      return { kind: 'paragraph', inline: block.inline }
    case 'image':
      return { kind: 'image', src: block.src, alt: block.alt, align: block.align, width: block.width }
    case 'quote':
      return { kind: 'quote', inline: block.inline }
    case 'list':
      return block.start
        ? { kind: 'list', ordered: block.ordered, items: block.items, start: block.start }
        : { kind: 'list', ordered: block.ordered, items: block.items }
    case 'table':
      return { kind: 'table', header: block.header, rows: block.rows, align: block.align }
    case 'code': {
      const item: Extract<PageItem, { kind: 'code' }> = { kind: 'code', lang: block.lang, code: block.code }
      if (block.diagram) {
        item.diagram = block.diagram
        item.diagSize = diagramSize(block.diagram, avail)
      } else if (el.style.fontSize) {
        item.size = parseFloat(el.style.fontSize)
      }
      return item
    }
    case 'divider':
    case 'pagebreak':
      return { kind: 'divider' }
  }
}

/** 纯代码块等宽缩字号：white-space:pre 下行超宽时逐步缩小（最小 14px），树形图/ASCII 图不折行 */
function fitCodeFontSize(el: HTMLElement): boolean {
  let size = parseFloat(getComputedStyle(el).fontSize) || 24
  while (el.scrollWidth > el.clientWidth + 1 && size > 14) {
    size -= 1
    el.style.fontSize = `${size}px`
  }
  return el.scrollWidth <= el.clientWidth + 1
}

export function availableHeight(host: MeasureHost): number {
  const cs = getComputedStyle(host.cardEl)
  const padTop = parseFloat(cs.paddingTop) || 0
  const padBottom = parseFloat(cs.paddingBottom) || 0
  const headerH = host.headerEl.getBoundingClientRect().height
  return CARD_H - padTop - padBottom - headerH - BOTTOM_SAFE
}

export type PaginateResult = { pages: Page[]; warnings: string[] }

/**
 * 在 content（可能已含当前页内容）里渲染文本块，二分出「最后一行底边 ≤ max」
 * 的最大文本偏移 —— 行级切分点：同一行内任意偏移的底边相同，结果必然落在行尾。
 */
function bisectTextOffset(
  block: Extract<ContentBlock, { type: 'paragraph' | 'quote' }>,
  content: HTMLElement,
  max: number,
): number {
  const el = makeBlockEl(block, { w: 0, h: 0 })
  content.appendChild(el)
  const contentTop = content.getBoundingClientRect().top
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
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
    range.selectNodeContents(el)
    return range.getBoundingClientRect().bottom - contentTop
  }
  let lo = 0
  let hi = total
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (bottomAt(mid) <= max) lo = mid
    else hi = mid - 1
  }
  content.removeChild(el)
  return lo
}

/**
 * 表格行级切分：在 content（可能已含当前页内容）里渲染表格，数出底边还能落在
 * max 内的正文行数（表头始终保留；续页重复表头，阅读不断档）。
 */
function tableRowsFit(
  block: Extract<ContentBlock, { type: 'table' }>,
  content: HTMLElement,
  max: number,
): number {
  const el = makeBlockEl(block, { w: 0, h: 0 })
  content.appendChild(el)
  const contentTop = content.getBoundingClientRect().top
  const cs = getComputedStyle(el)
  const limit = max - (parseFloat(cs.marginBottom) || 0) - (parseFloat(cs.borderBottomWidth) || 0)
  let fit = 0
  for (const tr of Array.from(el.querySelectorAll('tbody tr'))) {
    if (tr.getBoundingClientRect().bottom - contentTop <= limit) fit++
    else break
  }
  content.removeChild(el)
  return fit
}

/**
 * 列表条目级切分：在 content（可能已含当前页内容）里渲染列表，数出底边还能落在
 * max 内的条目数。切出部分后最后一项 margin 归零（:last-child），
 * 预留 list 自身 margin 即可，方向上只会更宽松。
 */
function listItemsFit(
  block: Extract<ContentBlock, { type: 'list' }>,
  content: HTMLElement,
  max: number,
): number {
  const el = makeBlockEl(block, { w: 0, h: 0 })
  content.appendChild(el)
  const contentTop = content.getBoundingClientRect().top
  const cs = getComputedStyle(el)
  const limit = max - (parseFloat(cs.marginBottom) || 0) - (parseFloat(cs.paddingBottom) || 0)
  let fit = 0
  for (const li of Array.from(el.children)) {
    if ((li as HTMLElement).getBoundingClientRect().bottom - contentTop <= limit) fit++
    else break
  }
  content.removeChild(el)
  return fit
}

export function paginate(blocks: ContentBlock[], host: MeasureHost): PaginateResult {
  const max = availableHeight(host)
  const warnings: string[] = []
  const pages: Page[] = []
  let cur: PageItem[] = []
  const content = host.contentEl
  content.innerHTML = ''
  const avail = { w: content.clientWidth, h: max }
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
    const el = makeBlockEl(block, avail)
    content.appendChild(el)
    if (block.type === 'code' && !block.diagram && !fitCodeFontSize(el)) {
      warnings.push('代码块部分行过长，已缩到最小字号仍可能被截断，请缩短最长行')
    }
    if (content.scrollHeight <= max) {
      cur.push(toPageItem(block, el, avail))
      continue
    }
    content.removeChild(el)
    // 文本块（段落/引用）：行级切分 —— 当前页能装几行装几行，剩余部分进下一页
    if (block.type === 'paragraph' || block.type === 'quote') {
      // 预留该块的 margin-bottom / padding-bottom，保证切完后整页 scrollHeight 仍 ≤ max
      const cs = getComputedStyle(el)
      const reserve = (parseFloat(cs.marginBottom) || 0) + (parseFloat(cs.paddingBottom) || 0)
      const total = textLen(block.inline)
      const at = bisectTextOffset(block, content, max - reserve)
      if (at > 0 && at < total) {
        const [kept, rest] = splitInlineAtText(block.inline, at)
        cur.push(
          block.type === 'paragraph'
            ? { kind: 'paragraph', inline: kept, continued: true }
            : { kind: 'quote', inline: kept },
        )
        flush()
        if (rest.length) queue.unshift({ ...block, inline: rest })
        continue
      }
      // at==0：剩余空间一行都放不下；at==total：仅 margin 溢出（罕见）
      if (cur.length === 0) {
        warnings.push(
          block.type === 'paragraph'
            ? '段落过长或可用高度过小，无法完整切分，请减小字号/边距'
            : '引用块过长或可用高度过小，无法完整切分，请减小字号/边距',
        )
        content.appendChild(el)
        cur.push(toPageItem(block, el, avail))
        flush()
        continue
      }
      flush()
      queue.unshift(block)
      continue
    }
    // 表格：行级切分 —— 当前页装得下的行先走（表头保留），剩余行进下一页并重复表头
    if (block.type === 'table' && block.rows.length > 0) {
      const fit = tableRowsFit(block, content, max)
      if (fit >= block.rows.length) {
        // 行都放得下还溢出（margin/border 取整）：整表直接放
        content.appendChild(el)
        cur.push(toPageItem(block, el, avail))
        flush()
        continue
      }
      if (fit > 0) {
        cur.push({ kind: 'table', header: block.header, rows: block.rows.slice(0, fit), align: block.align })
        flush()
        queue.unshift({ ...block, rows: block.rows.slice(fit) })
        continue
      }
      if (cur.length === 0) {
        warnings.push('表格单行过高，已强制放置（请缩短单元格内容或减少列数）')
        content.appendChild(el)
        cur.push(toPageItem(block, el, avail))
        flush()
        continue
      }
      flush()
      queue.unshift(block)
      continue
    }
    // 列表：条目级切分 —— 当前页装得下的条目先走，剩余条目进下一页（有序列表接续编号）
    if (block.type === 'list' && block.items.length > 0) {
      const fit = listItemsFit(block, content, max)
      if (fit >= block.items.length) {
        // 条目都放得下还溢出（margin 取整）：整表直接放
        content.appendChild(el)
        cur.push(toPageItem(block, el, avail))
        flush()
        continue
      }
      if (fit > 0) {
        cur.push(
          block.start
            ? { kind: 'list', ordered: block.ordered, items: block.items.slice(0, fit), start: block.start }
            : { kind: 'list', ordered: block.ordered, items: block.items.slice(0, fit) },
        )
        flush()
        queue.unshift({
          ...block,
          items: block.items.slice(fit),
          start: block.ordered ? (block.start ?? 1) + fit : undefined,
        })
        continue
      }
      if (cur.length === 0) {
        warnings.push('列表单项过高，已强制放置（请拆分或缩短该条目）')
        content.appendChild(el)
        cur.push(toPageItem(block, el, avail))
        flush()
        continue
      }
      flush()
      queue.unshift(block)
      continue
    }
    if (cur.length === 0) {
      warnings.push(
        block.type === 'image'
          ? '单张图片高度超过一页，请裁剪或缩小后再用'
          : `${block.type} 块过高，已强制放置`,
      )
      content.appendChild(el)
      cur.push(toPageItem(block, el, avail))
      flush()
      continue
    }
    flush()
    queue.unshift(block)
  }
  flush()
  return { pages, warnings }
}
