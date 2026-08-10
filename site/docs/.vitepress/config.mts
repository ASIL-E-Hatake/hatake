import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitepress';
import { staticMarkdownLinks } from '../../tools/lib/assets.mjs';
import { base } from '../../tools/lib/site.mjs';

// サイドバーと目次は台帳から作る。トピックを1件足したらナビにも自動で出る。
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const topics = JSON.parse(readFileSync(join(repoRoot, 'docs/site/topics.json'), 'utf8'));

const REPO = 'https://github.com/ASIL-E-Hatake/hatake';
const docLink = (path: string) => `${REPO}/blob/main/${path}`;

export default defineConfig({
  lang: 'ja-JP',
  title: 'hatake',
  description: '業務画面を「定義」で作る宣言型フレームワーク。UI コードを書かない。',
  base,
  cleanUrls: true,
  // public/ には AI 向けに複製した素材（仕様書・チートシート）が入る。そのまま配信するのが
  // 目的なので、ページとしてコンパイルさせない（外部リンクを含むためリンク検査に引っかかる）。
  srcExclude: ['public/**', 'partials/**'],
  // /demo/ は Flutter Web のビルド成果物、素材（.md）は public/ にそのまま置く配信物。
  // どちらもページとして存在しないのでリンク検査から除く。
  ignoreDeadLinks: [/^\/demo\//, ...staticMarkdownLinks],
  head: [
    // AI 向け: このサイトの入口が llms.txt であることを機械に知らせる。
    ['link', { rel: 'alternate', type: 'text/plain', href: '/hatake/llms.txt', title: 'llms.txt' }],
  ],
  themeConfig: {
    nav: [
      { text: '機能別の書き方', link: '/dsl/' },
      { text: 'AI に書かせる', link: '/ai' },
      { text: 'デモ', link: '/demo/', target: '_self' },
      {
        text: 'ドキュメント',
        items: [
          { text: 'はじめかた', link: docLink('docs/getting-started.ja.md') },
          { text: '仕組みと責務分担', link: docLink('docs/guide/concepts.ja.md') },
          { text: 'ページ種別の選び方', link: docLink('docs/guide/page-types.ja.md') },
          { text: 'cookbook（写経用）', link: docLink('docs/cookbook/README.md') },
          { text: 'ロードマップ', link: docLink('docs/roadmap.ja.md') },
        ],
      },
    ],
    sidebar: {
      '/dsl/': [
        {
          text: topics.sections.find((s: { id: string }) => s.id === 'dsl').title,
          items: [
            { text: '一覧', link: '/dsl/' },
            ...topics.topics
              .filter((t: { section: string }) => t.section === 'dsl')
              .map((t: { id: string; title: string }) => ({ text: t.title, link: `/dsl/${t.id}` })),
          ],
        },
      ],
    },
    socialLinks: [{ icon: 'github', link: REPO }],
    search: { provider: 'local' },
    outline: [2, 3],
    editLink: {
      pattern: `${REPO}/edit/main/site/prose/:path`,
      text: 'このページの説明を直す',
    },
    lastUpdated: false,
    docFooter: { prev: '前', next: '次' },
    darkModeSwitchLabel: '表示',
    returnToTopLabel: '先頭へ',
    sidebarMenuLabel: 'メニュー',
    outlineTitle: 'このページの内容',
  },
});
