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
| | 相関チェック（項目間の検証） | ✅ 3言語 | `validators` の `compare`＝**他の項目の値を見る唯一の組み込み**（「開始日 ≤ 終了日」「合計＝明細の和」）。`{ type: compare, operator: gte, field: startDate }`、明細と比べるなら `aggregate: sum, of: amount`（畳み込みはダッシュボードと同じ集約）。比べ方は**数として読めれば数、読めなければ文字**（ISO の日付は文字の大小＝日付の前後なので、言語ごとに違う日付解釈を持ち込まない）。**判定できないときは通す**（自分が空なら `required` の担当）。メッセージは相手の**ラベル**で出す。拡張の署名は壊さない（検証に渡す持ち物を1つのオブジェクトにまとめ、今までの2引数の検証はそのまま動く）。3言語一致は `conformance/cross_field_validation.json`（13件）。書き間違いは `hatake validate` が5つの警告で言う（黙って通ってしまう類なので） |
| | 選択肢の連動（カスケード） | ✅ Flutter（Dart/TS 2言語のロジック） | 親項目の値で子項目の選択肢を絞る（都道府県→市区町村）。**2つの書き方**＝①定義に書く（`optionsFrom` ＋ 各選択肢の `when`。`when` 無しは常に出る）②`optionsSource` で **Repository から引く**（`value` / `label` / `parentKey` / `limit`。親の値が `parentKey` の名前で絞り込み条件として渡る。Framework は HTTP も SQL も知らない＝一覧と同じ `search` を呼ぶだけ）。**親が未入力なら出さない/引かない**、**親が変わって選べなくなった子の値は捨てる**（「大阪府なのに渋谷区」を保存させない）。絞り込みの判定は `visibleOptions` / `optionValueIsStale` として hatake_core と TS にあり、`conformance/option_filter.json` で一致を担保。`hatake validate` が「`when` があるのに `optionsFrom` が無い」「親がフォームに無い」「`options` と `optionsSource` の両方」を警告する。**検索条件（`search.filters`）でも同じキーが同じ意味で効く**（`filter` に `optionsFrom` / `optionsSource`）。違いは「いまの値の集まり」がレコードか検索欄かだけで、判定は `OptionsOwner`（項目と条件の共通の形）で共有＝入力用と検索用に判定を2つ持たない。選択肢の取得（I/O）も Renderer 側で1本（`_OptionsFetcher` をフォームと検索欄で共用）。範囲（`between`）は値を2つ持つので親にはできない |
| | 計算項目・派生値 | ✅ 3言語 | `computed`（`ComputedRegistry`：concat/sum/subtract/product ＋登録式。3言語＋conformance、Flutter は読み取り表示で自動再計算） |
| 動き | Action / Workflow フック | ✅ Flutter（3言語パーサ） | `action.confirm`（`title` / `message` / `okLabel` / `cancelLabel` / `danger`）と `action.onSuccess`（`message` / `page` / `params`）。**`delete` は宣言が無くても必ず確認する**（取り消せないので既定を安全側に。`confirm` を書くと文言が置き換わる）。`onSuccess` は**成功したときだけ**動く（ハンドラ未登録・出力先未登録・Repository が拒否＝全部失敗扱い）。`create` / `edit` はフォームを開くだけなので `onSuccess` の対象外。実装は**全ページ種別で1本のディスパッチャ**に寄せた（`_runPageAction`。crud/search/detail が個別に持っていた3重実装を解消）。ワークフロー（多段承認等）は対象外 |
| | Navigation 定義 | ✅ Flutter（3言語パーサ） | `AppDefinition`（menu＋pages）＋`HatakeApp`／`HatakeRouter`（依存ゼロ）。`navigate` で一覧→詳細（`$row.id`）、グループ見出し・レスポンシブ（サイドバー/Drawer）・ブレッドクラム対応。メニューは roles 連動。TS/Java はナビ情報＋ページ目録をパース。タブは次段（複数タブ）。**Web の URL 同期は入った**（下記） |
| | 権限・可視制御 | ✅ 3言語 | `roles` を field/column/action に付与＋`isAllowed`（3言語＋conformance）。Flutter は現在ユーザのロール（`HatakeScope(roles:)`）で表示出し分け。※UI 表示制御のみ、認証・認可は対象外 |
| ページ種別 | ReportPage（帳票） | ✅ Flutter（3言語検証） | `type: report` ＝ 一覧の印刷版。明細の列は `table` から取り、`report` が紙の構造（`paper` / `rowsPerPage` / `sort` / `groupBy` / `totals`）を足す。**グループはコントロールブレイク**（並び順に見てキーが変わったら小計→見出し。並べ替えは Repository の責務なので `sort` で指定する）。集約は Dashboard と同じ `AggregateRegistry`。定義＋行 → 中立な `ReportDocument`（`QuerySpec` と同じ立ち位置）までを Framework が作り、Renderer は用紙比率でプレビューを描く（**明細行は search / master の一覧と同じ見た目**＝同じ文字サイズ・行高・区切り線・`column.width` 準拠。グループ見出しは行全幅）。**PDF 化・プリンタ送出は本体の外**＝opt-in アダプタ [`hatake_print`](../flutter/packages/hatake_print/) |
| 出力 | CSV 出力 | ✅ 3言語 | `action` の型 `export`。**その画面の列と行から CSV を組む**（一覧・帳票で同じ書き方。ロールで見えない列は出さない）。RFC 4180 の引用、BOM / CRLF / 区切り / `raw`（format を通さない）を `config` で選べる。一覧の export は**表示中のページではなく検索結果全体**を出す（`limit` まで読み直す）。**ファイルを書くのは対象外**＝`HatakeScope(exportSink:)` に渡された出力先の責務（文字コード変換も同じ理由でそちら） |
| 出力 | 文字コード変換 | ✅ opt-in パッケージ | `export` の `config.charset`（既定 `utf-8`）で「受け側が欲しい文字コード」を宣言する。**変換するのは出力先**（バイト列を書く責務と同じ場所）なので、Framework は名前を運ぶだけ＝`ExportRequest.charset` と MIME の `charset=` に載せる。**`bom` は UTF-8 のときだけ効く**（Shift_JIS に BOM を付けると先頭のセルにゴミが3バイト入る。3言語＋`conformance/csv.json` で固定）。変換の実装は [`hatake_encoding`](../flutter/packages/hatake_encoding/)＝**cp932 / shift_jis / euc_jp**、依存ゼロ（表は Python 標準ライブラリの codec から生成）。**cp932 と shift_jis を分けているのが要点**＝実務の「Shift_JIS」はほぼ cp932（`①` `㈱` `髙` `～` が通る。JIS X 0208 の shift_jis には無い）で、汎用機向けに弾きたいときは shift_jis を選ぶ。IBM 拡張は同じ文字に2通りのバイト列があるので、**書くのは Windows / Excel と同じ方・読むのは両方**。変換できない文字は既定で例外（黙って `?` にしない）。正しさは Python（生成元）・Dart（実装）・**JVM の `Charset`（独立実装）** の3者一致で確認 |
| 出力 | 帳票の印刷（PDF/プリンタ） | ✅ opt-in パッケージ | [`hatake_print`](../flutter/packages/hatake_print/)＝`reportPdf(page, rows)` で PDF のバイト列。**純 Dart・依存は core だけ**なので UI が無い所（夜間バッチ・サーバ側）でも刷れる（プリンタ送出は `printing` にバイト列を渡すだけ＝こちらは依存しない）。間に**中立な `PrintLayout`**（左上原点・ポイント・y 下向きの座標まで決めた紙）を挟むので、出口は差し替えられる。書式・列幅・見えない列（`roles`）・枚数は**画面の帳票と同じ規則**（紙の分かれ目は `buildReport` の結果をそのまま使う＝画面で3枚なら3枚刷る）。紙は伸びないので、`rowsPerPage` が多いときは行高と文字を**縮めて**必ず収め、列は合計が紙幅を超えたら同じ率で縮める。**`pdf` / `printing` に依存せず PDF を自分で書いている**のは、①同じ入力なら同じバイト列（日付を入れない）＝見本の帳票を1バイト単位で CI に固定できる ②第三者のレイアウトエンジンに組み替えると体裁が黙って変わったことに気づけない ③圧縮しないので `grep` できる、の3つ。日本語は**非埋め込みの Adobe-Japan1 CID フォント**（1枚数KB・書体は開いた環境が決める。字面まで固定したいなら埋め込みが要る＝次段）。字送りは PDF に書く `/W` と幅の見積もりを**同じ規則**にし、ビューアが実際に使う幅が読めない文字（`¥` `①` `℃`）は1文字ずつ置き直す（金額の右端がずれない）。見本 PDF は pypdf（別実装）で読み返して CI で検査。**紙を刷る前に読む**なら `npx hatake paper`（TypeScript 版が同じ `PrintLayout` を組んで文字にする。座標の一致は [`conformance/report_layout.json`](../spec/conformance/report_layout.json) が縛る） |
| ナビゲーション | Web の URL 同期 | ✅ Flutter | `HatakeApp(syncUrl: true)`（既定）。`/画面id?params` で**リンクを踏める・リロードで戻らない・ブラウザの戻るが効く**。書くのは web だけ（ほかの platform に address bar は無い）が、**開かれた URL は全 platform で読む**＝モバイルのディープリンクもそのまま効く。履歴を持つのはブラウザで、こちら側の積み重ねは1段（2つ持つと「戻る」が2つの意味になる）。この app に無い画面 id は**引き受けない**（別のビルドの URL で空白の画面にしない）。URL の読み書きは差し替えられる口（`RouteUrl`）の裏なので、**ブラウザ無しで試験できる**。params は**文字で戻る**（URL に型は無い＝`0012` を 12 にしない） |
| データの口 | REST Repository | ✅ opt-in パッケージ | [`hatake_http`](../flutter/packages/hatake_http/)＝`hatake openapi` が定義から宣言する API と**1対1**で話す `Repository`（一覧は `items` / `totalCount`、1件は `<collection>/{key}`、404 は null）。**通信そのものは持たない**（`HttpSend` という関数1つを受け取る）ので依存はゼロで web でも動き、`package:http` でも dio でも社内のインターセプタでも差せる。認証は**毎回聞く**ヘッダの口（トークンは期限が切れる）。失敗は型で返す（401/403・400＝項目ごとの検証結果・その他・**宣言と違う形**）。宣言と違う形で落ちるのは意図的で、黙って合わせると `items` が読めず「0 件」＝空の画面になり原因が通信まで遡れない。名前の一致は [`conformance/rest_query.json`](../spec/conformance/rest_query.json) が縛る（**片方だけ直しても失敗しない**＝サーバは知らない名前を無視するだけ、が一番怖い） |
| 操作 | 選んだ行にまとめて実行（`scope: selection`） | ✅ Flutter | `action` の `scope`（`page` 既定 / `selection`）。`selection` を書くと**その画面の表にチェックボックスが出る**＝「選択可能にするキー」を別に持たない（別々にすると、チェックボックスだけ出て何もできない表・一括ボタンだけ出て選べない画面の2つが書けてしまう）。**選ぶまで押せない**（件数がラベルに出る）。**行が入れ替わったら選択を捨てる**（検索し直し・ページ送り・実行後の読み直しで、画面に無い行へ実行できてしまうのが一番危ない）。実行できたら選択は解ける。実行できるのは `type: plugin` だけで、渡すのは**行そのもの**（状態や金額で弾く判断が要るので、キーだけ渡すとハンドラが件数ぶん読み直す）。呼び出しは**1回**＝API も1回で済む。**一括の削除は用意しない**（取り消せない操作は事故が件数ぶん大きくなる）。**1回で動かせる上限は定義に書ける**（`maxRows`）＝上限は業務の決めごと（承認は20件まで）。超えて選んでいる間ボタンは押せず、ラベルに「いま何件で何件までか」を出す。**切り詰めて実行はしない**（選んだうちの一部だけが動いたことに、押した人は気づけない）。書かなければ上限は画面に出ている行の数＝`pagination.pageSize`（切っていれば全件）で、**効かない上限**（一括でないボタン・1ページの件数より大きい上限・押せない役割・どこにも無い役割名）は警告する。上限は**役割で変えられる**（`{ default, byRole }`、`all` は上限なし）＝当てはまる役割が複数あれば**一番ゆるい方**（`roles` が「どれか1つ当てはまれば見える」のと同じ考え方）。**バックエンドでも同じ数で判定できる**（TypeScript の `checkBulkLimit` / Java の `BulkLimits.check`）＝画面の上限は早く気づかせるため、サーバの上限は守るため。3版が同じ答えを出すことは共有フィクスチャ（`conformance/bulk_limits.json`・13件）で縛る |
| 操作 | 実行の前に聞く（`prompt`） | ✅ Flutter | `action.prompt`＝押したあと、実行の前に**小さなフォーム**を出す（「却下の理由を書いてから却下」）。聞くのは**普通の `field`** なので型・`required`・`validators`・`computed`・`normalize` がフォームと同じに効く＝入力の語彙を2つ持たない。**確認ダイアログを置き換える**（増やさない）＝聞くことがあるならその OK が確認そのもので、`confirm` の文言・ボタン名・`danger` を引き取る。書いていなければ実行せず、ダイアログは開いたまま。値は保存と同じ正規化を通って `ActionContext.input` に届く。一括でも**聞くのは1回**（選んだ行に同じ理由）。受け取れるのは `type: plugin` だけで、ほかの型は警告 |
| 操作 | 失敗したときの文言（`onError`）と一括の結果 | ✅ Flutter | `action.onError.message`＝失敗を**業務の言葉**で言う（書かなければ理由がそのまま出る＝事実だが業務の言葉ではない）。**`page` は持たない**（失敗した画面から離れると、何が起きたか読めず直す行も視界から消える）。差し込みは `{error}` と件数（`{count}` / `{failed}` / `{total}`＝`scope: selection` のときだけ）で、**埋まらない差し込みは警告**（押すまで気づけないため）。一括の結果は `ActionContext.report(ActionOutcome(...))` で件数を返し、**一部でも失敗したら `onSuccess` は動かさない**（1件残っているのに画面を移さない）。報告が無ければ渡した行数を成功と見なす＝ハンドラの手間ゼロで `{count}` が埋まる。失敗の言い方を決める場所は**1つ**（プラグインが投げた例外・出力先の失敗・刷る失敗を同じ道に通した）＝**プラグインが投げた例外が黙って消える**のも直った |
| 出力 | 定義から刷る（`type: print`） | ✅ Flutter | `action` の型 `print`＝**帳票に印刷ボタンが出る**（帳票専用。`report` の無い画面に置くと警告）。押されると Framework は**紙の中身**（帳票の定義・いま画面に出ている行・役割・フォーマッタ・アクションの `config`）を `HatakeScope(printSink:)` に渡すところまでをやり、**バイト列は作らない**（PDF はフォント・符号化・ページツリーを持つ別世界で、刷らないアプリに背負わせない）。CSV（`exportSink`）と同じ形なので、覚えることが増えない。読むのは `config.filename` だけ（拡張子が無ければ `.pdf`）で、残りは**読まずにそのまま**渡る＝トレイや書体を DSL のキーにしない。未登録なら押したときにそう言う（黙って何もしない、を作らない）。**本体は `hatake_print` を知らない**ので、刷らないアプリに PDF のコードは1行も入らない |
| 定義の品質 | `hatake` CLI | ✅ TS 同梱 | `npx hatake validate <file...>`（strict 既定・`--json`・**問題があれば終了コード 1** なので CI に置ける）、`new <kind>`（8種別の雛形。全部が strict とスキーマを通ることを CI で確認）、`dto` / `schema` / `openapi` / `types --out`（ネイティブ型のファイル出力の入口）。生成系は常に strict で読む（書き間違いを API に焼き付けないため）。→ [使い方](../typescript/README.md#cli) |
| 定義の品質 | 説明を PR に貼る口 | ✅ 手引き | [`docs/guide/pr-comment.ja.md`](guide/pr-comment.ja.md)＝定義を直した PR に「画面がどう変わるか」を自動コメントする Actions を**そのまま置ける形**で置いた。決めごとは4つ: **コメントは1つだけ**（目印で探して書き換える＝押すたびに増えると最後のどれが正しいか読む人に分からない）・**変化が無ければ貼らない**（`explain --diff --if-changed` を足した＝「見え方は変わりません。」という**文を grep しない**。文言を直したら壊れる仕掛けは置かない）・**終了コードは変えない**（止めるのは `diff` と `validate`）・fork からの PR では貼らずにログに出す（`pull_request_target` は勧めない）。**手引きに載せた断片は CI がそのまま実行する**（markdown から取り出して、本物の git 履歴に対して走らせる）＝文書のコマンドが腐らない |
| 定義の品質 | 説明の英語版 | ✅ TS 同梱 | `hatake explain <file> --lang en`＝節の見出しと言い回しを英語で出す（`--brief` / `--markdown` とも組める）。**定義に書いてあるラベル・ボタン名・文言は訳さない**（業務の言葉なので、訳すと現場と違うものを指す）。語彙の正は [`spec/vocabulary.json`](../spec/vocabulary.json) の `en`（先に置かれていたが出力する側が無かった）で、言い回しは `explainVoice.ts` に**日本語と英語を1行ずつ並べて**持つ＝片方だけ書き足すとコンパイルが通らない（訳し忘れが残らない）。英語は「when」を包む側が付ける（`required only when 区分 is 法人`）＝差し込みだけの表では書けない語順の違いを関数で持つ。**日本語の出力は1文字も変わらない**（既存の試験が全部それを見ている）。まだ英語にできない道具（`--diff` / `--review`）に `--lang en` を渡すと**落ちる**＝半分だけ英語の文書を出さない。MCP の `hatake_explain` も `lang` を取る |
| 定義の品質 | 定義の diff / 影響範囲 | ✅ TS 同梱 | `hatake diff <前> <後>`（＋MCP の `hatake_diff`）＝`DtoSpec` の差分と**後方互換の判定**。**壊す変更があれば終了コード 1** なので CI に置ける。判定は形の向きで非対称＝受け取る形は「必須を足す／型を変える／制約を厳しくする」で壊れ、返す形は「項目を消す／型を変える」で壊れる（同じ `maxLength` 20→10 でも request は破壊的・response は互換）。検索パラメータを消すのは**黙って絞り込みが効かなくなる**ので破壊的扱い。ページ id の変更・形そのものの増減（読み取り専用化で request が消える等）も見る。常に strict で読む |
| 定義の品質 | アプリ側の配線の下書き | ✅ TS 同梱 | `hatake wire <file> [--base /api]`＝定義が要求している登録を全部並べた `HatakeScope`（Dart）を出す。**中身は TODO**（何をするかは業務、どう繋ぐかは環境）で、埋めるまでは `UnimplementedError` で落ちる＝「黙って何もしない実装」を置かない。`--base` なら Repository は `hatake_http` で組む（collection は複数形を推測）。**生成物はコンパイルが通る形**で、下書き2枚を `hatake_example/tool/` にコミットして `flutter analyze` に通している（生成器が壊れたら解析で落ちる）＝生成器が嘘をつけない。MCP の `hatake_wire` も同じものを返す。**2回目以降は `--merge <配線.dart>`**＝既にある配線に**足りない登録だけ**を足す（手で埋めた中身は1バイトも変えない＝消さない・並べ替えない・整形しない）。要らなくなった登録は**言うだけで消さない**（消すかどうかは業務の判断。`refs --unused` と同じ立場）。足すものが無ければ書かない。目印（`HatakeScope` と `child:`）が無い形なら**何もせず理由を言う**（Dart を解析する道具ではないので、壊れた Dart を書き出すより何もしないほうを選ぶ）。行の折り返しは出すときと同じ関数を通る＝「出す道具と足す道具で行の形が違う」を作らない。**出来上がりもコミットして `flutter analyze` に通している**（`merged_everything.dart`）＝生成物が通らない Dart になったら CI で落ちる。2回やっても増えないことも CI が見る |
| 入力 | 明細の合計（縦計）・絞り込み・並べ | ✅ 3言語 | `computed: { op: sum, field: lines, of: amount }`＝**明細（subTable）の行を畳む**。これまで `computed` は同じレコードの項目しか畳めず（`fields`）、master-detail で**一番よく書く計算**が定義で書けなかった（`compare` の検証は既に子行を集約できたのに、計算にその口が無かった＝単に片方だけ作っていた）。語彙と実装はダッシュボードの `aggregate` と**同じもの**（`count`/`sum`/`avg`/`min`/`max`。同じ集約を2つ持たない）。行が無ければ `sum`/`count` は 0、`avg`/`min`/`max` は null（「平均 0 円」と読み違えないため）。**行を直すとその場で変わり、保存する内容にも入る**（Renderer は1行も変えていない＝計算は毎回の再構築で通る所に元から在った）。`source` つき（ページ送り）の明細は畳めないので警告する＝画面に出ている行だけ足しても業務の合計にならない。書き間違いは5つの警告で言う（相手が明細でない・行にその項目が無い・`of` が無い・畳めない `op`・`field` と `fields` の両方）。共有フィクスチャ（`conformance/computed.json`）に 15 件足したので、3版で同じ数が出ることは機械が縛る。**畳む前に行を絞れる**（`where`）＝業務の合計は「全部の行」ではないことが多い。条件の言葉は `visibleWhen` と**同じもの**（条件の書き方を2つ持たない）で、判定するのは行1件なので `{ mode: … }` は常に当たらない（警告する）。**行を並べて1行にする**（`join`）＝数ではなく文字を作るので集約ではなく別実装。区切りの既定は `", "`（`concat` の既定が空なのは姓と名を詰めるためで、行を並べるときに詰めると読めない）。計算は宣言順に1回なので、**後ろに書いた計算を使っている**のと**自分自身を使っている**のも警告する（画面では空欄に見えるだけで、原因が「順番」だとは気づけない）。フィクスチャは合計 39 件。**同じ絞り込みは項目間の検証（`compare` の `aggregate`）にも入れた**＝計算が取消行を外すのに検証が外さなければ必ず食い違うので、片方だけ作らない（行を絞る実装は3版とも1つ） |
| 定義の品質 | 宣言とサーバの突き合わせ | ✅ TS 同梱 | `hatake probe <file> --base http://localhost:8080/api`＝定義が要求している口を**実際に叩いて**、返ってきた形を宣言（`hatake openapi` と同じもと）と突き合わせる。いま機械が縛れているのは「クライアントが宣言どおり送る」ことだけで、**サーバが宣言どおり返すか**は動かして初めて分かる。しかも食い違いは静かに出る＝来なかった列は空欄になり、**文字で来た金額は桁区切りが効かないまま合計から漏れる**（エラーは出ない）。見るのは足りない項目・型違い・`{items, totalCount}` でない・`pageSize` が効かない・`totalCount` が行数より少ない・**行に鍵が無い**（列に出していなくても要る＝無いと開く/直す/消すが動かない）・一覧に在る行が1件取得で 404。**読むだけ**（`POST`/`PUT`/`DELETE` は宣言できても叩かない＝試すたびにデータが増える・消える。方式は `fetchSend` が実行時に弾く）。**null は言わない**（空欄は業務では普通）・**宣言に無い項目が来ていても言わない**（画面が見ないだけで害が無い）＝報告が読まれる量に保つ。`--dry-run` は叩かずに「何を叩くか」だけ出す（送る前に見せない道具は使われない）。集合の名前は `hatake wire` と**同じ推測**（違う推測をすると道具どうしが嘘をつく。`--collection` で上書き） |
| 定義の品質 | 権限の穴を突く | ✅ TS 同梱 | `hatake attack <app> --role staff --base …`＝その役割で**画面から見えない**はずの口を叩いて、API が実際に拒否するか見る。`roles` は画面の出し分けだけ（本当の遮断は API の仕事）と仕様書に何度書いても遮断は忘れられるが、**機械が試せば忘れられない**。**反対向きも見る**＝開ける画面が拒否されたらそれも食い違い（画面は出てもデータが来ない＝その人は何もできない）。片方だけ見ると「全部遮断＝安全」と読めてしまう。**開ける画面まで全部拒否なら「資格が通っていない疑い」と言って落ちる**（未認証を「穴が無い」と報告するのが一番まずい嘘）。404 は遮断と言わない（集合の名前が違う可能性）。定義に出てこない役割でも進む＝絞る側の名前しか定義に出ないので、突く相手は普通そこに居ない（綴り違いは**穴が多めに出る**側に転ぶ）。押せないはずのボタン（`POST`/`PUT`/`DELETE`）は**叩かず一覧で渡す**（確かめた跡がデータに残る） |
| 拡張 | 独自の集約・計算の登録 | ✅ Flutter | `HatakeScope(aggregates:, computeds:)`。**今まで登録する口が無かった**（コントローラとフォームが既定のレジストリを自分で作っていた）ので、`validate` が「`AggregateRegistry` に登録するか」と言うのに登録できない状態だった。道具が「できる」と言うことをできるようにした（`hatake wire` が生成するコードもこの口を使う） |
| 定義の品質 | 定義が要求している「口」 | ✅ TS ＋ Dart | `hatake refs --needs-registration` が **出力先（`exportSink` / `printSink`）も出す**（Repository・プラグインと同じ列）。`hatake registry` は実装側から拾い（`HatakeScope(exportSink: …)` は関数を渡す書き方なので、**在るか無いか**だけを見る）、動いているアプリは `registrySnapshot` で申告する。突き合わせると「印刷ボタンはあるのに `printSink` が無い」を **押す前に**言える（`unregistered-sink`）。空のリポジトリから始める人が最初に踏むのがこれ |
| 定義の品質 | 構造の間違いの静的検出 | ✅ TS 同梱 | `hatake validate` が**解析は通るのに意図どおり動かない書き方**を警告する（既定ON・終了コードは変えない／`--warn-as-error` で 1／`--no-warn` で黙る／`--json` に `warnings`）。規則は42個（宣言していない行アクション・存在しないページへの遷移・`home` の行き先・カードの `action`・ページ/アクション id と項目名の重複・条件で使えない演算子・`field` の無い集計・`sort` の無い `groupBy`・列に無い項目の合計・`rowActions`/`validators` の書き方・選択肢の連動・項目間の検証（`compare`）の5つ・開ける人が居ない画面・帳票が紙に入らない2つ・紙の無い画面に置いた印刷ボタン・出す口が繋がっていない・選んだ行に対するボタンの置き場所と型の2つ・埋まらない差し込み（**書ける差し込みは4つだけ**＝項目名を書くと文字で出る）・聞いた値を受け取れないボタン・**押しても何も起きない新規登録のボタン**・**明細の合計の書き間違い5つ**・**行の絞り込みの3つ**（綴り違いに見える項目名・畳んでいないのに `where`・行に無い `mode`）を計算と項目間の検証の**両方**に・**計算の順番と自分参照**・**効かない1回の上限の3つ**（一括でないボタンに書いた `maxRows`・1ページの件数より大きい上限・当てはまらない役割））。素の document を見るので `page:` / `app:` どちらでも動き、**遷移先の検査は `app:` のときだけ**（単票は他のページを知らないので誤検出しない）。警告は対照表の id を持つので `hatake pitfalls <id>` に繋がる。MCP の `hatake_validate` も返す |
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
（履歴が要るときは git log を見る。初期の P0〜P2 の山と WizardPage / DTO生成 / DashboardPage は
完了済み＝下の表の `優先度` は、それとは別の**いまの並び**。）

**優先度の読み方。** 各表の `優先度` 列は「次に手を付ける順」で、規模感（＝手間）とは別。
手間が小さくても後回しのものはあるし、大きくても先にやるものもある。

| 印 | 意味 |
|---|---|
| **P0** | 次にやる。**無いと定義ファーストの穴になる**もの（書けないので結局コードに落ちる／事実なのに機械が言えない）か、あと一歩で完成するもの |
| **P1** | その次。効くのは分かっているが、P0 が片付いてから |
| **P2** | 需要が出てから。あると嬉しいが、今無くて困っている人が居ない |
| 保留 | **当面やらないと決めている**もの（`Python / Rust エディション`・`配布`） |

優先度は決め直してよい（「これを先に」と言われたら動かす）。

### 1. 機能（Framework 本体）

| 項目 | 内容 | なぜ | 優先度 | 規模感 |
|---|---|---|---|---|
| フォントの埋め込み | TrueType の解析＋サブセット化（`cmap` / `hmtx` / `glyf` を読んで CIDFontType2 で埋める）。外字・字面の固定 | 非埋め込みは「書体は開いた環境が決める」。見本と1ドットも変えたくない帳票・環境にフォントが無い所で要る | P2 | 中 |
| テーマの次段 | ページ単位の上書き・複数テーマの切替（ダーク手動切替）・`config` で Renderer 固有の見た目を足す口の整備 | 1枚目が出た後の要望。今は app 単位＋`config` 止まり | P2 | 小〜中 |
| アクションの次段（残り） | 押す前に**行の状態で出し分ける**（`enabledWhen` をアクションにも。「出荷済は却下できない」をボタンの活性で言う）・一括の**途中経過**（100件を押したときの進み具合） | `confirm` / `prompt` / `onError` / `scope: selection` が入って、残っているのは「押せるかどうか」と「長く走るとき」の2つ | P2 | 中 |
| ウィザードのステップ条件 | ステップ自体の `visibleWhen`（条件で丸ごと飛ばす）。「次へ」「戻る」が隠れたステップを飛ばし、検証も飛ばす | 区画（section）まで入ったので、次に来るのはステップ単位。ナビゲーションが絡むので別枠 | P2 | 中 |
| Validator 拡充 | 法人番号・マイナンバー（相関チェックは `compare` で済み） | 案件ごとに要る形式が違うので、組み込みは薄く保ちたい。プラグインで足せる形は既にある | P2 | 小 |
| 複数タブ | 同じアプリの中で画面を並べて開く（業務では「受注を見ながらマスタを直す」が来る） | URL 同期は入ったので、次に来るのはタブ。ルーターの積み方が変わるので別枠 | P2 | 中 |
| ダッシュボードの次段 | 期間プリセット（今月/今年度）・カードからのドリルダウン・自動更新 | 1枚目が出た後の実運用要望 | P2 | 小〜中 |
| 帳票の次段 | 複数レベルの改ページ制御・「以下余白」・繰越／前頁計、Excel（xlsx）出力、ロゴ・図形 | 実際の業務帳票で追加要求が来る定番（xlsx とロゴは `PrintLayout` から書ける） | P2 | 中 |
| 文字コード変換の次段 | ISO-2022-JP（メール用。エスケープシーケンスで状態を持つので表引きでは書けない）・JIS X 0212 補助漢字・固定長との組み合わせ | ここまで来ると個別案件の話が多い。需要が出てから | P2 | 小〜中 |
| ORM アダプタ2個目 | MyBatis（Java）か Prisma（TS） | 1個目（JPA）で形が固まったので横展開 | P2 | 中 |
| 全銀・固定長 | 固定長レコードの入出力（全銀フォーマット等） | 金融・給与まわりで効く。帳票の後 | P2 | 大 |
| Python / Rust エディション | **保留**（当面やらない）。やるときは [C. 対応言語を増やす](#c-対応言語を増やすpython--rust-など)の最低ラインに従う | 需要が出てから | 保留 | 大 |

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
> - **「なぜそう書くか」の説明生成** … ✅ `hatake explain <file>` / MCP の `hatake_explain`。
>   定義を「この画面は何をするか」に開く（日本語）。**キーの名前は出さない**＝読み手は DSL を
>   知らなくてよい。条件は項目と選択肢のラベルで言う（`{ field: kind, value: corp }` →
>   「区分 が 法人 のとき」）、フォーマッタは例で言う（`currency` → 「¥1,234,567 のように」）、
>   「この画面でできないこと」も定義から読み取る。**strict もスキーマも警告も綴りと構造しか
>   見ない**ので、意図どおりかは人（か AI 自身）が読み返すしかない、という位置づけ。
>   同梱の例が全部説明できて、キー名が混じらないことを CI で確認。
> - **失敗例のカタログ** … ✅ [`spec/failures.json`](../spec/failures.json) / `hatake failures`。
>   対照表（pitfalls）は**人が考えた間違い**の集合なので分けてある。違いは出どころと、
>   **なぜそう書いてしまうか**を持つこと。各件は `wrote` を本当に道具にかけ直して、記録した
>   診断と一致することを CI で確認する＝**この表も嘘をつけない**し、検出しなくなった／文言が
>   変わったらそこで落ちる（診断の回帰テストにもなっている）。**機械では拾えない件も載せる**
>   （載せないと「道具が万全」という嘘になる）。その件の `review`「explain で読み返すと見える」
>   も、本当に見えることを試験で確かめている。
> - **登録済み一覧の生成の次段（実行時の申告）** … ✅ `registrySnapshot(scope)` /
>   `registrySnapshotJson(scope)`（Flutter）。静的な走査が読めない**動的な登録**は、
>   動いているアプリに聞くしかない。出す形は `hatake registry` と同じなので、どちらで
>   作った一覧も `validate --registry` に渡せる。Renderer は `RegistryReporter` を実装
>   すれば自分の登録（`fieldBuilders` など）を名乗れる＝**`Renderer` 本体は変えない**
>   （足すと既存の Renderer が全部壊れる＝プラグインを fork させることになる）。
>   語彙と形は `conformance/registry_snapshot.json` で TS 版と一致を確認。デモの一覧は
>   **静的な走査と動いているアプリの両方から**同じであることを試験している。
> - **定義の最小化（`hatake minimize`）** … ✅ `hatake minimize <file>` / MCP の `hatake_minimize`。
>   落とすのは「スキーマの既定値と同じ指定」と「空の指定」だけ（必須キーと `dsl_version` は
>   落とさない）。**1つ落とすたびに解析後のモデルが1バイトも変わらないことを確かめ、変わったら
>   戻す**ので意味は変わらない（パーサの既定値がスキーマと食い違っていたら「落とすのをやめる」
>   側に倒れる）。出力は**落とす所だけを文字列から切る**ので、コメント・折り返し・改行コードは
>   そのまま＝差分が「消えた行」だけになる（Document を作り直すと全部書き換わってレビューに
>   ならない）。書き間違いのある定義は最小化しない（未知キーを黙って落とす道具にしない）。
> - **定義の自動修復（`--fix`）** … ✅ `hatake fix <file>` / MCP の `hatake_fix`。直すのは
>   **綴り違い**（キー名・Repository / プラグイン / 型 / ページ id / アクション id / 連動の親）と、
>   **入れる値が決まっている指定**（小計のある帳票に `report.sort`）だけ。近い名前が**1つに
>   決まらなければ直さない**（同点を許す `closestKey` とは別に `soleClosestKey` を作った＝
>   提案は同点でも1つ選んでよいが、書き換えは候補が2つある時点で人の仕事）。登録済み一覧を
>   渡せば、**略して書いた名前**（`orderRepository` を `orderRepo`）も戻す。確かめ方は
>   **診断で守る**（最小化がモデルの一致で守るのに対して）: 1件ずつ当てて「問題が減る・
>   新しい問題が出ない」ことを見て、当て終わった文字列をもう一度読んで同じことを確かめ、
>   崩れたら**何もしない**。**既定ではファイルを触らない**（見せてから当てる）。直さなかった
>   ものは**理由つきで必ず出す**（意図が要るものを黙って触らないのと、黙って飛ばさないのは別）。
> - **要約から探す（画面の索引）** … ✅ `hatake index <path...>`。1行の要約（`explain --brief`）を
>   集めて「どこに何の画面があるか」に答える表にする。**索引のために別の語彙を作らない**のが
>   要点（作ると本文とズレる）。探すための語は**現場の言葉（ラベル）と実装の言葉（項目名・
>   Repository）の両方**＋説明の語彙の長い言い方（`master` の画面が「検索」で出る）。`--find` は
>   語の AND（日本語の文は分かち書きしないと語に切れないので、語を並べる形）。`app:` は中の
>   画面を1枚ずつ数える。**綴り間違いのある定義も載せる**（索引から消すと余計に探せない）。
> - **図解を定義から作る** … ✅ `hatake diagram <file>`。`app:` から「画面とメニューと遷移」の図を
>   作る。段は「メニューから開ける画面 → そこから `navigate` で開く画面 → …」で、この並べ方に
>   すると**どこからも開けない画面**が自然に落ちてくる（図にする一番の値打ち）。1枚の画面の中身は
>   図にしない（`explain` のほうが読める）。**描画は1本にした**＝資料の図解を描いていた
>   `docs/tools/render-diagrams.mjs` をパッケージの中（`diagram.ts`）へ移し、同梱の3枚も同じ
>   コマンドで描く（移す前と**バイト単位で同じ SVG** が出ることを試験で確かめた）。機械が作る図は
>   長さが定義次第なので、注記は**入る幅で行に割る**（手で書く図は溢れたら落ちてよいが、機械が
>   作る図で落ちるのは道具側の責任）。
> - **索引を Dart / Java でも** … ✅ `ScreenIndex`（`hatake_core` / `io.hatake.core`）。索引が
>   要るのは**定義の山を持っている側**なので、CLI だけに在るとアプリの中から自分の画面を探せない
>   （画面選択・ジャンプ窓が作れない）。Dart は解析済みの画面からも（`ScreenIndex.ofApp`）文字列の
>   山からも（`buildScreenIndex`）、Java は `ScreenIndex.build`。1行の要約も一緒に移した
>   （`ScreenBrief`）。**語を3か所に持たない**ために、種別の見出し語を
>   [`spec/vocabulary.json`](../spec/vocabulary.json) の `pageKinds[].short` に出し、3エディションは
>   それを転記して**各エディションの試験が1キーずつ突き合わせる**。同じ定義の山なら**枚数も同じ**
>   （同梱の例で 18 枚を3エディションが別々に確かめる）。ページの部品を種別ごとの `switch` なしで
>   読む口も足した（Dart の `PageParts`）。違いは**バックエンド版がボタンを持たない**ことだけで、
>   そこは持っていないものを索引できないという素直な差として文書に書いた。
> - **図に遷移の向きを描く** … ✅ 作図器に `links`（箱どうしの線）を足した。段のあいだを
>   **1本ずつ**繋ぐので「AとBのどちらから開くのか」が読める。線1本ごとに横に走る高さ（レーン）を
>   分けるので重ならない。向きは**どちらの行に居るか**で決まる（下から上なら戻り）。線を引けるのは
>   隣り合う行のあいだだけなので、段の中は**次の段へ進む画面を後ろに**置く。それでも引けない遷移
>   （同じ段の中・戻り・行が離れている）は**文で全部挙げる**＝図に出ていない遷移を黙って落とさない
>   （線が無い＝遷移が無い、と読まれるのが一番まずい）。指した箱が上下の行に居なければ**描かずに
>   落ちる**。できあがりは生成物として置いた
>   （[`docs/diagrams/sales-app-flow.svg`](diagrams/sales-app-flow.svg)。CI が作り直して差分を見る）。
> - **助言の物差しを外から渡す** … ✅ `hatake advise --rules team.json`。渡せるのは3つだけ＝
>   `off`（合わない規則を止める）・`options`（組み込みの規則が**持っているつまみ**だけ）・
>   `require`（案件の決めごとを「この場所には必ずこのキーを書く」の形で）。**規則を書くための言語に
>   はしない**（条件式を書けるようにすると、設定ファイルが小さなプログラムになって読める人が減る）。
>   知らないキー・知らない規則名は**エラー**（DSL の strict と同じ＝設定が黙って効かないことを
>   作らない）。案件の決めごとが**その場所に書けないキー**を勧めていたら、助言を出す前に止める。
>   物差しを渡したことは**出力に書く**（読む人が組み込みの助言だと思ったまま案件の決めごとを読むと
>   話が噛み合わない）。規則名の表と実装が合っていることは**両向きに**試験で見る（表にあるのに
>   出ない＝消えた規則が残っている、出るのに表に無い＝`off` で止められない）。
> - **助言と説明を1枚にする** … ✅ `hatake explain --review`。説明の「この画面でできないこと」と
>   助言の「書き足したほうがいい所」は隣の話で、どちらも人がレビューするために在る。道具ごとに
>   出力が散ると片方しか読まれないので1枚にした。助言は**最後の節にまとめる**（混ぜると事実と好みの
>   区別が付かなくなる）。`--page` で app の1枚を読むときは**助言もその画面だけ**に絞る（他の画面の
>   指摘が混じると目の前の画面の話だと読み違える）。1枚にしても**終了コードは変えない**。
> - **「誰も開けない画面」を警告にする** … ✅ `hatake validate` の警告 `page-nobody-can-open`。
>   図で見えるようになった事実を機械にも言わせた（図は人が開いたときだけ効く）。**入口を書いたのに
>   権限が食い違っていて誰も通れない**ときだけ言う＝入口がまったく無い画面は言わない（アプリ側の
>   コードから開くつもりのことがある＝意図の話なので、言うなら助言の担当）。メッセージには**入口と、
>   その手前の画面を開ける人**まで出す（「customer_master の「単価」= manager。customer_master を
>   開けるのは「admin だけ」」）＝これが無いと、食い違っていると言われても直せない。
> - **項目間の検証の書き間違いを警告にする** … ✅ `compare` は相手が見つからないと**黙って通る**ので、
>   `validate` が5つ言う: `compare-unknown-field`（相手の項目名が同じフォームに無い。近い名前も出す）・
>   `compare-without-field`・`compare-with-itself`（いつも同じ値）・`compare-bad-operator`（大小を
>   比べられない突合）・`compare-aggregate-without-of`（畳む項目が無い）。**静かに通る書き方は、
>   画面を見ても気づけない**ので警告の出番。
> - **図に権限を重ねる** … ✅ `hatake diagram`（＋`--role <役割>`）。**ページに `roles` は書けない**
>   （書けるのはメニュー項目とボタン、列・項目・カード）ので、「この画面は誰に見えるか」は
>   **入口から辿って**しか出せない＝[`appAccess`](../typescript/src/appAccess.ts) が数える（素直な
>   不動点。遷移に輪があっても止まる。グループの `roles` は中身にも掛かる）。1枚ずつ読んでも出ない
>   2つを色で分けた: **赤枠**＝誰でも開けて消す/持ち出せる画面（1枚だと「`roles` の無いボタン」に
>   見えるが、まずいのは**そこへ誰でも来られる**ときだけ）、**点線**＝**誰も開けない画面**（入口の
>   権限が食い違っている。定義は通るし画面を見ても気づけない）。`--role` は**その役割で通れる道**
>   だけの図で、通れない扉は薄い線で残す（扉が在ること自体は消さない）。**知らない役割名はエラー**
>   （綴り違いを黙って通すと「全部開ける」に見えて、一番まずい読み違えになる）。`roles: []` は DSL では
>   「誰でも」だが、数えた結果として誰も残らない状態と**言い分ける**必要があるので、内部では
>   `everyone` と役割の一覧を別に持つ。色の意味は**その色を使った図にだけ**書く（使っていない凡例は
>   読む邪魔）。絵は生成物として置いた（[`roles-app-flow.svg`](diagrams/roles-app-flow.svg) と
>   [`roles-app-admin.svg`](diagrams/roles-app-admin.svg)。元は
>   [`roles-app.yaml`](diagrams/roles-app.yaml)、CI が作り直して差分を見る）。
> - **最小の再現から `fixed` を作る** … ✅ `hatake harvest --repro` が `fixed`（直した形）まで作る。
>   使うのは `hatake fix` と同じ機械で、**直したら診断がゼロになったときだけ**出す（カタログの
>   `fixed` は「これなら通る」という約束なので、確かめられない下書きは出さない）。作れないときは
>   理由を言う（「一意に決まらない」「一部しか直せない（残り: …）」）。これで候補に残る人の仕事は
>   **言葉だけ**（`why` / `title` / `fix`）になった。
> - **説明の語彙を spec から引く** … ✅ [`spec/vocabulary.json`](../spec/vocabulary.json)。`explain` の
>   語彙（種別の説明・条件の言い方・フォーマッタの見え方・検証・正規化・ボタン・集約・グラフ）を
>   spec に出し、`ja` と `en` を持たせた（英語版の説明生成はこの列から作れる）。TypeScript 版は
>   **転記**で、依存ゼロの純粋な関数のままにしてある（spec/ を読めない場所でも `explain` は動く）。
>   ズレないように CI が3つ見る: 転記が `ja` と完全一致 / **組み込みの値には全部語がある**（値を
>   増やしたら語も要る）/ **DSL から消えた値の語が残っていない**。この照合で、実在しないバリデータ
>   （`numeric`）の語が表に残っていたのが見つかって落ちた。
> - **最小化の次段（書き足したほうがいい所）** … ✅ `hatake advise <file>`。並べ替えできる列が
>   無い・絞り込みが無い・キーが一覧に出ていない・必須が1つも無い・消せる/持ち出せるのに権限が
>   無い・金額らしいのに桁区切りが無い・明細に親のキーが無い・帳票に合計が無い・日付の組の
>   向きを縛っていない・合計を突き合わせていない、＋**危ない一括の5つ**（確認が無い・確認に
>   件数が無い・失敗の言い方が無い・戻せない名前なのに `danger` が無い・1回で動く件数が
>   多い）。**一括だけは既定で厳しい**（1件ずつなら押し間違えで済むが、一括は1回の操作が
>   件数ぶん動く）。
>   **警告と混ぜない**のが要点（警告は「書いたのに効かない」＝事実で CI を落としてよい、助言は
>   「書いていないから不便かもしれない」＝好みなので終了コードを変えない）。混ぜると警告の
>   信頼が落ちる。画面の種別も見る（照会に「必須が無い」と言わない・帳票に「並べ替えできない」
>   と言わない）。**勧めるキーがその場所に本当に書けること**をリファレンスで CI が確かめる。
> - **収穫から最小の再現を作る** … ✅ `hatake harvest --repro`。守るのは意味ではなく**診断**で、
>   目当ての診断が出続けていて**新しい診断が出ていない**限り削る。最小化と同じ「1つ消して条件を
>   確かめて戻す」機械（`shrink.ts`）を共有し、守る条件だけを差し替えてある。削り終わってから
>   自由文を記号に置き換える（先に置き換えると、ラベルに依る診断があったときに嘘の再現になる）。
>   識別子は残るので、そこは人が見る＝候補の `todo` がそう言う。出力に定義の本文が入るので
>   **既定では作らない**（「定義そのものは持ち出さない」を既定のまま保つ）。
> - **説明の次段（差分の説明）** … ✅ `hatake explain --diff <前> <後>` / MCP の `hatake_explain`
>   に `before`。やっているのは**説明どうしの比較**で、差分の規則から文を組み立ててはいない
>   （既定値の変化・「できないこと」の増減のような、規則を書いていない変化も自動で入る）。
>   「枠「請求先」は、区分 が 法人 のときだけ出るようになりました」のように画面の言葉で言い、
>   メニューは開く先が同じなら「消えて増えた」ではなく「移った」と言う。**終了コードは
>   変えない**（止める道具は `diff`。混ぜると「見え方が変わっただけ」で CI が落ちる）。
> - **定義の要約（1行）** … ✅ `hatake explain --brief` / MCP の `brief`。種別の見出し語＋規模＋
>   出どころを1行で言い、`app:` なら画面一覧の表になる。全文とは語彙を変えている（全文
>   「検索して一覧に出し、その場で登録・修正・削除までできる画面」→ 短い形「検索＋一覧＋
>   登録・修正・削除」）＝1行に収めるには文ではなく見出し語が要る。
> - **失敗例の自動収穫** … ✅ `hatake harvest <path...>`。定義の山を走査して、繰り返し出ている
>   診断を実例カタログの候補として出す。決めごとが3つ: **`why` は機械には書けない**ので候補は
>   人が書く欄を空のまま出す（`failures.json` に自動で足さない）、**定義そのものは持ち出さない**
>   （ラベルに客先の語彙が入る＝出すのはファイル名・場所・回数だけ）、**1回だけは転び方では
>   ない**（既定は2回以上）。既にカタログにある診断は数えるだけ。出るのは道具が言えた転び方
>   だけなので、「言われない転び方は `explain` で人が見つける」と出力に毎回書く。同梱の例から
>   候補が出ないことを CI で確認（配っている定義が汚れていない証拠になる）。
> - **diff の次段（画面・権限・アプリ構成）** … ✅ `hatake diff` が `app:` どうしも比べ、変更を
>   **area**（api / ui / access / app）× **impact**（breaking / caution / safe）で返す。
>   「壊す」と「確かめてほしい」を混ぜないのが要点。→ [使い方](../typescript/README.md#cli)
> - **よくある間違いの対照表**＋**英語版の最小資料** … ✅
>   [`spec/pitfalls.json`](../spec/pitfalls.json)（間違い → 正しい書き方。`validate` が
>   未知キーから自動で引く）と [`docs/api-cheatsheet.md`](api-cheatsheet.md) /
>   [`llms-en.txt`](../llms-en.txt)。どちらも「spec 由来で二重管理しない」＝対照表は
>   例が本当に落ちる/通ることを、チートシートは組み込み一覧がスキーマと一致することを
>   CI で確認。
> - **権限の説明を `explain` にも** … ✅ `app:` を渡すと「画面を開ける人」の一覧、`--page` で
>   その1枚の「この画面を開ける人」（開けるのは誰か＋**どの入口から来られるか**）。`--review` の
>   1枚にも乗る。**ページに `roles` は書けない**ので入口から辿るしかなく、いままで答えを持って
>   いたのは図だけだった＝図を開かないと分からなかった。計算は図・警告（`page-nobody-can-open`）と
>   同じもの（3か所が違うことを言わない）。`explain --diff` にも出るので、**入口を1つ直すと
>   遠くの画面が開けなくなる**類の変化が読める。→ [使い方](../typescript/README.md#cli)
> - **説明を PR 本文の形で出す**＋**diff の履歴** … ✅ `--markdown`（`explain` / `--review` /
>   `--brief` / `--diff`、`diff` の判定表も）と `--git <範囲>`（`A..B` / `A...B`＝枝分かれした所と
>   比べる / `A`＝作業中と比べる）。**変更前は git が持っている**ので、手で書き出させている限り
>   この2つは CI に置けなかった。貼れる形は見出し h2 から・長い節は折りたたみ・`<` `>` は逃がす
>   （`` ` `` の中は触らない）。`--json` との併用はエラー（貼った先で形が違う事故を作らない）。
> - **項目間の検証を助言でも勧める**＋**失敗例をカタログに** … ✅ 助言の規則2つ
>   （`dates-without-compare` / `total-without-compare`。名前からの推測なので `guess`）と、
>   実例カタログ3件（相手の項目名の綴り違い・`of` の書き忘れ・**向きを逆に書いた**）。
>   3件目は機械では拾えないので、`explain` が「開始日 以下」と読み上げることを CI で確かめる。
> - **索引から「使われていない Repository」を出す** … ✅ `hatake refs <file...> --unused`。
>   突き合わせが片方向だけだと**増える方向にしか効かない**（消した画面の Repository が
>   登録に残っていると、次に読む人は「まだ使っている」と読む）。終了コードは変えない＝
>   アプリのコードから直接使っている登録もあるので、事実は言うが消すかどうかは人が決める。
>   組み込みの上書き登録は、定義がその名前を使っていれば「使われている」。
> - **直せなかったものを AI に渡す形** … ✅ `hatake fix --todo`（MCP の `hatake_fix` も
>   `todo` を返す）。`fix` の結果は3つに散っている（直した・直さなかった・**名前だけで場所の
>   無い残り**）ので、①直った分を落とし ②残りに場所を付け直し ③実例カタログから手掛かりを
>   添える。「**ほかは触らないこと**」まで書くのは、範囲を言わない指示は直した所を戻される
>   （機械が直した綴りを AI が元に戻す）ため。
> - **紙に入らない定義を警告する** … ✅ 警告2つ（`columns-wider-than-paper` /
>   `rows-per-page-too-many`）。刷る側は溢れないよう**縮めて収める**＝例外は出ず、読めない紙が
>   出てくるだけなので、機械が刷る前に言う。見積もりは**紙そのもの**と比べる（余白を引かない
>   ＝設定で直る話を警告にしない）。用紙の実寸は [`spec/papers.json`](../spec/papers.json) が正で、
>   刷る側（Dart）・警告（TS）の転記が一致することを両方の試験で確かめる。
> - **AI に紙を見せる**＋**印刷の中立形を TS にも** … ✅ `npx hatake paper <file>` と MCP の
>   `hatake_print_preview`。`PrintLayout`（紙の上の座標）を TypeScript にも置き、それを**文字に
>   落として**返す。読めるのは列の並び・幅の分かれ方・グループ見出しと小計の位置・総計の二重線・
>   **右寄せが効いているか**・切れた文字（末尾が `…`）・紙が何枚になるか。**行を渡さなくても
>   見える**（定義の項目名と型から見本の行を作り、作った行だと必ず書く）。右寄せは**枠の端に
>   合わせて**置く（文字の実寸と1桁の幅は比例しないので、実寸から数えると揃っているかが読めない）。
>   刷る側（Dart）との一致は [`spec/conformance/report_layout.json`](../spec/conformance/report_layout.json)
>   が縛る＝**ここで見た紙と刷った紙は同じ**。PDF を書くのは Dart のままで、TS は読ませるだけ。

**この節は空になった**（AI First の具体項目は一通り入った）。次に足すなら:

| 項目 | 内容 | なぜ | 優先度 | 規模感 |
|---|---|---|---|---|
| 定義から一括の口をひとつ出す | 一括のプラグインが叩く API の形（受け取る行・返す件数）を `api-shape` に出す。いまは Repository の契約だけで、一括は「アプリ側の話」として何も出ない | 上限は守れるようになったが、**何を送るか**は毎回人が決めている。行の形は定義から分かるので、そこだけでも出せる | P2 | 中 |
| 役割の一覧を定義から数える | `explain --roles` に「この定義に出てくる役割の全部」を出す（`maxRows.byRole` の綴り違いを機械が言えるようになったが、人が一覧を見る口が無い） | 役割名は定義のあちこちに散る。綴り違いは1件ずつ言えるようになったので、次は**棚卸し**の形 | P1 | 小 |
| 一括の相手を定義から見せる | `explain` に「このボタンは選んだ行に対して実行する（最大 `pageSize` 件）」まで書く。件数の上限は表のページ送りで決まっているのに、定義を読んでも出てこない | AI が書いた一括ボタンを人がレビューするとき、「1回で何件動くのか」が読めないと危険度が判断できない | P2 | 小 |
| 失敗の文言を機械が読み返す | `explain` の「この画面でできないこと」に**失敗したときの言い方**を並べる（`onError` を書いていないボタンは「理由がそのまま出ます」と言う） | 失敗時の文言は書き忘れても動くので、レビューで一番落ちる。書いていないことを言えるのは機械だけ | P2 | 小 |
| 差し込みの一覧を引けるように | `hatake reference --placeholders` … どの文言にどの差し込みが書けて、いつ埋まるかを機械可読で（`{error}` / `{count}` / `$row.id` / `{value}`） | 差し込みは4種類の文脈に散っていて、AI が混同する（`$row.id` を `onError` に書く等）。埋まる条件は機械が持っている | P2 | 小 |
| 操作の記録を定義から起こす | 誰が・いつ・どの行に・何をしたか、を残す口（`onSuccess` の隣に `audit`）。中身はアプリ側 | 一括を入れた次に必ず来るのが「誰がやったのか」。監査が要る業務では、これが無いと使えない | P2 | 中 |
| 助言も AI の道具にする | MCP に `hatake_advise` を足す（いまの道具は「書いたのに効かない」を見る `hatake_validate` まで）。AI が書いた直後に「足したほうがいい所」を引ける | AI は**書いていないこと**に気づけない（書いたものは検証できるが、抜けは見えない）。人には advise を渡してあるのに、書いている側には渡していない | P1 | 小 |
| 雛形が最初から危なくない | `new-page` / `scaffold` の雛形に、一括ボタンの**正しい形**（`confirm` に `{count}`・`onError`・`roles`）を入れる。AI は雛形を写すので、写した時点で助言ゼロになる | 助言は「書いたあとに直す」道具。**書き始めが正しければ直す回数が減る**（AI が一番よく通る道は雛形） | P2 | 小 |
| 一括の失敗を1件ずつ見せる | 一部失敗（100件中3件）の**どの3件が**失敗したのかを画面で見せる（いまは件数だけ）。`ActionOutcome` は件数しか持たない | 「3件失敗しました」だけでは、現場は全部やり直すしかない。行が分かれば、その3件だけ直せる | P1 | 中 |
| 聞くことの言い換えを機械が見る | `advise` に「`prompt` の項目に `label` しか無い（何を書けばいいか分からない）」「取り消せない操作なのに `prompt` も `confirm` も無い」を足す | 実行前に聞く口が入ったので、次に来るのは「聞き方」の質。空欄に「理由」とだけ書いてあるダイアログは、結局「あ」と入れられる | P2 | 小 |
| 定義から画面の写真を撮る | `hatake shot app.yaml --out shots/`（Flutter の integration test を回してスクリーンショットを撮り、PR に貼る） | いま人が確かめられるのは文字（`explain` / `paper`）だけ。**画面そのもの**は動かさないと見えない。定義が全部持っているので機械にやらせられる | P2 | 大 |
| 配線の下書きを他の言語でも | `hatake wire --lang ts`（Node のアプリに繋ぐ形）。Java は `scaffold-api` の担当 | フロントは Flutter だけではない。TS 版はモデルもパーサも在るので、出し方の話だけ | P2 | 中 |
| 定義から API の骨組みを出す | `hatake scaffold-api app.yaml --lang java` … Controller と DTO と検証の呼び出しまで（中身＝業務ロジックは書かない） | Java 版に DTO と OpenAPI は在るのに、繋ぐコードは毎回手書き。**定義から機械的に決まる部分**は出せる | P2 | 中 |
| 警告と助言の一覧を機械可読に | `hatake rules --json` … 規則20個＋助言の id・何が起きるか・直し方・対照表への繋ぎを JSON で出す（`reference.json` と同じ立ち位置） | いま AI が「この警告は何か」を知るには仕様書の表を読ませるしかない。**引ける形**にすれば、警告を渡すだけで直せる | P2 | 小 |
| 紙の差分を文字で見る | `hatake paper --diff <前> <後>` … 体裁や列幅を変えた前後の紙を、文字のまま並べて出す | `PrintLayout` が両方作れるので出せる。「刷ってみて比べる」は PR では回らない（画像は貼れても差分が取れない） | P2 | 小〜中 |
| 定義の意味的な等価判定 | `hatake same a.yaml b.yaml` … 書き方が違っても**同じ画面か**を判定する（キーの並び・既定値の明示・等価な条件の書き換え） | AI に直させると差分が大きく出るが、意味は変わっていないことが多い。レビューの負荷が下がる | P2 | 中 |
| 収穫の常設化（走らせ続ける） | `harvest` を CI に置いて、候補が出たら issue を立てる（同じ診断の重複は数だけ更新）。定義を持つリポジトリ側で回す想定 | いまは人が手で走らせる道具。**忘れられたら増えない**のは手書きと同じなので、回す仕組みまでが1つ | P2 | 中 |
| 説明の読み合わせ（意図との照合） | 頼まれたこと（自然言語）と `explain --review` の出力を突き合わせて、**言われていないのに在るもの／言われたのに無いもの**を挙げる（MCP の道具にする） | 読み返しても、人は「書いてあるもの」を追認しがち。**足りない側**は指摘されないと気づけない。1枚にはなったが、読む人はまだ人間 | P2 | 中〜大 |
| 直しの履歴を残す | `fix --write` が何を直したかを、定義の隣に追記する（`# fixed: witdh → width（2026-08-18）`）か、別ファイルに落とす | 機械が書き換えた所は、後から「なぜこうなった」が分からなくなる。コメントで残せば git blame より速い | P2 | 小 |
| 物差しを実装から作る | 既にある定義の山を読んで、**この案件では実際どう書かれているか**から `--rules` の下書きを出す（「列の 9 割に `width` がある → `require`」） | 決めごとは頭の中にあって明文化されていない。**書かれているものから起こす**なら、最初の1枚が要らない | P2 | 中 |
| 索引を検索の入口として配る | 索引の JSON を**アプリに同梱**して、Flutter 側の「画面を探す」窓にする（`ScreenIndex` は在るので、残りは画面と絞り込みの UI） | 道具として在っても、現場が使えるのは画面になってから。プレイグラウンドの画面選択と同じ部品で足りる | P2 | 中 |
| 助言を定義の隣に置く | 見た助言のうち「これは要らない」を**定義の隣に残せる**ようにする（`# advise-off: money-without-format`）。次からその画面では言わない | 案件ごとの物差しは作れたが、**画面ごとの例外**は物差しに書けない（1画面のために規則を切ると他が緩む） | P2 | 小〜中 |
| 役割ごとの一覧を出す | `hatake index --role admin` … その役割で開ける画面だけの索引（役割の追加・棚卸しに使う） | 権限の棚卸しは「役割から画面」を引く作業。いまは画面から役割しか引けない | P2 | 中 |
| 権限の差分を見る | `hatake diff` に**誰が開けるか**の変化を足す（「単価マスタは admin も開けなくなりました」） | いまの diff は画面と契約の変化だけ。権限は**入口を1つ直すと遠くの画面に効く**ので、目で追えない | P2 | 中 |
| 図を SVG 以外にも | 遷移図を Mermaid / DOT でも出す（`--format mermaid`）。PR 本文や Wiki にそのまま貼れる | SVG は貼れる場所が限られる。**貼れる形**でないと、図は結局共有されない | P2 | 小〜中 |
| 検証の順番を決められるようにする | 1項目で複数の検証が失敗したとき、どれを出すかは今「書いた順の最初」。`compare` は他の項目に依存するので、**自分の形の検証を先に**出したいことがある | 「日付の形が違う」より先に「開始日以上に」と言われると、直す順番が分からない | P2 | 小〜中 |
| 明細の行どうしの検証 | 行の中（`rowFields`）の項目間だけでなく、**行をまたぐ**規則（「同じ品名が2行にある」）を書けるようにする | 明細の重複は業務でよく効くチェック。いまは行の中しか見られない | P2 | 中 |
| 紙の見本を実例カタログに | `hatake paper` の出力を `spec/failures.json` の隣に置く（「こう書いた → 紙はこう出た」）。列幅の食い違い・全角記号のずれのような**紙でしか出ない**転び方を載せる | 画面の転び方は集め始めたが、紙の転び方は1件も無い。紙を文字で出せるようになったので、記録できる形になった | P2 | 小〜中 |
| 印刷の Java 版 | `PrintLayout` を Java にも（`writePdf` は Dart のまま） | サーバ側（Java）で帳票の体裁を確かめたい案件が来たら。共有フィクスチャが在るので、写すだけで済む | P2 | 中 |
| 紙を画像で見せる | `hatake paper --svg`（座標をそのまま SVG に。PR に貼れる） | 文字では**字送りの詰まり**（`¥` の重なりのような）が読めない。図解の仕組みは既にある | P2 | 小〜中 |
| 体裁を言葉で読み返す | `PrintLayout` を日本語で言う（「A4 縦・1枚30行・列は4つ（受注番号 140pt…）・金額は右寄せ・総計は最後の紙」）。`explain` の帳票の節に入れる | 座標の配列は人が読めない。**刷る前に体裁を確かめる**手段が、いまは「刷って見る」しかない | P2 | 小 |
| 登録の棚卸しを CI に置く | `refs --unused` を落とす口（`--unused-as-error`）と、アプリのコードからの参照も数える手（`registry` の走査結果と突き合わせる） | 事実は出せるようになったが、**回す仕掛けが無い**＝消し忘れは増え続ける。落とすかどうかは案件ごとなので旗で選ばせる | P2 | 小 |
| 残りを渡したあとを見る | `fix --todo` で渡した件が**次の往復で本当に直ったか**を数える（同じ規則が残り続けているなら、手掛かりが足りない） | 渡す形は作った。効いているかは分からない。効かない手掛かりは書き直す材料になる | P2 | 中 |
| 紙の名前の綴り違い | `paper.size` が組み込みでも登録済みでもない名前のとき、近い名前を出す（`a4` → `A4`）。開いた文字列なので、登録済み一覧を渡したときだけ言う | いまは知らない紙は黙って A4 で刷られる。`--registry` と同じ形にすれば、嘘の警告を出さずに言える | P2 | 小 |
| 助言に「効き目」を持たせる | どの規則が**実際に直されたか**を数える（`fix` / 次の `advise` で消えたか）。鳴るだけで直されない規則は切る候補として出す | 助言は増やすほど読まれなくなる。**減らす根拠**が今どこにも無い | P2 | 中 |
| 権限の棚卸しを1枚で | `explain --roles`（役割ごとに、開ける画面・押せるボタン・見える列を1枚に）。人事異動のたびに聞かれる形 | 「この役割で何ができるか」は画面からではなく**役割から**引く作業。いまは画面→役割しか引けない | P2 | 中 |
| 刷った見本を実例カタログに | 「こう書いた → こう刷れた」を、見本 PDF（と抽出テキスト）つきで `spec/failures.json` の隣に置く。列幅の食い違い・全角記号のずれのような**紙でしか出ない**転び方を載せる | 画面の転び方は集め始めたが、紙の転び方は1件も無い。最初の1枚で必ず転ぶ所（幅・書体・改ページ）が分かっていない | P2 | 中 |
| 突き合わせを毎晩回す | `probe` を staging に対して定期実行し、食い違いが出たら issue を立てる（同じ食い違いは数だけ更新）。`harvest` の常設化と同じ形 | **サーバは定義より速く変わる**（項目が消える・型が変わる）。手で叩く道具は、忘れられたら手書きと同じ | P1 | 小〜中 |
| 役割を全部突く | `hatake attack --all-roles`（定義に出てくる役割＋**誰でもない人**を全部試して1枚にする）。役割ごとに叩き直すのは人が続けられない | 権限の棚卸しは役割が増えるたびに全部やり直す作業。**1つ足したときに他が緩んでいないか**は、全部並べないと読めない | P1 | 小 |
| 資格の取り方も道具に持たせる | `--login login.json`（ログインの1往復だけを書いた JSON からトークンを取る）。いまは人が取ってから `--token` で渡す | CI に置くと**期限で落ちる**＝置けない。トークンを引数に書かせないための `--headers` も、結局手で更新することになる | P1 | 小〜中 |
| 実物の形から定義を直す下書き | `probe --suggest`＝返ってきた実物の形から、**定義をそちらに寄せる差分**を出す（ただし既定は「サーバを直す」側に立って、どちらを直すか人に選ばせる） | 型違いが10件出たときに、手で10箇所直すのは続かない。**直す先の判断は人**なので、当てずに下書きだけ出す | P2 | 中 |
| 書き込む口も安全に試す | `probe --write --confirm <合図>`＝捨ててよい環境だという合図を要求して、`POST` → `GET` → `DELETE` を1往復だけ試す（400 の形・作った直後に一覧へ出るか） | 読むだけ、は正しい既定。ただし**書き込みの食い違い**（検証エラーの形が `{valid, errors}` でない・作った直後に一覧に出ない）は業務で一番効く | P2 | 中 |
| 配線の棚卸しまで面倒を見る | `wire --merge --prune`（要らなくなった登録を**消す**。いまは言うだけ）。消す前に「アプリの他の場所から使っていないか」を `registry` の走査で確かめる | 足すのは安全側なので入れた。消すのは危ない側なので、確かめる材料（走査）と組にしてからでないと入れられない | P2 | 中 |
| 配線が本当に埋まったかを数える | `refs --needs-registration` と実装の走査を突き合わせて、**TODO のまま残っている登録**を数える（`wire --merge` が足した所が埋まったか） | 足す所までは機械にやらせられるようになった。埋め忘れは**動かして初めて分かる**ままなので、数えられる形にしたい | P1 | 小〜中 |
| 足した所を人に渡す | `wire --merge --todo`＝足した登録を「次の1往復で渡す形」にする（`fix --todo` と同じ形）。誰が何を埋めるかの割り振りに使える | 足した直後は**全部 TODO**。一覧が渡せる形なら、埋め忘れが「動かして初めて分かる」から「渡した時点で見える」に変わる | P2 | 小 |
| 助言と変更の言い直しも英語に | `advise` / `explain --diff` / `--review` の言い回しを [explainVoice] と同じ形にする（いまは日本語だけで、`--lang en` は落とす） | 説明が英語になったので、次に効くのは**レビューで読む残り2枚**。表の作り方は決まったので、あとは文を書く仕事 | P2 | 中 |
| 語彙の英語を機械が見る | `spec/vocabulary.json` の `en` に「日本語だけにある概念」（和暦・全角半角）が混ざっていないかを見る規則を足す（`wareki` の英語が `in the Japanese era calendar` のように**説明になっている**のは正しいが、`短い見出し語`が長文になっていると1行に収まらない） | 語彙は増える。英語だけが長くなると `--brief` の1行が崩れるが、**日本語を見ていても気づけない** | P2 | 小 |
| 説明を読む人の言葉で選ばせる | `HATAKE_LANG` 環境変数（`--lang` を毎回書かせない）。CI では既定を英語にしたい案件がある | 道具の既定は「その現場の言葉」であるべきで、いまは日本語に固定。旗で渡すのは**毎回忘れる** | P2 | 小 |
| 押しても何も起きないボタンを全部数える | `type: create` は済（`create-action-unusable`）。残りは「その画面に無い機能を指すボタン」全般＝`edit` を一覧の無い画面に置く・`print` の帳票が空・`navigate` の行き先が同じ画面 | 「押しても何も起きない」は**この枠組みで一番まずい転び方**（定義は通り、画面も出る）。1つ塞いだので、同じ形を洗い出す | P1 | 小 |
| 手引きのコマンドを全部走らせる | いま CI が走らせているのは PR コメントの断片とチュートリアルの定義だけ。`cookbook` / `getting-started` に載せた定義とコマンドも同じ形で回す | 文書に載せたコマンドは、走らせないと必ず腐る（読んだ人の所で初めて落ちる）。仕組みは出来たので、あとは対象を増やすだけ | P2 | 小〜中 |
| 計算の依存を絵にする | `explain --diagram` に「どの項目がどの項目から出るか」を足す（`小計 → 消費税 → 合計`、明細の行から親へ）。順番の警告が出たときに**どこを動かせばいいか**が1枚で見える | 順番は機械が見るようになったが、直す側は表を目で追うことになる。依存は定義から読めるので、絵にするのは書くだけの仕事 | P1 | 小 |
| 条件の値を画面の言葉で言う | `explain` が条件の値を選択肢のラベルと真偽の言葉に直す（`取消 が true でないとき` →「取消 が いいえ のとき」）。`where` の読み上げで一番目に付く | 説明は**DSL を知らない人**に読ませるためのもの。`true` や生のコード値が出ていると、そこだけ読めない | P2 | 小 |
| 並べ替えて上位だけ並べる | `computed` の行モードに `orderBy` と `limit`（「金額の大きい順に3件だけ、以降は ほか N 件」）。要約の欄は幅が決まっているので、全部並べると溢れる | `join` は行の順のまま全部並べる。実務の要約は「代表を数件」なので、いまは溢れるか、プラグインを書くことになる | P2 | 小〜中 |
| 計算した値もサーバの形に出す | `dto` / `openapi` に計算項目を**読み取り専用**として出す（いまは「定義から埋まる項目」なので、サーバの契約に出ていない）。畳んだ小計をサーバでも突き合わせたいことがある | 画面が計算した値を保存しているのに、契約にその項目が無い＝サーバ側の実装者が「何が来るか」を定義から読めない | P2 | 中 |

### 3. 人が使うための道具・資料

> **済**:
>
> **済（今回）**: [チュートリアル](tutorial.ja.md)＝0から受注入力画面まで通しで1本（定義1枚と道具7つ。**載せた定義と説明の文は CI が実際に走らせて確かめている**＝手引きが腐らない）。[PR コメントの手引き](guide/pr-comment.ja.md)＝変化を PR に自動で貼る Actions（断片も CI が走らせる）。
> - **Web プレイグラウンド** … ✅ デモアプリの中（同じ成果物）。
>   <https://asil-e-hatake.github.io/hatake/demo/?playground=1>。定義を貼ると**その場で
>   描画**され、直すと描き変わる。データは**定義から作る仮のもの**（`field` の名前から
>   それらしい値を作るので Repository を書かなくていい）。strict で読むので**綴り間違いは
>   その場で理由が出る**（任意キーは黙って捨てられるので、ここが半分の価値）。読めない間は
>   前に読めた画面を出しておく（1文字打つたびに画面が消えると編集できない）。定義は
>   `?yaml=<base64>` で**URL に載せて渡せる**。デモの各画面からは「触ってみる」で
>   その画面の定義を持って開く。→ [プレイグラウンド](../flutter/packages/hatake_example/lib/playground.dart)
> - **図解** … ✅ [`docs/diagrams/`](diagrams/README.ja.md) の3枚（定義から画面まで／データの
>   流れ／層の責務）。サイトにも同じ絵を出す（<https://asil-e-hatake.github.io/hatake/diagrams>）。
>   **絵は生成物**で、元は `docs/diagrams/*.json`（縦積みの箱と矢印だけの素朴な形式。描画は
>   `hatake diagram` に移した）。手で描くと
>   言葉と絵がすぐズレる（層の名前を変えても絵は直らない）ので、元データだけ直せば絵が付いてくる
>   形にして、CI が作り直して差分を見る。文字幅は測らずに数えていて、**枠から溢れる文を書くと
>   生成器が落ちる**（溢れたまま配るのが一番まずいので、警告ではなくエラー）。明暗どちらの
>   テーマでも読めるよう `prefers-color-scheme` を SVG の中に持つ。

| 項目 | 内容 | なぜ | 優先度 | 規模感 |
|---|---|---|---|---|
| **VSCode 拡張** | 段階的に: ①スニペット＋JSON Schema 自動紐付け（今は YAML 先頭に `# yaml-language-server:` を手書き）→ ②**定義プレビュー**（横に画面イメージ）→ ③GUI 編集（項目を並べて YAML を書き戻す） | 「YAML を手で書く」の敷居を下げる。②まで来ると営業でも見せられる | P0 | ①小 / ②中 / ③大 |
| プレイグラウンドの次段 | 画面を URL で直接指す（[Web URL 同期](#1-機能framework-本体)と同じ話）・エディタの補完（JSON Schema を積む）・共有リンクの短縮 | 貼れるようにはなったので、次は「その画面を指して渡す」 | P2 | 中 |
| 移行ガイド | 既存の Flutter 画面 / 既存の業務システムからの置き換え手順（部分導入のやり方） | 新規案件より置き換えの方が多い | P2 | 小 |
| 配布（pub.dev / npm / Maven） | [配布・公開](#配布公開distribution)の TODO を実際に publish する | `git` 参照のままだと採用されにくい | 保留 | 中 |

## 依頼の仕方（メモ）

「この表の ◯◯ を ◯◯言語で」「新機能 ◯◯ を spec 先行で」みたいに、この表を指して投げてくれれば拾いやすい。大きめのやつは「spec 定義 → 参照実装 → 横展開 → コンフォーマンス」の順で刻む。
