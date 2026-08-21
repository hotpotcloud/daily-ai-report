# AGENTS.md

> daily-ai-briefing 项目级 agent 指引。给后续 agent 会话读。
> 用户级偏好见 `C:\Users\eason\.minimax\memory\user.md`。

## 项目定位
- 仓库:`https://github.com/hotpotcloud/daily-ai-report`
- 本地路径:`D:\codexPrject\daily-ai-briefing`
- 用途:每日自动抓 AI/金融新闻,调 MiniMax-M3 生成结构化日报,存到 SQLite
- 与 milen 项目(`will-always-love-Milena.Wu`)共用腾讯云轻量服务器

## 关键约束(从 milen CONTEXT.yaml 继承)
- 服务器资源紧(1.9GB RAM),**不要装 Node.js / MariaDB / MySQL 到服务器**
- 服务器端逻辑必须用 Python + sqlite3 标准库,或复用现有 milen-backend
- 沿用 milen 的 SSH key(`SERVER_SSH_KEY` secret,ed25519,无 passphrase)
- 服务器 IP:`119.29.189.103`,用户:root
- 部署路径约定:`/opt/milena-backend/...(跟 milen 一致)
- Web root:`/var/www/milena/...(Nginx 已配)

## 架构
- 自动化跑在 **GitHub Actions**(云端有 Node,无限资源),不在服务器 cron
- 每日 UTC 0:00(=北京 8:00)跑 `.github/workflows/daily-briefing.yml`
- 流程:fetch-news → generate-digest(M3 API)→ commit JSON → SSH 推送到服务器 → Python 脚本 ingest 到 SQLite
- 服务器端 DB:`/opt/milena-backend/data/daily_ai_briefing.db`(独立于 milen.db)

## 端口
- 暂未在服务器上跑 Express(server/index.js 仅本地用)
- 实际"部署"主要是 Python ingest 脚本 + GitHub Actions
- 本地 Express 默认 3000,可以 `PORT=3535 npm run dev` 改端口(避开 milen 3000 段)
- 如果未来要在远程用 Express,需要走 SSH 隧道 / Cloudflare Tunnel,**不要**在服务器装 Node

## 密钥管理
- API key 走 GitHub Secret(`MINIMAX_API_KEY`),**不进任何文件 / commit**
- `scripts/generate-digest.js` 优先读 `process.env.MINIMAX_API_KEY`,fallback 到本地 SQLite `secrets` 表
- 本地 SQLite(`data/briefing.db`)含 secrets 表只用于本地开发,**服务器上不建**
- 旋转 key:改 GitHub Secret → 手动 trigger workflow 验证

## 常用命令
- 本地 dry-run:`node scripts/run-daily.js`
- 仅生成 JSON:`node scripts/fetch-news.js && node scripts/generate-digest.js`
- 写入数据库:`node scripts/ingest-digest.js`
- 注入本地 key(不进 .env):`echo "$KEY" | node scripts/seed-secret.js MINIMAX_API_KEY`
- 启动本地 Express:`PORT=3535 npm run dev`,提供 `/api/health` / `/api/digests/*` / `/api/chat`

## 字段约束(日报 JSON)
- `digestDate` / `title` / `marketSentiment` / `aiSentiment` / `summary` 必须有
- `marketItems` ≥ 3 条,`aiItems` ≥ 3 条
- `metrics` 固定 4 项,label 严格等于:市场风险偏好 / AI 热度 / 半导体景气 / 避险需求
- `chart.labels` 与 metrics.label 一致,`chart.series` 与 metrics.value 一致
- `details` 2-4 段,每段 `{title, content}`,content 200-400 字
- 完整 schema 见 `data/inbox/latest-digest.example.json`

## 不要做
- 不要在服务器装 Node / MariaDB / MySQL
- 不要把 API key 写进任何文件 / commit / Issue
- 不要 push `data/briefing.db` 到 GitHub(包含本地 secrets)
- 不要自作主张改 milen Flask 代码(用户 do_not_repeat)
- 不要用蓝/夜/暗主题(用户偏好)

## 跟 milen 项目的联系
- 共用同一台服务器 + 同一把 SSH key
- 共用 `/opt/milena-backend/` 部署目录(但 DB 文件独立)
- 共用 GitHub Actions 部署模式
- 详见 milen 项目的 `D:\CODE\github-code\milen\will-always-love-Milena.Wu\CONTEXT.yaml`
