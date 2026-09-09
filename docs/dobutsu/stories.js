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


/* ============================================================ ここから9話 */

/* 10 ------------------------------------------------------------- ねこ */
{
  id: "neko", name: "ねこ", yomi: "ねこ", title: "ねこに すず",
  color: "#e9e0d2",
  card: (g, t) => A.neko(g, { x: 66, y: 84, s: 1.0, t, walk: 1 }),
  scenes: [
    { sec: 7, bg: "ie", text: "ねずみたちは こまって いました。ねこは しずかに やって くるからです。",
      act: (g, p, t) => {
        A.neko(g, { x: mix(340, 250, ease(p)), y: GROUND, s: 1.1, t, walk: 1 });
        A.nezumi(g, { x: 110, y: GROUND, s: 1.2, t, mood: "sad" });
        A.nezumi(g, { x: 150, y: GROUND, s: 1.1, t, mood: "sad" });
      } },
    { sec: 6, bg: "ie", text: "そこで、みんなで あつまって そうだんしました。",
      act: (g, p, t) => {
        A.nezumi(g, { x: 120, y: GROUND, s: 1.3, t, flip: true });
        A.nezumi(g, { x: 175, y: GROUND, s: 1.3, t });
        A.nezumi(g, { x: 225, y: GROUND, s: 1.2, t });
      } },
    { sec: 7, bg: "ie", text: "わかい ねずみが いいました。「ねこの くびに すずを つけよう」",
      act: (g, p, t) => {
        A.nezumi(g, { x: 130, y: GROUND, s: 1.4, t, mood: "happy", flip: true, hop: bounce(t, 4, 6) });
        A.nezumi(g, { x: 210, y: GROUND, s: 1.2, t });
        P.suzu(g, 175, 120 + wiggle(t, 3, 4), 1.4);
      } },
    { sec: 7, bg: "ie", text: "「それは いい かんがえだ」。みんな 手を たたきました。",
      act: (g, p, t) => {
        A.nezumi(g, { x: 120, y: GROUND, s: 1.3, t, mood: "happy", flip: true, hop: bounce(t, 5, 7) });
        A.nezumi(g, { x: 175, y: GROUND, s: 1.3, t, mood: "happy", hop: bounce(t + 0.3, 5, 7) });
        A.nezumi(g, { x: 225, y: GROUND, s: 1.2, t, mood: "happy", hop: bounce(t + 0.6, 5, 7) });
        P.mark(g, 175, 108, "♪", 0.9, 0.6 + 0.4 * Math.sin(t * 5));
      } },
    { sec: 8, bg: "ie", text: "そこへ、としよりの ねずみが ききました。「だれが つけに いくの」",
      act: (g, p, t) => {
        A.nezumi(g, { x: 230, y: GROUND, s: 1.4, t });
        A.nezumi(g, { x: 130, y: GROUND, s: 1.3, t, flip: true });
        A.nezumi(g, { x: 175, y: GROUND, s: 1.2, t, flip: true });
        P.fukidashi(g, 240, 100, 130, 42, 226);
        P.mark(g, 240, 82, "だれが？", 0.5);
      } },
    { sec: 7, bg: "ie", text: "しんと しました。だれも 手を あげません。",
      act: (g, p, t) => {
        A.nezumi(g, { x: 130, y: GROUND, s: 1.3, t, mood: "sad" });
        A.nezumi(g, { x: 175, y: GROUND, s: 1.3, t, mood: "sad" });
        A.nezumi(g, { x: 225, y: GROUND, s: 1.2, t, mood: "sad" });
        P.mark(g, 175, 110, "…", 1);
      } },
    { sec: 7, bg: "ie", text: "よい かんがえも、できなければ おなじ。おしまい。",
      act: (g, p, t) => {
        A.neko(g, { x: 250, y: GROUND, s: 1.1, t, mood: "happy" });
        A.nezumi(g, { x: 120, y: GROUND, s: 1.2, t, mood: "sad" });
        P.suzu(g, 175, 150, 1.2);
      } },
  ],
},

/* 11 -------------------------------------------------------------- さる */
{
  id: "saru", name: "さる", yomi: "さる", title: "さると かに",
  color: "#efdcc8",
  card: (g, t) => A.saru(g, { x: 66, y: 84, s: 1.0, t, walk: 1 }),
  scenes: [
    { sec: 8, bg: "hara", text: "かには おにぎりを、さるは かきの たねを もって いました。",
      act: (g, p, t) => {
        A.kani(g, { x: 110, y: GROUND, s: 1.3, t, flip: true });
        P.onigiri(g, 145, GROUND - 40, 1);
        A.saru(g, { x: 240, y: GROUND, s: 1.1, t });
        el(g, 208, GROUND - 40, 5, 7, "#8a6a4a");
      } },
    { sec: 7, bg: "hara", text: "さるが いいました。「たねの ほうが とくだよ」。ふたりは とりかえました。",
      act: (g, p, t) => {
        A.kani(g, { x: 130, y: GROUND, s: 1.3, t, flip: true, mood: "happy" });
        A.saru(g, { x: 230, y: GROUND, s: 1.1, t, mood: "happy" });
        el(g, mix(208, 165, ease(p)), GROUND - 44, 5, 7, "#8a6a4a");
        P.onigiri(g, mix(150, 200, ease(p)), GROUND - 42, 0.9);
      } },
    { sec: 7, bg: "hara", text: "かには たねを うえて、まいにち 水を やりました。",
      act: (g, p, t) => {
        A.kani(g, { x: 140, y: GROUND, s: 1.4, t, flip: true, walk: 1 });
        ln(g, [200, GROUND, 200, GROUND - 14 - p * 20], "#6b8f3a", 3);
        el(g, 196, GROUND - 18 - p * 20, 8, 4, "#7fb84a", -0.3);
        el(g, 206, GROUND - 16 - p * 18, 8, 4, "#7fb84a", 0.3);
      } },
    { sec: 7, bg: "hara", text: "木は そだって、あまい かきが なりました。",
      act: (g, p, t) => {
        tree(g, 230, GROUND, 1.3, "#4e8a52", "#5f9c60");
        P.kinomi(g, 230, 96, t, 5);
        A.kani(g, { x: 110, y: GROUND, s: 1.4, t, flip: true, mood: "happy" });
      } },
    { sec: 8, bg: "hara", text: "さるは 木に のぼって、じぶんだけ たべました。かには おこりました。",
      act: (g, p, t) => {
        tree(g, 250, GROUND, 1.3, "#4e8a52", "#5f9c60");
        P.kinomi(g, 250, 96, t, 3);
        A.saru(g, { x: 250, y: 130, s: 0.9, t, mood: "happy" });
        A.kani(g, { x: 110, y: GROUND, s: 1.4, t, flip: true, mood: "angry" });
        P.mark(g, 140, 150, "！", 0.9, 0.5 + 0.5 * Math.sin(t * 7));
      } },
    { sec: 8, bg: "hara", text: "さるは はっと しました。「ごめんね」。かきを おろして、わけました。",
      act: (g, p, t) => {
        tree(g, 250, GROUND, 1.3, "#4e8a52", "#5f9c60");
        A.saru(g, { x: 210, y: GROUND, s: 1.1, t, mood: "sad" });
        A.kani(g, { x: 120, y: GROUND, s: 1.4, t, flip: true });
        el(g, mix(190, 150, ease(p)), GROUND - 30, 6, 6, "#e07a3f");
      } },
    { sec: 6, bg: "hara", text: "ふたりで たべると、もっと おいしい。おしまい。",
      act: (g, p, t) => {
        A.saru(g, { x: 210, y: GROUND, s: 1.1, t, mood: "happy" });
        A.kani(g, { x: 130, y: GROUND, s: 1.4, t, flip: true, mood: "happy" });
        el(g, 170, GROUND - 26, 6, 6, "#e07a3f");
        P.mark(g, 170, 110, "♪", 0.8, 0.6 + 0.4 * Math.sin(t * 4));
      } },
  ],
},

/* 12 ------------------------------------------------------------ たぬき */
{
  id: "tanuki", name: "たぬき", yomi: "たぬき", title: "たぬきの はらつづみ",
  color: "#ded3c2",
  card: (g, t) => A.tanuki(g, { x: 66, y: 84, s: 1.0, t, hop: bounce(t, 3, 5) }),
  scenes: [
    { sec: 6, bg: "yoru", text: "まんまるの お月さま。たぬきが やまから でて きました。",
      act: (g, p, t) => A.tanuki(g, { x: mix(340, 220, ease(p)), y: GROUND, s: 1.2, t, walk: 1 }) },
    { sec: 7, bg: "yoru", text: "たぬきは おなかを たたきました。ぽん、ぽこぽん。",
      act: (g, p, t) => {
        A.tanuki(g, { x: 190, y: GROUND, s: 1.3, t, mood: "happy", hop: bounce(t, 4, 6) });
        P.mark(g, 240, 120, "ぽんぽこ", 0.5, 0.4 + 0.6 * Math.abs(Math.sin(t * 4)));
      } },
    { sec: 7, bg: "yoru", text: "おとを きいて、うさぎが やって きました。",
      act: (g, p, t) => {
        A.tanuki(g, { x: 210, y: GROUND, s: 1.3, t, mood: "happy", hop: bounce(t, 4, 6) });
        A.usagi(g, { x: mix(20, 120, ease(p)), y: GROUND, s: 1.1, t, flip: true, hop: bounce(t, 7, 16) });
      } },
    { sec: 7, bg: "yoru", text: "きつねも、ねずみも やって きました。",
      act: (g, p, t) => {
        A.tanuki(g, { x: 230, y: GROUND, s: 1.3, t, mood: "happy", hop: bounce(t, 4, 6) });
        A.usagi(g, { x: 120, y: GROUND, s: 1.1, t, flip: true, hop: bounce(t, 7, 14) });
        A.kitsune(g, { x: mix(-20, 70, ease(p)), y: GROUND, s: 1.0, t, flip: true, walk: 1 });
        A.nezumi(g, { x: mix(380, 300, ease(p)), y: GROUND, s: 1.1, t, walk: 1 });
      } },
    { sec: 8, bg: "yoru", text: "みんなで ぽんぽこ、ぴょんぴょん。のはらは にぎやかです。",
      act: (g, p, t) => {
        A.tanuki(g, { x: 190, y: GROUND, s: 1.3, t, mood: "happy", hop: bounce(t, 5, 8) });
        A.usagi(g, { x: 110, y: GROUND, s: 1.1, t, flip: true, mood: "happy", hop: bounce(t + 0.3, 6, 16) });
        A.kitsune(g, { x: 60, y: GROUND, s: 1.0, t, flip: true, mood: "happy", hop: bounce(t + 0.6, 5, 10) });
        A.nezumi(g, { x: 280, y: GROUND, s: 1.1, t, mood: "happy", hop: bounce(t + 0.9, 6, 12) });
        P.mark(g, 150, 100, "♪", 0.9, 0.6 + 0.4 * Math.sin(t * 5));
        P.mark(g, 250, 88, "♪", 0.7, 0.6 + 0.4 * Math.sin(t * 4));
      } },
    { sec: 7, bg: "yoru", text: "月が しずむまで、おどりは つづきました。おしまい。",
      act: (g, p, t) => {
        A.tanuki(g, { x: 180, y: GROUND, s: 1.3, t, mood: "happy", hop: bounce(t, 3, 5) });
        A.usagi(g, { x: 110, y: GROUND, s: 1.1, t, flip: true, mood: "happy" });
        A.nezumi(g, { x: 250, y: GROUND, s: 1.1, t, mood: "happy" });
      } },
  ],
},

/* 13 ------------------------------------------------------------ かえる */
{
  id: "kaeru", name: "かえる", yomi: "かえる", title: "おおきく なりたい かえる",
  color: "#d6e8c6",
  card: (g, t) => A.kaeru(g, { x: 60, y: 82, s: 1.5, t, hop: bounce(t, 3, 6) }),
  scenes: [
    { sec: 7, bg: "mizube", text: "かえるが ぞうを 見て おどろきました。「なんて 大きいんだ」",
      act: (g, p, t) => {
        A.zou(g, { x: 270, y: GROUND, s: 1.0, t });
        A.kaeru(g, { x: 110, y: GROUND, s: 1.5, t, flip: true });
        P.mark(g, 140, 150, "！", 0.9, 0.5 + 0.5 * Math.sin(t * 6));
      } },
    { sec: 7, bg: "mizube", text: "かえるは いきを すって、おなかを ふくらませました。",
      act: (g, p, t) => {
        A.zou(g, { x: 280, y: GROUND, s: 1.0, t });
        A.kaeru(g, { x: 120, y: GROUND, s: 1.5, t, flip: true, puff: 0.3 * ease(p) });
      } },
    { sec: 7, bg: "mizube", text: "もっと、もっと。ぷうっと ふくらみます。",
      act: (g, p, t) => {
        A.zou(g, { x: 280, y: GROUND, s: 1.0, t });
        A.kaeru(g, { x: 120, y: GROUND, s: 1.5, t, flip: true, puff: 0.3 + 0.7 * ease(p) });
        P.ase(g, 150, 130, t);
      } },
    { sec: 7, bg: "mizube", text: "それでも ぞうには ほど とおい。ぷしゅーっと しぼみました。",
      act: (g, p, t) => {
        A.zou(g, { x: 280, y: GROUND, s: 1.0, t });
        A.kaeru(g, { x: 120, y: GROUND, s: 1.5, t, flip: true, mood: "sad", puff: 1 - ease(p) });
        P.mark(g, 160, 140, "ぷしゅー", 0.42, 1 - p);
      } },
    { sec: 7, bg: "mizube", text: "「ぼくは ぼくの 大きさで いい」。かえるは そう おもいました。",
      act: (g, p, t) => {
        A.kaeru(g, { x: 150, y: GROUND, s: 1.5, t, mood: "happy", hop: bounce(t, 3, 6) });
        A.zou(g, { x: 290, y: GROUND, s: 1.0, t, mood: "happy" });
      } },
    { sec: 6, bg: "mizube", text: "水べで げんきに ないて いました。けろ、けろ。おしまい。",
      act: (g, p, t) => {
        A.kaeru(g, { x: 160, y: GROUND, s: 1.6, t, mood: "happy", hop: bounce(t, 5, 12) });
        P.mark(g, 210, 130, "けろ", 0.5, 0.5 + 0.5 * Math.sin(t * 4));
      } },
  ],
},

/* 14 -------------------------------------------------------------- くま */
{
  id: "kuma", name: "くま", yomi: "くま", title: "くまと はちみつ",
  color: "#e8d6c0",
  card: (g, t) => A.kuma(g, { x: 70, y: 86, s: 0.85, t, walk: 1 }),
  scenes: [
    { sec: 7, bg: "mori", text: "くまは はちみつが 大すき。木の うえに すを 見つけました。",
      act: (g, p, t) => {
        P.hachinosu(g, 250, 90, t, 2);
        A.kuma(g, { x: mix(60, 170, ease(p)), y: GROUND, s: 1.1, t, walk: 1, flip: true });
      } },
    { sec: 7, bg: "mori", text: "手を のばすと、はちたちが とんで きました。",
      act: (g, p, t) => {
        P.hachinosu(g, 250, 90, t, 5);
        A.kuma(g, { x: 190, y: GROUND, s: 1.1, t, flip: true, mood: "sad", hop: bounce(t, 3, 8) });
      } },
    { sec: 8, bg: "mori", text: "くまは そっと たずねました。「すこし わけて くれない?」",
      act: (g, p, t) => {
        P.hachinosu(g, 250, 90, t, 4);
        A.kuma(g, { x: 160, y: GROUND, s: 1.1, t, flip: true });
        P.fukidashi(g, 130, 110, 140, 42, 152);
        P.mark(g, 130, 92, "わけて ください", 0.42);
      } },
    { sec: 7, bg: "mori", text: "はちたちは、すこしだけ わけて くれました。",
      act: (g, p, t) => {
        P.hachinosu(g, 250, 90, t, 3);
        A.kuma(g, { x: 170, y: GROUND, s: 1.1, t, flip: true, mood: "happy" });
        el(g, 210, mix(120, GROUND - 44, ease(p)), 5, 6, "#e8b44a");
      } },
    { sec: 8, bg: "hara", text: "くまは おれいに、はなの さく はらっぱへ あんない しました。",
      act: (g, p, t) => {
        A.kuma(g, { x: mix(80, 200, ease(p)), y: GROUND, s: 1.1, t, walk: 1, flip: true, mood: "happy" });
        for (let i = 0; i < 6; i++) {
          const x = 40 + i * 52;
          ln(g, [x, GROUND + 16, x, GROUND + 4], "#6b8f3a", 2);
          el(g, x, GROUND + 2, 4.5, 4.5, ["#e8a0b8", "#f0d06a"][i % 2]);
        }
        P.hachinosu(g, 320, 90, t, 4);
      } },
    { sec: 6, bg: "hara", text: "それから ふたりは ともだちです。おしまい。",
      act: (g, p, t) => {
        A.kuma(g, { x: 170, y: GROUND, s: 1.1, t, flip: true, mood: "happy" });
        P.hachinosu(g, 290, 96, t, 3);
        P.mark(g, 230, 110, "♪", 0.8, 0.6 + 0.4 * Math.sin(t * 4));
      } },
  ],
},

/* 15 ------------------------------------------------------------ ひつじ */
{
  id: "hitsuji", name: "ひつじ", yomi: "ひつじ", title: "ひつじの けいと",
  color: "#e4e6ea",
  card: (g, t) => A.hitsuji(g, { x: 64, y: 84, s: 1.0, t, walk: 1 }),
  scenes: [
    { sec: 6, bg: "fuyu", text: "さむい ふゆ。ひつじの けは ふわふわ です。",
      act: (g, p, t) => A.hitsuji(g, { x: 180, y: GROUND, s: 1.3, t, mood: "happy" }) },
    { sec: 7, bg: "fuyu", text: "ともだちの うさぎが、さむさに ふるえて いました。",
      act: (g, p, t) => {
        A.hitsuji(g, { x: 230, y: GROUND, s: 1.3, t });
        A.usagi(g, { x: 110 + wiggle(t, 12, 1.5), y: GROUND, s: 1.1, t, mood: "sad" });
      } },
    { sec: 7, bg: "fuyu", text: "ひつじは じぶんの けを、すこし わけました。",
      act: (g, p, t) => {
        A.hitsuji(g, { x: 230, y: GROUND, s: 1.3, t, mood: "happy" });
        A.usagi(g, { x: 110, y: GROUND, s: 1.1, t, flip: true });
        P.keito(g, mix(200, 150, ease(p)), GROUND - 34, 1.1);
      } },
    { sec: 7, bg: "ie", text: "けいとに して、あんで、マフラーが できました。",
      act: (g, p, t) => {
        A.hitsuji(g, { x: 220, y: GROUND, s: 1.3, t, mood: "happy" });
        P.keito(g, 120, GROUND - 12, 1.2);
        P.mafura(g, 175, GROUND - 60 + wiggle(t, 2, 3), 1.2);
      } },
    { sec: 7, bg: "fuyu", text: "みんなの くびが、あたたかく なりました。",
      act: (g, p, t) => {
        A.usagi(g, { x: 100, y: GROUND, s: 1.1, t, mood: "happy", hop: bounce(t, 4, 8) });
        P.mafura(g, 100, GROUND - 40, 0.8);
        A.nezumi(g, { x: 165, y: GROUND, s: 1.2, t, mood: "happy" });
        P.mafura(g, 158, GROUND - 22, 0.6);
        A.hitsuji(g, { x: 250, y: GROUND, s: 1.3, t, mood: "happy" });
      } },
    { sec: 7, bg: "hara", text: "はるが きたら、けは また ふえます。おしまい。",
      act: (g, p, t) => {
        A.hitsuji(g, { x: 190, y: GROUND, s: 1.3, t, mood: "happy", walk: 1, flip: true });
        A.usagi(g, { x: 110, y: GROUND, s: 1.1, t, mood: "happy", hop: bounce(t, 5, 10) });
      } },
  ],
},

/* 16 ---------------------------------------------------------- おおかみ */
{
  id: "ookami", name: "おおかみ", yomi: "おおかみ", title: "おおかみと つる",
  color: "#dde1e8",
  card: (g, t) => A.ookami(g, { x: 68, y: 84, s: 0.95, t, walk: 1 }),
  scenes: [
    { sec: 6, bg: "mori", text: "おおかみが、ごちそうを いそいで 食べました。",
      act: (g, p, t) => {
        A.ookami(g, { x: 190, y: GROUND, s: 1.2, t, mood: "happy" });
        P.hone(g, 150, GROUND - 30, 1, wiggle(t, 6, 0.3));
      } },
    { sec: 7, bg: "mori", text: "のどに ほねが つまって、くるしくて たまりません。",
      act: (g, p, t) => {
        A.ookami(g, { x: 190, y: GROUND, s: 1.2, t, mood: "sad", hop: Math.abs(wiggle(t, 8, 3)) });
        P.hone(g, 168, GROUND - 42, 0.7, 0.8);
        P.ase(g, 220, 120, t);
      } },
    { sec: 8, bg: "mizube", text: "くびの ながい つるに たのみました。「とって ください」",
      act: (g, p, t) => {
        A.ookami(g, { x: 130, y: GROUND, s: 1.2, t, flip: true, mood: "sad" });
        A.tsuru(g, { x: 260, y: GROUND, s: 1.1, t });
        P.fukidashi(g, 150, 96, 150, 42, 158);
        P.mark(g, 150, 78, "たすけて ください", 0.42);
      } },
    { sec: 8, bg: "mizube", text: "つるは ながい くちばしを いれて、ほねを ぬきました。",
      act: (g, p, t) => {
        A.ookami(g, { x: 130, y: GROUND, s: 1.2, t, flip: true, mood: "sad" });
        A.tsuru(g, { x: 240, y: GROUND, s: 1.1, t, neck: -mix(0, 32, ease(p)) });
        if (p > 0.7) P.hone(g, mix(170, 220, (p - 0.7) / 0.3), 120, 0.7, 0.5);
      } },
    { sec: 8, bg: "mizube", text: "「おれいは?」と つる。おおかみは いいました。「食べずに おいて あげた」",
      act: (g, p, t) => {
        A.ookami(g, { x: 130, y: GROUND, s: 1.2, t, flip: true, mood: "happy" });
        A.tsuru(g, { x: 250, y: GROUND, s: 1.1, t, mood: "sad" });
        P.mark(g, 250, 90, "？", 0.9);
      } },
    { sec: 7, bg: "mizube", text: "つるは あきれて 空へ。やくそくは さきに きめて おく こと。おしまい。",
      act: (g, p, t) => {
        A.ookami(g, { x: 130, y: GROUND, s: 1.2, t, flip: true });
        A.tsuru(g, { x: 250, y: mix(GROUND, 120, ease(p)), s: 1.1, t });
      } },
  ],
},

/* 17 -------------------------------------------------------------- はと */
{
  id: "hato", name: "はと", yomi: "はと", title: "ありと はと",
  color: "#dfe6ee",
  card: (g, t) => A.hato(g, { x: 64, y: 86, s: 1.15, t, hop: bounce(t, 3, 4) }),
  scenes: [
    { sec: 7, bg: "mizube", text: "ありが 川に おちて、ながされて いました。",
      act: (g, p, t) => {
        A.ari(g, { x: mix(80, 170, p), y: GROUND + 40, s: 1.3, t });
        P.mark(g, 200, 200, "！", 0.8, 0.5 + 0.5 * Math.sin(t * 7));
      } },
    { sec: 7, bg: "mizube", text: "それを 見た はとが、木の葉を 一まい おとしました。",
      act: (g, p, t) => {
        A.hato(g, { x: 250, y: 130, s: 1.1, t, fly: 6 + wiggle(t, 3, 4) });
        P.konoha(g, mix(240, 180, ease(p)), mix(130, GROUND + 36, ease(p)), t);
        A.ari(g, { x: 170, y: GROUND + 40, s: 1.3, t });
      } },
    { sec: 7, bg: "mizube", text: "ありは 葉に つかまって、きしへ もどれました。",
      act: (g, p, t) => {
        P.konoha(g, mix(180, 110, ease(p)), GROUND + 36, 0);
        A.ari(g, { x: mix(180, 110, ease(p)), y: GROUND + 32, s: 1.3, t, mood: "happy" });
        A.hato(g, { x: 260, y: 120, s: 1.1, t, fly: 6 + wiggle(t, 3, 4) });
      } },
    { sec: 8, bg: "mori", text: "あるひ、はとを ねらう あみが しずかに ちかづきました。",
      act: (g, p, t) => {
        A.hato(g, { x: 200, y: GROUND, s: 1.2, t });
        P.ami(g, mix(400, 250, ease(p)), GROUND - 34, 40, 40);
        A.ari(g, { x: 90, y: GROUND, s: 1.4, t, flip: true });
        P.mark(g, 110, 140, "！", 0.8, 0.5 + 0.5 * Math.sin(t * 8));
      } },
    { sec: 8, bg: "mori", text: "ありが ちくりと して しらせると、はとは とびたちました。",
      act: (g, p, t) => {
        A.hato(g, { x: 210, y: mix(GROUND, 110, ease(p)), s: 1.2, t, fly: p > 0.2 ? 8 : 0 });
        P.ami(g, 250, GROUND - 34, 40, 40);
        A.ari(g, { x: 150, y: GROUND, s: 1.4, t, flip: true, mood: "happy" });
      } },
    { sec: 7, bg: "mori", text: "たすけあいは、めぐって かえって きます。おしまい。",
      act: (g, p, t) => {
        A.hato(g, { x: 220, y: 130, s: 1.2, t, fly: 6 + wiggle(t, 3, 5), mood: "happy" });
        A.ari(g, { x: 130, y: GROUND, s: 1.4, t, mood: "happy", walk: 1, flip: true });
      } },
  ],
},

/* 18 ------------------------------------------------------------ きりん */
{
  id: "kirin", name: "きりん", yomi: "きりん", title: "きりんの ながい くび",
  color: "#f4e3b8",
  card: (g, t) => A.kirin(g, { x: 62, y: 92, s: 0.62, t, walk: 1 }),
  scenes: [
    { sec: 7, bg: "hara", text: "きりんは、じぶんの くびが ながすぎると おもって いました。",
      act: (g, p, t) => A.kirin(g, { x: 190, y: GROUND, s: 1.0, t, mood: "sad" }) },
    { sec: 7, bg: "mori", text: "のはらの みんなは、たかい 木の実に とどきません。",
      act: (g, p, t) => {
        P.kinomi(g, 200, 70, t, 5);
        A.usagi(g, { x: 120, y: GROUND, s: 1.1, t, mood: "sad", hop: bounce(t, 6, 14) });
        A.nezumi(g, { x: 180, y: GROUND, s: 1.2, t, mood: "sad", hop: bounce(t + 0.4, 6, 10) });
        A.saru(g, { x: 250, y: GROUND, s: 1.0, t, mood: "sad" });
      } },
    { sec: 7, bg: "mori", text: "きりんが くびを のばすと、するりと とどきました。",
      act: (g, p, t) => {
        P.kinomi(g, 200, 70, t, 5);
        A.kirin(g, { x: 260, y: GROUND, s: 1.0, t, neck: -mix(0, 18, ease(p)), mood: "happy" });
        A.usagi(g, { x: 110, y: GROUND, s: 1.1, t, flip: true });
      } },
    { sec: 7, bg: "mori", text: "木の実が つぎつぎ ふって きます。",
      act: (g, p, t) => {
        P.kinomi(g, 200, 70, t, 3);
        A.kirin(g, { x: 260, y: GROUND, s: 1.0, t, neck: -18, mood: "happy" });
        for (let i = 0; i < 4; i++) {
          const q = ((t * 0.7 + i * 0.25) % 1);
          el(g, 170 + i * 22, 84 + q * q * 120, 6, 6, "#e07a3f");
        }
        A.usagi(g, { x: 110, y: GROUND, s: 1.1, t, flip: true, mood: "happy", hop: bounce(t, 5, 10) });
      } },
    { sec: 7, bg: "mori", text: "みんな おおよろこび。「きりんさん、ありがとう」",
      act: (g, p, t) => {
        A.kirin(g, { x: 270, y: GROUND, s: 1.0, t, mood: "happy" });
        A.usagi(g, { x: 90, y: GROUND, s: 1.1, t, flip: true, mood: "happy", hop: bounce(t, 5, 10) });
        A.nezumi(g, { x: 150, y: GROUND, s: 1.2, t, flip: true, mood: "happy", hop: bounce(t + 0.3, 5, 8) });
        A.saru(g, { x: 200, y: GROUND, s: 1.0, t, flip: true, mood: "happy" });
        P.mark(g, 150, 100, "♪", 0.9, 0.6 + 0.4 * Math.sin(t * 4));
      } },
    { sec: 7, bg: "mori", text: "ながい くびは、みんなの ための くびでした。おしまい。",
      act: (g, p, t) => {
        A.kirin(g, { x: 230, y: GROUND, s: 1.0, t, mood: "happy" });
        A.usagi(g, { x: 110, y: GROUND, s: 1.1, t, flip: true, mood: "happy" });
      } },
  ],
},

];
