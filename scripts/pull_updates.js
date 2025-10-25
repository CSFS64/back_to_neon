// scripts/pull_updates.js
// Node >= 18（自带 fetch）
// 环境变量：RSS_URLS（“平台名+空格+URL”一行一个，或仅 URL）
// 可选：MAX_ITEMS（默认 120），EXCERPT_LEN（默认 180）

import fs from "node:fs/promises";

/* ------------------------ 读取与解析源列表 ------------------------ */
// 允许以下两种写法混用：
//   Zhihu https://rsshub.app/zhihu/people/pins/xxx
//   https://rsshub.app/zhihu/people/activities/xxx
const RAW = process.env.RSS_URLS || "";
const LINES = RAW.split(/\n|,/).map(s => s.trim()).filter(Boolean);
if (!LINES.length) {
  console.error("ERROR: 环境变量 RSS_URLS 为空。请在 GitHub Secrets 里设置。");
  process.exit(1);
}
const SOURCES = LINES.map(line => {
  const m = line.match(/^(\S+)\s+(https?:\/\/\S+)$/i);
  return m ? { platform: m[1], url: m[2] } : { platform: "", url: line };
});

const MAX_ITEMS   = parseInt(process.env.MAX_ITEMS   || "120", 10);
const EXCERPT_LEN = parseInt(process.env.EXCERPT_LEN || "180", 10);
const OUT_PATH    = "data/updates.json";

/* ------------------------ 主流程：抓取 → 解析 → 统一映射 ------------------------ */
const all = [];
for (const src of SOURCES) {
  const url  = src.url;
  const hint = src.platform || platformFromURL(url); // 平台名优先取行首指定；否则按域名猜
  try {
    const xml    = await fetchText(url);
    const items  = parseRSS(xml);
    const mapped = items.map(it => mapToUnified(it, { platformHint: hint, excerptLen: EXCERPT_LEN }));
    all.push(...mapped);
    console.log(`[RSS] ${hint} ${url} -> ${items.length} items`);
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

/* ------------------------ 工具函数区 ------------------------ */
async function fetchText(url) {
  const res = await fetch(url, { headers: { "User-Agent": "KalynaOSINT-RSS/1.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

// 极简 RSS 解析（足以应对 RSSHub 常见字段）
function parseRSS(xml) {
  const blocks = xml.split(/<item>/).slice(1).map(b => "<item>" + b);
  return blocks.map(it => ({
    title:       pick(it, /<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/s),
    link:        pick(it, /<link>(.*?)<\/link>/s),
    guid:        pick(it, /<guid[^>]*>(.*?)<\/guid>/s),
    pubDate:     pick(it, /<pubDate>(.*?)<\/pubDate>/s),
    description: pick(it, /<description><!\[CDATA\[(.*?)\]\]><\/description>|<description>(.*?)<\/description>/s),
    content:     pick(it, /<content:encoded><!\[CDATA\[(.*?)\]\]><\/content:encoded>/s),
    summary:     pick(it, /<summary><!\[CDATA\[(.*?)\]\]><\/summary>|<summary>(.*?)<\/summary>/s)
  }));
}
function pick(s, re) {
  const m = s.match(re);
  return (m && (m[1] || m[2])) ? (m[1] || m[2]).trim() : "";
}

// HTML 实体反转（足够应对常见实体）
function unescapeEntities(s = "") {
  return String(s)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

// 日期规范化：转成 YYYY-MM-DD
function isoDate(pubDate = "") {
  const d = new Date(pubDate);
  if (!Number.isNaN(+d)) return d.toISOString().slice(0, 10);
  const m = String(pubDate).match(/(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return "";
}

// 去标签、压缩空白（含实体反转）
function stripHTML(s = "") {
  return unescapeEntities(s).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

// 提取首图（兼容 src / data-xxx / srcset / og:image）
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

function extractTags(raw = "", text = "") {
  const s = unescapeEntities(raw) + " " + (text || "");
  const tags = new Set();

  // 1) #Hashtag 形态：#Avdiivka #FPV
  const hash = s.match(/#([\p{L}\p{N}_\-]{2,30})/gu) || [];
  for (const m of hash) tags.add(m.slice(1));

  // 2) [方括号] 形态：[Avdiivka] [Frontline]
  const br = s.match(/\[([^\[\]]{2,30})\]/g) || [];
  for (const m of br) tags.add(m.slice(1, -1));

  // 3) 自定义关键字映射
  const TAG_MAP = [
    { re: /\bavdiivka\b/i, norm: "Avdiivka" },
    { re: /\bfpv\b/i, norm: "FPV" },
    { re: /\bdrone\b/i, norm: "Drone" },
  ];
  for (const { re, norm } of TAG_MAP) {
    if (re.test(s)) tags.add(norm);
  }

  return Array.from(tags).slice(0, 8);
}

// 从 pins/activities 的正文里“炼出”更像标题的一句话
function deriveTitleFromPins(rawHTML = "", fallbackText = "") {
  const h = unescapeEntities(rawHTML);

  // 1) 去掉开头的“作者 + 冒号”
  let s = h.replace(/^\s*(?:<a\b[^>]*>.*?<\/a>|[\u4e00-\u9fa5A-Za-z0-9 _.-]{2,})\s*[:：]\s*/i, "");

  // 2) 优先取第一个 <div> 的内容；否则取第一个 <br> 之前的片段
  const divMatch = s.match(/<div[^>]*>([\s\S]*?)<\/div>/i);
  if (divMatch) {
    s = divMatch[1];
  } else {
    s = s.split(/<br\s*\/?>/i)[0];
  }

  // 3) 去标签 → 纯文本；去掉开头标点/空白
  let text = stripHTML(s).replace(/^[\s:：，、。.!?'"“”‘’\-—]+/, "").trim();

  // 4) 兜底
  if (!text) text = stripHTML(h) || fallbackText || "(无标题)";

  // 5) 限长
  return text.length > 36 ? text.slice(0, 36) + "…" : text;
}

// 统一映射
function mapToUnified(it, { platformHint = "", excerptLen = 180 } = {}) {
  const raw    = it.content || it.description || it.summary || "";
  const text   = stripHTML(raw);
  const image  = extractFirstImage(raw);

  // —— 去掉正文与标题开头的“Kalyna OSINT:”等前缀（带各种冒号、破折号）——
  const prefixRE = /^\s*Kalyna\s*OSINT\s*[:：\-]\s*/i;
  const cleanRaw  = raw.replace(prefixRE, "");
  const cleanText = text.replace(prefixRE, "");

  let title = (it.title || "").trim().replace(prefixRE, ""); // 标题也清理
  if (!title) {
    // pins/activities 常无 <title>，从正文抽一条更像标题的句子
    title = deriveTitleFromPins(cleanRaw, cleanText);
    title = title.replace(prefixRE, "");
  }

  return {
    id: it.guid || it.link || title,
    title,
    date: isoDate(it.pubDate || ""),
    platform: platformHint || "RSS",
    url: it.link || "",
    image: image || "",
    tags: [],
    excerpt: cleanText.slice(0, excerptLen)
  };
}

// 平台判断
function platformFromURL(u = "") {
  try {
    const { hostname: h0, pathname: p0 } = new URL(u);
    const h = String(h0).toLowerCase();
    const p = String(p0).toLowerCase();

    // 1) RSSHub 路由（优先按 pathname 判断）
    if (p.startsWith("/zhihu/")) return "Zhihu";
    if (p.startsWith("/bilibili/")) return "Bilibili";
    if (p.startsWith("/twitter/") || p.startsWith("/x/")) return "X";
    if (p.includes("/freeland/")) return "FreeLand";

    // 2) 直连站点（非 RSSHub）
    if (h.includes("zhihu")) return "Zhihu";
    if (h.includes("bilibili")) return "Bilibili";
    if (h.includes("twitter") || h.includes("x.com")) return "X";
    if (h.includes("csfs64.github.io") || h.includes("freeland")) return "FreeLand";
  } catch {}
  return "RSS";
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
