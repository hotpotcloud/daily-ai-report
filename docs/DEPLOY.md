# 部署文档

> daily-ai-briefing 自动化日报的部署与运维手册。
> 适用版本:master 分支,Node ≥ 18(需要内置 `node:sqlite` 与 `fetch`)。

---

## 1. 架构

```
[ RSS 源 ] → fetch-news.js → .news-raw.json(素材)
                              ↓
                       generate-digest.js → MiniMax-M3 API → latest-digest.json
                                                          ↓
                          ┌────────── 服务器端 ──────────┐
                          │                            │
                          │  Python ingest_briefing.py  │
                          │       ↓ (stdin)             │
                          │  /opt/milena-backend/data/  │
                          │   daily_ai_briefing.db      │
                          └─────────────────────────────┘

[ 浏览器/CLI ] → POST /api/chat (server/index.js 本地 Express)
                          ↓
                       chat.js → MiniMax-M3 API (带历史日报上下文)
```

**关键约束**(来自 milen 项目 CONTEXT.yaml,沿用同一台服务器):

- 服务器 1.9GB RAM 资源紧,**不装 Node.js / MariaDB / MySQL**
- 已有 Python 3.11 + Flask + SQLite + Nginx
- 共用 milen 的 SSH key(腾讯云轻量,`119.29.189.103`)

**部署策略**:

| 组件 | 跑在哪 | 谁触发 |
| --- | --- | --- |
| 自动化日报生成 | GitHub Actions(云端 Node 20) | cron 每天 UTC 0:00 / 手动 |
| 日报入库到服务器 | 服务器 Python 脚本 | SSH 推完直接 stdin 喂入 |
| Express API(查日报) | **暂未部署到服务器**(只本地用) | — |
| `/api/chat` 对话 API | **暂未部署到服务器**(只本地用) | — |

> 备注:Express + `/api/chat` 目前**只在本机跑**(`npm run dev`),因为服务器不装 Node。
> 如果之后要让远程也能用,可以在本地用 SSH 隧道 / ngrok / Cloudflare Tunnel 暴露,或者把 chat 改写成 Python endpoint 加到 milen-backend(需要用户显式同意改 milen 代码)。

---

## 2. 前置依赖

| 组件 | 位置 | 要求 |
| --- | --- | --- |
| Node.js 20 | GitHub Actions runner | 自动安装,无需手动配 |
| Python 3.8+ | 服务器 | 已有 3.11 |
| SQLite | 服务器 | Python 标准库,无需装 |
| 网络 | GitHub Actions | 能访问 `api.minimaxi.com` + RSS 源 |
| SSH | GitHub Actions → 服务器 | 沿用 milen 的 ed25519 key |

---

## 3. 一次性配置

### 3.1 GitHub Secrets(daily-ai-report repo)

到 https://github.com/hotpotcloud/daily-ai-report/settings/secrets/actions 添加:

| Secret 名 | 值 | 说明 |
| --- | --- | --- |
| `MINIMAX_API_KEY` | `sk-cp-...` | MiniMax-M3 API key(国内 mirror 用 Subscription Key) |
| `MINIMAX_BASE_URL` | `https://api.minimaxi.com/v1` | 国内 mirror(可选,有默认值) |
| `SERVER_IP` | `119.29.189.103` | 沿用 milen 服务器 |
| `SERVER_SSH_KEY` | ed25519 私钥全文 | **与 milen 的 `SERVER_SSH_KEY` secret 用同一把** |

> ⚠️ key **不能**写进任何文件 / commit / Issue / 聊天。Secret 在 GitHub 后端加密,只在 workflow 运行时注入 env。

### 3.2 服务器端首次部署(把 Python 脚本放上去)

首次跑 workflow 时,`Push ingest script to server` 步骤会自动 scp `deploy/ingest_briefing.py` 到 `/opt/milena-backend/ingest_briefing.py` 并 chmod 755。**不需要手动操作**。

如果想验证 Python 脚本就位:

```bash
ssh root@119.29.189.103
ls -la /opt/milena-backend/ingest_briefing.py
# 期望:存在,权限 755,大小约 4KB
```

### 3.3 验证 SQLite 表

```bash
ssh root@119.29.189.103
sqlite3 /opt/milena-backend/data/daily_ai_briefing.db ".schema digests"
# 期望输出 CREATE TABLE 语句
```

---

## 4. 触发 & 调度

### 4.1 自动 schedule

`cron: '0 0 * * *'`(UTC 0:00 = 北京时间 8:00)每天跑。

### 4.2 手动触发

到 https://github.com/hotpotcloud/daily-ai-report/actions/workflows/daily-briefing.yml → Run workflow。

**首次跑建议手动 trigger,验证完整链路**(看 step summary / 日志)。

---

## 5. 数据位置

| 文件 | 位置 | git? | 备注 |
| --- | --- | --- | --- |
| 生成的日报 | `data/inbox/latest-digest.json` (仓库) | ✅ commit | Actions 自动 commit + push |
| 原始素材 | `data/inbox/.news-raw.json` (本地/Action 临时) | ❌ gitignore | 每次覆盖,debug 用 |
| 服务器数据库 | `/opt/milena-backend/data/daily_ai_briefing.db` | ❌ | Python 写入,独立于 milen.db |
| 数据库备份 | (无) | — | 重要数据建议每周 `sqlite3 .dump` 备份 |

---

## 6. 故障排查

| 症状 | 可能原因 | 排查 |
| --- | --- | --- |
| `M3 API HTTP 401` | key 无效或 base_url 错 | 1) 检查 GitHub Secret `MINIMAX_API_KEY` 是否仍有效;2) 国内用 `api.minimaxi.com`,国际用 `api.minimax.io` |
| `M3 输出不是合法 JSON` | LLM 输出含 raw control char | 脚本已加 control char 修复 + 3 次重试;若仍失败,看 Actions 日志的 "Show generated digest summary" step |
| `素材文件为空(0 条)` | RSS 抓取全失败 | 看 Actions 日志,确认 Google News / Hacker News 可达 |
| `SSH handshake failed` | SERVER_SSH_KEY 损坏 / IP 不通 | 1) `ssh -i ~/.ssh/deploy_key root@119.29.189.103` 手动试;2) 重新生成 key 并更新 Secret |
| `Server 没有 Python3` | 服务器不标准 | `python3 --version`,若无,装 `dnf install -y python3` |
| `/opt/milena-backend` 不存在 | 还没装 milen | 先装 milen(`deploy/setup_backend.py`),或手动 `mkdir -p /opt/milena-backend/data` |

**关键日志位置**:
- Actions run 日志:https://github.com/hotpotcloud/daily-ai-report/actions
- 服务器数据库:`/opt/milena-backend/data/daily_ai_briefing.db`
- 数据库查最近一条:

  ```bash
  ssh root@119.29.189.103 "sqlite3 /opt/milena-backend/data/daily_ai_briefing.db 'SELECT digest_date, market_sentiment, ai_sentiment FROM digests ORDER BY digest_date DESC LIMIT 5'"
  ```

---

## 7. 旋转 API key

1. 在 MiniMax 控制台生成新 key,撤销旧 key
2. GitHub → daily-ai-report → Settings → Secrets → `MINIMAX_API_KEY` → Update
3. 手动 trigger workflow 验证

旧 key 不会从服务器上的 SQLite 泄露(服务器上的 `daily_ai_briefing.db` **不存 secrets**,key 永远只走 GitHub Secret)。

---

## 8. 安全注意

- **API key 永远只走 GitHub Secret**,绝不能写进任何文件 / commit / Issue
- 服务器 SQLite **不存 secrets 表**(只用 digests),即使 DB 泄露也不会泄露 key
- SSH private key **绝不能** commit 到仓库(`.gitignore` 已屏蔽)
- 数据库文件不在公开仓库,GitHub 仓库只存 JSON

---

## 9. 为什么不用 cron

最初方案是服务器 cron + Node,但 milen 服务器资源紧(1.9GB RAM,do_not_repeat 明令"不要装 Node")。改用 GitHub Actions:

- ✅ 不污染服务器环境
- ✅ Actions 免费账户 2000 分钟/月,每天跑 ~1-2 分钟,够用
- ✅ 失败时 GitHub 自动发邮件给 commit 作者
- ✅ 复用 milen 已有的 SSH 部署模式
- ✅ 跟 milen 的 CI/CD 风格一致,降低维护成本

---

## 10. Express API + Chat 端点(本机)

本地跑 `npm run dev` 启动 Express(`http://localhost:3000` 或 `PORT=3535 npm run dev` 改端口)。

### 已有 API

| Method | Path | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查 |
| GET | `/api/digests/latest` | 最新一期日报 |
| GET | `/api/digests?limit=N` | 最近 N 条日报(默认 30) |
| POST | `/api/digests` | 新建/覆盖日报(JSON body 完整 schema) |
| POST | `/api/chat` | **AI 对话**(见下) |

### POST /api/chat(AI 对话)

**两种调用形式**:

1. 单条消息:
   ```bash
   curl -X POST http://localhost:3535/api/chat \
     -H "Content-Type: application/json" \
     -d '{"message": "今天 AI 行业几个重点?简洁列 3 条"}'
   ```

2. 多轮消息:
   ```bash
   curl -X POST http://localhost:3535/api/chat \
     -H "Content-Type: application/json" \
     -d '{"messages": [
     {"role":"user","content":"今天市场情绪?"},
     {"role":"assistant","content":"中性偏多"},
     {"role":"user","content":"为什么?"}
   ]}'
   ```

**响应**(非流式):
```json
{
  "content": "...",
  "model": "MiniMax-M3",
  "contextDigestsUsed": 4,
  "usage": { "total_tokens": 1234, "prompt_tokens": 800, "completion_tokens": 434 }
}
```

**流式**(SSE) — `?stream=true` 或 `Accept: text/event-stream`:
```
data: {"delta": "根据"}

data: {"delta": "最近"}

data: {"delta": "一期"}

...

data: [DONE]
```

**关键行为**:

- 系统 prompt 注入**最近 5 条日报**(从 SQLite 读),M3 严格基于历史日报回答
- 多轮消息保留最近 20 条(避免 prompt 过长)
- 如果 M3 key 没配,返回 500 提示
- API key 读取顺序: `process.env.MINIMAX_API_KEY` → SQLite `secrets` 表 → 报错

**前端集成建议**(用户自行决定,本仓库**不**内置 chat UI):
- 简单 HTML + JS `fetch` 即可
- 流式模式用 `fetch().body.getReader()` + `TextDecoder` 解析 `data: {...}\n\n` 即可
- 避免在前端暴露 key,所有 `/api/chat` 调用走后端
