// scripts/accumulate_updates.js
// Node >= 18
// 作用：读取 data/updates.json（最新10条），累加去重到 data/updates-all.json（全量库）

import fs from "node:fs/promises";

const OUT_DIR     = "data";
const LATEST_PATH = `${OUT_DIR}/updates.json`;      // 现有脚本产物（10条）
const ALL_PATH    = `${OUT_DIR}/updates-all.json`;  // 全量库（累加）

await fs.mkdir(OUT_DIR, { recursive: true });

// 读最新（10条）
let latest = [];
try {
  const s = await fs.readFile(LATEST_PATH, "utf8");
  latest = JSON.parse(s);
  if (!Array.isArray(latest)) latest = [];
} catch { latest = []; }

// 读历史（全量）
let all = [];
try {
  const s = await fs.readFile(ALL_PATH, "utf8");
  all = JSON.parse(s);
  if (!Array.isArray(all)) all = [];
} catch { all = []; }

// 如果最新为空且已有历史，就不动历史，直接退出（防止被清空）
if (latest.length === 0 && all.length > 0) {
  console.warn("[accumulate] latest empty; keep existing updates-all.json unchanged.");
  process.exit(0);
}

// 合并去重（id > url > title）
const merged = dedupeByKey([...latest, ...all], x => x.id || x.url || x.title);

// 按日期降序（YYYY-MM-DD 优先），其次标题稳定一下
merged.sort((a, b) =>
  (b.date || "").localeCompare(a.date || "") ||
  (b.title || "").localeCompare(a.title || "")
);

// 写回全量库
await fs.writeFile(ALL_PATH, JSON.stringify(merged, null, 2), "utf8");
console.log(`[accumulate] wrote ${ALL_PATH} (${merged.length} items)`);

// ---- helpers ----
function dedupeByKey(arr, keyFn) {
  const seen = new Set(), out = [];
  for (const x of arr) {
    const k = keyFn(x);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}
