# PWA 最小补丁 · 只加 PWA，其他不动（2026-11-19）

## 现状

你上次上传把文件夹压平了，仓库现在全是根目录文件，但页面里还写着 assets/css/app.css、js/pwa.js，所以：
- 样式全丢（app.css 找不到）
- 图标找不到
- 题库加载不出来（data-loader 指向 data/ 目录）

## 这一版怎么修

不重构、不建文件夹，**保持你仓库原有的扁平结构**，只做两件事：

1. 页面恢复成原始版本 + 加 3 处 PWA 引用（指向根目录文件）
   - `<link rel="manifest" href="manifest.json" />`
   - `<link rel="apple-touch-icon" href="apple-touch-icon.png" />`
   - 底部 `<script src="pwa.js"></script>`
2. manifest.json 和 sw.js 里的路径全部改成根目录文件名（不再指向 assets/、js/、data/）

业务逻辑、样式、题库、AI 配置、录音、练习记录：一个字没改。

## 上传清单（21 个文件，全部放根目录，直接覆盖）

页面（9 个）：
index.html、math.html、records.html、select.html、structured.html、structured-hub.html、structured-list.html、structured-template.html、videos.html

修复：
data-loader.js（恢复成读根目录 json 的原始版本）

新增 PWA：
pwa.js、manifest.json、sw.js、.nojekyll

图标（7 个）：
icon-192.png、icon-512.png、icon-maskable-192.png、icon-maskable-512.png、apple-touch-icon.png、favicon.ico、favicon-32.png

## 上传步骤

1. 打开仓库 main 分支 → Add file → Upload files
2. 把这 21 个文件拖进去（都是文件，没有文件夹，不会再有压平问题）
3. 提交信息：`fix: 恢复原结构并修正 PWA 路径`
4. 等 Actions 绿勾

## 验证

- [ ] 首页样式恢复正常（不再是白底蓝色超链接）
- [ ] 进入结构化刷题，题目能出来
- [ ] 地址栏出现安装图标 / 手机菜单出现「添加到主屏幕」
- [ ] F12 → Application → Manifest 图标能预览，Service Worker activated
- [ ] 断网重开首页仍能显示

## 顺带清理（可选）

仓库根目录的 `上传说明.md` 是我给你的说明文档，不需要的话可以直接在 GitHub 上删掉。