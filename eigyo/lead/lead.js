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

/* ══ xlsx を読む（ライブラリなし） ══ */

/*
  IPROSの出力は .xlsx で落ちてくる。CSVに保存し直してもらう手間を省くため、
  ここで直接開く。外部ライブラリは使わない（このリポジトリは外部の読み込みをしない）。

  xlsx の実体は zip。ブラウザに入っている DecompressionStream で展開し、
  中の XML を DOMParser で読む。どちらも標準機能。
*/

// zip の中から要るファイルだけ取り出す
async function unzip(buf, wanted){
  const dv = new DataView(buf), u8 = new Uint8Array(buf);
  const out = {};

  // 末尾から End of Central Directory を探す
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= 0 && i > buf.byteLength - 66000; i--){
    if (dv.getUint32(i, true) === 0x06054b50){ eocd = i; break; }
  }
  if (eocd < 0) throw new Error('xlsxとして読めません（zipの形をしていない）');

  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  if (p === 0xFFFFFFFF) throw new Error('この xlsx は大きすぎて開けません（ZIP64）');

  for (let n = 0; n < count; n++){
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method  = dv.getUint16(p + 10, true);
    const zipped  = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen= dv.getUint16(p + 30, true);
    const cmtLen  = dv.getUint16(p + 32, true);
    const local   = dv.getUint32(p + 42, true);
    const name    = new TextDecoder('utf-8').decode(u8.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + cmtLen;

    if (!wanted.some(w => name === w || (w.endsWith('/') && name.startsWith(w)))) continue;

    // ローカルヘッダを見て、本体の開始位置を出す
    const ln = dv.getUint16(local + 26, true), le = dv.getUint16(local + 28, true);
    const from = local + 30 + ln + le;
    const raw  = u8.subarray(from, from + zipped);

    if (method === 0){
      out[name] = new TextDecoder('utf-8').decode(raw);
    } else if (method === 8){
      const ds = new DecompressionStream('deflate-raw');
      const blob = await new Response(new Blob([raw]).stream().pipeThrough(ds)).arrayBuffer();
      out[name] = new TextDecoder('utf-8').decode(new Uint8Array(blob));
    } else {
      throw new Error('xlsxの中身が未対応の形式です');
    }
  }
  return out;
}

// A1 形式の「列」部分を 0 始まりの番号に直す（AB → 27）
function colOf(ref){
  let n = 0;
  for (const ch of ref){
    const c = ch.charCodeAt(0);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n - 1;
}

function xmlDoc(text){
  const d = new DOMParser().parseFromString(text, 'application/xml');
  if (d.querySelector('parsererror')) throw new Error('xlsxの中身を読めませんでした');
  return d;
}

async function readXlsx(buf){
  const files = await unzip(buf, ['xl/sharedStrings.xml', 'xl/worksheets/sheet1.xml']);
  const sheetXml = files['xl/worksheets/sheet1.xml'];
  if (!sheetXml) throw new Error('1枚目のシートが見つかりません');

  // 共有文字列（xlsxは文字を1ヶ所にまとめて持つ）
  const shared = [];
  if (files['xl/sharedStrings.xml']){
    for (const si of xmlDoc(files['xl/sharedStrings.xml']).getElementsByTagName('si')){
      // リッチテキストは <t> が複数に割れているのでつなぐ
      shared.push([...si.getElementsByTagName('t')].map(t => t.textContent).join(''));
    }
  }

  const rows = [];
  for (const row of xmlDoc(sheetXml).getElementsByTagName('row')){
    const cells = [];
    for (const c of row.getElementsByTagName('c')){
      const at = colOf(c.getAttribute('r') || '');
      const t  = c.getAttribute('t');
      let v = '';
      if (t === 'inlineStr'){
        v = [...c.getElementsByTagName('t')].map(x => x.textContent).join('');
      } else {
        const node = c.getElementsByTagName('v')[0];
        const raw = node ? node.textContent : '';
        v = (t === 's') ? (shared[Number(raw)] ?? '') : raw;
      }
      const i = at >= 0 ? at : cells.length;
      while (cells.length < i) cells.push('');
      cells[i] = v;
    }
    rows.push(cells);
  }
  return rows.filter(r => r.some(v => (v || '').trim() !== ''));
}

/* ══ 見出しの行を探す ══ */

/*
  IPROSの出力は、1行目から表が始まらない。上に検索条件が18行ほど並んでいて、
  19行目に見出しが来る（2026-09の実物で確認）。行数は出力条件で変わるはずなので、
  「いちばん列が埋まっている行」を見出しとみなす。
*/
function splitHeader(rows){
  const filled = r => r.filter(v => (v || '').trim() !== '').length;
  let best = 0, bestN = 0;
  for (let i = 0; i < Math.min(rows.length, 40); i++){
    const n = filled(rows[i]);
    if (n > bestN){ bestN = n; best = i; }
  }
  if (bestN < 1) throw new Error('表の見出しが見つかりませんでした');
  // skipped … 見出しより上にあった行の数（IPROSの場合は検索条件）
  return { head: rows[best].map(h => (h || '').trim()), body: rows.slice(best + 1), skipped: best };
}

/* ══ ファイルを開く ══ */

// 文字コードは選ばせない。UTF-8 として読めなければ Shift_JIS とみなす。
function decode(buf){
  const bytes = new Uint8Array(buf);
  try {
    const t = new TextDecoder('utf-8', { fatal:true }).decode(bytes);
    return t.charCodeAt(0) === 0xFEFF ? t.slice(1) : t;   // BOMを落とす
  } catch (e){
    return new TextDecoder('shift_jis').decode(bytes);
  }
}

function readTable(file){
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error('ファイルを読めませんでした'));
    r.onload  = async () => {
      try {
        const isXlsx = /\.xlsx$/i.test(file.name) || new Uint8Array(r.result, 0, 2)[0] === 0x50;
        if (isXlsx && typeof DecompressionStream !== 'function'){
          throw new Error('このブラウザではxlsxを開けません。Excelで「CSV UTF-8」として保存し直してください');
        }
        const rows = isXlsx ? await readXlsx(r.result) : parseCsv(decode(r.result));
        if (!rows.length) throw new Error('中身が空です');
        resolve(splitHeader(rows));
      } catch (e){ reject(e); }
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
  // exact … 見出しがこの文字そのものなら、それを選ぶ（IPROSの実物に合わせてある）
  // hints … 見つからないときの部分一致。avoid に当たる見出しは選ばない
  { key:'company', label:'会社名', required:true,
    exact:['会社名'], hints:['会社','企業','法人','company','account'], avoid:/事業所/ },
  { key:'name',    label:'担当者（姓）', required:false,
    exact:['姓'], hints:['担当','氏名','name'], avoid:/ふりがな|かな|会社|事業所/ },
  { key:'name2',   label:'担当者（名）', required:false,
    exact:['名'], hints:[], avoid:/ふりがな|かな|会社|事業所|氏/ },
  { key:'email',   label:'メール', required:true,
    exact:['メールアドレス'], hints:['mail','メール','e-mail','アドレス'] },
  { key:'doc',     label:'DL資料', required:false,
    exact:['ファイル項目','項目'], hints:['資料','ダウンロード','download','カタログ','ファイル'], avoid:/数$/ },
  { key:'date',    label:'日付', required:false,
    exact:['引き合い日'], hints:['日付','date','登録日','取得日'], avoid:/時刻|受付/ },
  { key:'time',    label:'時刻', required:false,
    exact:['引き合い時刻'], hints:['時刻','time'], avoid:/受付/ },
  { key:'member',  label:'会員区分', required:false,
    exact:['イプロス会員区分'], hints:['会員区分','会員','ステータス'] },
  // IPROSの時点で分かっている意向。Pardotのカスタムフィールドに入れて、
  // Day14を待たずに営業へ回す判断に使う
  { key:'motive',  label:'動機', required:false,
    exact:['コメント【動機】'], hints:['動機','motive'] },
  { key:'urgency', label:'至急度', required:false,
    exact:['コメント【至急度】'], hints:['至急','緊急','urgen'] },
];

// 「いますぐ営業が見るべき行」か。IPROSが付けてくれた値をそのまま使う。
function isHot(rec){
  return nfkc(rec.urgency || '').includes('至急')
      || nfkc(rec.motive  || '').includes('具体的検討');
}

// ヘッダの文字から、それらしい列をあてる。外したら画面で直せる。
function guessColumn(head, col){
  const norm = head.map(h => nfkc(h).trim());

  // まず完全一致。「名」が「会社名」に吸われるのを防ぐため、ここを先に見る
  for (const want of (col.exact || [])){
    const i = norm.indexOf(want);
    if (i >= 0) return i;
  }

  const lower = norm.map(h => h.toLowerCase());
  for (const hint of col.hints){
    const i = lower.findIndex((h, n) => h.includes(hint) && !(col.avoid && col.avoid.test(norm[n])));
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
 * @param {Map<string,{opted:boolean,segment:string}>|null} known
 *        Pardotに既にいる人。メール（正規化済み）→ オプトアウトの有無・導入先セグメント
 * @param {Object} map                               列の対応（COLS の key → 列番号）
 * @param {string[]} ngWords                         除外する会社名
 */
function sortLeads(ipros, known, map, ngWords){
  const ng = ngWords.map(normCompany).filter(Boolean);

  const out = { fresh:[], exists:[], excluded:[], invalid:[], optout:[] };
  const seen = new Map();   // メール → out.fresh / out.exists 内の行

  for (const raw of ipros.body){
    const pick = k => (map[k] >= 0 ? (raw[map[k]] || '').trim() : '');
    const rec = {
      company: pick('company'),
      // IPROSは姓と名が別の列。つなげて1つにする
      name:    [pick('name'), pick('name2')].filter(Boolean).join(' '),
      email:   normEmail(pick('email')),
      doc:     pick('doc'),
      // 日付と時刻も別の列。重複の新旧を比べるのにどちらも要る
      date:    [pick('date'), pick('time')].filter(Boolean).join(' '),
      motive:  pick('motive'),
      urgency: pick('urgency'),
      reason:  '',
    };

    // ① メールが無い・壊れている → 人が見る束へ
    if (!EMAIL_RE.test(rec.email)){
      rec.reason = rec.email ? 'メールの形式が不正' : 'メールが空';
      out.invalid.push(rec);
      continue;
    }

    // ② 退会済みは配信対象にしない（IPROSを退会した人にステップメールを送らない）
    const member = pick('member');
    if (member && nfkc(member).includes('退会')){
      rec.reason = 'イプロスを退会済み';
      out.excluded.push(rec);
      continue;
    }

    // ③ 競合・代理店の除外（会社名の部分一致）
    const c = normCompany(rec.company);
    const hit = c ? ng.find(w => c.includes(w) || w.includes(c)) : null;
    if (hit){
      rec.reason = '除外リストに一致（' + hit + '）';
      out.excluded.push(rec);
      continue;
    }

    // ④ 表の中での重複 → 日時が新しいほうを残す
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
      // 何度も来ている人は、1回でも「至急」「具体的検討」があればそちらを採る
      if (!isHot(dup.rec) && isHot(rec)){
        dup.rec.motive = rec.motive; dup.rec.urgency = rec.urgency;
      }
      dup.dups++;
      continue;
    }

    // ⑤ Pardotに既にいるか。いるなら、向こうが持っている情報で判定を足す
    const pro = known ? known.get(rec.email) : null;
    let bucket;
    if (!pro){
      bucket = out.fresh;
    } else if (pro.opted){
      // Pardot側で配信停止している人。ここを間違えると法律の問題になる
      rec.reason = 'Pardotでオプトアウト済み';
      bucket = out.optout;
    } else if (nfkc(pro.segment || '').includes('代理店')){
      // 岩田さんの「代理店除外」は、Pardot側が既にタグ付けしている
      rec.reason = '導入先セグメントが「' + pro.segment + '」';
      bucket = out.excluded;
    } else {
      bucket = out.exists;
    }
    bucket.push(rec);
    seen.set(rec.email, { rec, dups:0 });
  }

  const merged = [...seen.values()].reduce((n, v) => n + v.dups, 0);

  // 束を分けるのではなく、新規と既存の中から抜き出した一覧。
  // Pardotへの入れ方は変えず、営業の見る順番だけを変えるため。
  out.hot = [...out.fresh, ...out.exists].filter(isHot);

  return { ...out, merged, total: ipros.body.length, checkedAgainstPardot: !!known };
}

/* ══ CSVとして書き出す ══ */

const HEADERS = ['会社名','担当者','メールアドレス','DL資料','日時','動機','至急度','リードソース'];

// Pardot側の Source フィールドで既に使われている表記に合わせる。
// 「IPROS」と書くと、既存の292件と別の値になって集計が割れる（2026-09-11 確認）。
const LEAD_SOURCE = 'イプロス';

function toCsv(rows, withReason){
  const head = withReason ? [...HEADERS, '理由'] : HEADERS;
  const esc  = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const line = r => {
    const cells = [r.company, r.name, r.email, r.doc, r.date, r.motive, r.urgency, LEAD_SOURCE];
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
