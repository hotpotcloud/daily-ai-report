#!/usr/bin/env python3
"""
Daily AI Briefing — serverside ingest.

从 stdin 读 JSON,写入 SQLite (默认 /opt/milena-backend/data/daily_ai_briefing.db)。

调用方式(GitHub Actions):
    cat data/inbox/latest-digest.json | python3 /opt/milena-backend/ingest_briefing.py

或者通过 BRIEFING_DB_PATH 环境变量改路径:
    BRIEFING_DB_PATH=/tmp/test.db cat data/inbox/latest-digest.json | python3 ingest_briefing.py

依赖:仅 Python 3.8+ 标准库 (json, sqlite3, os, sys)。
"""
import json
import os
import sqlite3
import sys
from datetime import datetime

DB_PATH = os.environ.get(
    "BRIEFING_DB_PATH", "/opt/milena-backend/data/daily_ai_briefing.db"
)

REQUIRED = [
    "digestDate",
    "title",
    "marketSentiment",
    "aiSentiment",
    "summary",
    "marketItems",
    "aiItems",
    "chart",
    "metrics",
    "details",
]


def ensure_schema(conn):
    conn.executescript(
        """
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

        CREATE TRIGGER IF NOT EXISTS trg_digests_updated_at
        AFTER UPDATE ON digests
        FOR EACH ROW
        BEGIN
            UPDATE digests
            SET updated_at = CURRENT_TIMESTAMP
            WHERE id = OLD.id;
        END;
        """
    )


def main():
    raw = sys.stdin.read()
    # 去 BOM(Windows 粘贴/GitHub Actions 不同 runner 可能带)
    if raw.startswith("\ufeff"):
        raw = raw[1:]
    if not raw.strip():
        print("[ingest] empty stdin, nothing to do", file=sys.stderr)
        sys.exit(2)

    try:
        digest = json.loads(raw)
    except json.JSONDecodeError as err:
        print(f"[ingest] invalid JSON: {err}", file=sys.stderr)
        sys.exit(3)

    missing = [k for k in REQUIRED if k not in digest]
    if missing:
        print(f"[ingest] missing fields: {', '.join(missing)}", file=sys.stderr)
        sys.exit(4)

    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    try:
        ensure_schema(conn)
        conn.execute(
            """
            INSERT INTO digests (
                digest_date, title, market_sentiment, ai_sentiment, summary,
                market_items_json, ai_items_json, chart_json, metrics_json, details_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(digest_date) DO UPDATE SET
                title = excluded.title,
                market_sentiment = excluded.market_sentiment,
                ai_sentiment = excluded.ai_sentiment,
                summary = excluded.summary,
                market_items_json = excluded.market_items_json,
                ai_items_json = excluded.ai_items_json,
                chart_json = excluded.chart_json,
                metrics_json = excluded.metrics_json,
                details_json = excluded.details_json,
                updated_at = CURRENT_TIMESTAMP
            """,
            (
                digest["digestDate"],
                digest["title"],
                digest["marketSentiment"],
                digest["aiSentiment"],
                digest["summary"],
                json.dumps(digest["marketItems"], ensure_ascii=False),
                json.dumps(digest["aiItems"], ensure_ascii=False),
                json.dumps(digest["chart"], ensure_ascii=False),
                json.dumps(digest.get("metrics", []), ensure_ascii=False),
                json.dumps(digest.get("details", []), ensure_ascii=False),
            ),
        )
        conn.commit()
    finally:
        conn.close()

    print(
        f"[ingest] {digest['digestDate']} -> {DB_PATH} "
        f"(market={len(digest['marketItems'])}, ai={len(digest['aiItems'])}, "
        f"metrics={len(digest['metrics'])}, details={len(digest['details'])})"
    )


if __name__ == "__main__":
    main()
