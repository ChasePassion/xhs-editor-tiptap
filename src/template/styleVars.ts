import type { CSSProperties } from 'react'
import type { StyleParams } from '@/markdown/types'
import { FONT_FAMILIES } from '@/fonts'

// 导出层关键：font-family 必须作为 inline style 的字面量字符串直接给浏览器，
// 不能用 CSS 变量——modern-screenshot 的 SVG <foreignObject> 克隆时会丢失 CSS 变量解析，
// 变量里的 fallback 也会让导出时被静默回退到上一个字体（普惠体→Noto 700，呈现假加粗）。
export function makeCssVars(s: StyleParams): CSSProperties {
  return {
    fontFamily: FONT_FAMILIES[s.font], // 唯一字体，无 fallback
    fontSynthesis: 'none',
    ['--xhs-body-size' as string]: `${s.bodySize}px`,
    ['--xhs-line-height' as string]: String(s.lineHeight),
    ['--xhs-letter-spacing' as string]: `${s.letterSpacing}px`,
    ['--xhs-pad-top' as string]: `${s.padTop}px`,
    ['--xhs-pad-right' as string]: `${s.padRight}px`,
    ['--xhs-pad-bottom' as string]: `${s.padBottom}px`,
    ['--xhs-pad-left' as string]: `${s.padLeft}px`,
  } as CSSProperties
}