# Doris Lee · 个人主页

在线访问：**https://doris-lee97052388150.github.io/**

---

## 站点结构

| 路径 | 内容 |
| --- | --- |
| `/` | 个人主页（导航门户） |
| `/xingce/` | **行测真题离线模拟考场** —— 原首页内容，完整保留 |
| `/sillytavern/` | **SillyTavern 远端入口** —— 手机随时接入电脑上的 ST |
| `/apps/` | 已导入的网页应用列表 |
| `/import/` | 网页包导入工具（浏览器里检查 + 预览） |
| `/真题卷/` | 333 份真题卷子（路径未变，链接照旧） |
| `/img/` | 真题图片，按内容哈希命名（路径未变） |

> 原首页的所有功能与链接都保持可用，只是首页换成了门户，原内容搬到了 `/xingce/`，
> 原说明文档也一并移到 `/xingce/README.md`。

---

## 一、网页包导入（zip → 子页面）

把静态网页 zip 包变成 `https://doris-lee97052388150.github.io/apps/<名称>/`。

### 方式 A：云端自动（手机也能操作，推荐）

1. 打开仓库的 [`_incoming/`](https://github.com/Doris-Lee97052388150/Doris-Lee97052388150.github.io/tree/main/_incoming) 目录
2. `Add file` → `Upload files` → 选择 zip → `Commit changes`
3. GitHub Actions 自动跑：解压到 `apps/<名称>/` → 更新 `apps/manifest.json` → 提交回 `main`
4. Pages 重新部署，几分钟后新页面出现在 `/apps/`

**一次性设置**：仓库 `Settings` → `Actions` → `General` → `Workflow permissions` →
选 **Read and write permissions** → Save。
（否则 Actions 没有权限把解压结果提交回来，工作流会在最后一步失败。）

### 方式 B：本机运行

```bat
node tools/import-zip.mjs 我的网页.zip --title "我的网页" --desc "一句话说明"
git add apps && git commit -m "导入网页包" && git push
```

或者直接把 zip 拖到 `tools/import.bat` 上。

其它命令：

```bat
node tools/import-zip.mjs --all-incoming   :: 处理 _incoming/ 里所有 zip
node tools/import-zip.mjs --list           :: 列出已导入的应用
```

### 方式 C：先在浏览器里检查

打开 <https://doris-lee97052388150.github.io/import/>，把 zip 拖进去：

- 只在你本地浏览器解压，**不会上传到任何服务器**
- 统计文件数与大小、自动识别入口页
- 通过 Service Worker 真实渲染预览首页（相对路径的 CSS / 图片都能加载）
- 生成建议的 slug 与 manifest 记录，一键复制
- 提供「上传到 _incoming/」的直达链接

### 导入规则

- 优先用包里的 `index.html` 作为入口；没有就挑最浅层的 `.html`
- 如果所有文件都在同一个顶层文件夹下，会**自动去掉这层壳**
- 自动跳过 `__MACOSX`、`.DS_Store`、`Thumbs.db`、`desktop.ini`
- 含 `..` 的不安全路径会被拒绝，防止目录穿越
- 同名但不同包会自动改用 `名称-2`、`名称-3`
- 支持中文文件名与中文目录名（UTF-8 / GBK 自动识别）
- 零第三方依赖：`import-zip.mjs` 自带最小 zip 解包器，Windows 和 Linux 都能跑

---

## 二、SillyTavern 手机访问

SillyTavern 是跑在电脑上的 Node 服务，**GitHub Pages 无法托管它**（静态托管没有后端，也不能反向代理）。
因此 `/sillytavern/` 是一个「入口页」：用 Cloudflare 隧道把电脑上的 ST 映射到公网，
入口页保存并跳转到那个地址——效果等同于「把它映射上来」，手机上点一下就进。

### 步骤

1. 电脑上正常启动 SillyTavern（默认 `http://localhost:8000`）
2. 运行隧道脚本：

   ```powershell
   powershell -ExecutionPolicy Bypass -File tools/st-tunnel.ps1 -Push
   ```

   它会自动完成：下载 `cloudflared.exe`（仅首次，约 35 MB）→ 开隧道 →
   抓取 `https://xxx.trycloudflare.com` → 写入 `sillytavern/url.json` → 提交推送。
3. 手机上打开 <https://doris-lee97052388150.github.io/sillytavern/>，点「打开 SillyTavern」。

入口页还支持手动粘贴地址（存在浏览器本地）、检测连接、以及页面内打开。

### 安全提醒（重要）

隧道地址一旦公开，**任何拿到该地址的人都能访问你的 SillyTavern**，包括聊天记录与 API Key。
务必在 `SillyTavern/config.yaml` 里开启访问控制：

```yaml
listen: true
whitelistMode: true
basicAuthMode: true
basicAuthUser:
  username: "你的用户名"
  password: "你的密码"
```

---

## 三、真题题库（原内容）

从首页进入 `/xingce/`，或直接访问 <https://doris-lee97052388150.github.io/xingce/>。

- 333 份卷子、38808 道题，2019–2026 国考 + 主要省考/联考
- 右上角倒计时，默认 120 分钟，可改 90 / 120 / 150 或自定义
- 交卷即判分：总分 /100、模块得分、逐题解析
- 作答进度存在本机浏览器，关掉再开可继续
- 题目与解析来自 [ERRRC/xingcezhenti](https://github.com/ERRRC/xingcezhenti)（网友回忆版）

---

## 四、本机开发

```bat
:: 本地起一个静态服务器预览（可选）
python -m http.server 8080
:: 然后打开 http://localhost:8080/
```

目录说明：

```
├── index.html              门户首页
├── xingce/                 原首页 + 原说明文档
├── sillytavern/            ST 远端入口 + url.json
├── apps/                   导入的网页应用 + manifest.json
├── import/                 浏览器导入工具 + service worker
├── assets/                 site.css / site.js / jszip
├── tools/                  import-zip.mjs / st-tunnel.ps1 / import.bat
├── _incoming/              丢 zip 进来就会自动导入
├── 真题卷/                  333 份卷子
└── img/                    真题图片
```
