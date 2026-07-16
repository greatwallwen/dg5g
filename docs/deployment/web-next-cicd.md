# DGBook Web Next.js CI/CD

This workflow deploys the new `apps/web` Next.js front end. It is separate from
the older Astro cloud-sample deployment.

## What It Publishes

- `apps/web` Next.js application
- Qwen TTS cache under `site/public/media/tts`
- capability-map SVG assets under `site/public/media/capability-maps`
- homepage media under `site/public/media/home`

The release artifact is:

```text
artifacts/web-release/dgbook-web.tar.gz
```

## Local Checks

Use these commands before pushing:

```powershell
node scripts/check-web-structure.mjs
node scripts/check-file-sizes.mjs 800
pnpm --filter @dgbook/edugame-core typecheck
pnpm --filter @dgbook/widgets typecheck
pnpm --filter @dgbook/animation typecheck
pnpm --filter @dgbook/web build
pnpm --filter @dgbook/web typecheck
pnpm audit:web:remote -- --base-url http://8.153.206.97/
```

`pnpm deploy:web:build-ready` is intended for the Linux CI runner. On Windows,
Next standalone output may fail when the local account cannot create symlinks
for pnpm dependencies.

## Gitea Workflow

The workflow is:

```text
.gitea/workflows/deploy-web.yml
```

It runs:

1. install dependencies
2. structure and file-size gates
3. package type checks
4. `pnpm deploy:web:build-ready`
5. `pnpm deploy:web:ssh`
6. remote browser smoke with `pnpm audit:web:remote`

## Required Secrets

The workflow accepts either web-specific secrets or the existing deploy secrets.

```text
DGBOOK_WEB_DEPLOY_HOST
DGBOOK_WEB_DEPLOY_USER
DGBOOK_WEB_DEPLOY_PASSWORD
DGBOOK_WEB_DEPLOY_SSH_KEY
DGBOOK_WEB_DEPLOY_KNOWN_HOSTS
DGBOOK_WEB_DEPLOY_PUBLIC_HOST
DGBOOK_HELPER_TOKEN
```

`DGBOOK_HELPER_TOKEN` is injected into the generated systemd unit by both
source-deployment transports. Keep it in the deployment environment/secret
store; never place its value in a release manifest or command-line argument.
If it is omitted, the classroom Helper API remains disabled.

Optional:

```text
DGBOOK_WEB_DEPLOY_BASE_DIR
DGBOOK_WEB_DEPLOY_DROP_DIR
DGBOOK_WEB_DEPLOY_SERVICE
DGBOOK_WEB_DEPLOY_APP_PORT
DGBOOK_WEB_DEPLOY_NGINX
```

Defaults:

```text
base dir: /var/www/dgbook-web
drop dir: /opt/dgbook-deploy/web
service: dgbook-web
app port: 3157
nginx: enabled
```

## Remote Runtime

The SSH deploy script creates or updates:

```text
/var/www/dgbook-web/releases/<release-id>
/var/www/dgbook-web/current
/etc/systemd/system/dgbook-web.service
/etc/nginx/conf.d/dgbook-web.conf
```

The Node process runs:

```text
node apps/web/server.js
```

The nginx config proxies the public host to the local Next.js service.

## Smoke Scope

Remote smoke checks:

- `/`
- `/platform`
- `/samples/deep-textbook/P01-P02`
- `/projects/P1`
- `/learn/P1T1-N01`
- `/teacher/sessions/P1T1-N01`
- `/present/P1T1-N01`
- `/classroom/P1T1-N01`
- `/maps/course?focus=P1T1-N01`
- P2-P6 remain non-learning-chain entries
- `/learn/P01-P02` remains blocked
- class-session API write protection
- no console errors
- no horizontal overflow

The public demo is not considered closed until `pnpm qa:demo-live` passes against
the target URL.
