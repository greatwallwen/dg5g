# 5G 云端样张 CI/CD 发布说明

本文说明如何用 Gitea/Gitee Actions 自动构建并发布 5G 教材样张。

## 目标

CI/CD 做四件事：

1. 构建 Astro 站点。
2. 裁剪首页、第 1 章索引、P01-P03 样张。
3. 通过 SSH 发布到云服务器。
4. 对公网地址做 smoke 检查。

对应 workflow：

```text
.gitea/workflows/deploy-cloud-sample.yml
```

对应本地发布脚本：

```powershell
pnpm deploy:sample:5g:ssh
```

## Secrets 配置

在 Gitea/Gitee 仓库的 Actions Secrets 中配置：

| 名称 | 必填 | 说明 |
| --- | --- | --- |
| `DGBOOK_DEPLOY_HOST` | 是 | 云服务器 IP 或域名 |
| `DGBOOK_DEPLOY_USER` | 否 | SSH 用户，默认 `root` |
| `DGBOOK_DEPLOY_SSH_KEY` | 推荐 | SSH 私钥内容，推荐使用 ed25519 deploy key |
| `DGBOOK_DEPLOY_PASSWORD` | 可选 | SSH 密码；仅作为过渡方案 |
| `DGBOOK_DEPLOY_BASE_URL` | 推荐 | 发布后的公网地址，例如 `http://8.153.206.97/` |
| `DGBOOK_DEPLOY_BASE_DIR` | 否 | 默认 `/var/www/dgbook-5g-p01-p03` |
| `DGBOOK_DEPLOY_DROP_DIR` | 否 | 默认 `/opt/dgbook-deploy/5g-p01-p03` |
| `DGBOOK_DEPLOY_RELOAD_CMD` | 否 | 默认 `nginx -t && systemctl reload nginx` |
| `DGBOOK_DEPLOY_CHOWN` | 否 | 默认 `www-data:www-data`，空值表示不执行 chown |
| `DGBOOK_DEPLOY_KNOWN_HOSTS` | 可选 | 严格主机校验用 known_hosts |

最小配置：

```text
DGBOOK_DEPLOY_HOST=8.153.206.97
DGBOOK_DEPLOY_USER=root
DGBOOK_DEPLOY_PASSWORD=<放到 Secret，不写入仓库>
DGBOOK_DEPLOY_BASE_URL=http://8.153.206.97/
```

更推荐的配置是使用 SSH key：

```powershell
ssh-keygen -t ed25519 -f .\dgbook-deploy -C dgbook-ci
```

把 `dgbook-deploy.pub` 加到服务器：

```bash
mkdir -p ~/.ssh
cat dgbook-deploy.pub >> ~/.ssh/authorized_keys
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
```

把私钥文件内容写入仓库 Secret `DGBOOK_DEPLOY_SSH_KEY`。

## 触发方式

支持两种触发：

- 手动：Actions 页面选择 `Deploy 5G Cloud Sample` 后运行。
- 自动：推送到 `main` 或 `codex/sync-gitee-ralph-loop-20260531`。

如果尚未配置部署 Secrets，workflow 仍会完成构建、打包和本地 smoke，
但会跳过 SSH 发布和远端 smoke，不会把 CI 直接跑红。

自动触发只监听与样张相关的目录：

```text
site/
packages/
scripts/
textbook/
docs/deployment/
package.json
pnpm-lock.yaml
```

## 发布目录

服务器目录结构：

```text
/var/www/dgbook-5g-p01-p03/
├─ current -> releases/<release-id>
└─ releases/
   └─ <release-id>/
```

每次发布都会生成新 release，然后原子切换 `current` 软链。

Nginx 只需要指向：

```text
/var/www/dgbook-5g-p01-p03/current
```

## 本地 dry run

不连接服务器，只检查包和环境配置：

```powershell
$env:DGBOOK_DEPLOY_HOST="8.153.206.97"
$env:DGBOOK_DEPLOY_USER="root"
$env:DGBOOK_DEPLOY_PASSWORD="dummy"
pnpm deploy:sample:5g:ssh -- --dry-run
```

## 本地完整发布

本地机器已经有 SSH 凭据时可运行：

```powershell
pnpm deploy:sample:5g:build-ready
pnpm deploy:sample:5g:ssh
pnpm deploy:sample:5g:smoke:remote -- --base-url http://8.153.206.97/ --manifest artifacts/cloud-samples/5g-p01-p03.upload-manifest.json --out output/playwright/cloud-sample-remote
```

## 回滚

服务器上保留历史 release。回滚只需切换 `current`：

```bash
ln -sfn /var/www/dgbook-5g-p01-p03/releases/<old-release-id> /var/www/dgbook-5g-p01-p03/current
nginx -t && systemctl reload nginx
```

## 质量门禁

CI 中执行：

```powershell
pnpm deploy:sample:5g:build-ready
pnpm deploy:sample:5g:ssh
pnpm deploy:sample:5g:smoke:remote -- --base-url "$DGBOOK_DEPLOY_BASE_URL" --manifest artifacts/cloud-samples/5g-p01-p03.upload-manifest.json --out output/playwright/cloud-sample-remote
```

`build-ready` 已包含：

- 站点构建
- 样张裁剪
- 静态资源校验
- 本地浏览器 smoke
- zip 打包
- zip 解包复验
- 上传前 preflight

远端 smoke 会检查：

- `/`
- `/chapters/ch1/`
- `/projects/P01/`
- `/projects/P02/`
- `/projects/P03/`
- 缓存音频和视频资源
- 动画播放框
- 互动游戏容器

## 注意

- 不要把服务器密码、私钥或 token 写入仓库。
- 发布包只包含样张，不是完整教材。
- 第 1 章索引可点击；未打包章节仍会禁用，避免 404。
- 若 CI runner 没有 `sshpass`，请改用 `DGBOOK_DEPLOY_SSH_KEY`。
