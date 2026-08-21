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

// 长列表：每条约两行高，一页放不下 → 必然跨页
function listMd(ordered: boolean, count: number): string {
  const item = (i: number) => `第${i}个要点：${'这是一段比较长的说明内容'.repeat(2)}`
  const lines = Array.from({ length: count }, (_, i) => `${ordered ? `${i + 1}. ` : '- '}${item(i + 1)}`)
  return `如果直接拿它写代码，会立刻遇到几个无法绕开的现实问题：\n\n${lines.join('\n')}\n`
}

async function readLists(page: Page) {
  return page.evaluate(() => {
    return Array.from(document.querySelectorAll('main .xhs-card')).map((card) => {
      const list = card.querySelector('ol.xhs-list, ul.xhs-list')
      if (!list) return null
      return {
        tag: list.tagName.toLowerCase(),
        start: list.getAttribute('start'),
        items: Array.from(list.querySelectorAll('li')).map((li) => li.textContent ?? ''),
      }
    })
  })
}

test('bullet list splits by items instead of jumping to the next page whole', async ({ page }) => {
  await seedContent(page, listMd(false, 24))
  await paginateNow(page)

  await expect(page.locator('main .xhs-card ul.xhs-list').first()).toContainText('第1个要点')
  const lists = (await readLists(page)).filter((l): l is NonNullable<typeof l> => l !== null)
  expect(lists.length).toBeGreaterThanOrEqual(2)
  // 条目守恒且顺序不变
  const texts = lists.flatMap((l) => l.items)
  expect(texts.length).toBe(24)
  expect(texts[0]).toContain('第1个要点')
  expect(texts[23]).toContain('第24个要点')
  // 第一页在引言之后紧接列表（引言和列表第一部分同页）——整块搬家时引言会独占第一页
  const page1 = await page.evaluate(() =>
    Array.from(document.querySelectorAll('main .xhs-card'))[0]?.textContent ?? '',
  )
  expect(page1).toContain('第1个要点')
})

test('ordered list splits with numbering continuing across pages', async ({ page }) => {
  await seedContent(page, listMd(true, 24))
  await paginateNow(page)

  await expect(page.locator('main .xhs-card ol.xhs-list').first()).toContainText('第1个要点')
  const lists = (await readLists(page)).filter((l): l is NonNullable<typeof l> => l !== null)
  expect(lists.length).toBeGreaterThanOrEqual(2)
  expect(lists.every((l) => l.tag === 'ol')).toBeTruthy()

  const texts = lists.flatMap((l) => l.items)
  expect(texts.length).toBe(24)
  // 第一页无 start（从 1 开始），续页 start = 前一页条目数 + 1，逐页接续
  expect(lists[0].start).toBeNull()
  let acc = 0
  for (const l of lists) {
    if (acc > 0) expect(l.start).toBe(String(acc + 1))
    acc += l.items.length
  }
  expect(acc).toBe(24)
})
