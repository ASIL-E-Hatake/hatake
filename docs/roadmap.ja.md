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
| | テーマ / スタイル定義 | ✅ Flutter（3言語パーサ） | `app.theme`＝色・明暗・密度・角丸・フォント（`primaryColor` / `secondaryColor` / `brightness` / `density` / `fontFamily` / `radius` / `config`）。**Renderer 非依存で挙動は変えない**（Material は `materialThemeOf()` で `ThemeData` に落とす。`HatakeApp` が自動適用するので Dart は1行も要らない）。`brightness: system` は端末設定に従う。`density` は VisualDensity と一覧の行高・入力欄の詰め方に効く（業務画面は `compact`）。**色が色でない／未知の `density` はパース時にエラー**（黙って無視されると「書いたのに変わらない」になるので）。Java は strict のキーだけ（描画しないので値は持たない） |
| | 条件表示・活性制御 | ✅ 3言語 | `visibleWhen` / `enabledWhen`（宣言的条件。`evaluateCondition` を3言語＋conformance、Flutter はフォームで表示/活性を反応制御）。**`{ mode: create }` / `{ mode: edit }`** で「新規のときだけ／編集のときだけ」を書ける＝キー項目の有無を見る回避策が要らない（モードは**レコードでは分からない**ので、フォームから渡す。分からない場所では false）。明細の行は追加が create・既存行が edit。**`enabledWhen` が偽なら非活性＝グレー**（読める顔のまま直せないだけにしたいときは `readOnlyWhen`）|
| | 項目制御の次段（読み取り専用・条件つき必須・区画） | ✅ 3言語 | `readOnlyWhen`（見た目は変えず編集だけ止める。`enabledWhen: { not: … }` の反転を読まずに済む素直な向き）・`requiredWhen`（条件つき必須）・`section.visibleWhen`（**区画ごと**出し分け。見出しも消える）。**ここで初めて条件がサーバ側の検証に入る**（`visibleWhen` と `requiredWhen` だけ。`enabledWhen` / `readOnlyWhen` は見た目の話なので見ない）＝**隠れている項目は検証しない**（`required` も他のバリデータも飛ばす。入力できない項目を必須にすると「直せないのに保存できない画面」になるため）。よって「出たら必須」は `visibleWhen` ＋ `required: true` で書けて、条件を2回書かない。`FormValidator.validate(form, record, mode)` の第3引数でモードを渡す（渡さないと mode のリーフは false ＝検証は緩む方に倒れる）。3言語一致は `conformance/conditional_validation.json`（8件）。隠れている項目の**値は保存される**（検証を飛ばすだけで消さない）。`hatake validate` が「`required: true` と `requiredWhen` の両方」「`readOnly: true` と `readOnlyWhen` の両方」を警告 |
| | 選択肢の連動（カスケード） | ✅ Flutter（Dart/TS 2言語のロジック） | 親項目の値で子項目の選択肢を絞る（都道府県→市区町村）。**2つの書き方**＝①定義に書く（`optionsFrom` ＋ 各選択肢の `when`。`when` 無しは常に出る）②`optionsSource` で **Repository から引く**（`value` / `label` / `parentKey` / `limit`。親の値が `parentKey` の名前で絞り込み条件として渡る。Framework は HTTP も SQL も知らない＝一覧と同じ `search` を呼ぶだけ）。**親が未入力なら出さない/引かない**、**親が変わって選べなくなった子の値は捨てる**（「大阪府なのに渋谷区」を保存させない）。絞り込みの判定は `visibleOptions` / `optionValueIsStale` として hatake_core と TS にあり、`conformance/option_filter.json` で一致を担保。`hatake validate` が「`when` があるのに `optionsFrom` が無い」「親がフォームに無い」「`options` と `optionsSource` の両方」を警告する。**検索条件（`search.filters`）でも同じキーが同じ意味で効く**（`filter` に `optionsFrom` / `optionsSource`）。違いは「いまの値の集まり」がレコードか検索欄かだけで、判定は `OptionsOwner`（項目と条件の共通の形）で共有＝入力用と検索用に判定を2つ持たない。選択肢の取得（I/O）も Renderer 側で1本（`_OptionsFetcher` をフォームと検索欄で共用）。範囲（`between`）は値を2つ持つので親にはできない |
| | 計算項目・派生値 | ✅ 3言語 | `computed`（`ComputedRegistry`：concat/sum/subtract/product ＋登録式。3言語＋conformance、Flutter は読み取り表示で自動再計算） |
| 動き | Action / Workflow フック | ✅ Flutter（3言語パーサ） | `action.confirm`（`title` / `message` / `okLabel` / `cancelLabel` / `danger`）と `action.onSuccess`（`message` / `page` / `params`）。**`delete` は宣言が無くても必ず確認する**（取り消せないので既定を安全側に。`confirm` を書くと文言が置き換わる）。`onSuccess` は**成功したときだけ**動く（ハンドラ未登録・出力先未登録・Repository が拒否＝全部失敗扱い）。`create` / `edit` はフォームを開くだけなので `onSuccess` の対象外。実装は**全ページ種別で1本のディスパッチャ**に寄せた（`_runPageAction`。crud/search/detail が個別に持っていた3重実装を解消）。ワークフロー（多段承認等）は対象外 |
| | Navigation 定義 | ✅ Flutter（3言語パーサ） | `AppDefinition`（menu＋pages）＋`HatakeApp`／`HatakeRouter`（依存ゼロ）。`navigate` で一覧→詳細（`$row.id`）、グループ見出し・レスポンシブ（サイドバー/Drawer）・ブレッドクラム対応。メニューは roles 連動。TS/Java はナビ情報＋ページ目録をパース。タブ/Web URL 同期は次段 |
| | 権限・可視制御 | ✅ 3言語 | `roles` を field/column/action に付与＋`isAllowed`（3言語＋conformance）。Flutter は現在ユーザのロール（`HatakeScope(roles:)`）で表示出し分け。※UI 表示制御のみ、認証・認可は対象外 |
| ページ種別 | ReportPage（帳票） | ✅ Flutter（3言語検証） | `type: report` ＝ 一覧の印刷版。明細の列は `table` から取り、`report` が紙の構造（`paper` / `rowsPerPage` / `sort` / `groupBy` / `totals`）を足す。**グループはコントロールブレイク**（並び順に見てキーが変わったら小計→見出し。並べ替えは Repository の責務なので `sort` で指定する）。集約は Dashboard と同じ `AggregateRegistry`。定義＋行 → 中立な `ReportDocument`（`QuerySpec` と同じ立ち位置）までを Framework が作り、Renderer は用紙比率でプレビューを描く（**明細行は search / master の一覧と同じ見た目**＝同じ文字サイズ・行高・区切り線・`column.width` 準拠。グループ見出しは行全幅）。**PDF 化・プリンタ送出は対象外**（opt-in アダプタ） |
| 出力 | CSV 出力 | ✅ 3言語 | `action` の型 `export`。**その画面の列と行から CSV を組む**（一覧・帳票で同じ書き方。ロールで見えない列は出さない）。RFC 4180 の引用、BOM / CRLF / 区切り / `raw`（format を通さない）を `config` で選べる。一覧の export は**表示中のページではなく検索結果全体**を出す（`limit` まで読み直す）。**ファイルを書くのは対象外**＝`HatakeScope(exportSink:)` に渡された出力先の責務（文字コード変換も同じ理由でそちら） |
| 出力 | 文字コード変換 | ✅ opt-in パッケージ | `export` の `config.charset`（既定 `utf-8`）で「受け側が欲しい文字コード」を宣言する。**変換するのは出力先**（バイト列を書く責務と同じ場所）なので、Framework は名前を運ぶだけ＝`ExportRequest.charset` と MIME の `charset=` に載せる。**`bom` は UTF-8 のときだけ効く**（Shift_JIS に BOM を付けると先頭のセルにゴミが3バイト入る。3言語＋`conformance/csv.json` で固定）。変換の実装は [`hatake_encoding`](../flutter/packages/hatake_encoding/)＝**cp932 / shift_jis / euc_jp**、依存ゼロ（表は Python 標準ライブラリの codec から生成）。**cp932 と shift_jis を分けているのが要点**＝実務の「Shift_JIS」はほぼ cp932（`①` `㈱` `髙` `～` が通る。JIS X 0208 の shift_jis には無い）で、汎用機向けに弾きたいときは shift_jis を選ぶ。IBM 拡張は同じ文字に2通りのバイト列があるので、**書くのは Windows / Excel と同じ方・読むのは両方**。変換できない文字は既定で例外（黙って `?` にしない）。正しさは Python（生成元）・Dart（実装）・**JVM の `Charset`（独立実装）** の3者一致で確認 |
| | 帳票の印刷（PDF/プリンタ） | ⏳ | `ReportDocument` を PDF/印刷に落とす opt-in アダプタ。`printing` / `pdf` 依存を本体に入れないため別パッケージ |
| 定義の品質 | `hatake` CLI | ✅ TS 同梱 | `npx hatake validate <file...>`（strict 既定・`--json`・**問題があれば終了コード 1** なので CI に置ける）、`new <kind>`（8種別の雛形。全部が strict とスキーマを通ることを CI で確認）、`dto` / `schema` / `openapi` / `types --out`（ネイティブ型のファイル出力の入口）。生成系は常に strict で読む（書き間違いを API に焼き付けないため）。→ [使い方](../typescript/README.md#cli) |
| 定義の品質 | 定義の diff / 影響範囲 | ✅ TS 同梱 | `hatake diff <前> <後>`（＋MCP の `hatake_diff`）＝`DtoSpec` の差分と**後方互換の判定**。**壊す変更があれば終了コード 1** なので CI に置ける。判定は形の向きで非対称＝受け取る形は「必須を足す／型を変える／制約を厳しくする」で壊れ、返す形は「項目を消す／型を変える」で壊れる（同じ `maxLength` 20→10 でも request は破壊的・response は互換）。検索パラメータを消すのは**黙って絞り込みが効かなくなる**ので破壊的扱い。ページ id の変更・形そのものの増減（読み取り専用化で request が消える等）も見る。常に strict で読む |
| 定義の品質 | 構造の間違いの静的検出 | ✅ TS 同梱 | `hatake validate` が**解析は通るのに意図どおり動かない書き方**を警告する（既定ON・終了コードは変えない／`--warn-as-error` で 1／`--no-warn` で黙る／`--json` に `warnings`）。規則は11個（宣言していない行アクション・存在しないページへの遷移・`home` の行き先・カードの `action`・ページ/アクション id と項目名の重複・条件で使えない演算子・`field` の無い集計・`sort` の無い `groupBy`・列に無い項目の合計・`rowActions`/`validators` の書き方）。素の document を見るので `page:` / `app:` どちらでも動き、**遷移先の検査は `app:` のときだけ**（単票は他のページを知らないので誤検出しない）。警告は対照表の id を持つので `hatake pitfalls <id>` に繋がる。MCP の `hatake_validate` も返す |
| 定義の品質 | よくある間違いの対照表 | ✅ spec + TS | [`spec/pitfalls.json`](../spec/pitfalls.json)＝「間違い → なぜ駄目か → 正しい書き方」（ja/en）。strict が拾えない2種類を埋める＝**構造の間違い**（ページ直下に `columns`／`form` 直下に `fields`／`search` に `form`／`report` に `key`）と**落ちないけど意図と違う**（`groupBy` に `sort` 無し／`metric` が件数／条件で `between`／`rowActions` にオブジェクト）。`hatake validate` と `hatake_validate` は**未知キーからこの表を引いてヒントを出す**（名前だけでは構造の間違いは直せないので）。`hatake pitfalls` / `hatake_pitfalls` でも引ける。**各項目は「間違いの例が本当に落ち、正しい例が本当に通り、自分の例で自分が引ける」ことを CI で確認**＝表が嘘をつけない |
| 定義の品質 | 英語版の AI 資料 | ✅ | [`docs/api-cheatsheet.md`](api-cheatsheet.md)＋[`llms-en.txt`](../llms-en.txt)。日本語のみの文書には `(ja)` を明記（読めると思って読ませて確度を落とさないため）。**両版の組み込み一覧はスキーマと機械的に突き合わせる**（`<!-- vocab: <ノード>.<キー> -->` の印を付けた一覧をテストが拾って比較。過去に日本語版のフィルタ演算子から `notEquals`、アクション型から `navigate`/`export` が落ちていたのを検出） |
| 定義の品質 | MCP サーバ（`hatake-mcp`） | ✅ TS 同梱 | AI エージェントに「仕様の引き当て・例の取得・検証・雛形・API の形」を道具として渡す（`hatake_reference` / `hatake_examples` / `hatake_validate` / `hatake_new_page` / `hatake_api_shape`）。**依存ゼロで手書き**（stdio の JSON-RPC 2.0 で必要なのは `initialize` / `tools/list` / `tools/call` だけ。CLI と同じ判断で `@modelcontextprotocol/sdk` を入れない）。プロトコル `mcp.ts` と道具 `mcpTools.ts` を分離。名乗るバージョンは `2025-06-18` / `2025-03-26` / `2024-11-05`。**知らない道具はプロトコルのエラー、道具の中の失敗は結果として返す**（後者はモデルに読ませて直させる）。`initialize` の `instructions` に使う順番（例を探す→雛形→キーを引く→検証）を載せてある。CI で stdio の往復を実際に流す。→ [使い方](guide/mcp.ja.md) |
| 定義の品質 | 機械可読な DSL リファレンス | ✅ spec + TS | [`spec/reference.json`](../spec/reference.json)＝**全キーの索引**（ノードごとのキー・型・既定値・取れる値・親ノード・**どのページ種別で有効か**＋`keyIndex`）。JSON Schema から機械生成（`npx hatake reference [name] [--page-kind k]`、`--out` でファイル）。`values` は `open: true` なら「組み込みの一覧」＝Registry で足せる、`false` なら enum。**嘘をつかないことが唯一の価値**なので、①strict のキー表と1キーずつ一致 ②組み込みの一覧が実装のレジストリと一致（フォーマッタ/コンバータ/バリデータ/集約/計算/フィールド型/列型/アクション型/演算子）③説明文の「Built-ins:」と機械可読な値が一致 ④条件の演算子は conformance に実例がある ⑤コミット済み生成物が最新、を CI で確認 |
| 定義の品質 | 例のカタログ | ✅ spec + TS | [`spec/examples/index.json`](../spec/examples/index.json)＋[人向けの表](../spec/examples/README.md) で「やりたいこと → 例」を引ける（`npx hatake examples <query>`）。ディレクトリと1対1・`kind`/`title` が定義と一致・`keys` が実在して実際に使われている・全例が strict を通る、を CI で確認 |
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
| CLI（`validate` / `new` / 生成 / `reference` / `examples` / `pitfalls` / `diff`） | — | — | — | ✅（`npx hatake`） |
| MCP サーバ（`hatake-mcp`） | — | — | — | ✅（依存ゼロ・道具5つ） |
| 機械可読な DSL リファレンス（`reference.json`） | ✅ | 対象外(※3) | 対象外(※3) | ✅（生成元） |
| よくある間違いの対照表（`pitfalls.json`） | ✅ | 対象外(※3) | 対象外(※3) | ✅（検証・引き当て） |
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
| 条件の `mode`（新規/編集） | ✅ | ✅（フォームが渡す） | ✅ | ✅ |
| 選択肢の連動（`optionsFrom` / `when` / `optionsSource`） | ✅ | ✅（＋Repository から引く。入力・検索の両方） | strict のみ | ✅（モデル＋絞り込み） |
| 項目制御（`readOnlyWhen` / `requiredWhen` / `section.visibleWhen`） | ✅ | ✅（＋描画） | ✅（`requiredWhen` / 隠れた項目の除外を検証） | ✅（同左） |
| 登録済み一覧（`hatake registry` / `registrySnapshot`） | — | ✅（実行時に申告） | ✅（実装を走査する道具） | — |
| 権限 `roles` / `isAllowed` | ✅ | ✅ | ✅ | ✅(field) |
| ナビ定義（app/menu）パーサ | ✅ | ✅（＋描画） | ✅（目録 PageRef） | ✅（目録 PageRef） |
| テーマ定義 `app.theme` | ✅ | ✅（＋適用） | strict のみ | ✅（モデル＋検証） |
| アクションのフック `confirm` / `onSuccess` | ✅ | ✅（＋実行） | strict のみ | ✅（モデル＋検証） |
| 親子・明細 `subTable`（モデル＋パーサ） | ✅ | ✅（＋描画） | ✅ | ✅ |
| 明細行のサーバ側検証（`lines[0].qty`） | ✅ | ✅ | ✅ | ✅ |
| 明細の `source`（子Repository方式） | ✅ | ✅（＋描画・ページング） | ✅（検証で当該項目を飛ばす） | ✅（同左） |
| ステップ入力 `wizard`（モデル＋パーサ＋ステップ検証） | ✅ | ✅（＋描画） | ✅ | ✅ |
| ダッシュボード `dashboard`（モデル＋パーサ） | ✅ | ✅（＋描画・チャート） | ✅ | ✅ |
| 集約 `AggregateRegistry`（count/sum/avg/min/max） | ✅ | ✅ | ✅ | ✅ |
| 帳票 `report`（モデル＋パーサ＋`buildReport`） | ✅ | ✅（＋プレビュー描画） | ✅ | ✅ |
| CSV 出力 `toCsv` | ✅ | ✅（＋`export` アクション） | ✅ | ✅ |
| 文字コードの宣言（`config.charset` / BOM の抑制） | ✅ | ✅（＋変換は `hatake_encoding`） | ✅ | ✅ |
| Renderer（画面描画） | — | ✅(Material) | 対象外 | 対象外(※) |
| table/action など画面寄りモデル | ✅ | ✅ | ⏳一部（table 追加済／action 未） | ✅ |

※ Java の定義モデルは page 識別子 + search + table + form + dashboard の `items` まで（action 未。`table` は DTO のレスポンス形導出のために追加）。ダッシュボードのカードは「どう引くか＋どう畳むか」を持ち、`span` / `height` のような描画専用キーは持たない。子グリッド用の `ColumnDefinition` は検証に必要な最小形（field/label/type/format）で、`width`/`sortable`/`roles` 等の描画専用キーは持たない。TS は画面寄りモデルも持つがバックエンド用途で描画はしない。

※3 リファレンスは**言語非依存の成果物**（`spec/reference.json`）なので、各エディションが同じものを持つ必要はない。生成は CLI がある TS 版に置き、成果物をコミットして生の URL で引けるようにしてある。ただし「リファレンスが実装と一致しているか」の確認は TS のレジストリに対してしか機械化できていない（Dart/Java 側は conformance で3言語一致を担保しているので間接的には効いている）。

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

- **TS (npm)**: `tsc` で `dist/`（JS + `.d.ts`）を吐いて `npm publish --access public`。consumer は `npm i @hatake/core`。**`spec/` を同梱すること**（`hatake reference` と MCP サーバが実行時に `spec/hatake-page.schema.json` と `spec/examples/` を読む。今はリポジトリを持っている前提で上へ探しに行き、無ければ場所を渡してもらう作り）。npm スコープ `@hatake` が取れなければ `@asil-e-hatake/*` か 無スコープ `hatake-core`。README は npmjs にそのまま出る。
- **Java**: モノレポの `java/` から publish。
  - 早期は **JitPack**（GitHub タグから即配布・publisher 設定ほぼゼロ。※モノレポの subdir 指定が要る）か **GitHub Packages (Maven)**（publisher は楽・consumer 側が認証設定を要する＝フリクションあり）。
  - 本格化で **Maven Central**（consumer フリクション最小だが、名前空間検証＋GPG 署名＋sources/javadoc jar が必要）。
  - **groupId**: `io.github.asil-e-hatake`（GitHub アカウントで自動検証。`io.hatake` はドメイン所有証明が要るため不採用）。`java/build.gradle` 設定済み。※Java **ソースパッケージ**は `io.hatake.core` のまま（groupId とは別物）。
- **共通**: 各 subdir から個別 publish。バージョンは当面各エディション自走 or 揃える方針を決める。pub.dev/npm は README を表示するが Maven 系は出ないので、Java は GitHub / Pages のドキュメントに誘導。

### ドキュメント配布 TODO
- **英語版チートシート**（[`docs/api-cheatsheet.md`](api-cheatsheet.md)）＋ **[`llms-en.txt`](../llms-en.txt)** … ✅ 追加済み。組み込みの名前一覧は日本語版と同じ印（`<!-- vocab: … -->`）でスキーマと突き合わせているので、片方だけ古くなることはない。日本語のみの文書へのリンクには `(ja)` を明記。
- 英語版のガイド（`guide/*.md`）・レシピは未。需要が出てから（チートシート＋機械可読ファイルで定義は書けるので優先度は低い）。
- 各パッケージ公開時、README にチートシート要約 or リンクを入れる。

## これから（優先度つき）

**終わったものはこの節から消す。** 完了した機能の状態は上の [A. 機能として用意すべきもの](#a-機能として用意すべきもの)と
[B. 言語間の足並み](#b-言語間の足並みパリティ)が持つので、ここは「まだ無いもの」だけの一覧にしておく。
（履歴が要るときは git log を見る。P0〜P2 と WizardPage / DTO生成 / DashboardPage は完了済み。）

### 1. 機能（Framework 本体）

| 項目 | 内容 | なぜ | 規模感 |
|---|---|---|---|
| **帳票の印刷アダプタ** | `ReportDocument` → PDF / プリンタ（`printing` / `pdf` 依存を本体に入れず opt-in パッケージで）。ページ番号・ヘッダフッタの体裁もここ | 帳票は「画面で見る」で終わらない。プレビューまでは入ったので残りは出力経路 | 中 |
| テーマの次段 | ページ単位の上書き・複数テーマの切替（ダーク手動切替）・`config` で Renderer 固有の見た目を足す口の整備 | 1枚目が出た後の要望。今は app 単位＋`config` 止まり | 小〜中 |
| アクションの次段 | `onError`（失敗時の文言差し替え）・実行前フック（入力を足す小さなダイアログ）・**複数レコードへの一括実行** | `confirm` / `onSuccess` で足りない所から。一括操作は業務でよく来る | 中 |
| 相関チェック（項目間の検証） | 「開始日 ≤ 終了日」「合計＝明細の和」のように**2つ以上の項目を見る検証**。条件式（`evaluateCondition`）は書けるので、検証側にも同じ形を持ち込む（`validators` の要素が他の項目を見られない、という今の制約を外す） | `requiredWhen` で「条件つき必須」は書けたが、必須以外の相関はまだコードに落ちる。条件つき必須の自然な次 | 中 |
| ウィザードのステップ条件 | ステップ自体の `visibleWhen`（条件で丸ごと飛ばす）。「次へ」「戻る」が隠れたステップを飛ばし、検証も飛ばす | 区画（section）まで入ったので、次に来るのはステップ単位。ナビゲーションが絡むので別枠 | 中 |
| Validator 拡充 | 法人番号・マイナンバー・相関チェック（項目間の比較） | 相関チェックが無いと結局コードに落ちる | 小〜中 |
| Web URL 同期 / タブ | ルートと URL の相互反映、複数タブ | Web で配ると必ず「URL 共有できないの？」になる | 中 |
| ダッシュボードの次段 | 期間プリセット（今月/今年度）・カードからのドリルダウン・自動更新 | 1枚目が出た後の実運用要望 | 小〜中 |
| 帳票の次段 | 複数レベルの改ページ制御・「以下余白」・繰越／前頁計、Excel（xlsx）出力 | 実際の業務帳票で追加要求が来る定番 | 中 |
| 文字コード変換の次段 | ISO-2022-JP（メール用。エスケープシーケンスで状態を持つので表引きでは書けない）・JIS X 0212 補助漢字・固定長との組み合わせ | ここまで来ると個別案件の話が多い。需要が出てから | 小〜中 |
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
> - **機械可読な DSL リファレンス**＋**例のカタログ** … ✅
>   [`spec/reference.json`](../spec/reference.json)（全キーの索引・`keyIndex`・ページ種別ごとの有効範囲）と
>   [`spec/examples/index.json`](../spec/examples/index.json)（やりたいこと → 例）。
>   引く口は `npx hatake reference <キー名>` / `npx hatake examples <やりたいこと>`。
>   リファレンスがスキーマ・strict のキー表・実装のレジストリとズレないことは CI で確認。
>   → [DSL 仕様](../spec/dsl-spec.ja.md#機械可読なリファレンス) / [例のカタログ](../spec/examples/README.md)
> - **MCP サーバ** … ✅ TS 版に同梱（`hatake-mcp`）。エージェントが**手元に仕様を持たずに**
>   引ける（`hatake_reference` / `hatake_examples` / `hatake_validate` / `hatake_new_page` /
>   `hatake_pitfalls` / `hatake_api_shape`）。依存ゼロで手書き。`initialize` の
>   `instructions` で使う順番も渡す。→ [MCP ガイド](guide/mcp.ja.md)
> - **定義の diff / 影響範囲** … ✅ `hatake diff <前> <後>` / MCP の `hatake_diff`。
>   `DtoSpec` の差分＋後方互換の判定（壊す変更があれば終了コード 1）。受け取る形と
>   返す形で結論が非対称なのが要点。→ [使い方](../typescript/README.md#cli)
> - **構造の間違いの静的検出** … ✅ `hatake validate` が既定で警告も出す（`--warn-as-error` /
>   `--no-warn`）。strict もスキーマも通るのに意図どおり動かない書き方＝宣言していない行
>   アクション・存在しないページへの遷移・id / 項目名の重複・条件で使えない演算子・`field`
>   の無い集計・`sort` の無い `groupBy`・列に無い項目の合計・`validators` の書き方。
>   MCP の `hatake_validate` も `warnings` を返す。**同梱の例とデモが警告ゼロ**であることを
>   CI で確認（＝規則がうるさすぎない証拠）。→ [DSL 仕様](../spec/dsl-spec.ja.md#構造の間違いの検出警告)
> - **警告の次段（画面の外との辻褄）** … ✅ `hatake refs`（定義が外に要求しているものを列挙）＋
>   `hatake validate --registry <file>`（渡した一覧と突き合わせ）。`repository:` や `plugin:` の
>   名前がアプリ側で登録されていなければ、**画面は出るのにデータが来ない／押しても何も起きない**。
>   strict もスキーマもここは見られない（登録済みの一覧を知らない）ので、**渡されたカテゴリだけ**
>   突き合わせる。組み込み名は自動で足す。定義の隣の `hatake-registry.json` は黙って拾う。
>   MCP の `hatake_refs` / `hatake_validate(registry)`。→ [DSL 仕様](../spec/dsl-spec.ja.md#画面の外との辻褄登録済み一覧を渡したとき)
> - **登録済み一覧の生成** … ✅ `hatake registry <path...>`（実装のソースを読んで
>   `hatake-registry.json` を作る）。Dart / TS の `XxxRegistry({ 'name': … })`、Java の
>   `Map.of(…)`（型を明示した `Map.<K, V>of(…)` も）、名前付き引数の `fieldBuilders: { … }`。
>   **言語のパーサは持たない**＝その場に書いてある文字列しか読めないので、変数や関数から
>   組み立てている登録は**黙って落とさずに報告して終了コード 1**（落とすと「登録してあるのに
>   未登録」という嘘の警告になる）。コンストラクタの宣言と素通しは登録として数えない。
>   デモの一覧は生成物になり、CI が再生成して diff する（古くなったら落ちる）。
> - **登録済み一覧の生成の次段（実行時の申告）** … ✅ `registrySnapshot(scope)` /
>   `registrySnapshotJson(scope)`（Flutter）。静的な走査が読めない**動的な登録**は、
>   動いているアプリに聞くしかない。出す形は `hatake registry` と同じなので、どちらで
>   作った一覧も `validate --registry` に渡せる。Renderer は `RegistryReporter` を実装
>   すれば自分の登録（`fieldBuilders` など）を名乗れる＝**`Renderer` 本体は変えない**
>   （足すと既存の Renderer が全部壊れる＝プラグインを fork させることになる）。
>   語彙と形は `conformance/registry_snapshot.json` で TS 版と一致を確認。デモの一覧は
>   **静的な走査と動いているアプリの両方から**同じであることを試験している。
> - **diff の次段（画面・権限・アプリ構成）** … ✅ `hatake diff` が `app:` どうしも比べ、変更を
>   **area**（api / ui / access / app）× **impact**（breaking / caution / safe）で返す。
>   「壊す」と「確かめてほしい」を混ぜないのが要点。→ [使い方](../typescript/README.md#cli)
> - **よくある間違いの対照表**＋**英語版の最小資料** … ✅
>   [`spec/pitfalls.json`](../spec/pitfalls.json)（間違い → 正しい書き方。`validate` が
>   未知キーから自動で引く）と [`docs/api-cheatsheet.md`](api-cheatsheet.md) /
>   [`llms-en.txt`](../llms-en.txt)。どちらも「spec 由来で二重管理しない」＝対照表は
>   例が本当に落ちる/通ることを、チートシートは組み込み一覧がスキーマと一致することを
>   CI で確認。

**この節は空になった**（AI First の具体項目は一通り入った）。次に足すなら:

| 項目 | 内容 | なぜ | 規模感 |
|---|---|---|---|
| diff の履歴 | 2ファイルではなく **git の2リビジョン**を比べる（`hatake diff --git HEAD~1..HEAD`）。PR に貼れる Markdown 出力 | 「変更前のファイル」を手で用意するのが面倒で、CI に置きにくい | 小〜中 |
| 定義の自動修復（`--fix`） | 警告のうち**直し方が一意なもの**を書き換える（`rowActions` の綴り違い、`groupBy` に `sort` を足す、`options` と `optionsSource` の重複を消す）。触る前に diff を見せる | AI は指摘されると**別の場所を直して**壊すことがある。一意な直しは機械がやったほうが速くて安全 | 中 |
| 「なぜそう書くか」の説明生成 | `hatake explain <file>` … 定義を読んで「この画面は何をするか」を日本語で説明する（キー単位ではなく画面単位）。AI が書いた定義を**人がレビューする**ための出力 | 定義は読めば分かるが、レビューする人は DSL を知らないことが多い。AI に書かせるほど、人が読める説明が要る | 中 |
| 定義の最小化（`hatake minimize`） | 既定値と同じ指定・効いていない指定を落として、**意味を変えずに短くする**。AI が生成した定義は冗長になりがち | 冗長な定義はレビューが重くなり、次に AI が読むときのコンテキストも太る | 小〜中 |
| 失敗例のカタログ | 「AI がこう書いて落ちた」実例（入力・出た警告・直した結果）を `spec/` に溜めて、`pitfalls` と同じように引けるようにする | 対照表は**人が考えた**間違いの集合。実際に AI が転んだ所とはズレる | 中 |
| 定義の意味的な等価判定 | `hatake same a.yaml b.yaml` … 書き方が違っても**同じ画面か**を判定する（キーの並び・既定値の明示・等価な条件の書き換え） | AI に直させると差分が大きく出るが、意味は変わっていないことが多い。レビューの負荷が下がる | 中 |

### 3. 人が使うための道具・資料

> **済**:
> - **Web プレイグラウンド** … ✅ デモアプリの中（同じ成果物）。
>   <https://asil-e-hatake.github.io/hatake/demo/?playground=1>。定義を貼ると**その場で
>   描画**され、直すと描き変わる。データは**定義から作る仮のもの**（`field` の名前から
>   それらしい値を作るので Repository を書かなくていい）。strict で読むので**綴り間違いは
>   その場で理由が出る**（任意キーは黙って捨てられるので、ここが半分の価値）。読めない間は
>   前に読めた画面を出しておく（1文字打つたびに画面が消えると編集できない）。定義は
>   `?yaml=<base64>` で**URL に載せて渡せる**。デモの各画面からは「触ってみる」で
>   その画面の定義を持って開く。→ [プレイグラウンド](../flutter/packages/hatake_example/lib/playground.dart)

| 項目 | 内容 | なぜ | 規模感 |
|---|---|---|---|
| **VSCode 拡張** | 段階的に: ①スニペット＋JSON Schema 自動紐付け（今は YAML 先頭に `# yaml-language-server:` を手書き）→ ②**定義プレビュー**（横に画面イメージ）→ ③GUI 編集（項目を並べて YAML を書き戻す） | 「YAML を手で書く」の敷居を下げる。②まで来ると営業でも見せられる | ①小 / ②中 / ③大 |
| プレイグラウンドの次段 | 画面を URL で直接指す（[Web URL 同期](#1-機能framework-本体)と同じ話）・エディタの補完（JSON Schema を積む）・共有リンクの短縮 | 貼れるようにはなったので、次は「その画面を指して渡す」 | 中 |
| チュートリアル | 「0から受注入力画面まで」を通しで1本（今は導入＋レシピが個別にある状態） | 最初の30分の体験が採用を決める | 小〜中 |
| 移行ガイド | 既存の Flutter 画面 / 既存の業務システムからの置き換え手順（部分導入のやり方） | 新規案件より置き換えの方が多い | 小 |
| 図解 | アーキ図（Definition→Parser→Renderer）・データフロー・層の責務を画像で | 文章だけだと伝わらない層がいる | 小 |
| 配布（pub.dev / npm / Maven） | [配布・公開](#配布公開distribution)の TODO を実際に publish する | `git` 参照のままだと採用されにくい | 中 |

## 依頼の仕方（メモ）

「この表の ◯◯ を ◯◯言語で」「新機能 ◯◯ を spec 先行で」みたいに、この表を指して投げてくれれば拾いやすい。大きめのやつは「spec 定義 → 参照実装 → 横展開 → コンフォーマンス」の順で刻む。
