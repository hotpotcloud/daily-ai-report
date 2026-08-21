import fs from "node:fs";
import { initDb, setSecret } from "../server/db.js";

initDb();

const name = process.argv[2];
if (!name) {
  console.error("用法: node scripts/seed-secret.js <secret-name>  (value 从 stdin 读入)");
  process.exit(1);
}

let value = "";
try {
  value = fs.readFileSync(0, "utf8").trim();
} catch (err) {
  console.error("读取 stdin 失败:", err.message);
  process.exit(1);
}

if (!value) {
  console.error("stdin 为空,没有写入任何 secret");
  process.exit(1);
}

setSecret(name, value);

const masked =
  value.length <= 8
    ? "***"
    : `${value.slice(0, 4)}...${value.slice(-4)} (length=${value.length})`;

console.log(`已写入 secret: ${name} -> ${masked}`);
