// 9ひきぶんのお話。1つのお話は「場面（scene）」のならびでできている。
//   sec  … その場面の長さ（秒）
//   bg   … 背景の名前（draw.js の BG）
//   text … 画面の下に出る文。読み上げもこの文を読む
//   act  … 絵を描く。p はその場面の進み具合（0→1）、t は通しの秒数
// 音声は端末の読み上げ機能（無料）を使う。音のファイルは1つも持たない。

const mix = (a, b, p) => a + (b - a) * p;
const ease = (p) => p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
const wiggle = (t, sp, am) => Math.sin(t * sp) * am;

const STORIES = [

/* 1 ------------------------------------------------------------- うさぎ */
{
  id: "usagi", name: "うさぎ", yomi: "うさぎ", title: "うさぎと かめ",
  color: "#f3d9de",
  card: (g, t) => A.usagi(g, { x: 66, y: 84, s: 1.05, t, hop: bounce(t, 3, 8) }),
  scenes: [
    { sec: 6, bg: "hara", text: "あるところに、あしの はやい うさぎが いました。",
      act: (g, p, t) => {
        A.usagi(g, { x: 150, y: GROUND, s: 1.3, t, hop: bounce(t, 4, 14) });
        A.kame(g, { x: 260, y: GROUND, s: 1.1, t });
      } },
    { sec: 6, bg: "michi", text: "「かめさん、きみは のろまだね」と うさぎが わらいました。",
      act: (g, p, t) => {
        A.usagi(g, { x: 130, y: GROUND, s: 1.3, t, mood: "happy", flip: true });
        A.kame(g, { x: 240, y: GROUND, s: 1.1, t, mood: "sad" });
        P.fukidashi(g, 130, 92, 120, 40, 132);
        P.mark(g, 130, 76, "ふふん", 0.7);
      } },
    { sec: 6, bg: "michi", text: "「では、あの やままで きょうそうしましょう」",
      act: (g, p, t) => {
        P.hata(g, 320, GROUND, t);
        A.usagi(g, { x: 90, y: GROUND, s: 1.2, t, walk: 1, flip: true });
        A.kame(g, { x: 140, y: GROUND, s: 1.0, t, walk: 1, flip: true });
        P.mark(g, 200, 90, "よーい どん！", 0.5, 0.5 + 0.5 * Math.sin(t * 6));
      } },
    { sec: 7, bg: "hara", text: "うさぎは ぴょんぴょん。ずっと さきまで いって、ひとやすみ。",
      act: (g, p, t) => {
        const x = mix(60, 250, ease(Math.min(1, p * 1.6)));
        const rest = p > 0.65;
        A.usagi(g, { x, y: GROUND, s: 1.3, t, flip: true, hop: rest ? 0 : bounce(t, 9, 22), mood: rest ? "sleep" : null });
        if (rest) P.mark(g, x + 22, GROUND - 78, "zzz", 0.7, 0.5 + 0.5 * Math.sin(t * 2));
        A.kame(g, { x: 30, y: GROUND, s: 1.0, t, walk: 1, flip: true });
      } },
    { sec: 7, bg: "hara", text: "かめは やすみません。いっぽ、いっぽ、あるきつづけました。",
      act: (g, p, t) => {
        A.usagi(g, { x: 120, y: GROUND, s: 1.3, t, mood: "sleep" });
        P.mark(g, 142, GROUND - 78, "zzz", 0.7, 0.5 + 0.5 * Math.sin(t * 2));
        A.kame(g, { x: mix(60, 250, p), y: GROUND, s: 1.0, t, walk: 1, flip: true, mood: "happy" });
      } },
    { sec: 8, bg: "michi", text: "うさぎが めを さましたとき、かめは もう ゴールでした。",
      act: (g, p, t) => {
        P.hata(g, 300, GROUND, t);
        A.kame(g, { x: 262, y: GROUND, s: 1.1, t, mood: "happy", flip: true, hop: bounce(t, 5, 6) });
        A.usagi(g, { x: 90, y: GROUND, s: 1.3, t, mood: "sad", flip: true });
        P.mark(g, 108, GROUND - 80, "！", 1, 0.6 + 0.4 * Math.sin(t * 8));
      } },
    { sec: 6, bg: "michi", text: "こつこつ あるいた かめの かち。おしまい。",
      act: (g, p, t) => {
        P.hata(g, 300, GROUND, t);
        A.kame(g, { x: 200, y: GROUND, s: 1.2, t, mood: "happy", flip: true, hop: bounce(t, 4, 5) });
        A.usagi(g, { x: 130, y: GROUND, s: 1.2, t, mood: "happy", flip: true });
      } },
  ],
},

/* 2 --------------------------------------------------------------- かめ */
{
  id: "kame", name: "かめ", yomi: "かめ", title: "そらを とんだ かめ",
  color: "#cfe6bd",
  card: (g, t) => A.kame(g, { x: 62, y: 82, s: 1.0, t, walk: 1 }),
  scenes: [
    { sec: 6, bg: "mizube", text: "いけの かめは、まいにち そらを ながめて いました。",
      act: (g, p, t) => {
        A.kame(g, { x: 150, y: GROUND, s: 1.3, t });
        A.karasu(g, { x: 260, y: 120, s: 0.9, t, fly: 10 + wiggle(t, 2, 6) });
      } },
    { sec: 7, bg: "mizube", text: "「いちど でいいから、とんで みたいなあ」",
      act: (g, p, t) => {
        A.kame(g, { x: 140, y: GROUND, s: 1.3, t, mood: "sad" });
        P.fukidashi(g, 150, 96, 130, 42, 122);
        P.mark(g, 150, 80, "とびたい…", 0.55);
        A.karasu(g, { x: 268, y: GROUND, s: 1.0, t });
      } },
    { sec: 7, bg: "mizube", text: "からすが いいました。「ぼうを くわえて。はこんで あげる」",
      act: (g, p, t) => {
        A.kame(g, { x: 150, y: GROUND, s: 1.2, t, mood: "happy", flip: true });
        A.karasu(g, { x: 248, y: GROUND, s: 1.0, t });
        ln(g, [140, GROUND - 34, 235, GROUND - 40], "#8a6a4a", 4);
      } },
    { sec: 7, bg: "hara", text: "かめは そらへ。むらも かわも、ずうっと したに みえます。",
      act: (g, p, t) => {
        const y = mix(GROUND - 20, 96, ease(p));
        A.karasu(g, { x: 150, y: y - 26, s: 0.9, t, fly: 6 });
        A.karasu(g, { x: 236, y: y - 26, s: 0.9, t, fly: 6 });
        ln(g, [150, y - 8, 236, y - 8], "#8a6a4a", 4);
        A.kame(g, { x: 193, y: y + 16, s: 1.0, t, mood: "happy" });
      } },
    { sec: 7, bg: "hara", text: "うれしくなった かめは、つい くちを あけて さけびました。",
      act: (g, p, t) => {
        A.karasu(g, { x: 150, y: 70, s: 0.9, t, fly: 6 });
        A.karasu(g, { x: 236, y: 70, s: 0.9, t, fly: 6 });
        const drop = p > 0.5 ? (p - 0.5) * 2 : 0;
        if (!drop) ln(g, [150, 88, 236, 88], "#8a6a4a", 4);
        A.kame(g, { x: 193, y: 112 + drop * drop * 120, s: 1.0, t, mood: "happy" });
        if (drop) P.mark(g, 216, 110 + drop * 100, "あっ", 0.7);
      } },
    { sec: 7, bg: "mizube", text: "ぽちゃん。いけに おちて、けがは ありませんでした。",
      act: (g, p, t) => {
        A.kame(g, { x: 180, y: GROUND + 30, s: 1.2, t, mood: "sad" });
        for (let i = 0; i < 3; i++) {
          const r = ((t * 40 + i * 30) % 90);
          g.beginPath(); g.ellipse(180, GROUND + 34, r, r * 0.3, 0, 0, 6.3);
          g.strokeStyle = "rgba(255,255,255," + (0.5 - r / 200) + ")"; g.lineWidth = 2; g.stroke();
        }
      } },
    { sec: 6, bg: "mizube", text: "「くちは とじて おこう」。かめは そう おもいました。おしまい。",
      act: (g, p, t) => {
        A.kame(g, { x: 170, y: GROUND, s: 1.3, t, mood: "happy" });
        A.karasu(g, { x: 262, y: 120, s: 0.9, t, fly: 8 + wiggle(t, 2, 5) });
      } },
  ],
},

/* 3 ------------------------------------------------------------- きつね */
{
  id: "kitsune", name: "きつね", yomi: "きつね", title: "きつねと ぶどう",
  color: "#f6d9bd",
  card: (g, t) => A.kitsune(g, { x: 68, y: 84, s: 0.95, t, walk: 1 }),
  scenes: [
    { sec: 6, bg: "mori", text: "はらぺこの きつねが、もりを あるいて いました。",
      act: (g, p, t) => A.kitsune(g, { x: mix(60, 200, p), y: GROUND, s: 1.2, t, walk: 1, flip: true }) },
    { sec: 6, bg: "mori", text: "みあげると、おいしそうな ぶどうが なって います。",
      act: (g, p, t) => {
        P.budou(g, 250, 70, t);
        A.kitsune(g, { x: 150, y: GROUND, s: 1.2, t, mood: "happy", flip: true });
        P.mark(g, 176, 130, "！", 0.9, 0.5 + 0.5 * Math.sin(t * 6));
      } },
    { sec: 7, bg: "mori", text: "「よし」。きつねは ぴょんと とびました。とどきません。",
      act: (g, p, t) => {
        P.budou(g, 250, 70, t);
        A.kitsune(g, { x: 210, y: GROUND, s: 1.2, t, flip: true, hop: bounce(t, 5, 40) });
      } },
    { sec: 7, bg: "mori", text: "なんども なんども とびました。やっぱり とどきません。",
      act: (g, p, t) => {
        P.budou(g, 250, 70, t);
        A.kitsune(g, { x: 210, y: GROUND, s: 1.2, t, flip: true, hop: bounce(t, 8, 46), mood: "angry" });
        P.ase(g, 190, 120, t);
      } },
    { sec: 7, bg: "mori", text: "きつねは いいました。「どうせ すっぱい ぶどうさ」",
      act: (g, p, t) => {
        P.budou(g, 250, 70, t);
        A.kitsune(g, { x: 150, y: GROUND, s: 1.2, t, mood: "angry" });
        P.fukidashi(g, 120, 100, 140, 44, 140);
        P.mark(g, 120, 82, "すっぱいもん", 0.5);
      } },
    { sec: 7, bg: "mori", text: "そう いって、あるいて いきました。おしまい。",
      act: (g, p, t) => {
        P.budou(g, 250, 70, t);
        A.kitsune(g, { x: mix(150, 40, ease(p)), y: GROUND, s: 1.2, t, walk: 1 });
      } },
  ],
},

/* 4 ------------------------------------------------------------- ねずみ */
{
  id: "nezumi", name: "ねずみ", yomi: "ねずみ", title: "ねずみの およめさん",
  color: "#dfe3ea",
  card: (g, t) => A.nezumi(g, { x: 60, y: 80, s: 1.5, t, walk: 1 }),
  scenes: [
    { sec: 7, bg: "hara", text: "ねずみの おとうさんは、せかいで いちばん つよい むこを さがしました。",
      act: (g, p, t) => {
        A.nezumi(g, { x: 150, y: GROUND, s: 1.7, t, walk: 1, flip: true });
        A.nezumi(g, { x: 205, y: GROUND, s: 1.3, t, mood: "happy" });
      } },
    { sec: 7, bg: "natsu", text: "「いちばんは おひさまだ」。おひさまは いいました。「くもには かなわない」",
      act: (g, p, t) => {
        A.nezumi(g, { x: 120, y: GROUND, s: 1.7, t });
        P.mark(g, 300, 44, "☀", 1.6);
        cloud(g, mix(400, 300, ease(p)), 60, 1.1, "rgba(255,255,255,0.95)");
      } },
    { sec: 7, bg: "hara", text: "くもは いいました。「わたしを ふきとばす かぜの ほうが つよい」",
      act: (g, p, t) => {
        A.nezumi(g, { x: 120, y: GROUND, s: 1.7, t });
        cloud(g, mix(280, 120, ease(p)), 62, 1.1, "rgba(255,255,255,0.95)");
        for (let i = 0; i < 4; i++) curve(g, 300 - i * 10, 50 + i * 16, 240, 44 + i * 16, 180 - (t * 30 % 60), 52 + i * 16, "rgba(255,255,255,0.7)", 2.4);
      } },
    { sec: 7, bg: "hara", text: "かぜは いいました。「かべには かてない。ぶつかると とまるから」",
      act: (g, p, t) => {
        P.kabe(g, 250, GROUND + 12, 70, 78);
        A.nezumi(g, { x: 110, y: GROUND, s: 1.7, t });
        for (let i = 0; i < 3; i++) curve(g, 130, 90 + i * 20, 190, 84 + i * 20, 208, 92 + i * 20, "rgba(255,255,255,0.75)", 2.6);
      } },
    { sec: 7, bg: "hara", text: "かべは いいました。「わたしに あなを あけるのは、ねずみだよ」",
      act: (g, p, t) => {
        P.kabe(g, 250, GROUND + 12, 70, 78);
        if (p > 0.4) el(g, 250, GROUND - 6, 9, 9, "#6b4b34");
        A.nezumi(g, { x: 150, y: GROUND, s: 1.7, t, mood: "happy" });
        P.mark(g, 176, 120, "？", 0.9);
      } },
    { sec: 8, bg: "hara", text: "いちばん つよいのは、ねずみでした。むすめは ねずみと けっこんしました。",
      act: (g, p, t) => {
        A.nezumi(g, { x: 150, y: GROUND, s: 1.6, t, mood: "happy", flip: true, hop: bounce(t, 4, 6) });
        A.nezumi(g, { x: 210, y: GROUND, s: 1.4, t, mood: "happy", hop: bounce(t + 0.4, 4, 6) });
        P.mark(g, 180, 110, "♪", 0.9, 0.6 + 0.4 * Math.sin(t * 4));
      } },
    { sec: 6, bg: "hara", text: "しあわせは、とおくには なかったのです。おしまい。",
      act: (g, p, t) => {
        A.nezumi(g, { x: 160, y: GROUND, s: 1.5, t, mood: "happy", flip: true });
        A.nezumi(g, { x: 205, y: GROUND, s: 1.5, t, mood: "happy" });
      } },
  ],
},

/* 5 ----------------------------------------------------------- ライオン */
{
  id: "lion", name: "ライオン", yomi: "らいおん", title: "ライオンと ねずみ",
  color: "#f7e0b5",
  card: (g, t) => A.lion(g, { x: 74, y: 86, s: 0.85, t, walk: 1 }),
  scenes: [
    { sec: 6, bg: "mori", text: "ライオンが ひるねを して いました。",
      act: (g, p, t) => {
        A.lion(g, { x: 170, y: GROUND, s: 1.2, t, mood: "sleep" });
        P.mark(g, 160, 130, "zzz", 0.8, 0.5 + 0.5 * Math.sin(t * 2));
      } },
    { sec: 7, bg: "mori", text: "ちいさな ねずみが、うっかり せなかを かけあがりました。",
      act: (g, p, t) => {
        A.lion(g, { x: 170, y: GROUND, s: 1.2, t, mood: "angry" });
        A.nezumi(g, { x: mix(80, 175, ease(p)), y: mix(GROUND, GROUND - 46, ease(p)), s: 1.1, t, walk: 1, flip: true });
        P.mark(g, 140, 96, "！", 0.9);
      } },
    { sec: 8, bg: "mori", text: "「たすけて。いつか おれいを します」。ライオンは わらって にがしました。",
      act: (g, p, t) => {
        A.lion(g, { x: 200, y: GROUND, s: 1.2, t, mood: "happy" });
        A.nezumi(g, { x: 110, y: GROUND, s: 1.2, t, mood: "sad", flip: true });
        P.fukidashi(g, 110, 106, 140, 42, 118);
        P.mark(g, 110, 88, "おれいを します", 0.42);
      } },
    { sec: 7, bg: "mori", text: "すこし たった ひ。ライオンは かりゅうどの あみに かかりました。",
      act: (g, p, t) => {
        A.lion(g, { x: 180, y: GROUND, s: 1.2, t, mood: "sad" });
        P.ami(g, 180, GROUND - 40, 62, 46);
        P.mark(g, 250, 110, "！", 1, 0.5 + 0.5 * Math.sin(t * 7));
      } },
    { sec: 8, bg: "mori", text: "こえを きいて ねずみが きました。ちいさな はで つなを かじります。",
      act: (g, p, t) => {
        A.lion(g, { x: 200, y: GROUND, s: 1.2, t, mood: "sad" });
        P.ami(g, 200, GROUND - 40, 62, 46);
        A.nezumi(g, { x: mix(70, 150, ease(Math.min(1, p * 2))), y: GROUND, s: 1.2, t, walk: p < 0.5 ? 1 : 0, flip: true });
        if (p > 0.5) P.mark(g, 168, 150, "かりかり", 0.42, 0.5 + 0.5 * Math.sin(t * 9));
      } },
    { sec: 7, bg: "mori", text: "あみが きれました。ちいさな ともだちが、おおきな ライオンを たすけたのです。",
      act: (g, p, t) => {
        A.lion(g, { x: 200, y: GROUND, s: 1.2, t, mood: "happy", hop: bounce(t, 3, 5) });
        A.nezumi(g, { x: 120, y: GROUND, s: 1.2, t, mood: "happy", flip: true, hop: bounce(t, 5, 8) });
        P.mark(g, 160, 100, "♪", 0.9, 0.6 + 0.4 * Math.sin(t * 4));
      } },
    { sec: 5, bg: "mori", text: "おしまい。",
      act: (g, p, t) => {
        A.lion(g, { x: 190, y: GROUND, s: 1.2, t, mood: "happy" });
        A.nezumi(g, { x: 128, y: GROUND, s: 1.2, t, mood: "happy", flip: true });
      } },
  ],
},

/* 6 --------------------------------------------------------------- からす */
{
  id: "karasu", name: "からす", yomi: "からす", title: "からすと みずさし",
  color: "#d5dae8",
  card: (g, t) => A.karasu(g, { x: 66, y: 84, s: 1.0, t, fly: 4 + wiggle(t, 3, 4) }),
  scenes: [
    { sec: 6, bg: "natsu", text: "あつい ひでした。からすは のどが からから です。",
      act: (g, p, t) => {
        A.karasu(g, { x: mix(40, 160, p), y: GROUND, s: 1.2, t, flip: true, fly: 30 + wiggle(t, 3, 8) });
        P.ase(g, 150, 130, t);
      } },
    { sec: 6, bg: "natsu", text: "みずさしを みつけました。でも みずは そこの ほうだけ。",
      act: (g, p, t) => {
        P.mizusashi(g, 240, GROUND, 1.2, 0.18);
        A.karasu(g, { x: 140, y: GROUND, s: 1.2, t, flip: true, mood: "happy" });
      } },
    { sec: 7, bg: "natsu", text: "くちばしが とどきません。かたむけても、たおれません。",
      act: (g, p, t) => {
        P.mizusashi(g, 240, GROUND, 1.2, 0.18);
        A.karasu(g, { x: 196 + wiggle(t, 4, 3), y: GROUND, s: 1.2, t, flip: true, mood: "sad" });
        P.mark(g, 150, 110, "…", 0.9);
      } },
    { sec: 8, bg: "natsu", text: "からすは かんがえて、小石を ひとつ、みずさしに いれました。",
      act: (g, p, t) => {
        P.mizusashi(g, 240, GROUND, 1.2, 0.18 + 0.06 * ease(p));
        const iy = mix(120, GROUND - 46, ease(p));
        P.ishi(g, 240, iy, 1.2);
        A.karasu(g, { x: 160, y: GROUND, s: 1.2, t, flip: true });
        P.ishi(g, 190, GROUND - 4, 1);
        P.ishi(g, 205, GROUND - 2, 0.8, "#b3a89c");
      } },
    { sec: 8, bg: "natsu", text: "ふたつ、みっつ。いれるたびに、みずが すこしずつ あがって きます。",
      act: (g, p, t) => {
        P.mizusashi(g, 240, GROUND, 1.2, 0.24 + 0.4 * p);
        for (let i = 0; i < 4; i++) if (p > i / 4) P.ishi(g, 232 + i * 6, GROUND - 8 - i * 3, 1.1);
        A.karasu(g, { x: 160, y: GROUND, s: 1.2, t, flip: true, hop: bounce(t, 6, 8) });
      } },
    { sec: 7, bg: "natsu", text: "とうとう くちが とどきました。からすは ごくごく のみました。",
      act: (g, p, t) => {
        P.mizusashi(g, 240, GROUND, 1.2, 0.82);
        A.karasu(g, { x: 200, y: GROUND, s: 1.2, t, flip: true, mood: "happy", hop: 6 + wiggle(t, 5, 3) });
        P.mark(g, 160, 96, "♪", 0.8, 0.6 + 0.4 * Math.sin(t * 5));
      } },
    { sec: 6, bg: "natsu", text: "ちからより、かんがえる ことでした。おしまい。",
      act: (g, p, t) => {
        P.mizusashi(g, 250, GROUND, 1.2, 0.8);
        A.karasu(g, { x: 150, y: GROUND, s: 1.2, t, flip: true, mood: "happy" });
      } },
  ],
},

/* 7 ----------------------------------------------------------------- あり */
{
  id: "ari", name: "あり", yomi: "あり", title: "ありと キリギリス",
  color: "#e6d3c6",
  card: (g, t) => A.ari(g, { x: 60, y: 80, s: 1.7, t, walk: 1 }),
  scenes: [
    { sec: 7, bg: "natsu", text: "なつの あいだ、ありたちは たべものを はこんで いました。",
      act: (g, p, t) => {
        for (let i = 0; i < 3; i++) A.ari(g, { x: ((t * 22 + i * 70) % 420) - 40, y: GROUND, s: 1.6, t, walk: 1, flip: true });
      } },
    { sec: 7, bg: "natsu", text: "キリギリスは バイオリンを ひいて うたって いました。",
      act: (g, p, t) => {
        A.kirigirisu(g, { x: 210, y: GROUND, s: 1.6, t, violin: true, mood: "happy", hop: bounce(t, 3, 4) });
        A.ari(g, { x: 100, y: GROUND, s: 1.6, t, walk: 1, flip: true });
        P.mark(g, 250, 110, "♪", 0.9, 0.5 + 0.5 * Math.sin(t * 5));
      } },
    { sec: 8, bg: "natsu", text: "「なぜ はたらくの。あそべば いいのに」「ふゆが くるからです」",
      act: (g, p, t) => {
        A.kirigirisu(g, { x: 230, y: GROUND, s: 1.6, t, mood: "happy" });
        A.ari(g, { x: 120, y: GROUND, s: 1.7, t, flip: true });
        P.fukidashi(g, 130, 100, 150, 42, 138);
        P.mark(g, 130, 82, "ふゆが きます", 0.44);
      } },
    { sec: 7, bg: "fuyu", text: "やがて ふゆが きました。のはらは まっしろです。",
      act: (g, p, t) => {
        A.kirigirisu(g, { x: 180, y: GROUND, s: 1.6, t, mood: "sad" });
      } },
    { sec: 7, bg: "fuyu", text: "たべものが ありません。キリギリスは ありの うちを たずねました。",
      act: (g, p, t) => {
        A.kirigirisu(g, { x: mix(70, 160, ease(p)), y: GROUND, s: 1.6, t, walk: 1, flip: true, mood: "sad" });
        rr(g, 270, GROUND - 22, 78, 46, 10, "#8a6a4a");
        rr(g, 270, GROUND - 12, 22, 26, 4, "#5f4630");
      } },
    { sec: 8, bg: "ie", text: "ありは まねき いれました。「いっしょに たべましょう。はるまで ね」",
      act: (g, p, t) => {
        A.ari(g, { x: 130, y: GROUND, s: 1.8, t, mood: "happy", flip: true });
        A.kirigirisu(g, { x: 230, y: GROUND, s: 1.6, t, mood: "happy" });
        el(g, 180, GROUND - 12, 16, 9, "#e8c98a");
        P.mark(g, 180, 110, "♪", 0.8, 0.6 + 0.4 * Math.sin(t * 4));
      } },
    { sec: 6, bg: "ie", text: "つぎの なつ、キリギリスも たべものを はこびました。おしまい。",
      act: (g, p, t) => {
        A.ari(g, { x: 140, y: GROUND, s: 1.8, t, walk: 1, flip: true });
        A.kirigirisu(g, { x: 210, y: GROUND, s: 1.6, t, walk: 1, flip: true, mood: "happy" });
      } },
  ],
},

/* 8 ----------------------------------------------------------------- いぬ */
{
  id: "inu", name: "いぬ", yomi: "いぬ", title: "よくばりな いぬ",
  color: "#f0dcc2",
  card: (g, t) => A.inu(g, { x: 68, y: 84, s: 0.95, t, walk: 1 }),
  scenes: [
    { sec: 6, bg: "michi", text: "いぬが おおきな にくを もらいました。",
      act: (g, p, t) => {
        A.inu(g, { x: 160, y: GROUND, s: 1.2, t, mood: "happy" });
        P.niku(g, 128, GROUND - 36, 1);
      } },
    { sec: 6, bg: "michi", text: "うれしくて、はしを わたって いきます。",
      act: (g, p, t) => {
        const x = mix(260, 120, ease(p));
        A.inu(g, { x, y: GROUND, s: 1.2, t, walk: 1 });
        P.niku(g, x - 32, GROUND - 36, 1);
      } },
    { sec: 7, bg: "mizube", text: "みずを のぞくと、にくを くわえた いぬが うつって います。",
      act: (g, p, t) => {
        A.inu(g, { x: 170, y: GROUND, s: 1.2, t });
        P.niku(g, 138, GROUND - 36, 1);
        g.save(); g.globalAlpha = 0.4; g.translate(170, GROUND + 30); g.scale(0.62, -0.62);
        A.inu(g, { x: 0, y: 0, s: 1.2, t });
        P.niku(g, -32, -36, 1);
        g.restore();
      } },
    { sec: 7, bg: "mizube", text: "「あいつの にくの ほうが、おおきいぞ」",
      act: (g, p, t) => {
        A.inu(g, { x: 170, y: GROUND, s: 1.2, t, mood: "angry" });
        P.niku(g, 138, GROUND - 36, 1);
        g.save(); g.globalAlpha = 0.4; g.translate(170, GROUND + 30); g.scale(0.62, -0.62);
        A.inu(g, { x: 0, y: 0, s: 1.2, t });
        P.niku(g, -34, -36, 1.5);
        g.restore();
        P.mark(g, 210, 110, "！", 0.9, 0.5 + 0.5 * Math.sin(t * 7));
      } },
    { sec: 7, bg: "mizube", text: "わんと ほえた ひょうしに、にくは みずへ おちました。",
      act: (g, p, t) => {
        A.inu(g, { x: 170, y: GROUND, s: 1.2, t, mood: "angry" });
        P.niku(g, 138, GROUND - 36 + ease(Math.min(1, p * 1.6)) * 96, 1);
        if (p > 0.6) for (let i = 0; i < 3; i++) {
          const r = ((t * 40 + i * 26) % 70);
          g.beginPath(); g.ellipse(138, GROUND + 44, r, r * 0.3, 0, 0, 6.3);
          g.strokeStyle = "rgba(255,255,255," + (0.5 - r / 160) + ")"; g.lineWidth = 2; g.stroke();
        }
      } },
    { sec: 7, bg: "mizube", text: "うつって いたのは、じぶんの すがた。にくは なくなりました。",
      act: (g, p, t) => {
        A.inu(g, { x: 170, y: GROUND, s: 1.2, t, mood: "sad" });
        P.mark(g, 210, 116, "…", 0.9);
      } },
    { sec: 6, bg: "michi", text: "よくばると、もっている ものまで なくします。おしまい。",
      act: (g, p, t) => A.inu(g, { x: mix(200, 90, ease(p)), y: GROUND, s: 1.2, t, walk: 1, mood: "sad" }) },
  ],
},

/* 9 ----------------------------------------------------------------- ぞう */
{
  id: "zou", name: "ぞう", yomi: "ぞう", title: "ぞうさんの シャワー",
  color: "#d9e0ea",
  card: (g, t) => A.zou(g, { x: 76, y: 88, s: 0.72, t, walk: 1 }),
  scenes: [
    { sec: 6, bg: "natsu", text: "とても あつい ひ。のはらの みんなは ばてて いました。",
      act: (g, p, t) => {
        A.usagi(g, { x: 90, y: GROUND, s: 1.0, t, mood: "sad" });
        A.nezumi(g, { x: 150, y: GROUND, s: 1.2, t, mood: "sad" });
        A.inu(g, { x: 230, y: GROUND, s: 1.0, t, mood: "sad" });
        P.ase(g, 100, 130, t); P.ase(g, 240, 130, t + 1);
      } },
    { sec: 6, bg: "natsu", text: "そこへ、ぞうさんが やって きました。",
      act: (g, p, t) => {
        A.usagi(g, { x: 70, y: GROUND, s: 1.0, t, mood: "sad" });
        A.zou(g, { x: mix(400, 240, ease(p)), y: GROUND, s: 1.0, t, walk: 1 });
      } },
    { sec: 7, bg: "mizube", text: "ぞうさんは ながい はなで、かわの みずを すいこみます。",
      act: (g, p, t) => {
        A.zou(g, { x: 230, y: GROUND, s: 1.0, t, trunk: 10 });
        P.mark(g, 180, 150, "ずずず", 0.45, 0.5 + 0.5 * Math.sin(t * 5));
      } },
    { sec: 8, bg: "natsu", text: "ぷしゅーっ。そらから みずが ふって きました。",
      act: (g, p, t) => {
        A.zou(g, { x: 250, y: GROUND, s: 1.0, t, trunk: -22 });
        for (let i = 0; i < 26; i++) {                        // はなから でる みず
          const q = ((t * 0.8 + i * 0.13) % 1);
          const x = 202 - q * 120;
          const y = 176 - Math.sin(q * Math.PI) * 78 + q * 34;
          el(g, x, y, 2.2, 3, "rgba(120,200,235,0.85)");
        }
        A.usagi(g, { x: 90, y: GROUND, s: 1.0, t, mood: "happy", hop: bounce(t, 6, 12) });
        A.nezumi(g, { x: 140, y: GROUND, s: 1.2, t, mood: "happy", hop: bounce(t + 0.3, 6, 10) });
      } },
    { sec: 7, bg: "natsu", text: "みんな おおよろこび。にじも でました。",
      act: (g, p, t) => {
        for (let i = 0; i < 5; i++) {
          g.beginPath();
          g.arc(180, GROUND + 30, 100 - i * 9, Math.PI, 0);
          g.strokeStyle = ["#e0603f", "#e8a04a", "#e7d05a", "#6bb36a", "#5a8fd0"][i];
          g.lineWidth = 9; g.globalAlpha = 0.55; g.stroke(); g.globalAlpha = 1;
        }
        A.zou(g, { x: 270, y: GROUND, s: 1.0, t, mood: "happy" });
        A.usagi(g, { x: 90, y: GROUND, s: 1.0, t, mood: "happy", hop: bounce(t, 5, 10) });
        A.nezumi(g, { x: 140, y: GROUND, s: 1.2, t, mood: "happy" });
      } },
    { sec: 7, bg: "natsu", text: "ながい はなは、みんなを すずしくする はなでした。おしまい。",
      act: (g, p, t) => {
        A.zou(g, { x: 240, y: GROUND, s: 1.0, t, mood: "happy" });
        A.usagi(g, { x: 100, y: GROUND, s: 1.0, t, mood: "happy" });
        A.nezumi(g, { x: 150, y: GROUND, s: 1.2, t, mood: "happy" });
        A.inu(g, { x: 60, y: GROUND, s: 1.0, t, mood: "happy" });
      } },
  ],
},

];
