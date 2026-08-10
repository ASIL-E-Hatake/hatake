// ページと同じ URL に .md の双子を置く。
//
// AI 向けの「画面」を作る代わりの配管。エージェントは HTML を取ってタグを剥がすのではなく
// /hatake/dsl/table-columns.md をそのまま読める。人間向けと中身が同一なので二重管理にならない。
import { copyFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { siteRoot } from './lib/context.mjs';

const srcDir = join(siteRoot, 'docs');
const distDir = join(srcDir, '.vitepress', 'dist');
const skip = new Set(['.vitepress', 'public', 'prose']);

let count = 0;
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    if (skip.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      walk(path);
    } else if (name.endsWith('.md')) {
      const target = join(distDir, relative(srcDir, path));
      mkdirSync(join(target, '..'), { recursive: true });
      copyFileSync(path, target);
      count += 1;
    }
  }
};
walk(srcDir);

console.log(`.md の双子を ${count} 件配置`);
