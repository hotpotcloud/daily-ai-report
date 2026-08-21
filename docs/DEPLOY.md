# 部署文档

> daily-ai-briefing 自动化日报服务的部署与运维手册。
> 适用版本:master 分支,Node ≥ 18(需要内置 `node:sqlite` 与 `fetch`)。

---

## 1. 架构

```
[ RSS 源 ] → fetch-news.js → .news-raw.json(素材)
                              ↓
                       generate-digest.js → MiniMax-M3 API → latest-digest.json
                                                          ↓
                                                      ingest-digest.js → SQLite (briefing.db)

每日通过 cron / 任务计划 串行触发 scripts/run-daily.js
Express(server/index.js) 默认端口 3000,本项目部署到 3535 避开 milen 服务
```

- 数据库:SQLite(`data/briefing.db`),单文件,无需额外服务
- 密钥存储:SQLite 内 `secrets` 表(**不**写 .env / 不进 git)
- LLM:`MiniMax-M3`,OpenAI 兼容协议,默认走国内 mirror

---

## 2. 前置依赖

| 项 | 要求 | 说明 |
| --- | --- | --- |
| Node.js | ≥ 18.0(推荐 20 LTS) | 需要 `node:sqlite` 与全局 `fetch` |
| npm / pnpm | 任一 | 仓库当前用 pnpm-lock |
| 网络 | 能访问 `api.minimaxi.com`(国内)/ `api.minimax.io`(国际) | 还要能访问 Google News / Hacker News / 36kr |
| 磁盘 | ≥ 500 MB 可用 | SQLite + 日报 + 临时文件 |
| 端口 | 3535(避开 milen 自身 3000 段) | 可改,见 §6 |

---

## 3. 首次部署

### 3.1 拉取代码

```bash
cd /opt   # 或你想放的位置
git clone git@github.com:hotpotcloud/daily-ai-report.git
cd daily-ai-report
```

### 3.2 安装依赖

```bash
pnpm install --prod
# 或 npm ci --omit=dev
```

### 3.3 注入 API key(不进 .env,直接入库)

```bash
# 方式 A:从 stdin 喂 key(推荐,不留 shell 历史)
read -p "MINIMAX_API_KEY: " -s KEY && echo "$KEY" | node scripts/seed-secret.js MINIMAX_API_KEY

# 方式 B:从已有 .env 读(迁移场景)
# grep '^MINIMAX_API_KEY=' .env | cut -d= -f2- | node scripts/seed-secret.js MINIMAX_API_KEY
```

执行成功后数据库 `secrets` 表会出现 `MINIMAX_API_KEY`,日志只显示前后 4 位掩码。

### 3.4 初始化数据库

```bash
node scripts/init-db.js
```

`init-db` 是幂等的,可以重复执行,会确保表结构存在(并补齐老库的列)。

### 3.5 启动 Express(端口 3535)

```bash
PORT=3535 nohup node server/index.js > /var/log/daily-ai-briefing.log 2>&1 &
```

验证:

```bash
curl -s http://localhost:3535/ | head
```

---

## 4. 每日调度

### 4.1 Linux crontab

每天 08:00(北京时间)跑一次:

```bash
crontab -e
# 加一行:
0 8 * * * cd /opt/daily-ai-report && /usr/bin/node scripts/run-daily.js >> /var/log/daily-ai-briefing.log 2>&1
```

> 注意:用**绝对路径**调 `node`(避免 cron 的 PATH 找不到),并把项目 `cd` 进去,因为脚本里有相对路径 `data/inbox/...`。

### 4.2 systemd timer(可选,比 cron 更好监控)

`/etc/systemd/system/daily-ai-briefing.service`:

```ini
[Unit]
Description=Daily AI Briefing generation
After=network-online.target

[Service]
Type=oneshot
WorkingDirectory=/opt/daily-ai-report
ExecStart=/usr/bin/node scripts/run-daily.js
StandardOutput=append:/var/log/daily-ai-briefing.log
StandardError=append:/var/log/daily-ai-briefing.log
```

`/etc/systemd/system/daily-ai-briefing.timer`:

```ini
[Unit]
Description=Run daily AI briefing every morning

[Timer]
OnCalendar=*-*-* 08:00:00
Asia/Shanghai
Persistent=true

[Install]
WantedBy=timers.target
```

启用:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now daily-ai-briefing.timer
systemctl list-timers daily-ai-briefing.timer
```

### 4.3 Windows 任务计划(若 milen 是 Windows)

```powershell
$action  = New-ScheduledTaskAction `
  -Execute 'C:\Program Files\nodejs\node.exe' `
  -Argument 'scripts\run-daily.js' `
  -WorkingDirectory 'D:\deploy\daily-ai-report'

$trigger = New-ScheduledTaskTrigger -Daily -At '08:00'

Register-ScheduledTask `
  -TaskName 'Daily-AI-Briefing' `
  -Action $action `
  -Trigger $trigger `
  -RunLevel Highest `
  -Description '每日 8 点拉新闻 + 生成日报 + 入库'
```

---

## 5. 故障排查

| 症状 | 可能原因 | 排查 |
| --- | --- | --- |
| `node: ExperimentalWarning: SQLite is an experimental feature` | Node 22- 的内置 SQLite 还在实验 | 忽略,功能稳定;或锁 Node 22 LTS |
| `[fetch-news] X 个源失败:This operation was aborted` | 网络抖动或源站限流 | 脚本已加 1 次 retry;可手动 `curl <url>` 验证 |
| `[generate-digest] M3 API HTTP 401` | key 无效或 base_url 错 | 1) `node -e "import('./server/db.js').then(({getSecret})=>console.log(getSecret('MINIMAX_API_KEY')?.slice(0,4)+'...'+getSecret('MINIMAX_API_KEY')?.slice(-4)))"` 看库里有没有;2) 检查 `MINIMAX_BASE_URL` 环境变量,国内 mirror 用 `https://api.minimaxi.com/v1` |
| `[generate-digest] M3 输出不是合法 JSON` | LLM 输出含 raw control char | 脚本已加 control char 修复 + 3 次重试;若仍失败,看 `/var/log/daily-ai-briefing.log` 拿到原始内容 |
| `[generate-digest] 素材文件为空` | 抓新闻全失败,避免幻觉 | 检查 `data/inbox/.news-raw.json` 的 `failedSources` 字段,定位哪个源挂了 |
| 数据库看不到最新日报 | `ingest` 没跑或读错文件 | 手动 `node scripts/ingest-digest.js`,确认 `data/inbox/latest-digest.json` 是当天 |

**关键日志位置**:
- 运行时日志:`/var/log/daily-ai-briefing.log`(Linux)
- 原始素材:`data/inbox/.news-raw.json`(每次覆盖,gitignored)
- 生成的日报:`data/inbox/latest-digest.json`(gitignored)
- 数据库:`data/briefing.db`(gitignored)

---

## 6. 修改端口

Express 默认读 `process.env.PORT`,部署时设 `PORT=3535` 即可(避开 milen 自身 3000 段)。

```bash
# systemd 方式
sudo systemctl edit daily-ai-briefing.service
# 加:
# [Service]
# Environment=PORT=3535
```

---

## 7. 升级

```bash
cd /opt/daily-ai-report
git pull --ff-only
pnpm install --prod
# 升级不破坏数据库(init-db 幂等;旧表加列用 ensureColumn)
node scripts/init-db.js
sudo systemctl restart daily-ai-briefing   # 重启 Express
# cron 本身不用动,下次触发自动用新代码
```

数据库结构变更不兼容时(罕见),手动 `sqlite3 data/briefing.db .dump > backup.sql` 备份。

---

## 8. 安全注意

- API key **绝不能**写进任何文件、commit message、Issue、聊天记录
- 数据库文件 `data/briefing.db` 包含明文 key,不要 `git add`,`.gitignore` 已屏蔽
- 备份时排除 `data/briefing.db`,或单独加密备份
- 旋转 key:`echo "$NEW_KEY" | node scripts/seed-secret.js MINIMAX_API_KEY`(直接覆盖)
