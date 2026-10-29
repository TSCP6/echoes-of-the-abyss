# GitHub Pages 部署

游戏源码保留在独立仓库，通过 GitHub Actions 构建并将 `dist/` 发布到 Pages；无需后端服务或自定义域名。

## 首次发布

1. 当前远程仓库已改名为 `TSCP6/echoes-of-the-abyss`，进入仓库的 `Settings → Pages`，在 `Build and deployment → Source` 中选择 `GitHub Actions`。账号设置中的 Pages 用于域名管理，不是这个入口；`Custom domain` 留空。
2. 工作流 `.github/workflows/deploy.yml` 监听 `xyy` 分支。确认要发布的提交后，在仓库根目录执行 `git push origin xyy`。
3. 在仓库 `Actions` 查看“部署深渊回响到 GitHub Pages”。构建任务依次执行 `npm ci`、类型检查、单元测试和 `npm run build-nolog`；全部成功后才发布。
4. 如果 `github-pages` 环境的部署分支规则只允许主分支，在 `Settings → Environments → github-pages` 中允许 `xyy`，再重试部署。以后改用主分支发布时，同步修改工作流的分支过滤及环境规则。
5. 默认网址为 `https://tscp6.github.io/echoes-of-the-abyss/`，以成功部署任务输出和 Pages 设置显示的地址为准。如果个人主页配置了自定义域名，项目站点可能继承该域名。

## 更新与回退

- 后续每次推送到 `xyy` 自动重新构建发布；不提交 `dist/`、`node_modules/` 或临时输出。
- 工作流进入默认分支后，也可通过 `Actions → Run workflow` 手动触发，并选择发布分支。
- 如需回退，使用正常的回退提交恢复已确认可用的版本，再推送到发布分支，避免强制推送或改写共享历史。
- 生产构建沿用 `vite/config.prod.mjs` 的 `base: './'`；Phaser 资源路径使用相对地址，发布网址保留末尾 `/`。
- Pages 只上传 `dist/`，不上传 `tools/` 下的素材溯源文件。

## 发布后检查

打开网站，确认主菜单、第一关、角色和地形贴图、音乐与音效加载正常；刷新页面后仍能进入游戏，并检查浏览器控制台及网络请求是否有异常或 404。

线上与本地开发地址的浏览器存档独立。需要继续本地进度时，使用游戏的存档导出、导入功能；不要清空原存档。

## 本次本地验证（2026-10-29）

- `npx.cmd --no-install vue-tsc --noEmit`：通过。
- `npx.cmd --no-install vitest run`：50 个测试文件、485 个测试通过。
- `npm.cmd run build-nolog`：通过；生成的 HTML 引用相对路径的脚本、样式和图标。
- 按用户最终要求只创建本地提交；未推送，未执行 GitHub Actions，未进行线上浏览器验证。
