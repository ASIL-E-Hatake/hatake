# 仕組みと責務分担

> **中身**: 何が誰の担当か。**自分のコードをどこに書くか**が分かるようにするための1枚。
> **読むとき**: 「このロジックはどこに置けばいい？」と迷ったとき。定義の書き方は [チートシート](../api-cheatsheet.ja.md)。
> **結論**: 自分が書くのは **①定義 ②Repository**、必要なら **③プラグイン**。画面コードは書かない。

## 4層

```
① 定義（YAML / JSON / Dart ビルダー）      ← あなたが書く
      │  Parser
      ▼
② PageDefinition / AppDefinition          ← 唯一の正（言語非依存・不変オブジェクト）
      │
      ├─▶ ③ Controller（状態・呼び出し）   ← Framework が用意
      │        │  Repository 経由でデータ  ← あなたが書く
      ▼        ▼
④ Renderer（描画のみ・交換可能）           ← Framework が用意（拡張可）
```

## 登場人物

| 登場人物 | 誰の担当 | 責務 | 持ってはいけないもの |
|---|---|---|---|
| **定義** | あなた | 何の画面か（項目・検証・整形・遷移） | — |
| **Repository** | **あなた（必須）** | データ取得/更新の5メソッド。HTTP・DB・ORM は自由 | — |
| `RepositoryRegistry` | Framework | 定義の `repository` キー → 実装の解決 | — |
| `HatakeScope` | Framework | 上記＋Renderer＋各Registry＋ロールをツリーに供給 | — |
| Controller（`ListController` / `CrudController` / `DetailController` / `FormController`） | Framework | 一覧・ページング・検索・下書き・検証・保存の状態管理 | — |
| **Renderer**（`MaterialRenderer`） | Framework（差し替え可） | 定義を Widget に変換する**だけ** | 業務ロジック・Repository・HTTP |
| Registry 群（Validator / Converter / Formatter / Computed / Action） | Framework＋**あなたの追加** | 「開いた文字列キー → 実装」の解決 | — |

## Framework が持たないもの

意図的に持ちません（[CLAUDE.md](../../CLAUDE.md) の Scope）。ここは自分で作るか、既存の仕組みに任せる領域です。

業務ロジック／ワークフローエンジン／DB・ORM／**認証・認可**／Backend API

> `roles` による出し分けは**画面表示の制御だけ**。本当のアクセス制御はサーバ側で必ず行う。

## データの流れ

**一覧・検索**
1. 画面のフィルタ入力 → Controller が `RepositoryQuery`（filters / page / pageSize / sortField）を組む
2. あなたの `Repository.search(query)` が `PageResult(items, totalCount)` を返す
3. Renderer が `table.columns` の定義どおりに描画（`format` があれば整形して表示）

**登録・更新**
1. フォーム入力 → 送信
2. **`normalize`** を自動適用（例 `[toHankaku, trim]`）
3. **バリデーション**（`required` / `validators`）→ NG なら項目下にメッセージを出して中断
4. OK なら `Repository.create` / `update` を呼ぶ

つまり「正規化→検証→永続化」の順番はFrameworkが保証するので、Repository には**きれいな値**が届きます。

## 拡張したいときの選択肢

| やりたいこと | 方法 |
|---|---|
| 独自の検証ルール | `ValidatorRegistry` に登録 → [検証ガイド](validation.ja.md) |
| 独自の表示整形・入力変換 | `FormatterRegistry` / `ConverterRegistry` に登録 |
| 独自のフィールド型（色ピッカー等） | `MaterialRenderer(fieldBuilders: {...})` |
| ボタンで独自処理（CSV出力等） | `type: plugin` ＋ `ActionRegistry` |
| 見た目を全面的に変える | `Renderer` を自作（`buildCrudPage` 等を実装） |

**本体を fork しない**のが原則。手順は [Plugin ガイド](../../flutter/docs/plugins.ja.md)。

## 「同じ定義」をサーバでも使う

`PageDefinition` はUI専用ではありません。Java / TypeScript 版が同じ定義を読んで**サーバ側バリデーション**とクエリ組み立てに使えます（フロントとバックで検証がズレない）。→ [バックエンド連携](backend.ja.md)
