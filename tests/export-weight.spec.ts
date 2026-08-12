import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import JSZip from 'jszip'

async function switchToRaw(page: Page) {
  await page.getByRole('button', { name: 'Raw' }).click()
  await expect(page.locator('textarea')).toBeVisible()
}

async function replaceRawText(page: Page, text: string) {
  const textarea = page.locator('textarea')
  await textarea.fill(text)
  await expect(textarea).toHaveValue(text)
}

test('heading keeps its inherited bold weight in preview', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '自动分页' }).click()

  const actualTitleRun = page.locator('.xhs-card').first().locator('.xhs-h-text span > span').first()
  await expect(actualTitleRun).toHaveCSS('font-weight', '700')
})

test('heading owns the full content width so export font loading cannot freeze an intrinsic flex width', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('1 页', { exact: true })).toBeVisible()

  const geometry = await page.locator('.xhs-card').first().evaluate((card) => {
    const content = card.querySelector<HTMLElement>('.xhs-content')
    const heading = card.querySelector<HTMLElement>('.xhs-h-text')
    if (!content || !heading) throw new Error('heading geometry is unavailable')
    return { contentWidth: content.clientWidth, headingWidth: heading.clientWidth }
  })

  expect(geometry.headingWidth).toBe(geometry.contentWidth)
})

test('visible preview card is enlarged while preserving the 3:4 aspect ratio', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('1 页', { exact: true })).toBeVisible()

  const box = await page.locator('.xhs-card').first().boundingBox()
  if (!box) throw new Error('preview card is unavailable')
  expect(box.width).toBeGreaterThan(400)
  expect(box.height / box.width).toBeCloseTo(4 / 3, 4)
})

test('preview follows editor bold changes without a manual paginate click', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('1 页', { exact: true })).toBeVisible()
  await expect(page.locator('.xhs-card').first().locator('strong', { hasText: '14:00' })).toHaveCount(1)
  await switchToRaw(page)

  const textarea = page.locator('textarea')
  const original = await textarea.inputValue()
  await replaceRawText(page, original.replace('**14:00**', '14:00'))

  const preview = page.locator('.xhs-card').first()
  await expect(preview.locator('strong', { hasText: '14:00' })).toHaveCount(0)
})

for (const fontName of ['思源黑体', '阿里巴巴普惠体'] as const) {
  test(`repeated PNG exports preserve regular and bold runs independently (${fontName})`, async ({ page }) => {
    await page.goto('/')
    await page.getByRole('radio', { name: fontName }).click()
    await switchToRaw(page)
    await replaceRawText(page, '字重验证 **字重验证**\n')
    await page.getByRole('button', { name: '自动分页' }).click()
    await expect(page.locator('.xhs-card').first()).toContainText('字重验证')

    const ratios = await page.evaluate(async () => {
      const { exportElementsAsDataUrls } = await import('/src/export/exportPng.ts')
      const cards = Array.from(document.querySelectorAll<HTMLElement>('.xhs-card'))
      const card = cards.at(-1)
      if (!card) throw new Error('export card not found')

      const leaves = Array.from(card.querySelectorAll<HTMLElement>('span, strong'))
      const regular = leaves.find((el) => el.tagName === 'SPAN' && el.children.length === 0 && el.textContent?.trim() === '字重验证')
      const bold = leaves.find((el) => el.tagName === 'STRONG' && el.textContent === '字重验证')
      if (!regular || !bold) throw new Error('weight comparison runs not found')

      const cardBox = card.getBoundingClientRect()
      const relativeBox = (el: HTMLElement) => {
        const box = el.getBoundingClientRect()
        return {
          x: Math.floor(box.left - cardBox.left),
          y: Math.floor(box.top - cardBox.top),
          width: Math.ceil(box.width),
          height: Math.ceil(box.height),
        }
      }
      const regularBox = relativeBox(regular)
      const boldBox = relativeBox(bold)

      const urls: string[] = []
      for (let i = 0; i < 4; i += 1) {
        urls.push((await exportElementsAsDataUrls([card]))[0])
      }

      const ink = async (url: string, box: ReturnType<typeof relativeBox>) => {
        const image = new Image()
        image.src = url
        await image.decode()
        const canvas = document.createElement('canvas')
        canvas.width = image.width
        canvas.height = image.height
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!
        ctx.drawImage(image, 0, 0)
        const pixels = ctx.getImageData(box.x, box.y, box.width, box.height).data
        let darkness = 0
        for (let i = 0; i < pixels.length; i += 4) {
          darkness += 255 - (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3
        }
        return darkness
      }

      return Promise.all(urls.map(async (url) => (await ink(url, boldBox)) / (await ink(url, regularBox))))
    })

    expect(ratios, `bold/regular ink ratios: ${ratios.join(', ')}`).toEqual(
      expect.arrayContaining(ratios.map(() => expect.any(Number))),
    )
    for (const ratio of ratios) expect(ratio).toBeGreaterThan(1.08)
  })
}

test('export button commits the latest three-page document before creating the ZIP', async ({ page }) => {
  await page.goto('/')
  await switchToRaw(page)
  const one = (await page.locator('textarea').inputValue()).trim()
  await replaceRawText(page, `${one}\n\n${one}\n\n${one}\n`)

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出 PNG' }).click()
  const download = await downloadPromise
  const path = await download.path()
  if (!path) throw new Error('ZIP download path is unavailable')

  const zip = await JSZip.loadAsync(await readFile(path))
  const pngNames = Object.keys(zip.files).filter((name) => name.endsWith('.png'))
  expect(pngNames).toHaveLength(3)
})
