# _incoming/ — 待导入的网页包

把做好的静态网页 zip 包**直接丢进这个文件夹**，然后提交（commit & push）。

GitHub Actions 会自动：

1. 解压每个 zip 到 `apps/<名称>/`
2. 更新 `apps/manifest.json`
3. 重新部署站点

几分钟后，新页面就会出现在 `https://doris-lee97052388150.github.io/apps/`。

## 手机上怎么上传

1. 用浏览器打开本仓库的 GitHub 页面
2. 进入 `_incoming/` 文件夹
3. 点右上角 `Add file` → `Upload files`
4. 选 zip → `Commit changes`

## 注意事项

- zip 里最好有一个 `index.html`（作为入口页）；没有的话会自动挑最浅层的 html。
- 如果 zip 里所有文件都在同一个文件夹下，会自动去掉这层文件夹。
- 想自定义标题/说明，用本机命令：`node tools/import-zip.mjs 包.zip --title "标题" --desc "说明"`
- 已经导入过的 zip 可以删掉，不影响 `apps/` 里的成品。
