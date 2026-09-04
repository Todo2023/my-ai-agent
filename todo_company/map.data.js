/*
 * 地図の中身だけを置くファイル。
 *
 * ページ（map.js）と、Obsidian への書き出し（obsidian_export.py）の
 * 両方がここを読む。中身を足したり直したりするのは、このファイルだけでよい。
 *
 *   NODES ... 丸。id / cat（種類）/ r（大きさ）/ label / body / src / sure / post
 *   LINKS ... 線。[丸のid, 丸のid]
 */
(function (root) {
  'use strict';

// 会社のFacebookページ。いまのところ、ここが発信の場所
var FB_URL = 'https://www.facebook.com/profile.php?id=61553259485518';

// 丸の種類。色は CSS 変数から取る（凡例と必ず同じ色になる）
var CATS = {
  center: { name: 'brain',   label: '真ん中' },
  co:     { name: 'co',      label: '会社' },
  biz:    { name: 'biz',     label: '事業' },
  think:  { name: 'think',   label: '考え方' },
  next:   { name: 'next',    label: 'これから' },
  fact:   { name: 'fact',    label: '会社のこと' },
  blank:  { name: 'blank',   label: 'まだ白い' },
  src:    { name: 'src',     label: '出どころ' }
};

// どこまで確かな話か。丸の sure に入れる（省略時は src があれば site、無ければ guess）
var SURE = {
  site:  { label: 'サイトから', note: 'ホームページの文言をもとにしています' },
  chat:  { label: '直接きいた', note: 'やりとりの中で本人から聞いたことです' },
  guess: { label: 'こちらの補い', note: 'まだ確かめていません。違っていたら直します' }
};

// ---------------------------------------------------------------
// 地図の中身
// ---------------------------------------------------------------
var NODES = [
  { id: 'me', sure: 'chat', cat: 'center', r: 28, label: '辰巳彩香',
    body: 'この地図の真ん中。頭の中にあるものを、丸にして並べています。いまは合同会社To doと、これからやってみたいこと（こども教育）が入っている。そのほかはまだ空のまま。丸はドラッグで動かせます。' },

  { id: 'todo', cat: 'co', r: 22, label: '合同会社To do',
    body: '2023年10月に始めた会社。頭の中でいちばん大きい場所で、この下に事業も考え方も事務もぶら下がっている。「誰の担当でもないまま溜まっていく仕事」を引き受ける会社。',
    src: '新サイトの文言確認用プレビュー', post: true },

  /* 会社のほかにあるところ。まだ何も聞いていないので、空のまま置いてある */
  { id: 'q1', sure: 'guess', cat: 'blank', r: 12, label: '仕事のほかに時間を使っていること',
    body: 'まだ聞いていません。教えてもらえれば、ここが埋まって、下に丸が増えます。',
    waiting: 'まだ中身が無いので、投稿文は作っていません。教えてもらえれば、ここが埋まって、下に丸が増えます。' },
  { id: 'q2', sure: 'chat', cat: 'next', r: 15, label: 'これからやってみたいこと',
    body: 'いま出ているのは、こども（幼児）教育の事業。ほかにも出てくれば、ここに並べていける。' },
  { id: 'q3', sure: 'guess', cat: 'blank', r: 12, label: 'いま気になっていること',
    body: 'まだ聞いていません。頭の隅に居座っていることがあれば、ここに置けます。',
    waiting: 'まだ中身が無いので、投稿文は作っていません。教えてもらえれば、ここが埋まって、下に丸が増えます。' },

  /* これからやってみたいこと。まだ「やってみたい」以上のことは聞いていない */
  { id: 'kids', sure: 'chat', cat: 'next', r: 18, label: 'こども（幼児）教育',
    body: '幼児向けの教育を、合同会社To doでやってみたい。いま出ているのはここまでで、'
      + '誰にどんな形で届けるかは、これから決めるところ。',
    waiting: '形が決まっていないので、投稿文はまだ作っていません。中身が決まれば、ここからも発信できます。' },
  { id: 'k1', sure: 'guess', cat: 'blank', r: 10, label: '誰に届けるか',
    body: 'こども本人か、保護者か、園や施設か。相手が決まると、形も値段も決まってくる。',
    waiting: 'まだ中身が無いので、投稿文は作っていません。決めるところから。決まれば、ここに書けます。' },
  { id: 'k2', sure: 'guess', cat: 'blank', r: 10, label: 'どんな形で届けるか',
    body: '教室、教材、アプリ、園向けの研修。どれで出すかはまだ決まっていない。',
    waiting: 'まだ中身が無いので、投稿文は作っていません。決めるところから。決まれば、ここに書けます。' },
  { id: 'k3', sure: 'guess', cat: 'blank', r: 10, label: 'いまの4事業のどれを使うか',
    body: '資料づくり・デザイン・事務・AI活用のうち、どれがそのまま活きるか。ゼロから始めるのか、'
      + '今ある手を伸ばすのかで、進め方が変わる。',
    waiting: 'まだ中身が無いので、投稿文は作っていません。決めるところから。決まれば、ここに書けます。' },

  /* 考え方 ---------------------------------------------------- */
  { id: 'core', cat: 'think', r: 19, label: '誰の担当でもない仕事',
    body: '会社の中で「誰の担当でもないまま溜まっていく仕事」を引き受けている。会社のいちばん真ん中にあるのはこれ。',
    src: '会社概要', post: true },
  { id: 'small-start', cat: 'think', r: 13, label: '小さく始められる',
    body: '月に数時間ぶんの依頼から受ける。まず1つ困っていることを預かって、合いそうなら範囲を広げる。',
    src: 'トップ「依頼しやすい理由」', post: true },
  { id: 'one-door', cat: 'think', r: 13, label: '窓口はひとつ',
    body: '資料もデザインも事務もAIも同じ窓口。複数の外注先に同じ背景を説明し直す手間を、相手に持たせない。',
    src: 'トップ「依頼しやすい理由」', post: true },
  { id: 'dogfood', cat: 'think', r: 14, label: '自分たちで使ってから勧める',
    body: '請求書の自動作成や議事録の共有は、まず自社の業務で仕組みを作った。使ってみて手応えのあったものだけを人に勧める。',
    src: 'トップ・会社概要', post: true },
  { id: 'small-strong', cat: 'think', r: 13, label: '大きくないことが強み',
    body: '規模が小さいぶん窓口が分かれない。取引先の事情を覚えたまま続けられることを、いちばんの価値だと考えている。',
    src: '会社概要', post: true },

  /* 事業 ------------------------------------------------------ */
  { id: 'doc', cat: 'biz', r: 18, label: '営業・販促資料の作成',
    body: '伝わらない資料を、意思決定が進む資料に作り直す。たたき台 → 打ち合わせ → 納品。「何を載せるか決まっていない」段階から入れる。',
    src: '事業内容', post: true },
  { id: 'doc1', cat: 'biz', r: 7, label: '構成案の設計から' },
  { id: 'doc2', cat: 'biz', r: 7, label: '既存資料の作り直し' },
  { id: 'doc3', cat: 'biz', r: 7, label: 'PowerPoint等で納品' },

  { id: 'design', cat: 'biz', r: 18, label: 'ロゴ・名刺などのデザイン',
    body: '会社の顔になるものを、一式そろえて整える。ロゴと名刺をセットで頼まれることが多く、トーンを揃えたまま他のツールへ広げられる。',
    src: '事業内容', post: true },
  { id: 'des1', cat: 'biz', r: 7, label: 'ロゴ・名刺・印刷物' },
  { id: 'des2', cat: 'biz', r: 7, label: '複数案の提示' },
  { id: 'des3', cat: 'biz', r: 7, label: '入稿データで納品' },

  { id: 'back', cat: 'biz', r: 18, label: '秘書・バックオフィス代行',
    body: '月額で、事務まわりを継続的に預かる。単発の外注ではなく、社内の一員として動くことを重んじている。',
    src: '事業内容', post: true },
  { id: 'bk1', cat: 'biz', r: 7, label: '日程調整・連絡代行' },
  { id: 'bk2', cat: 'biz', r: 7, label: '資料整理' },
  { id: 'bk3', cat: 'biz', r: 8, label: '請求書発行などの経理事務' },

  { id: 'ai', cat: 'biz', r: 18, label: 'AI活用・業務自動化の支援',
    body: '「AIで何ができるか」を、その会社の業務に当てはめて考える。ツールを入れて終わりにせず、実際の業務フローに載るところまで付き添う。',
    src: '事業内容', post: true },
  { id: 'course', sure: 'chat', cat: 'biz', r: 14, label: 'AI講座',
    body: 'AIの講座をやっている、と伺ったところまで。回ごとの題目や講座録はまだ受け取っていないので、'
      + 'この丸はいまのところ見出しだけ。資料か講座録をもらえれば、回ごとに丸を分けて、'
      + '話した内容そのものを地図に載せられる。',
    waiting: '中身がまだ無いので、投稿文は作っていません。講座録や資料をもらえれば、回ごとに書けます。' },
  { id: 'ai1', cat: 'biz', r: 7, label: '生成AIの導入と使い方の整理' },
  { id: 'ai2', cat: 'biz', r: 7, label: '定型業務の自動化' },
  { id: 'ai3', cat: 'biz', r: 7, label: '人が見る線引きの設計' },

  /* 会社の形 -------------------------------------------------- */
  { id: 'shape', sure: 'guess', cat: 'fact', r: 14, label: '会社の形',
    body: '地図の縮尺にあたるところ。会社概要から。', src: '会社概要' },
  { id: 'f1', cat: 'fact', r: 9, label: '創業 2023年10月' },
  { id: 'f2', cat: 'fact', r: 9, label: '札幌市厚別区' },
  { id: 'f3', cat: 'fact', r: 9, label: 'T4011603004093',
    body: '適格請求書発行事業者の登録番号。', src: '会社概要' },
  { id: 'f4', cat: 'fact', r: 9, label: '平日 9:00〜18:00' },
  { id: 'contact', cat: 'fact', r: 12, label: '連絡先',
    body: 'TEL 070-9136-4879 ／ todo.inc.2023.10.13@gmail.com。相談と見積りは無料で、2営業日以内に返信。打ち合わせはオンラインでも。',
    src: 'お問い合わせ', post: true },
  { id: 'fb', sure: 'chat', cat: 'fact', r: 12, label: 'Facebookページ',
    body: '会社のFacebookページ。いまのところ、発信の出口はここ。丸から作った投稿文をコピーして、ここに貼る。',
    link: FB_URL, linkLabel: 'Facebookページを開く' },
  { id: 'news', cat: 'fact', r: 10, label: 'サイトを新しくした',
    body: '2026年8月7日、ホームページをリニューアル。事業内容を4つに整理し、それぞれ何を引き受けられるのかを具体的に書いた。',
    src: 'お知らせ', post: true },

  /* まだ白いところ -------------------------------------------- */
  { id: 'blank', sure: 'guess', cat: 'blank', r: 15, label: 'まだ白いところ',
    body: 'ホームページには書かれていない部分。ここは請求書を読まないと埋まらない。請求書（発行したぶんの一覧でも可）が入れば、下の4つが数字で埋まり、地図の丸の大きさも実際の比率に描き直せる。',
    waiting: 'まだ中身が無いので、投稿文は作っていません。請求書が入れば、ここも発信できる中身になります。' },
  { id: 'b1', sure: 'guess', cat: 'blank', r: 10, label: '取引先の顔ぶれ',
    body: 'どんな業種・規模の会社と、何社くらい続いているか。',
    waiting: 'まだ中身が無いので、投稿文は作っていません。請求書が入れば、ここも発信できる中身になります。' },
  { id: 'b2', sure: 'guess', cat: 'blank', r: 10, label: '継続とスポットの割合',
    body: '月額の継続支援と、単発の制作。どちらが体重を支えているか。',
    waiting: 'まだ中身が無いので、投稿文は作っていません。請求書が入れば、ここも発信できる中身になります。' },
  { id: 'b3', sure: 'guess', cat: 'blank', r: 10, label: '忙しくなる月',
    body: '請求の波。手が足りなくなる時期がいつ来るか。',
    waiting: 'まだ中身が無いので、投稿文は作っていません。請求書が入れば、ここも発信できる中身になります。' },
  { id: 'b4', sure: 'guess', cat: 'blank', r: 10, label: '事業ごとの実際の大きさ',
    body: '売上で見たとき、この地図の4つの丸はどんな大きさになるか。',
    waiting: 'まだ中身が無いので、投稿文は作っていません。請求書が入れば、ここも発信できる中身になります。' },

  /* 出どころ -------------------------------------------------- */
  { id: 's-top', cat: 'src', r: 8, label: 'トップ' },
  { id: 's-biz', cat: 'src', r: 8, label: '事業内容' },
  { id: 's-com', cat: 'src', r: 8, label: '会社概要' },
  { id: 's-news', cat: 'src', r: 7, label: 'お知らせ' },
  { id: 's-ct', cat: 'src', r: 7, label: 'お問い合わせ' }
];

var LINKS = [
  /* 頭の中には、会社と、これからのことと、まだ聞いていない場所がある */
  ['me', 'todo'], ['me', 'q1'], ['me', 'q2'], ['me', 'q3'],

  /* こども教育は、やってみたいことであり、会社でやること */
  ['q2', 'kids'], ['kids', 'todo'],
  ['kids', 'k1'], ['kids', 'k2'], ['kids', 'k3'],

  /* 会社の下にぶら下がっているもの */
  ['todo', 'core'], ['todo', 'doc'], ['todo', 'design'], ['todo', 'back'],
  ['todo', 'ai'], ['todo', 'shape'], ['todo', 'blank'],

  ['core', 'small-start'], ['core', 'one-door'], ['core', 'dogfood'], ['core', 'small-strong'],

  ['doc', 'doc1'], ['doc', 'doc2'], ['doc', 'doc3'],
  ['design', 'des1'], ['design', 'des2'], ['design', 'des3'],
  ['back', 'bk1'], ['back', 'bk2'], ['back', 'bk3'],
  ['ai', 'course'], ['course', 'dogfood'],
  ['ai', 'ai1'], ['ai', 'ai2'], ['ai', 'ai3'],

  ['shape', 'f1'], ['shape', 'f2'], ['shape', 'f3'], ['shape', 'f4'],
  ['shape', 'contact'], ['shape', 'news'],
  ['todo', 'fb'], ['fb', 'contact'], ['fb', 'news'],

  ['blank', 'b1'], ['blank', 'b2'], ['blank', 'b3'], ['blank', 'b4'],

  /* 意味のつながり。請求書は、まだ白いところの入口でもある */
  ['bk3', 'blank'], ['bk3', 'f3'],
  ['dogfood', 'ai'], ['one-door', 'back'], ['small-start', 'doc'],

  /* 出どころ */
  ['s-top', 'small-start'], ['s-top', 'one-door'], ['s-top', 'dogfood'],
  ['s-biz', 'doc'], ['s-biz', 'design'], ['s-biz', 'back'], ['s-biz', 'ai'],
  ['s-com', 'core'], ['s-com', 'small-strong'], ['s-com', 'shape'],
  ['s-news', 'news'], ['s-ct', 'contact']
];

  var DATA = { FB_URL: FB_URL, CATS: CATS, SURE: SURE, NODES: NODES, LINKS: LINKS };

  // ブラウザからは window.MAP_DATA、node からは require() で読む
  if (typeof module !== 'undefined' && module.exports) module.exports = DATA;
  else root.MAP_DATA = DATA;
})(typeof self !== 'undefined' ? self : this);
