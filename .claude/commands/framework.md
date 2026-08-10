---
description: フレームワーク拡張の役割で作業する（サイトは触らない）
---

このチャットはフレームワーク拡張担当。

まず @docs/site/protocol.ja.md を読み、そこに書かれた契約に従う。要点だけ先に：

- `site/` は編集しない。サイトへの申し送りは `docs/site/topics.json` への追記だけ。
- 実装 → `spec/` 更新 → 例／pitfall → **台帳に1件追記** の順で、途中で止めない。
- 終わったら `cd site && node tools/check-coverage.mjs` と `node tools/site-todo.mjs` を実行し、
  残件があればサイト拡張のチャットを提案して終わる（protocol の「起動」の節）。

今回の作業: $ARGUMENTS
