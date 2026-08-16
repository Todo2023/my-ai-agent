/**
 * worker.js の動作確認。Cloudflare にも Gemini にも Google にも接続しない。
 * KV と Gemini の応答を差し替えて、保存・上書き・検証の判断だけを確かめる。
 *
 *   node test_worker.mjs
 */

import worker from './worker.js';
const kv = new Map();
const env = { GEMINI_API_KEY: 'test-key', DIET: { get: async (k) => kv.get(k) ?? null, put: async (k, v) => void kv.set(k, v) } };
const post = (path, body) => worker.fetch(new Request('https://x.dev' + path, {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body)}), env);
const get = (path) => worker.fetch(new Request('https://x.dev' + path), env);
let bad = 0;
const ok = (label, cond, extra='') => { if (!cond) { bad++; console.error('✗', label, extra); } };

let res = await get('/'); const html = await res.text();
ok('page 200', res.status === 200); ok('page has title', html.includes('ふたりの体重帳')); ok('page has fetch api', html.includes('function api('));
res = await get('/manifest.webmanifest'); ok('manifest json', JSON.parse(await res.text()).short_name === '体重帳');
res = await get('/sw.js'); ok('sw served', (await res.text()).includes('addEventListener'));
res = await get('/icon-192.png'); ok('icon png', res.headers.get('content-type') === 'image/png' && (await res.arrayBuffer()).byteLength === 944);
res = await get('/nope'); ok('404', res.status === 404);

res = await post('/api/state', {}); let s = await res.json();
ok('state default people', s.people.length === 2 && s.people[0].name === '夫' && s.people[0].goal === null, JSON.stringify(s.people));
ok('today format', /^\d{4}-\d{2}-\d{2}$/.test(s.today), s.today);

res = await post('/api/record', {person:0, date:'2026-08-16', weight:62.44, fat:18.2, source:'ocr', note:'テスト'});
let r = await res.json();
ok('saved', r.state.records.length === 1 && r.state.records[0].weight === 62.4 && r.overwritten === false, JSON.stringify(r.state.records));
res = await post('/api/record', {person:0, date:'2026-08-16', weight:63.0});
r = await res.json();
ok('overwrite same day', r.overwritten === true && r.state.records.length === 1 && r.state.records[0].weight === 63);
res = await post('/api/record', {person:0, date:'2026-08-16', weight:624});
ok('range rejected', res.status === 400 && (await res.json()).error.includes('範囲'));
res = await post('/api/record', {person:1, date:'8/16', weight:52});
ok('bad date rejected', res.status === 400);

res = await post('/api/person', {index:1, name:'はなこ', goal:52.5});
s = await res.json(); ok('person set', s.people[1].name === 'はなこ' && s.people[1].goal === 52.5, JSON.stringify(s.people[1]));
res = await post('/api/person', {index:1, name:'はなこ', goal:''});
s = await res.json(); ok('goal cleared to null', s.people[1].goal === null);

res = await post('/api/delete', {person:0, date:'2026-08-16'});
s = await res.json(); ok('deleted', s.records.length === 0);

// 合言葉つき
const env2 = { ...env, APP_PIN: 'abc123' };
res = await worker.fetch(new Request('https://x.dev/api/state', {method:'POST', body: JSON.stringify({})}), env2);
ok('pin required', res.status === 401 && (await res.json()).error.includes('合言葉'));
res = await worker.fetch(new Request('https://x.dev/api/state', {method:'POST', body: JSON.stringify({pin:'abc123'})}), env2);
ok('pin accepted', res.status === 200);

// 写真の読み取り（Geminiの応答を差し替えて検証だけ確かめる）
const realFetch = globalThis.fetch;
globalThis.fetch = async () => new Response(JSON.stringify({candidates:[{content:{parts:[{text:'{"weight_kg":624,"body_fat_pct":null,"raw_text":"624","confidence":0.8}'}]}}]}), {status:200});
res = await post('/api/read', {image:'AAAA', mimeType:'image/jpeg', person:0});
let reading = await res.json();
ok('decimal repaired', reading.weight === 62.4 && reading.warnings.some(w => w.includes('小数点')) && reading.needsCheck === true, JSON.stringify(reading));
globalThis.fetch = async () => new Response('{"error":{"code":404}}', {status:404});
res = await post('/api/read', {image:'AAAA', person:0});
reading = await res.json();
ok('model 404 falls back to manual', reading.weight === null && reading.warnings[0].includes('読み取りに失敗'), JSON.stringify(reading));
globalThis.fetch = realFetch;

console.log(bad ? bad + '件失敗' : 'すべて通りました');
process.exit(bad ? 1 : 0);
