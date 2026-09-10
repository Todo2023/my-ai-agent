/*
  IPROSリード仕分け ── 中身

  やっていること（ぜんぶブラウザの中だけ）
    1. CSVを読む（Shift_JIS / UTF-8 のどちらでも）
    2. どの列が「会社名・担当者・メール・DL資料・日時」かを決める
    3. 除外・重複・既存を判定して、4つの束に分ける
    4. それぞれをCSVとして保存する

  外へは何も送らない。fetch も XMLHttpRequest も使っていない。
  localStorage に残すのは「除外する会社名リスト」と「列の対応」だけで、
  読み込んだCSVの中身（会社名・メールアドレス）は一切保存しない。
*/

'use strict';

/* ══ CSVを読む ══ */

// 引用符・改行入りのセルに耐える素朴なパーサ。
// Excel/Pardot が吐くCSV（RFC4180 相当）を想定している。
function parseCsv(text){
  const rows = [];
  let row = [], cell = '', quoted = false;

  for (let i = 0; i < text.length; i++){
    const c = text[i];

    if (quoted){
      if (c === '"'){
        if (text[i + 1] === '"'){ cell += '"'; i++; }   // "" は " 一文字
        else quoted = false;
      } else cell += c;
      continue;
    }

    if (c === '"'){ quoted = true; }
    else if (c === ','){ row.push(cell); cell = ''; }
    else if (c === '\r'){ /* 次の \n にまかせる */ }
    else if (c === '\n'){ row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }

  // 空行を落とす
  return rows.filter(r => r.some(v => v.trim() !== ''));
}

// 文字コードは選ばせない。UTF-8 として読めなければ Shift_JIS とみなす。
// IPROS も Pardot も、日本語環境だと Shift_JIS で出てくることがある。
function decode(buf){
  const bytes = new Uint8Array(buf);
  try {
    const t = new TextDecoder('utf-8', { fatal:true }).decode(bytes);
    return t.charCodeAt(0) === 0xFEFF ? t.slice(1) : t;   // BOMを落とす
  } catch (e){
    return new TextDecoder('shift_jis').decode(bytes);
  }
}

function readCsvFile(file){
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error('ファイルを読めませんでした'));
    r.onload  = () => {
      const rows = parseCsv(decode(r.result));
      if (!rows.length) { reject(new Error('中身が空です')); return; }
      resolve({ head: rows[0].map(h => h.trim()), body: rows.slice(1) });
    };
    r.readAsArrayBuffer(file);
  });
}

/* ══ 表記ゆれをならす ══ */

// 全角英数を半角に、カタカナの濁点などもそろえる。
function nfkc(s){ return (s || '').normalize('NFKC'); }

// メールは「小文字にして前後の空白を取る」だけ。
// ドット無視やプラス以降の切り落としはしない（別人を同一人物にしてしまうため）。
function normEmail(s){ return nfkc(s).trim().toLowerCase(); }

const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

// 会社名の照合用。法人格・空白・記号を落として比べる。
//   「株式会社ニクニ」「(株)ニクニ」「ニクニ　」→ どれも「ニクニ」
function normCompany(s){
  return nfkc(s)
    .toLowerCase()
    .replace(/株式会社|有限会社|合同会社|合資会社|合名会社|一般社団法人|公益社団法人|一般財団法人|公益財団法人/g, '')
    .replace(/\(株\)|\(有\)|㈱|㈲/g, '')
    .replace(/co\.,?\s*ltd\.?|corporation|corp\.?|inc\.?|ltd\.?|k\.k\.?/g, '')
    .replace(/[\s・･,.。、\-‐－―ー_/\\]/g, '');
}

/* ══ 仕分け ══ */

const COLS = [
  { key:'company', label:'会社名',   required:true,  hints:['会社','企業','法人','company','organization','account'] },
  { key:'name',    label:'担当者',   required:false, hints:['担当','氏名','名前','name','contact'] },
  { key:'email',   label:'メール',   required:true,  hints:['mail','メール','e-mail','アドレス'] },
  { key:'doc',     label:'DL資料',   required:false, hints:['資料','ダウンロード','download','カタログ','コンテンツ'] },
  { key:'date',    label:'日時',     required:false, hints:['日時','日付','date','time','登録','取得'] },
];

// ヘッダの文字から、それらしい列をあてる。外したら画面で直せる。
function guessColumn(head, col){
  const lower = head.map(h => nfkc(h).toLowerCase());
  // 「メールアドレス」を「担当者名」より先に取りたいので、限定的な語から順に見る
  for (const hint of col.hints){
    const i = lower.findIndex(h => h.includes(hint));
    if (i >= 0) return i;
  }
  return -1;
}

// 日時の新旧を比べる。読めない書式は「古い」扱いにして、読める行を優先して残す。
function timeOf(v){
  const t = Date.parse(nfkc(v || '').replace(/[年月]/g, '/').replace(/日/, ''));
  return Number.isNaN(t) ? -Infinity : t;
}

/**
 * @param {{head:string[], body:string[][]}} ipros    IPROSから出したCSV
 * @param {Set<string>|null} known                   Pardotに既にいるメール（正規化済み）
 * @param {Object} map                               列の対応（COLS の key → 列番号）
 * @param {string[]} ngWords                         除外する会社名
 */
function sortLeads(ipros, known, map, ngWords){
  const ng = ngWords.map(normCompany).filter(Boolean);

  const out = { fresh:[], exists:[], excluded:[], invalid:[] };
  const seen = new Map();   // メール → out.fresh / out.exists 内の行

  for (const raw of ipros.body){
    const pick = k => (map[k] >= 0 ? (raw[map[k]] || '').trim() : '');
    const rec = {
      company: pick('company'),
      name:    pick('name'),
      email:   normEmail(pick('email')),
      doc:     pick('doc'),
      date:    pick('date'),
      reason:  '',
    };

    // ① メールが無い・壊れている → 人が見る束へ
    if (!EMAIL_RE.test(rec.email)){
      rec.reason = rec.email ? 'メールの形式が不正' : 'メールが空';
      out.invalid.push(rec);
      continue;
    }

    // ② 競合・代理店の除外（会社名の部分一致）
    const c = normCompany(rec.company);
    const hit = c ? ng.find(w => c.includes(w) || w.includes(c)) : null;
    if (hit){
      rec.reason = '除外リストに一致（' + hit + '）';
      out.excluded.push(rec);
      continue;
    }

    // ③ CSVの中での重複 → 日時が新しいほうを残す
    const dup = seen.get(rec.email);
    if (dup){
      if (timeOf(rec.date) > timeOf(dup.rec.date)){
        dup.rec.company = rec.company || dup.rec.company;
        dup.rec.name    = rec.name    || dup.rec.name;
        dup.rec.doc     = [dup.rec.doc, rec.doc].filter(Boolean).join(' / ');
        dup.rec.date    = rec.date;
      } else if (rec.doc && !dup.rec.doc.includes(rec.doc)){
        dup.rec.doc = [dup.rec.doc, rec.doc].filter(Boolean).join(' / ');
      }
      dup.dups++;
      continue;
    }

    // ④ Pardotに既にいるか
    const bucket = (known && known.has(rec.email)) ? out.exists : out.fresh;
    bucket.push(rec);
    seen.set(rec.email, { rec, dups:0 });
  }

  const merged = [...seen.values()].reduce((n, v) => n + v.dups, 0);
  return { ...out, merged, total: ipros.body.length, checkedAgainstPardot: !!known };
}

/* ══ CSVとして書き出す ══ */

const HEADERS = ['会社名','担当者','メールアドレス','DL資料','日時','リードソース'];

function toCsv(rows, withReason){
  const head = withReason ? [...HEADERS, '理由'] : HEADERS;
  const esc  = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const line = r => {
    const cells = [r.company, r.name, r.email, r.doc, r.date, 'IPROS'];
    if (withReason) cells.push(r.reason);
    return cells.map(esc).join(',');
  };
  // Excelで開いたときに文字化けしないよう BOM を付ける
  return '﻿' + [head.map(esc).join(','), ...rows.map(line)].join('\r\n') + '\r\n';
}

function download(name, text){
  const url = URL.createObjectURL(new Blob([text], { type:'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function stamp(){
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}
