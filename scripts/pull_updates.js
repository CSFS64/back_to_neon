// scripts/pull_updates.js
// Node >= 18（自带 fetch）
// 环境变量：RSS_URLS（“平台名+空格+URL”一行一个，或仅 URL）
// 可选：MAX_ITEMS（全量库上限，默认 50000）EXCERPT_LEN（默认 180）LATEST_KEEP（默认 50）

import fs from "node:fs/promises";

/* ------------------------ 读取与解析源列表 ------------------------ */
// 支持：
//   Zhihu https://rsshub.app/zhihu/people/pins/xxx
//   https://rsshub.app/zhihu/people/activities/xxx
const RAW = process.env.RSS_URLS || "";
const LINES = RAW.split(/\r?\n|,/).map(s => s.trim()).filter(Boolean);
if (!LINES.length) {
  console.error("ERROR: 环境变量 RSS_URLS 为空。请在 GitHub Secrets 里设置。");
  process.exit(0); // 不让 Action 红
}
const SOURCES = LINES.map((line) => {
  const m = line.match(/^(\S+)\s+(https?:\/\/\S+)$/i);
  return m ? { platform: m[1], url: m[2] } : { platform: "", url: line };
});

console.log(`[DEBUG] SOURCES count=${SOURCES.length}`);
for (const s of SOURCES) {
  const safeUrl = (s.url || "").replace(/https?:\/\/([^\/]+)/i, (m, host) => `https://${host}`);
  console.log(`[DEBUG] src platform="${s.platform}" url="${safeUrl.slice(0,120)}"`);
});

const MAX_ITEMS   = parseInt(process.env.MAX_ITEMS   || "50000", 10); // 全量库硬上限
const EXCERPT_LEN = parseInt(process.env.EXCERPT_LEN || "180",   10);
const LATEST_KEEP = parseInt(process.env.LATEST_KEEP || "50",    10);

const OUT_DIR    = "data";
const OUT_ALL    = `${OUT_DIR}/updates-all.json`; // 全量
const OUT_LATEST = `${OUT_DIR}/updates.json`;     // 最新 N 条（供 banner 等轻载）

/* ------------------------ 主流程：抓取 → 解析 → 合并历史 ------------------------ */
const fresh = [];
for (const src of SOURCES) {
  const url  = src.url;
  const hint = src.platform || platformFromURL(url); // 平台名优先取行首指定；否则按域名猜
  try {
    const xml    = await fetchText(url);
    console.log(`[DEBUG] sniff=`, /<feed[\s>]/i.test(xml) ? 'Atom' : 'RSS', 'len=', xml.length, 'url=', url);
    const items  = parseFeed(xml);        // ← 兼容 RSS/Atom
    if (!items || !Array.isArray(items) || items.length === 0) {
      console.warn(`[WARN] parseFeed returned 0 items for ${url}`);
    }
    const mapped = items.map(it => mapToUnified(it, { platformHint: hint, excerptLen: EXCERPT_LEN }));
    fresh.push(...mapped);
    console.log(`[RSS] ${hint} ${url} -> ${items.length} items`);
  } catch (e) {
    console.error(`WARN: 抓取失败 ${url}:`, String(e).slice(0, 300));
  }
}

// 读旧档（全量库），合并去重
await fs.mkdir(OUT_DIR, { recursive: true });
let old = [];
try {
  const prev = await fs.readFile(OUT_ALL, "utf8");
  old = JSON.parse(prev);
  if (!Array.isArray(old)) old = [];
} catch { old = []; }

// 若本次抓取为 0 条且已有历史 → 不覆盖，直接退出（防止把文件清空成 []）
if (fresh.length === 0 && old.length > 0) {
  console.warn("[WARN] 本次抓取 0 条，保留历史文件不覆盖。");
  process.exit(0);
}

const merged = dedupeByKey([...fresh, ...old], x => x.id || x.url || x.title);
merged.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

const trimmedAll = merged.slice(0, MAX_ITEMS);
const latest     = merged.slice(0, LATEST_KEEP);

// 如果 merged 还是空（首次跑且抓不到），也不要写空文件
if (trimmedAll.length === 0) {
  console.warn("[WARN] 抓取与历史均为空，取消写入。请检查 RSS_URLS 或源可用性。");
  process.exit(0);
}

// 写文件
await fs.writeFile(OUT_ALL,    JSON.stringify(trimmedAll, null, 2), "utf8");
await fs.writeFile(OUT_LATEST, JSON.stringify(latest,     null, 2), "utf8");
console.log(`OK: 写入 ${OUT_ALL}（${trimmedAll.length} 条），以及 ${OUT_LATEST}（${latest.length} 条）。`);

/* ------------------------ 工具函数区 ------------------------ */
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
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} len=${txt?.length ?? 0}`);
      }
      if (!txt || txt.length < 50) {
        throw new Error(`Empty/too short response (len=${txt?.length ?? 0})`);
      }
      return txt;
    } catch (e) {
      clearTimeout(t);
      lastErr = e;
      console.warn(`[WARN] fetch ${i}/${tries} failed for ${url}: ${String(e).slice(0,200)}`);
      await new Promise(r => setTimeout(r, 500 * i)); // 退避
    }
  }
  throw lastErr || new Error("Fetch failed");
}

// —— 解析 RSS（<rss><item>）或 Atom（<feed><entry>）——
function parseFeed(xml) {
  const isAtom = /<feed[\s>]/i.test(xml) && /<entry[\s>]/i.test(xml);
  if (!isAtom) {
    // RSS 2.0：更稳健的 <item> 匹配
    let blocks = xml.split(/<item\b[^>]*>/i).slice(1).map(b => "<item>" + b);
    if (blocks.length === 0) {
      // 兜底：直接全局抓取 <item>…</item>
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
      // <link href="..."> 或 <link rel="alternate" href="...">
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

// 取文本（支持两组捕获）
function pick(s, re) {
  const m = s.match(re);
  return (m && (m[1] || m[2])) ? (m[1] || m[2]).trim() : "";
}

// 从单个标签里取属性（如 <link href="...">）
function pickAttr(s, tagRe, attr) {
  const m = s.match(tagRe);
  if (!m) return "";
  const tag = m[0];
  const m2 = tag.match(new RegExp(attr + `=["']([^"']+)["']`, 'i'));
  return m2 ? m2[1].trim() : "";
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

// —— 统一清理“Kalyna OSINT:”等前缀（标题+正文）——
const PREFIX_RE = /^\s*Kalyna\s*OSINT\s*[:：\-]\s*/i;

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

// —— 极简标签提取（可按需扩展）——
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
    { re: /\bfpv\b/i,      norm: "FPV" },
    { re: /\bdrone\b/i,    norm: "Drone" },
  ];
  for (const { re, norm } of TAG_MAP) {
    if (re.test(s)) tags.add(norm);
  }

  return Array.from(tags).slice(0, 8);
}

// 统一映射
function mapToUnified(it, { platformHint = "", excerptLen = 180 } = {}) {
  const raw    = it.content || it.description || it.summary || "";
  const text   = stripHTML(raw);
  const image  = extractFirstImage(raw);

  const cleanRaw  = raw.replace(PREFIX_RE, "");
  const cleanText = text.replace(PREFIX_RE, "");

  let title = (it.title || "").trim().replace(PREFIX_RE, "");
  if (!title) {
    // pins/activities 常无 <title>，从正文抽一条更像标题的句子
    title = deriveTitleFromPins(cleanRaw, cleanText).replace(PREFIX_RE, "");
  }

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
