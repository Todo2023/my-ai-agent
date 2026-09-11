/*
  IPROSリード仕分け ── 画面

  lead.js の関数を呼ぶだけ。判定そのものはここには書かない。
*/

'use strict';

const $ = id => document.getElementById(id);

const NG_KEY  = 'todo.lead.ng';
const MAP_KEY = 'todo.lead.map';

let ipros = null;   // { head, body }
let pardot = null;  // { head, body }
let result = null;

/* ── 除外リスト（この端末に残る） ── */

function loadNg(){
  try { return localStorage.getItem(NG_KEY) || ''; } catch (e){ return ''; }
}
function saveNg(v){
  try { localStorage.setItem(NG_KEY, v); } catch (e){ /* 保存できなくても使える */ }
}
function ngWords(){
  return $('ng').value.split('\n').map(s => s.trim()).filter(Boolean);
}

/* ── 列の対応 ── */

function drawMapping(){
  const box = $('map');
  box.innerHTML = '';
  if (!ipros) { $('mapBox').classList.remove('show'); return; }

  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(MAP_KEY) || '{}'); } catch (e){ /* 無視 */ }

  for (const col of COLS){
    // 前に使った列名が同じ位置にあればそれを、無ければ推測を初期値にする
    let idx = -1;
    if (saved[col.key] != null){
      idx = ipros.head.indexOf(saved[col.key]);
    }
    if (idx < 0) idx = guessColumn(ipros.head, col);

    const wrap = document.createElement('div');
    wrap.className = 'field';

    const label = document.createElement('label');
    label.htmlFor = 'col-' + col.key;
    label.textContent = col.label;
    if (col.required){
      const req = document.createElement('span');
      req.className = 'req';
      req.textContent = '必須';
      label.appendChild(req);
    }

    const sel = document.createElement('select');
    sel.id = 'col-' + col.key;
    sel.dataset.key = col.key;
    const none = document.createElement('option');
    none.value = '-1';
    none.textContent = col.required ? '― 選んでください ―' : '― 使わない ―';
    sel.appendChild(none);
    ipros.head.forEach((h, i) => {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = h || `（名前のない列 ${i + 1}）`;
      if (i === idx) o.selected = true;
      sel.appendChild(o);
    });

    wrap.append(label, sel);
    box.appendChild(wrap);
  }
  $('mapBox').classList.add('show');
}

function currentMap(){
  const map = {};
  let missing = [];
  for (const col of COLS){
    const v = Number($('col-' + col.key).value);
    map[col.key] = v;
    if (col.required && v < 0) missing.push(col.label);
  }
  return { map, missing };
}

function saveMap(map){
  const named = {};
  for (const k of Object.keys(map)) if (map[k] >= 0) named[k] = ipros.head[map[k]];
  try { localStorage.setItem(MAP_KEY, JSON.stringify(named)); } catch (e){ /* 無視 */ }
}

/* ── ファイルを受け取る ── */

async function take(which, file, noteId){
  const note = $(noteId);
  if (!file){ return; }
  try {
    const data = await readTable(file);
    if (which === 'ipros'){ ipros = data; drawMapping(); }
    else { pardot = data; }
    note.className = 'note ok';
    note.textContent = `${file.name} … ${data.body.length}行（${data.head.length}列）`
      + (data.skipped ? `／見出しより上の${data.skipped}行（検索条件）は読み飛ばしました` : '');
  } catch (e){
    note.className = 'note ng';
    note.textContent = e.message;
  }
  $('out').classList.remove('show');
}

/* ── Pardot側の既存メールを集める ── */

function knownEmails(){
  if (!pardot) return null;
  // メールらしい列を自動で探す。見つからなければ全列からメール形式を拾う。
  const i = guessColumn(pardot.head, COLS.find(c => c.key === 'email'));
  const set = new Set();
  for (const row of pardot.body){
    if (i >= 0){
      const e = normEmail(row[i]);
      if (EMAIL_RE.test(e)) set.add(e);
    } else {
      for (const cell of row){
        const e = normEmail(cell);
        if (EMAIL_RE.test(e)) { set.add(e); break; }
      }
    }
  }
  return set;
}

/* ── 結果を出す ── */

const BUCKETS = [
  { key:'fresh',    title:'新規インポート用',   desc:'Pardotに新しく作る。リードソース=IPROS 付き', file:'ipros_shinki',  reason:false },
  { key:'exists',   title:'リスト追加のみ',     desc:'既にいる人。新規作成せず、リストに足すだけ',   file:'ipros_kizon',   reason:false },
  { key:'excluded', title:'除外（要目視）',     desc:'除外リストに当たった行。取り込む前に人が見る', file:'ipros_jogai',   reason:true  },
  { key:'invalid',  title:'メール不備（要目視）', desc:'メールが空、または形式が不正な行',           file:'ipros_fubi',    reason:true  },
];

function drawResult(){
  const box = $('sum');
  box.innerHTML = '';

  const line = (label, value, note) => {
    const li = document.createElement('li');
    const b = document.createElement('b');
    b.textContent = value;
    li.append(label + '：', b);
    if (note){
      const s = document.createElement('span');
      s.className = 'sub';
      s.textContent = note;
      li.appendChild(s);
    }
    box.appendChild(li);
  };

  line('読み込んだ行', `${result.total}行`);
  line('同じメールをまとめた', `${result.merged}行`, 'DL資料は「/」でつないである');
  for (const b of BUCKETS){
    const n = result[b.key].length;
    line(b.title, `${n}件`, b.key === 'exists' && !result.checkedAgainstPardot ? 'Pardot側のCSVが無いので、全部「新規」に入っている' : '');
  }

  const dl = $('dl');
  dl.innerHTML = '';
  for (const b of BUCKETS){
    const rows = result[b.key];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn ' + (b.key === 'fresh' ? 'btn-primary' : 'btn-ghost');
    btn.disabled = rows.length === 0;
    btn.textContent = `${b.title}（${rows.length}件）を保存`;
    btn.addEventListener('click', () => download(`${b.file}_${stamp()}.csv`, toCsv(rows, b.reason)));
    dl.appendChild(btn);
  }

  // 目視が要る2つは、画面でも中身が見えるようにしておく
  const peek = $('peek');
  peek.innerHTML = '';
  for (const b of BUCKETS.filter(b => b.reason)){
    const rows = result[b.key];
    if (!rows.length) continue;
    const h = document.createElement('h3');
    h.textContent = `${b.title} ${rows.length}件`;
    const ul = document.createElement('ul');
    ul.className = 'peek-list';
    for (const r of rows.slice(0, 50)){
      const li = document.createElement('li');
      li.textContent = `${r.company || '（会社名なし）'} / ${r.email || '（メールなし）'} … ${r.reason}`;
      ul.appendChild(li);
    }
    if (rows.length > 50){
      const li = document.createElement('li');
      li.className = 'sub';
      li.textContent = `ほか ${rows.length - 50}件。全部はCSVで見てください`;
      ul.appendChild(li);
    }
    peek.append(h, ul);
  }

  $('out').classList.add('show');
  $('out').scrollIntoView({ behavior:'smooth', block:'start' });
}

/* ── 起動 ── */

function init(){
  $('ng').value = loadNg();
  $('ng').addEventListener('input', e => saveNg(e.target.value));

  $('fIpros').addEventListener('change', e => take('ipros', e.target.files[0], 'nIpros'));
  $('fPardot').addEventListener('change', e => take('pardot', e.target.files[0], 'nPardot'));

  $('run').addEventListener('click', () => {
    const err = $('err');
    err.textContent = '';
    if (!ipros){ err.textContent = 'IPROSのCSVを選んでください。'; return; }
    const { map, missing } = currentMap();
    if (missing.length){ err.textContent = `${missing.join('・')} の列を選んでください。`; return; }
    saveMap(map);
    result = sortLeads(ipros, knownEmails(), map, ngWords());
    drawResult();
  });
}

document.addEventListener('DOMContentLoaded', init);
