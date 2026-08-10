---
layout: home
title: 業務画面を「定義」で作る
titleTemplate: hatake — 宣言型の業務アプリフレームワーク
hero:
  name: hatake
  text: 業務画面を「定義」で作る
  tagline: 検索・一覧・CRUD・入力フォーム・帳票・ダッシュボード。UI コードではなく YAML を書く。Flutter は描画に使う実装技術であって、書く対象ではない。
  actions:
    - theme: brand
      text: 機能別の書き方
      link: /dsl/
    - theme: alt
      text: 動くデモを見る
      link: /demo/
    - theme: alt
      text: AI に書かせる
      link: /ai
features:
  - title: 定義が唯一の正
    details: 画面は PageDefinition に集約される。YAML / JSON / API のどれで持ってきても、内部では同じ定義に収束する。
  - title: バックエンドを選ばない
    details: Spring Boot / ASP.NET / Node / Laravel / Firebase / Supabase。Framework が知っているのは Repository のインタフェースだけ。
  - title: 描画は差し替えられる
    details: Material3 で描く。Renderer は定義を描画するだけで業務ロジックを持たないので、Fluent や Cupertino に替えられる。
  - title: AI が書きやすい
    details: 仕様は機械可読（JSON Schema・キー索引・間違いカタログ）。MCP サーバ経由で、実装を読ませずに定義を書かせられる。
---

## 定義1枚で、この画面ができる

一覧・並べ替え・行の編集削除・入力フォーム・必須チェックまで、これで全部。Dart は1行も書かない。

<<< ../../spec/examples/dept_master.yaml{yaml}

書いたら推測で終わらせずに検証する。知らないキーは黙って捨てられるので、「書いた気になって効いていない」を防ぐのはこれ。

```bash
npx hatake validate dept_master.yaml
```

## 次にどこを見るか

| やりたいこと | 行き先 |
| --- | --- |
| 「こうしたい」から書き方を引く | [機能別の書き方](/dsl/) |
| 動いている画面を触る | [デモ](/demo/) |
| 自分の AI に hatake を書かせる | [AI に書かせる](/ai) |
| 導入手順・仕組み・写経用サンプル | [GitHub のドキュメント](https://github.com/ASIL-E-Hatake/hatake/blob/main/docs/index.ja.md) |

## この Framework が持たないもの

業務ロジック、ワークフローエンジン、DB、認証、認可、バックエンド API、ORM。持たないと決めているので、そこは普通に自分のコードで書く。境界は [仕組みと責務分担](https://github.com/ASIL-E-Hatake/hatake/blob/main/docs/guide/concepts.ja.md) にある。
