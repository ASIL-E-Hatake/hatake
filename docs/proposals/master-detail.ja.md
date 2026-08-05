# 提案：親子・明細（master-detail）

受注ヘッダ＋明細行のような**階層データ**を定義だけで扱えるようにする。業務CRUDはほぼ階層なので、これが無いと実務で刺さる（ロードマップに載っていなかった真の穴）。

## 何を作るか

1画面で「ヘッダ項目」＋「明細行グリッド（追加/編集/削除）」を編集し、**まとめて1回で保存**する。

```
┌ 受注 (form: ヘッダ項目) ─────────────┐
│ 受注番号 / 顧客 / 受注日             │
├ 明細 (subTable: 子行グリッド) ───────┤
│ 品名   数量  単価   金額   [x]       │
│ …                          [+行追加] │
└──────────────────────────────────────┘
                                [保存]
```

## 決定：子行は「親レコードの1項目」として持つ

| 案 | 内容 | 判定 |
|---|---|---|
| **A. 埋め込み（採用）** | 親レコードの項目が `List<Map>`（例 `lines: [{...}]`）。Repository は集約ごと返す/受ける | ✅ Repository 契約を増やさない。保存が1回で原子的＝「ヘッダと明細は一緒に保存」という業務実態に合う。DDD の集約と素直に対応 |
| B. 子Repository＋外部キー | 子を別 Repository から `parentKey` で検索 | ⏳将来。明細が大量でページングが要る場合向け。`subTable` に `repository` を足せば後付けできる |

Aで始めることで、**既存の `Repository` 5メソッドのまま**親子が扱える（`update(key, {..., lines: [...]})`）。

## DSL：新しいフィールド型 `subTable`

既存の語彙（form → sections → fields／table → columns）を再利用する。**新しいトップレベル構造を増やさない**のがポイント。

```yaml
form:
  sections:
    - title: 明細
      fields:
        - field: lines            # 親レコードのこの項目が List<Map>
          label: 明細
          type: subTable          # ← 新しい組込フィールド型
          columns:                # グリッドの表示列（table の column と同じ形）
            - { field: item,  label: 品名 }
            - { field: qty,   label: 数量, type: number, width: 100 }
            - { field: price, label: 単価, type: number, format: currency, config: { symbol: "¥" } }
          fields:                 # 行の編集フォーム（field と同じ形＝入れ子）
            - { field: item,  label: 品名, required: true }
            - { field: qty,   label: 数量, type: number, required: true,
                validators: [ { type: min, value: 1 } ] }
            - { field: price, label: 単価, type: number, required: true }
```

- `columns` … 一覧表示（既存 `column` を流用＝`format` / `width` / `roles` がそのまま効く）
- `fields` … 行の編集項目（既存 `field` を流用＝`required` / `validators` / `normalize` / `computed` がそのまま効く）
- `fields` 省略時は `columns` から素朴に導出する
- 値は `List<DataRecord>`。空/未設定は空リスト扱い

**既存機能がそのまま乗る**のが利点: 行内の計算項目（`computed: { op: product, fields: [qty, price] }` で金額）、行内バリデーション、`roles` による列の出し分け。

## 段階

| Phase | 内容 | 状態 |
|---|---|---|
| **1** | spec（dsl-spec＋JSON Schema）／Dart モデル（`FieldTypes.subTable`＋`FieldDefinition.columns`・`rowFields`）／パーサ／DSLビルダー／テスト | ← 今回 |
| 2 | Flutter 描画（明細グリッド＋行追加/編集/削除、行内 computed の再計算）／デモに受注入力画面 | 次 |
| 3 | サーバ側（TS/Java）：モデル＋パーサ＋**明細行のバリデーション**（`FormValidator` を子行に適用） | その後 |
| 4a | **行の並べ替え** … ✅ 完了。行ごとの上へ/下へ（端は無効化）。既定ONで `config: { reorderable: false }` によりオプトアウト（モデル変更なし） | ✅ |
| 4b | 子Repository方式（大量明細のページング） | 未着手 |

Phase 1 は**描画なし**（定義が読めるところまで）。ナビゲーション機能と同じ刻み方で、各段階を緑にしてから進む。

## 命名の注意

- DSL キーは `fields`（入れ子で自然）、Dart のメンバ名は `rowFields`（クラス自身が field なので衝突を避ける）。`key`→`keyField` と同じ既存の流儀。
- 型名は `subTable`。ページ種別の `detail` と紛れないようにするため `detail` は使わない。

## 非目標

明細の集計をサーバに投げる仕組み、行ごとの権限（列単位の `roles` までで十分）、無限スクロール（Phase 4 の子Repository方式で扱う）。
