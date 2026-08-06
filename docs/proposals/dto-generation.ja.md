# 提案：DTO / レスポンス形生成

画面定義には、API の入出力形がすでに**全部書いてある**。`form.fields` は登録/更新のリクエスト、
`table.columns` は一覧レスポンスの1行、`search.filters` はクエリパラメータ、`key` はパスパラメータ。
なのに実際の開発ではこれを手でもう一度書いて、**画面と API の型がズレて壊れる**。そこを埋める。

## 何を作るか

定義から**フレームワーク非依存の `DtoSpec`** を導出し、そこから JSON Schema などを吐く。

```
PageDefinition ──deriveDto()──> DtoSpec ──emit──> JSON Schema / OpenAPI 断片 / 型定義
```

`QuerySpec` と完全に同じ形の話。`QuerySpec` は「検索定義＋リクエスト → 中立なクエリ記述 →
`JpaQueryTranslator` などのアダプタ」だった。DTO も「定義 → 中立な型記述 → emitter」にする。

## 決定：中立な `DtoSpec` を挟む（直接コード生成しない）

| 案 | 内容 | 判定 |
|---|---|---|
| A. 言語ソースを直接吐く | 定義から TS `interface` / Java `record` の**文字列**を生成 | ❌ 単体では不採用。整形・命名規約の議論が無限に発生し、出力が文字列なのでコンフォーマンスで3言語一致を機械確認できない。ライブラリではなくビルドツールになる |
| B. JSON Schema を直接吐く | 定義 → JSON Schema | ⭕ 出力としては採用。ただし中間表現を持たないと OpenAPI や型定義を足すたび変換を書き直す |
| **C. `DtoSpec` ＋ emitter（採用）** | 定義 → 中立な `DtoSpec` → emitter で JSON Schema / OpenAPI / 型定義 | ✅ `QuerySpec` と同じ構造で一貫。`DtoSpec` は素のデータなので**conformance で3言語一致を機械確認できる**。emitter は後から足せる（Plugin > Fork） |

`DtoSpec` は「どの言語の型システムでもない、名前付きの形の集まり」に留める。ここに JSON Schema の
語彙を持ち込むと B に退化するので入れない。

## 対象言語：TS / Java のみ（Flutter は対象外）

DTO は**バックエンドの関心**。`QueryBuilder` がすでに「TS/Java のみ、Flutter は非対象」という
前例を作っている（[コンフォーマンス](../../spec/conformance/README.md)参照）ので、それに揃える。

**Flutter を外す正確な理由**: framework 側の Dart コードは**シリアライズを一切しない**
（`hatake` / `hatake_core` に `http` / `jsonEncode` / `toJson` は 1 件も無い）。境界は
`DataRecord`（`Map<String, Object?>`）で、

```
_HatakeFormFields.collect() → DataRecord → Repository.create(DataRecord)
```

HTTP を打つのは**利用者が実装する `Repository`** の中だけ＝ framework が所有しないファイル。
つまり「DTO に詰める場所が framework の中に無い」。

しかも今 Dart のクラスを生成すると**手数が増える**。境界が Map なので
`Map → 生成クラス → JSON → 生成クラス → Map` と往復する必要があり、`Repository` 契約が
型付きにならない限り得をしない。そしてその契約は「スキーマ駆動・`DataRecord`」という設計判断で
意図的に型を持たせていない部分なので、ここを崩す気は無い。

**Flutter 側に効かせるなら別の手（任意の後段）**: Phase 2 の JSON Schema を使って
**デバッグビルドでレスポンスの形を実行時検証**すると、バックエンドのドリフトを検知できる。
DTO は不要で生成物だけで済む。需要が出たら着手する（Phase 1〜4 の範囲外）。

## `DtoSpec` の形

```
DtoSpec {
  page:   string            # 由来のページ id
  shapes: Shape[]           # 名前付きの形の集まり
}

Shape {
  name:    string           # 例 CustomerCreateRequest
  role:    string           # request | response | listResponse | queryParams | pathParams
  members: Member[]
}

Member {
  name:      string
  type:      string         # string | number | boolean | object | array（開いた文字列）
  optional:  boolean
  itemType:  string?        # array のときの要素型
  shape:     string?        # object / array<object> のとき参照する Shape 名
  constraints: map          # validators 由来（maxLength / minimum / pattern / format …）
}
```

（`enumValues` は当初案に入れていたが Phase 1 では出さない。理由は後述の「実装上わかった制約」。）

**なぜ `constraints` を持つか**: `validators` を捨てると、生成した型は「文字列」までしか言わない。
`maxLength: 6` や `format: email` を運べば JSON Schema がそのまま入力チェックに使えて、
サーバ側 `FormValidator` と二重管理にならない。

## 導出ルール（ページ種別ごと）

| ページ種別 | 出す Shape |
|---|---|
| `crud` / `master` | request（`form.fields`）、listResponse（`table.columns`）、queryParams（`search.filters`）、pathParams（`key`） |
| `search` | listResponse、queryParams |
| `detail` | response（`form.fields`）、pathParams |
| `form` | request、pathParams |
| `wizard` | request（**全ステップを畳んだフォーム**）、pathParams。ステップ単位の形も出す（`<Page><Step>Request`） |

- **listResponse** は `Repository` の契約に合わせて `{ items: Row[], totalCount: number }`。
  Framework が `PageResult` を返すと決めているので、ここは導出できる。
- `subTable`（埋め込み）は `array<object>` ＋ 子 Shape。`source` 付きは**親の形に入れない**
  （子行は別エンドポイント）ので、子 Shape だけ独立して出す。
- `computed` の項目は request から**除く**（サーバが受け取るものではない）。response には入れる。
- `readOnly` の項目は request から除く。

## 型マッピング

| field `type` | DtoSpec `type` | 備考 |
|---|---|---|
| `text` / `textarea` | string | |
| `number` | number | |
| `checkbox` | boolean | |
| `date` / `dateTime` / `time` | string | `constraints.format` に `date` / `date-time` / `time` |
| `select` / `radio` | string | `enumValues` は Phase 1 では出さない（下記） |
| `multiSelect` | array | `itemType: string` |
| `subTable` | array | `itemType: object`、`shape` に子 Shape 名 |
| それ以外（Plugin 型） | string | 既定。`config` で上書きできる余地を残す |

| validator | constraints |
|---|---|
| `required` | （`optional: false` に反映） |
| `maxLength` / `minLength` | `maxLength` / `minLength` |
| `min` / `max` | `minimum` / `maximum` |
| `pattern` | `pattern` |
| `email` | `format: email` |
| `postalCode` | `pattern`（郵便番号の正規表現） |

## 実装上わかった制約（Java 定義モデルの穴）

コンフォーマンスは「同じ fixture → 同じ出力」を要求するので、**両言語が同じ情報を読めないと成立しない**。
着手時点で Java 版の定義モデルに2つ穴があった:

| 穴 | 影響 | 対応 |
|---|---|---|
| `PageDefinition` に `table` が無い（画面寄りモデルは未実装） | `table.columns` 由来の **row / listResponse が Java で出せない**。レスポンス形は本機能の価値の半分 | **`TableDefinition` を Java に追加**（既存 `ColumnDefinition` を再利用。ロードマップが「table/action ⏳一部」として既に挙げていた穴を塞ぐ） |
| `FieldDefinition` / `FilterDefinition` に `options` が無い | `options` → `enumValues` が **Java で導出できない** | **Phase 1 では `enumValues` を出さない**。両言語に `options` を足すのは別作業（サーバ側の enum 検証としても価値があるので単独で扱う） |

`validators` は両言語が持っているので `constraints` はそのまま導出できる。

## 段階

| Phase | 内容 | 状態 |
|---|---|---|
| **1** | spec（`DtoSpec` の形＋導出ルール＋型マッピング表）／conformance fixture（`dto_spec.json`）／TS・Java に `deriveDto(page)` | ← 今回 |
| 2 | **JSON Schema emitter**（TS・Java、conformance で同一出力）。`spec/tools/validate_schema.py` と同じ土俵に乗る | 次 |
| 3 | OpenAPI 断片 emitter（`paths` + `components.schemas`）。opt-in アダプタ（別クラス） | その後 |
| 4 | ネイティブ型出力（TS `interface` / Java `record`）。CLI として。**整形の議論はここまで遅らせる** | 将来 |

Phase 1 は**出力なし**（`DtoSpec` が正しく導出できるところまで）。ナビゲーションや明細と同じ刻み方で、
各段階を緑にしてから進む。

## 命名の注意

- Shape 名は `<ページ id のパスカルケース><役割>`（例 `CustomerMaster` ＋ `CreateRequest`）。
  衝突しうるので **`DtoSpec` は名前を返すだけ**で、最終的な命名規約は emitter 側の責務にする。
- `DtoSpec` の `type` は**開いた文字列**（Framework 全体の方針どおり）。enum にしない。

## 非目標

認証・認可、レスポンスの共通ラッパ（`{data, error}` 等は利用者の規約なので触らない）、
ORM エンティティ生成、エンドポイントの URL 設計（Phase 3 の OpenAPI で初めて必要になる）。
