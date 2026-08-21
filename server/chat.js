import { initDb, getSecret, listDigests } from "./db.js";

initDb();

const DEFAULT_BASE_URL = "https://api.minimaxi.com/v1";
const DEFAULT_MODEL = "MiniMax-M3";
const MAX_CONTEXT_DIGESTS = 5;
const MAX_HISTORY_MESSAGES = 20;
const MAX_COMPLETION_TOKENS = 2000;

function getApiKey() {
  return process.env.MINIMAX_API_KEY || getSecret("MINIMAX_API_KEY");
}

function getBaseUrl() {
  return (process.env.MINIMAX_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function getModel() {
  return process.env.MINIMAX_MODEL || DEFAULT_MODEL;
}

function buildSystemPrompt() {
  const recent = listDigests(MAX_CONTEXT_DIGESTS);

  const base = [
    "你是 daily-ai-briefing 项目的 AI 助手,负责基于该项目生成的历史日报回答用户问题。",
    "用户主要关心:AI 行业动态、全球金融市场、半导体景气、风险偏好、避险需求等。",
    "回答必须严格基于下面提供的历史日报上下文,不能编造未出现的公司名、产品名、数字或事件。",
    "如果用户问到的内容不在日报里,要诚实说明(例如:近 N 天的日报没有覆盖到),不要凭训练数据瞎编。",
    "回答用中文,简洁直接,先给结论再给依据。涉及对比/趋势时引用具体日期。"
  ].join("\n");

  if (recent.length === 0) {
    return base + "\n\n=== 当前暂无历史日报,只能基于通用知识回答(请提示用户先跑日报)===";
  }

  const blocks = recent.map((d) => {
    const items = (arr) =>
      Array.isArray(arr) ? arr.map((m) => `  - ${m}`).join("\n") : "  (无)";
    return [
      `[${d.digestDate}] ${d.title}`,
      `市场情绪: ${d.marketSentiment} | AI 情绪: ${d.aiSentiment}`,
      `摘要: ${d.summary}`,
      `市场重点:\n${items(d.marketItems)}`,
      `AI 重点:\n${items(d.aiItems)}`
    ].join("\n");
  });

  return (
    base +
    "\n\n=== 历史日报上下文(最近 " +
    recent.length +
    " 条,按时间倒序)===\n\n" +
    blocks.join("\n\n---\n\n")
  );
}

function trimHistory(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter(
      (m) =>
        m &&
        typeof m.role === "string" &&
        typeof m.content === "string" &&
        ["system", "user", "assistant"].includes(m.role)
    )
    .slice(-MAX_HISTORY_MESSAGES);
}

export function buildChatRequest(messages, options = {}) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error(
      "未配置 MINIMAX_API_KEY(请设置 env 或运行 seed-secret.js 注入)"
    );
  }
  const stream = Boolean(options.stream);
  const systemPrompt = buildSystemPrompt();
  const trimmedMessages = trimHistory(messages);

  return {
    url: getBaseUrl() + "/chat/completions",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      accept: stream ? "text/event-stream" : "application/json"
    },
    body: {
      model: getModel(),
      messages: [
        { role: "system", content: systemPrompt },
        ...trimmedMessages
      ],
      temperature: 0.5,
      max_completion_tokens: MAX_COMPLETION_TOKENS,
      stream
    },
    meta: {
      contextDigestsUsed: listDigests(MAX_CONTEXT_DIGESTS).length,
      historyTrimmed: trimmedMessages.length
    }
  };
}

function parseErrorPayload(text) {
  try {
    const j = JSON.parse(text);
    return j?.error?.message || j?.message || text;
  } catch (_) {
    return text;
  }
}

export async function callChat(messages) {
  const req = buildChatRequest(messages, { stream: false });
  const res = await fetch(req.url, {
    method: "POST",
    headers: req.headers,
    body: JSON.stringify(req.body)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(
      `M3 API HTTP ${res.status}: ${parseErrorPayload(errText).slice(0, 500)}`
    );
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("M3 返回内容为空");
  }
  return {
    content,
    usage: data?.usage ?? null,
    model: data?.model ?? getModel(),
    contextDigestsUsed: req.meta.contextDigestsUsed
  };
}

export async function* streamChat(messages) {
  const req = buildChatRequest(messages, { stream: true });
  const res = await fetch(req.url, {
    method: "POST",
    headers: req.headers,
    body: JSON.stringify(req.body)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(
      `M3 API HTTP ${res.status}: ${parseErrorPayload(errText).slice(0, 500)}`
    );
  }

  if (!res.body) {
    throw new Error("M3 流式响应没有 body");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let idx;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const eventBlock = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);

        for (const line of eventBlock.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (data === "[DONE]") return;
          if (!data) continue;
          try {
            const parsed = JSON.parse(data);
            const delta = parsed?.choices?.[0]?.delta?.content;
            if (delta) yield delta;
          } catch (_) {
            // 忽略非 JSON 行(比如 OpenAI 的 keep-alive 注释)
          }
        }
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch (_) {
      // ignore
    }
  }
}
