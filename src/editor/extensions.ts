// tiptap 扩展配置 —— adviser v2.1：精简 StarterKit，保留 undoRedo/listKeymap/hardBreak/horizontalRule
// codeBlock（含 ```mermaid / ```text 围栏）走 StarterKit 自带扩展，language 存 attrs
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
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

// 表格单元格增加 textAlign 属性：GFM 的 :--- / :---: / ---: 对齐在 Raw 双向转换里保真
const textAlignAttr = {
  textAlign: {
    default: null as string | null,
    parseHTML: (el: HTMLElement) => el.style.textAlign || null,
    renderHTML: (attrs: { textAlign?: string | null }) =>
      attrs.textAlign ? { style: `text-align: ${attrs.textAlign}` } : {},
  },
}
const AlignedTableCell = TableCell.extend({
  addAttributes() {
    return { ...this.parent?.(), ...textAlignAttr }
  },
})
const AlignedTableHeader = TableHeader.extend({
  addAttributes() {
    return { ...this.parent?.(), ...textAlignAttr }
  },
})

export const extensions: Extensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    link: false,
    strike: false,
    underline: false,
    trailingNode: false,
  }),
  AlignedImage.configure({ inline: false, allowBase64: true }),
  ColorMark,
  Table.configure({ resizable: false }),
  TableRow,
  AlignedTableHeader,
  AlignedTableCell,
]
