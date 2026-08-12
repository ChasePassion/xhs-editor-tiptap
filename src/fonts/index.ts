// 字体锁定：两种可选字体，全部本地 woff2，不写 fallback + font-synthesis:none
// Noto Sans SC（思源黑体）+ 阿里巴巴普惠体 3.0
import '@fontsource/noto-sans-sc/chinese-simplified-400.css'
import '@fontsource/noto-sans-sc/chinese-simplified-500.css'
import '@fontsource/noto-sans-sc/chinese-simplified-700.css'
import './puhuiti.css'

export type FontKey = 'noto' | 'puhuiti'

export const FONT_FAMILIES: Record<FontKey, string> = {
  noto: '"Noto Sans SC"',
  puhuiti: '"XHSPuHuiTi"',
}

export const FONT_LABELS: Record<FontKey, string> = {
  noto: '思源黑体',
  puhuiti: '阿里巴巴普惠体',
}

export async function ensureFontsLoaded(): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return
  const f = (document as unknown as { fonts: FontFaceSet }).fonts
  try {
    await Promise.all([
      f.load('400 32px "Noto Sans SC"'),
      f.load('700 32px "Noto Sans SC"'),
      f.load('400 32px "XHSPuHuiTi"'),
      f.load('700 32px "XHSPuHuiTi"'),
    ])
    await f.ready
  } catch {
    /* 字体加载失败由 glyph 检查兜底 */
  }
}

const UNSUPPORTED_RE =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}]/u

export function findUnsupportedGlyph(text: string): string | null {
  const m = text.match(UNSUPPORTED_RE)
  return m ? m[0] : null
}
