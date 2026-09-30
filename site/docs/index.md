---
layout: home
title: 業務システムを「定義」で作る
titleTemplate: hatake — 業務定義フレームワーク
hero:
  name: hatake
  text: 業務システムを「定義」で作る
  tagline: 画面・サーバの検証・権限・API の形・設計書・試験まで、同じ1枚の定義から。UI コードではなく定義を書く（AI に書かせるのも定義）。Flutter / Vue / React は描画に使う実装技術であって、書く対象ではない。
  actions:
    - theme: brand
      text: 機能別の書き方
      link: /dsl/
    - theme: alt
      text: 動くデモを見る
      # デモは VitePress のページではないので、target が無いと SPA ルータに乗っ取られて
      # 404 になる。理由は tools/lib/site.mjs。
      link: /demo/
      target: _self
    - theme: alt
      text: 貼って試す
      # プレイグラウンドはデモアプリの中（同じ成果物）。target が無いと SPA ルータに
      # 乗っ取られて 404 になるのはデモと同じ理由。
      link: /demo/?playground=1
      target: _self
    - theme: alt
      text: AI に書かせる
      link: /ai
features:
  - title: 定義が唯一の正
    details: 画面は PageDefinition に集約される。YAML / JSON / API のどれで持ってきても、内部では同じ定義に収束する。
  - title: バックエンドを選ばない
    details: Spring Boot / ASP.NET / Node / Laravel / Firebase / Supabase。Framework が知っているのは Repository のインタフェースだけ。
  - title: 描画は差し替えられる
    details: Flutter（Material3）・Vue 3・React 19 で同じ定義から同じ画面。Renderer は定義を描画するだけで業務ロジックを持たないので、Fluent や Cupertino にも替えられる。
  - title: サーバも同じ定義で判断する
    details: 検証・問い合わせ・権限（開ける画面・押せるボタン・見せる項目・受け取る項目）を、画面と同じ定義から Java / TypeScript で。画面とサーバで規則がずれない。
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

## 何がどこまでやるのか

![定義から画面まで](/diagrams/architecture.svg)

人と AI が書くのは定義だけ。`PageDefinition` が唯一の正で、Renderer は業務を知らない。
データの流れと層の責務も [図解](/diagrams) にある。

## インストールせずに触る

上の YAML を貼って、その場で画面にできる場がある。<a href="/hatake/demo/?playground=1" target="_self">プレイグラウンド</a>。

- 直すと**その場で描き変わる**。データは定義から作った仮のもの（Repository を書かなくていい）
- 綴りを間違えたら**その場で理由が出る**（`sortble` → `sortable の間違い？`）
- 作った定義は URL で渡せる（`?yaml=` に載る）ので、そのままレビューに貼れる

ブラウザだけで動く（Flutter Web）。インストールも登録も要らない。

## 次にどこを見るか

| やりたいこと | 行き先 |
| --- | --- |
| **案件を始める**（画面を書く前に決めること） | [先に決めること](/project) |
| 「こうしたい」から書き方を引く | [機能別の書き方](/dsl/) |
| 全体像を絵で見る | [図解](/diagrams) |
| 動いている画面を触る | <a href="/hatake/demo/" target="_self">デモ</a>（右下の札で**役割を切り替える**と、隠れる列・出ないボタンが見える） |
| 自分で書いた定義を試す | <a href="/hatake/demo/?playground=1" target="_self">プレイグラウンド</a> |
| 自分の AI に hatake を書かせる | [AI に書かせる](/ai) |
| 導入手順・仕組み・写経用サンプル | [GitHub のドキュメント](https://github.com/ASIL-E-Hatake/hatake/blob/main/docs/index.ja.md) |

## この Framework が持たないもの

業務ロジック、ワークフローエンジン、DB、認証、認可、バックエンド API、ORM。持たないと決めているので、そこは普通に自分のコードで書く。

この境界は散文ではなく**引ける表**にしてある。「これは定義で書けるのか、自分で書くのか」を1発で。

```bash
npx hatake where 締め処理        # → 枠組みの外（なぜ持たないか＋画面側でできること）
npx hatake where 一覧の並べ替え   # → 定義で書ける（書くキーと次に引く道具）
```

AI に「締め処理も作って」と頼むと、外だと言えないまま Dart を書き始める。それを止めるための表で、MCP なら `hatake_where` として渡る。詳しくは [先に決めること](/project) と [仕組みと責務分担](https://github.com/ASIL-E-Hatake/hatake/blob/main/docs/guide/concepts.ja.md)。
