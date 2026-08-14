import { useCallback, useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import type { JSONContent } from '@tiptap/core'
import { marked } from 'marked'
import { extensions } from './extensions'
import { ColorControl } from './ColorControl'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  List,
  ListOrdered,
  Minus,
  Quote,
  Code2,
} from 'lucide-react'
import './editor.css'

const INITIAL_MD = `## 夹爪 vs 五指灵巧手，看点不只是输赢

电机发热、动作不稳、数据不足、模型失误和维护成本，每一项都会把漂亮 Demo 拉回现实。

也正因为这样，我在关注一场实测。据品牌方资料，今天下午 **14:00** 直播挑战 1248 件/小时分拣纪录。

> 这不是简单的输赢，而是两条技术路线的赌注。

- 夹爪：便宜、稳、够用
- 灵巧手：贵、复杂、天花板高

不管谁赢，这场实测都会把「人形机器人能不能干活」从 Demo 推进到真实场景。
`

marked.use({ gfm: true, breaks: false })
function mdToJson(md: string): JSONContent {
  const tokens = marked.lexer(md)
  return { type: 'doc', content: tokens.map(tokenToBlock).filter((n): n is JSONContent => Boolean(n)) }
}
function jsonToMd(json: JSONContent): string {
  return (json.content ?? []).map(blockToMd).join('\n\n').trim() + '\n'
}
function tokenToBlock(tok: any): JSONContent | null {
  switch (tok.type) {
    case 'heading':
      return { type: 'heading', attrs: { level: tok.depth }, content: [{ type: 'text', text: tok.text, marks: [] }] }
    case 'paragraph':
      return { type: 'paragraph', content: inlineToMarks(tok.text) }
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
function blockToMd(node: JSONContent): string {
  const text = (n: JSONContent) => (n.content ?? []).map(c => c.text ?? '').join('')
  const mdText = (n: JSONContent) => inlineToMd((n.content ?? []).map(c => ({ ...c, marks: c.marks ?? [] })))
  switch (node.type) {
    case 'heading':
      return '#'.repeat((node.attrs?.level as number) ?? 1) + ' ' + text(node) + '\n'
    case 'paragraph':
      return mdText(node)
    case 'blockquote':
      return (node.content ?? []).map(c => '> ' + text(c)).join('\n')
    case 'bulletList':
      return (node.content ?? []).map(c => '- ' + mdText(c.content?.[0] ?? { type: 'paragraph', content: [] })).join('\n')
    case 'orderedList':
      return (node.content ?? []).map((c, i) => `${i + 1}. ` + mdText(c.content?.[0] ?? { type: 'paragraph', content: [] })).join('\n')
    case 'horizontalRule':
      return '---'
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

export function TiptapEditor({ onDocChange }: { onDocChange: (json: JSONContent) => void }) {
  const [mode, setMode] = useState<'rich' | 'raw'>('rich')
  const [rawText, setRawText] = useState<string>(INITIAL_MD)
  const fileRef = useRef<HTMLInputElement>(null)

  const editor = useEditor({
    extensions,
    content: mdToJson(INITIAL_MD),
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
      h1: editor.isActive('heading', { level: 1 }),
      h2: editor.isActive('heading', { level: 2 }),
      h3: editor.isActive('heading', { level: 3 }),
      bullet: editor.isActive('bulletList'),
      ordered: editor.isActive('orderedList'),
      quote: editor.isActive('blockquote'),
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

  const switchToRaw = useCallback(() => {
    if (!editor) return
    setRawText(jsonToMd(editor.getJSON()))
    setMode('raw')
  }, [editor])

  const switchToRich = useCallback(() => {
    const json = mdToJson(rawText)
    editor?.commands.setContent(json)
    setMode('rich')
  }, [editor, rawText])

  // raw 模式下文本变化即更新 docRef（让分页也能跟上）
  useEffect(() => {
    if (mode !== 'raw') return
    try {
      onDocChange(mdToJson(rawText))
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
            <Button size="sm" variant="outline" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
              <Minus />
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
    </div>
  )
}