// サイトの URL に関する事実を1か所に置く。config.mts と generate.mjs が同じここを読む。

/** GitHub Pages のプロジェクトページとして配信する。 */
export const base = '/hatake/';

/** デモは Flutter Web のビルド成果物で、VitePress のページではない。 */
export const demoUrl = `${base}demo/`;

/**
 * デモへのリンク。**`target` は必須**。
 *
 * VitePress のルータは、`target` 属性が無い同一オリジンのリンクを乗っ取って
 * SPA 遷移させる。デモは VitePress のページではないので、乗っ取られると 404 になる。
 * `target="_self"` を付けると乗っ取りを止めて、普通のページ遷移になる。
 * （Markdown の `[デモ](/demo/)` は属性を付けられないので、生の <a> で書く）
 */
export const demoLink = (text) => `<a href="${demoUrl}" target="_self">${text}</a>`;
