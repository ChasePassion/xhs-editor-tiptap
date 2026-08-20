# 小红书图文编辑器

一个基于 React、Tiptap 和 Vite 的小红书图文卡片编辑器，支持 Markdown/富文本编辑、自动分页，以及导出 1080 × 1440 PNG 图片和 ZIP 压缩包。

## 本地启动

```bash
pnpm install
pnpm dev
```

打开终端显示的本地地址即可使用。

## 常用命令

```bash
pnpm dev       # 启动开发服务器
pnpm build     # 构建生产版本
pnpm lint      # 静态检查
pnpm test:e2e  # 运行端到端测试
```

## 主要能力

- Tiptap 富文本与 Raw Markdown 双模式编辑
- 1080 × 1440、3:4 卡片预览
- 根据内容自动分页（段落/引用按行级切分，分页边界落在段中间就从中间切开）
- 围栏代码块：` ```text ` 树形图等宽显示（超宽自动缩字号）；` ```mermaid ` 预渲染为矢量图
- 保持字体与字重一致的 PNG 导出
- 多页图片打包为 ZIP 下载
