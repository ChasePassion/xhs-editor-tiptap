// tiptap 扩展配置 —— adviser v2.1：精简 StarterKit，保留 undoRedo/listKeymap/hardBreak/horizontalRule
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import type { Extensions } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { ColorMark } from './colorMark'
import { ImageView } from './imageNodeView'
import type { ImageAlign } from '@/markdown/types'

// 图片扩展增加 align / width 属性：align 渲染为 data-align，width 为内容宽度百分比（null 表示自然宽度）
const AlignedImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      align: {
        default: 'center' as ImageAlign,
        parseHTML: (el) => (el.getAttribute('data-align') as ImageAlign | null) ?? 'center',
        renderHTML: (attrs) => ({ 'data-align': attrs.align as ImageAlign }),
      },
      width: {
        default: null as number | null,
        parseHTML: () => null,
        renderHTML: () => ({}),
      },
    }
  },
  addNodeView() {
    return ReactNodeViewRenderer(ImageView)
  },
})

export const extensions: Extensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    codeBlock: false,
    link: false,
    strike: false,
    underline: false,
    trailingNode: false,
  }),
  AlignedImage.configure({ inline: false, allowBase64: true }),
  ColorMark,
]
