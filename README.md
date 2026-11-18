# 教资面试学习室（初中数学）

纯静态多页应用：HTML + 本地 Tailwind + 原生 ES Module，无构建工具、无后端。
用于教资面试练习：**结构化问答**（五大题型，2 分钟限时）+ **初中数学试讲**（10 分钟流程与板书）。

## 一、运行

必须通过本地 HTTP 服务打开（`file://` 下浏览器会拦截 `fetch` 读取 JSON，录音也拿不到麦克风权限）。

```powershell
cd e:\vibe_project
python -m http.server 8000
```

浏览器访问：<http://localhost:8000/index.html>

> 没有 Python 时，任选一种静态服务器：`npx serve`、VS Code 的 Live Server 插件等。
>
> **Windows 一键启动**：双击项目根目录的 `start.cmd`。它会先 `cd` 到项目根目录再起服务并自动打开首页——服务的工作目录必须是 `e:\vibe_project`，否则访问 `structured.html` 会 404。

## 二、页面

| 页面 | 作用 |
| --- | --- |
| `index.html` | 首页，两个练习入口 + AI 设置齿轮 |
| `structured-hub.html` | 结构化一级页：五大题型，每题型的「查看模板 / 刷题」两个入口 |
| `structured-template.html?type=self` | 题型模板页：只放该题型的答题框架、过渡句、示范与失分点 |
| `structured-list.html?type=self` | 该题型的题目列表：搜索、随机抽题，点进去作答 |
| `structured.html?id=S001` | 单题作答：题干 → 固定 2 分钟计时 → 换题 / 提交评分（不含模板） |
| `select.html?mode=structured` | 旧的结构化选题页（题库全量浏览，仍可用；主入口已改为题型页） |
| `select.html?mode=math` | 试讲选题（代数 / 几何 / 统计与概率） |
| `math.html?id=M001` | 试讲：课题 → 流程与板书 → 计时讲稿 → 评分 |
| `records.html` | 练习记录：练习次数/平均分/最高分、按题型筛选与排序、单条维度详情、重做与删除/清空 |
| `videos.html` | 示范视频位：有 `embedUrl` 就内嵌，没有就跳 B 站搜索 |
| `card.html` | 与本项目无关的旧文件，可删除 |

**结构化练习流程**：`structured-hub.html` 选题型 → ①「查看模板」进 `structured-template.html?type=xxx`（只放该题型框架）／②「刷题」进 `structured-list.html?type=xxx` 挑题 → `structured.html?id=Sxxx` 只给题干 + 固定 2 分钟计时 + 换题 + 提交评分。模板与作答页完全分开，作答时看不到框架；换题只在同一题型内抽，计时自动回到 02:00。

**首页视觉**：`index.html` 有一层纯装饰的海洋背景（3 层不同速度的波浪 + 3 个呼吸光斑 + 9 个上浮气泡），只对 `transform` / `opacity` 做动画，不动布局；切到后台自动暂停、`prefers-reduced-motion` 下关闭、打印时隐藏；卡片与按钮只有 2px 以内的上浮和轻微缩放反馈。作答页（`structured.html` / `math.html`）保持静止，不加任何背景动效。

## 三、AI 评分（可选）

右上角齿轮 → 选择服务商（DeepSeek / 通义千问 / 智谱 GLM / OpenAI / 自定义 OpenAI 兼容端点）→ 填 API Key → “测试连接” → 保存。

- 密钥只存在本机 `localStorage`，不会上传到本项目以外的服务器；换设备需重填。
- **未配置或请求失败时自动降级为本机规则评分**（关键词覆盖 + 结构标志词 + 篇幅），结果卡会标注“本机规则评分”。
- 本机规则评分只用于自查，不等于考官评分。

## 四、目录

```
index.html  structured-hub.html  structured-template.html  structured-list.html
structured.html  math.html  select.html
records.html  videos.html  start.cmd
README.md
assets/
  css/app.css              组件样式、富文本、打印
  vendor/tailwind-play.js  Tailwind Play CDN（本地副本，可离线）
  img/
data/
  structured-questions.json  30 道结构化题（题面、参考要点、参考答案）
  structured-templates.json  五大题型模板 + 两套评分维度（structured / trial）
  math-questions.json        12 个初中数学课题（目标、重难点、环节提示、板书）
  math-outline.json          试讲流程 + 三个板块模板
  videos.json                示范视频占位（embedUrl 为空时只显示搜索入口）
js/
  tailwind-config.js  utils.js  storage.js  data-loader.js
  timer.js  picker.js  recorder.js  template-store.js
  llm.js  settings.js  scoring.js
  home.js  select-page.js  math-page.js
  structured-nav.js  structured-hub-page.js
  structured-template-page.js  structured-list-page.js  structured-page.js
  records-page.js  videos-page.js
```

## 五、替换成自己的模板 / 题目

**方式 A：直接改 JSON（推荐，改动全局生效）**

- 只改文本，不要改字段名；数组项之间用英文逗号分隔。
- 结构化题型模板：`data/structured-templates.json` → `types[]`，字段 `structure`（答题结构，逐条）、`phrases`（过渡句）、`demo`（示范答案，支持 `**加粗**`）、`pitfalls`（失分点）。
- 结构化题库：`data/structured-questions.json` → `items[]`，`type` 需与模板 `name` 对应（如“自我认知”对应“自我认知类”）。
- 试讲课题：`data/math-questions.json` → `items[]`，`boardId` 取 `algebra` / `geometry` / `statistics`。
- 板块模板：`data/math-outline.json` → `boards[].template`，`process` 为逐条环节（建议保留时间标注）。
- 视频：把 16:9 播放器嵌入地址填入 `videos.json` 的 `embedUrl`（如 `//player.bilibili.com/player.html?bvid=BVxxxx`）。

**方式 B：页面内“我的模板”**（`template-store.js` 已提供读写接口，优先级：用户模板 > 内置）
后续会接入编辑面板；接口为 `saveStructuredOverride(typeId, patch)` / `removeStructuredOverride(typeId)` 与试讲板块对应方法。

## 六、录音与练习记录

**录音**（结构化页 / 试讲页的作答区；结构化固定 2 分钟，录音上限同样 2 分钟）

- 点“● 开始录音”→ 浏览器询问麦克风权限 → 允许后开始计时录音，再点“■ 停止录音”生成回放条。
- 若浏览器支持语音识别（Chrome / Edge 桌面版），转写文字会自动追加到作答框，可再手动润色；不支持的浏览器只录音、不转写，此时请手动打字。
- 录音以内存里的 blob 形式存在，**刷新页面即丢失**，也不会写入 IndexedDB；需要留存请用播放器的下载按钮另存。
- 依赖 HTTPS 或 `localhost`；用 `file://` 打开拿不到麦克风权限。

**记录**（`js/storage.js`）

- 每次生成评分后写一条到 IndexedDB `attempts`（模式、题目、作答、总分、各维度得分），首页“继续上次练习”读 `localStorage` 的 `last-practice` 跳回上一次的题。
- 记录只在本机，清理站点数据会全部丢失。
- 记录页（`records.html`）：顶部统计练习次数 / 平均分 / 最高分，按“全部 / 结构化 / 试讲”筛选并可在“最新优先 / 高分优先”间切换；每条卡片展示总分等级与权重最高的三个维度，展开后可见全部维度、当时作答，并提供“重做这道题”“删除这条”和底部“清空全部记录”。

## 七、当前边界（骨架阶段）

- 已实现：结构化题型一级页（模板 / 刷题分离）、题型模板页、按题型刷题列表、单题 2 分钟限时作答、录音与可选转写、AI 或本机六维评分、练习记录页（统计 / 筛选 / 排序 / 维度详情 / 重做 / 删除）、继续上次、示范视频页、设置面板。
- 未实现：页面内编辑“我的模板”（`template-store.js` 的覆盖接口已就绪，缺编辑 UI）、PWA 离线。
- 根目录 `card.html` 与本站无关，可忽略或删除。

## 八、内容说明

题目与模板整理自公开备考资料并做了改写，仅用于个人练习，不代表官方评分标准；示范答案不是唯一答案。
