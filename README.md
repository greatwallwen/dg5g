# DGBook 5G 数字教材

DGBook 是基于 TypeScript、React 与 Next.js 的 5G 网络优化数字教材。`apps/web` 是唯一产品运行入口，覆盖学生自学、教师授课工作台、课堂跟随、投屏和课程能力图谱。

技术基线：**TypeScript + React + Next.js**。

## 工程结构

```text
D:/Claude/dgbook
├─ apps/web/                         # Next.js 产品运行时
│  ├─ src/app/                       # 路由、鉴权与数据装配
│  ├─ src/features/learning/         # 学生首页、P1 项目、自学与专业成果
│  ├─ src/features/classroom/        # 教师、投屏与课堂跟随
│  ├─ src/features/capability-map/   # 课程能力图谱
│  ├─ src/features/playback/         # 音频、字幕与讲解动作
│  └─ src/platform/                  # SQLite、快照、状态机与媒体适配
├─ packages/                         # 共享动画、组件、类型与 EduGame 能力
├─ content/5g/5g.docx                # 权威教材源
├─ textbook/5g/generated/            # P1 运行内容
├─ apps/web/public/media/            # 已验证的运行媒体闭包
└─ site/public/media/                # 导入器使用的作者媒体源，不参与运行
```

## 开发与验证

使用 Node `24.15.0` 和 pnpm `9.15.0`：

```powershell
pnpm install --frozen-lockfile
pnpm dev
pnpm web:test:unit
pnpm typecheck
pnpm web:check-structure
pnpm build
pnpm qa:gates
```

根命令均指向 `apps/web`。教材源变化时，先修改可复现导入器，再执行：

```powershell
python scripts/import-5g-docx.py
```

## 样张验收范围

- 一名教师和三名学生；
- P01 室内、P02 室外、P03 投诉三个完整任务；
- 十二个能力节点、三份专业成果和项目成果包；
- 自学与课堂跟随互不覆盖；
- 学生端、教师端、投屏端和图谱端共享同一状态与统计口径；
- Image2 视觉合同覆盖登录、角色首页、学习、课堂、投屏和图谱。

## 发布

```powershell
pnpm deploy:web:source
pnpm deploy:web:source:paramiko
pnpm deploy:web:source:ready
```

发布链会生成带 SHA 的源码包，在服务器上构建并原子切换。公开地址为 [http://8.153.206.97/](http://8.153.206.97/)。

## 约束

- 运行时只读取 `apps/web/public/media/`，媒体清单和 SHA 必须通过门禁。
- SQLite 是教师、学生、课堂、图谱和成果状态的共同权威来源。
- 不使用浏览器身份覆盖、写死人数/成绩或不存在节点的静默跳转。
- 保持单向数字教材，不增加学生对话、圆桌讨论或问答助手入口。
