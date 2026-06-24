import fs from "node:fs";
import path from "node:path";
import { initDb, upsertDigest } from "../server/db.js";

initDb();

const inputPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve("data/inbox/latest-digest.json");

if (!fs.existsSync(inputPath)) {
  console.error(`未找到日报文件: ${inputPath}`);
  process.exit(1);
}

const raw = fs.readFileSync(inputPath, "utf8");
const digest = JSON.parse(raw);

upsertDigest(digest);
console.log(`日报已入库: ${digest.digestDate}`);
