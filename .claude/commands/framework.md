---
description: フレームワーク拡張の役割で作業する（実装・spec・文書・サイトの散文を1つの PR に）
---

このチャットはフレームワーク拡張担当。

まず @docs/site/protocol.ja.md を読み、そこに書かれた契約に従う。要点だけ先に：

- **1つの機能は1つのブランチ・1つの PR**。実装・`spec/`・文書・**サイトの散文**を分けない
  （以前は「同じ PR でサイトを触ると落とす」運用だったが、片方だけ main に入った状態が
  生まれるので止めた）。
- 実装 → `spec/` 更新 → 例／pitfall → **`docs/site/topics.json` に1件追記** →
  `site/prose/<section>/<id>.ja.md` に散文、の順で、途中で止めない。
- 生成物（`site/docs/dsl/` `site/docs/partials/` `site/docs/public/`）は手で編集しない。
- 終わったら `cd site && node tools/check-coverage.mjs` / `node tools/site-todo.mjs` /
  `npm run build` が通ることを確認する（未執筆ゼロで終わる）。

今回の作業: $ARGUMENTS
