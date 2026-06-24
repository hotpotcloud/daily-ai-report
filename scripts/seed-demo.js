import { initDb, upsertDigest } from "../server/db.js";

initDb();

const today = new Date();
const isoDate = (offsetDays) => {
  const d = new Date(today);
  d.setDate(d.getDate() - offsetDays);
  return d.toISOString().slice(0, 10);
};

const series = [
  { offset: 6, marketItems: [
      "全球风险资产在上周初继续承压，美债收益率抬升压缩高估值科技股估值。",
      "贵金属在避险与降息预期之间反复震荡，黄金 ETF 资金面边际转弱。",
      "半导体周期景气度回落，存储现货价格小幅走低。"
    ], aiItems: [
      "OpenAI 与 Anthropic 在企业级部署上的竞争继续白热化。",
      "开源模型在长上下文与多模态方向继续收敛。",
      "推理优化与算力调度成为新热点。"
    ], metrics: [
      { label: "市场风险偏好", value: 52, trend: "回落" },
      { label: "AI 热度", value: 71, trend: "稳定" },
      { label: "半导体景气", value: 64, trend: "偏弱" },
      { label: "避险需求", value: 58, trend: "抬升" }
    ], marketSentiment: "中性偏弱", aiSentiment: "稳定", summary: "市场仍在消化高利率与高估值的双重压力，AI 产业继续按自己的节奏推进。" },
  { offset: 5, marketItems: [
      "美国 CPI 数据低于预期，市场对降息节奏的乐观情绪短暂回归。",
      "亚太股市整体反弹，半导体与硬件成为领涨方向。",
      "油价在地缘缓和信号下小幅回落。"
    ], aiItems: [
      "Google 升级 Gemini 推理路径，企业接入成本继续下降。",
      "AI 代理（Agent）工作流在 SaaS 厂商中加速集成。",
      "端侧模型在 PC 与手机厂商的落地节奏加快。"
    ], metrics: [
      { label: "市场风险偏好", value: 58, trend: "修复中" },
      { label: "AI 热度", value: 76, trend: "偏强" },
      { label: "半导体景气", value: 68, trend: "修复" },
      { label: "避险需求", value: 54, trend: "边际回落" }
    ], marketSentiment: "谨慎偏多", aiSentiment: "偏强", summary: "通胀数据缓解叠加 AI 产业催化，风险偏好边际改善。" },
  { offset: 4, marketItems: [
      "联储官员表态偏鹰，2 年期美债收益率再创近期新高。",
      "高估值科技股出现回撤，Broadcom 指引不及预期成为触发点。",
      "美元指数走强，新兴市场货币承压。"
    ], aiItems: [
      "OpenAI 与 AWS 进一步打通企业级部署通道。",
      "Codex 类 AI 编程产品继续改变软件工程团队结构。",
      "国内大模型在企业市场的价格战继续。"
    ], metrics: [
      { label: "市场风险偏好", value: 49, trend: "回落" },
      { label: "AI 热度", value: 80, trend: "偏强" },
      { label: "半导体景气", value: 60, trend: "高波动" },
      { label: "避险需求", value: 62, trend: "抬升" }
    ], marketSentiment: "中性偏弱", aiSentiment: "偏强", summary: "鹰派表态压制估值扩张，但 AI 产业端的高频发布继续支撑结构性行情。" },
  { offset: 3, marketItems: [
      "美股科技股出现分化，软件与云服务相对抗跌，硬件与存储承压。",
      "贵金属与原油同步走弱，避险逻辑阶段性退潮。",
      "中国科技股在外资回流下出现阶段性反弹。"
    ], aiItems: [
      "Anthropic 提交 S-1 草案，估值预期继续推升行业天花板。",
      "Gemma 4 12B 等轻量端侧模型发布，本地多模态成为新焦点。",
      "AI 基建与电力供应之间的张力受到市场关注。"
    ], metrics: [
      { label: "市场风险偏好", value: 53, trend: "震荡" },
      { label: "AI 热度", value: 82, trend: "持续升温" },
      { label: "半导体景气", value: 55, trend: "高波动" },
      { label: "避险需求", value: 60, trend: "震荡" }
    ], marketSentiment: "中性", aiSentiment: "偏强", summary: "市场进入震荡分化期，AI 产业链仍是少数保持强势的方向。" },
  { offset: 2, marketItems: [
      "美国非农数据强于预期，强化短期高利率维持预期。",
      "高估值科技股继续回撤，AI 算力链条受波及。",
      "贵金属在地缘与利率之间再度分化。"
    ], aiItems: [
      "OpenAI 强化企业级插件生态。",
      "大模型在金融与医疗垂直应用继续渗透。",
      "推理成本下降推动更多 SaaS 集成 AI 能力。"
    ], metrics: [
      { label: "市场风险偏好", value: 45, trend: "回落" },
      { label: "AI 热度", value: 78, trend: "偏强" },
      { label: "半导体景气", value: 52, trend: "高波动" },
      { label: "避险需求", value: 65, trend: "抬升" }
    ], marketSentiment: "谨慎", aiSentiment: "稳定偏强", summary: "就业数据强劲延长了高利率窗口，AI 产业的强势与二级市场降温形成分化。" },
  { offset: 1, marketItems: [
      "市场风险偏好继续承压，利率预期与地缘风险共同压制估值。",
      "原油受地缘扰动维持偏强，对通胀路径形成扰动。",
      "亚太科技股在外资风险偏好回落中波动加大。"
    ], aiItems: [
      "端侧多模态模型成为厂商差异化竞争点。",
      "企业 AI 落地继续从 PoC 走向生产环境。",
      "AI 治理与合规要求在金融与医疗行业逐步标准化。"
    ], metrics: [
      { label: "市场风险偏好", value: 43, trend: "回落" },
      { label: "AI 热度", value: 82, trend: "持续升温" },
      { label: "半导体景气", value: 56, trend: "高波动" },
      { label: "避险需求", value: 68, trend: "抬升" }
    ], marketSentiment: "中性偏弱", aiSentiment: "偏强", summary: "市场与产业呈现"市场降温、产业扩张"的典型分化格局。" },
  { offset: 0, marketItems: [
      "强就业数据再次延长高利率预期，2 年期与 10 年期美债同步上行。",
      "美股高估值科技板块继续承压，芯片股单日市值蒸发规模显著。",
      "原油受地缘风险支撑维持偏强，黄金则在利率与避险之间反复。"
    ], aiItems: [
      "OpenAI frontier 与 Codex 在 AWS 全面可用，企业接入路径打通。",
      "Codex 新增 plugins、Sites 与 annotations，知识工作与编程进一步融合。",
      "Google 发布 Gemma 4 12B，主打本地 16GB 运行与原生音频输入。"
    ], metrics: [
      { label: "市场风险偏好", value: 41, trend: "回落" },
      { label: "AI 热度", value: 86, trend: "持续升温" },
      { label: "半导体景气", value: 52, trend: "高波动" },
      { label: "避险需求", value: 73, trend: "抬升" }
    ], marketSentiment: "中性偏谨慎", aiSentiment: "偏强", summary: "市场主线回到利率与地缘，AI 产业端继续由云平台落地、代理式工作流与端侧多模态推动，呈现典型"市场降温、产业扩张"分化。"
  }
];

series.forEach((entry) => {
  const date = isoDate(entry.offset);
  const labels = entry.metrics.map((m) => m.label);
  const values = entry.metrics.map((m) => m.value);

  upsertDigest({
    digestDate: date,
    title: "演示日报",
    marketSentiment: entry.marketSentiment,
    aiSentiment: entry.aiSentiment,
    summary: entry.summary,
    marketItems: entry.marketItems,
    aiItems: entry.aiItems,
    metrics: entry.metrics,
    chart: { labels, series: values },
    details: [
      {
        title: "市场主线",
        content: entry.marketItems.join(" ")
      },
      {
        title: "AI 产业进展",
        content: entry.aiItems.join(" ")
      }
    ]
  });
});

console.log(`演示日报写入完成：${series.length} 期（${isoDate(series.length - 1)} → ${isoDate(0)}）`);
