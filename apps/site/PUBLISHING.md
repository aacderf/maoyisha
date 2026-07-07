# 茂一杀个人网站发布清单

这份文件给 HL 自己使用，不作为公开网页内容。

## 1. 发布前本地验证

先在仓库根目录执行基础验证：

```powershell
npm run typecheck
npm test
```

这两步用于确认共享规则包、Web 端类型、关键测试和联机辅助逻辑没有明显回退。

## 2. 生成桌面端

在仓库根目录执行：

```powershell
npm run desktop:dist
```

目标是生成可运行的 Windows 桌面目录。发布前确认第一层能看到：

- `茂一杀.exe`
- `resources`
- `assets`
- `version.json`
- `version.sig`

## 3. 桌面 QA 截图

执行：

```powershell
npm run qa:desktop
```

重点检查：

- 大厅截图是否正常。
- 4 人、6 人、8 人桌面布局是否没有遮挡。
- 手牌 hover、拖拽出牌、目标选择、技能区和战况层是否可见。
- 网站展示用截图仍然来自真实茂一杀画面。

## 4. 生成发布包

生成完整包：

```powershell
npm run release:package
```

生成累积更新包：

```powershell
npm run release:offline-update -- --minimum 1.3
```

需要核对：

- GitHub 完整包资产名：`maoyisha-1.5.10-windows-x64.zip`
- GitHub 累积更新资产名：`maoyisha-update-1.3-to-1.5.10-windows-x64.zip`
- SHA-256 文件
- RELEASE 说明

## 5. 手动验收发布包

至少做一次完整玩家路径：

- 解压完整 ZIP。
- 运行第一层 `茂一杀.exe`。
- 确认大厅能打开。
- 确认资源没有缺失。
- 核对 ZIP 的 SHA-256 是否和网站显示一致。
- 确认只复制单个 exe 时不会被当作正确安装方式宣传。

## 6. 上传 GitHub Releases

在 GitHub Releases 新建标签：

```text
v1.5.10
```

上传：

- 完整 ZIP
- 累积更新 ZIP
- SHA-256 文件
- RELEASE 说明

GitHub Release 附件名建议使用 ASCII，避免中文文件名被 GitHub 清洗后导致下载链接不稳定。

上传后复制两个资源的真实下载地址：

- 完整包 URL
- 累积更新包 URL

## 7. 启用网站下载按钮

把两个下载地址填入：

```text
apps/site/src/siteData.ts
```

对应字段：

- `release.fullPackage.href`
- `release.updatePackage.href`

填完后执行：

```powershell
npm run site:build
```

## 8. 部署 Cloudflare Pages

Cloudflare Pages 配置：

```text
Root directory: apps/site
Build command: npm run build
Build output directory: dist
```

域名可以先不买，先用 Cloudflare Pages 免费域名。正式展示时再考虑 `.com`、`.net`、`.dev` 或 `.xyz`。

## 9. 线上最终验收

网站上线后再做一次完整链路：

- 打开首页。
- 进入茂一杀详情页、下载页、技术与构建页。
- 确认公开页面没有站长待办语气。
- 确认网站没有三国杀参考图。
- 下载完整包。
- 解压整个文件夹。
- 运行第一层 `茂一杀.exe`。
- 核对 SHA-256。
