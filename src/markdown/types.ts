// 内容数据模型 —— v2.1：InlineNode 用扁平 TextRun（适配 tiptap marks 扁平数组）

export type InlineNode =
  | { type: 'text'; text: string; bold?: boolean; italic?: boolean; code?: boolean; color?: string }
  | { type: 'break' }

export type ContentBlock =
  | { type: 'heading'; level: number; inline: InlineNode[] }
  | { type: 'paragraph'; inline: InlineNode[] }
  | { type: 'image'; src: string; alt?: string }
  | { type: 'list'; ordered: boolean; items: InlineNode[][] }
  | { type: 'quote'; inline: InlineNode[] }
  | { type: 'divider' }
  | { type: 'pagebreak' }

export type PageItem =
  | { kind: 'heading'; level: number; inline: InlineNode[] }
  | { kind: 'paragraph'; inline: InlineNode[]; continued?: boolean }
  | { kind: 'image'; src: string; alt?: string }
  | { kind: 'list'; ordered: boolean; items: InlineNode[][] }
  | { kind: 'quote'; inline: InlineNode[] }
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