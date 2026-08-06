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
| B. 子Repository＋外部キー | 子を別 Repository から `parentKey` で検索 | ✅ Phase 4b で追加（`subTable.source`）。明細が大量でページングが要る場合向け。**併存**であり A の置き換えではない |

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
| 4b | **子Repository方式**（大量明細のページング） … ✅ 完了。下記参照 | ✅ |

## Phase 4b の決定（子Repository方式）

当初 B 案として見送っていた「子を別 Repository から引く」を、`subTable` に **`source` という入れ子オブジェクト1個**を足す形で実装した。

```yaml
- field: lines
  type: subTable
  source: { repository: orderLineRepository, parentKey: orderNo, key: lineNo, pageSize: 20 }
```

| 論点 | 決定 | 理由 |
|---|---|---|
| DSL の形 | `FieldDefinition` に4項目ではなく **`source` 1項目**（入れ子） | 3言語のモデル改変が1箇所で済む。「埋め込みか子Repositoryか」が原子的に読める。将来 `sort` 等を足しても項目数が増えない |
| 保存 | **行ごとに即時**（`create`/`update`/`delete`） | サーバ側のページを見ながら未保存編集を持つのは整合しない。原子的保存が要るなら埋め込みを選ぶべき、と割り切った |
| 親が未保存 | 明細は**編集不可**（「先に保存すると明細を入力できます」） | 外部キーに書く親キーが無い。誤魔化さず明示する |
| 並べ替え | 提供しない | 順序は Repository の責務。配列の入れ替えでは表現できない |
| 親の `FormValidator` | この項目を**まるごと検証対象外** | 値がレコードに無いので `required` を付けても常に落ちるだけ。行の検証は行の保存時に同じ `fields` で行う |
| Renderer と Repository | Renderer は Repository を触らない。`SubTableController`（`hatake`）を `HatakeScope.subTableController` 経由で受け取る | Renderer は描画のみ、という原則を崩さない。関数で渡すのでダイアログ経路（Scope 外）でも使える |

デモは `order_entry_paged`（受注入力（明細別テーブル））。`OrderLineRepository` が SO-1003 に24行を積んでおり、`pageSize: 10` でページ送りが見える。

Phase 1 は**描画なし**（定義が読めるところまで）。ナビゲーション機能と同じ刻み方で、各段階を緑にしてから進む。

## 命名の注意

- DSL キーは `fields`（入れ子で自然）、Dart のメンバ名は `rowFields`（クラス自身が field なので衝突を避ける）。`key`→`keyField` と同じ既存の流儀。
- 型名は `subTable`。ページ種別の `detail` と紛れないようにするため `detail` は使わない。

## 非目標

明細の集計をサーバに投げる仕組み、行ごとの権限（列単位の `roles` までで十分）、無限スクロール（子Repository方式はページ送りのみ）。
