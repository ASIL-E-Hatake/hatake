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
| | DashboardPage | ✅ Flutter（3言語検証） | `type: dashboard` ＋ `items`（カード）。1枚＝**小さな読み取りクエリ + 見せ方**（`metric` / `table` / `chart`）。単一レコードを指さないので `key` 無し・`repository` はカードの既定値。**Framework は集計クエリを投げない**＝Repository が返した行に対する畳み込み（`AggregateRegistry`: count/sum/avg/min/max、登録式）。`chart.aggregate` を省くと1行＝1点（集計済みエンドポイント向け）、`count` は総件数を使う。ページの `search` は全カードに効き、カードは**独立して読み込む**（1つ落ちてもそのカードだけ）。チャートは**依存ゼロの自作描画**（bar/line/pie）で、それ以上は `dashboardItemBuilders` でプラグイン。集約は `dashboard_aggregate.json` で3言語一致 |
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
| ページ種別 | ReportPage（帳票） | ✅ Flutter（3言語検証） | `type: report` ＝ 一覧の印刷版。明細の列は `table` から取り、`report` が紙の構造（`paper` / `rowsPerPage` / `sort` / `groupBy` / `totals`）を足す。**グループはコントロールブレイク**（並び順に見てキーが変わったら小計→見出し。並べ替えは Repository の責務なので `sort` で指定する）。集約は Dashboard と同じ `AggregateRegistry`。定義＋行 → 中立な `ReportDocument`（`QuerySpec` と同じ立ち位置）までを Framework が作り、Renderer は用紙比率でプレビューを描く（**明細行は search / master の一覧と同じ見た目**＝同じ文字サイズ・行高・区切り線・`column.width` 準拠。グループ見出しは行全幅）。**PDF 化・プリンタ送出は対象外**（opt-in アダプタ） |
| 出力 | CSV 出力 | ✅ 3言語 | `action` の型 `export`。**その画面の列と行から CSV を組む**（一覧・帳票で同じ書き方。ロールで見えない列は出さない）。RFC 4180 の引用、BOM / CRLF / 区切り / `raw`（format を通さない）を `config` で選べる。一覧の export は**表示中のページではなく検索結果全体**を出す（`limit` まで読み直す）。**ファイルを書くのは対象外**＝`HatakeScope(exportSink:)` に渡された出力先の責務（文字コード変換も同じ理由でそちら） |
| | 帳票の印刷（PDF/プリンタ） | ⏳ | `ReportDocument` を PDF/印刷に落とす opt-in アダプタ。`printing` / `pdf` 依存を本体に入れないため別パッケージ |
| 定義の品質 | `hatake` CLI | ✅ TS 同梱 | `npx hatake validate <file...>`（strict 既定・`--json`・**問題があれば終了コード 1** なので CI に置ける）、`new <kind>`（8種別の雛形。全部が strict とスキーマを通ることを CI で確認）、`dto` / `schema` / `openapi` / `types --out`（ネイティブ型のファイル出力の入口）。生成系は常に strict で読む（書き間違いを API に焼き付けないため）。→ [使い方](../typescript/README.md#cli) |
| 定義の品質 | 未知キーの検出（strict パース） | ✅ 3言語 | パーサの厳格モード。`parsePageYaml(source, strict: true)` で**知らないキーを全部まとめて**エラーにする（近い既知キーの提案つき: `pagesize` → `pageSize` / `visible_when` → `visibleWhen`）。厳しさは JSON Schema と同一＝`additionalProperties: false` のノードだけを閉じ、`config` / `validators` / `computed` の中は見ない。既定は従来どおり寛容（後方互換）だが、デモと CI は strict。**各版のキー表がスキーマとズレていないことも機械で確認**。詳細は [DSL 仕様](../spec/dsl-spec.ja.md#未知キーの検出strict) |
| バックエンド | サーバ側バリデーション | ✅ Java/TS | |
| | QueryBuilder（QuerySpec） | ✅ Java/TS | |
| | ORM アダプタ（opt-in） | 🚧 Java/JPA | `JpaQueryTranslator`（`QuerySpec`→JPQL＋params＋paging、依存ゼロ）を Java に実装。MyBatis / Prisma 等は今後 |
| | DTO / レスポンス形生成 | ✅ Java/TS | `deriveDto(page)` → フレームワーク非依存の `DtoSpec`（`QuerySpec` と同じ立ち位置）。`form.fields`→request（`computed`/`readOnly` は除外）、`table.columns`→row＋`listResponse`＝`{items,totalCount}`、`search.filters`→queryParams（`between` は配列）、`key`→pathParams、`subTable`→子の形（`source` 付きは親に入れない）。`validators` は `constraints` に翻訳。**JSON Schema 2020-12 出力（`toJsonSchema`）と OpenAPI 3.1 出力（`toOpenApi`）まで完了**。受け取る形は閉じ・返す形は開ける／配列の制約は要素側／`basePath` は呼び出し側が渡す（DSL は URL を知らない。渡さなければ schemas だけ）／操作は必要な形があるときだけ出す（読み取り専用ページは一覧のみ）。**ネイティブ型出力（`toTypeScript` / `toJavaRecords`）まで完了**＝制約は doc コメント、Java の数値は `BigDecimal`、日付は文字列、1レコード＝1ファイル。生成物が javac / tsc を通ることもテストで担保。**Phase 1〜4 完了**。設計は [提案書](proposals/dto-generation.ja.md) |

## B. 言語間の足並み（パリティ）

### いまの対応状況

| 機能 | spec | Flutter | Java | TypeScript |
|---|---|---|---|---|
| 定義モデル + YAML/JSON パーサ | ✅ | ✅ | ✅(※) | ✅（8種別すべて） |
| 未知キーの検出（strict パース） | ✅ | ✅ | ✅ | ✅ |
| CLI（`hatake validate` / `new` / 生成） | — | — | — | ✅（`npx hatake`） |
| YAML↔JSON↔DSL 収束テスト | — | ✅ | ✅(YAML↔JSON) | ✅(YAML↔JSON) |
| FormValidator（サーバ側） | ✅ | ✅ | ✅ | ✅ |
| Validator 拡張レジストリ | ✅ | ✅ | ✅ | ✅ |
| QueryBuilder（QuerySpec） | ✅ | — | ✅ | ✅ |
| DTO 導出（`deriveDto`→`DtoSpec`） | ✅ | 対象外(※2) | ✅ | ✅ |
| JSON Schema 出力（`toJsonSchema`） | ✅ | 対象外(※2) | ✅ | ✅ |
| OpenAPI 3.1 出力（`toOpenApi`） | ✅ | 対象外(※2) | ✅ | ✅ |
| 型定義出力（`toTypeScript`/`toJavaRecords`） | ✅ | 対象外(※2) | ✅ | ✅ |
| Formatter / Converter | ✅ | ✅ | ✅ | ✅ |
| メッセージ i18n（`MessageResolver`） | — | ✅ | ✅ | ✅ |
| 条件表示 `evaluateCondition` / 計算 `computed` | ✅ | ✅ | ✅ | ✅ |
| 権限 `roles` / `isAllowed` | ✅ | ✅ | ✅ | ✅(field) |
| ナビ定義（app/menu）パーサ | ✅ | ✅（＋描画） | ✅（目録 PageRef） | ✅（目録 PageRef） |
| 親子・明細 `subTable`（モデル＋パーサ） | ✅ | ✅（＋描画） | ✅ | ✅ |
| 明細行のサーバ側検証（`lines[0].qty`） | ✅ | ✅ | ✅ | ✅ |
| 明細の `source`（子Repository方式） | ✅ | ✅（＋描画・ページング） | ✅（検証で当該項目を飛ばす） | ✅（同左） |
| ステップ入力 `wizard`（モデル＋パーサ＋ステップ検証） | ✅ | ✅（＋描画） | ✅ | ✅ |
| ダッシュボード `dashboard`（モデル＋パーサ） | ✅ | ✅（＋描画・チャート） | ✅ | ✅ |
| 集約 `AggregateRegistry`（count/sum/avg/min/max） | ✅ | ✅ | ✅ | ✅ |
| 帳票 `report`（モデル＋パーサ＋`buildReport`） | ✅ | ✅（＋プレビュー描画） | ✅ | ✅ |
| CSV 出力 `toCsv` | ✅ | ✅（＋`export` アクション） | ✅ | ✅ |
| Renderer（画面描画） | — | ✅(Material) | 対象外 | 対象外(※) |
| table/action など画面寄りモデル | ✅ | ✅ | ⏳一部（table 追加済／action 未） | ✅ |

※ Java の定義モデルは page 識別子 + search + table + form + dashboard の `items` まで（action 未。`table` は DTO のレスポンス形導出のために追加）。ダッシュボードのカードは「どう引くか＋どう畳むか」を持ち、`span` / `height` のような描画専用キーは持たない。子グリッド用の `ColumnDefinition` は検証に必要な最小形（field/label/type/format）で、`width`/`sortable`/`roles` 等の描画専用キーは持たない。TS は画面寄りモデルも持つがバックエンド用途で描画はしない。

※2 DTO 導出は**バックエンドの関心**なので Flutter は対象外（`QueryBuilder` と同じ扱い）。framework 側の Dart コードはシリアライズをせず、境界が `DataRecord`＝Map なので DTO を詰める場所が framework 内に無い。理由の詳細は [提案書](proposals/dto-generation.ja.md)。TS は**8種別すべて**をパースする（CLI が全種別を検証できるように `master`/`detail` を追加）。Java は種別を文字列として保持。`master` は `crud` と同じ形を導出し、`detail` は**読み取り専用なので request を出さない**（form は「返ってくる形」なので、レスポンス専用ロールの導出は今後）。`dashboard` は単一レコードを指さないので `pathParams` を出さず、`search` があればクエリパラメータだけを出す（カード単位のレスポンス形導出は未）。

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

## これから（優先度つき）

**終わったものはこの節から消す。** 完了した機能の状態は上の [A. 機能として用意すべきもの](#a-機能として用意すべきもの)と
[B. 言語間の足並み](#b-言語間の足並みパリティ)が持つので、ここは「まだ無いもの」だけの一覧にしておく。
（履歴が要るときは git log を見る。P0〜P2 と WizardPage / DTO生成 / DashboardPage は完了済み。）

### 1. 機能（Framework 本体）

| 項目 | 内容 | なぜ | 規模感 |
|---|---|---|---|
| **帳票の印刷アダプタ** | `ReportDocument` → PDF / プリンタ（`printing` / `pdf` 依存を本体に入れず opt-in パッケージで）。ページ番号・ヘッダフッタの体裁もここ | 帳票は「画面で見る」で終わらない。プレビューまでは入ったので残りは出力経路 | 中 |
| テーマ / スタイル定義 | 色・余白・密度を定義から差せるようにする（`app.theme`）。Renderer 側の関心 | 「会社の色にしたい」は最初に来る要望 | 中 |
| Action / Workflow フック | 確認ダイアログ・実行前後フック・成功時の遷移を宣言で書く（今は `plugin` に逃がしている） | 「削除前に確認」を毎回 Dart で書かせたくない | 中 |
| Validator 拡充 | 法人番号・マイナンバー・相関チェック（項目間の比較） | 相関チェックが無いと結局コードに落ちる | 小〜中 |
| Web URL 同期 / タブ | ルートと URL の相互反映、複数タブ | Web で配ると必ず「URL 共有できないの？」になる | 中 |
| ダッシュボードの次段 | 期間プリセット（今月/今年度）・カードからのドリルダウン・自動更新 | 1枚目が出た後の実運用要望 | 小〜中 |
| 帳票の次段 | 複数レベルの改ページ制御・「以下余白」・繰越／前頁計、Excel（xlsx）出力 | 実際の業務帳票で追加要求が来る定番 | 中 |
| 文字コード変換 | Shift_JIS / EUC への変換（出力先の責務なので opt-in アダプタ） | 受け側が Shift_JIS 固定の連携がまだ多い | 小 |
| ORM アダプタ2個目 | MyBatis（Java）か Prisma（TS） | 1個目（JPA）で形が固まったので横展開 | 中 |
| 全銀・固定長 | 固定長レコードの入出力（全銀フォーマット等） | 金融・給与まわりで効く。帳票の後 | 大 |
| Python / Rust エディション | **保留**（当面やらない）。やるときは [C. 対応言語を増やす](#c-対応言語を増やすpython--rust-など)の最低ラインに従う | 需要が出てから | 大 |

### 2. AI が扱いやすくする（AI First の実装）

「AI が理解・生成しやすい」を掛け声で終わらせないための具体項目。**AI が実際に転ぶ所**から並べた。

> **済**:
> - strict パース（未知キーを弾く）… ✅ 3言語。`parsePageYaml(source, strict: true)` で
>   知らないキーを全部まとめて指摘（近い既知キーの提案つき）。厳しさは JSON Schema と同一で、
>   各版のキー表がスキーマとズレていないことも機械で確認している。
>   → [DSL 仕様](../spec/dsl-spec.ja.md#未知キーの検出strict)
> - **`hatake` CLI** … ✅ TS 版に同梱（`npx hatake`）。`validate`（strict・`--json`・終了コード1）/
>   `new <kind>`（8種別の雛形）/ `dto` / `schema` / `openapi` / `types --out`。
>   → [使い方](../typescript/README.md#cli)

| 項目 | 内容 | なぜ | 規模感 |
|---|---|---|---|
| **機械可読な DSL リファレンス** | 全キー・型・既定値・列挙値・どのページ種別で有効かを1つの JSON に生成（spec から導出。strict のキー表が土台になる）。仕様書を読ませずに参照させる。CLI に `hatake reference` として出す | 仕様書 900行を毎回読ませるのは高い。索引があれば1発で引ける | 小〜中 |
| hatake MCP サーバ | 仕様の検索・定義の検証・例の取得を MCP ツールとして提供 | エージェントが**手元に仕様を持たなくても**正しい定義を書ける | 中 |
| 例のカタログ化 | `spec/examples/` を「やりたいこと → 例」の索引にする（今はファイル名の羅列） | AI は近い例をコピーする方が確実に速い | 小 |
| 英語版の最小資料 | `docs/api-cheatsheet.md`（英語）＋ llms.txt の英語版（[ドキュメント配布 TODO](#ドキュメント配布-todo) と同じ話） | 英語で学習したモデルに効く。日本語のみだと確度が落ちる | 小 |

### 3. 人が使うための道具・資料

| 項目 | 内容 | なぜ | 規模感 |
|---|---|---|---|
| **VSCode 拡張** | 段階的に: ①スニペット＋JSON Schema 自動紐付け（今は YAML 先頭に `# yaml-language-server:` を手書き）→ ②**定義プレビュー**（横に画面イメージ）→ ③GUI 編集（項目を並べて YAML を書き戻す） | 「YAML を手で書く」の敷居を下げる。②まで来ると営業でも見せられる | ①小 / ②中 / ③大 |
| Web プレイグラウンド | YAML を貼るとその場で描画される場（Flutter Web を GitHub Pages に置く。デモ資産が流用できる） | インストール前に触れる。紹介記事から直リンクできる | 中 |
| チュートリアル | 「0から受注入力画面まで」を通しで1本（今は導入＋レシピが個別にある状態） | 最初の30分の体験が採用を決める | 小〜中 |
| 移行ガイド | 既存の Flutter 画面 / 既存の業務システムからの置き換え手順（部分導入のやり方） | 新規案件より置き換えの方が多い | 小 |
| 図解 | アーキ図（Definition→Parser→Renderer）・データフロー・層の責務を画像で | 文章だけだと伝わらない層がいる | 小 |
| 配布（pub.dev / npm / Maven） | [配布・公開](#配布公開distribution)の TODO を実際に publish する | `git` 参照のままだと採用されにくい | 中 |

## 依頼の仕方（メモ）

「この表の ◯◯ を ◯◯言語で」「新機能 ◯◯ を spec 先行で」みたいに、この表を指して投げてくれれば拾いやすい。大きめのやつは「spec 定義 → 参照実装 → 横展開 → コンフォーマンス」の順で刻む。
