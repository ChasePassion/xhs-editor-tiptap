// tiptap 扩展配置 —— adviser v2.1：精简 StarterKit，保留 undoRedo/listKeymap/hardBreak/horizontalRule
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import type { Extensions } from '@tiptap/core'
import { ColorMark } from './colorMark'

export const extensions: Extensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    codeBlock: false,
    link: false,
    strike: false,
    underline: false,
    trailingNode: false,
  }),
  Image.configure({ inline: false, allowBase64: true }),
  ColorMark,
]
