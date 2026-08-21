import { spawnSync } from "node:child_process";
import path from "node:path";

const STEPS = [
  { name: "fetch-news", script: "scripts/fetch-news.js" },
  { name: "generate-digest", script: "scripts/generate-digest.js" },
  { name: "ingest", script: "scripts/ingest-digest.js" }
];

function runStep(step) {
  console.log(`\n[run-daily] ===> ${step.name}`);
  const result = spawnSync(process.execPath, [step.script], {
    stdio: "inherit",
    cwd: path.resolve(".")
  });
  if (result.error) {
    throw new Error(`启动 ${step.name} 失败: ${result.error.message}`);
  }
  if (typeof result.status === "number" && result.status !== 0) {
    throw new Error(`${step.name} 退出码 ${result.status},链路中断`);
  }
}

async function main() {
  const startedAt = new Date().toISOString();
  console.log(`[run-daily] 开始于 ${startedAt}`);
  for (const step of STEPS) {
    runStep(step);
  }
  console.log(`[run-daily] 全部完成,耗时 ${Date.now() - Date.parse(startedAt)}ms`);
}

main().catch((err) => {
  console.error("[run-daily] 链路失败:", err.message);
  process.exit(1);
});
