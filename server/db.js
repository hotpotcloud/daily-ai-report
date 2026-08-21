import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const dataDir = path.resolve("data");
const dbPath = path.join(dataDir, "briefing.db");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export const db = new DatabaseSync(dbPath);

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS digests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      digest_date TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      market_sentiment TEXT NOT NULL,
      ai_sentiment TEXT NOT NULL,
      summary TEXT NOT NULL,
      market_items_json TEXT NOT NULL,
      ai_items_json TEXT NOT NULL,
      chart_json TEXT NOT NULL,
      metrics_json TEXT NOT NULL DEFAULT '[]',
      details_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  ensureColumn("digests", "metrics_json", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn("digests", "details_json", "TEXT NOT NULL DEFAULT '[]'");

  db.exec(`
    CREATE TABLE IF NOT EXISTS secrets (
      name TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_secrets_updated_at
    AFTER UPDATE ON secrets
    FOR EACH ROW
    BEGIN
      UPDATE secrets
      SET updated_at = CURRENT_TIMESTAMP
      WHERE name = OLD.name;
    END;
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_digests_updated_at
    AFTER UPDATE ON digests
    FOR EACH ROW
    BEGIN
      UPDATE digests
      SET updated_at = CURRENT_TIMESTAMP
      WHERE id = OLD.id;
    END;
  `);
}

export function upsertDigest(digest) {
  const normalizedDigest = normalizeDigest(digest);

  const stmt = db.prepare(`
    INSERT INTO digests (
      digest_date,
      title,
      market_sentiment,
      ai_sentiment,
      summary,
      market_items_json,
      ai_items_json,
      chart_json,
      metrics_json,
      details_json
    ) VALUES (
      @digest_date,
      @title,
      @market_sentiment,
      @ai_sentiment,
      @summary,
      @market_items_json,
      @ai_items_json,
      @chart_json,
      @metrics_json,
      @details_json
    )
    ON CONFLICT(digest_date) DO UPDATE SET
      title = excluded.title,
      market_sentiment = excluded.market_sentiment,
      ai_sentiment = excluded.ai_sentiment,
      summary = excluded.summary,
      market_items_json = excluded.market_items_json,
      ai_items_json = excluded.ai_items_json,
      chart_json = excluded.chart_json,
      metrics_json = excluded.metrics_json,
      details_json = excluded.details_json
  `);

  stmt.run({
    digest_date: normalizedDigest.digestDate,
    title: normalizedDigest.title,
    market_sentiment: normalizedDigest.marketSentiment,
    ai_sentiment: normalizedDigest.aiSentiment,
    summary: normalizedDigest.summary,
    market_items_json: JSON.stringify(normalizedDigest.marketItems),
    ai_items_json: JSON.stringify(normalizedDigest.aiItems),
    chart_json: JSON.stringify(normalizedDigest.chart),
    metrics_json: JSON.stringify(normalizedDigest.metrics),
    details_json: JSON.stringify(normalizedDigest.details)
  });
}

export function setSecret(name, value) {
  if (typeof name !== "string" || !name.trim()) {
    throw new Error("secret name 不能为空");
  }
  if (typeof value !== "string" || !value) {
    throw new Error("secret value 不能为空");
  }
  const stmt = db.prepare(`
    INSERT INTO secrets (name, value)
    VALUES (@name, @value)
    ON CONFLICT(name) DO UPDATE SET
      value = excluded.value
  `);
  stmt.run({ name: name.trim(), value });
}

export function getSecret(name) {
  const row = db.prepare(`SELECT value FROM secrets WHERE name = ?`).get(name);
  return row ? row.value : null;
}

export function listSecretNames() {
  return db
    .prepare(`SELECT name, created_at, updated_at FROM secrets ORDER BY name`)
    .all();
}

export function listDigests(limit = 30) {
  const stmt = db.prepare(`
    SELECT *
    FROM digests
    ORDER BY digest_date DESC
    LIMIT ?
  `);

  return stmt.all(limit).map(mapDigestRow);
}

export function getLatestDigest() {
  const stmt = db.prepare(`
    SELECT *
    FROM digests
    ORDER BY digest_date DESC
    LIMIT 1
  `);

  const row = stmt.get();
  return row ? mapDigestRow(row) : null;
}

function mapDigestRow(row) {
  return {
    id: row.id,
    digestDate: row.digest_date,
    title: row.title,
    marketSentiment: row.market_sentiment,
    aiSentiment: row.ai_sentiment,
    summary: row.summary,
    marketItems: JSON.parse(row.market_items_json),
    aiItems: JSON.parse(row.ai_items_json),
    chart: JSON.parse(row.chart_json),
    metrics: JSON.parse(row.metrics_json ?? "[]"),
    details: JSON.parse(row.details_json ?? "[]"),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function ensureColumn(tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  const exists = columns.some((column) => column.name === columnName);

  if (!exists) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

function normalizeDigest(digest) {
  const marketItems = Array.isArray(digest.marketItems) ? digest.marketItems : [];
  const aiItems = Array.isArray(digest.aiItems) ? digest.aiItems : [];
  const metrics = Array.isArray(digest.metrics)
    ? digest.metrics
    : buildMetricsFromLegacyDigest(digest);
  const chart = digest.chart ?? {
    labels: metrics.map((metric) => metric.label),
    series: metrics.map((metric) => metric.value)
  };
  const details = Array.isArray(digest.details)
    ? digest.details
    : [
        {
          title: "市场详情",
          content: marketItems.join("\n")
        },
        {
          title: "AI 详情",
          content: aiItems.join("\n")
        }
      ].filter((item) => item.content);

  return {
    digestDate: digest.digestDate,
    title: digest.title,
    marketSentiment: digest.marketSentiment,
    aiSentiment: digest.aiSentiment,
    summary: digest.summary,
    marketItems,
    aiItems,
    chart,
    metrics,
    details
  };
}

function buildMetricsFromLegacyDigest(digest) {
  const chart = digest.chart ?? { labels: [], series: [] };
  return chart.labels.map((label, index) => ({
    label,
    value: chart.series[index] ?? 0,
    trend: (chart.series[index] ?? 0) >= 70 ? "偏强" : "中性"
  }));
}
