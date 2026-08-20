// 表格 e2e：GFM 管道表在编辑器/卡片里渲染、对齐保真、Raw 双向、超长表按行分页（续页重复表头）
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

// 用户实录样例：3 列，左对齐
const TABLE_MD = [
  '## 四、本篇总结',
  '',
  '| 层次 | 解决的核心问题 | 最直白的理解 |',
  '| :--- | :--- | :--- |',
  '| **`ai`** | 抹平 40+ 厂商协议 | 无论找谁聊天，都用同一套表格填参数 |',
  '| **`agent-loop`** | 单次聊天无法多步完成任务 | 一个 while 循环：模型要工具 → 帮它跑 → 结果喂回去 |',
  '| **`Agent`** | 算法跑完就销毁，没记忆也不能插话 | 内存管家：记着所有聊天记录，支持中途插话排队 |',
  '| **`coding-agent`** | 通用 Agent 没界面、没工具、聊多会爆 | 最终产品：给它配上改代码工具、终端黑框界面与历史自动压缩 |',
  '| **`harness`** | 增强环境安全与会话分支（下一代） | 可以在容器里跑，并且能像 Git 一样随时回退重试的底盘 |',
  '',
].join('\n')

test('table renders in editor and card with alignment and bold cells', async ({ page }) => {
  await seedContent(page, TABLE_MD)
  await paginateNow(page)

  // 富文本编辑器里是真实表格节点
  await expect(page.locator('.xhs-editor .ProseMirror table')).toContainText('抹平 40+ 厂商协议')

  const card = page.locator('main .xhs-card').first()
  const table = card.locator('table.xhs-table')
  await expect(table).toContainText('层次')
  await expect(table).toContainText('像 Git 一样随时回退重试的底盘')

  const info = await table.evaluate((t) => {
    const rows = Array.from(t.querySelectorAll('tr'))
    const header = rows[0]
    const ths = Array.from(header.querySelectorAll('th'))
    const firstTd = t.querySelector('tbody tr td')!
    const strong = firstTd.querySelector('strong')
    return {
      rowCount: rows.length,
      headerCount: ths.length,
      // GFM :--- → data-align=left
      aligns: ths.map((th) => th.getAttribute('data-align')),
      tdAlign: firstTd.getAttribute('data-align'),
      // **`ai`** 单元格：加粗保留
      hasBold: !!strong,
      boldText: strong?.textContent ?? '',
      fontSize: getComputedStyle(firstTd).fontSize,
    }
  })
  expect(info.rowCount).toBe(6) // 1 表头 + 5 数据行
  expect(info.headerCount).toBe(3)
  expect(info.aligns).toEqual(['left', 'left', 'left'])
  expect(info.tdAlign).toBe('left')
  expect(info.hasBold).toBeTruthy()
  expect(info.boldText).toContain('ai')
})

test('raw markdown round-trip keeps the pipe table and alignment', async ({ page }) => {
  await seedContent(page, TABLE_MD)
  await page.getByRole('button', { name: 'Raw' }).click()
  const text = await page.locator('textarea').inputValue()
  const lines = text.split('\n')
  const headerLine = lines.find((l) => l.startsWith('| 层次'))
  const markerLine = lines.find((l) => /^\| :--- \| :--- \| :--- \|/.test(l))
  expect(headerLine).toBeTruthy()
  expect(markerLine).toBeTruthy()
  expect(text).toContain('| **`agent-loop`** |')
})

test('center/right alignment markers survive the round-trip', async ({ page }) => {
  await seedContent(page, '| A | B |\n| :---: | ---: |\n| 1 | 2 |\n')
  await paginateNow(page)

  await expect(page.locator('main .xhs-card table.xhs-table')).toContainText('B')
  const aligns = await page.locator('main .xhs-card table.xhs-table th').evaluateAll((ths) =>
    ths.map((th) => th.getAttribute('data-align')),
  )
  expect(aligns).toEqual(['center', 'right'])

  await page.getByRole('button', { name: 'Raw' }).click()
  const text = await page.locator('textarea').inputValue()
  expect(text).toContain('| :---: | ---: |')
})

test('tall table splits by rows and repeats the header', async ({ page }) => {
  // 24 行 × 较高单元格：一页放不下，必然跨页
  const rows = Array.from({ length: 24 }, (_, i) => `| 第${i + 1}项 | 这是第${i + 1}行的说明内容，足够长以撑起行高 |`)
  const md = ['| 项目 | 说明 |', '| :--- | :--- |', ...rows, ''].join('\n')
  await seedContent(page, md)
  await paginateNow(page)

  await expect(page.locator('main .xhs-card table.xhs-table').first()).toContainText('第1项')
  const pages = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('main .xhs-card')).map((card) => {
      const table = card.querySelector('table.xhs-table')
      if (!table) return null
      return {
        headerText: table.querySelector('thead')?.textContent ?? '',
        bodyRows: table.querySelectorAll('tbody tr').length,
        firstCell: table.querySelector('tbody tr td')?.textContent ?? '',
      }
    })
  })
  const tables = pages.filter((p): p is NonNullable<typeof p> => p !== null)
  expect(tables.length).toBeGreaterThanOrEqual(2)
  // 每一页都有表头（续页重复）
  for (const t of tables) expect(t.headerText).toContain('项目')
  // 行数守恒：所有页的正文行加起来 = 24
  expect(tables.reduce((s, t) => s + t.bodyRows, 0)).toBe(24)
  // 第二页从第一页没装下的那行继续
  expect(tables[0].firstCell).toContain('第1项')
  expect(tables[1].firstCell).toContain(`第${tables[0].bodyRows + 1}项`)
})
