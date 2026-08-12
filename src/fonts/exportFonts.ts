type ExportFontSpec = {
  sourceFamily: string
  regularAlias: string
  boldAlias: string
}

export type ExportFontBundle = {
  cssText: string
  remapClonedNode: (node: Node) => void
}

const SPECS: ExportFontSpec[] = [
  {
    sourceFamily: 'Noto Sans SC',
    regularAlias: 'XHSExportNotoRegular',
    boldAlias: 'XHSExportNotoBold',
  },
  {
    sourceFamily: 'XHSPuHuiTi',
    regularAlias: 'XHSExportPuHuiRegular',
    boldAlias: 'XHSExportPuHuiBold',
  },
]

const bundleCache = new Map<string, Promise<ExportFontBundle>>()

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('读取导出字体失败'))
    reader.readAsDataURL(blob)
  })
}

async function stableDataUrl(url: string): Promise<string> {
  if (url.startsWith('data:')) return url
  const response = await fetch(url)
  if (!response.ok) throw new Error(`加载导出字体失败（HTTP ${response.status}）`)
  return blobToDataUrl(await response.blob())
}

function normalizedFamily(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, '')
}

function firstWoff2Url(src: string, baseUrl: string): string | null {
  const preferred = src.match(/url\((['"]?)(.*?)\1\)\s*format\((['"]?)woff2\3\)/i)
  const fallback = src.match(/url\((['"]?)(.*?)\1\)/i)
  const value = preferred?.[2] ?? fallback?.[2]
  if (!value) return null
  return value.startsWith('data:') ? value : new URL(value, baseUrl).href
}

function findFontUrl(family: string, weight: 400 | 700): string {
  const visit = (rules: CSSRuleList, baseUrl: string): string | null => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSFontFaceRule) {
        const ruleFamily = normalizedFamily(rule.style.getPropertyValue('font-family'))
        const ruleWeight = Number.parseInt(rule.style.getPropertyValue('font-weight'), 10)
        if (ruleFamily === family && ruleWeight === weight) {
          const found = firstWoff2Url(rule.style.getPropertyValue('src'), baseUrl)
          if (found) return found
        }
      } else if ('cssRules' in rule) {
        const found = visit((rule as CSSGroupingRule).cssRules, baseUrl)
        if (found) return found
      }
    }
    return null
  }

  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const found = visit(sheet.cssRules, sheet.href ?? document.baseURI)
      if (found) return found
    } catch {
      // 跨域样式表不可读时继续检查其余本地样式表。
    }
  }
  throw new Error(`找不到导出字体：${family} ${weight}`)
}

async function preloadFace(family: string, weight: 400 | 700, dataUrl: string): Promise<void> {
  const face = new FontFace(family, `url(${JSON.stringify(dataUrl)}) format("woff2")`, {
    style: 'normal',
    weight: String(weight),
  })
  await face.load()
  document.fonts.add(face)
  await document.fonts.load(`${weight} 32px ${JSON.stringify(family)}`, '字重验证Aa')
}

function makeCssFace(family: string, weight: 400 | 700, dataUrl: string): string {
  return `@font-face {
  font-family: ${JSON.stringify(family)};
  src: url(${JSON.stringify(dataUrl)}) format("woff2");
  font-style: normal;
  font-weight: ${weight};
  font-display: block;
}`
}

async function buildBundle(spec: ExportFontSpec): Promise<ExportFontBundle> {
  const regularUrl = findFontUrl(spec.sourceFamily, 400)
  const boldUrl = findFontUrl(spec.sourceFamily, 700)
  const [regularDataUrl, boldDataUrl] = await Promise.all([
    stableDataUrl(regularUrl),
    stableDataUrl(boldUrl),
  ])

  await Promise.all([
    preloadFace(spec.regularAlias, 400, regularDataUrl),
    preloadFace(spec.boldAlias, 700, boldDataUrl),
  ])

  const cssText = [
    makeCssFace(spec.regularAlias, 400, regularDataUrl),
    makeCssFace(spec.boldAlias, 700, boldDataUrl),
  ].join('\n')

  return {
    cssText,
    remapClonedNode: (node) => {
      if (!(node instanceof HTMLElement)) return
      if (!node.style.fontFamily.includes(spec.sourceFamily)) return
      const numericWeight = Number.parseInt(node.style.fontWeight, 10)
      const bold = Number.isFinite(numericWeight) && numericWeight >= 600
      node.style.fontFamily = JSON.stringify(bold ? spec.boldAlias : spec.regularAlias)
      node.style.fontWeight = bold ? '700' : '400'
      node.style.fontSynthesis = 'none'
    },
  }
}

export function prepareExportFont(element: HTMLElement): Promise<ExportFontBundle> {
  const family = getComputedStyle(element).fontFamily
  const spec = SPECS.find((candidate) => family.includes(candidate.sourceFamily))
  if (!spec) throw new Error(`不支持的导出字体：${family}`)

  let pending = bundleCache.get(spec.sourceFamily)
  if (!pending) {
    pending = buildBundle(spec).catch((error) => {
      bundleCache.delete(spec.sourceFamily)
      throw error
    })
    bundleCache.set(spec.sourceFamily, pending)
  }
  return pending
}
