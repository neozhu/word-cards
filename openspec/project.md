# Project Context

## Purpose
`word-cards` 是一款面向 3–6 岁儿童的极简英语启蒙 Web App。

核心体验是：**一张卡片、一个 Emoji、一个单词、一个句子**；用户通过 **点击朗读** 与 **左右滑动切换** 完成高频、低负担的输入。

设计哲学：Warm（温暖）、Rounded（圆润）、Minimalist（克制）。

## Tech Stack
- Next.js 16+（App Router）
- React 19 + TypeScript
- Tailwind CSS v4（`@import "tailwindcss"` + `@theme inline`）
- ESLint（`eslint-config-next`）

Planned / expected dependencies for the flashcard build:
- `@emoji-mart/data`：数据源（动物 emoji）
- `framer-motion`：卡片拖拽/切换动效与点击反馈
- `lucide-react`：极简音量图标按钮
- Vercel AI SDK（`ai`）+ Google Gemini SDK：服务端 TTS（通过 `/api/tts`）

## Project Conventions

### Code Style
- 语言：TypeScript（`.ts/.tsx`），优先使用类型推导；必要时补充明确类型。
- 目录：使用 Next.js App Router 约定（`app/`、`app/api/*`）。
- 组件：UI 组件为函数组件；需要 `useState`/事件/动画/音频播放的组件使用 Client Component（`"use client"`）。
- 命名：
	- 组件：`PascalCase`（如 `Flashcard`）
	- 工具/函数：`camelCase`
	- 常量：`SCREAMING_SNAKE_CASE`（仅用于确属常量的值）
- 样式：
	- 使用 Tailwind class 为主；全局 tokens 放在 `app/globals.css` 的 CSS 变量/主题映射中
	- 避免引入新的字体/颜色/阴影体系；优先复用项目既定 tokens

### Architecture Patterns
- 单页主体验：主页 `/` 为单屏学习界面，不引入多页面导航。
- 数据流：
	- 从 `@emoji-mart/data` 提取 `animals` 类别作为候选 emoji 集合
	- 以本地 `content.json`（或等价模块）为教学内容来源（word + phrase）
	- 运行时只展示在 `content.json` 中有映射的 emoji（避免“无内容卡片”）
- 音频：通过 `app/api/tts` 提供服务端语音合成；客户端负责用户手势触发播放。
- 动效：Framer Motion 驱动 swipe 与 tap 回弹；交互参数遵循 OpenSpec（如阈值 100px、`dragElastic: 0.2`）。

### Testing Strategy
- 当前仓库未配置测试框架；以构建/静态检查为主：
	- `pnpm lint`
	- `pnpm build`
- 涉及交互（拖拽、音频播放）优先做手动验收：移动端点击朗读、左右滑动切卡、桌面端 430px 容器约束。
- 如后续引入测试：
	- 纯函数/数据清洗逻辑可用单元测试
	- UI 行为可考虑 Playwright（在需求明确时再引入，避免过度工程）

### Git Workflow
- 默认分支：`main`
- 建议流程：feature 分支 → PR → merge `main`
- Commit：倾向短小、可回滚；描述清晰（可用 Conventional Commits，但不强制）

## Domain Context
- 目标用户：3–6 岁幼儿；需要“大字号、低干扰、即时反馈”。
- 教学内容原则：
	- 单词：常见动物（Dog, Cat, Elephant…）
	- 句子：短、具体、易模仿（避免复杂从句）
- 交互原则：
	- 轻交互：点击即听、滑动即换
	- 低认知负担：屏幕元素极少（进度 + 音量重播）

Design tokens（必须遵守）：
- 背景：温暖奶油/米色（移动端为 warm cream，桌面端外侧留白为偏米色）
- 卡片：白底、超大圆角（`rounded-[40px]`）、极轻深邃阴影
- 文字：深可可灰（非纯黑）；强调色为珊瑚橙

## Important Constraints
- UX 范围严格极简：不新增多页面、设置面板、筛选器、复杂动效或“彩蛋”。
- 音频播放必须由用户手势触发（避免浏览器自动播放限制）。
- 桌面端内容容器最大宽度 430px（类似 iPhone Pro Max 尺寸）。
- 服务端 TTS 依赖外部 API：需要考虑失败降级（不弹复杂对话框；可静默失败或轻提示）。
- 不把密钥写入仓库：使用环境变量（`.env.local`）。

## External Dependencies
- `@emoji-mart/data`：提供 emoji 数据（`animals` 分类）
- Google Gemini（通过 Google SDK / Vercel AI SDK）：TTS 生成
	- 入口：`/api/tts`
	- 预期参数：英语语音、较慢语速（约 `0.9`）、偏温暖童声/亲切女声
- 部署：Vercel（Next.js App Router 友好；API Routes 可直接运行）

Environment variables（预期，按实际 SDK 调整命名）：
- `GOOGLE_API_KEY`（或等价凭据）
- `GEMINI_MODEL`（如 Flash 系列；以实际可用模型为准）
