/*
 * どうがリスト（ここだけ書きかえれば中身を差しかえられます）
 *
 * id    : YouTube の動画ID。 https://www.youtube.com/watch?v=XXXXXXXXXXX の XXXXXXXXXXX の部分
 * short : ルーレットの上に出る みじかい なまえ（3〜6文字くらいが読みやすい）
 * emoji : ルーレットのマス目に出るえ
 * haru  : はるちゃんが出てくる回は true。ルーレットで出やすくなります。
 * title : 画面には出ない、あとで見分けるためのメモ
 *
 * ※ 埋め込みが禁止されている動画は再生できません。その場合はアプリが
 *   自動で次の動画にスキップするので、気づいたらこのファイルから消してください。
 */

const APP_CONFIG = {
  // 続けて見られる時間（分）。0 にすると時間制限なし。
  sessionMinutes: 20,
  // 1本終わったら自動で次の動画を流すか
  autoPlayNext: true,
  // ルーレットのマス目の数（多すぎると小さくて押しにくい）
  wheelSlots: 8,
  // はるちゃんの回がルーレットで選ばれやすくなる倍率
  haruWeight: 3,
};

const CATEGORIES = [
  {
    key: 'wanwan',
    label: 'わんわん',
    emoji: '🐶',
    color: '#ff8fab',
    // はるちゃんが出てくる回を先頭にならべています
    videos: [
      { id: '0oc7_yryqYQ', short: 'わ〜お', emoji: '🙌', haru: true, title: 'わ〜お！（振り付き）はるちゃん・ワンワン・うーたん' },
      { id: 'JN_3klSVFTE', short: 'ピカピカブ〜', emoji: '✨', haru: true, title: 'いないいないばあっ！ ピカピカブ～！' },
      { id: 'BoGSO2CJ2XM', short: 'ダカランド', emoji: '🎪', haru: true, title: 'ダカランド はるちゃん・ワンワン・うーたん' },
      { id: 'sA3G6NpMtqM', short: 'ドーナツ', emoji: '🍩', haru: true, title: 'どんだけドーナツ！？ うーたん／はるちゃん／ワンワン' },
      { id: '8qCRBTfjSTA', short: 'またね', emoji: '👋', haru: true, title: 'またね（はるちゃん・うーたん卒業ソング）' },
      { id: 'wJ9QPrFcFjA', short: 'ダンス', emoji: '💃', title: 'いないいないばあっ！ ワンワン☆ダンス' },
      { id: 'vJzUGFZ1nL8', short: 'ワンワン25', emoji: '🎂', title: '【いないいないばあっ！】ワンワン25ショート動画集' },
      { id: 'Um2rvK39EbU', short: 'かんぱ〜い', emoji: '🥤', title: 'ワンワン＆うーたん かんぱ～い！（ショートver.）' },
      { id: 'ZH8HDsCETpo', short: 'むしとり', emoji: '🦋', title: 'ワンワン＆うーたん 虫とり（ショートver.）' },
      { id: '1XJKhetJ61o', short: 'できた！', emoji: '🎶', title: 'ワンワンとうーたんのできた！できた！ ダイジェスト' },
      { id: 'yGhEBaL954M', short: 'ジャ〜ン！', emoji: '🎺', title: 'じゃじゃじゃ ジャ～ン！ ダイジェスト' },
      { id: '11nyp5Un34o', short: 'まつりだ', emoji: '🏮', title: 'ワンワンわんだーらんど まつりだ！はっぴぃ☆ ダイジェスト' },
    ],
  },
  {
    key: 'okaasan',
    label: 'おかあさん\nといっしょ',
    emoji: '🎵',
    color: '#7fd1ff',
    videos: [
      { id: '4ld10znrwpo', short: 'ダンダン', emoji: '💪', title: 'からだ☆ダンダン｜スペシャルステージ練習動画' },
      { id: 'F3loztzTpw4', short: 'パント！', emoji: '🎈', title: 'ブンバ・ボーン！ パント！スペシャル 紹介映像' },
    ],
  },
  {
    key: 'taisou',
    label: 'たいそう',
    emoji: '🤸',
    color: '#ffd166',
    videos: [
      { id: 'b4LbzldPOA0', short: 'ブンバボーン', emoji: '🐘', title: 'ブンバ・ボーン！（振り付き／うたスタ）' },
      { id: 'mQKKx-QWVQM', short: 'ブンバ2', emoji: '🦁', title: 'ブンバ・ボーン！ 2023年版（うたスタ）' },
      { id: 'ucMBVuBCZRI', short: 'いっしょに', emoji: '🕺', title: 'ブンバ・ボーン！ 一緒にダンス（うたスタ）' },
      { id: 'V59WTvUhkDc', short: 'おどってみた', emoji: '🎼', title: 'ブンバ・ボーン！ 踊ってみた（うたスタ）' },
    ],
  },
];

// 「ぜんぶ」のルーレットで、どのカテゴリが出やすいか
const SHUFFLE_WEIGHTS = {
  wanwan: 6,
  okaasan: 2,
  taisou: 2,
};
