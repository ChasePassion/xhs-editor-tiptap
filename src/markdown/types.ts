// 内容数据模型 —— v2.1：InlineNode 用扁平 TextRun（适配 tiptap marks 扁平数组）

export type InlineNode =
  | { type: 'text'; text: string; bold?: boolean; italic?: boolean; code?: boolean; color?: string }
  | { type: 'break' }

export type ImageAlign = 'left' | 'center' | 'right'

// mermaid 预渲染结果：html 是去掉外部尺寸/font-family（改为继承卡片字体）的 svg 字符串，
// w/h 是 viewBox 自然尺寸 —— 分页引擎据此按可用空间缩放。
export type DiagramSvg = { html: string; w: number; h: number }

export type ContentBlock =
  | { type: 'heading'; level: number; inline: InlineNode[] }
  | { type: 'paragraph'; inline: InlineNode[] }
  | { type: 'image'; src: string; alt?: string; align?: ImageAlign; width?: number }
  | { type: 'list'; ordered: boolean; items: InlineNode[][] }
  | { type: 'quote'; inline: InlineNode[] }
  | { type: 'code'; lang: string; code: string; diagram?: DiagramSvg }
  | { type: 'table'; header: InlineNode[][]; rows: InlineNode[][][]; align: ('left' | 'center' | 'right')[] }
  | { type: 'divider' }
  | { type: 'pagebreak' }

export type PageItem =
  | { kind: 'heading'; level: number; inline: InlineNode[] }
  | { kind: 'paragraph'; inline: InlineNode[]; continued?: boolean }
  | { kind: 'image'; src: string; alt?: string; align?: ImageAlign; width?: number }
  | { kind: 'list'; ordered: boolean; items: InlineNode[][] }
  | { kind: 'quote'; inline: InlineNode[] }
  | { kind: 'table'; header: InlineNode[][]; rows: InlineNode[][][]; align: ('left' | 'center' | 'right')[] }
  | {
      kind: 'code'
      lang: string
      code: string
      diagram?: DiagramSvg
      /** diagram 存在时：按页内可用空间缩放后的展示尺寸 */
      diagSize?: { w: number; h: number }
      /** 纯代码块被等宽缩字号适配后的字号（px），缺省用 CSS 默认 */
      size?: number
    }
  | { kind: 'divider' }

export type Page = { items: PageItem[] }

export type CardMeta = {
  username: string
  handle: string
  date: string
  avatar: string
  verified: boolean
}

export type StyleParams = {
  font: 'noto' | 'puhuiti'
  bodySize: number
  lineHeight: number
  letterSpacing: number
  padTop: number
  padRight: number
  padBottom: number
  padLeft: number
}

export const DEFAULT_STYLE: StyleParams = {
  font: 'noto',
  bodySize: 36,
  lineHeight: 1.9,
  letterSpacing: 0,
  padTop: 96,
  padRight: 80,
  padBottom: 120,
  padLeft: 80,
}

// 默认头像：vite 会把这个 webp 处理为构建产物 URL；单文件打包后会 inline 成 data URL
import avatarUrl from '@/assets/avatar.webp'

export const DEFAULT_META: CardMeta = {
  username: '菜菜在AI',
  handle: 'cccai',
  date: new Date().toISOString().slice(0, 10),
  avatar: avatarUrl,
  verified: true,
}