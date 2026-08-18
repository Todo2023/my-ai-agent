/**
 * 絵本を作る（手元で走らせる道具）
 *
 *   node ehon/tools/_make-books.mjs
 *
 * ここに書いた話から、books/ の下に絵と book.json を書き出す。
 * そのあと build-index.mjs を走らせると棚に並ぶ。
 *
 * 絵の部品は _draw.mjs にある。1枚ずつ手で描かないのは、
 * 10冊並べたときに絵柄が揃っていないほうが目立つから。
 *
 * ■ 話を足すときは BOOKS に1つ足すだけ。
 *   すでにあるフォルダは上書きするので、手で直した絵があるときは注意する
 *   （tsuki-no-pan は手描きなので、ここには入れていない）
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as d from "./_draw.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/* ── 話 ────────────────────────────────────── */

/**
 * 置きかたの短縮。地面 g に立たせる。
 * 絵本は被写体を大きく取る。倍率は 1.4 以上を目安にした
 */
const A = (kind, x, s, color, g = 880) => d.animal(kind, x, d.stand(g, s), s, color);
const C = (x, s, clothes, g = 880) => d.child(x, d.standChild(g, s), s, clothes);

const BOOKS = [
  {
    slug: "nebosuke-taiyou",
    title: "ねぼすけ たいよう",
    age: [0, 2],
    summary: "たいようが おきない あさの おはなし。",
    pages: [
      { art: [d.bg("night"), d.stars(11), d.hills("#3b4a63"), d.house(820, 800, 1.2, "#e6d6bd", "#8f5b4a", false)],
        alt: "夜の丘に建つ家", text: "あさに なりました。" },
      { art: [d.bg("night"), d.stars(12), d.hills("#3b4a63", 700), d.sun(800, 980, 190)],
        alt: "太陽が地平線の下でまだ眠っている", text: "でも たいようが おきません。" },
      { art: [d.bg("dawn"), d.hills("#7f8f6a"), A("bird", 560, 2.2, "#e8a33c", 700), A("bird", 1080, 1.8, "#d9524a", 620)],
        alt: "鳥が2羽とんでいる", text: "とりが よびました。「おきて。」" },
      { art: [d.bg("dawn"), d.hills("#7f8f6a", 800), d.sun(800, 780, 230)],
        alt: "太陽が少しだけ顔を出す", text: "たいようが ちょっとだけ おきました。" },
      { art: [d.bg("day"), d.sun(800, 340, 220), d.hills("#6f9a78"), d.forest(21, 900, 5)],
        alt: "空高くのぼった太陽と森", text: "ぱあっ。" },
      { art: [d.bg("day"), d.sun(1300, 250, 130), d.hills("#6f9a78"), d.house(560, 820, 1.1), C(1120, 1.5)],
        alt: "明るい家の前に立つ子ども", text: "おはよう。きょうも いい ひ。" },
    ],
  },
  {
    slug: "akai-kasa",
    title: "あかい かさ",
    age: [3, 5],
    summary: "あめの ひに、かさを ひとつ わけあう おはなし。",
    pages: [
      { art: [d.bg("snow"), d.rainfall(31, 60), d.ground(860, "#7f9a86"), d.umbrella(800, 480, 1.7, "#d9524a")],
        alt: "雨の中に立つ赤いかさ", text: "あめが ふって きました。" },
      { art: [d.bg("snow"), d.rainfall(32, 60), d.ground(860, "#7f9a86"), C(620, 1.5), d.umbrella(620, 300, 1.5, "#d9524a")],
        alt: "赤いかさをさす子ども", text: "わたしは あかい かさを もって います。" },
      { art: [d.bg("snow"), d.rainfall(33, 70), d.ground(860, "#7f9a86"), C(520, 1.4), d.umbrella(520, 320, 1.4, "#d9524a"), A("rabbit", 1130, 1.6, "#d8d3cc")],
        alt: "雨に濡れているうさぎ", text: "あれ。うさぎさんが ぬれて います。" },
      { art: [d.bg("snow"), d.rainfall(34, 50), d.ground(860, "#7f9a86"), C(660, 1.4), A("rabbit", 980, 1.5, "#d8d3cc"), d.umbrella(820, 300, 1.9, "#d9524a")],
        alt: "ひとつのかさに2人が入る", text: "「いっしょに はいる？」" },
      { art: [d.bg("snow"), d.rainfall(35, 40), d.ground(860, "#7f9a86"), C(600, 1.35), A("rabbit", 900, 1.45, "#d8d3cc"), A("mouse", 1150, 1.1, "#b9bfcb"), d.umbrella(830, 280, 2.15, "#d9524a")],
        alt: "3人でひとつのかさに入る", text: "ねずみさんも きました。だんだん せまい。" },
      { art: [d.bg("dawn"), d.ground(860, "#7f9a86"), d.rainbow(820, 850, 1.1), d.umbrella(300, 620, 1.1, "#d9524a")],
        alt: "雨がやんで虹が出る", text: "あめが やみました。かさを たたみます。" },
      { art: [d.bg("day"), d.sun(1300, 250, 110), d.ground(860, "#7f9a86"), C(520, 1.4), A("rabbit", 840, 1.5, "#d8d3cc"), A("mouse", 1120, 1.15, "#b9bfcb")],
        alt: "3人が並んで歩いている", text: "せまかったけど、あたたかかった。" },
    ],
  },
  {
    slug: "mori-no-yuubin",
    title: "もりの ゆうびんやさん",
    age: [3, 5],
    summary: "もりの ゆうびんやさんが、さいごの てがみを とどけます。",
    pages: [
      { art: [d.bg("forest"), d.forest(41, 760, 7), d.ground(880, "#7fae86"), A("fox", 700, 1.9, "#d98a4a"), d.envelope(1180, 560, 1.6)],
        alt: "手紙を持つきつねの郵便屋さん", text: "もりの ゆうびんやさんは きつねさん。" },
      { art: [d.bg("forest"), d.forest(42, 740, 6), d.ground(880, "#7fae86"), A("fox", 460, 1.5, "#d98a4a"), A("bear", 1120, 1.8, "#8a5a3b"), d.envelope(790, 600, 1.1)],
        alt: "くまに手紙を渡す", text: "「くまさん、おてがみ です。」" },
      { art: [d.bg("forest"), d.forest(43, 740, 6), d.ground(880, "#7fae86"), A("fox", 500, 1.5, "#d98a4a"), d.animal("bird", 1120, 380, 1.9, "#5aa7d6"), d.envelope(800, 560, 1.1)],
        alt: "木の上の鳥に手紙を渡す", text: "「とりさん、おてがみ です。」" },
      { art: [d.bg("dusk"), d.forest(44, 760, 5), d.ground(880, "#5f7a68"), A("fox", 700, 1.9, "#d98a4a"), d.envelope(1160, 560, 1.7)],
        alt: "夕方、一通だけ残った手紙", text: "さいごの いちまい。あて名が ありません。" },
      { art: [d.bg("dusk"), d.forest(45, 760, 5), d.ground(880, "#5f7a68"), A("fox", 800, 2.3, "#d98a4a")],
        alt: "考え込むきつね", text: "だれに とどければ いいのかな。" },
      { art: [d.bg("night"), d.stars(46), d.forest(47, 780, 5), d.ground(880, "#3f5a4a"), d.house(900, 820, 1), A("fox", 420, 1.5, "#d98a4a")],
        alt: "夜、明かりのついた自分の家", text: "うちに かえって、ふうを あけました。" },
      { art: [d.bg("room"), d.lamp(1180, 340, 1.7), A("fox", 640, 2.2, "#d98a4a", 900), d.envelope(1120, 640, 1.4)],
        alt: "手紙を読むきつね", text: "「いつも ありがとう。もりの みんなより」" },
      { art: [d.bg("night"), d.stars(49), d.moon(1300, 210, 110), d.ground(900, "#3f5a4a"), d.house(760, 840, 1.15)],
        alt: "月あかりの家", text: "きつねさんは、しばらく うごけませんでした。" },
    ],
  },
  {
    slug: "umi-no-otoshimono",
    title: "うみの おとしもの",
    age: [4, 7],
    summary: "なみうちぎわで ひろった ものを、もちぬしに かえしに いきます。",
    pages: [
      { art: [d.bg("sea"), d.sun(1300, 220, 120), d.waves(660), d.ground(920, "#e8d8b0")],
        alt: "晴れた海と砂浜", text: "うみに いきました。" },
      { art: [d.bg("sea"), d.waves(560), d.ground(820, "#e8d8b0"), C(620, 1.5, "#5aa7d6", 930), d.seed(1140, 870, 3.4, 20)],
        alt: "砂浜で何かを拾う子ども", text: "なみうちぎわに、なにか おちて いました。" },
      { art: [d.bg("sea"), d.waves(820), d.fish(600, 420, 1.8, "#e8a33c"), d.fish(1120, 600, 1.5, "#d9524a")],
        alt: "海の中を泳ぐ魚たち", text: "「これ、だれの ものですか。」" },
      { art: [d.bg("sea"), d.waves(880), d.fish(420, 380, 1.5, "#5aa7d6"), d.fish(880, 560, 2, "#e8a33c"), d.fish(1280, 350, 1.2, "#79b96a")],
        alt: "魚たちが集まってくる", text: "さかなたちが あつまって きました。" },
      { art: [d.bg("sea"), d.waves(900), d.fish(760, 480, 3.4, "#79b96a")],
        alt: "大きな魚が近づく", text: "「それは、とおくの しまの たねだよ。」" },
      { art: [d.bg("day"), d.waves(520, "#2f7f95"), d.ground(800, "#e8d8b0"), C(520, 1.4, "#5aa7d6", 930), d.seed(1120, 560, 3, -30)],
        alt: "砂浜に立つ子どもと、風に舞う種", text: "｜遠《とお》くから、うみを わたって きたのです。" },
      { art: [d.bg("day"), d.sun(300, 240, 100), d.ground(880, "#8fae74"), d.seed(820, 620, 3.6, 10)],
        alt: "土に置かれた種", text: "うちの にわに うめました。" },
      { art: [d.bg("day"), d.sun(320, 240, 100), d.ground(880, "#8fae74"), d.tree(760, 900, 2.2, "#4f8b5a"), C(1230, 1.3, "#5aa7d6", 900)],
        alt: "育った木のそばに立つ子ども", text: "いまは、みたことの ない はっぱが ゆれて います。" },
    ],
  },
  {
    slug: "yuki-no-ashiato",
    title: "ゆきの あしあと",
    age: [2, 4],
    summary: "ゆきの うえの あしあとを たどって いきます。",
    pages: [
      { art: [d.bg("snow"), d.hills("#a9c0d4", 660), d.forest(56, 780, 5), d.hills("#dfe9f2", 780),
              d.ground(880, "#f4f8fb"), d.snowfall(51, 55)],
        alt: "雪をかぶった森と、一面の雪原", text: "ゆきが つもりました。" },
      { art: [d.bg("snow"), d.hills("#dfe9f2", 700), d.snowfall(52, 30), d.ground(860, "#f4f8fb"), d.tracks(910, 260, 1340, 7, "#b9cbdb", 1.2)],
        alt: "雪の上に続く小さな足あと", text: "あしあとが つづいて います。" },
      { art: [d.bg("snow"), d.hills("#dfe9f2", 700), d.snowfall(53, 30), d.ground(860, "#f4f8fb"), d.tracks(920, 200, 700, 4, "#b9cbdb", 1), A("mouse", 1080, 1.7, "#b9bfcb", 900)],
        alt: "ねずみがいた", text: "だれの あしあと？　ねずみさん でした。" },
      { art: [d.bg("snow"), d.hills("#dfe9f2", 700), d.snowfall(54, 30), d.ground(860, "#f4f8fb"), A("rabbit", 560, 1.9, "#eef2f5", 900), A("mouse", 1080, 1.5, "#b9bfcb", 900)],
        alt: "うさぎとねずみ", text: "うさぎさんの あしあとも ありました。" },
      { art: [d.bg("snow"), d.hills("#dfe9f2", 700), d.snowfall(55, 30), d.ground(860, "#f4f8fb"), d.tracks(930, 180, 620, 3, "#a8bdd0", 1.9), A("bear", 980, 2.3, "#8a5a3b", 900)],
        alt: "大きなくま", text: "おおきい あしあとは、くまさん。" },
      { art: [d.bg("dusk"), d.ground(860, "#e6ecf2"), d.house(840, 830, 1.05), A("bear", 380, 1.5, "#8a5a3b"), A("rabbit", 1300, 1.2, "#eef2f5")],
        alt: "夕暮れ、家に帰るみんな", text: "みんな、おうちに かえります。" },
    ],
  },
  {
    slug: "tane-no-tabi",
    title: "かぜと たねの たび",
    age: [5, 8],
    summary: "かぜに のった たねが、おちる ばしょを さがします。",
    pages: [
      { art: [d.bg("day"), d.sun(1300, 240, 110), d.ground(900, "#8fae74"), d.tree(360, 920, 2.4, "#4f8b5a"), d.seed(880, 480, 3.2, 15)],
        alt: "木から離れる種", text: "たねは、｜親《おや》の 木から はなれました。" },
      { art: [d.bg("day"), d.hills("#8fae74"), d.seed(700, 360, 3, -20), d.seed(1080, 520, 2.2, 40), d.seed(420, 560, 1.8, 10)],
        alt: "風に舞う種たち", text: "かぜが つよく ふいて います。" },
      { art: [d.bg("day"), d.sun(360, 230, 130), d.ground(880, "#c9b79a"), d.seed(900, 560, 3.2, 60)],
        alt: "乾いた土地に落ちそうな種", text: "ここは かわいて いる。まだ おりない。" },
      { art: [d.bg("sea"), d.waves(760), d.seed(800, 400, 3.2, -40)],
        alt: "海の上を飛ぶ種", text: "うみの うえ。ここでは そだてない。" },
      { art: [d.bg("dusk"), d.hills("#6f7a68"), d.seed(640, 420, 2.8, 25), d.seed(1080, 540, 2, -15)],
        alt: "夕暮れの空を飛ぶ種", text: "ひが くれて きました。まだ きまりません。" },
      { art: [d.bg("dawn"), d.hills("#7f9a6a"), d.ground(900, "#8fae74"), d.seed(820, 780, 3.6, 0)],
        alt: "朝、やわらかい土に落ちた種", text: "あさ。やわらかい つちの うえに おちました。" },
      { art: [d.bg("day"), d.sun(1300, 250, 110), d.ground(880, "#8fae74"),
              '<g transform="translate(800 900) scale(2.2)"><rect x="-7" y="-90" width="14" height="90" rx="7" fill="#4f8b5a"/><ellipse cx="-40" cy="-90" rx="40" ry="22" fill="#79b96a"/><ellipse cx="40" cy="-90" rx="40" ry="22" fill="#79b96a"/></g>'],
        alt: "芽が出た", text: "め が でました。" },
      { art: [d.bg("day"), d.sun(1300, 250, 110), d.ground(880, "#8fae74"), d.tree(760, 920, 2.6, "#4f8b5a"), d.seed(1300, 480, 2.4, 30)],
        alt: "大きく育った木から、また種が飛ぶ", text: "そして いつか、また たねが とびます。" },
    ],
  },
  {
    slug: "yoru-no-toshokan",
    title: "よるの としょかん",
    age: [6, 9],
    summary: "よるの としょかんで、本たちが ひらく じかんの おはなし。",
    pages: [
      { art: [d.bg("night"), d.stars(61), d.moon(1320, 200, 90), d.hills("#2a3550"), d.house(800, 830, 1.25, "#e6d6bd", "#7d5a3c", false)],
        alt: "夜の図書館の建物", text: "としょかんが しまりました。" },
      { art: [d.bg("room"), d.lamp(1300, 260, 1.3), d.shelf(430), d.shelf(760),
              d.book(280, 350, 1.1, "#c25b3a"), d.book(600, 350, 1.1, "#5aa7d6"), d.book(920, 350, 1.1, "#79b96a"),
              d.book(280, 680, 1.1, "#e8a33c"), d.book(600, 680, 1.1, "#8f7ac4")],
        alt: "本棚に並ぶ本", text: "だれも いなく なると、本が うごきます。" },
      { art: [d.bg("room"), d.lamp(280, 300, 1.2), d.book(830, 520, 3, "#c25b3a")],
        alt: "大きく開いた本", text: "ぱらり。｜表紙《ひょうし》が ひらきました。" },
      { art: [d.bg("room"), d.lamp(300, 300, 1.1), A("mouse", 950, 2, "#b9bfcb", 900), d.book(480, 620, 1.7, "#5aa7d6")],
        alt: "本を読むねずみ", text: "よむのは、ここに すんで いる ねずみです。" },
      { art: [d.bg("room"), d.lamp(1250, 260, 1.3), A("mouse", 640, 2, "#b9bfcb", 900), d.book(1120, 640, 1.5, "#79b96a"), d.book(280, 660, 1.4, "#e8a33c")],
        alt: "何冊も並べて読んでいる", text: "きょうは、うみの 本を えらびました。" },
      { art: [d.bg("sea"), d.waves(820), d.fish(620, 400, 2, "#e8a33c"), d.fish(1120, 560, 1.6, "#5aa7d6"), A("mouse", 300, 1.3, "#b9bfcb", 940)],
        alt: "本の中の海の世界", text: "ページの なかは、いつも どこかへ つながって います。" },
      { art: [d.bg("dawn"), d.hills("#8f8f9a"), d.house(800, 830, 1.25, "#e6d6bd", "#7d5a3c", false)],
        alt: "朝の図書館", text: "そらが しらんで きました。" },
      { art: [d.bg("room"), d.shelf(430), d.shelf(760),
              d.book(280, 350, 1.1, "#c25b3a"), d.book(600, 350, 1.1, "#5aa7d6"), d.book(920, 350, 1.1, "#79b96a"),
              d.book(280, 680, 1.1, "#e8a33c"), d.book(600, 680, 1.1, "#8f7ac4"), A("mouse", 1330, 1.2, "#b9bfcb", 940)],
        alt: "本が棚に戻っている", text: "本は しらんぷりして、たなに もどりました。" },
    ],
  },
  {
    slug: "chiisana-niji",
    title: "ちいさな にじ",
    age: [0, 3],
    summary: "みずたまりに うつった、ちいさな にじの おはなし。",
    pages: [
      { art: [d.bg("snow"), d.rainfall(71, 70), d.ground(880, "#8fae74")],
        alt: "雨がふっている", text: "あめ。" },
      { art: [d.bg("dawn"), d.ground(880, "#8fae74"), d.puddle(800, 910, 330, 80)],
        alt: "地面にできた水たまり", text: "みずたまりが できました。" },
      { art: [d.bg("day"), d.sun(1290, 240, 120), d.ground(880, "#8fae74"), d.puddle(800, 910, 330, 80)],
        alt: "日がさしてきた水たまり", text: "ひが さして きました。" },
      { art: [d.bg("day"), d.sun(1290, 240, 120), d.ground(880, "#8fae74"), d.puddle(800, 910, 330, 80), d.rainbow(800, 900, .58)],
        alt: "水たまりの中に小さな虹", text: "あっ。ちいさな にじ。" },
      { art: [d.bg("day"), d.sun(1290, 240, 120), d.ground(880, "#8fae74"), d.puddle(900, 915, 300, 74), d.rainbow(900, 906, .52), C(380, 1.5, "#79b96a", 915)],
        alt: "のぞきこむ子ども", text: "そうっと のぞきます。" },
      { art: [d.bg("day"), d.sun(1260, 230, 120), d.hills("#6f9a78"), d.rainbow(820, 860, 1.25)],
        alt: "空に大きな虹", text: "そらにも、おおきいのが ありました。" },
    ],
  },
  {
    slug: "ojiichan-no-radio",
    title: "おじいちゃんの ラジオ",
    age: [6, 9],
    summary: "こわれた ラジオから、ある よる おとが きこえました。",
    pages: [
      { art: [d.bg("room"), d.lamp(1300, 260, 1.2), d.radio(720, 540, 2)],
        alt: "机の上の古いラジオ", text: "おじいちゃんの ラジオが、｜押入《おしい》れから でて きました。" },
      { art: [d.bg("room"), d.lamp(1300, 250, 1), d.radio(600, 560, 1.7), C(1180, 1.5, "#5aa7d6", 920)],
        alt: "ラジオをのぞきこむ子ども", text: "スイッチを ひねっても、なにも きこえません。" },
      { art: [d.bg("room"), d.lamp(280, 280, 1), d.radio(840, 540, 2.3)],
        alt: "動かないラジオ", text: "こわれて いるのだと おもいました。" },
      { art: [d.bg("night"), d.stars(81), d.moon(1300, 200, 100), d.hills("#2a3550"), d.house(760, 840, 1.15)],
        alt: "夜の家", text: "その ばん。" },
      { art: [d.bg("room"), d.lamp(800, 460, 2.2), d.radio(800, 600, 2.1)],
        alt: "夜、光るラジオ", text: "ざあ…… という おとで、目が さめました。" },
      { art: [d.bg("room"), d.lamp(700, 420, 1.6), d.radio(660, 600, 1.7), C(1200, 1.4, "#5aa7d6", 920)],
        alt: "ラジオに耳を近づける", text: "みみを ちかづけると、｜歌《うた》が ながれて いました。" },
      { art: [d.bg("dusk"), d.hills("#6b5a6a"), d.house(1050, 830, 1), d.radio(420, 620, 1.5)],
        alt: "夕暮れの家とラジオ", text: "しらない 歌 なのに、なつかしい 歌 でした。" },
      { art: [d.bg("day"), d.sun(1300, 250, 110), d.ground(900, "#8fae74"), C(620, 1.6, "#5aa7d6", 900), d.radio(1130, 700, 1.3)],
        alt: "昼、ラジオを抱えた子ども", text: "あさに なったら、また しずかに なりました。それでも、すてません。" },
    ],
  },
];

/* ── 書き出す ─────────────────────────────────── */

let files = 0;
for (const b of BOOKS) {
  const dir = join(root, "books", b.slug);
  await mkdir(dir, { recursive: true });

  const pages = [];
  for (const [i, p] of b.pages.entries()) {
    const name = `p${String(i + 1).padStart(2, "0")}.svg`;
    await writeFile(join(dir, name), d.page(p.art), "utf8");
    files++;
    pages.push({ image: name, alt: p.alt, text: p.text });
  }

  await writeFile(join(dir, "book.json"), `${JSON.stringify({
    slug: b.slug,
    title: b.title,
    author: "編集部",
    age_min: b.age[0],
    age_max: b.age[1],
    // 声に出して読む速さで見積もる。ページをめくる間も含める
    reading_minutes: Math.max(2, Math.round(b.pages.length / 2) + 1),
    cover: "p01.svg",
    summary: b.summary,
    pages,
  }, null, 2)}\n`, "utf8");

  console.log(`○ ${b.slug}（${b.pages.length}ページ）`);
}

console.log(`\n${BOOKS.length}冊 / 絵 ${files}枚 を書き出した。`);
console.log("つづけて node ehon/tools/build-index.mjs を走らせること。");
