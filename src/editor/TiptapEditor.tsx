import { useCallback, useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import type { JSONContent } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'
import { marked } from 'marked'
import { extensions } from './extensions'
import { ColorControl } from './ColorControl'
import { ImageCropOverlay } from './ImageCrop'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Braces,
  Code,
  Crop,
  Heading1,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  List,
  ListOrdered,
  Minus,
  Quote,
  Table as TableIcon,
  Code2,
} from 'lucide-react'
import './editor.css'

marked.use({ gfm: true, breaks: false })

// Raw 模式图片标记：正文里写 ![alt](xhs-img:N)，src/align/width 等属性存在 images 注册表里，
// 避免 base64 塞进 textarea 拖垮每次按键的 markdown 解析。
type RawImageAttrs = { src: string; alt?: string; align?: string; width?: number | null }
const IMG_MARKER_RE = /^!\[([^\]]*)\]\(xhs-img:(\d+)\)$/

function mdToJson(md: string, images: RawImageAttrs[] = []): JSONContent {
  const tokens = marked.lexer(md)
  return { type: 'doc', content: tokens.map((t) => tokenToBlock(t, images)).filter((n): n is JSONContent => Boolean(n)) }
}
function docToRaw(json: JSONContent): { md: string; images: RawImageAttrs[] } {
  const images: RawImageAttrs[] = []
  const md = (json.content ?? []).map((n) => blockToMd(n, images)).join('\n\n').trim() + '\n'
  return { md, images }
}
function tokenToBlock(tok: any, images: RawImageAttrs[]): JSONContent | null {
  switch (tok.type) {
    case 'heading':
      return { type: 'heading', attrs: { level: tok.depth }, content: [{ type: 'text', text: tok.text, marks: [] }] }
    case 'paragraph': {
      // 整段只是一条图片标记 → 还原为图片块（标记 alt 可覆盖注册表里的 alt）
      const im = tok.text?.trim().match(IMG_MARKER_RE)
      if (im) {
        const attrs = images[Number(im[2])]
        if (attrs) {
          const alt = im[1] || attrs.alt || ''
          return { type: 'image', attrs: { ...attrs, alt } }
        }
      }
      return { type: 'paragraph', content: inlineToMarks(tok.text) }
    }
    case 'blockquote':
      return { type: 'blockquote', content: tok.tokens?.filter((t: any) => t.type === 'paragraph').map((p: any) => ({ type: 'paragraph', content: inlineToMarks(p.text) })) ?? [{ type: 'paragraph', content: inlineToMarks(tok.text) }] }
    case 'list':
      return {
        type: tok.ordered ? 'orderedList' : 'bulletList',
        content: tok.items.map((it: any) => ({
          type: 'listItem',
          content: [{ type: 'paragraph', content: inlineToMarks(it.text) }],
        })),
      }
    case 'hr':
      return { type: 'horizontalRule' }
    case 'table': {
      // GFM 管道表：首行进 thead（tableHeader），:---: 对齐存进单元格 textAlign
      const aligns: (string | null)[] = tok.align ?? []
      const cellOf = (cell: any, i: number, header: boolean) => ({
        type: header ? 'tableHeader' : 'tableCell',
        attrs: { textAlign: aligns[i] ?? null },
        content: [{ type: 'paragraph', content: inlineToMarks(cell?.text ?? '') }],
      })
      return {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: (tok.header ?? []).map((c: any, i: number) => cellOf(c, i, true)),
          },
          ...(tok.rows ?? []).map(
            (r: any[]) => ({ type: 'tableRow', content: r.map((c: any, i: number) => cellOf(c, i, false)) }),
          ),
        ],
      }
    }
    case 'code':
      // ```mermaid / ```text 等围栏代码块：language 进 attrs，换行内嵌在 text 节点里
      return {
        type: 'codeBlock',
        attrs: { language: tok.lang || null },
        content: [{ type: 'text', text: String(tok.text ?? '').replace(/\n$/, ''), marks: [] }],
      }
    case 'space':
      return null
    default:
      return null
  }
}
// inlineToMarks：把 marked 的 inline 解析结果简化成一个或多个 text 节点（带 marks）。
// 识别 **...** 加粗、*...* 斜体、`...` 行内代码，以及 <font style="color:...">...</font> 文字颜色。
function inlineToMarks(text: string): JSONContent[] {
  const out: JSONContent[] = []
  let rest = text
  while (rest.length) {
    // 先识别 <font ...>...</font>：内部递归解析加粗/斜体/代码，再把颜色 mark 叠加到每个 text 节点
    const fm = rest.match(/^<font\b([^>]*)>([\s\S]*?)<\/font>\s*/i)
    if (fm) {
      const attrs = fm[1]
      const cm =
        attrs.match(/color\s*:\s*([^;"'>]+)/i) ||
        attrs.match(/\bcolor\s*=\s*["']?([^"'>\s]+)/i)
      const color = cm?.[1]?.trim().replace(/;$/, '')
      const innerNodes = inlineToMarks(fm[2])
      if (color) {
        for (const n of innerNodes) {
          if (n.type === 'text') n.marks = [...(n.marks ?? []), { type: 'textColor', attrs: { color } }]
        }
      }
      out.push(...innerNodes)
      rest = rest.slice(fm[0].length)
      continue
    }
    const m = rest.match(/^(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`)/)
    if (m) {
      if (m[2] !== undefined) out.push({ type: 'text', text: m[2], marks: [{ type: 'bold' }] })
      else if (m[3] !== undefined) out.push({ type: 'text', text: m[3], marks: [{ type: 'italic' }] })
      else if (m[4] !== undefined) out.push({ type: 'text', text: m[4], marks: [{ type: 'code' }] })
      rest = rest.slice(m[0].length)
    } else {
      // 找下一处 **/*/`/<
      const next = rest.search(/[`*<]/)
      const take = next < 0 ? rest.length : next === 0 ? 1 : next
      out.push({ type: 'text', text: rest.slice(0, take), marks: [] })
      rest = rest.slice(take)
    }
  }
  return out.length ? out : [{ type: 'text', text: '', marks: [] }]
}
function blockToMd(node: JSONContent, images: RawImageAttrs[]): string {
  const text = (n: JSONContent) => (n.content ?? []).map(c => c.text ?? '').join('')
  const mdText = (n: JSONContent) => inlineToMd((n.content ?? []).map(c => ({ ...c, marks: c.marks ?? [] })))
  switch (node.type) {
    case 'heading':
      return '#'.repeat((node.attrs?.level as number) ?? 1) + ' ' + text(node) + '\n'
    case 'paragraph':
      return mdText(node)
    case 'image': {
      const attrs = node.attrs ?? {}
      const id = images.length
      images.push({
        src: (attrs.src as string) ?? '',
        alt: attrs.alt as string | undefined,
        align: attrs.align as string | undefined,
        width: (attrs.width as number | null) ?? null,
      })
      return `![${(attrs.alt as string) ?? ''}](xhs-img:${id})`
    }
    case 'blockquote':
      return (node.content ?? []).map(c => '> ' + text(c)).join('\n')
    case 'bulletList':
      return (node.content ?? []).map(c => '- ' + mdText(c.content?.[0] ?? { type: 'paragraph', content: [] })).join('\n')
    case 'orderedList':
      return (node.content ?? []).map((c, i) => `${i + 1}. ` + mdText(c.content?.[0] ?? { type: 'paragraph', content: [] })).join('\n')
    case 'horizontalRule':
      return '---'
    case 'codeBlock': {
      const code = (node.content ?? []).map((c) => c.text ?? '').join('').replace(/\n$/, '')
      const lang = (node.attrs?.language as string) || ''
      return `\`\`\`${lang}\n${code}\n\`\`\``
    }
    case 'table': {
      const cellsOf = (row: JSONContent) => row.content ?? []
      const headerRow = (node.content ?? [])[0]
      if (!headerRow) return ''
      // 对齐标记取表头单元格的 textAlign（与 GFM :--- / :---: / ---: 一一对应）
      const markerOf = (a?: string | null) => (a === 'center' ? ':---:' : a === 'right' ? '---:' : a === 'left' ? ':---' : '---')
      const cellMd = (cell: JSONContent) => {
        const p = (cell.content ?? [])[0]
        const md = inlineToMd((p?.content ?? []).map((c) => ({ ...c, marks: c.marks ?? [] })))
        // 单元格里的 | 会破坏管道表结构，必须转义；换行折叠成空格
        return md.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
      }
      const lines = [
        '| ' + cellsOf(headerRow).map(cellMd).join(' | ') + ' |',
        '| ' + cellsOf(headerRow).map((c) => markerOf(c.attrs?.textAlign as string | null)).join(' | ') + ' |',
        ...(node.content ?? []).slice(1).map((r) => '| ' + cellsOf(r).map(cellMd).join(' | ') + ' |'),
      ]
      return lines.join('\n')
    }
    default:
      return ''
  }
}
function inlineToMd(nodes: { text?: string; marks?: { type: string; attrs?: Record<string, unknown> }[] }[]): string {
  return nodes
    .map((n) => {
      const t = n.text ?? ''
      const ms = new Set((n.marks ?? []).map((m) => m.type))
      const colorMark = (n.marks ?? []).find((m) => m.type === 'textColor')
      const color = colorMark?.attrs?.color as string | undefined
      if (ms.has('code')) return '`' + t + '`'
      let wrapped = (ms.has('bold') ? '**' : '') + (ms.has('italic') ? '*' : '') + t + (ms.has('italic') ? '*' : '') + (ms.has('bold') ? '**' : '')
      if (color) wrapped = `<font style="color:${color}">${wrapped}</font>`
      return wrapped
    })
    .join('')
}

function fileToDataURL(file: File): Promise<string> {
  return new Promise((res) => {
    const r = new FileReader()
    r.onload = () => res(r.result as string)
    r.readAsDataURL(file)
  })
}

function insertImageFile(view: { state: { schema: { nodes: { image: { create: (a: { src: string }) => unknown } } }; tr: { replaceSelectionWith: (n: unknown) => unknown } }; dispatch: (t: unknown) => void }, file: File) {
  fileToDataURL(file).then((src) => {
    const node = view.state.schema.nodes.image.create({ src })
    view.dispatch(view.state.tr.replaceSelectionWith(node))
  })
}

export function TiptapEditor({
  initialDoc,
  onDocChange,
}: {
  initialDoc?: JSONContent
  onDocChange: (json: JSONContent) => void
}) {
  const [mode, setMode] = useState<'rich' | 'raw'>('rich')
  const [rawText, setRawText] = useState<string>('')
  const [cropTarget, setCropTarget] = useState<{ img: HTMLImageElement; pos: number; attrs: Record<string, unknown> } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  // Raw 模式图片注册表：switchToRaw 时重建，标记 xhs-img:N 引用到这里
  const rawImagesRef = useRef<RawImageAttrs[]>([])

  const editor = useEditor({
    extensions,
    content: initialDoc ?? '',
    editorProps: {
      handlePaste: (view, event) => {
        const items = event.clipboardData?.items
        if (!items) return false
        for (const it of Array.from(items)) {
          if (it.type.startsWith('image/')) {
            const f = it.getAsFile()
            if (f) {
              insertImageFile(view as never, f)
              return true
            }
          }
        }
        return false
      },
      handleDrop: (view, event) => {
        const f = (event as DragEvent).dataTransfer?.files?.[0]
        if (f && f.type.startsWith('image/')) {
          insertImageFile(view as never, f)
          return true
        }
        return false
      },
    },
    onCreate: ({ editor }) => onDocChange(editor.getJSON()),
    onUpdate: ({ editor }) => onDocChange(editor.getJSON()),
  })

  const sel = useEditorState({
    editor: editor ?? null,
    selector: ({ editor }) => ({
      bold: editor.isActive('bold'),
      italic: editor.isActive('italic'),
      code: editor.isActive('code'),
      codeBlock: editor.isActive('codeBlock'),
      h1: editor.isActive('heading', { level: 1 }),
      h2: editor.isActive('heading', { level: 2 }),
      h3: editor.isActive('heading', { level: 3 }),
      bullet: editor.isActive('bulletList'),
      ordered: editor.isActive('orderedList'),
      quote: editor.isActive('blockquote'),
      image: editor.state.selection instanceof NodeSelection && editor.state.selection.node.type.name === 'image',
      imgAlign: (editor.getAttributes('image').align as 'left' | 'center' | 'right') ?? 'center',
      color: editor.getAttributes('textColor').color as string | undefined,
    }),
    equalityFn: undefined,
  })

  const onUpload = async (file: File) => {
    if (!editor) return
    const src = await fileToDataURL(file)
    editor.chain().focus().setImage({ src }).run()
    onDocChange(editor.getJSON())
  }

  // 进入裁剪：锁定当前选中的图片节点，期间禁止编辑防止文档结构变化
  const startCrop = useCallback(() => {
    if (!editor) return
    const sel = editor.state.selection
    if (!(sel instanceof NodeSelection) || sel.node.type.name !== 'image') return
    const dom = editor.view.nodeDOM(sel.from)
    const img = dom instanceof HTMLImageElement ? dom : dom instanceof HTMLElement ? dom.querySelector('img') : null
    if (!img) return
    editor.setEditable(false)
    setCropTarget({ img, pos: sel.from, attrs: { ...sel.node.attrs } })
  }, [editor])

  const endCrop = useCallback(() => {
    setCropTarget(null)
    editor?.setEditable(true)
    editor?.commands.focus()
  }, [editor])

  const applyCrop = useCallback(
    (dataUrl: string) => {
      if (editor && cropTarget) {
        const { pos, attrs } = cropTarget
        // 直接替换 src 为裁剪结果（按原图分辨率导出 dataURL），触发 onUpdate 重新分页
        editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...attrs, src: dataUrl }))
      }
      endCrop()
    },
    [editor, cropTarget, endCrop],
  )

  const switchToRaw = useCallback(() => {
    if (!editor) return
    const { md, images } = docToRaw(editor.getJSON())
    rawImagesRef.current = images
    setRawText(md)
    setMode('raw')
  }, [editor])

  const switchToRich = useCallback(() => {
    const json = mdToJson(rawText, rawImagesRef.current)
    editor?.commands.setContent(json)
    setMode('rich')
  }, [editor, rawText])

  // raw 模式下文本变化即更新 docRef（让分页也能跟上）
  useEffect(() => {
    if (mode !== 'raw') return
    try {
      onDocChange(mdToJson(rawText, rawImagesRef.current))
    } catch {
      /* markdown 解析失败时静默忽略，避免输入半成品时报错 */
    }
  }, [mode, rawText, onDocChange])

  if (!editor || !sel) {
    return <div className="xhs-editor">加载中…</div>
  }

  return (
    <div className="xhs-editor">
      <div className="xhs-editor-toolbar">
        {mode === 'rich' ? (
          <>
            <Button size="sm" variant={sel.h1 ? 'default' : 'outline'} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
              <Heading1 />
            </Button>
            <Button size="sm" variant={sel.h2 ? 'default' : 'outline'} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
              <Heading2 />
            </Button>
            <Button size="sm" variant={sel.h3 ? 'default' : 'outline'} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
              <Heading3 />
            </Button>
            <Button size="sm" variant={sel.bold ? 'default' : 'outline'} onClick={() => editor.chain().focus().toggleBold().run()}>
              <Bold />
            </Button>
            <Button size="sm" variant={sel.italic ? 'default' : 'outline'} onClick={() => editor.chain().focus().toggleItalic().run()}>
              <Italic />
            </Button>
            <Button size="sm" variant={sel.code ? 'default' : 'outline'} onClick={() => editor.chain().focus().toggleCode().run()}>
              <Code />
            </Button>
            <ColorControl
              color={sel.color}
              onColor={(c) => editor.chain().focus().setColor(c).run()}
              onClear={() => editor.chain().focus().unsetColor().run()}
            />
            <Button size="sm" variant={sel.bullet ? 'default' : 'outline'} onClick={() => editor.chain().focus().toggleBulletList().run()}>
              <List />
            </Button>
            <Button size="sm" variant={sel.ordered ? 'default' : 'outline'} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
              <ListOrdered />
            </Button>
            <Button size="sm" variant={sel.quote ? 'default' : 'outline'} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
              <Quote />
            </Button>
            <Button
              size="sm"
              variant={sel.codeBlock ? 'default' : 'outline'}
              title="代码块（支持 ```mermaid / ```text）"
              onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            >
              <Braces />
            </Button>
            <Button size="sm" variant="outline" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
              <Minus />
            </Button>
            <Button
              size="sm"
              variant="outline"
              title="插入 3×3 表格（Markdown 管道表）"
              onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
            >
              <TableIcon />
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0]
                if (f) await onUpload(f)
                e.target.value = ''
              }}
            />
            <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
              <ImagePlus data-icon="inline-start" /> 图片
            </Button>
            {sel.image && !cropTarget && (
              <Button size="sm" variant="outline" onClick={startCrop}>
                <Crop data-icon="inline-start" /> 裁剪
              </Button>
            )}
            {sel.image && !cropTarget &&
              (
                [
                  { align: 'left' as const, Icon: AlignLeft, label: '左对齐' },
                  { align: 'center' as const, Icon: AlignCenter, label: '居中对齐' },
                  { align: 'right' as const, Icon: AlignRight, label: '右对齐' },
                ]
              ).map(({ align, Icon, label }) => (
                <Button
                  key={align}
                  size="sm"
                  variant={sel.imgAlign === align ? 'default' : 'outline'}
                  aria-label={label}
                  title={label}
                  onClick={() => editor.chain().focus().updateAttributes('image', { align }).run()}
                >
                  <Icon />
                </Button>
              ))}
            <div className="flex-1" />
            <Button size="sm" variant="ghost" onClick={switchToRaw}>
              <Code2 data-icon="inline-start" /> Raw
            </Button>
          </>
        ) : (
          <>
            <span className="text-muted-foreground px-2 text-xs">Markdown 源码</span>
            <div className="flex-1" />
            <Button size="sm" onClick={switchToRich}>
              应用并切回富文本
            </Button>
          </>
        )}
      </div>
      {mode === 'rich' ? (
        <EditorContent editor={editor} />
      ) : (
        <Textarea
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          className="h-[calc(100vh-230px)] resize-none font-mono text-[13px] leading-relaxed"
          spellCheck={false}
        />
      )}
      {cropTarget && <ImageCropOverlay img={cropTarget.img} onConfirm={applyCrop} onCancel={endCrop} />}
    </div>
  )
}