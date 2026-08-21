import fs from "node:fs";
import path from "node:path";
import { initDb, getSecret } from "../server/db.js";

initDb();

const apiKey =
  process.env.MINIMAX_API_KEY || getSecret("MINIMAX_API_KEY");
if (!apiKey) {
  console.error(
    "[generate-digest] 未找到 MINIMAX_API_KEY(请设置 env 或运行 seed-secret.js 注入)"
  );
  process.exit(1);
}

const baseUrl =
  process.env.MINIMAX_BASE_URL ||
  "https://api.minimaxi.com/v1";
const model = process.env.MINIMAX_MODEL || "MiniMax-M3";

const newsPath = path.resolve("data/inbox/.news-raw.json");
if (!fs.existsSync(newsPath)) {
  console.error(
    "[generate-digest] 找不到素材文件 data/inbox/.news-raw.json,请先运行 fetch-news.js"
  );
  process.exit(1);
}
const news = JSON.parse(fs.readFileSync(newsPath, "utf8"));

if (!Array.isArray(news.items) || news.items.length === 0) {
  console.error(
    "[generate-digest] 素材文件为空(0 条新闻),拒绝生成日报,避免幻觉。请检查 fetch-news 输出。"
  );
  process.exit(1);
}

const today = new Date();
const todayStr = today.toISOString().slice(0, 10);
const beijingDate = new Date(today.getTime() + 8 * 60 * 60 * 1000)
  .toISOString()
  .slice(0, 10);

const systemPrompt = [
  "你是一名中文 AI 与金融市场日报分析师,服务于一份每日早晨发布的简报。",
  "你的任务是把真实新闻素材整理成结构化日报,严禁编造素材里没有的公司名、产品名、数字或事件。",
  "如果素材覆盖不到某个领域,要诚实保守地给出判断,不要为了凑数虚构事实。",
  "你的输出必须是可以直接 JSON.parse 的合法 JSON:",
  "- 字符串里出现的换行/制表符/回车必须用 \\n \\t \\r 转义,不能写 raw 字符;",
  "- 双引号必须用 \\\" 转义,不能写 raw 双引号;",
  "- 不要在 JSON 外加任何 markdown 围栏、注释、说明、前后缀文本;",
  "- 只输出一个 JSON 对象本体。"
].join("\n");

const schemaExample = {
  digestDate: beijingDate,
  title: "AI 与市场晨报",
  marketSentiment: "中性偏多",
  aiSentiment: "偏强",
  summary: "一句话整体判断(50-120 字)。",
  marketItems: ["市场重点 1(≤100 字)", "市场重点 2", "市场重点 3"],
  aiItems: ["AI 重点 1(≤100 字)", "AI 重点 2", "AI 重点 3"],
  metrics: [
    { label: "市场风险偏好", value: 70, trend: "中性偏强" },
    { label: "AI 热度", value: 82, trend: "偏强" },
    { label: "半导体景气", value: 74, trend: "修复" },
    { label: "避险需求", value: 58, trend: "回落" }
  ],
  chart: {
    labels: ["市场风险偏好", "AI 热度", "半导体景气", "避险需求"],
    series: [70, 82, 74, 58]
  },
  details: [
    { title: "市场分析", content: "段落 1,200-400 字。" },
    { title: "AI 分析", content: "段落 2,200-400 字。" }
  ]
};

const userPrompt = [
  `今日日期(北京时间): ${beijingDate}`,
  `素材抓取时间: ${news.fetchedAt}`,
  `可用素材条数: AI ${news.totals?.ai ?? 0} 条 / 市场 ${news.totals?.market ?? 0} 条`,
  `失败源(可不影响判断): ${(news.failedSources || []).map((f) => `${f.source}(${f.error})`).join("; ") || "无"}`,
  "",
  "=== 真实新闻素材(JSON 数组)===",
  JSON.stringify(news.items, null, 2),
  "",
  "=== 输出结构(严格按此 JSON 结构)===",
  JSON.stringify(schemaExample, null, 2),
  "",
  "=== 硬性要求 ===",
  "1. digestDate 必须等于今日日期(北京时间)。",
  "2. marketItems 3-5 条,每条独立成字符串,基于 market 类素材;若不足可降为 3 条。",
  "3. aiItems 3-5 条,每条独立成字符串,基于 ai 类素材;若不足可降为 3 条。",
  "4. summary 一句话整体判断,覆盖市场风险偏好、AI 行业热点、关键变量。",
  "5. marketSentiment / aiSentiment 简短中文标签(如 中性偏多 / 偏强 / 高波动 / 偏弱 / 回落)。",
  "6. metrics 固定 4 项,label 必须严格等于: 市场风险偏好 / AI 热度 / 半导体景气 / 避险需求;value 整数 0-100;trend 简短中文。",
  "7. chart.labels 与 metrics 的 label 数组完全一致;chart.series 与 metrics 的 value 数组完全一致(顺序相同)。",
  "8. details 2-4 段,每段 {title, content};title 简短,content 200-400 字,基于素材写市场/AI/半导体/宏观等不同角度。",
  "9. 所有正文用中文,不要英文段落,不要 markdown 围栏。",
  "10. 不要编造素材里没有的公司、产品、数字、事件。若某项素材不足,基于已有素材做保守判断。",
  "",
  "只输出一个 JSON 对象,不要前后加任何文本。"
].join("\n");

async function callM3(messages) {
  const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.4,
      max_completion_tokens: 4000,
      response_format: { type: "json_object" }
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`M3 API HTTP ${res.status}: ${errText.slice(0, 500)}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("M3 返回内容为空");
  }
  return content;
}

function extractJson(text) {
  const tryParse = (input) => JSON.parse(input);

  // 修复字符串内部的 raw control char(JSON 不允许)
  const repairControlChars = (input) =>
    input.replace(/("(?:[^"\\]|\\.)*")/g, (match) =>
      match
        .replace(/\r\n/g, "\\n")
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r")
        .replace(/\t/g, "\\t")
    );

  const tryParseWithRepair = (input) => tryParse(repairControlChars(input));

  try {
    return tryParse(text);
  } catch (_) {
    // 尝试去 markdown 围栏
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidates = [text];
    if (fence) candidates.push(fence[1]);
    const objMatch = text.match(/\{[\s\S]*\}/);
    if (objMatch) candidates.push(objMatch[0]);

    let lastErr;
    for (const candidate of candidates) {
      try {
        return tryParse(candidate);
      } catch (e) {
        lastErr = e;
        try {
          return tryParseWithRepair(candidate);
        } catch (e2) {
          lastErr = e2;
        }
      }
    }
    throw lastErr || new Error("无法解析 M3 输出为 JSON");
  }
}

function validateAndNormalize(digest) {
  const required = [
    "digestDate",
    "title",
    "marketSentiment",
    "aiSentiment",
    "summary",
    "marketItems",
    "aiItems",
    "metrics",
    "chart",
    "details"
  ];
  const missing = required.filter((k) => !(k in digest));
  if (missing.length) {
    throw new Error(`M3 输出缺少字段: ${missing.join(", ")}`);
  }

  if (!Array.isArray(digest.marketItems) || digest.marketItems.length < 3) {
    throw new Error("marketItems 必须是 ≥3 条的数组");
  }
  if (!Array.isArray(digest.aiItems) || digest.aiItems.length < 3) {
    throw new Error("aiItems 必须是 ≥3 条的数组");
  }
  if (!Array.isArray(digest.metrics) || digest.metrics.length !== 4) {
    throw new Error("metrics 必须是 4 项数组");
  }
  if (!Array.isArray(digest.details) || digest.details.length < 2) {
    throw new Error("details 必须是 ≥2 段");
  }

  digest.chart = {
    labels: digest.metrics.map((m) => m.label),
    series: digest.metrics.map((m) => Number(m.value))
  };

  for (const m of digest.metrics) {
    m.value = Math.max(0, Math.min(100, Math.round(Number(m.value) || 0)));
    if (typeof m.label !== "string" || !m.label) {
      throw new Error("metrics 每项必须有 label 字符串");
    }
    if (typeof m.trend !== "string" || !m.trend) {
      m.trend = "中性";
    }
  }

  digest.digestDate = beijingDate;
  return digest;
}

async function main() {
  console.log(
    `[generate-digest] 调用 ${model},素材 ${news.items.length} 条...`
  );

  let digest;
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const content = await callM3([
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]);
      const parsed = extractJson(content);
      digest = validateAndNormalize(parsed);
      break;
    } catch (err) {
      lastErr = err;
      console.warn(
        `[generate-digest] 第 ${attempt} 次失败: ${err.message}`
      );
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }

  if (!digest) {
    console.error("[generate-digest] 两次尝试都失败,放弃生成");
    console.error(lastErr?.message);
    process.exit(1);
  }

  const outPath = path.resolve("data/inbox/latest-digest.json");
  fs.writeFileSync(outPath, JSON.stringify(digest, null, 2), "utf8");

  console.log(
    `[generate-digest] 已写入 ${outPath} | date=${digest.digestDate} | market=${digest.marketItems.length} | ai=${digest.aiItems.length} | metrics=${digest.metrics.length} | details=${digest.details.length}`
  );
  console.log(
    `[generate-digest] metrics: ${digest.metrics
      .map((m) => `${m.label}=${m.value}(${m.trend})`)
      .join(", ")}`
  );
}

main().catch((err) => {
  console.error("[generate-digest] 致命错误:", err);
  process.exit(1);
});
