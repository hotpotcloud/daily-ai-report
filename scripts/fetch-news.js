import fs from "node:fs";
import path from "node:path";

const FETCH_TIMEOUT_MS = 20_000;
const FETCH_RETRY = 1;
const MAX_ITEMS_PER_SOURCE = 12;
const MAX_TOTAL_ITEMS = 60;

const SOURCES = [
  {
    name: "Google News AI(中文)",
    url:
      "https://news.google.com/rss/search?q=AI+%E4%BA%BA%E5%B7%A5%E6%99%BA%E8%83%BD&hl=zh-CN&gl=CN&ceid=CN:zh-Hans",
    category: "ai",
    type: "rss"
  },
  {
    name: "Google News 财经(中文)",
    url:
      "https://news.google.com/rss/search?q=%E8%82%A1%E5%B8%82+%E9%87%91%E8%9E%8D+%E5%AE%9D%E9%93%B6%E5%88%B8&hl=zh-CN&gl=CN&ceid=CN:zh-Hans",
    category: "market",
    type: "rss"
  },
  {
    name: "Google News 半导体(中文)",
    url:
      "https://news.google.com/rss/search?q=%E5%8D%8A%E5%AF%BC%E4%BD%93+%E8%8A%AF%E7%89%87&hl=zh-CN&gl=CN&ceid=CN:zh-Hans",
    category: "market",
    type: "rss"
  },
  {
    name: "Hacker News (AI)",
    url: "https://hnrss.org/newest?q=AI+OR+LLM+OR+GPT&count=20",
    category: "ai",
    type: "rss"
  },
  {
    name: "Hacker News (top)",
    url: "https://hnrss.org/frontpage?count=15",
    category: "ai",
    type: "rss"
  },
  {
    name: "36氪快讯",
    url: "https://36kr.com/feed",
    category: "ai",
    type: "rss"
  }
];

function decodeEntities(str) {
  if (!str) return "";
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function matchTag(block, tag) {
  const safeTag = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `<${safeTag}\\b[^>]*>([\\s\\S]*?)<\\/${safeTag}>`,
    "i"
  );
  const m = block.match(re);
  return m ? decodeEntities(m[1]) : null;
}

function matchSelfClosingLink(block) {
  const m = block.match(/<link\b[^>]*?href=["']([^"']+)["'][^>]*\/?>/i);
  return m ? m[1].trim() : null;
}

function matchAtomLink(block) {
  const rels = ["alternate", "self", ""];
  for (const rel of rels) {
    const pattern = rel
      ? new RegExp(`<link\\b[^>]*rel=["']${rel}["'][^>]*?href=["']([^"']+)["']`, "i")
      : /<link\b[^>]*?href=["']([^"']+)["']/i;
    const m = block.match(pattern);
    if (m) return m[1].trim();
  }
  return null;
}

function parseRssItems(xml) {
  const items = [];
  const itemRe = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1];
    const title = matchTag(block, "title");
    let link = matchTag(block, "link");
    if (!link) link = matchSelfClosingLink(block);
    const pubDate =
      matchTag(block, "pubDate") ||
      matchTag(block, "dc:date") ||
      matchTag(block, "published");
    const description =
      matchTag(block, "description") ||
      matchTag(block, "summary") ||
      matchTag(block, "content:encoded");
    if (title && link) {
      items.push({ title, link, pubDate, description });
    }
  }
  return items;
}

function parseAtomEntries(xml) {
  const items = [];
  const entryRe = /<entry\b[^>]*>([\s\S]*?)<\/entry>/gi;
  let m;
  while ((m = entryRe.exec(xml)) !== null) {
    const block = m[1];
    const title = matchTag(block, "title");
    const link = matchAtomLink(block);
    const pubDate =
      matchTag(block, "published") || matchTag(block, "updated");
    const description =
      matchTag(block, "summary") || matchTag(block, "content");
    if (title && link) {
      items.push({ title, link, pubDate, description });
    }
  }
  return items;
}

function detectAndParse(xml) {
  if (/<feed\b[\s>]/i.test(xml)) return parseAtomEntries(xml);
  if (/<rss\b[\s>]/i.test(xml) || /<channel\b[\s>]/i.test(xml))
    return parseRssItems(xml);
  return [];
}

function parseClsTelegraph(payload) {
  if (!payload || !Array.isArray(payload.data?.roll_data)) return [];
  return payload.data.roll_data.map((item) => ({
    title: decodeEntities(item.title || item.brief || ""),
    link: item.shareurl || `https://www.cls.cn/detail/${item.id}`,
    pubDate: item.ctime ? new Date(item.ctime * 1000).toUTCString() : null,
    description: decodeEntities(item.content || item.brief || "")
  })).filter((item) => item.title);
}

async function fetchSource(source) {
  let lastErr;
  for (let attempt = 0; attempt <= FETCH_RETRY; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(source.url, {
        signal: controller.signal,
        headers: {
          "user-agent":
            "Mozilla/5.0 (compatible; DailyAIBriefing/1.0; +https://github.com/hotpotcloud/daily-ai-report)",
          accept: "application/rss+xml, application/atom+xml, application/json, text/xml, */*"
        }
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const body = await res.text();
      if (source.type === "cls") {
        try {
          return parseClsTelegraph(JSON.parse(body));
        } catch (err) {
          throw new Error(`财联社 JSON 解析失败: ${err.message}`);
        }
      }
      return detectAndParse(body);
    } catch (err) {
      lastErr = err;
      if (attempt < FETCH_RETRY) {
        console.warn(`[fetch-news] ${source.name} 第 ${attempt + 1} 次失败,重试: ${err.message}`);
        await new Promise((r) => setTimeout(r, 1500));
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

function normalizeDate(input) {
  if (!input) return null;
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function summarize(items, source) {
  return items.slice(0, MAX_ITEMS_PER_SOURCE).map((item) => ({
    source: source.name,
    category: source.category,
    title: item.title,
    link: item.link,
    publishedAt: normalizeDate(item.pubDate),
    description: (item.description || "").slice(0, 600)
  }));
}

async function main() {
  console.log(`[fetch-news] 串行抓取 ${SOURCES.length} 个源...`);
  const results = [];
  for (const source of SOURCES) {
    try {
      const items = await fetchSource(source);
      const summary = summarize(items, source);
      console.log(
        `[fetch-news] ${source.name}: ${summary.length} 条 (${source.category})`
      );
      results.push({
        status: "fulfilled",
        value: { source: source.name, category: source.category, items: summary }
      });
    } catch (err) {
      console.warn(`[fetch-news] ${source.name} 失败: ${err.message}`);
      results.push({
        status: "rejected",
        reason: { message: err.message },
        _source: source
      });
    }
  }

  const collected = [];
  const failed = [];
  results.forEach((r) => {
    if (r.status === "fulfilled") {
      collected.push(...r.value.items);
    } else {
      failed.push({
        source: r._source.name,
        error: r.reason?.message || String(r.reason)
      });
    }
  });

  if (failed.length) {
    console.warn(
      `[fetch-news] ${failed.length} 个源失败:`,
      failed.map((f) => `${f.source}(${f.error})`).join("; ")
    );
  }

  collected.sort((a, b) => {
    const ta = a.publishedAt ? Date.parse(a.publishedAt) : 0;
    const tb = b.publishedAt ? Date.parse(b.publishedAt) : 0;
    return tb - ta;
  });

  const trimmed = collected.slice(0, MAX_TOTAL_ITEMS);
  const aiCount = trimmed.filter((i) => i.category === "ai").length;
  const marketCount = trimmed.filter((i) => i.category === "market").length;

  const payload = {
    fetchedAt: new Date().toISOString(),
    totals: { all: trimmed.length, ai: aiCount, market: marketCount },
    failedSources: failed,
    items: trimmed
  };

  const outPath = path.resolve("data/inbox/.news-raw.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf8");
  console.log(
    `[fetch-news] 写入 ${outPath},总计 ${trimmed.length} 条(AI ${aiCount} / 市场 ${marketCount})`
  );
}

main().catch((err) => {
  console.error("[fetch-news] 致命错误:", err);
  process.exit(1);
});
