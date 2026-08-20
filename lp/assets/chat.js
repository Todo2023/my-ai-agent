/*
 * えほんとコード AIアシスタント「ほしの」
 *
 * 現在はFAQ照合型で動作します(外部通信なし・APIキー不要・費用ゼロ)。
 * 将来Claude APIに接続する場合は、下の EHON_CHAT_CONFIG.endpoint に
 * 中継用エンドポイント(Cloudflare Workers等)のURLを設定してください。
 * endpoint が設定されると、FAQで答えられなかった質問だけがそこへ送られます。
 * ブラウザにAPIキーを直接置くことは絶対にしないでください(誰でも見られます)。
 */
(function (global) {
  'use strict';

  var EHON_CHAT_CONFIG = {
    endpoint: null,                                   // 例: 'https://xxx.workers.dev/chat'
    contactEmail: '【問い合わせ用メールアドレスを記入】',
    assistantName: 'ほしの'
  };

  /* ===== アバター ===== */
  function avatar(size) {
    return '<svg viewBox="0 0 64 64" role="img" aria-label="AIアシスタント ほしの" focusable="false" style="width:' +
      size + 'px;height:' + size + 'px">' +
      '<circle cx="32" cy="32" r="31" fill="#22304d" stroke="#F2B84B" stroke-width="2"/>' +
      '<circle cx="14" cy="16" r="1.6" fill="#fff" opacity=".8"/>' +
      '<circle cx="50" cy="14" r="1.2" fill="#fff" opacity=".7"/>' +
      '<circle cx="52" cy="44" r="1.4" fill="#fff" opacity=".6"/>' +
      '<path d="M44 12a10 10 0 1 0 8 16 12 12 0 0 1-8-16Z" fill="#F2B84B"/>' +
      '<path d="M16 34q16-9 32 0v14q-16-8-32 0Z" fill="#FAF6EF"/>' +
      '<path d="M32 30v22" stroke="#D8CDB2" stroke-width="1.6"/>' +
      '<circle cx="25" cy="41" r="1.9" fill="#2B2418"/>' +
      '<circle cx="39" cy="41" r="1.9" fill="#2B2418"/>' +
      '<path d="M29 45q3 2.6 6 0" stroke="#2B2418" stroke-width="1.6" fill="none" stroke-linecap="round"/>' +
      '</svg>';
  }

  /* ===== FAQ ===== */
  var GREETING =
    'こんにちは。「えほんとコード」のアシスタント、ほしのです。\n' +
    '講座のことで気になることがあれば、なんでも聞いてくださいね。';

  var PRIVACY_NOTE = 'お子さまのお名前・園名など、個人が特定できる情報は入力しないでください。';

  var FAQ = [
    {
      id: 'install',
      keywords: ['インストール', 'いんすとーる', 'install', '入れ方', '導入', 'セットアップ', '始め方', 'はじめ方'],
      answer: 'インストールは講座のステップ2で、WindowsとMacそれぞれの手順を画面つきで解説しています。\n' +
        'つまずきやすいところは動画でゆっくり進めているので、ひとつずつ真似していけば大丈夫です。\n\n' +
        '「ここで止まってしまった」という場所があれば、その画面に出ている文字を教えてください。',
      chips: ['Windowsの手順', 'Macの手順', 'エラーが出た']
    },
    {
      id: 'install-win',
      keywords: ['windows', 'ウィンドウズ', 'ウインドウズ', 'win11', 'win10'],
      answer: 'Windowsの場合は、講座のステップ2で解説しているとおりに進めてください。\n' +
        '「管理者として実行」を求められる場面と、途中でウィンドウが一瞬閉じる場面があり、ここでつまずく方が多いです。動画ではその2箇所をとくに詳しく説明しています。',
      chips: ['エラーが出た', 'パソコンが苦手です']
    },
    {
      id: 'install-mac',
      keywords: ['mac', 'マック', 'macbook', 'imac', 'ターミナル'],
      answer: 'Macの場合も、講座のステップ2に沿って進めてください。\n' +
        '「ターミナル」という黒い画面を使いますが、講座では文字をコピーして貼り付けるだけで進められるようにしています。',
      chips: ['エラーが出た', 'パソコンが苦手です']
    },
    {
      id: 'error',
      keywords: ['エラー', 'えらー', 'error', '動かない', 'うごかない', '進まない', 'すすまない', '失敗', 'できない', 'not found', '止まる', 'とまる'],
      answer: 'よくあるつまずきと対処法は、講座のステップ5(FAQ)にまとめています。\n\n' +
        'お手数ですが、次の2つを教えていただけると原因が絞りやすくなります。\n' +
        '・お使いのパソコン(WindowsかMacか)\n' +
        '・画面に出ているメッセージの文字\n\n' +
        'ここで解決できない場合は、下記までご連絡ください。\n' + '{{EMAIL}}',
      chips: ['Windowsの手順', 'Macの手順']
    },
    {
      id: 'beginner',
      keywords: ['苦手', 'にがて', '初心者', 'しょしんしゃ', '不安', 'ふあん', '難しい', 'むずかしい', 'ついていける', '知識がない', '自信がない'],
      answer: 'ご安心ください。この講座は、パソコンが得意でない方に向けて作っています。\n' +
        'プログラミングの知識は必要なく、日本語でAIに話しかけるだけです。\n\n' +
        '手順はすべて画面つきで解説していますし、進めていて分からなくなったら、いつでもここで質問してくださいね。',
      chips: ['何ができるようになりますか', '受講期限はありますか']
    },
    {
      id: 'smartphone',
      keywords: ['スマホ', 'すまほ', 'スマートフォン', 'iphone', 'android', 'タブレット', 'ipad', '携帯'],
      answer: '動画やテキスト教材は、スマホやタブレットでもご覧いただけます。\n\n' +
        'ただし、Claude Codeを実際に操作する部分は<strong>パソコン(Windows または Mac)が必要</strong>です。スマホだけでは実践できませんので、ご注意ください。',
      chips: ['動作環境を知りたい', '参加費はいくらですか']
    },
    {
      id: 'price',
      keywords: ['値段', 'ねだん', '価格', 'かかく', '料金', 'りょうきん', 'いくら', '参加費', '費用', '500', '円'],
      answer: '参加費は<strong>500円(税込・買い切り)</strong>です。追加の受講料はかかりません。\n\n' +
        'ひとつだけご注意ください。講座で使う「Claude Code」というツールそのものの利用には、提供元での登録と、別途料金がかかる場合があります。これは参加費には含まれていません。',
      chips: ['支払い方法は', '返金はできますか']
    },
    {
      id: 'extra-cost',
      keywords: ['追加料金', '別途', 'claude code', 'クロード', 'ツール代', 'サブスク', '月額'],
      answer: '講座の参加費は500円(税込)の買い切りで、これ以外に当方からご請求することはありません。\n\n' +
        'ただし「Claude Code」の利用には提供元(Anthropic社)でのアカウント登録が必要で、同社の定める料金が別途かかる場合があります。登録の流れは講座の中でもご案内しています。',
      chips: ['参加費はいくらですか', 'カリキュラムを教えて']
    },
    {
      id: 'payment',
      keywords: ['支払', 'しはらい', '決済', 'けっさい', 'クレジット', 'カード', '銀行', '振込', 'コンビニ'],
      answer: 'お支払いはクレジットカード決済のみとなります(決済代行: Stripe)。\n' +
        '銀行振込・コンビニ払いには対応しておりません。\n\n' +
        'カード番号は決済会社が直接お預かりするため、当方が取得・保管することはありません。',
      chips: ['領収書はもらえますか', '返金はできますか']
    },
    {
      id: 'receipt',
      keywords: ['領収書', 'りょうしゅうしょ', 'レシート', '明細', '経費'],
      answer: 'お支払い後に決済会社から届くメールが、お支払いの証明としてご利用いただけます。\n' +
        '別途の書面が必要な場合は、下記までご連絡ください。\n' + '{{EMAIL}}',
      chips: ['支払い方法は']
    },
    {
      id: 'refund',
      keywords: ['返金', 'へんきん', 'キャンセル', '解約', 'かいやく', '返品', 'クーリングオフ'],
      answer: '申し訳ありません。デジタルコンテンツという商品の性質上、<strong>購入後の返金・返品にはいかなる場合も対応できません</strong>。\n\n' +
        'お申し込み前に、ご不明な点をすべて解消していただけたらと思います。気になることがあれば、遠慮なく聞いてくださいね。\n\n' +
        'なお、二重に決済されてしまったなど、明らかな手続き上の不備があった場合は個別に対応いたします。',
      chips: ['動作環境を知りたい', '受講期限はありますか']
    },
    {
      id: 'deadline',
      keywords: ['期限', 'きげん', 'いつまで', '期間', '見返', 'みかえ', 'アーカイブ', '何度でも'],
      answer: '受講期限はありません。ご自身のペースで、何度でも見返していただけます。\n' +
        '寝かしつけのあとや、お子さんが園に行っている間など、空いた時間に少しずつ進めてくださいね。',
      chips: ['どのくらい時間がかかりますか', 'カリキュラムを教えて']
    },
    {
      id: 'duration',
      keywords: ['どのくらい', 'どれくらい', '時間', 'じかん', '何時間', '何日', 'ボリューム', '長さ'],
      answer: '全5ステップで、通してご覧いただくと2〜3時間ほどの内容です。\n' +
        '一気に進める必要はありません。1日1ステップずつでも大丈夫なように作っています。',
      chips: ['カリキュラムを教えて', '受講期限はありますか']
    },
    {
      id: 'curriculum',
      keywords: ['カリキュラム', '内容', 'ないよう', '何を', 'なにを', '学べ', 'まなべ', 'ステップ', '講座の中身', 'できるように'],
      answer: '全5ステップです。\n\n' +
        '1. Claude Codeって、なに?\n' +
        '2. 使えるようにする(インストール)\n' +
        '3. AIへの話しかけ方の「型」\n' +
        '4. 実践:わが子の絵本を作ってみる\n' +
        '5. 困ったときのFAQ\n\n' +
        '絵本づくりを題材にしながら、AIに指示を出す基本の操作が身につく内容です。',
      chips: ['どのくらい時間がかかりますか', '絵は描けなくても大丈夫?']
    },
    {
      id: 'drawing',
      keywords: ['絵', 'イラスト', '描け', 'かけ', '画力', '挿絵', '絵心'],
      answer: '絵を描くスキルは必要ありません。\n' +
        'この講座で扱うのは、絵本の<strong>文章と構成</strong>をAIと一緒に作るところまでです。\n\n' +
        '「絵も文章も自信がない」という方にこそ、試していただきたい内容です。',
      chips: ['印刷や製本はできますか', 'カリキュラムを教えて']
    },
    {
      id: 'print',
      keywords: ['印刷', 'いんさつ', '製本', 'せいほん', '本にする', '紙', 'プレゼント', '形に'],
      answer: '印刷・製本のサービスは講座に含まれていません。\n' +
        '作った文章をご家庭のプリンターで印刷したり、市販の製本サービスをお使いいただくことは、もちろん可能です。',
      chips: ['絵は描けなくても大丈夫?']
    },
    {
      id: 'privacy',
      keywords: ['個人情報', '名前を入れて', '子どもの名前', '安全', 'あんぜん', '情報漏', '名前を使'],
      answer: 'お子さんのお名前を使って物語を作ることはできますが、AIツールに入力した情報は、そのツールの提供元のサーバーで処理されます。\n\n' +
        '気になる場合は、実際のお名前ではなく<strong>愛称やニックネーム</strong>を使うのがおすすめです。\n\n' +
        'なお、このチャットでも' + PRIVACY_NOTE,
      chips: ['プライバシーポリシーを見たい']
    },
    {
      id: 'delivery',
      keywords: ['届か', '届き', '届いて', 'とどか', 'とどき', 'メールが来', 'メールがこ', '購入したのに', '見られない', 'ログイン', 'アクセスできない', '教材はどこ', '受け取れ'],
      answer: 'ご不便をおかけしております。\n\n' +
        'まず、迷惑メールフォルダをご確認ください。ご案内のメールが振り分けられていることがあります。\n\n' +
        '30分以上経っても見当たらない場合は、お手数ですが下記までご連絡ください。ご入金を確認のうえ、すぐにご案内します。\n' + '{{EMAIL}}',
      chips: ['支払い方法は']
    },
    {
      id: 'requirements',
      keywords: ['動作環境', '必要なもの', '準備', 'じゅんび', 'スペック', 'パソコンは', '持ち物'],
      answer: 'ご用意いただくものは次の2つです。\n\n' +
        '・インターネットにつながるパソコン(Windows または Mac)\n' +
        '・メールアドレス\n\n' +
        '高性能なパソコンである必要はありません。ふだんお使いのもので大丈夫です。',
      chips: ['スマホでも受講できますか', 'パソコンが苦手です']
    },
    {
      id: 'monitor',
      keywords: ['モニター', 'もにたー', '先行', '募集', '体験'],
      answer: '正式公開に向けて、先行モニターの方を少人数募集しています。\n' +
        'ご興味があれば、SNSのDMからお気軽にご連絡ください。',
      chips: ['カリキュラムを教えて']
    },
    {
      id: 'legal',
      keywords: ['特定商取引', '特商法', '運営', '会社', '事業者', '責任者', '住所', '電話'],
      answer: '運営者情報は「特定商取引法に基づく表記」のページに掲載しています。\n' +
        'ページ下部のリンクからご確認ください。\n\n' +
        '所在地・電話番号・代表者氏名については、ご請求があった場合に遅滞なく開示いたします。',
      chips: ['プライバシーポリシーを見たい']
    },
    {
      id: 'privacy-policy',
      keywords: ['プライバシーポリシー', '個人情報の扱い', '規約', 'きやく'],
      answer: '個人情報の取り扱いについては、ページ下部の「プライバシーポリシー」からご確認いただけます。\n\n' +
        'クレジットカード番号は決済会社が直接お預かりするため、当方が取得・保管することはありません。',
      chips: ['支払い方法は']
    },
    {
      id: 'greeting',
      keywords: ['こんにちは', 'こんばんは', 'おはよう', 'はじめまして', 'hello', 'よろしく'],
      answer: 'こんにちは。ご覧いただきありがとうございます。\n' +
        '講座のことで気になることがあれば、なんでも聞いてくださいね。',
      chips: ['カリキュラムを教えて', '参加費はいくらですか', 'パソコンが苦手です']
    },
    {
      id: 'thanks',
      keywords: ['ありがとう', 'ありがと', '助かり', 'たすかり', 'わかりました', '了解'],
      answer: 'お役に立てたならよかったです。\n' +
        'ほかにも気になることがあれば、いつでも聞いてくださいね。',
      chips: []
    }
  ];

  var DEFAULT_CHIPS = ['カリキュラムを教えて', '参加費はいくらですか', 'パソコンが苦手です', '返金はできますか'];

  function fallbackAnswer() {
    return 'ごめんなさい、その質問にはうまくお答えできませんでした。\n\n' +
      'お手数ですが、下記までご連絡いただけますか。順番にお返事いたします。\n' + '{{EMAIL}}\n\n' +
      'よろしければ、下のボタンからも選べます。';
  }

  /* ===== 照合 ===== */
  function normalize(text) {
    return String(text).toLowerCase().replace(/[　\s]+/g, '');
  }

  function findAnswer(input) {
    var text = normalize(input);
    if (!text) return null;
    var best = null, bestScore = 0;
    for (var i = 0; i < FAQ.length; i++) {
      var entry = FAQ[i], score = 0;
      for (var k = 0; k < entry.keywords.length; k++) {
        var kw = normalize(entry.keywords[k]);
        if (kw && text.indexOf(kw) !== -1) score += kw.length;
      }
      if (score > bestScore) { bestScore = score; best = entry; }
    }
    return best;
  }

  /* ===== 描画 ===== */
  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // 回答文中の <strong> だけは装飾として通し、メールアドレスはリンクにする
  function renderText(text) {
    var email = EHON_CHAT_CONFIG.contactEmail;
    var isPlaceholder = email.indexOf('【') === 0;
    var mail = isPlaceholder
      ? escapeHtml(email)
      : '<a href="mailto:' + escapeHtml(email) + '">' + escapeHtml(email) + '</a>';
    return escapeHtml(text)
      .replace(/\{\{EMAIL\}\}/g, mail)
      .replace(/&lt;strong&gt;/g, '<strong>')
      .replace(/&lt;\/strong&gt;/g, '</strong>');
  }

  function Chat(root, options) {
    this.root = root;
    this.embedded = !!(options && options.embedded);
    this.build();
  }

  Chat.prototype.build = function () {
    var self = this;
    this.root.classList.add('ehon-chat');
    if (this.embedded) this.root.classList.add('ehon-chat-embed');

    var panel = document.createElement('div');
    panel.className = 'ehon-chat-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'AIアシスタント ほしの');
    if (!this.embedded) panel.hidden = true;

    panel.innerHTML =
      '<div class="ehon-chat-header">' + avatar(40) +
        '<div><div class="ehon-chat-title">アシスタント ' + EHON_CHAT_CONFIG.assistantName + '</div>' +
        '<div class="ehon-chat-status">24時間受付・自動応答です</div></div>' +
        '<button type="button" class="ehon-chat-close" aria-label="チャットを閉じる">&times;</button>' +
      '</div>' +
      '<div class="ehon-chat-log" role="log" aria-live="polite"></div>' +
      '<div class="ehon-chips"></div>' +
      '<form class="ehon-chat-form">' +
        '<input type="text" class="ehon-chat-input" placeholder="質問を入力してください" ' +
          'aria-label="質問を入力" autocomplete="off">' +
        '<button type="submit" class="ehon-chat-send">送信</button>' +
      '</form>' +
      '<p class="ehon-chat-note">' + PRIVACY_NOTE + '</p>';

    this.panel = panel;
    this.log = panel.querySelector('.ehon-chat-log');
    this.chips = panel.querySelector('.ehon-chips');
    this.form = panel.querySelector('.ehon-chat-form');
    this.input = panel.querySelector('.ehon-chat-input');

    this.form.addEventListener('submit', function (e) {
      e.preventDefault();
      var value = self.input.value.trim();
      if (!value) return;
      self.input.value = '';
      self.ask(value);
    });

    panel.querySelector('.ehon-chat-close').addEventListener('click', function () { self.close(); });

    if (!this.embedded) {
      var launcher = document.createElement('button');
      launcher.type = 'button';
      launcher.className = 'ehon-chat-launcher';
      launcher.innerHTML = avatar(34) + '<span>質問する</span>';
      launcher.addEventListener('click', function () { self.open(); });
      this.launcher = launcher;
      this.root.appendChild(launcher);
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && !panel.hidden) self.close();
      });
    }

    this.root.appendChild(panel);
    this.say(GREETING);
    this.setChips(DEFAULT_CHIPS);
  };

  Chat.prototype.open = function () {
    this.panel.hidden = false;
    if (this.launcher) this.launcher.hidden = true;
    this.input.focus();
  };

  Chat.prototype.close = function () {
    this.panel.hidden = true;
    if (this.launcher) { this.launcher.hidden = false; this.launcher.focus(); }
  };

  Chat.prototype.append = function (who, html) {
    var msg = document.createElement('div');
    msg.className = 'ehon-msg ' + who;
    msg.innerHTML = (who === 'bot' ? avatar(32) : '') +
      '<div class="ehon-msg-bubble">' + html + '</div>';
    this.log.appendChild(msg);
    this.log.scrollTop = this.log.scrollHeight;
    return msg;
  };

  Chat.prototype.say = function (text) { this.append('bot', renderText(text)); };

  Chat.prototype.setChips = function (labels) {
    var self = this;
    this.chips.innerHTML = '';
    (labels || []).forEach(function (label) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'ehon-chip';
      chip.textContent = label;
      chip.addEventListener('click', function () { self.ask(label); });
      self.chips.appendChild(chip);
    });
  };

  Chat.prototype.ask = function (question) {
    var self = this;
    this.append('user', escapeHtml(question));
    this.setChips([]);

    var typing = this.append('bot', '考えています…');
    typing.classList.add('typing');

    this.resolve(question).then(function (result) {
      typing.remove();
      self.say(result.answer);
      self.setChips(result.chips && result.chips.length ? result.chips : DEFAULT_CHIPS);
    });
  };

  // FAQで答えられた場合はその場で返し、答えられずendpointがある場合だけ外部に問い合わせる
  Chat.prototype.resolve = function (question) {
    var hit = findAnswer(question);
    if (hit) {
      return new Promise(function (resolve) {
        setTimeout(function () { resolve({ answer: hit.answer, chips: hit.chips }); }, 400);
      });
    }
    if (!EHON_CHAT_CONFIG.endpoint) {
      return Promise.resolve({ answer: fallbackAnswer(), chips: DEFAULT_CHIPS });
    }
    return fetch(EHON_CHAT_CONFIG.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: question })
    })
      .then(function (res) {
        if (!res.ok) throw new Error('bad status');
        return res.json();
      })
      .then(function (data) {
        return { answer: data.answer || fallbackAnswer(), chips: DEFAULT_CHIPS };
      })
      .catch(function () {
        return { answer: fallbackAnswer(), chips: DEFAULT_CHIPS };
      });
  };

  global.EhonChat = {
    config: EHON_CHAT_CONFIG,
    mount: function (selectorOrNode, options) {
      var node = typeof selectorOrNode === 'string'
        ? document.querySelector(selectorOrNode) : selectorOrNode;
      if (!node) return null;
      return new Chat(node, options);
    }
  };
}(window));
