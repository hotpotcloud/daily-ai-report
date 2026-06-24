// =============================================================
// build-tokens.js
// 作用：把 tokens/tokens.json 编译成 shared/tokens.css。
// 设计：纯 Node，零依赖；支持引用语法 {color.gray.950}。
//
// 命名规则：
//   - 色阶 (color.gray.* / color.emerald.* / ...):  --color-gray-950 / --color-emerald-400
//   - 语义 HSL token (color.background / color.foreground / color.primary / ...):
//       同时输出两条:
//         --color-background  (保持原状, 给 scale 内部引用)
//         --background        (shadcn 风格, 给 CSS 使用 `hsl(var(--background))`)
//   - 其他组 (font / space / radius / shadow / motion / z / layout / ...):  --{group}-{key}
// 维护：每次修改 tokens.json 后执行一次，命令：
//        node scripts/build-tokens.js
// =============================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TOKENS_PATH = path.resolve(__dirname, "../tokens/tokens.json");
const OUTPUT_PATH = path.resolve(__dirname, "../shared/tokens.css");

// 语义 HSL token 名 (在 color 组下, 但用 shadcn 风格无前缀)
const SEMANTIC_HSL_KEYS = new Set([
  "background", "foreground",
  "card", "card-foreground",
  "popover", "popover-foreground",
  "muted", "muted-foreground",
  "primary", "primary-foreground",
  "secondary", "secondary-foreground",
  "accent", "accent-foreground",
  "destructive", "destructive-foreground",
  "success", "success-foreground",
  "warning", "warning-foreground",
  "border", "input", "ring"
]);

// 顶层 semantic 组: 所有 key 都按 shadcn 风格输出 (--background, --foreground 等, 无前缀)
const SEMANTIC_GROUPS = new Set(["semantic"]);

// 读取 token JSON
const raw = fs.readFileSync(TOKENS_PATH, "utf8");
const tokens = JSON.parse(raw);

// 提取元信息
const headerComment = [
  "/* ============================================================",
  " * Auto-generated from tokens/tokens.json — DO NOT EDIT.",
  " * 重生成命令：node scripts/build-tokens.js",
  ` * 生成时间：${new Date().toISOString()}`,
  " * ============================================================ */"
].join("\n");

// 解析 {xxx.yyy} 引用
function resolveValue(value, depth = 0) {
  if (typeof value !== "string") return value;
  if (depth > 5) return value; // 防止循环
  return value.replace(/\{([^}]+)\}/g, (_, key) => {
    const path = key.split(".");
    const resolved = resolvePath(tokens, path);
    if (resolved === undefined) {
      throw new Error(`Token 引用未找到：{${key}}`);
    }
    return resolveValue(resolved, depth + 1);
  });
}

function resolvePath(root, segments) {
  let cursor = root;
  for (const seg of segments) {
    if (cursor == null || typeof cursor !== "object") return undefined;
    cursor = cursor[seg];
  }
  if (cursor && typeof cursor === "object" && "value" in cursor) {
    return cursor.value;
  }
  return cursor;
}

// 把 group + key 转成 CSS 变量名
//   color.gray.950            -> --color-gray-950
//   color.background          -> --color-background  +  --background  (shadcn 别名)
//   semantic.background       -> --background  (顶层 semantic 组, 全部 shadcn 风格)
//   font.family.sans          -> --font-family-sans
//   space.4                   -> --space-4
//   radius.lg                 -> --radius-lg
function toVarName(groupName, key, semantic = false) {
  // 顶层 semantic 组: 全部按 shadcn 风格无前缀输出
  if (SEMANTIC_GROUPS.has(groupName)) {
    return `--${key}`;
  }
  // color 组下的特殊语义 token: 同时输出 --color-X 和 --X
  if (groupName === "color" && SEMANTIC_HSL_KEYS.has(key)) {
    return semantic ? `--${key}` : `--${groupName}-${key}`;
  }
  return `--${groupName}-${key}`;
}

// 递归遍历 group 输出
function emitGroup(groupName, group, lines) {
  for (const [key, val] of Object.entries(group)) {
    if (key.startsWith("$")) continue; // 元字段
    if (val && typeof val === "object" && !("value" in val)) {
      // 嵌套 group (递归)
      emitGroup(`${groupName}-${key}`, val, lines);
    } else if (val && typeof val === "object" && "value" in val) {
      const value = resolveValue(val.value);
      const comment = val.description ? `  /* ${val.description} */` : "";

      // 主变量
      const mainName = toVarName(groupName, key, false);
      lines.push(`  ${mainName}: ${value};${comment}`);

      // 语义 HSL 别名 (仅 color 组下的特殊 token)
      if (groupName === "color" && SEMANTIC_HSL_KEYS.has(key)) {
        const alias = toVarName(groupName, key, true);
        lines.push(`  ${alias}: ${value};`);
      }
    }
  }
}

const lines = [":root {"];
for (const [groupName, group] of Object.entries(tokens)) {
  if (groupName.startsWith("$")) continue;
  if (!group || typeof group !== "object") continue;
  emitGroup(groupName, group, lines);
}
lines.push("}");

// 输出
const output = `${headerComment}\n\n${lines.join("\n")}\n`;
fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, output, "utf8");

console.log(`✅ tokens.css 已生成（${lines.length - 2} 个变量）→ ${path.relative(process.cwd(), OUTPUT_PATH)}`);