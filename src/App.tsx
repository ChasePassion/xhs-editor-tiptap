import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { toast } from 'sonner'
import type { JSONContent } from '@tiptap/core'
import { normalizeTiptapDoc } from '@/markdown/toBlocks'
import { prepareMermaidBlocks } from '@/markdown/mermaid'
import { paginate } from '@/pagination/engine'
import { ensureFontsLoaded, findUnsupportedGlyph, FONT_FAMILIES } from '@/fonts'
import { RenderHost, type RenderHostHandle } from '@/render/RenderHost'
import { CardTemplate } from '@/template/CardTemplate'
import { StylePanel } from '@/controls/StylePanel'
import { MetaPanel } from '@/controls/MetaPanel'
import { TiptapEditor } from '@/editor/TiptapEditor'
import { exportElementsAsDataUrls, downloadZip } from '@/export/exportPng'
import {
  DEFAULT_META,
  DEFAULT_STYLE,
  type CardMeta,
  type ContentBlock,
  type InlineNode,
  type Page,
  type StyleParams,
} from '@/markdown/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ChevronDown, Download, RotateCcw, Wand2 } from 'lucide-react'

const CARD_WIDTH = 1080
const CARD_HEIGHT = 1440
const PREVIEW_SCALE = 0.38

function loadStyle(): StyleParams {
  try {
    const s = localStorage.getItem('xhs-style')
    if (s) return { ...DEFAULT_STYLE, ...JSON.parse(s) }
  } catch {
    /* ignore */
  }
  return DEFAULT_STYLE
}

function inlineTextOf(inline: InlineNode[]): string {
  let s = ''
  for (const n of inline) if (n.type === 'text') s += n.text
  return s
}

function blocksText(blocks: ContentBlock[]): string {
  const out: string[] = []
  for (const b of blocks) {
    if (b.type === 'heading' || b.type === 'paragraph' || b.type === 'quote') out.push(inlineTextOf(b.inline))
    else if (b.type === 'list') for (const it of b.items) out.push(inlineTextOf(it))
    else if (b.type === 'table') for (const row of [b.header, ...b.rows]) for (const cell of row) out.push(inlineTextOf(cell))
    else if (b.type === 'code') out.push(b.code)
  }
  return out.join('')
}

export default function App() {
  const [style, setStyle] = useState<StyleParams>(loadStyle)
  const [meta, setMeta] = useState<CardMeta>(DEFAULT_META)
  const [pages, setPages] = useState<Page[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [badGlyph, setBadGlyph] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState('')
  const [hasDoc, setHasDoc] = useState(false)
  const [docVersion, setDocVersion] = useState(0)
  const hostRef = useRef<RenderHostHandle>(null)
  const docRef = useRef<JSONContent | null>(null)

  const onDocChange = useCallback((json: JSONContent) => {
    docRef.current = json
    setHasDoc(true)
    setError(null)
    setDocVersion((version) => version + 1)
  }, [])

  useEffect(() => {
    localStorage.setItem('xhs-style', JSON.stringify(style))
  }, [style])

  const runPaginate = useCallback(async ({ syncCommit = false }: { syncCommit?: boolean } = {}) => {
    await ensureFontsLoaded()
    const host = hostRef.current?.getMeasureHost()
    if (!host || !docRef.current) return
    try {
      const rawBlocks = normalizeTiptapDoc(docRef.current)
      // ```mermaid 块先预渲染成 svg（按当前字体缓存），失败降级为代码文本
      const prepared = await prepareMermaidBlocks(rawBlocks, FONT_FAMILIES[style.font])
      const blocks = prepared.blocks
      const imgs = blocks
        .filter((b) => b.type === 'image')
        .map((b) => (b as { src: string }).src)
      await Promise.all(
        imgs.map(
          (src) =>
            new Promise<void>((res) => {
              const im = new Image()
              im.onload = () => res()
              im.onerror = () => res()
              im.src = src
            }),
        ),
      )
      const result = paginate(blocks, host)
      if (syncCommit) flushSync(() => setPages(result.pages))
      else setPages(result.pages)
      setWarnings([...prepared.warnings, ...result.warnings])
      setError(null)
      setBadGlyph(findUnsupportedGlyph(blocksText(blocks)))
    } catch (e) {
      setError((e as Error).message)
      setPages([])
    }
  }, [style.font])

  // 编辑与排版参数变化后防抖分页，保证预览始终对应最新文档。
  useEffect(() => {
    const t = setTimeout(() => void runPaginate(), 300)
    return () => clearTimeout(t)
  }, [style, docVersion, runPaginate])

  const handleExport = async () => {
    if (!hostRef.current) return
    setExporting(true)
    setProgress('')
    try {
      await runPaginate({ syncCommit: true })
      await ensureFontsLoaded()
      const els = hostRef.current.getExportEls()
      if (els.length === 0) {
        toast.error('没有可导出的内容')
        return
      }
      await Promise.all(
        els.flatMap((el) =>
          Array.from(el.querySelectorAll('img')).map((im) =>
            (im as HTMLImageElement).complete
              ? Promise.resolve()
              : (im as HTMLImageElement).decode().catch(() => {}),
          ),
        ),
      )
      const urls = await exportElementsAsDataUrls(els, (d, t) => setProgress(`${d}/${t}`))
      await downloadZip(urls, { nameBase: `xhs-${meta.handle}` })
      toast.success(`已导出 ${urls.length} 张图片`)
    } catch (e) {
      toast.error('导出失败：' + (e as Error).message)
    } finally {
      setExporting(false)
      setProgress('')
    }
  }

  return (
    <div className="bg-muted/30 text-foreground min-h-screen">
      <header className="bg-background sticky top-0 z-10 flex h-14 items-center gap-3 border-b px-4">
        <h1 className="text-base font-semibold">小红书图文编辑器</h1>
        <Badge variant="secondary">{pages.length} 页</Badge>
        <Badge variant="outline">1080 × 1440</Badge>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" onClick={() => void runPaginate()} disabled={!hasDoc}>
            <Wand2 data-icon="inline-start" /> 自动分页
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting || !hasDoc}>
            <Download data-icon="inline-start" />
            {exporting ? progress || '导出中…' : '导出 PNG'}
          </Button>
        </div>
      </header>

      <main className="grid grid-cols-[minmax(340px,1fr)_minmax(360px,1.6fr)_300px] gap-4 p-4">
        <section className="bg-background rounded-lg border p-3">
          <TiptapEditor onDocChange={onDocChange} />
        </section>

        <section className="bg-background rounded-lg border p-3">
          <ScrollArea className="h-[calc(100vh-120px)]">
            <div className="flex flex-wrap gap-4">
              {pages.map((p, i) => (
                <div
                  key={i}
                  className="relative overflow-hidden rounded-md shadow-md ring-1 ring-black/5"
                  style={{
                    width: CARD_WIDTH * PREVIEW_SCALE,
                    height: CARD_HEIGHT * PREVIEW_SCALE,
                  }}
                >
                  <div
                    style={{
                      transform: `scale(${PREVIEW_SCALE})`,
                      transformOrigin: 'top left',
                      width: CARD_WIDTH,
                    }}
                  >
                    <CardTemplate page={p} meta={meta} style={style} />
                  </div>
                </div>
              ))}
              {pages.length === 0 && (
                <div className="text-muted-foreground p-8 text-sm">
                  {error ? '' : '点「自动分页」生成预览'}
                </div>
              )}
            </div>
          </ScrollArea>
        </section>

        <aside className="bg-background flex flex-col rounded-lg border p-3">
          <ScrollArea className="h-[calc(100vh-120px)]">
            <div className="flex flex-col gap-4 pr-3">
              <section className="flex flex-col gap-3">
                <h2 className="text-sm font-semibold">账号信息</h2>
                <MetaPanel value={meta} onChange={setMeta} />
              </section>
              <Separator />
              <Collapsible defaultOpen>
                <div className="flex items-center justify-between">
                  <CollapsibleTrigger className="flex items-center gap-2">
                    <span className="text-sm font-semibold">排版参数</span>
                    <ChevronDown className="size-4" />
                  </CollapsibleTrigger>
                  <Button variant="ghost" size="sm" onClick={() => setStyle(DEFAULT_STYLE)}>
                    <RotateCcw data-icon="inline-start" /> 重置
                  </Button>
                </div>
                <CollapsibleContent>
                  <div className="mt-3">
                    <StylePanel value={style} onChange={setStyle} />
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          </ScrollArea>
        </aside>
      </main>

      {(error || warnings.length > 0 || badGlyph) && (
        <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 pb-6">
          {error && (
            <Alert variant="destructive">
              <AlertTitle>内容解析失败</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {badGlyph && (
            <Alert variant="destructive">
              <AlertTitle>含不支持的字形</AlertTitle>
              <AlertDescription>
                内容含「{badGlyph}」（Emoji/特殊符号），Noto Sans SC 不含该字形，导出会缺失，请移除。
              </AlertDescription>
            </Alert>
          )}
          {warnings.map((w, i) => (
            <Alert key={i}>
              <AlertDescription>{w}</AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      <RenderHost ref={hostRef} pages={pages} meta={meta} style={style} />
    </div>
  )
}
