# HL 游戏作品集

这是 HL 的游戏作品集，也是茂一杀的主作品官网。站点重点展示茂一杀的真实截图、玩法说明、技术栈、构建流程、Windows 下载信息和发布检查。月下符札只作为其他作品展示。

## 本地运行

```powershell
npm install
npm run site:dev
npm run site:build
npm run site:preview
```

## 页面

- `/`：首页，HL 身份、茂一杀首屏、截图舞台和其他作品。
- `/maoyisha`：茂一杀完整作品案例。
- `/download`：Windows 1.5.10 完整包、累积更新包、SHA-256 和解压说明。
- `/build`：技术与构建，说明规则共享包、React UI、Photon、CloudBase、Electron、Capacitor 和发布流程。
- `/works/yuexia-fuzha`：月下符札次级作品展示。
- `/about`：HL 公开联系方式。

## Cloudflare Pages

连接仓库后填写：

```text
Root directory: apps/site
Build command: npm run build
Build output directory: dist
```

`public/_redirects` 已加入：

```text
/* /index.html 200
```

这样 `/download`、`/build` 等前端路由刷新时会回到 SPA 入口。

## 下载文件

不要把 `.zip` 或 `.exe` 放进网站源码。茂一杀 Windows 完整包、累积更新包、SHA256 文件和 RELEASE 说明应上传到 GitHub Releases 或对象存储，确认 SHA-256 后再把下载按钮改成真实链接。

推荐 Release 标签：`v1.5.10`

详细发布步骤见 `apps/site/PUBLISHING.md`。

## 素材约束

- 茂一杀截图只使用 `apps/site/public/media/maoyisha-*.webp`。
- 月下符札截图只使用 `apps/site/public/media/yuexia-*.webp`。
- `docs/ui-reference` 下的图片是三国杀参考图，不能进入网站成品。
- `apps/site/public/media` 中的 WebP 是展示副本，不是发布包。
