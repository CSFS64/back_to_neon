// scripts/pull_updates.js
// 需要 node >= 18（自带 fetch）或在 Action 里装 node 20。
// 环境变量：RSS_URLS（换行或逗号分隔多个 RSS 源）
// 可选：MAX_ITEMS（默认 120），EXCERPT_LEN（默认 180）

import fs from "node:fs/promises";

// ---------- 环境配置 ----------
const RSS_URLS = (process.env.RSS_URLS || "").split(/[\n,]/).map(s => s.trim()).filter(Boolean);
if (!RSS_URLS.length) {
  console.error("ERROR: 环境变量 RSS_URLS 为空。请在 GitHub Secrets 里设置。");
  process.exit(1);
}
const MAX_ITEMS = parseInt(process.env.MAX_ITEMS || "120", 10);
const EXCERPT_LEN = parseInt(process.env.EXCERPT_LEN || "180", 10);
const OUT_PATH = "data/updates.json";

// ---------- 主流程 ----------
const all = [];
for (const url of RSS_URLS) {
  try {
    const xml = await fetchText(url);
    const items = parseRSS(xml);
    const mapped = items.map((it) => mapToUnified(it, { platformHint: "Zhihu", excerptLen: EXCERPT_LEN }));
    all.push(...mapped);
  } catch (e) {
    console.error(`WARN: 抓取失败 ${url}:`, String(e).slice(0, 200));
  }
}

// 去重（优先 guid>link>title），按日期倒序，截断总量
const deduped = dedupeByKey(all, (x) => x.id || x.url || x.title);
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

function parseRSS(xml) {
  // 极简解析，针对 RSSHub 的常见字段；足够应对知乎、B站等。
  // 如果你更喜欢严谨解析，可改用 fast-xml-parser。
  const blocks = xml.split(/<item>/).slice(1).map(b => "<item>" + b);
  return blocks.map(it => ({
    title: pick(it, /<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/s),
    link: pick(it, /<link>(.*?)<\/link>/s),
    guid: pick(it, /<guid[^>]*>(.*?)<\/guid>/s),
    pubDate: pick(it, /<pubDate>(.*?)<\/pubDate>/s),
    description: pick(it, /<description><!\[CDATA\[(.*?)\]\]><\/description>|<description>(.*?)<\/description>/s),
    content: pick(it, /<content:encoded><!\[CDATA\[(.*?)\]\]><\/content:encoded>/s)
  }));
}

function pick(s, re) {
  const m = s.match(re);
  if (!m) return "";
  // 两种捕获任取其一
  return (m[1] || m[2] || "").trim();
}

// 用 summary 兜底；保证 title/excerpt 都有值
function mapToUnified(it, { platformHint = "", excerptLen = 180 } = {}) {
  const raw = it.content || it.description || it.summary || "";
  const image = extractFirstImage(raw);
  const text = stripHTML(raw);
  const title = (it.title || "").trim() || text.split(/[。.!?\n]/)[0] || "(无标题)";
  return {
    id: it.guid || it.link || title,
    title,
    date: String(it.pubDate || "").slice(0, 10),
    platform: platformHint || "RSS",
    url: it.link || "",
    image: image || "",
    tags: [],
    excerpt: text.slice(0, excerptLen)
  };
}

// 兼容常见图片属性：src / data-original / data-actualsrc / data-src
function extractFirstImage(html) {
  const attrs = ['src', 'data-original', 'data-actualsrc', 'data-src'];
  for (const a of attrs) {
    const re = new RegExp(`<img[^>]+${a}=["']([^"']+)["']`, 'i');
    const m = html.match(re);
    if (m) return m[1];
  }
  return "";
}

function stripHTML(s) {
  return String(s).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
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
