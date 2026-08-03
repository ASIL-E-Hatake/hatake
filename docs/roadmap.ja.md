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
| | WizardPage（ステップ入力） | ⏳ | |
| | FormPage（単票入力） | ✅ Flutter | 単票の作成/編集。フォーム描画を `_HatakeFormFields` に共通化しダイアログと共用。record key で編集/新規を切替 |
| 入出力 | Formatter（金額/和暦…） | 🚧 P0+P1 Flutter | [utils](roadmap-utils.ja.md) |
| | Converter（全半角…） | 🚧 P0+P1 Flutter | 同上。入力normalizeパイプ配線は未 |
| | Validator 拡充 | 🚧 一部 | 郵便番号済。法人番号/相関等は未 |
| 表現 | i18n / メッセージ多言語化 | ✅ 3言語 | `MessageResolver`（ロケール＋開いたキー、既定 ja）でバリデータ固定文言を差し替え可能に。`ValidatorRegistry(custom, messages)` で注入。Dart/TS/Java で同名・同挙動 |
| | テーマ / スタイル定義 | ⏳ | Renderer 側 |
| | 条件表示・活性制御 | ✅ 3言語 | `visibleWhen` / `enabledWhen`（宣言的条件。`evaluateCondition` を3言語＋conformance、Flutter はフォームで表示/活性を反応制御） |
| | 計算項目・派生値 | ✅ 3言語 | `computed`（`ComputedRegistry`：concat/sum/subtract/product ＋登録式。3言語＋conformance、Flutter は読み取り表示で自動再計算） |
| 動き | Action / Workflow フック | 🚧 | plugin action 済。遷移や確認ダイアログ定義は未 |
| | Navigation 定義 | ⏳ | 画面間遷移 |
| | 権限・可視制御 | ⏳ | ロールで項目/アクション出し分け |
| 出力 | CSV / 帳票 / 印刷 | ⏳ | Formatter を共有して実装 |
| バックエンド | サーバ側バリデーション | ✅ Java/TS | |
| | QueryBuilder（QuerySpec） | ✅ Java/TS | |
| | ORM アダプタ（opt-in） | ⏳ | JPA / Prisma / …。別パッケージ |
| | DTO / レスポンス形生成 | ⏳ | |

## B. 言語間の足並み（パリティ）

### いまの対応状況

| 機能 | spec | Flutter | Java | TypeScript |
|---|---|---|---|---|
| 定義モデル + YAML/JSON パーサ | ✅ | ✅ | ✅(※) | ✅ |
| YAML↔JSON↔DSL 収束テスト | — | ✅ | ✅(YAML↔JSON) | ✅(YAML↔JSON) |
| FormValidator（サーバ側） | ✅ | ✅ | ✅ | ✅ |
| Validator 拡張レジストリ | ✅ | ✅ | ✅ | ✅ |
| QueryBuilder（QuerySpec） | ✅ | — | ✅ | ✅ |
| Formatter / Converter | ✅ | ✅ | ✅ | ✅ |
| メッセージ i18n（`MessageResolver`） | — | ✅ | ✅ | ✅ |
| 条件表示 `evaluateCondition` / 計算 `computed` | ✅ | ✅ | ✅ | ✅ |
| Renderer（画面描画） | — | ✅(Material) | 対象外 | 対象外(※) |
| table/action など画面寄りモデル | ✅ | ✅ | ⏳一部 | ✅ |

※ Java の定義モデルは page 識別子 + search + form まで（table/action 未）。TS は画面寄りモデルも持つがバックエンド用途で描画はしない。

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

- **近い（P1）**: ~~Formatter/Converter を TS/Java へ横展開~~ ✅、~~コンフォーマンス・スイートの器~~ ✅、~~normalize 入力パイプの配線~~ ✅（Flutter は送信時に自動適用 / TS・Java は `normalizeRecord`・`FormNormalizer`）、~~QuerySpec の fixture 化~~ ✅ → 次は **utils P2**（消費税・年度・営業日）や **新ページ種別**、**DTO/レスポンス生成**あたり
- **中（P2）**: ~~DetailPage / MasterPage~~ ✅、~~消費税・年度/四半期・年齢/勤続・営業日（utils P2）~~ ✅（3言語＋conformance）、~~元号算出/税率別合計（utils 小follow-up）~~ ✅（`eraOf` / `computeInvoice`、3言語＋conformance）→ 残り：ORM アダプタ1個目（i18n・条件表示・計算項目は3言語✅）
- **遠い（P3）**: DashboardPage、権限制御、Python/Rust エディション、帳票・全銀など重いやつ

## 依頼の仕方（メモ）

「この表の ◯◯ を ◯◯言語で」「新機能 ◯◯ を spec 先行で」みたいに、この表を指して投げてくれれば拾いやすい。大きめのやつは「spec 定義 → 参照実装 → 横展開 → コンフォーマンス」の順で刻む。
