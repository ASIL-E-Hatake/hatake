// AI / 機械が取りに来る素材。安定した URL で素のまま返すのが目的なので、
// サイト側では書き換えず複製するだけ（中身の正はリポジトリのファイル）。
//
// generate.mjs（複製と一覧表の生成）と .vitepress/config.mts（リンク検査の除外）が
// 同じこの1か所を読む。片方だけ増やして齟齬るのを防ぐため。
export const assets = [
  { from: 'llms.txt', to: 'llms.txt', use: 'AI 向けの入口。まずこれ1枚' },
  { from: 'llms-en.txt', to: 'llms-en.txt', use: '同じものの英語版' },
  {
    from: 'docs/api-cheatsheet.ja.md',
    to: 'api-cheatsheet.ja.md',
    use: '書ける名前の一覧＋最小例。実装を読まずに書ける',
  },
  { from: 'docs/api-cheatsheet.md', to: 'api-cheatsheet.md', use: 'チートシートの英語版' },
  { from: 'spec/reference.json', to: 'reference.json', use: '全キーの索引（型・既定値・書ける場所）。機械可読' },
  { from: 'spec/pitfalls.json', to: 'pitfalls.json', use: 'よくある間違い→正しい書き方。機械可読' },
  { from: 'spec/examples/index.json', to: 'examples-index.json', use: '「やりたいこと→例」の索引。機械可読' },
  {
    from: 'spec/hatake-page.schema.json',
    to: 'hatake-page.schema.json',
    use: 'JSON Schema。エディタ補完と機械検証用',
  },
  { from: 'spec/dsl-spec.ja.md', to: 'dsl-spec.ja.md', use: '全仕様（長い。普段は引かなくてよい）' },
  { from: 'spec/dsl-spec.md', to: 'dsl-spec.md', use: '仕様の英語版' },
];

/**
 * `.md` の素材へのリンクを、VitePress のリンク検査から外すためのパターン。
 * 検査は `.md` を落とした形（/dsl-spec.ja）で照合してくるので、その形で作る。
 */
export const staticMarkdownLinks = assets
  .filter((a) => a.to.endsWith('.md'))
  .map((a) => new RegExp(`^/${a.to.replace(/\.md$/, '').replace(/\./g, '\\.')}$`));
