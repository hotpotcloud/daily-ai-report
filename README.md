# AI 日报与市场风向本地项目

这是一个本地全栈项目骨架，目标是每天自动沉淀一份 AI 日报和金融投资市场风向分析，并用 SQLite 存档。

## 技术栈

- 后端: Express
- 数据库: SQLite（`better-sqlite3`）
- 前端: 原生 HTML/CSS/JS 仪表盘
- 自动化: Codex 定时任务 + 本地入库脚本

## 已实现

- SQLite 自动建表
- 日报记录的新增/覆盖写入
- 最新日报与历史日报 API
- 本地仪表盘展示摘要、风向、指标卡片、图表和文字详情
- JSON 入箱文件导入数据库

## 启动

```bash
cmd /c npm install
cmd /c npm run db:init
cmd /c npm run seed
cmd /c npm run dev
```

浏览器打开 [http://localhost:3000](http://localhost:3000)。

## 目录

```text
server/             后端服务
scripts/            数据库初始化、导入、演示数据脚本
public/             前端页面
data/
  briefing.db       SQLite 数据库
  inbox/            自动化写入的日报 JSON
```

## 自动化建议

每天定时任务负责两件事：

1. 搜集最新 AI 与金融市场信息。
2. 生成 `data/inbox/latest-digest.json` 后执行 `cmd /c npm run ingest` 入库。

`data/inbox/latest-digest.json` 示例结构见 `data/inbox/latest-digest.example.json`。
