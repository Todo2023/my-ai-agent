/**
 * Googleフォームの回答を Supabase の members テーブルへ書き込む Apps Script。
 *
 * 設置手順:
 *  1. フォームの回答スプレッドシートを開き、拡張機能 > Apps Script でこのファイルを貼る
 *  2. プロジェクトの設定 > スクリプト プロパティ に次の2つを登録する
 *       SUPABASE_URL          https://xxxx.supabase.co
 *       SUPABASE_SERVICE_KEY  service_role キー
 *     ※ service_role キーはフォームやページ側には絶対に置かないこと
 *  3. installTrigger() を1度だけ実行する（フォーム送信時トリガーが入る）
 *
 * QUESTIONS の左側は、フォームの質問文と完全に一致させること。
 * 質問文を変えたらここも直す（一致しないと、その項目が空で登録される）。
 */

const QUESTIONS = {
  nickname: 'ニックネーム',
  email: 'メールアドレス',
  pet_name: 'ペットのお名前',
  pet_type: 'ペットの種類',
  breed: '犬種・猫種',
  pet_age: 'ペットの年齢',
  personality_tags: 'ペットの性格（複数選択可）',
  concern_tags: '悩んでいること（複数選択可）',
  area: 'お住まいのエリア（都道府県・市区町村）',
  default_post_type: '物語の作り方（あとから変更できます）',
};

/** 「物語の作り方」の選択肢を A / B / C に対応させる。選択肢の文言を変えたらここも直す。 */
const POST_TYPE_CHOICES = [
  { keyword: '一言', value: 'A' },   // 一言を書く（AIがふくらませます）
  { keyword: '質問', value: 'B' },   // 毎日の質問に答える
  { keyword: '写真', value: 'C' },   // 写真を送る
];

function installTrigger() {
  const form = FormApp.openByUrl(
    SpreadsheetApp.getActiveSpreadsheet().getFormUrl()
  );
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'onFormSubmit') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  ScriptApp.newTrigger('onFormSubmit').forForm(form).onFormSubmit().create();
}

function onFormSubmit(event) {
  const answers = {};
  event.response.getItemResponses().forEach(function (item) {
    answers[item.getItem().getTitle().trim()] = item.getResponse();
  });

  const member = {
    nickname: text(answers[QUESTIONS.nickname]),
    email: text(answers[QUESTIONS.email]).toLowerCase(),
    pet_name: text(answers[QUESTIONS.pet_name]),
    pet_type: petType(answers[QUESTIONS.pet_type]),
    breed: text(answers[QUESTIONS.breed]),
    pet_age: number(answers[QUESTIONS.pet_age]),
    personality_tags: tags(answers[QUESTIONS.personality_tags]),
    concern_tags: tags(answers[QUESTIONS.concern_tags]),
    area: text(answers[QUESTIONS.area]),
    default_post_type: postType(answers[QUESTIONS.default_post_type]),
  };

  if (!member.email || !member.nickname || !member.pet_type || !member.pet_name) {
    // 必須項目が欠けた回答は送らない。Supabase側の not null で弾かれるより、
    // ここでログに残したほうが原因が分かる
    console.error('必須項目が空のため登録しませんでした: ' + JSON.stringify(member));
    return;
  }

  upsertMember(member);
}

function upsertMember(member) {
  const properties = PropertiesService.getScriptProperties();
  const url = properties.getProperty('SUPABASE_URL');
  const key = properties.getProperty('SUPABASE_SERVICE_KEY');
  if (!url || !key) {
    throw new Error('スクリプト プロパティ SUPABASE_URL / SUPABASE_SERVICE_KEY が未設定です。');
  }

  const response = UrlFetchApp.fetch(url.replace(/\/$/, '') + '/rest/v1/members', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + key,
      // 同じメールアドレスで再登録されたらプロフィールを上書きする
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    payload: JSON.stringify(member),
    muteHttpExceptions: true,
  });

  const status = response.getResponseCode();
  if (status >= 400) {
    throw new Error('Supabaseへの登録に失敗しました（' + status + '）: ' + response.getContentText());
  }
}

function text(value) {
  return value == null ? '' : String(value).trim();
}

function number(value) {
  const found = text(value).match(/\d+(\.\d+)?/);
  return found ? Number(found[0]) : null;
}

/** チェックボックスは配列、記述式は「しつけ、留守番」のような文字列で来る。 */
function tags(value) {
  const items = Array.isArray(value) ? value : text(value).split(/[,、\/・\n]+/);
  const seen = [];
  items.forEach(function (item) {
    const tag = text(item);
    if (tag && seen.indexOf(tag) === -1) {
      seen.push(tag);
    }
  });
  return seen;
}

/** 未回答・不明なときは方式B（質問に答える）。いちばん投稿ハードルが低い。 */
function postType(value) {
  const answer = text(value);
  for (var i = 0; i < POST_TYPE_CHOICES.length; i++) {
    if (answer.indexOf(POST_TYPE_CHOICES[i].keyword) !== -1) {
      return POST_TYPE_CHOICES[i].value;
    }
  }
  return 'B';
}

function petType(value) {
  const answer = text(value);
  if (answer.indexOf('犬') !== -1 || answer.toLowerCase().indexOf('dog') !== -1) {
    return 'dog';
  }
  if (answer.indexOf('猫') !== -1 || answer.toLowerCase().indexOf('cat') !== -1) {
    return 'cat';
  }
  return '';
}
