// 图片工具 e2e：上传 → 选中 → 裁剪 / 对齐 / 调整宽度，并验证预览卡片同步
import { expect, test, type Page } from '@playwright/test'

async function uploadImage(page: Page) {
  // 生成 200x100 测试图：红色底 + 右下角蓝色方块（验证裁剪保留了哪部分像素）
  const dataUrl = await page.evaluate(() => {
    const c = document.createElement('canvas')
    c.width = 200
    c.height = 100
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#ff0000'
    ctx.fillRect(0, 0, 200, 100)
    ctx.fillStyle = '#0000ff'
    ctx.fillRect(150, 50, 50, 50)
    return c.toDataURL('image/png')
  })
  await page.setInputFiles('.xhs-editor input[type="file"]', {
    name: 'test.png',
    mimeType: 'image/png',
    buffer: Buffer.from(dataUrl.split(',')[1], 'base64'),
  })
  const img = page.locator('.xhs-editor .ProseMirror .xhs-img-wrap img').first()
  await expect(img).toBeVisible()
  return img
}

test('crop overlay starts as the full image and corner drag crops pixels', async ({ page }) => {
  await page.goto('/')
  const img = await uploadImage(page)
  await expect(img).toHaveJSProperty('naturalWidth', 200)
  await expect(img).toHaveJSProperty('naturalHeight', 100)

  await img.click()
  await page.getByRole('button', { name: '裁剪' }).click()
  const overlay = page.locator('.xhs-crop-overlay')
  await expect(overlay).toBeVisible()

  // 初始裁剪框覆盖全图：与图片显示区域重合
  const imgBox = await img.boundingBox()
  const rectBox = await page.locator('.xhs-crop-rect').boundingBox()
  expect(imgBox && rectBox).toBeTruthy()
  if (!imgBox || !rectBox) throw new Error('boxes unavailable')
  expect(rectBox.width).toBeCloseTo(imgBox.width, 0)
  expect(rectBox.height).toBeCloseTo(imgBox.height, 0)

  // 向内拖动右下角手柄，裁掉宽高的 1/4（起点/终点都以手柄中心为基准）
  const se = await page.locator('.xhs-crop-handle.se').boundingBox()
  if (!se) throw new Error('se handle unavailable')
  const cx = se.x + se.width / 2
  const cy = se.y + se.height / 2
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.mouse.move(cx - imgBox.width / 4, cy - imgBox.height / 4, { steps: 5 })
  await page.mouse.up()
  await page.getByRole('button', { name: '确定' }).click()
  await expect(overlay).toHaveCount(0)

  // 像素尺寸变为 150x75，且右下角蓝色方块被裁掉、保留的是红色区域
  await expect(img).toHaveJSProperty('naturalWidth', 150)
  await expect(img).toHaveJSProperty('naturalHeight', 75)
  await img.evaluate((el) => (el as HTMLImageElement).decode())
  const kept = await img.evaluate((el) => {
    const image = el as HTMLImageElement
    const c = document.createElement('canvas')
    c.width = image.naturalWidth
    c.height = image.naturalHeight
    const ctx = c.getContext('2d')!
    ctx.drawImage(image, 0, 0)
    const p = ctx.getImageData(c.width - 5, c.height - 5, 1, 1).data
    return { r: p[0], g: p[1], b: p[2] }
  })
  expect(kept.r).toBeGreaterThan(200)
  expect(kept.b).toBeLessThan(80)
})

test('alignment buttons update the editor image and the preview card', async ({ page }) => {
  await page.goto('/')
  const img = await uploadImage(page)
  await img.click()
  await page.getByRole('button', { name: '左对齐' }).click()
  await expect(page.locator('.xhs-img-wrap')).toHaveAttribute('data-align', 'left')

  await page.getByRole('button', { name: '自动分页' }).click()
  const cardImg = page.locator('.xhs-card .xhs-img').first()
  await expect(cardImg).toHaveAttribute('data-align', 'left')

  // 几何校验：图片未撑满内容宽度时，左对齐应贴住内容左边缘
  const offsets = await page.locator('.xhs-card').first().evaluate((card) => {
    const content = card.querySelector<HTMLElement>('.xhs-content')!
    const image = card.querySelector<HTMLElement>('.xhs-img')!
    const c = content.getBoundingClientRect()
    const i = image.getBoundingClientRect()
    return { leftGap: i.left - c.left, imgWidth: i.width, contentWidth: c.width }
  })
  expect(offsets.imgWidth).toBeLessThan(offsets.contentWidth)
  expect(Math.abs(offsets.leftGap)).toBeLessThan(1)

  // 切回居中：图片位于内容区中间
  await img.click()
  await page.getByRole('button', { name: '居中对齐' }).click()
  await page.getByRole('button', { name: '自动分页' }).click()
  await expect(cardImg).toHaveAttribute('data-align', 'center')
  const centered = await page.locator('.xhs-card').first().evaluate((card) => {
    const content = card.querySelector<HTMLElement>('.xhs-content')!
    const image = card.querySelector<HTMLElement>('.xhs-img')!
    const c = content.getBoundingClientRect()
    const i = image.getBoundingClientRect()
    return i.left - c.left - (c.width - i.width) / 2
  })
  expect(Math.abs(centered)).toBeLessThan(1)
})

test('dragging the resize handle narrows the image in editor and preview', async ({ page }) => {
  await page.goto('/')
  const img = await uploadImage(page)
  await img.click()

  const handle = page.locator('.xhs-img-resize')
  await expect(handle).toBeVisible()
  const wrap = page.locator('.xhs-img-wrap')
  const before = await wrap.boundingBox()
  if (!before) throw new Error('wrap box unavailable')

  // 向左拖动手柄，把图片宽度缩小一半
  const hb = await handle.boundingBox()
  if (!hb) throw new Error('handle box unavailable')
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2)
  await page.mouse.down()
  await page.mouse.move(hb.x - before.width / 2, hb.y + hb.height / 2, { steps: 5 })
  await page.mouse.up()

  const after = await wrap.boundingBox()
  if (!after) throw new Error('wrap box unavailable after drag')
  expect(after.width).toBeLessThan(before.width * 0.6)
  expect(after.width).toBeGreaterThan(before.width * 0.35)

  // 宽度以百分比写入属性，预览卡片中的图片同步变窄
  await page.getByRole('button', { name: '自动分页' }).click()
  const cardImg = page.locator('.xhs-card .xhs-img').first()
  await expect(cardImg).toBeVisible()
  const styleWidth = await cardImg.evaluate((el) => (el as HTMLElement).style.width)
  const pct = Number(styleWidth.replace('%', ''))
  const containerW = await wrap.evaluate((el) => (el.parentElement as HTMLElement).clientWidth)
  expect(Math.abs(pct - Math.round((after.width / containerW) * 100))).toBeLessThanOrEqual(2)
})

test('image survives the raw markdown round-trip with its attrs', async ({ page }) => {
  await page.goto('/')
  const img = await uploadImage(page)
  await img.click()
  await page.getByRole('button', { name: '左对齐' }).click()
  await expect(page.locator('.xhs-img-wrap')).toHaveAttribute('data-align', 'left')

  // 切到 Raw：图片变成紧凑标记而不是 base64，周围文字可正常编辑
  await page.getByRole('button', { name: 'Raw' }).click()
  const textarea = page.locator('textarea')
  const raw = await textarea.inputValue()
  expect(raw).toContain('xhs-img:0')
  expect(raw).not.toContain('data:image')
  await textarea.fill(`## 标题\n\n${raw}`)
  await page.getByRole('button', { name: '应用并切回富文本' }).click()

  // 切回富文本：图片还在，对齐属性保留
  const imgAgain = page.locator('.xhs-editor .ProseMirror .xhs-img-wrap img').first()
  await expect(imgAgain).toBeVisible()
  await expect(imgAgain).toHaveJSProperty('naturalWidth', 200)
  await expect(page.locator('.xhs-img-wrap')).toHaveAttribute('data-align', 'left')
  await expect(page.locator('.ProseMirror h2, .ProseMirror heading')).toContainText('标题')

  // 预览卡片：图片 + 标题都在
  await page.getByRole('button', { name: '自动分页' }).click()
  await expect(page.locator('.xhs-card .xhs-img').first()).toHaveAttribute('data-align', 'left')
  await expect(page.locator('.xhs-card').first()).toContainText('标题')
})
