// mermaid 预渲染：在分页前把 ```mermaid 代码块渲染成内联 svg。
// - 懒加载 mermaid（首个 mermaid 块出现才 import），结果按 字体+源码 缓存；
// - svg 的 font-family 全部剥掉 → 继承 .xhs-card 的 inline fontFamily，
//   导出时 exportFonts.remapClonedNode 改写卡片根节点字体即可连带生效；
// - 保留 viewBox、记录自然尺寸，去掉外部 width/height，由分页引擎按可用空间缩放。
import type { Mermaid } from 'mermaid'
import type { ContentBlock, DiagramSvg } from './types'

let mermaidPromise: Promise<Mermaid> | null = null
let renderQueue: Promise<unknown> = Promise.resolve()
let seq = 0
const cache = new Map<string, DiagramSvg | null>()

function getMermaid(): Promise<Mermaid> {
  if (!mermaidPromise) mermaidPromise = import('mermaid').then((m) => m.default)
  return mermaidPromise
}

// svg 内所有 font-family 声明（属性 / inline style / 内嵌 <style>）都删掉，
// 让文字字体走 DOM 继承（卡片根节点），保证预览与导出字形一致。
function stripFontFamilies(svg: SVGSVGElement) {
  svg.removeAttribute('font-family')
  for (const el of Array.from(svg.querySelectorAll('*'))) {
    el.removeAttribute?.('font-family')
    if (el instanceof SVGElement && el.style.fontFamily) el.style.removeProperty('font-family')
    const tag = el.tagName.toLowerCase()
    if (tag === 'style' && el.textContent) {
      el.textContent = el.textContent.replace(/font-family\s*:[^;}]+;?/g, '')
    }
  }
}

function normalizeSvg(svgText: string): DiagramSvg {
  const doc = new DOMParser().parseFromString(svgText, 'text/html')
  const svg = doc.body.firstElementChild as SVGSVGElement | null
  if (!svg || svg.tagName.toLowerCase() !== 'svg') throw new Error('mermaid 未返回有效 svg')
  const vb = (svg.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number)
  let w = Number.parseFloat(svg.getAttribute('width') ?? '') || (vb.length === 4 ? vb[2] : 0)
  let h = Number.parseFloat(svg.getAttribute('height') ?? '') || (vb.length === 4 ? vb[3] : 0)
  if (!(w > 0 && h > 0) && vb.length === 4) {
    w = vb[2]
    h = vb[3]
  }
  if (!(w > 0 && h > 0)) throw new Error('mermaid svg 缺少尺寸信息')
  stripFontFamilies(svg)
  svg.removeAttribute('width')
  svg.removeAttribute('height')
  svg.removeAttribute('style')
  if (!svg.getAttribute('viewBox')) svg.setAttribute('viewBox', `0 0 ${w} ${h}`)
  return { html: svg.outerHTML, w, h }
}

export async function renderMermaid(code: string, fontFamily: string): Promise<DiagramSvg | null> {
  const key = `${fontFamily}\n${code}`
  if (cache.has(key)) return cache.get(key) ?? null
  // 串行化：mermaid.initialize 是全局配置，字体不同时不能并发渲染
  const job = renderQueue.then(async () => {
    const mermaid = await getMermaid()
    mermaid.initialize({
      startOnLoad: false,
      theme: 'neutral',
      fontFamily: `${fontFamily}, sans-serif`,
      flowchart: { htmlLabels: false, useMaxWidth: false },
    })
    const { svg } = await mermaid.render(`xhs-mmd-${seq++}`, code)
    return normalizeSvg(svg)
  })
  renderQueue = job.catch(() => undefined)
  try {
    const out = await job
    cache.set(key, out)
    return out
  } catch {
    cache.set(key, null)
    return null
  }
}

export async function prepareMermaidBlocks(
  blocks: ContentBlock[],
  fontFamily: string,
): Promise<{ blocks: ContentBlock[]; warnings: string[] }> {
  const warnings: string[] = []
  const out = await Promise.all(
    blocks.map(async (b): Promise<ContentBlock> => {
      if (b.type !== 'code' || b.lang !== 'mermaid' || !b.code.trim()) return b
      const diagram = await renderMermaid(b.code, fontFamily)
      if (!diagram) {
        warnings.push('mermaid 图渲染失败，已按代码文本显示，请检查图表语法')
        return b
      }
      return { ...b, diagram }
    }),
  )
  return { blocks: out, warnings }
}
