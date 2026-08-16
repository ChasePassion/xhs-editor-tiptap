import { expect, test, type Page } from '@playwright/test'

async function switchToRaw(page: Page) {
  await page.getByRole('button', { name: 'Raw' }).click()
  await expect(page.locator('textarea')).toBeVisible()
}

async function replaceRawText(page: Page, text: string) {
  const textarea = page.locator('textarea')
  await textarea.fill(text)
  await expect(textarea).toHaveValue(text)
}

// 编辑器初始为空文档，用例需要的内容统一走 Raw 模式填入再切回富文本
async function seedContent(page: Page, md: string) {
  await switchToRaw(page)
  await replaceRawText(page, md)
  await page.getByRole('button', { name: '应用并切回富文本' }).click()
  await expect(page.locator('.xhs-editor .ProseMirror')).toBeVisible()
}

const LIST_MD = '## 列表标记验证\n\n- 构建和部署 AI 应用\n- 软件工程基础\n\n1. 第一要点\n2. 第二要点\n'

async function seedAndPaginate(page: Page) {
  await page.goto('/')
  await seedContent(page, LIST_MD)
  await page.getByRole('button', { name: '自动分页' }).click()
  await expect(page.locator('.xhs-card').first()).toContainText('构建和部署 AI 应用')
}

test('preview keeps bullet and number markers despite Tailwind preflight reset', async ({ page }) => {
  await seedAndPaginate(page)

  const styles = await page.locator('.xhs-card').first().evaluate((card) => {
    const ul = card.querySelector('ul.xhs-list')
    const ol = card.querySelector('ol.xhs-list')
    if (!ul || !ol) throw new Error('list elements not found in preview card')
    return {
      ul: getComputedStyle(ul).listStyleType,
      ol: getComputedStyle(ol).listStyleType,
      liDisplay: getComputedStyle(ul.querySelector('li')!).display,
    }
  })
  expect(styles.ul).toBe('disc')
  expect(styles.ol).toBe('decimal')
  expect(styles.liDisplay).toBe('list-item')
})

test('list items sit tighter than body paragraphs', async ({ page }) => {
  await page.goto('/')
  await seedContent(page, '正文段落行距\n\n- 第一分点\n- 第二分点\n')
  await page.getByRole('button', { name: '自动分页' }).click()
  await expect(page.locator('.xhs-card').first()).toContainText('第一分点')

  const { liLH, pLH, bodySize } = await page.locator('.xhs-card').first().evaluate((card) => {
    const li = card.querySelector('ul.xhs-list li')
    const p = card.querySelector('.xhs-p')
    if (!li || !p) throw new Error('list or paragraph not found in preview card')
    return {
      liLH: parseFloat(getComputedStyle(li).lineHeight),
      pLH: parseFloat(getComputedStyle(p).lineHeight),
      bodySize: parseFloat(getComputedStyle(card).fontSize),
    }
  })
  expect(liLH).toBeLessThan(pLH)
  // 默认样式 bodySize 36、正文行距 1.9：列表封顶 1.5
  expect(liLH).toBeCloseTo(bodySize * 1.5, 1)
})

test('exported PNG contains marker ink left of the first list item', async ({ page }) => {
  await seedAndPaginate(page)

  const result = await page.evaluate(async () => {
    const { exportElementsAsDataUrls } = await import('/src/export/exportPng.ts')
    const card = Array.from(document.querySelectorAll<HTMLElement>('.xhs-card')).at(-1)
    if (!card) throw new Error('export card not found')

    const cardBox = card.getBoundingClientRect()
    const bandOf = (selector: string) => {
      const li = card.querySelector<HTMLElement>(selector)
      if (!li) throw new Error(`${selector} not found in export card`)
      const box = li.getBoundingClientRect()
      return {
        x: Math.floor(box.left - cardBox.left - 38),
        y: Math.floor(box.top - cardBox.top + 4),
        width: 34,
        height: Math.ceil(box.height) - 8,
      }
    }
    const bands = { ulBand: bandOf('ul.xhs-list li'), olBand: bandOf('ol.xhs-list li') }

    const url = (await exportElementsAsDataUrls([card]))[0]
    const image = new Image()
    image.src = url
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    ctx.drawImage(image, 0, 0)

    const ink = (band: { x: number; y: number; width: number; height: number }) => {
      const pixels = ctx.getImageData(band.x, band.y, band.width, band.height).data
      let darkness = 0
      for (let i = 0; i < pixels.length; i += 4) {
        darkness += 255 - (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3
      }
      return darkness
    }
    return { ulInk: ink(bands.ulBand), olInk: ink(bands.olBand) }
  })

  // 圆点 / 序号缺失时该区域是纯白 padding，ink ≈ 0
  expect(result.ulInk, 'bullet marker ink in exported PNG').toBeGreaterThan(500)
  expect(result.olInk, 'number marker ink in exported PNG').toBeGreaterThan(500)
})
