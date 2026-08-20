// 分页切分 e2e：分页边界落在段落/引用中间时按行切开，而不是把整个块推到下一页
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

// 长正文：约 700+ 字，默认字号/行距下超过一页，分页边界必然落在段中间
function longParagraph(): string {
  return Array.from({ length: 120 }, (_, i) => `这是第${i + 1}句话的内容`).join('，') + '。'
}

type PInfo = { text: string; continued: string | undefined }

async function readPages(page: Page, selector: '.xhs-p' | '.xhs-quote'): Promise<PInfo[][]> {
  return page.evaluate((sel) => {
    return Array.from(document.querySelectorAll('main .xhs-card')).map((card) =>
      Array.from(card.querySelectorAll(sel)).map((el) => ({
        text: el.textContent ?? '',
        continued: (el as HTMLElement).dataset.continued,
      })),
    )
  }, selector)
}

test('long paragraph splits mid-block instead of jumping to the next page', async ({ page }) => {
  const para = longParagraph()
  await seedContent(page, `开头段落。\n\n${para}\n\n结尾段落。\n`)
  await paginateNow(page)

  await expect(page.locator('main .xhs-card').first()).toContainText('开头段落')
  const pages = await readPages(page, '.xhs-p')
  expect(pages.length).toBeGreaterThanOrEqual(2)

  const page1Paras = pages[0]
  expect(page1Paras.length).toBeGreaterThanOrEqual(2) // 开头段落 + 长段的前半
  const lastOfPage1 = page1Paras[page1Paras.length - 1]
  expect(lastOfPage1.continued).toBe('true')
  // 前半段是长段的真前缀，且切在中间（既不为空也没有吞掉整段）
  expect(lastOfPage1.text.length).toBeGreaterThan(0)
  expect(para.startsWith(lastOfPage1.text)).toBeTruthy()
  expect(lastOfPage1.text.length).toBeLessThan(para.length)

  const firstOfPage2 = pages[1][0]
  expect(firstOfPage2.text.length).toBeGreaterThan(0)
  // 下一页从上一页断点处无缝续接：前半 + 后半 仍是长段前缀
  expect(para.startsWith(lastOfPage1.text + firstOfPage2.text)).toBeTruthy()
})

test('long blockquote splits mid-block as well', async ({ page }) => {
  const para = longParagraph()
  await seedContent(page, `> ${para}\n`)
  await paginateNow(page)

  // 等分页真正提交后再读 DOM（避免点击后立即取到空状态）
  await expect(page.locator('main .xhs-card blockquote').first()).toContainText('这是第1句话的内容')
  const pages = await readPages(page, '.xhs-quote')
  expect(pages.length).toBeGreaterThanOrEqual(2)
  const lastOfPage1 = pages[0][pages[0].length - 1]
  const firstOfPage2 = pages[1][0]
  expect(lastOfPage1.text.length).toBeGreaterThan(0)
  expect(lastOfPage1.text.length).toBeLessThan(para.length)
  expect(para.startsWith(lastOfPage1.text)).toBeTruthy()
  expect(para.startsWith(lastOfPage1.text + firstOfPage2.text)).toBeTruthy()
})

test('no paragraph is duplicated or lost across the split', async ({ page }) => {
  const para = longParagraph()
  await seedContent(page, `开头段落。\n\n${para}\n\n结尾段落。\n`)
  await paginateNow(page)

  await expect(page.locator('main .xhs-card').first()).toContainText('开头段落')
  const pages = await readPages(page, '.xhs-p')
  // 拼回全文：所有页的段落文本按顺序连接 = 开头段 + 长段 + 结尾段（无重叠、无丢失）
  const joined = pages.flat().map((p) => p.text).join('')
  expect(joined).toBe(`开头段落。${para}结尾段落。`)
})
