/*
  街の中身

  ここだけ直せば、街の建物と人が変わる。町の描画や操作は town.js。

  ★ people の項目名は、登録フォーム（../index.html）や
    profiles テーブル（../../../supabase/schema.sql）と同じにしてある。
    あとで本物のデータに差し替えるとき、そのまま入る。

  ⚠️ ここに実在の人の情報を書かないこと。
     このリポジトリは公開されている。以下はすべて架空の人物。
*/

window.TOWN_DATA = {

  /* ── 建物 ──
     x,y は左上のマス。w,h はマス数。door は建物のどのマスが入口か。
     色は [壁, 屋根, 窓] */
  places: [
    { id:"lab",     name:"リサーチセンター",   x:2,  y:2,  w:7, h:5, door:[5,6],
      colors:["#8a93ad","#4a5570","#8fd3ff"],
      about:"大学や公設研究所の人が出入りしている。論文の話と、実用化の話が半分ずつ。" },

    { id:"factory", name:"ものづくり工房",     x:13, y:2,  w:7, h:5, door:[16,6],
      colors:["#a8886a","#6d5140","#ffd08a"],
      about:"試作と加工の現場。図面を持ち込むと、できるかどうかを即答してくれる。" },

    { id:"trade",   name:"商社ビル",           x:24, y:2,  w:8, h:5, door:[27,6],
      colors:["#7f8fb5","#465274","#cfe4ff"],
      about:"売り先を知っている人たちの階。国内も海外も、まず相場から入る。" },

    { id:"bank",    name:"しんきん銀行",       x:2,  y:10, w:6, h:5, door:[4,14],
      colors:["#b3ac8f","#6f6a52","#fff0b8"],
      about:"補助金と資金繰りの相談窓口。数字にしないと話が進まない、と言われる。" },

    { id:"support", name:"産業支援センター",   x:26, y:10, w:6, h:5, door:[28,14],
      colors:["#89a58f","#4f6455","#e6ffe0"],
      about:"公的な支援の窓口。誰と誰がつながっていないか、いちばん知っている。" },

    { id:"cafe",    name:"喫茶ミナト",         x:2,  y:19, w:6, h:5, door:[4,19],
      colors:["#b98a7a","#7a4f43","#ffdfae"],
      about:"打ち合わせという名の雑談の場所。ここで決まった話が、いちばん続く。" },

    { id:"guild",   name:"マッチング事務局",   x:13, y:19, w:8, h:5, door:[16,19],
      colors:["#6f7fb5","#3b466e","#ffe6a0"],
      about:"合同会社To do の窓口。気になった人への連絡は、ここが引き受ける。" },

    { id:"campus",  name:"大学サテライト",     x:25, y:19, w:7, h:5, door:[28,19],
      colors:["#9a8fb5","#5c5378","#e8dcff"],
      about:"街なかにある大学の出張所。学生も先生も、ふらっと来る。" }
  ],

  /* ── 人 ──
     項目名は profiles テーブルと同じ。tagline は街で見せる一言。 */
  people: [
    {
      id:"p1", x:6, y:7, place:"lab", color:"#7fd6ff",
      name:"三雲 かおる", organization:"府立工科大学", title:"准教授",
      industry:"応用数学・最適化", region:"大阪",
      tagline:"数式を、現場の段取りに翻訳する人。",
      current_work:"工場の生産計画を、数理最適化で組み直す研究をしています。",
      strengths:"「勘と経験でやっている手順」を、計算できる形に置き換えること。",
      target_profile:"現場の段取りに困っている製造業の方。データはなくても構いません。",
      purpose_tags:["共同研究・共同開発の相手を探す","技術・研究シーズの実用化"]
    },
    {
      id:"p2", x:3, y:7, place:"lab", color:"#a0f0c0",
      name:"堀田 慎一", organization:"県産業技術研究所", title:"主任研究員",
      industry:"材料・表面処理", region:"兵庫",
      tagline:"だいたいの素材は、ここで測れる。",
      current_work:"中小企業から持ち込まれる材料の評価と、その原因分析をしています。",
      strengths:"分析装置が一通りそろっていること。少量でも受けられます。",
      target_profile:"品質のばらつきに困っているメーカーの方。",
      purpose_tags:["知見の交換・壁打ち","共同研究・共同開発の相手を探す"]
    },
    {
      id:"p3", x:17, y:7, place:"factory", color:"#ffd08a",
      name:"大西 徹", organization:"大西精工", title:"代表取締役",
      industry:"精密機械加工", region:"東大阪",
      tagline:"図面がなくても、話せば形になる。",
      current_work:"多品種少量の受託加工。試作の一点ものが半分を占めます。",
      strengths:"図面が固まっていない段階から相談に乗れること。社内に加工機が9台。",
      target_profile:"試作を頼める先を探している研究者・スタートアップの方。",
      purpose_tags:["技術・研究シーズの実用化","販路・顧客の紹介"]
    },
    {
      id:"p4", x:28, y:7, place:"trade", color:"#cfe4ff",
      name:"ファム・リン", organization:"みなと通商", title:"海外事業部長",
      industry:"商社・輸出入", region:"神戸",
      tagline:"作れる人と、買う人の間にいる。",
      current_work:"東南アジア向けに、日本の産業機械と部材を卸しています。",
      strengths:"現地の代理店網と、通関まわりの実務。ベトナム語と日本語。",
      target_profile:"海外に売りたいが、どこから手をつけるか決まっていないメーカー。",
      purpose_tags:["販路・顧客の紹介","知見の交換・壁打ち"]
    },
    {
      id:"p5", x:5, y:15, place:"bank", color:"#fff0b8",
      name:"倉本 みどり", organization:"みなみ信用金庫", title:"法人渉外",
      industry:"金融・補助金", region:"大阪",
      tagline:"その計画、通る形にできます。",
      current_work:"設備投資と補助金申請の伴走。年間で30社ほど見ています。",
      strengths:"補助金の採択事例を数多く見ていること。書類の詰まりどころが分かります。",
      target_profile:"新しいことを始めたいが、お金の組み立てで止まっている経営者。",
      purpose_tags:["資金調達・出資の相談","相談相手・アドバイザーを探す"]
    },
    {
      id:"p6", x:27, y:15, place:"support", color:"#c8ffb8",
      name:"田上 圭介", organization:"市産業支援センター", title:"コーディネーター",
      industry:"産学連携", region:"大阪",
      tagline:"街の誰と誰が、まだ会っていないかを知っている。",
      current_work:"大学の研究シーズと、地元企業の課題をつなぐ仕事をしています。",
      strengths:"分野をまたいだ紹介。断られ方も含めて場数を踏んでいます。",
      target_profile:"研究を社会で使いたい研究者。または技術を探している企業。",
      purpose_tags:["知見の交換・壁打ち","共同研究・共同開発の相手を探す"]
    },
    {
      id:"p7", x:5, y:18, place:"cafe", color:"#ffb8c8",
      name:"如月 あさひ", organization:"きさらぎデザイン", title:"代表",
      industry:"ブランディング・広報", region:"京都",
      tagline:"難しい技術を、伝わる言葉にする。",
      current_work:"技術系の会社のパンフレットとサイトを作っています。",
      strengths:"専門家の話を聞き取って、外の人に伝わる文章に直すこと。",
      target_profile:"良いものを作っているのに、説明がうまくいかない会社の方。",
      purpose_tags:["販路・顧客の紹介","知見の交換・壁打ち"]
    },
    {
      id:"p8", x:18, y:13, place:"plaza", color:"#e8dcff",
      name:"小林 直人", organization:"府立大学", title:"博士課程3年",
      industry:"データ解析・機械学習", region:"大阪",
      tagline:"手は動く。行き先を探している。",
      current_work:"時系列データの異常検知を研究しています。来年から就職先を探します。",
      strengths:"実データの前処理から、モデルを作って評価するまで一通り。",
      target_profile:"データはあるが、使いこなせていない会社の方。",
      purpose_tags:["採用・人材の紹介","知見の交換・壁打ち"]
    }
  ],

  /* ── 街の飾り（通れない） ──
     type: tree（植え込み）／bench（ベンチ）／board（掲示板） */
  decor: [
    { type:"board", x:16, y:12, name:"けいじばん" },
    { type:"bench", x:13, y:14 }, { type:"bench", x:20, y:14 },
    { type:"tree",  x:12, y:10 }, { type:"tree",  x:21, y:10 },
    { type:"tree",  x:12, y:16 }, { type:"tree",  x:21, y:16 },
    { type:"tree",  x:0,  y:8  }, { type:"tree",  x:33, y:8  },
    { type:"tree",  x:0,  y:16 }, { type:"tree",  x:33, y:16 }
  ],

  /* 主人公の出発点（ひろばの真ん中） */
  start: { x:16, y:15 }
};
