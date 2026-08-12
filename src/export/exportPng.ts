// modern-screenshot 封装：锁 1080×1440、scale=1、白底、内嵌字体。批量导出 + zip。
// 字体策略：两种字体（Noto SC / 普惠体）都已经通过 fonts/index.ts 加载到 document.fonts。
// modern-screenshot 默认会从 document.fonts 自动捕获所需 font-face（按字体名+字重），
// 这里不再额外传 cssText —— 否则 vite 会把 woff2 当作静态资源再次 inline 进 dist，
// 单文件体积翻倍且 woff2 大小超 singlefile inline 阈值反而丢失。
import { domToPng } from 'modern-screenshot'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { prepareExportFont } from '@/fonts/exportFonts'

export type ExportOptions = { nameBase?: string }

export async function exportElementsAsDataUrls(
  els: HTMLElement[],
  onProgress?: (done: number, total: number) => void,
  _opts: ExportOptions = {},
): Promise<string[]> {
  if (els.length === 0) return []
  const exportFont = await prepareExportFont(els[0])
  const out: string[] = []
  for (let i = 0; i < els.length; i++) {
    const url = await domToPng(els[i], {
      width: 1080,
      height: 1440,
      scale: 1,
      backgroundColor: '#FFFFFF',
      type: 'image/png',
      font: { cssText: exportFont.cssText, preferredFormat: 'woff2' },
      onCloneEachNode: exportFont.remapClonedNode,
      features: { copyScrollbar: false, restoreScrollPosition: false },
    })
    out.push(url)
    onProgress?.(i + 1, els.length)
  }
  return out
}

function dataUrlToBlob(url: string): Blob {
  const [head, b64] = url.split(',')
  const mime = head.match(/data:(.*?);/)?.[1] ?? 'image/png'
  const bin = atob(b64)
  const arr = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  return new Blob([arr], { type: mime })
}

export async function downloadZip(urls: string[], opts: ExportOptions = {}): Promise<void> {
  const base = opts.nameBase ?? 'xhs-card'
  const zip = new JSZip()
  urls.forEach((u, i) => {
    const idx = String(i + 1).padStart(2, '0')
    zip.file(`${base}-${idx}.png`, u.split(',')[1] ?? '', { base64: true })
  })
  const blob = await zip.generateAsync({ type: 'blob' })
  saveAs(blob, `${base}.zip`)
}

export function downloadSingle(url: string, filename: string): void {
  saveAs(dataUrlToBlob(url), filename)
}
