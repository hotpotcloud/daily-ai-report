# PRD — Signal Board 金融投资模块 (Invest Module)

> **代号:** `invest`
> **版本:** v0.2 (评审通过,实施中)
> **作者:** Mavis
> **日期:** 2026-09-09
> **关联:** AGENTS.md · docs/DEPLOY.md · design-system/serenity-finance/MASTER.md

## 变更记录

| 版本 | 日期 | 变更 |
|---|---|---|
| v0.1 | 2026-09-09 | 草案,看板 + 组合 + 策略库三件套 |
| **v0.2** | **2026-09-09** | **评审通过。组合挪到二期,本期只做看板 + 策略库。宏观卡改 8 张指数+商品。策略改"不同风格三件套"** |

---

## 1. 背景

Signal Board 当前是「AI + 金融市场」晨报站,主信息流由 GitHub Action 每日跑批生成 SQLite 日报。前端(Vite + React)已有 5 个页面:今日简报、报告库、专题、分类、个人中心,但**没有专门的「投资」入口**——市场情绪/指标只是首页右侧的一根条。

xbf(用户)希望在 Signal Board 上加一个完整的金融投资模块,作为继「资讯」之后的核心场景。

---

## 2. 目标

| 维度 | 目标 |
|---|---|
| **用户** | 把 Signal Board 从「看新闻」升级为「看新闻 + 看行情 + 管组合 + 学策略」一站 |
| **留存** | 自选股 + 组合的本地/服务端存档让用户有理由回访 |
| **差异化** | 把日报的"信号"和"行情"打通,让 AI 日报不只是新闻摘要 |
| **数据真实** | 接真实开放行情(非纯 mock),但要求 API 0 密钥、免维护 |
| **设计一致** | 沿用 serenity-finance 设计系统,不引入新主题/新色板 |

---

## 3. 范围

### 3.1 In Scope (本期 v0.2)

1. **投资看板** (`/invest`)
   - 顶部:**8 张宏观指标卡(指数 + 商品)**
     - 上证 / 深证 / 创业板 / 恒生 / 纳指(5 个指数)
     - 黄金 / 原油 / 比特币(3 个商品)
   - 中部:大盘指数实时报价条
   - 主体:自选股 watchlist + 编辑器(增/删/排序,localStorage)
   - 底部:今日投资信号流(从日报 `marketItems` + `aiItems` 衍生)

2. **策略库** (`/invest/strategies`)
   - **3 套不同风格策略**:
     - `value` 价值低估值(PE<20 + PB<3 + 股息率>2%)
     - `trend` 趋势多头(收盘价 > MA60)
     - `defensive` 防御(公用事业 + 股息率>4%)
   - 每套策略页:理念 + 筛选规则 + 当前命中标的 + 历史信号回溯
   - 命中标的用真实行情数据展示

### 3.2 Phase 2 (本期不做)

- ❌ **投资组合** (`/invest/portfolio`)——需要鉴权 + DB 改造,挪到二期

### 3.3 Out of Scope (永远不做)

- ❌ 真实券商下单/委托(只读行情)
- ❌ 港美股账户入金
- ❌ 期权/期货/杠杆
- ❌ 实时 Level-2 行情
- ❌ 财经日历
- ❌ 跟单/社区/订阅

---

## 4. 用户故事

| ID | 故事 | 验收点 |
|---|---|---|
| US-1 | 作为一个普通用户,我打开 `/invest` 能看到今天大盘概况 | 8 张宏观卡(指数+商品) + 指数报价在 2s 内渲染 |
| US-2 | 我能添加 5 只自选股,刷新后还在(免登录 localStorage) | 增/删/排,刷新页面持久 |
| US-3 | 我能在 `/invest/strategies` 看 3 套策略,点进每套看到当前命中股票 | 命中标的展示代码/名称/最新价/信号日 |
| US-4 | 我能在策略详情页看该策略的近 30 天历史信号 | 列表展示,每条带日期 + 摘要 + 当时价格 + 浮动收益 |
| US-5 | (二期)登录后我能添加持仓(代码+成本+数量),自动算浮盈 | — |

> **原则:** 全程 0 密钥,只用 HTTP GET。开发期本地 DNS 不可达时,后端自动降级到 mock 缓存。

| 数据 | 源 | URL 模板 | 备注 |
|---|---|---|---|
| A 股/港股/美股 行情 | 东方财富 push2 | `https://push2.eastmoney.com/api/qt/stock/get?secid={mkt}.{code}&fields=...` | secid: 1=沪 0=深 105=纳斯达克 116=纽交所 105=港股 |
| A 股 K 线 | 东方财富 kline | `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=...&fields1=...&fields2=...&klt=101&fqt=1` | klt: 101=日 102=周 5=5分 |
| 主要指数 | 东方财富 push2 | `secid=1.000001` (上证) `0.399001` (深证) `0.399006` (创业板) `1.000688` (科创) `100.HSI` (恒生) `105.IXIC` (纳指) `105.SPX` (标普) `105.DJI` (道指) | 同 push2 接口 |
| 宏观数据(CPI/PMI/利率) | 东方财富 datacenter | `https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_ECONOMY_CPI` | 多 reportName |
| 股票基本面 | 东方财富 push2 + 公告 | 通过 push2 的 f57/f58/f162/f167 等字段 | 实时 PE/PB/总市值 |

**降级策略**:
- 后端每次请求先查 SQLite `quote_cache`(TTL 60s)
- 未命中或过期 → 调真实 API
- 网络失败 → 兜底返回 mock 数据(同 schema),标记 `data_source: "mock"`
- 关键指数每 5 分钟后台预热一次(轻量 Node setInterval)

---

## 6. API 设计

所有路由挂在现有 Express 服务 `server/index.js` 下,前缀 `/api/`。

### 6.1 公开

| Method | Path | 用途 | 返回 |
|---|---|---|---|
| GET | `/api/quotes?symbols=sh600000,sz000001` | 批量行情 | `[{symbol, name, price, change, changePct, open, high, low, volume, ts}]` |
| GET | `/api/indices` | 大盘 5 指数 + 3 商品 | `[{symbol, name, price, change, changePct, kind}]` |
| GET | `/api/macro` | 同 /api/indices 的 8 项 + 衍生指标 | `[{key, label, value, unit, asOf, trend}]` |
| GET | `/api/kline?symbol=sh600000&period=day&range=3M` | K 线 | `{candles: [[ts, open, close, high, low, vol]], symbol, name}` |
| GET | `/api/strategies` | 策略列表(3 套) | `[{slug, title, subtitle, category, hitCount}]` |
| GET | `/api/strategies/:slug` | 策略详情 + 当前命中 | `{...meta, hits: [{symbol, name, signalDate, signalPrice, currentPrice, returnPct}]}` |
| GET | `/api/strategies/:slug/history?range=30d` | 历史命中(回溯) | `{hits: [...]}` |
| GET | `/api/signals/today` | 今日投资信号(从日报衍生) | `[{id, type, title, hint, relatedSymbols}]` |

### 6.2 需登录(二期)

| Method | Path | 用途 |
|---|---|---|
| GET | `/api/portfolio` | 读当前用户持仓(二期) |
| POST | `/api/portfolio/holdings` | 新增(二期) |
| PATCH | `/api/portfolio/holdings/:id` | 改(二期) |
| DELETE | `/api/portfolio/holdings/:id` | 删除(二期) |
| GET | `/api/portfolio/snapshots?range=3M` | 历史净值(二期) |

---

## 7. 数据库 Schema(SQLite)

新增 3 张表(在 `scripts/init-db.js` 里追加;组合相关表挪到二期):

```sql
-- 行情缓存(防爬 + 离线兜底)
CREATE TABLE IF NOT EXISTS quote_cache (
  symbol TEXT PRIMARY KEY,
  payload TEXT NOT NULL,        -- JSON
  source TEXT NOT NULL,         -- "eastmoney" | "mock"
  fetched_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_quote_cache_fetched_at ON quote_cache(fetched_at);

-- 策略定义(本期硬编码 + 落表,方便后续编辑)
CREATE TABLE IF NOT EXISTS strategies (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  subtitle TEXT,
  category TEXT,
  philosophy TEXT,              -- 200-400 字
  rules TEXT,                   -- JSON: [{metric, op, value}]
  created_at INTEGER NOT NULL
);

-- 策略命中(日报信号 vs 行情的落档)
CREATE TABLE IF NOT EXISTS strategy_hits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  strategy_slug TEXT NOT NULL,
  symbol TEXT NOT NULL,
  name TEXT,
  signal_date TEXT NOT NULL,    -- YYYY-MM-DD
  signal_price REAL,
  current_price REAL,
  return_pct REAL,
  note TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (strategy_slug) REFERENCES strategies(slug)
);
CREATE INDEX IF NOT EXISTS idx_strategy_hits_slug_date ON strategy_hits(strategy_slug, signal_date);
```

**二期再补**:`portfolio_holdings` / `portfolio_snapshots` / `watchlist`(本期 watchlist 走 localStorage,不落库)。

---

## 8. 前端结构

```
web/src/
├── pages/
│   ├── InvestPage.jsx              # 父路由 + 默认重定向到 /invest/dashboard
│   ├── InvestDashboard.jsx         # 看板
│   ├── InvestStrategies.jsx        # 策略列表
│   └── InvestStrategyDetail.jsx    # 策略详情
├── components/invest/
│   ├── MacroCard.jsx               # 单张宏观指标卡
│   ├── MacroGrid.jsx               # 8 卡网格
│   ├── IndexTicker.jsx             # 指数实时报价条
│   ├── WatchlistEditor.jsx         # 自选股增删
│   ├── WatchlistTable.jsx          # 自选表
│   ├── SignalStream.jsx            # 今日投资信号流
│   ├── StrategyCard.jsx            # 策略卡
│   ├── StrategyHitsTable.jsx       # 命中表
│   └── Sparkline.jsx               # 迷你折线(SVG)
├── hooks/
│   ├── useQuote.js                 # 轮询单只
│   └── useQuotes.js                # 轮询多只
├── lib/
│   ├── chart.js                    # 极简 SVG 折线
│   └── investFormat.js             # 格式化(涨跌/百分比/时间)
└── styles/
    └── invest.css                  # 模块专属样式
```

**Topbar 改造**:在「报告库」前插入「投资」NavLink,指向 `/invest`。

---

## 9. 性能 & 体验约束

- 看板首次 LCP < 2.5s(本地 mock 时 < 1s)
- 行情轮询间隔:watchlist 30s / 指数+商品 60s
- API 失败时不阻塞,显示上次缓存值 + "网络异常"角标
- 命中表 ≤ 100 行直接渲染
- 移动端:看板一列堆叠,命中表横向滚动
- 暗色优先(沿用 serenity-finance),亮色用 token 反转

---

## 10. 验收清单

### 功能
- [ ] `/invest` 渲染 **8 张宏观卡** + 指数条 + 自选表 + 信号流
- [ ] 自选股可增/删/排,刷新持久
- [ ] `/invest/strategies` 列出 **3 套**策略(价值 / 趋势 / 防御)
- [ ] 策略详情显示当前命中标的 + 历史命中
- [ ] 命中标的展示代码/名称/最新价/信号日/浮动收益

### 数据
- [ ] 真实 API 路径在生产服务器能返回 200
- [ ] 本地 dev 关闭网络,看板仍能渲染(mock 兜底)
- [ ] 缓存表 TTL 生效(60s 后重新拉)

### 体验
- [ ] 暗/亮模式都好看
- [ ] 4.5:1 对比度通过
- [ ] 键盘 tab 可达所有交互元素
- [ ] 移动端 375px 不溢出

### 工程
- [ ] `npm run dev` 启动无报错
- [ ] `npm run build` 通过,无 type/lint error
- [ ] 新 API 在 server/index.js 注册
- [ ] DB migration 用 idempotent `CREATE TABLE IF NOT EXISTS`
- [ ] 现有 5 个页面不被破坏
- [ ] **不引入图表库**(轻量 SVG 自绘)

---

## 11. 风险

| 风险 | 缓解 |
|---|---|
| 东方财富接口改版/限流 | 多源降级(新浪/腾讯),缓存降级(mock) |
| 本地 DNS 不通(已确认) | dev 模式默认走 mock,UI 不感知 |
| K 线接口返回 GBK | 后端用 iconv-lite 转码 |
| 设计风格不统一 | 严格用 serenity-finance token,新增 CSS 不写硬编码色 |
| 8 个宏观卡数据源各异 | 全部统一到 push2 接口,只是 secid 不同 |

---

## 12. 里程碑(预估)

| 阶段 | 天数 | 交付 |
|---|---|---|
| 设计 + 任务拆分 | 0.5 | docs/DESIGN-invest-module.md + tasks |
| 数据层(后端) | 1.0 | 3 张表 + 6 个 API + 缓存 + mock 兜底 |
| 看板(前端) | 1.0 | 8 卡 + 指数条 + 自选表 + 信号流 |
| 策略库(前后端) | 1.0 | 3 套策略 seed + 命中表 + 历史回溯 |
| 验证 + 截图 | 0.5 | 全部 dev 跑通,5 个原页面回归 |
| Build + 部署 | 0.5 | vite build + commit + workflow |
| **合计** | **~4.5 天** | |

---

## 13. 已确认事项

| # | 决策 | 结果 |
|---|---|---|
| 1 | 顶部宏观卡 8 张 | **指数 + 宏观商品**:上证 / 深证 / 创业板 / 恒生 / 纳指 / 黄金 / 原油 / 比特币 |
| 2 | 策略 3 套 | **不同风格三件套**:价值低估值(PE<20+PB<3+股息>2%) / 趋势多头(MA60 上方) / 防御(公用事业+股息>4%) |
| 3 | 上线节奏 | **看板 + 策略先上,组合挪到二期** |

