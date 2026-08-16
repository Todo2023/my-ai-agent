/**
 * Markdown → HTML
 *
 * 外部ライブラリを入れない決まり（CLAUDE.md）なので自前で書いてある。
 * 対応しているのは、記事を書くのに実際に要る範囲だけ。
 *
 *   見出し / 段落 / 箇条書き / 番号つき / 引用 / 区切り線 / 表
 *   コードブロック / 行内コード / 強調 / リンク / 画像 / 脚注なし
 *   :::message ・ :::message alert（Zennと同じ書き方の囲み）
 *
 * 足りない記法が出たら、そのとき足す。先回りして大きくしない。
 *
 * ■ 安全について
 * 本文はいまリポジトリの中にしかない（＝身内が書いたもの）。
 * それでも生HTMLは通さない方針にしてある。Phase 1 で投稿を受け付けたときに
 * 「ここは安全だったはず」と思い込まないための保険。
 */

/** HTMLとして意味を持つ文字を無害化する。すべての出力はここを通す */
function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** javascript: のようなURLを弾く。相対パス・http(s)・mailto だけ通す */
function safeUrl(url) {
  const u = String(url).trim();
  if (/^(https?:|mailto:)/i.test(u)) return u;
  if (/^[./#?]/.test(u) || /^[\w-]/.test(u)) {
    // スキームらしきものが混ざっていたら通さない
    if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return "#";
    return u;
  }
  return "#";
}

/**
 * 行の中身（強調・リンク・行内コード）を処理する。
 * 行内コードを先に取り出して退避し、あとで戻す。コードの中の記号を
 * 装飾として解釈してしまうのを防ぐため。
 */
// 行内コードを一時的に退避するときの目印。本文に絶対に出てこない文字を使う。
// 「 0 」のような見た目の目印にすると「約 300 円」のような文章を誤って拾う
const MARK = "\uE000";

function inline(src) {
  const codes = [];
  let s = String(src).replace(/`([^`]+)`/g, (_, code) => {
    codes.push(code);
    return `${MARK}${codes.length - 1}${MARK}`;
  });

  // ここから先は esc 済みの文字列を扱う。属性に入れる値を再度 esc しないこと
  // （URL の & が &amp;amp; になる）
  s = esc(s);

  // 画像が先。リンクの記法と紛らわしいため
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, url) =>
    `<img src="${safeUrl(url)}" alt="${alt}" loading="lazy" decoding="async" />`);

  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text, url) => {
    const href = safeUrl(url);
    const outer = /^https?:/i.test(href);
    // 外部リンクは rel を付ける。被リンク目的の投稿の旨味を消すため（docs/platform-marketing.md）
    const attr = outer ? ' target="_blank" rel="ugc nofollow noopener"' : "";
    return `<a href="${href}"${attr}>${text}</a>`;
  });

  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  s = s.replace(/~~([^~]+)~~/g, "<del>$1</del>");

  return s.replace(new RegExp(`${MARK}(\\d+)${MARK}`, "g"), (_, i) => `<code>${esc(codes[i])}</code>`);
}

/** 見出しから id を作る。目次から飛べるようにするため */
function slugify(text, used) {
  const base = text.trim().toLowerCase()
    .replace(/[\s　]+/g, "-")
    .replace(/[^\p{L}\p{N}-]/gu, "")
    .replace(/-+/g, "-").replace(/^-|-$/g, "") || "s";
  let id = base, n = 2;
  while (used.has(id)) id = `${base}-${n++}`;
  used.add(id);
  return id;
}

/**
 * @param {string} src Markdown本文（front matterは含めない）
 * @returns {{html:string, toc:Array<{level:number,text:string,id:string}>}}
 */
export function renderMarkdown(src) {
  const lines = String(src).replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  const toc = [];
  const usedIds = new Set();
  let i = 0;

  /** 続く行をまとめて1つの段落にする */
  const paragraph = () => {
    const buf = [];
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) buf.push(lines[i++]);
    if (buf.length) out.push(`<p>${inline(buf.join("\n")).replace(/\n/g, "<br />")}</p>`);
  };

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i++; continue; }

    // コードブロック
    const fence = line.match(/^```(\S*)/);
    if (fence) {
      const lang = fence[1];
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++; // 閉じる ```
      const cls = lang ? ` class="lang-${esc(lang)}"` : "";
      out.push(`<pre${cls}><code>${esc(buf.join("\n"))}</code></pre>`);
      continue;
    }

    // :::message / :::message alert
    const box = line.match(/^:::message(\s+alert)?\s*$/);
    if (box) {
      const kind = box[1] ? "alert" : "info";
      const buf = [];
      i++;
      while (i < lines.length && !/^:::\s*$/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push(`<div class="msg msg-${kind}">${renderMarkdown(buf.join("\n")).html}</div>`);
      continue;
    }

    // 見出し
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const text = h[2].trim();
      const id = slugify(text, usedIds);
      if (level === 2 || level === 3) toc.push({ level, text, id });
      out.push(`<h${level} id="${esc(id)}">${inline(text)}</h${level}>`);
      i++;
      continue;
    }

    // 区切り線
    if (/^(-{3,}|\*{3,})\s*$/.test(line)) { out.push("<hr />"); i++; continue; }

    // 引用
    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ""));
      out.push(`<blockquote>${renderMarkdown(buf.join("\n")).html}</blockquote>`);
      continue;
    }

    // 表（|---|---| の行があるものだけ表として扱う）
    if (/^\|/.test(line) && /^\|[\s:|-]+\|\s*$/.test(lines[i + 1] || "")) {
      const cells = (row) => row.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const head = cells(line);
      i += 2;
      const body = [];
      while (i < lines.length && /^\|/.test(lines[i])) body.push(cells(lines[i++]));
      const th = head.map((c) => `<th>${inline(c)}</th>`).join("");
      const tr = body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("");
      out.push(`<div class="table-scroll"><table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>`);
      continue;
    }

    // 箇条書き・番号つき
    const bullet = line.match(/^\s*([-*+]|\d+\.)\s+/);
    if (bullet) {
      const ordered = /\d/.test(bullet[1]);
      const items = [];
      while (i < lines.length) {
        const m = lines[i].match(/^\s*(?:[-*+]|\d+\.)\s+(.*)$/);
        if (!m) break;
        const buf = [m[1]];
        i++;
        // ぶら下がりの続き行（インデントされた行）を同じ項目に含める
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*(?:[-*+]|\d+\.)\s+/.test(lines[i])) {
          buf.push(lines[i++].trim());
        }
        items.push(`<li>${inline(buf.join(" "))}</li>`);
      }
      out.push(ordered ? `<ol>${items.join("")}</ol>` : `<ul>${items.join("")}</ul>`);
      continue;
    }

    paragraph();
  }

  return { html: out.join("\n"), toc };
}

/** 段落の途中で切るべき行かどうか */
function isBlockStart(line) {
  return /^(#{1,4}\s|```|>|\s*(?:[-*+]|\d+\.)\s|\||:::|(-{3,}|\*{3,})\s*$)/.test(line);
}

/**
 * front matter（先頭の --- で挟んだ部分）を切り出す。
 * YAMLは使わない。`key: value` と `key: [a, b]` だけ読む。
 */
export function parseFrontMatter(text) {
  const src = String(text).replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const m = src.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { meta: {}, body: src };

  const meta = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([\w-]+)\s*:\s*(.*)$/);
    if (!kv) continue;
    let value = kv[2].trim().replace(/^["']|["']$/g, "");
    if (/^\[.*\]$/.test(value)) {
      value = value.slice(1, -1).split(",").map((v) => v.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
    } else if (value === "true" || value === "false") {
      value = value === "true";
    }
    meta[kv[1]] = value;
  }
  return { meta, body: src.slice(m[0].length) };
}

/** 本文の頭から、一覧に出す抜粋を作る */
export function excerpt(body, length = 90) {
  const text = String(body)
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^:::.*$/gm, "")
    .replace(/^#{1,4}\s+.*$/gm, "")
    .replace(/^\|.*$/gm, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*`>#~-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > length ? `${text.slice(0, length)}…` : text;
}

/** 本文から読了時間を出す。日本語は1分600字で数える */
export function readingMinutes(body) {
  const chars = String(body).replace(/\s+/g, "").length;
  return Math.max(1, Math.round(chars / 600));
}
