// scripts/pull_updates.js
// Node >= 18（自带 fetch）
//
// 环境变量：
//   RSS_URLS     （“平台名+空格+URL”一行一个，或仅 URL）
//   MAX_ARCHIVE  （全量库上限，默认 50000）
//   MAX_ITEMS    （updates.json 最新条数，默认 120）
//   EXCERPT_LEN  （摘要长度，默认 180）
//   HISTORY_SHARD（是否写入 data/history/ 按日分片，默认 1=开启）

import fs from "node:fs/promises";

/* ------------------------ 读取与解析源列表 ------------------------ */
const RAW = process.env.RSS_URLS || "";
const LINES = RAW.split(/\r?\n|,/).map(s => s.trim()).filter(Boolean);
if (!LINES.length) {
  console.error("ERROR: 环境变量 RSS_URLS 为空。请在 GitHub Secrets 里设置。");
  process.exit(0);
}
const SOURCES = LINES.map(line => {
  const m = line.match(/^(\S+)\s+(https?:\/\/\S+)$/i);
  return m ? { platform: m[1], url: m[2] } : { platform: "", url: line };
});

const MAX_ARCHIVE  = parseInt(process.env.MAX_ARCHIVE  || "50000", 10); // 全量库硬上限
const MAX_ITEMS    = parseInt(process.env.MAX_ITEMS    || "120",   10); // 最新条数（轻载）
const EXCERPT_LEN  = parseInt(process.env.EXCERPT_LEN  || "180",   10);
const HISTORY_SHARD= String(process.env.HISTORY_SHARD ?? "1") !== "0";

const OUT_DIR    = "data";
const OUT_ALL    = `${OUT_DIR}/updates-all.json`; // 全量历史
const OUT_LATEST = `${OUT_DIR}/updates.json`;     // 最新 N 条

/* ------------------------ 主流程：抓取 ------------------------ */
const fresh = [];
for (const src of SOURCES) {
  const url  = src.url;
  const hint = src.platform || platformFromURL(url);
  try {
    const xml    = await fetchText(url);
    const items  = parseFeed(xml); // 兼容 RSS/Atom
    const mapped = items.map(it => mapToUnified(it, { platformHint: hint, excerptLen: EXCERPT_LEN }));
    fresh.push(...mapped);
    console.log(`[RSS] ${hint} ${url} -> ${items.length} items`);
  } catch (e) {
    console.error(`WARN: 抓取失败 ${url}:`, String(e).slice(0, 300));
  }
}

/* ------------------------ 合并历史 ------------------------ */
await fs.mkdir(OUT_DIR, { recursive: true });

let old = [];
try {
  const prev = await fs.readFile(OUT_ALL, "utf8");
  old = JSON.parse(prev);
  if (!Array.isArray(old)) old = [];
} catch { old = []; }

if (fresh.length === 0 && old.length > 0) {
  // 本次抓不到就不动历史；但仍刷新最新 N 条，保证轻载文件与历史一致
  const latest = old
    .slice() // 拷贝
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .slice(0, MAX_ITEMS);
  await fs.writeFile(OUT_LATEST, JSON.stringify(latest, null, 2), "utf8");
  console.warn("[WARN] 本次抓取 0 条，保留历史并仅刷新 updates.json。");
  process.exit(0);
}

// fresh + old → 去重合并
const merged = dedupeByKey([...fresh, ...old], x => x.id || x.url || x.title);
merged.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

// 全量库裁剪到 MAX_ARCHIVE（防炸库）
const archiveAll = merged.slice(0, MAX_ARCHIVE);
// 最新 N 条作为轻载
const latest     = merged.slice(0, MAX_ITEMS);

// 写文件（全量 + 轻载）
await fs.writeFile(OUT_ALL,    JSON.stringify(archiveAll, null, 2), "utf8");
await fs.writeFile(OUT_LATEST, JSON.stringify(latest,     null, 2), "utf8");
console.log(`OK: 写入 ${OUT_ALL}（${archiveAll.length} 条），以及 ${OUT_LATEST}（${latest.length} 条）。`);

// （可选）按日分片写入 data/history/YYYY-MM/YYYY-MM-DD.json（同样合并去重）
if (HISTORY_SHARD) {
  await shardByDateAppend(archiveAll);
  console.log(`OK: 已写入按日分片到 data/history/`);
}

/* ------------------------ 工具函数区 ------------------------ */
async function fetchText(url, { tries = 3, timeoutMs = 15000 } = {}) {
  const headers = {
    "User-Agent": "KalynaOSINT-RSS/1.0",
    "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml; q=1.0, text/html; q=0.2, */*; q=0.1",
  };
  let lastErr = null;
  for (let i = 1; i <= tries; i++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { headers, redirect: "follow", signal: ctrl.signal });
      const txt = await res.text();
      clearTimeout(t);
      if (!res.ok) throw new Error(`HTTP ${res.status} len=${txt?.length ?? 0}`);
      if (!txt || txt.length < 50) throw new Error(`Empty/too short response (len=${txt?.length ?? 0})`);
      return txt;
    } catch (e) {
      clearTimeout(t);
      lastErr = e;
      console.warn(`[WARN] fetch ${i}/${tries} failed for ${url}: ${String(e).slice(0,200)}`);
      await new Promise(r => setTimeout(r, 500 * i));
    }
  }
  throw lastErr || new Error("Fetch failed");
}

// RSS / Atom 兼容解析
function parseFeed(xml) {
  const isAtom = /<feed[\s>]/i.test(xml) && /<entry[\s>]/i.test(xml);

  if (!isAtom) {
    // RSS 2.0
    let blocks = xml.split(/<item\b[^>]*>/i).slice(1).map(b => "<item>" + b);
    if (blocks.length === 0) {
      const rough = xml.match(/<item\b[^>]*>[\s\S]*?<\/item>/ig) || [];
      blocks = rough;
    }
    return blocks.map(it => ({
      title:       pick(it, /<title(?:>|\s[^>]*>)(?:<!\[CDATA\[(.*?)\]\]>|([^<]*))<\/title>/is),
      link:        pick(it, /<link(?:>|\s[^>]*>)([^<]+)<\/link>/is),
      guid:        pick(it, /<guid[^>]*>([^<]+)<\/guid>/is),
      pubDate:     pick(it, /<pubDate>([^<]+)<\/pubDate>/is),
      description: pick(it, /<description(?:>|\s[^>]*>)(?:<!\[CDATA\[(.*?)\]\]>|([^<]*))<\/description>/is),
      content:     pick(it, /<content:encoded(?:>|\s[^>]*>)(?:<!\[CDATA\[(.*?)\]\]>|([\s\S]*?))<\/content:encoded>/is),
      summary:     pick(it, /<summary(?:>|\s[^>]*>)(?:<!\[CDATA\[(.*?)\]\]>|([^<]*))<\/summary>/is)
    }));
  } else {
    // Atom 1.0
    const blocks = xml.split(/<entry\b[^>]*>/i).slice(1).map(b => "<entry>" + b);
    return blocks.map(en => {
      const link =
        pickAttr(en, /<link\b[^>]*rel=["']alternate["'][^>]*>/i, 'href') ||
        pickAttr(en, /<link\b[^>]*>/i, 'href') ||
        "";
      return {
        title:       pick(en, /<title(?:>|\s[^>]*>)(?:<!\[CDATA\[(.*?)\]\]>|([\s\S]*?))<\/title>/is),
        link,
        guid:        pick(en, /<id>([^<]+)<\/id>/i) || link,
        pubDate:     pick(en, /<updated>([^<]+)<\/updated>/i) || pick(en, /<published>([^<]+)<\/published>/i),
        description: pick(en, /<summary(?:>|\s[^>]*>)(?:<!\[CDATA\[(.*?)\]\]>|([^<]*))<\/summary>/is),
        content:     pick(en, /<content(?:>|\s[^>]*>)(?:<!\[CDATA\[(.*?)\]\]>|([\s\S]*?))<\/content>/is),
        summary:     ""
      };
    });
  }
}

// 工具：匹配捕获（两组兜底）
function pick(s, re) {
  const m = s.match(re);
  return (m && (m[1] || m[2])) ? (m[1] || m[2]).trim() : "";
}
function pickAttr(s, tagRe, attr) {
  const m = s.match(tagRe);
  if (!m) return "";
  const tag = m[0];
  const m2 = tag.match(new RegExp(attr + `=["']([^"']+)["']`, 'i'));
  return m2 ? m2[1].trim() : "";
}

// HTML 实体反转 + 去标签/压空白
function unescapeEntities(s = "") {
  return String(s)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
function stripHTML(s = "") {
  return unescapeEntities(s).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

// 日期规范化：转 YYYY-MM-DD
function isoDate(pubDate = "") {
  const d = new Date(pubDate);
  if (!Number.isNaN(+d)) return d.toISOString().slice(0, 10);
  const m = String(pubDate).match(/(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return "";
}

// 提取首图（src/srcset/og:image）
function extractFirstImage(html = "") {
  const h = unescapeEntities(html);
  const attrs = ["src", "data-original", "data-actualsrc", "data-src"];
  for (const a of attrs) {
    const re = new RegExp(`<img[^>]+${a}=["']([^"']+)["']`, "i");
    const m = h.match(re);
    if (m) return m[1];
  }
  const m2 = h.match(/(?:<img|<source)[^>]+srcset=["']([^"']+)["']/i);
  if (m2) {
    const first = m2[1].split(",")[0].trim().split(/\s+/)[0];
    if (first) return first;
  }
  const m3 = h.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
  if (m3) return m3[1];
  return "";
}

// 平台判定（URL/路径）
function platformFromURL(u = "") {
  try {
    const { hostname: h0, pathname: p0 } = new URL(u);
    const h = String(h0).toLowerCase();
    const p = String(p0).toLowerCase();
    if (p.startsWith("/zhihu/")) return "Zhihu";
    if (p.startsWith("/bilibili/")) return "Bilibili";
    if (p.startsWith("/twitter/") || p.startsWith("/x/")) return "X";
    if (p.includes("/freeland/")) return "FreeLand";
    if (h.includes("zhihu")) return "Zhihu";
    if (h.includes("bilibili")) return "Bilibili";
    if (h.includes("twitter") || h.includes("x.com")) return "X";
    if (h.includes("csfs64.github.io") || h.includes("freeland")) return "FreeLand";
  } catch {}
  return "RSS";
}

// 提取标签（简单示例，可扩展）
function extractTags(raw = "", text = "") {
  const s = unescapeEntities(raw) + " " + (text || "");
  const tags = new Set();
  const hash = s.match(/#([\p{L}\p{N}_\-]{2,30})/gu) || [];
  for (const m of hash) tags.add(m.slice(1));
  const br = s.match(/\[([^\[\]]{2,30})\]/g) || [];
  for (const m of br) tags.add(m.slice(1, -1));
  return Array.from(tags).slice(0, 8);
}

// 标题派生（适配知乎 pins/activities）
function deriveTitleFromPins(rawHTML = "", fallbackText = "") {
  const h = unescapeEntities(rawHTML);
  let s = h.replace(/^\s*(?:<a\b[^>]*>.*?<\/a>|[\u4e00-\u9fa5A-Za-z0-9 _.-]{2,})\s*[:：]\s*/i, "");
  const divMatch = s.match(/<div[^>]*>([\s\S]*?)<\/div>/i);
  if (divMatch) s = divMatch[1]; else s = s.split(/<br\s*\/?>/i)[0];
  let text = stripHTML(s).replace(/^[\s:：，、。.!?'"“”‘’\-—]+/, "").trim();
  if (!text) text = stripHTML(h) || fallbackText || "(无标题)";
  return text.length > 36 ? text.slice(0, 36) + "…" : text;
}

// 统一映射
const PREFIX_RE = /^\s*Kalyna\s*OSINT\s*[:：\-]\s*/i;
function mapToUnified(it, { platformHint = "", excerptLen = 180 } = {}) {
  const raw    = it.content || it.description || it.summary || "";
  const text   = stripHTML(raw);
  const image  = extractFirstImage(raw);

  const cleanRaw  = raw.replace(PREFIX_RE, "");
  const cleanText = text.replace(PREFIX_RE, "");

  let title = (it.title || "").trim().replace(PREFIX_RE, "");
  if (!title) {
    title = deriveTitleFromPins(cleanRaw, cleanText).replace(PREFIX_RE, "");
  }

  const date = isoDate(it.pubDate || "");

  return {
    id: it.guid || it.link || title,
    title,
    date,
    platform: platformHint || platformFromURL(it.link || "") || "RSS",
    url: it.link || "",
    image: image || "",
    tags: extractTags(cleanRaw, cleanText),
    excerpt: cleanText.slice(0, excerptLen)
  };
}

// 去重
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

// 按 date=YYYY-MM-DD 分片累加
async function shardByDateAppend(items) {
  // 仅处理有 date 的
  const groups = new Map();
  for (const it of items) {
    if (!it.date) continue;
    if (!groups.has(it.date)) groups.set(it.date, []);
    groups.get(it.date).push(it);
  }
  for (const [day, arr] of groups.entries()) {
    const ym = day.slice(0, 7); // YYYY-MM
    const dir = `${OUT_DIR}/history/${ym}`;
    const file = `${dir}/${day}.json`;
    await fs.mkdir(dir, { recursive: true });

    // 读旧 → 合并去重 → 按日期+标题排序（稳定）
    let oldDay = [];
    try {
      const t = await fs.readFile(file, "utf8");
      oldDay = JSON.parse(t);
      if (!Array.isArray(oldDay)) oldDay = [];
    } catch { oldDay = []; }

    const merged = dedupeByKey([...arr, ...oldDay], x => x.id || x.url || x.title);
    merged.sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.title || "").localeCompare(a.title || ""));

    await fs.writeFile(file, JSON.stringify(merged, null, 2), "utf8");
  }
}
