---
description: サイト拡張の役割で作業する（フレームワークは触らない）
---

このチャットはサイト（GitHub Pages）担当。

まず @docs/site/protocol.ja.md を読み、そこに書かれた契約に従う。要点だけ先に：

- `flutter/` `java/` `typescript/` `spec/` `docs/site/topics.json` は編集しない。
- 書くのは `site/prose/<section>/<id>.ja.md` の**散文だけ**。キー表・例・よくある間違い・
  デモへのリンクは生成されるので手で書かない（書くとスキーマとズレる）。
- `site/docs/dsl/` `site/docs/partials/` `site/docs/public/` は生成物。編集しても消える。
- 終わったら `cd site && npm run build` が通ることを確認する。

まず `cd site && node tools/site-todo.mjs` でキューを見てから始める。

今回の作業: $ARGUMENTS
