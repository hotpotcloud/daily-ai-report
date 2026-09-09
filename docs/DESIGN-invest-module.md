# Design — Signal Board 投资模块(v0.2)

> **配合:** `docs/PRD-invest-module.md`
> **范围:** 本期只做看板 + 策略库(组合挪到二期)
> **作者:** Mavis
> **日期:** 2026-09-09

---

## 1. 架构总览

```
                    ┌──────────────────────────────────────────┐
                    │           GitHub Actions(每日)            │
                    │  fetch-news.js → generate-digest.js       │
                    │  commit data/inbox/latest-digest.json     │
                    └──────────────┬───────────────────────────┘
                                   │ SSH 推送
                                   ▼
┌────────────────────────────────────────────────────────────────┐
│  Tencent Cloud (1.9GB RAM,Python only)                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Python ingest_briefing.py → SQLite                      │  │
│  │  /opt/milena-backend/data/daily_ai_briefing.db           │  │
│  │     ├── digests (日报)                                   │  │
│  │     ├── news (新闻)                                      │  │
│  │     ├── quote_cache (本期新增)                            │  │
│  │     ├── strategies (本期新增)                             │  │
│  │     └── strategy_hits (本期新增)                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Express (本地 dev 用,生产由 GitHub Action build→static) │  │
│  │   - /api/digests/*  (原有)                               │  │
│  │   - /api/news       (原有)                               │  │
│  │   - /api/chat       (原有)                               │  │
│  │   - /api/indices    (本期新增) ← 8 个宏观卡               │  │
│  │   - /api/quotes     (本期新增) ← 自选/搜索                  │  │
│  │   - /api/kline      (本期新增) ← K线(未来用)               │  │
│  │   - /api/strategies (本期新增) ← 策略列表+详情              │  │
│  │   - /api/signals/today (本期新增) ← 信号流                 │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
            ▲
            │ HTTPS(生产) / 同源(dev)
            │
┌───────────┴────────────────────────────────────────────────────┐
│  Vite + React SPA (web/)                                       │
│   - /                       今日简报(原)                       │
│   - /archive                报告库(原)                         │
│   - /topic/:slug            专题(原)                           │
│   - /category/:slug         分类(原)                           │
│   - /me                     个人中心(原)                       │
│   - /invest                 投资看板(新)                       │
│   - /invest/strategies      策略库(新)                         │
│   - /invest/strategies/:slug 策略详情(新)                       │
└────────────────────────────────────────────────────────────────┘
```

---

## 2. 数据源 & 缓存策略

### 2.1 8 个宏观标的的 secid 映射

| 显示名 | 内部 symbol | eastmoney secid | 类型 |
|---|---|---|---|
| 上证指数 | sh000001 | 1.000001 | index |
| 深证成指 | sz399001 | 0.399001 | index |
| 创业板指 | sz399006 | 0.399006 | index |
| 恒生指数 | hkHSI | 100.HSI | index |
| 纳斯达克 | usIXIC | 105.IXIC | index |
| 黄金 (COMEX) | au2512 | 113.au2512 | commodity |
| 原油 (WTI) | cl2512 | 113.cl2512 | commodity |
| 比特币 (USD) | btc | — | 加密(走 OKX 或 mock) |

**注:** 加密资产东方财富覆盖不全,本期用 CoinGecko 公开 API:
- `https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true`
- 免 key,5s 内返回

### 2.2 缓存策略

- **内存 + SQLite 双层缓存**
- key: `symbol` 或 `coingecko_id`
- TTL: 60s(秒级行情)/ 5min(指数/商品)/ 1h(基本面)
- 网络失败 → 返回上次缓存 + `source: "stale"`,再失败 → 返回 mock + `source: "mock"`

### 2.3 mock 数据生成器

`server/mockQuotes.js` 启动时根据 seed 生成稳定 mock:
- 8 个宏观标的:从固定基准价 + 随机波动 ±0.5%
- 任意 A 股:PE/PB/收盘价从基础池取
- 不依赖任何外部包,纯函数,可在 dev / 离线运行

---

## 3. 后端实现(server/)

### 3.1 新增文件

```
server/
├── quotes.js          # eastmoney 行情抓取 + 缓存
├── mockQuotes.js      # 离线 mock 数据
├── strategies.js      # 策略 seed + 命中计算
├── signals.js         # 从日报衍生今日投资信号
├── macro.js           # 8 个宏观标的统一接口
└── index.js           # 挂载新路由(改动)
```

### 3.2 路由清单

```js
// server/index.js 新增
app.get('/api/indices', macroHandler);              // 8 个标的
app.get('/api/quotes', quotesHandler);              // ?symbols=...
app.get('/api/kline', klineHandler);                // ?symbol=...&period=day
app.get('/api/strategies', listStrategies);         // 3 套
app.get('/api/strategies/:slug', getStrategy);      // 详情 + 命中
app.get('/api/strategies/:slug/history', history);  // 历史回溯
app.get('/api/signals/today', todaySignals);        // 从日报衍生
```

### 3.3 关键函数签名

```js
// server/quotes.js
export async function fetchQuote(symbol)  // {symbol, name, price, change, changePct, open, high, low, volume, ts, source}
export async function fetchQuotes(symbols)  // 同上,批量
export async function fetchKline(symbol, period, range)  // {candles, symbol, name}

// server/macro.js
export const MACRO_UNIVERSE = [/* 8 个标的 */];
export async function fetchIndices()  // 返回数组

// server/strategies.js
export const STRATEGY_DEFS = [/* 3 套硬编码 */];
export async function ensureSeeded()  // 启动时落表
export async function computeHits(slug)  // 当前命中
export async function historyHits(slug, rangeDays)  // 历史

// server/signals.js
export function deriveFromDigest(digest)  // 从日报 marketItems/aiItems 抽信号
```

### 3.4 错误处理

- 上游超时:5s(用 AbortController)
- 上游 4xx/5xx:返回缓存(stale)
- 完全没有数据:返回 mock
- 所有路径都返回 200 + `{data, source: "live"|"stale"|"mock", ts}`

---

## 4. 前端实现(web/)

### 4.1 路由改造

`App.jsx`:

```jsx
<Route path="/invest" element={<InvestPage />}>
  <Route index element={<Navigate to="dashboard" replace />} />
  <Route path="dashboard" element={<InvestDashboard />} />
  <Route path="strategies" element={<InvestStrategies />} />
  <Route path="strategies/:slug" element={<InvestStrategyDetail />} />
</Route>
```

### 4.2 组件层级

```
InvestPage (壳:头部 tab + Footer)
├── header.tabs: [看板, 策略库]
├── <Outlet />
└── 同一页脚

InvestDashboard
├── <MacroGrid items={indices} />
│   └── <MacroCard x8 />
├── <IndexTicker items={indicesTop5} />
├── <WatchlistSection>
│   ├── <WatchlistEditor />
│   └── <WatchlistTable />
└── <SignalStream items={signals} />

InvestStrategies
├── <StrategyGrid>
│   └── <StrategyCard x3 />
└── <Disclaimer />

InvestStrategyDetail
├── <StrategyHeader meta />
├── <StrategyHitsTable hits />     // 当前命中
├── <StrategyHistory hits />        // 30 天回溯
└── <StrategyRules rules />
```

### 4.3 状态管理

- **不引入 Redux/Zustand**——3 个页面、6 个组件,React Context 足矣
- `useWatchlist()` hook:localStorage 持久化
- `useQuote(symbol)` / `useQuotes(symbols)`:30s 轮询
- `useMacro()` / `useSignals()`:60s 轮询

### 4.4 样式

- `web/src/styles/invest.css` 独立文件
- 严格用 `var(--color-*)` / `var(--space-*)` / `var(--shadow-*)` 引用 token
- 不写硬编码色
- 复用现有 `.btn` / `.card` / `.mono` 等基类(若已存在)
- 移动端:`@media (max-width: 768px)` 调一列

### 4.5 图表

- **不引入 ECharts/Recharts**
- 极简 SVG 自绘(2-3 个 helper):
  - `<Sparkline data={...} />` —— 迷你折线(20x40px)
  - `<PriceLine data={...} />` —— 净值曲线(响应式宽,120px 高)
  - 颜色走 CSS variable

---

## 5. 关键文件清单 & 工作量

### 5.1 后端(7 个文件,~500 行)

| 文件 | 行数估 | 说明 |
|---|---|---|
| `server/mockQuotes.js` | 60 | 离线 mock 数据生成 |
| `server/quotes.js` | 120 | eastmoney 抓取 + 缓存 |
| `server/macro.js` | 50 | 8 标的聚合 |
| `server/strategies.js` | 100 | 3 套策略 seed + 命中 |
| `server/signals.js` | 40 | 日报 → 信号 |
| `server/index.js` | +30 | 注册新路由 |
| `scripts/init-db.js` | +30 | 新增 3 张表 + seed |

### 5.2 前端(11 个文件,~900 行)

| 文件 | 行数估 | 说明 |
|---|---|---|
| `web/src/api.js` | +60 | 6 个新 API helper |
| `web/src/lib/investFormat.js` | 60 | 格式化 |
| `web/src/lib/chart.js` | 80 | SVG 折线/迷你图 |
| `web/src/hooks/useQuote(s).js` | 80 | 轮询 hooks |
| `web/src/components/invest/MacroCard.jsx` | 50 | |
| `web/src/components/invest/MacroGrid.jsx` | 30 | |
| `web/src/components/invest/IndexTicker.jsx` | 50 | |
| `web/src/components/invest/WatchlistEditor.jsx` | 80 | |
| `web/src/components/invest/WatchlistTable.jsx` | 100 | |
| `web/src/components/invest/SignalStream.jsx` | 60 | |
| `web/src/components/invest/StrategyCard.jsx` | 50 | |
| `web/src/components/invest/StrategyHitsTable.jsx` | 80 | |
| `web/src/pages/InvestPage.jsx` | 60 | 壳 |
| `web/src/pages/InvestDashboard.jsx` | 60 | |
| `web/src/pages/InvestStrategies.jsx` | 40 | |
| `web/src/pages/InvestStrategyDetail.jsx` | 100 | |
| `web/src/styles/invest.css` | 250 | 模块样式 |
| `web/src/App.jsx` | +15 | 新路由 |
| `web/src/components/Topbar.jsx` | +5 | 投资 NavLink |

**合计约 1400 行,4.5 天**

---

## 6. 任务拆分(线性可执行)

按依赖关系分 12 个任务,每个任务都有"完成定义":

### 后端(任务 1-5)

- **T1 — DB 迁移**:在 `scripts/init-db.js` 加 3 张表;`npm run db:init` 不报错。**完成定义**:`.schema` 命令能列出新表
- **T2 — mock 数据**:`server/mockQuotes.js` 写完,导出 8 标的稳定 mock + 任意 A 股生成函数。**完成定义**:单元自测 8 个宏观标的价格稳定有 ±0.5% 波动
- **T3 — 行情抓取层**:`server/quotes.js` 完成 eastmoney 抓取 + 缓存 + mock fallback。**完成定义**:`fetchQuote('sh600000')` 返回合法对象,`source` 字段正确
- **T4 — 8 标聚合**:`server/macro.js` 配 8 个 secid,`/api/indices` 返回数组。**完成定义**:curl 8 个标的字段齐全
- **T5 — 策略 seed + 命中**:`server/strategies.js` 写 3 套规则 + 命中计算;`/api/strategies` 和 `/api/strategies/:slug` 通;`/api/strategies/:slug/history` 返回 ≥ 5 条历史

### 前端(任务 6-10)

- **T6 — API 封装 + hooks**:`web/src/api.js` 加 6 个新方法;`hooks/useQuote(s).js` 实现轮询。**完成定义**:`useQuotes(['sh000001'])` 30s 后能拿到新价
- **T7 — SVG chart helpers**:`web/src/lib/chart.js` 写 `<Sparkline>` 和 `<PriceLine>`,纯 SVG,无外部依赖。**完成定义**:在 Storybook-less 环境下用临时页渲染验证
- **T8 — 看板组件**:MacroCard/Grid、IndexTicker、WatchlistEditor/Table、SignalStream 共 6 个组件。**完成定义**:每个组件 1 个独立 demo 单元可渲染(临时挂到 dev 页测)
- **T9 — 看板页面**:`InvestDashboard` 页面拼装,localStorage 持久化自选。**完成定义**:刷新页面自选不丢
- **T10 — 策略库**:`InvestStrategies` + `InvestStrategyDetail` + 3 个策略卡。**完成定义**:3 个 slug 都能进详情页,命中表非空

### 集成(任务 11-12)

- **T11 — 路由 + Topbar + 全局样式**:`App.jsx` 嵌套路由;`Topbar.jsx` 投资 NavLink;`invest.css` 接 token。**完成定义**:`/invest` 和 `/invest/strategies/:slug` 都能 200
- **T12 — 验证 + 截图**:`npm run dev`,打开 `/invest`,Playwright 截图 3 张(看板/策略列表/策略详情),附在最终汇报。**完成定义**:3 张截图 + 5 个原页面回归无问题

---

## 7. 风险与决策记录

| 决策 | 原因 |
|---|---|
| 不引入图表库 | PRD 约束,14 天内交付,引入 ECharts 增加 ~400KB + 风险 |
| 自选股走 localStorage | 二期才上服务端,本期先验证 UX |
| 比特币走 CoinGecko | 东方财富加密覆盖差,CoinGecko 是行业标准、免 key |
| 8 标的 60s 轮询 | 行情"准实时"足够,过频会触发限流 |
| 策略命中"伪量化" | 不接 ML,只从日报 + 基础指标派生,符合日报站调性 |
| 3 套策略硬编码 + 落表 | 后续要做"用户自定义策略"时,直接改 DB 即可 |

---

## 8. 不在本设计范围

- ❌ 投资组合(已挪二期)
- ❌ 用户自定义策略
- ❌ 真实交易接口
- ❌ 移动端原生 App
- ❌ i18n(全中文)
- ❌ A/B 测试框架

---

## 9. 参考资料

- 东方财富 push2 接口:`https://push2.eastmoney.com/api/qt/stock/get?secid=1.600000&fields=f43,f44,f45,f46,f60,f57,f58`
- 东方财富 kline:`https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=1.600000&klt=101&fqt=1`
- CoinGecko:`https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true`
- 设计系统:`design-system/serenity-finance/MASTER.md`
- PRD:`docs/PRD-invest-module.md`
