// 文字颜色 mark ——
// 解析 <font style="color:..."> / <font color="..."> / <span style="color:...">，
// 统一渲染为 <span style="color:...">。提供 setColor / unsetColor 命令供工具栏调用。
import { Mark, mergeAttributes } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    textColor: {
      setColor: (color: string) => ReturnType
      unsetColor: () => ReturnType
    }
  }
}

export const ColorMark = Mark.create({
  name: 'textColor',
  inclusive: true,

  addAttributes() {
    return {
      color: {
        default: null,
        renderHTML: (attrs: { color: string | null }) =>
          attrs.color ? { style: `color: ${attrs.color}` } : {},
      },
    }
  },

  parseHTML() {
    const getAttrs = (el: HTMLElement | string): { color: string } | false => {
      if (typeof el === 'string') return false
      const color = el.style.color || el.getAttribute('color')
      return color ? { color } : false
    }
    return [
      { tag: 'font[style]', getAttrs },
      { tag: 'font[color]', getAttrs },
      { tag: 'span[style]', getAttrs },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0]
  },

  addCommands() {
    return {
      setColor:
        (color: string) =>
        ({ chain }) =>
          chain().setMark(this.name, { color }).run(),
      unsetColor:
        () =>
        ({ chain }) =>
          chain().unsetMark(this.name).run(),
    }
  },
})
