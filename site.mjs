/**
 * 配信しているURLの根。**移設したらここだけ直す。**
 *
 * 生成物（記事ページの canonical、Instagram に渡す画像URLなど）に焼き込まれるので、
 * 直書きを散らかすと移設のたびに探し回ることになる。ここ1か所にまとめてある。
 *
 * ■ 移設の手順は sekkei/idou-cloudflare.md
 *
 * ■ 画面のほうは直さなくてよい
 *   HTML・CSS・JS はすべて相対パス（./ と ../）で書いてある。
 *   だから `…/my-ai-agent/` の下でも、ドメインの直下でも、そのまま動く。
 *   **この決まりは崩さないこと。** `/biz/…` のようなルート絶対パスを1つ書くと、
 *   移設した瞬間にそこだけ壊れる。
 *
 * 直したあとは、生成物を作り直してコミットする。
 *   node biz/tools/build-index.mjs
 *   node insta/tools/build-posts.mjs
 */

/** 末尾は必ず / で終える */
export const SITE = "https://todo2023.github.io/my-ai-agent/";

/** 移設先が決まったら、上を差し替える。控えとして残しておく
 *  export const SITE = "https://ehon-tana.pages.dev/";
 */

export const BIZ = `${SITE}biz/`;
export const EHON = `${SITE}ehon/`;
export const INSTA = `${SITE}insta/`;
