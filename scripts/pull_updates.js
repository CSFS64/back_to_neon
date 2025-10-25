// scripts/pull_updates.js
// Node >= 18
// ENV: RSS_URLS (一行一条；支持“平台名+空格+URL”或仅 URL)
//      MAX_ITEMS(默认50000) EXCERPT_LEN(默认180) LATEST_KEEP(默认50)

import fs from "node:fs/promises";

const OUT_DIR    = "data";
const OUT_ALL    = `${OUT_DIR}/updates-all.json`;
const OUT_LATEST = `${OUT_DIR}/updates.json`;

const RAW = process.env.RSS_URLS || "";
const LINES = RAW.split(/\r?\n|,/).map(s => s.trim()).filter(Boolean);
if (!LINES.length) {
  console.error("ERROR: 环境变量 RSS_URLS 为空。请在 GitHub Secrets 里设置。");
  await writePlaceholder("RSS_URLS is empty");
  process.exit(0);
}

const SOURCES = LINES.map(line => {
  const m = line.match(/^(\S+)\s+(https?:\/\/\S+)$/i);
  return m ? { platform: m[1], url: m[2] } : { platform: "", url: line };
});
console.log(`[DEBUG] SOURCES count=${SOURCES.length}`);
for (const s of SOURCES) console.log(`[DEBUG] src platform="${s.platform}" url="${(s.url||"").slice(0,200)}"`);

const MAX_ITEMS   = parseInt(process.env.MAX_ITEMS   || "50000", 10);
const EXCERPT_LEN = parseInt(process.env.EXCERPT_LEN || "180",   10);
const LATEST_KEEP = parseInt(process.env.LATEST_KEEP || "50",    10);

/* ------------------------ 抓取 ------------------------ */
const fresh = [];
for (const src of SOURCES) {
  const url  = src.url;
  const hint = src.platform || platformFromURL(url);
  try {
    const xml    = await fetchText(url);
    console.log(`[DEBUG] sniff=`, /<feed[\s>]/i.test(xml) ? 'Atom' : 'RSS', 'len=', xml.length, 'url=', url);
    const items  = parseFeed(xml);
    if (!items || !Array.isArray(items) || items.length === 0) {
      console.warn(`[WARN] parseFeed returned 0 items for ${url}`);
    }
    const mapped = (items || []).map(it => mapToUnified(it, { platformHint: hint, excerptLen: EXCERPT_LEN }));
    fresh.push(...mapped);
    console.log(`[RSS] ${hint} ${url} -> ${items?.length ?? 0} items`);
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

console.log(`[DEBUG] counts fresh=${fresh.length} old=${old.length}`);

const merged = dedupeByKey([...fresh, ...old], x => x.id || x.url || x.title);
merged.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
const trimmedAll = merged.slice(0, MAX_ITEMS);
const latest     = merged.slice(0, LATEST_KEEP);

console.log(`[DEBUG] merged=${merged.length} trimmedAll=${trimmedAll.length} latest=${latest.length}`);

/* ------------------------ 写出（保证非空） ------------------------ */
if (trimmedAll.length === 0) {
  console.warn("[WARN] 抓取与历史均为空，写入占位数据。");
  await writePlaceholder("No items fetched or parsed");
  process.exit(0);
}

await fs.writeFile(OUT_ALL,    JSON.stringify(trimmedAll, null, 2), "utf8");
await fs.writeFile(OUT_LATEST, JSON.stringify(latest,     null, 2), "utf8");
console.log(`OK: 写入 ${OUT_ALL}（${trimmedAll.length} 条），以及 ${OUT_LATEST}（${latest.length} 条）。`);

/* ======================== 工具函数 ======================== */
async function writePlaceholder(reason) {
  const now = new Date().toISOString();
  const placeholder = [{
    id: `empty-${now}`,
    title: "(暂无更新)",
    date: now.slice(0,10),
    platform: "",
    url: "",
    image: "",
    tags: [],
    excerpt: `placeholder: ${reason}`
  }];
  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(OUT_ALL,    JSON.stringify(placeholder, null, 2), "utf8");
  await fs.writeFile(OUT_LATEST, JSON.stringify(placeholder, null, 2), "utf8");
  console.log(`OK: 写入占位 -> ${OUT_ALL} / ${OUT_LATEST}`);
}

async function fetchText(url, { tries = 3, timeoutMs = 15000 } = {}) {
  const headers = {
    "User-Agent": "KalynaOSINT-RSS/1.0",
    "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html; q=0.8, */*; q=0.1",
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

function parseFeed(xml) {
  const isAtom = /<feed[\s>]/i.test(xml) && /<entry[\s>]/i.test(xml);
  if (!isAtom) {
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
    const blocks = xml.split(/<entry\b[^>]*>/i).slice(1).map(b => "<entry>" + b);
    return blocks.map(en => {
      const link =
        pickAttr(en, /<link\b[^>]*rel=["']alternate["'][^>]*>/i, 'href') ||
        pickAttr(en, /<link\b[^>]*>/i, 'href') || "";
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
function unescapeEntities(s = "") {
  return String(s)
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}
function isoDate(pubDate = "") {
  const d = new Date(pubDate);
  if (!Number.isNaN(+d)) return d.toISOString().slice(0, 10);
  const m = String(pubDate).match(/(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return "";
}
function stripHTML(s = "") {
  return unescapeEntities(s).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}
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
const PREFIX_RE = /^\s*Kalyna\s*OSINT\s*[:：\-]\s*/i;
function deriveTitleFromPins(rawHTML = "", fallbackText = "") {
  const h = unescapeEntities(rawHTML);
  let s = h.replace(/^\s*(?:<a\b[^>]*>.*?<\/a>|[\u4e00-\u9fa5A-Za-z0-9 _.-]{2,})\s*[:：]\s*/i, "");
  const divMatch = s.match(/<div[^>]*>([\s\S]*?)<\/div>/i);
  if (divMatch) s = divMatch[1]; else s = s.split(/<br\s*\/?>/i)[0];
  let text = stripHTML(s).replace(/^[\s:：，、。.!?'"“”‘’\-—]+/, "").trim();
  if (!text) text = stripHTML(h) || fallbackText || "(无标题)";
  return text.length > 36 ? text.slice(0, 36) + "…" : text;
}
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
function extractTags(raw = "", text = "") {
  const s = unescapeEntities(raw) + " " + (text || "");
  const tags = new Set();
  const hash = s.match(/#([\p{L}\p{N}_\-]{2,30})/gu) || [];
  for (const m of hash) tags.add(m.slice(1));
  const br = s.match(/\[([^\[\]]{2,30})\]/g) || [];
  for (const m of br) tags.add(m.slice(1, -1));
  const TAG_MAP = [
    { re: /\bavdiivka\b/i, norm: "Avdiivka" },
    { re: /\bfpv\b/i,      norm: "FPV" },
    { re: /\bdrone\b/i,    norm: "Drone" },
  ];
  for (const { re, norm } of TAG_MAP) if (re.test(s)) tags.add(norm);
  return Array.from(tags).slice(0, 8);
}
function mapToUnified(it, { platformHint = "", excerptLen = 180 } = {}) {
  const raw    = it.content || it.description || it.summary || "";
  const text   = stripHTML(raw);
  const image  = extractFirstImage(raw);
  const cleanRaw  = raw.replace(PREFIX_RE, "");
  const cleanText = text.replace(PREFIX_RE, "");
  let title = (it.title || "").trim().replace(PREFIX_RE, "");
  if (!title) title = deriveTitleFromPins(cleanRaw, cleanText).replace(PREFIX_RE, "");
  return {
    id: it.guid || it.link || title,
    title,
    date: isoDate(it.pubDate || ""),
    platform: platformHint || platformFromURL(it.link || "") || "RSS",
    url: it.link || "",
    image: image || "",
    tags: extractTags(cleanRaw, cleanText),
    excerpt: cleanText.slice(0, excerptLen)
  };
}
function dedupeByKey(arr, keyFn) {
  const seen = new Set(); const out = [];
  for (const x of arr) { const k = keyFn(x); if (!k || seen.has(k)) continue; seen.add(k); out.push(x); }
  return out;
}
