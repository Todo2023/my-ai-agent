/**
 * ふたりの体重帳（Google Apps Script 版）
 *
 * スプレッドシートをデータベース、Apps Script を Web アプリとして使う。
 * 体重計の写真を Gemini に読ませ、数字をフォームに入れる。保存は人間が確認してから。
 *
 * すべて無料枠で動く（カード登録不要）。
 *   - Apps Script / スプレッドシート: Googleアカウントがあれば無料
 *   - Gemini API: Google AI Studio のキー。課金アカウントを紐付けなければ、
 *     使いすぎても請求ではなく 429 エラーで止まる
 *
 * セットアップ手順は README.md を参照。
 */

// ---- 設定 ----------------------------------------------------------------

var SHEET_RECORDS = '記録';
var SHEET_SETTINGS = '設定';
var DEFAULT_MODEL = 'gemini-3.6-flash';
var DEFAULT_NAMES = ['夫', '妻'];

// 体重計の表示としてありえる範囲。ここを外れた値は採用しない。
var W_MIN = 20, W_MAX = 250;
var F_MIN = 3, F_MAX = 60;
var JUMP_KG = 3; // 前回からこれ以上動いていたら読み間違いを疑う

var PROMPT = [
  'この画像は体重計（または体組成計）の表示部分です。表示されている数字をそのまま読み取り、',
  'JSONだけを返してください。説明文やコードブロックは付けないこと。',
  '',
  '{"weight_kg": 数値またはnull, "body_fat_pct": 数値またはnull, "raw_text": "画面に見えている文字", "confidence": 0.0〜1.0}',
  '',
  '- weight_kg: 「kg」と書かれている、いちばん大きい数字',
  '- body_fat_pct: 体脂肪率。表示が無ければ null',
  '- confidence: ぼやけている、桁が欠けて見える、どれが体重か判断できない場合は 0.5 未満にする',
  '',
  '小数点の位置に注意してください。体重計の表示はふつう小数第1位までです（例: 62.4）。',
  '推測で埋めないこと。読めない項目は null にし、confidence を下げてください。'
].join('\n');

// ---- Web アプリの入口 -----------------------------------------------------

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('ふたりの体重帳')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** スプレッドシートを開いたときのメニュー（動作確認用）。 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('体重帳')
    .addItem('セットアップを確認', 'checkSetup')
    .addItem('使えるモデルを一覧する', 'listModels')
    .addToUi();
}

function checkSetup() {
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty('GEMINI_API_KEY');
  var lines = [
    'APIキー: ' + (key ? '設定済み（末尾 ' + key.slice(-4) + '）' : '未設定 → スクリプト プロパティに GEMINI_API_KEY を入れてください'),
    'モデル: ' + (props.getProperty('GEMINI_MODEL') || DEFAULT_MODEL),
    '合言葉: ' + (props.getProperty('APP_PIN') ? '設定済み' : '未設定（URLを知っている人は誰でも開けます）'),
    'シート: ' + SHEET_RECORDS + ' / ' + SHEET_SETTINGS + ' を用意します'
  ];
  setup_();
  if (key) {
    try {
      callGemini_(PROMPT_TEST_IMAGE_(), 'image/png');
      lines.push('Gemini への接続: OK');
    } catch (e) {
      lines.push('Gemini への接続: 失敗 → ' + e.message);
    }
  }
  SpreadsheetApp.getUi().alert(lines.join('\n'));
}

/** 404 が出たときに、どのモデルへ移ればよいか調べる。 */
function listModels() {
  var key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!key) {
    SpreadsheetApp.getUi().alert('先に GEMINI_API_KEY を設定してください。');
    return;
  }
  var res = UrlFetchApp.fetch(
    'https://generativelanguage.googleapis.com/v1beta/models?key=' + encodeURIComponent(key),
    { muteHttpExceptions: true }
  );
  var body = JSON.parse(res.getContentText());
  var names = (body.models || [])
    .filter(function (m) { return (m.supportedGenerationMethods || []).indexOf('generateContent') >= 0; })
    .map(function (m) { return m.name.replace('models/', ''); });
  SpreadsheetApp.getUi().alert(names.length ? names.join('\n') : res.getContentText());
}

// ---- シートの準備 ---------------------------------------------------------

function setup_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var records = ss.getSheetByName(SHEET_RECORDS);
  if (!records) {
    records = ss.insertSheet(SHEET_RECORDS);
    records.appendRow(['だれ', 'ひづけ', '体重kg', '体脂肪%', '入力方法', 'ひとこと', '更新日時']);
    records.setFrozenRows(1);
    records.getRange('B:B').setNumberFormat('@'); // 日付を勝手に変換させない
  }
  var settings = ss.getSheetByName(SHEET_SETTINGS);
  if (!settings) {
    settings = ss.insertSheet(SHEET_SETTINGS);
    settings.appendRow(['番号', '名前', '目標体重kg']);
    settings.appendRow([0, DEFAULT_NAMES[0], '']);
    settings.appendRow([1, DEFAULT_NAMES[1], '']);
    settings.setFrozenRows(1);
  }
  return { records: records, settings: settings };
}

function ymd_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(value || '').trim();
}

function today_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

// ---- 合言葉 ---------------------------------------------------------------

/**
 * 合言葉（スクリプト プロパティ APP_PIN）。未設定なら誰でも使える。
 * URLさえ知られなければ十分、という運用でも構わないが、設定を推奨。
 */
function checkPin_(pin) {
  var expected = PropertiesService.getScriptProperties().getProperty('APP_PIN');
  if (!expected) return;
  if (String(pin || '') !== expected) throw new Error('合言葉が違います');
}

function needsPin() {
  return !!PropertiesService.getScriptProperties().getProperty('APP_PIN');
}

// ---- 読み出し -------------------------------------------------------------

function getState(pin) {
  checkPin_(pin);
  var sheets = setup_();
  var values = sheets.records.getDataRange().getValues().slice(1);
  var records = values
    .filter(function (row) { return row[1] !== '' && row[2] !== ''; })
    .map(function (row) {
      return {
        person: Number(row[0]) === 1 ? 1 : 0,
        date: ymd_(row[1]),
        weight: Number(row[2]),
        fat: row[3] === '' || row[3] === null ? null : Number(row[3]),
        source: String(row[4] || 'manual'),
        note: row[5] === '' ? null : String(row[5])
      };
    })
    .filter(function (r) { return r.date && !isNaN(r.weight); });

  var people = sheets.settings.getDataRange().getValues().slice(1).map(function (row, i) {
    return {
      name: String(row[1] || DEFAULT_NAMES[i] || ('ひと' + (i + 1))),
      goal: row[2] === '' || row[2] === null ? null : Number(row[2])
    };
  });
  while (people.length < 2) people.push({ name: DEFAULT_NAMES[people.length], goal: null });

  return { people: people.slice(0, 2), records: records, today: today_() };
}

// ---- 書き込み -------------------------------------------------------------

/** 同じ（だれ・ひづけ）があれば上書きする。朝夜の撮り直しで二重にならないように。 */
function saveRecord(pin, record) {
  checkPin_(pin);
  var person = Number(record.person) === 1 ? 1 : 0;
  var date = ymd_(record.date);
  var weight = Number(record.weight);
  var fat = record.fat === null || record.fat === '' ? null : Number(record.fat);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('日付の形式が違います');
  if (!(weight >= W_MIN && weight <= W_MAX)) throw new Error('体重が入力できる範囲（' + W_MIN + '〜' + W_MAX + 'kg）の外です');
  if (fat !== null && !(fat >= 1 && fat <= 70)) throw new Error('体脂肪率が入力できる範囲の外です');

  var lock = LockService.getDocumentLock();
  lock.waitLock(10000); // ふたりが同時に保存しても行が壊れないように
  try {
    var sheet = setup_().records;
    var values = sheet.getDataRange().getValues();
    var row = [
      person,
      date,
      Math.round(weight * 10) / 10,
      fat === null ? '' : Math.round(fat * 10) / 10,
      String(record.source || 'manual'),
      String(record.note || '').slice(0, 40),
      today_() + ' ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'HH:mm')
    ];
    var found = -1;
    for (var i = 1; i < values.length; i++) {
      if (Number(values[i][0]) === person && ymd_(values[i][1]) === date) { found = i + 1; break; }
    }
    if (found > 0) sheet.getRange(found, 1, 1, row.length).setValues([row]);
    else sheet.appendRow(row);
    return { overwritten: found > 0, state: getState(pin) };
  } finally {
    lock.releaseLock();
  }
}

function deleteRecord(pin, person, date) {
  checkPin_(pin);
  var lock = LockService.getDocumentLock();
  lock.waitLock(10000);
  try {
    var sheet = setup_().records;
    var values = sheet.getDataRange().getValues();
    for (var i = values.length - 1; i >= 1; i--) {
      if (Number(values[i][0]) === Number(person) && ymd_(values[i][1]) === ymd_(date)) {
        sheet.deleteRow(i + 1);
        break;
      }
    }
    return getState(pin);
  } finally {
    lock.releaseLock();
  }
}

function setPerson(pin, index, name, goal) {
  checkPin_(pin);
  var i = Number(index) === 1 ? 1 : 0;
  var value = goal === null || goal === '' ? '' : Number(goal);
  if (value !== '' && !(value >= W_MIN && value <= W_MAX)) value = '';
  var sheet = setup_().settings;
  sheet.getRange(i + 2, 1, 1, 3).setValues([[i, String(name || DEFAULT_NAMES[i]).slice(0, 8), value]]);
  return getState(pin);
}

// ---- 写真を読む -----------------------------------------------------------

/**
 * 写真1枚を Gemini に読ませ、検証済みの候補値を返す。ここでは保存しない。
 * 保存は人間が数字を確認してから saveRecord を呼ぶ。
 */
function readScale(pin, base64, mimeType, person) {
  checkPin_(pin);
  var reading;
  try {
    reading = parseReading_(callGemini_(base64, mimeType || 'image/jpeg'));
  } catch (e) {
    return { weight: null, fat: null, rawText: '', confidence: 0, warnings: ['読み取りに失敗しました（' + e.message + '）。手で入れてください'], needsCheck: true };
  }
  var previous = latestWeight_(pin, person);
  return validate_(reading, previous);
}

function callGemini_(base64, mimeType) {
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty('GEMINI_API_KEY');
  if (!key) throw new Error('GEMINI_API_KEY が未設定です');
  var model = props.getProperty('GEMINI_MODEL') || DEFAULT_MODEL;

  var payload = {
    contents: [{
      parts: [
        { inline_data: { mime_type: mimeType, data: base64 } },
        { text: PROMPT }
      ]
    }],
    generationConfig: { temperature: 0, response_mime_type: 'application/json' }
  };

  // 無料枠は 429 に当たりやすい。Web アプリの応答が止まらない程度に2回だけ待って再試行する。
  var waits = [0, 2000, 5000];
  var last = '';
  for (var i = 0; i < waits.length; i++) {
    if (waits[i]) Utilities.sleep(waits[i]);
    var res = UrlFetchApp.fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) +
      ':generateContent?key=' + encodeURIComponent(key),
      { method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true }
    );
    var code = res.getResponseCode();
    var text = res.getContentText();
    if (code === 200) {
      var body = JSON.parse(text);
      var parts = body.candidates && body.candidates[0] && body.candidates[0].content && body.candidates[0].content.parts;
      return (parts && parts[0] && parts[0].text) || '';
    }
    last = code + ' ' + text.slice(0, 200);
    if (code === 404) throw new Error('モデル ' + model + ' が使えません。スプレッドシートの「体重帳 > 使えるモデルを一覧する」で確認してください');
    if (code !== 429 && code !== 500 && code !== 503) throw new Error(last);
  }
  throw new Error('混み合っています（' + last + '）');
}

function parseReading_(text) {
  var cleaned = String(text || '').replace(/```json|```/g, '').trim();
  var data;
  try {
    data = JSON.parse(cleaned);
  } catch (e) {
    var match = cleaned.match(/\{[\s\S]*\}/);
    data = match ? JSON.parse(match[0]) : {};
  }
  var num = function (value) {
    if (value === null || value === undefined || value === '') return null;
    var n = Number(value);
    return isNaN(n) ? null : n;
  };
  return {
    weight: num(data.weight_kg),
    fat: num(data.body_fat_pct),
    rawText: String(data.raw_text || ''),
    confidence: Math.min(Math.max(num(data.confidence) || 0, 0), 1)
  };
}

function latestWeight_(pin, person) {
  var records = getState(pin).records
    .filter(function (r) { return r.person === (Number(person) === 1 ? 1 : 0); })
    .sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  return records.length ? records[records.length - 1].weight : null;
}

/**
 * モデルの出力を決定的にチェックする。値を書き換えるときは必ず理由を残す。
 * 黙って直すと、間違った補正に気づけなくなるため。
 */
function validate_(reading, previous) {
  var warnings = [];
  var weight = reading.weight;
  var fat = reading.fat;

  if (weight !== null) {
    // 「62.4」を「624」と読むのはよくある失敗。10で割って収まるなら直す。
    if (weight > W_MAX && weight / 10 >= W_MIN && weight / 10 <= W_MAX) {
      warnings.push(weight + ' を小数点の読み落としとみなして ' + (weight / 10) + 'kg に直しました。確かめてください');
      weight = weight / 10;
    }
    if (weight < W_MIN || weight > W_MAX) {
      warnings.push('読み取った体重 ' + weight + 'kg は範囲外です。手で入れてください');
      weight = null;
    }
  }
  if (fat !== null && (fat < F_MIN || fat > F_MAX)) {
    warnings.push('読み取った体脂肪率 ' + fat + '% は範囲外なので使いませんでした');
    fat = null;
  }
  if (weight === null && !warnings.length) {
    warnings.push('体重を読み取れませんでした。手で入れてください');
  }
  if (weight !== null && previous !== null && Math.abs(weight - previous) >= JUMP_KG) {
    var diff = weight - previous;
    warnings.push('前回 ' + previous + 'kg から ' + (diff > 0 ? '+' : '') + diff.toFixed(1) + 'kg 動いています。読み違いでないか確かめてください');
  }
  if (weight !== null && reading.confidence < 0.6) {
    warnings.push('読み取りの自信が低めです。数字が合っているか確かめてください');
  }

  return {
    weight: weight === null ? null : Math.round(weight * 10) / 10,
    fat: fat === null ? null : Math.round(fat * 10) / 10,
    rawText: reading.rawText,
    confidence: reading.confidence,
    warnings: warnings,
    needsCheck: warnings.length > 0 || weight === null || reading.confidence < 0.6
  };
}

/** 接続確認用の1x1画像（実際の写真は送らずに疎通だけ見る）。 */
function PROMPT_TEST_IMAGE_() {
  return 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
}
