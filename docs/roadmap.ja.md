# hatake 開発ロードマップ（全体指針）

今後の作業依頼のベースにするやつ。「何を作るか」「言語間の足並みをどう揃えるか」「対応言語をどう増やすか」の指針をまとめる。細かいユーティリティの一覧は別で [ユーティリティ ロードマップ](roadmap-utils.ja.md) にある。

## 大方針（ブレさせない軸）

1. **spec が唯一の正**。新機能はまず [`spec/`](../spec/)（DSL 仕様 + JSON Schema）に「名前・形」を定義してから、各言語がそれを実装する。実装が先行して spec が後追い、をやらない。
2. **収束テストをガードレールにする**。`parse(YAML) == parse(JSON) == build(DSL)` を全言語で維持。ここが崩れたら統一感が死ぬ。
3. **拡張は登録式（開いた文字列 + Registry）**。Field型 / Validator / Action / Formatter / Converter / Renderer は全部プラグインで足せる。本体は fork させない。
4. **フレームワーク非依存を死守**。Spring / Express / ORM / 特定 UI に依存しない。連携は opt-in アダプタ（別パッケージ）。
5. **層で役割が違うのは OK**。フロント（Flutter）は描画、バックエンド（Java/TS…）は API ロジック（バリデーション・クエリ・DTO）。同じ定義を別の消費者が使う、が基本形。
6. **日本企業要件を一級市民に**。金額・和暦・消費税・営業日みたいな「毎回独自実装されるやつ」を標準で持つ（差別化の核）。設定値（税率・元号境界・年度開始・祝日）はハードコードせずパラメータ/契約で外出し。

## A. 機能として用意すべきもの

| 分類 | 項目 | 状態 | メモ |
|---|---|---|---|
| ページ種別 | CrudPage | ✅ Flutter | |
| | SearchPage（照会） | ✅ Flutter | |
| | DetailPage（詳細・読取） | ✅ Flutter | 単一レコードを読み取り表示（`DetailController`＋`format`）。record は実行時に渡す |
| | MasterPage（マスタメンテ） | ✅ Flutter | Crud と同構造。`CrudLike` で Crud と描画/コントローラを共用 |
| | DashboardPage | ⏳ | カード/集計/グラフ。設計重め |
| | WizardPage（ステップ入力） | ✅ Flutter（3言語検証） | `type: wizard` ＋ `steps`（**id と見出しを持つ section**）。「次へ」は**そのステップの項目だけ**検証、「保存」は最後のステップ＋全体を検証して1回だけ永続化。全体検証で前のステップの項目が落ちたら**その項目を持つステップまで自動で戻る**。`normalize` は保存時に全項目へ適用。サーバ側もステップ単位／全体で同じ定義で検証可（`wizard_validation.json` で3言語一致） |
| | FormPage（単票入力） | ✅ Flutter | 単票の作成/編集。フォーム描画を `_HatakeFormFields` に共通化しダイアログと共用。record key で編集/新規を切替 |
| | 親子・明細（master-detail） | ✅ Flutter（3言語検証） | `type: subTable` でヘッダ＋明細行を1画面編集し**まとめて保存**（子行は親レコードの1項目）。行内 `validators`/`computed`、**行の並べ替え**（既定ON／`config: { reorderable: false }` で無効）が効く。サーバ側も同じ定義で子行を検証（エラー項目名 `lines[0].qty`）。設計は [提案書](proposals/master-detail.ja.md)。**大量明細は `source`（子Repository方式）**＝子行を別 Repository から外部キーでページング取得し、行ごとに即時保存（親が未保存なら明細は編集不可、並べ替えなし、親の検証は当該項目を飛ばす）。埋め込みとの併存で使い分ける |
| 検索 | 検索条件の拡充 | ✅ Flutter | `filter.type` ごとの入力（text/number/select/**checkbox=3状態**/date=カレンダー）、**`operator: between` の範囲入力**（`[開始,終了]` で送信・片側指定可）、**`search.layout.columns`** の反映（狭い画面は1列に退避）。フィルタ描画は `filter_input.dart` に一本化（crud/search の重複実装を解消）。デモの受注照会が複数条件のショーケース |
| 入出力 | Formatter（金額/和暦…） | ✅ 3言語（P0+P1） | `currency`/`percent`/`date`/`wareki`/`postal`/`mask`。[utils](roadmap-utils.ja.md) の P2 分（曜日・相対日付・電話番号等）は未 |
| | Converter（全半角…） | ✅ 3言語（P0+P1） | 同上。**入力 normalize は送信時に自動適用**（Flutter は `CrudController`/`FormController` が `FormNormalizer` を通す／TS `normalizeRecord`／Java `FormNormalizer`） |
| | Validator 拡充 | 🚧 一部 | 郵便番号済。法人番号/相関等は未 |
| 表現 | i18n / メッセージ多言語化 | ✅ 3言語 | `MessageResolver`（ロケール＋開いたキー、既定 ja）でバリデータ固定文言を差し替え可能に。`ValidatorRegistry(custom, messages)` で注入。Dart/TS/Java で同名・同挙動 |
| | テーマ / スタイル定義 | ⏳ | Renderer 側 |
| | 条件表示・活性制御 | ✅ 3言語 | `visibleWhen` / `enabledWhen`（宣言的条件。`evaluateCondition` を3言語＋conformance、Flutter はフォームで表示/活性を反応制御） |
| | 計算項目・派生値 | ✅ 3言語 | `computed`（`ComputedRegistry`：concat/sum/subtract/product ＋登録式。3言語＋conformance、Flutter は読み取り表示で自動再計算） |
| 動き | Action / Workflow フック | 🚧 | plugin action 済。遷移や確認ダイアログ定義は未 |
| | Navigation 定義 | ✅ Flutter（3言語パーサ） | `AppDefinition`（menu＋pages）＋`HatakeApp`／`HatakeRouter`（依存ゼロ）。`navigate` で一覧→詳細（`$row.id`）、グループ見出し・レスポンシブ（サイドバー/Drawer）・ブレッドクラム対応。メニューは roles 連動。TS/Java はナビ情報＋ページ目録をパース。タブ/Web URL 同期は次段 |
| | 権限・可視制御 | ✅ 3言語 | `roles` を field/column/action に付与＋`isAllowed`（3言語＋conformance）。Flutter は現在ユーザのロール（`HatakeScope(roles:)`）で表示出し分け。※UI 表示制御のみ、認証・認可は対象外 |
| 出力 | CSV / 帳票 / 印刷 | ⏳ | Formatter を共有して実装 |
| バックエンド | サーバ側バリデーション | ✅ Java/TS | |
| | QueryBuilder（QuerySpec） | ✅ Java/TS | |
| | ORM アダプタ（opt-in） | 🚧 Java/JPA | `JpaQueryTranslator`（`QuerySpec`→JPQL＋params＋paging、依存ゼロ）を Java に実装。MyBatis / Prisma 等は今後 |
| | DTO / レスポンス形生成 | 🚧 Java/TS（Phase 1+2） | `deriveDto(page)` → フレームワーク非依存の `DtoSpec`（`QuerySpec` と同じ立ち位置）。`form.fields`→request（`computed`/`readOnly` は除外）、`table.columns`→row＋`listResponse`＝`{items,totalCount}`、`search.filters`→queryParams（`between` は配列）、`key`→pathParams、`subTable`→子の形（`source` 付きは親に入れない）。`validators` は `constraints` に翻訳。**JSON Schema 2020-12 出力（`toJsonSchema`）まで完了**（1ドキュメント＋`$defs`、受け取る形は閉じ・返す形は開ける、配列の制約は要素側）。OpenAPI 断片とネイティブ型出力は次段。設計は [提案書](proposals/dto-generation.ja.md) |

## B. 言語間の足並み（パリティ）

### いまの対応状況

| 機能 | spec | Flutter | Java | TypeScript |
|---|---|---|---|---|
| 定義モデル + YAML/JSON パーサ | ✅ | ✅ | ✅(※) | ✅ |
| YAML↔JSON↔DSL 収束テスト | — | ✅ | ✅(YAML↔JSON) | ✅(YAML↔JSON) |
| FormValidator（サーバ側） | ✅ | ✅ | ✅ | ✅ |
| Validator 拡張レジストリ | ✅ | ✅ | ✅ | ✅ |
| QueryBuilder（QuerySpec） | ✅ | — | ✅ | ✅ |
| DTO 導出（`deriveDto`→`DtoSpec`） | ✅ | 対象外(※2) | ✅ | ✅ |
| JSON Schema 出力（`toJsonSchema`） | ✅ | 対象外(※2) | ✅ | ✅ |
| Formatter / Converter | ✅ | ✅ | ✅ | ✅ |
| メッセージ i18n（`MessageResolver`） | — | ✅ | ✅ | ✅ |
| 条件表示 `evaluateCondition` / 計算 `computed` | ✅ | ✅ | ✅ | ✅ |
| 権限 `roles` / `isAllowed` | ✅ | ✅ | ✅ | ✅(field) |
| ナビ定義（app/menu）パーサ | ✅ | ✅（＋描画） | ✅（目録 PageRef） | ✅（目録 PageRef） |
| 親子・明細 `subTable`（モデル＋パーサ） | ✅ | ✅（＋描画） | ✅ | ✅ |
| 明細行のサーバ側検証（`lines[0].qty`） | ✅ | ✅ | ✅ | ✅ |
| 明細の `source`（子Repository方式） | ✅ | ✅（＋描画・ページング） | ✅（検証で当該項目を飛ばす） | ✅（同左） |
| ステップ入力 `wizard`（モデル＋パーサ＋ステップ検証） | ✅ | ✅（＋描画） | ✅ | ✅ |
| Renderer（画面描画） | — | ✅(Material) | 対象外 | 対象外(※) |
| table/action など画面寄りモデル | ✅ | ✅ | ⏳一部（table 追加済／action 未） | ✅ |

※ Java の定義モデルは page 識別子 + search + table + form まで（action 未。`table` は DTO のレスポンス形導出のために追加）。子グリッド用の `ColumnDefinition` は検証に必要な最小形（field/label/type/format）で、`width`/`sortable`/`roles` 等の描画専用キーは持たない。TS は画面寄りモデルも持つがバックエンド用途で描画はしない。

※2 DTO 導出は**バックエンドの関心**なので Flutter は対象外（`QueryBuilder` と同じ扱い）。framework 側の Dart コードはシリアライズをせず、境界が `DataRecord`＝Map なので DTO を詰める場所が framework 内に無い。理由の詳細は [提案書](proposals/dto-generation.ja.md)。対応ページ種別は TS が `crud`/`search`/`form`（`master`/`detail` は未）、Java は種別を文字列として保持。

### パリティの進め方

- **新機能は spec 先行 → 参照実装（普通は Flutter か、バックエンド機能なら TS）→ 他言語へ横展開**、の順。
- **共通コンフォーマンス・スイート … ✅ 導入済み**: [`spec/conformance/`](../spec/conformance/) に「入力 + 期待出力」の JSON fixture（formatters / converters / validators）を置き、Dart・TypeScript・Java の3言語テストが同じ fixture を食って出力一致を機械確認する。新しい formatter/validator 等を足すときは、まずここに期待値を書いてから各言語を実装する。「Java だけ挙動が違う」はこれで機械的に防ぐ。現在 formatters / converters / validators（3言語）＋ queries（QueryBuilder、TS/Java のみ）を fixture 化済み。
- 各言語の README に「対応状況」を書き、この表を単一の真実にする。CI（[ci.yml](../.github/workflows/ci.yml)）でも全エディション（Dart/Flutter・TS・Java）を回す。

## C. 対応言語を増やす（Python / Rust など）

新エディションを足すときの最低ライン（＝これが揃って初めて "hatake ○○版" を名乗る）:

1. **定義モデル**（spec に対応）
2. **YAML / JSON パーサ**（同一定義に収束）
3. **収束テスト**（YAML↔JSON、あれば DSL）
4. 用途に応じて **FormValidator**（バックエンド）／ **Renderer**（フロント）
5. **コンフォーマンス・スイート**を通す
6. パッケージ名を揃える（`hatake_core` / `@hatake/core` / `io.github.asil-e-hatake:hatake-core` / `hatake-core`(py) / `hatake_core`(rust crate)）

想定用途:
- **Python** … バックエンド（FastAPI/Django 連携は opt-in アダプタ）、データ処理・バッチ。バリデーション + QuerySpec が主。
- **Rust** … 高性能バックエンド / WASM。将来フロントにも回せる可能性。
- どちらも**フレームワーク非依存のコア**からで、Web フレームワーク連携はアダプタ別パッケージ。

## 配布・公開（Distribution）〔TODO〕

各エディションの配り方。Dart が主。Java/TS は「まず入れられる状態」を先に、本格公開は必要時。実 publish は人間が実施（CI の tag 公開にする場合も secrets は畠山氏管理）。

| エディション | レジストリ | パッケージ名（案） | 状態 |
|---|---|---|---|
| Dart/Flutter | pub.dev | `hatake_core` ほか | 準備済（未公開） |
| TypeScript | npm | `@hatake/core`（スコープ確保が要る） | TODO |
| Java | JitPack / GitHub Packages →（本格化で）Maven Central | `io.github.asil-e-hatake:hatake-core`（下記注意） | TODO |

- **TS (npm)**: `tsc` で `dist/`（JS + `.d.ts`）を吐いて `npm publish --access public`。consumer は `npm i @hatake/core`。npm スコープ `@hatake` が取れなければ `@asil-e-hatake/*` か 無スコープ `hatake-core`。README は npmjs にそのまま出る。
- **Java**: モノレポの `java/` から publish。
  - 早期は **JitPack**（GitHub タグから即配布・publisher 設定ほぼゼロ。※モノレポの subdir 指定が要る）か **GitHub Packages (Maven)**（publisher は楽・consumer 側が認証設定を要する＝フリクションあり）。
  - 本格化で **Maven Central**（consumer フリクション最小だが、名前空間検証＋GPG 署名＋sources/javadoc jar が必要）。
  - **groupId**: `io.github.asil-e-hatake`（GitHub アカウントで自動検証。`io.hatake` はドメイン所有証明が要るため不採用）。`java/build.gradle` 設定済み。※Java **ソースパッケージ**は `io.hatake.core` のまま（groupId とは別物）。
- **共通**: 各 subdir から個別 publish。バージョンは当面各エディション自走 or 揃える方針を決める。pub.dev/npm は README を表示するが Maven 系は出ないので、Java は GitHub / Pages のドキュメントに誘導。

### ドキュメント配布 TODO
- **英語版チートシート**（`docs/api-cheatsheet.md`）: 日本企業向け優先のため後回し。需要が出たら追加（構成は日本語版 `api-cheatsheet.ja.md` を踏襲）。
- 各パッケージ公開時、README にチートシート要約 or リンクを入れる。

## フェーズ感（ざっくり優先度）

- **近い（P1）… ✅ 完了**: ~~Formatter/Converter を TS/Java へ横展開~~ ✅、~~コンフォーマンス・スイートの器~~ ✅、~~normalize 入力パイプの配線~~ ✅（Flutter は送信時に自動適用 / TS・Java は `normalizeRecord`・`FormNormalizer`）、~~QuerySpec の fixture 化~~ ✅、~~utils P1（金額/日付/和暦/パーセント/半↔全角/数値パース/郵便番号/マスク）~~ ✅（3言語）
- **中（P2）**: ~~DetailPage / MasterPage~~ ✅、~~消費税・年度/四半期・年齢/勤続・営業日（utils P2）~~ ✅（3言語＋conformance）、~~元号算出/税率別合計（utils 小follow-up）~~ ✅（`eraOf` / `computeInvoice`、3言語＋conformance）→ ~~ORM アダプタ1個目~~ ✅（Java/JPA `JpaQueryTranslator`）。P2 はひと通り完了（i18n・条件表示・計算項目・ORM アダプタ1個目 すべて✅）
- **遠い（P3）**: ~~権限制御~~ ✅（roles + `isAllowed`、3言語）、DashboardPage、Python/Rust エディション、帳票・全銀など重いやつ

**P1・P2 は完了済み**。残っているのは次の2本（どちらも独立して着手できる）と P3:

| 次の候補 | 内容 | 規模感 |
|---|---|---|
| ~~新ページ種別（WizardPage）~~ | ✅ 完了（`type: wizard`。上の表参照） | — |
| **DTO / レスポンス形生成** | 🚧 Phase 1（`DtoSpec` 導出）・Phase 2（JSON Schema 出力）完了。次は Phase 3 = OpenAPI 断片、Phase 4 = ネイティブ型出力 | 中〜大 |

## 依頼の仕方（メモ）

「この表の ◯◯ を ◯◯言語で」「新機能 ◯◯ を spec 先行で」みたいに、この表を指して投げてくれれば拾いやすい。大きめのやつは「spec 定義 → 参照実装 → 横展開 → コンフォーマンス」の順で刻む。
