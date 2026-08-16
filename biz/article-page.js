/**
 * 生成した記事ページ（a/<slug>/index.html）に足すぶん
 *
 * 本文と目次はHTMLに埋まっているので、ここでは描かない。
 * **JSが動かなくても記事は読める。** ここでやるのは次の2つだけ。
 *
 *   1. いま読んでいる見出しに、目次で印を付ける
 *   2. DBから取り込んだ記事なら、いいねと通報を出す
 *
 * 2は <body data-work-id="…"> が付いているときだけ。
 * リポジトリで書いた記事にはDBの行がないので、押す先がない。
 */
import { watchToc, setupReactions } from "./article-parts.js";

watchToc();
setupReactions(document.body.dataset.workId || null);
