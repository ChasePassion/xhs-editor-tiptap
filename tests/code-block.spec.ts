// 代码块 e2e：```text 树形图（等宽、不折行、可 Raw 双向）与 ```mermaid（预渲染 svg、失败降级）
import { expect, test, type Page } from '@playwright/test'

async function seedContent(page: Page, md: string) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Raw' }).click()
  await expect(page.locator('textarea')).toBeVisible()
  await page.locator('textarea').fill(md)
  await page.getByRole('button', { name: '应用并切回富文本' }).click()
  await expect(page.locator('.xhs-editor .ProseMirror')).toBeVisible()
}

async function paginateNow(page: Page) {
  await page.getByRole('button', { name: '自动分页' }).click()
}

// 首次分页会懒加载 mermaid（dev server 预打包可能较慢），断言用宽松超时
const SLOW = { timeout: 30_000 }

const TREE_MD = [
  '## 项目结构',
  '',
  '```text',
  'pi-mono/',
  '├── packages/ai/',
  '│   └── src/',
  '│       ├── types.ts       # 定义 Context / Message / Tool',
  '│       └── models.ts      # 统一管理各家 Provider',
  '├── packages/coding-agent/  # 终端全屏交互界面与全流程总指挥调度模块（TUI）',
  '└── packages/agent/',
  '    └── src/agent-loop.ts  # 问模型 → 跑工具 → 再问模型',
  '```',
  '',
  '正文段落。',
  '',
].join('\n')

const MERMAID_MD = [
  '# 分层架构',
  '',
  '```mermaid',
  'flowchart TD',
  '    M["原始大模型 (OpenAI / Claude / DeepSeek)"]',
  '',
  '    subgraph L1["1. ai 层：统一发信通道"]',
  '        AI["把各家不同的接口，抹平成统一的对话与工具格式"]',
  '    end',
  '',
  '    subgraph L2["2. agent-loop：自动干活的 while 循环"]',
  '        LOOP["问模型 -> 帮模型跑工具 -> 结果喂回模型 -> 循环直到做完"]',
  '    end',
  '',
  '    M --> L1 --> L2',
  '```',
  '',
  '结尾段落。',
  '',
].join('\n')

test('text code block survives raw markdown and renders monospace in card', async ({ page }) => {
  await seedContent(page, TREE_MD)
  await paginateNow(page)

  // 富文本编辑器里保留为代码块
  await expect(page.locator('.xhs-editor .ProseMirror pre')).toContainText('pi-mono/')

  const card = page.locator('main .xhs-card').first()
  await expect(card.locator('pre.xhs-code')).toContainText('└── packages/agent/', SLOW)
  const styles = await card.locator('pre.xhs-code').evaluate((pre) => {
    const cs = getComputedStyle(pre)
    return { fontFamily: cs.fontFamily, whiteSpace: cs.whiteSpace, letterSpacing: cs.letterSpacing }
  })
  expect(styles.whiteSpace).toBe('pre')
  expect(styles.fontFamily.toLowerCase()).toContain('mono')
  // 字距必须归零，树形图的 ASCII 对齐才不会被拉开
  expect(styles.letterSpacing === 'normal' || parseFloat(styles.letterSpacing) === 0).toBeTruthy()

  // 树形图行宽超出内容区时自动缩字号（inline fontSize），且缩完后不横向溢出
  const fitted = await card.locator('pre.xhs-code').evaluate((pre) => ({
    size: parseFloat(pre.style.fontSize),
    overflow: pre.scrollWidth - pre.clientWidth,
  }))
  expect(fitted.size).toBeGreaterThan(0)
  expect(fitted.overflow).toBeLessThanOrEqual(1)
})

test('raw markdown round-trip keeps the fenced code block', async ({ page }) => {
  await seedContent(page, TREE_MD)
  await page.getByRole('button', { name: 'Raw' }).click()
  const text = await page.locator('textarea').inputValue()
  expect(text).toContain('```text')
  expect(text).toContain('├── packages/ai/')
  // 闭合围栏还在（后面还有正文段落，所以不是文本结尾）
  expect(text).toContain('\n```\n')
})

test('mermaid block renders as inline svg scaled to the card', async ({ page }) => {
  await seedContent(page, MERMAID_MD)
  await paginateNow(page)

  // 图可能独占后一页（高度接近整页时不与标题硬挤在同一页），不假定在第 1 页
  const diagram = page.locator('main .xhs-card .xhs-diagram svg').first()
  await expect(diagram).toHaveCount(1, SLOW)

  const info = await diagram.evaluate((svg) => {
    const el = svg as SVGSVGElement
    const box = el.getBoundingClientRect()
    return {
      viewBox: el.getAttribute('viewBox'),
      // svg 内 font-family 必须剥掉（继承卡片字体，导出时才能 remap 成内嵌字体）
      fontFamily: el.getAttribute('font-family'),
      width: box.width,
      height: box.height,
    }
  })
  expect(info.viewBox).toBeTruthy()
  expect(info.fontFamily).toBeNull()
  // 图宽度按可用内容宽（1080 - 左右 padding 80 = 920）缩放
  expect(info.width).toBeGreaterThan(100)
  expect(info.width).toBeLessThanOrEqual(921)
  // 渲染成功时不应降级成代码文本
  await expect(page.locator('main .xhs-card pre.xhs-code')).toHaveCount(0)
  await expect(page.locator('main .xhs-card').filter({ hasText: '结尾段落' })).toHaveCount(1)
})

test('mermaid diagram has real ink in the exported PNG', async ({ page }) => {
  await seedContent(page, MERMAID_MD)
  await paginateNow(page)
  await expect(page.locator('main .xhs-card .xhs-diagram svg')).toHaveCount(1, SLOW)

  // 导出 host 的最后一页卡片 → PNG：diagram 区域必须真的画出来（非空白）
  const ink = await page.evaluate(async () => {
    const { exportElementsAsDataUrls } = await import('/src/export/exportPng.ts')
    const cards = Array.from(document.querySelectorAll<HTMLElement>('.xhs-card'))
    const card = cards.find((c) => c.querySelector('.xhs-diagram'))
    if (!card) throw new Error('export card with diagram not found')
    const diagram = card.querySelector<HTMLElement>('.xhs-diagram')!

    const url = (await exportElementsAsDataUrls([card]))[0]
    const image = new Image()
    image.src = url
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    ctx.drawImage(image, 0, 0)

    const cardBox = card.getBoundingClientRect()
    const box = diagram.getBoundingClientRect()
    const band = {
      x: Math.max(0, Math.floor(box.left - cardBox.left)),
      y: Math.max(0, Math.floor(box.top - cardBox.top)),
      width: Math.min(canvas.width, Math.ceil(box.width)),
      height: Math.min(canvas.height, Math.ceil(box.height)),
    }
    const pixels = ctx.getImageData(band.x, band.y, band.width, band.height).data
    let darkness = 0
    for (let i = 0; i < pixels.length; i += 4) {
      darkness += 255 - (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3
    }
    return darkness
  })
  expect(ink, 'mermaid diagram ink in exported PNG').toBeGreaterThan(2000)
})

test('broken mermaid falls back to code text with a warning', async ({ page }) => {
  await seedContent(page, '标题\n\n```mermaid\nthis is (not a diagram\n```\n\n正文。\n')
  await paginateNow(page)

  const card = page.locator('main .xhs-card').first()
  await expect(card.locator('pre.xhs-code')).toContainText('this is (not a diagram', SLOW)
  await expect(page.locator('[data-slot="alert"]').filter({ hasText: 'mermaid' })).toBeVisible()
})
