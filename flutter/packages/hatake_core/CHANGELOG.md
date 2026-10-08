# Changelog

## 0.9.32

- 変更なし（版の足並みをそろえただけ）。

## 0.9.31

- 変更なし（版の足並みをそろえただけ）。

## 0.9.30

- 変更なし（版の足並みをそろえただけ）。

## 0.9.29

- 変更なし（版の足並みをそろえただけ）。

## 0.9.28

- 変更なし（版の足並みをそろえただけ）。

## 0.9.27

- 変更なし（版の足並みをそろえただけ）。

## 0.9.26

- 変更なし（版の足並みをそろえただけ）。

## 0.9.25

- 追加: `bulkRemainingText`（区切って実行する一括の「あと N 分くらい」）。`hatake_material` から上げた。ブラウザ版と共有フィクスチャ `bulk_progress.json` で同じ言い方に縛る。

## 0.9.24

- 変更なし（版の足並みをそろえただけ）。

## 0.9.23

- 追加: `filter.defaultValue` と `filterDefaults`（検索欄の既定値を、その日の値に解く。
  `$today` / `$startOfMonth` / `$thisMonth` などの相対の語つき）。
- 追加: `search.fixed`（いつも掛ける条件。`FixedCondition`）。当てるのはサーバの `buildQuery`
  （TS / Java）で、Repository を直接実装するアプリは自分で当てる。
- 追加: `optionsSource.copy` と `copiedFrom`（選んだ選択肢の元の行から、書いた項目に写す）。
- 追加: 列に `optionsSource`（`ColumnDefinition` が `OptionsOwner` になった。`withOptions`）。
- 共有フィクスチャ `filter_defaults.json` / `options_copy.json` が TS 版と同じ答えを縛る。

## 0.9.22

- 追加: 画面に `roles`（`PageDefinition.roles`。書かなければ空＝誰でも）。
- 追加: `canOpenPage` / `menuItemOpens`（画面の門と、メニューの項目を出すか）。
- 追加: `rowSlots` / `builtInDeclaration` / `RowSlot`（行の右端に出るもの。Web と同じ規則で、
  `spec/conformance/row_slots.json` が見ている）。
- 追加: `HatakeKeys.pageForbidden`。

## 0.9.21

- 追加: `pagerView`（一覧の下の件数の字と、ページ送りを出すか）。`pagination.enabled:
  false` のとき、出しきれなければ「120 件中 100 件を表示しています（絞り込んでください）」。
- 追加: `reportTotalLines` / `reportTotalDepth`（帳票の小計・総計の升の字）。同じ列に
  合計を2つ以上書いたら1つ1行で積み、何の数かを添える（「合計 ¥6,360」「件数 2」）。
- 追加: `HatakeKeys.pagerText`（一覧の下の件数の字）。
- どれも TypeScript 版と同じ答えになることを `spec/conformance/pagination.json` /
  `report_totals.json` が見ている。

## 0.9.20

- ブラウザ側の見た目と振る舞いを Flutter 版にそろえた版。Dart 側の振る舞いは
  変わっていない（直しは `hatake_material` の詳細画面の計算項目だけ）。

## 0.9.19

- サーバ側の直しだけ（並べ替えを許す列を渡せるようにした）。Dart 側の振る舞いは
  変わっていない。

## 0.9.18

- ブラウザ側の土台が揃った（入口・行き来・REST・明細）。Dart 側の振る舞いは
  変わっていない。

## 0.9.17

- 配られ方の直しだけ（ブラウザ側の tarball が Release に貼られていなかった）。
  この版そのものの振る舞いは 0.9.16 と同じ。

## 0.9.16

- Web の Renderer（Vue 3 / React 19）が入った。定義から画面を出す先が増えただけで、
  この版そのものの振る舞いは変わっていない。
- 直し: 列に `optionsOf` を書いたときのラベルを、3版そろえて出すようにした
  （Flutter は元から出していた側）。

## 0.9.15

- 公開面の台帳を持った（`spec/public-api.dart.json`）。**増えても減っても試験が落ちる**
  ので、約束の面が黙って広がらない。書き直す合図は `HATAKE_WRITE_PUBLIC_API=1`。
- 3版そろっていないものは版を上げない、と決めた（1.0 から）。

## 0.9.14

TypeScript 版の公開 API を2つに分けた（約束する面と、内部の口）。

変更の一覧はリポジトリの
[CHANGELOG](https://github.com/ASIL-E-Hatake/hatake/blob/main/CHANGELOG.md)。

## 0.9.13

手引きに載せたコマンドを、定義を渡す形でも走らせるようにした（道具側の改善）。

変更の一覧はリポジトリの
[CHANGELOG](https://github.com/ASIL-E-Hatake/hatake/blob/main/CHANGELOG.md)。

## 0.9.12

シナリオの覚え書き（`$comment`）を、確かめたいことの中でも書けるようにした。

変更の一覧はリポジトリの
[CHANGELOG](https://github.com/ASIL-E-Hatake/hatake/blob/main/CHANGELOG.md)。

## 0.9.11

**0.9.4 から 0.9.11 までをまとめて出す版**（この間はタグを切っていない）。
外から使って出た不具合を直し、1.0 で凍らせる前に**破壊的な変更を入れきった**。

使う側に効く大きいものは4つ:

- **複合キー**（`key: [orderNo, lineNo]`）。3版の `keyField` が `keyFields` になった
- **アプリ全体の語彙**（`app.vocabularies` ＋ `optionsOf`）。同じコード表を画面ごとに書かない
- 値を文字にする所を1本にまとめ、**詳細画面と CSV の字が一覧と揃う**ようにした
- `hatake openapi` が **app 1枚から全画面ぶん**を出す（詳細画面の口も宣言する）

上げ方は
[マイグレーション手引き](https://github.com/ASIL-E-Hatake/hatake/blob/main/docs/guide/migration-0.9.14.ja.md)。
変更の一覧はリポジトリの
[CHANGELOG](https://github.com/ASIL-E-Hatake/hatake/blob/main/CHANGELOG.md)、
入れ方は
[リリースと入れ方](https://github.com/ASIL-E-Hatake/hatake/blob/main/docs/guide/release.ja.md)。

## 0.9.3

一覧から詳細へ飛ぶときの鍵を、**画面に書いてある `key` の名前**で受け取るようにした
（前は `id` という名前だけを見ていた）。あわせて、鍵が渡っていない画面移動と、
メニューに直接置いた詳細画面を `advise` が言うようにした。

変更の一覧はリポジトリの
[CHANGELOG](https://github.com/ASIL-E-Hatake/hatake/blob/main/CHANGELOG.md)、
入れ方は
[リリースと入れ方](https://github.com/ASIL-E-Hatake/hatake/blob/main/docs/guide/release.ja.md)。

## 0.9.2

一覧のコードを名前で出す所を、**数字とグラフの画面と帳票にも**広げた
（0.9.1 では crud / search だけだった）。紙に刷る側（`hatake_print`）も同じにしてある。

変更の一覧はリポジトリの
[CHANGELOG](https://github.com/ASIL-E-Hatake/hatake/blob/main/CHANGELOG.md)、
入れ方は
[リリースと入れ方](https://github.com/ASIL-E-Hatake/hatake/blob/main/docs/guide/release.ja.md)。

## 0.9.1

Dart 版そのものに変更はない。**3版は同じ番号で出す**と決めてあるので、
TypeScript 版（診断 `key-wrong-shape` を追加）と Java 版（app 定義の画面を中身まで
読めるように・列の `roles` を読むように）に合わせて番号だけ上げた。

変更の一覧はリポジトリの
[CHANGELOG](https://github.com/ASIL-E-Hatake/hatake/blob/main/CHANGELOG.md)、
入れ方は
[リリースと入れ方](https://github.com/ASIL-E-Hatake/hatake/blob/main/docs/guide/release.ja.md)。

## 0.9.0

最初に配る版。**git の tag から入れる**（pub.dev にはまだ出していない）。
Flutter / TypeScript / Java の3版は**同じ番号**で出している。

変更の一覧はリポジトリの
[CHANGELOG](https://github.com/ASIL-E-Hatake/hatake/blob/main/CHANGELOG.md)、
入れ方は
[リリースと入れ方](https://github.com/ASIL-E-Hatake/hatake/blob/main/docs/guide/release.ja.md)。

## 0.0.1

- Initial release.
- `PageDefinition` model (sealed) with `CrudPageDefinition` and
  `SearchPageDefinition`.
- `Repository` contract and `RepositoryQuery` / `PageResult`.
- Validation engine: `ValidatorRegistry`, built-in validators, `FormValidator`.
- Open string type identifiers (`FieldTypes`, `ValidatorTypes`, `ActionTypes`,
  `ColumnTypes`, `FilterOperators`) for plugin extensibility.
