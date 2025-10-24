// scripts/pull_updates.js
// Node >= 18（自带 fetch）
// 环境变量：RSS_URLS（换行/逗号分隔多个源；你现在主要用 Zhihu）
// 可选：MAX_ITEMS（默认 120），EXCERPT_LEN（默认 180）

import fs from "node:fs/promises";

// ---------- 环境配置 ----------
const RSS_URLS = (process.env.RSS_URLS || "")
  .split(/[\n,]/)
  .map(s => s.trim())
  .filter(Boolean);

if (!RSS_URLS.length) {
  console.error("ERROR: 环境变量 RSS_URLS 为空。请在 GitHub Secrets 里设置。");
  process.exit(1);
}

const MAX_ITEMS    = parseInt(process.env.MAX_ITEMS    || "120", 10);
const EXCERPT_LEN  = parseInt(process.env.EXCERPT_LEN  || "180", 10);
const OUT_PATH     = "data/updates.json";

// ---------- 主流程 ----------
const all = [];
for (const url of RSS_URLS) {
  try {
    const xml   = await fetchText(url);
    const items = parseRSS(xml);
    const mapped = items.map(it => mapToUnified(it, { platformHint: "Zhihu", excerptLen: EXCERPT_LEN }));
    all.push(...mapped);
  } catch (e) {
    console.error(`WARN: 抓取失败 ${url}:`, String(e).slice(0, 200));
  }
}

// 去重（优先 guid>link>title），按日期倒序，截断总量
const deduped = dedupeByKey(all, x => x.id || x.url || x.title);
deduped.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
const result = deduped.slice(0, MAX_ITEMS);

// 写入文件（若目录不存在则创建）
await fs.mkdir("data", { recursive: true });
await fs.writeFile(OUT_PATH, JSON.stringify(result, null, 2), "utf8");
console.log(`OK: 写入 ${OUT_PATH}，共 ${result.length} 条。`);


// ---------- 工具函数 ----------
async function fetchText(url) {
  const res = await fetch(url, { headers: { "User-Agent": "KalynaOSINT-RSS/1.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

// 极简 RSS 解析（足以应对 RSSHub 常见字段）
function parseRSS(xml) {
  const blocks = xml.split(/<item>/).slice(1).map(b => "<item>" + b);
  return blocks.map(it => ({
    title: pick(it, /<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/s),
    link: pick(it, /<link>(.*?)<\/link>/s),
    guid: pick(it, /<guid[^>]*>(.*?)<\/guid>/s),
    pubDate: pick(it, /<pubDate>(.*?)<\/pubDate>/s),
    description: pick(it, /<description><!\[CDATA\[(.*?)\]\]><\/description>|<description>(.*?)<\/description>/s),
    content: pick(it, /<content:encoded><!\[CDATA\[(.*?)\]\]><\/content:encoded>/s),
    summary: pick(it, /<summary><!\[CDATA\[(.*?)\]\]><\/summary>|<summary>(.*?)<\/summary>/s)
  }));
}
function pick(s, re) {
  const m = s.match(re);
  return (m && (m[1] || m[2])) ? (m[1] || m[2]).trim() : "";
}

// —— HTML 实体反转（足够应对常见实体） ——
function unescapeEntities(s = "") {
  return String(s)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

// —— 日期规范化：转成 YYYY-MM-DD ——
function isoDate(pubDate = "") {
  const d = new Date(pubDate);
  if (!Number.isNaN(+d)) return d.toISOString().slice(0, 10);
  const m = String(pubDate).match(/(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return ""; // 实在不行就留空
}

// —— 去标签、压缩空白（含实体反转） ——
function stripHTML(s = "") {
  return unescapeEntities(s).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

// —— 提取首图（兼容 src / data-xxx / srcset / og:image） ——
function extractFirstImage(html = "") {
  const h = unescapeEntities(html);

  // 1) 常见 <img ... src="..."> 与懒加载属性
  const attrs = ["src", "data-original", "data-actualsrc", "data-src"];
  for (const a of attrs) {
    const re = new RegExp(`<img[^>]+${a}=["']([^"']+)["']`, "i");
    const m = h.match(re);
    if (m) return m[1];
  }

  // 2) srcset（取第一张）
  const m2 = h.match(/(?:<img|<source)[^>]+srcset=["']([^"']+)["']/i);
  if (m2) {
    const first = m2[1].split(",")[0].trim().split(/\s+/)[0];
    if (first) return first;
  }

  // 3) 兜底：OG 图片
  const m3 = h.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
  if (m3) return m3[1];

  return "";
}

// —— 统一映射（标题/摘要/图片/日期都做兜底与清洗） ——
function mapToUnified(it, { platformHint = "", excerptLen = 180 } = {}) {
  const raw  = it.content || it.description || it.summary || "";
  const text = stripHTML(raw);
  const image = extractFirstImage(raw);

  let title = (it.title || "").trim();
  if (!title) {
    // 没有 <title> 时，用正文首句或前 36 字作为标题
    title = (text.split(/[。.!?\n]/)[0] || text).slice(0, 36);
    if (!title) title = "(无标题)";
  }

  return {
    id: it.guid || it.link || title,
    title,
    date: isoDate(it.pubDate || ""),
    platform: platformHint || "RSS",
    url: it.link || "",
    image: image || "",
    tags: [],
    excerpt: text.slice(0, excerptLen)
  };
}

function dedupeByKey(arr, keyFn) {
  const seen = new Set();
  const out = [];
  for (const x of arr) {
    const k = keyFn(x);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}
