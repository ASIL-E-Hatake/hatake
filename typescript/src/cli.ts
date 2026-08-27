#!/usr/bin/env node
// hatake CLI — 定義を「書いた → すぐ検証」の1コマンドにする。
//
// なぜ TypeScript 版に置くか: 検証（strict パース）と生成（DTO / JSON Schema /
// OpenAPI / ネイティブ型）が全部そろっている唯一のエディションだから。Dart 版は
// DTO 生成を持たない（バックエンドの関心なので意図的に対象外）。
//
// 依存は増やさない: 引数解析も出力も手書き。CLI が npm の流行に引きずられると、
// 「業務システムを10年動かす」側の都合と合わなくなる。

import { dirname, join } from "node:path";
import { parse as parseYamlText } from "yaml";
import { fetchSend, type HttpSend } from "./httpProbe.js";
import { loginFetch, type LoginSend } from "./loginRun.js";
import { type Args, collectionOverrides, str } from "./cliArgs.js";
import { type CliIo, nodeIo } from "./cliIo.js";
import { attackCommand, probeCommand } from "./cliProbe.js";
import { type DefinitionWarning, findWarnings } from "./warnings.js";
import {
  CATALOG_PATH,
  FAILURES_FILE,
  findSpecDir,
  PITFALLS_FILE,
  SCHEMA_FILE,
} from "./specDir.js";
import {
  describePitfall,
  filterPitfalls,
  type PitfallCatalog,
  pitfallsForKeys,
  snippet,
} from "./pitfalls.js";
import {
  describeFailure,
  type FailureCatalog,
  filterFailures,
} from "./failures.js";
import { deriveDto } from "./dto.js";
import { renderExplain } from "./explain.js";
import { explainSource, isAppSource, parseAppSource } from "./explainSource.js";
import {
  describeChange,
  explainDiffSources,
  renderExplainDiff,
} from "./explainDiff.js";
import { briefSource, renderBrief } from "./explainBrief.js";
import {
  briefMarkdown,
  definitionDiffMarkdown,
  explainDiffMarkdown,
  explainMarkdown,
  reviewMarkdown,
} from "./explainMarkdown.js";
import { readGitPair } from "./gitRange.js";
import { buildReport } from "./report.js";
import { layoutReport } from "./reportLayout.js";
import { renderPaperText } from "./paperText.js";
import { sampleRows } from "./sampleRows.js";
import { printStyle } from "./printStyle.js";
import {
  DEFINITION_EXTENSIONS,
  harvestFailures,
  type HarvestInput,
  renderHarvest,
} from "./harvest.js";
import { minimizeSource, renderMinimize } from "./minimize.js";
import { wireApp } from "./wire.js";
import { mergeWiring, renderWireMerge } from "./wireMerge.js";
import { renderWireTodo, wireTodo } from "./wireTodo.js";
import {
  filledReport,
  hasUnfilled,
  inState,
  renderFilled,
} from "./wiringFilled.js";
import { looseTodos, usesInCode } from "./registryUse.js";
import { fixSource, fixTodo, renderFix, renderFixTodo } from "./fix.js";
import { type Advice, findAdvice, renderAdvice, unwritableAdvice } from "./advise.js";
import {
  type AdvicePick,
  applyAdvice,
  renderAdviceApply,
} from "./adviseApply.js";
import { withDrafts } from "./adviseDraft.js";
import { appAccess, opensByRole } from "./appAccess.js";
import { renderRoles, roleTitleOf } from "./explainRoles.js";
import {
  PLACEHOLDER_CONTEXTS,
  renderPlaceholders,
} from "./placeholders.js";
import { roleInventory } from "./roles.js";
import type { Lang } from "./explainPhrases.js";
import { type AdviceRules, DEFAULT_RULES, parseAdviceRules } from "./adviseRules.js";
import { renderReview, reviewSource } from "./review.js";
import {
  buildIndex,
  type IndexInput,
  renderIndex,
  searchIndex,
  sizeOf,
} from "./screenIndex.js";
import {
  looksLikeDiagram,
  parseDiagram,
  renderDiagram,
} from "./diagram.js";
import { appDiagram } from "./appDiagram.js";
import { diffDefinitions, type DefinitionChange } from "./defDiff.js";
import {
  collectRefs,
  type DefinitionRef,
  type DefinitionRegistry,
  groupRefs,
  refsNeedingRegistration,
  unusedRegistrations,
} from "./refs.js";
import { type ExampleCatalog, filterExamples } from "./examples.js";
import {
  buildReference,
  filterByPageKind,
  lookupReference,
} from "./reference.js";
import { toJsonSchema } from "./jsonSchema.js";
import { toOpenApi } from "./openApi.js";
import {
  type PageDefinition,
  type ReportPageDefinition,
} from "./definition.js";
import {
  DefinitionParseError,
  parsePageYaml,
  UnknownKeysError,
  describeUnknownKey,
} from "./parse.js";
import { parseAppYaml } from "./appParse.js";
import { closestKey } from "./strictKeys.js";
import { scaffold, scaffoldKinds } from "./scaffold.js";
import {
  type RegistryScan,
  SCANNABLE_EXTENSIONS,
  scanRegistrations,
  type SourceFile,
} from "./registryScan.js";
import { toJavaRecords, toTypeScript } from "./types.js";


export { type Args, str } from "./cliArgs.js";
export { type CliIo, nodeIo } from "./cliIo.js";

const USAGE = `hatake — 定義ファースト UI フレームワークの CLI

使い方:
  hatake validate <file...> [--no-strict] [--json] [--no-warn] [--warn-as-error]
                            [--registry hatake-registry.json]
      定義を解析して問題を報告する。既定は strict（知らないキーを弾く）。
      通るけれど意図どおり動かない書き方（警告）も既定で出す。終了コードは
      エラーだけで決まる（--warn-as-error を付けると警告でも 1）。
      --registry に「アプリ側で登録済みのもの」の一覧を渡すと、画面の外との
      辻褄（Repository / プラグイン / 独自の型の名前）も見る。省略しても
      定義の隣の hatake-registry.json があれば拾う。

  hatake explain <file> [--page <id>] [--brief] [--json] [--markdown] [--lang ja|en]
      定義を「この画面は何をするか」に開く（日本語）。DSL を知らない人が、AI に
      書かせた定義をレビューするための出力。app: を渡すと画面の一覧とメニュー、
      --page でその1枚を詳しく。**app なら「この画面を開けるのは誰か」も出す**
      （1枚だけ読んでも出ない値で、いままで図しか知らなかった）。--brief は1行だけ
      （app なら画面一覧）。--markdown は PR 本文に貼れる形（見出し・箇条書き・表・
      長い節は折りたたみ）。--lang en で英語（語彙は spec/vocabulary.json の en）。
      英語は説明だけ＝--diff と --review はまだ日本語なので、--lang en を渡すと落ちる
      （半分だけ英語の文書を出すほうが困る）。

  hatake explain <file> --review [--page <id>] [--rules team.json] [--json] [--markdown]
      レビュー用の1枚。説明（何ができて、何ができないか）と助言（書き足したほうが
      いい所）をまとめて出す。レビューする人が見る紙は1枚がいいので、道具を2回
      叩かせない。助言は最後の節にまとめ、警告ではないと毎回書く（終了コードは
      変えない）。--page を渡すと、助言もその画面のものだけに絞る。

  hatake explain --diff <old file> <new file> [--json] [--markdown] [--if-changed]
  hatake explain --diff --git <range> <file> [--json] [--markdown] [--if-changed]
      変更を**画面の言葉**で言う（「枠「請求先」は、区分 が 法人 のときだけ出る
      ようになりました」）。diff は機械の言葉で言うので、人のレビューには一段
      足りない。後方互換の判定はしない（それは hatake diff）。
      --git は変更前を git から取る（HEAD~1..HEAD / main...HEAD＝枝分かれした所と
      比べる / HEAD＝いまの作業中と比べる）。--markdown と組めば、PR 本文に
      そのまま貼れる。--if-changed は**変わっていなければ何も出さない**
      （CI で「変化が無ければ貼らない」を書くための旗。docs/guide/pr-comment.ja.md）。

  hatake harvest <path...> [--min 2] [--repro] [--json] [--registry hatake-registry.json]
      定義の山を走査して、**繰り返し出ている診断**を実例カタログ
      （spec/failures.json）の候補として出す。「なぜそう書いてしまうか」は機械には
      書けないので、候補は人が書く欄を空のまま出す（自動では足さない）。
      定義そのものは持ち出さない（ファイル名・場所・回数だけ）。--repro を付けると
      **最小の再現**（その診断が出続ける形まで削った下書き）も作る。ラベルは記号に
      置き換えるが、id や項目名は残るので、出力に定義の本文が入る。

  hatake minimize <file> [--json] [--out file]
      **意味を変えずに**定義を短くする。既定値と同じ指定・空の指定を落とす。落とすたびに
      解析後のモデルが1バイトも変わらないことを確かめるので、意味は変わらない
      （変わるものは落とさない）。コメントはそのまま残す。既定は最小化した定義を
      標準出力に、落としたものは標準エラーに出す（--json で両方まとめて機械可読）。

  hatake fix <file> [--write] [--todo] [--json] [--registry hatake-registry.json]
      **直し方が一意に決まる問題だけ**を直す（綴り違い・入れる値が決まっている指定）。
      既定は直した定義を標準出力に出すだけで、ファイルは触らない（--write で上書き）。
      1件ずつ当てて「問題が減る・新しい問題が出ない」ことを確かめ、崩れたら何もしない。
      直さなかったものは**理由つきで**標準エラーに出す（意図が要るものは人の仕事）。

  hatake explain <file> --roles [--json]
      **定義に出てくる役割の全部**と、どこに書いてあるか（メニュー・ボタン・列・項目）。
      出てくる回数の多い順に並べるので、1か所しか出てこない役割＝綴り違いの疑いが
      下に落ちてくる。出るのは**定義に書いてある名前**だけで、アプリ側の権限判定と
      合っているかは見られない（誰がどの画面を開けるかは explain の「開ける人」）。

  hatake advise <file> [--rules team.json] [--apply picks.json] [--write] [--json]
      **書き足したほうがいい所**を挙げる（並べ替えできる列が無い・絞り込みが無い・
      誰でも消せる・金額に桁区切りが無い…）。これは助言で警告ではないので、
      終了コードは変えない。「書いたのに効かない」は validate の担当。
      **一括（scope: selection）だけは既定で厳しい**（確認・件数・失敗の言い方・
      赤いボタン・1回で動く件数）＝1回の操作が件数ぶん動くので。
      **--apply で、選んだ助言をその場に書き込める**（picks.json に規則名と書く値を
      並べる）。値は渡す側が決める＝確認の文・件数・見せる相手は業務の決めごとなので、
      機械は決めない。書く場所だけを機械が決め、当てたあと「読める・別の問題が出ない・
      その助言が消える」ことを確かめる。既定は当てた定義を標準出力に出すだけ
      （--write でファイルを上書き）。頼んだのに当てられなかったものがあれば 1 を返す。
      --rules で**物差しを渡せる**（合わない規則を切る・目盛りを変える・案件の
      決めごと「この場所には必ずこのキーを書く」を足す）。知らないキーや知らない
      規則名を書いた物差しは、黙って無視せずエラーにする。

  hatake index <path...> [--find "顧客 検索"] [--by size] [--json] [--out file]
      定義の山から**画面の索引**を作る（1行の要約＋探すための語）。--find は語の AND。
      --by size で規模の大きい画面から。--json / --out はそのまま機械に渡せる形。

  hatake diagram <file> [--out file.svg] [--role admin] [--json]
      図解の SVG を出す。app: の定義を渡すと**画面とメニューと遷移**の図を作り
      （どこからも開けない画面も分かる）、図の元データ（rows を持つ JSON）を渡すと
      それを描く。--json で元データだけ（手で直してから描けるように）。
      箱の中には**誰が開けるか**も出る（ページに roles は書けないので、メニューと
      ボタンの roles から辿って数える）。赤枠＝誰でも開けて消す/持ち出すができる画面、
      点線＝誰も開けない画面（入口の権限が食い違っている）。--role を渡すと
      **その役割で通れる道**だけの図になる（知らない役割名はエラー）。

  hatake registry <path...> [--json] [--out file]
      アプリの実装を読んで「登録済みのもの」の一覧を作る（validate --registry に
      渡す形）。path はファイルでもディレクトリでもよい。**その場に書いてある
      文字列しか読めない**ので、変数や関数から組み立てている登録は読めなかったもの
      として報告し、終了コード 1 にする（黙って落とすと一覧が嘘になるため）。

  hatake refs <file...> [--json] [--needs-registration] [--unused]
              [--filled] [--source <実装のパス>] [--pending-as-error]
              [--unused-as-error]
      その定義が外に要求しているもの（Repository・プラグイン・フォーマッタ…）を
      種類ごとに並べる。--needs-registration で「組み込みに無い＝自分で登録が
      要るもの」だけ。出力はそのまま --registry に渡せる形。
      --unused は**逆向き**＝登録してあるのに、どの定義も使っていないものを出す
      （登録済みの一覧が要る。消し忘れた登録は「使われている」と誤解される）。

      --filled --source <実装のパス> で、要求している登録が**本当に埋まったか**を
      数える（埋まっている／TODO のまま／登録が無い／言えない）。「TODO のまま」は
      wire が足した目印（UnimplementedError）が残っているもの＝動かすと落ちる。
      読めなかった登録が在る種類は「言えない」＝在るとも無いとも言わない。
      --pending-as-error で、TODO のまま・登録が無い が1件でもあれば落とす。

      --unused に --source を渡すと、**アプリのコードの中で名前が書かれているか**も
      見る（画面の外から直接呼んでいる登録は「消してよい」ではない）。
      --unused-as-error は、コードのどこにも無いものが残っていれば落とす。

  hatake wire <file> [--base /api] [--out file] [--class Name] [--assets path]
      アプリ側の配線（Flutter）の下書きを出す。定義が要求している登録
      （Repository・プラグイン・出す口・独自の検証/正規化/見せ方/計算/集約/項目の型/
      カードの型）を全部並べた HatakeScope を組む。**中身は決められないので
      TODO**（何をするかは業務、どう繋ぐかは環境）で、埋めるまでは
      UnimplementedError で落ちる＝黙って何もしない、にはしない。
      --base を渡すと Repository は hatake_http（REST）で組む＝そこは TODO に
      ならない（collection の名前は複数形を推測して埋める）。

  hatake wire <file> --merge <既にある配線.dart> [--write] [--out file] [--json]
              [--todo]
      **足りない登録だけ**を足す（2回目以降はこちら）。手で埋めた中身は1バイトも
      変えない＝消さない・並べ替えない・整形しない。要らなくなった登録は言うだけで
      消さない（消すかどうかは業務の判断）。既定は標準出力、--write で上書き。
      目印（HatakeScope と child:）が無い形なら、何もせず理由を言う。
      --todo で、足した登録を**次の1往復で渡す形**にする（どこに・何を書くか・
      埋めるまで何が起きるか）。足した直後は全部 TODO なので、埋め忘れが
      「動かして初めて分かる」から「渡した時点で見える」に変わる。

  hatake probe <file> --base http://localhost:8080/api [--page <id>]
              [--token <jwt>] [--headers headers.json] [--login login.json]
              [--collection k=name] [--since 前回.json] [--save 次回.json]
              [--fail-on any|new] [--dry-run] [--json]
      定義が要求している口を**実際に叩いて**、返ってきた形を宣言と突き合わせる
      （足りない項目・型違い・{items, totalCount} でない・pageSize が効かない・
      行に鍵が無い）。食い違いがあれば終了コード 1。
      **読むだけ**（POST / PUT / DELETE は叩かない）。--dry-run は叩かずに
      「何を叩くか」だけ出す。集合の名前は wire と同じ推測（--collection で上書き）。

  hatake attack <file> --all-roles --accounts accounts.json --base http://…
              [--login login.json] [--since 前回.json] [--save 次回.json]
              [--fail-on any|new] [--dry-run] [--json]
      **定義に出てくる役割ぜんぶ＋誰でもない人**で叩いて、1枚の表にする。役割が
      増えるたびに全部やり直すのは人が続けられないし、**1つ足したときに他が緩んで
      いないか**は並べないと読めない。資格は**役割ごとに要る**（accounts.json に
      { "hr": { "token": "…" } } の形）＝1つの資格で他の役割を判定すると、返ってきた
      200 が穴なのか正しいのか区別できないので。資格の無い役割は叩かず、理由を残す。
      誰でもない人（資格なし）は毎回1本入る。

  hatake attack <file> --role <role> --base http://localhost:8080/api
              [--token <jwt>] [--headers headers.json] [--login login.json]
              [--collection k=name] [--since 前回.json] [--save 次回.json]
              [--fail-on any|new] [--dry-run] [--json]
      その役割で**画面から見えない**はずの口を叩いて、API が実際に拒否するか見る。
      開ける画面が拒否されたら、それも食い違いとして出す（画面は出てもデータが
      来ない）。穴が1つでもあれば終了コード 1。app: の定義が要る。
      押せないはずのボタン（POST / PUT / DELETE）は**叩かず**に一覧で出す。

  叩く道具（probe / attack）に共通の旗 ── 人が横に居ない所で回すため:

      --login login.json  資格を**毎回取る**。トークンは期限で落ちるので、CI に置く
          なら渡す形では続かない。login.json は「1往復ぶんの要求」だけを書いた JSON
          （url / tokenAt / body、--all-roles なら役割ごとの roles）。値は \${環境変数}
          で外から渡す＝秘密をファイルに書かない。無い環境変数は落とす（空のまま
          送ると 401 が返り「穴が無い」と読める結果になる）。取ったトークンは
          報告にも --dry-run にも出さない。--token / --headers とは併用しない。

      --since 前回.json  前回の結果と比べて**変わった所だけ**出す。毎晩回すと出力は
          毎晩同じで、人は同じ表を読み続けられない。前回叩けていた相手を今回叩いて
          いなければ（資格切れ・役割の書き忘れ）、消えた穴は「直った」ではなく
          **「叩いていないので分かりません」**と言う。

      --save 次回.json  叩いた結果をそのまま残す（次の晩の --since に渡す相手）。
          書くのは --json と同じもの。--since を付けると出力は違いだけになるので、
          残す口を別にしている。

      --fail-on new  落とすのを**新しい分だけ**にする（既定の any は、前から在る穴
          でも落ちる）。--since が要る。資格が切れて相手を叩けなくなったことも
          「新しい」に数える＝何も見ていない晩に静かに通らないように。

  hatake paper <file> [--page <id>] [--rows rows.json] [--role admin]
              [--columns 110] [--json]
      帳票を「刷ったらどう見えるか」に開く（文字で）。列の並び・小計の位置・
      切れた文字・右寄せが読める。**行を渡さなければ見本の行を作る**（データが
      無いと紙を見られない、では誰も確かめない）。--json で紙の上の座標そのもの。
      刷る（PDF/プリンタ）のは opt-in の hatake_print で、同じ座標を使う。

  hatake dto <file> [--json]
      API の形（DtoSpec）を出す。

  hatake diff <old file> <new file> [--json] [--markdown] [--caution-as-error] [--api-only]
  hatake diff --git <range> <file> [--json] [--markdown] [--caution-as-error] [--api-only]
      定義を変えたときの影響範囲。API の形（壊すか）と、画面・権限・アプリ構成の
      変化（確かめてほしいか）を出す。app: どうしの比較にも対応。
      壊す変更があれば終了コード 1（--caution-as-error で「要確認」でも 1）。
      --git は変更前を git から取る（explain --diff と同じ書き方）ので、
      「変更前のファイル」を手で書き出さずに CI に置ける。

  hatake schema <file>
      JSON Schema 2020-12 を出す。

  hatake openapi <file> [--base-path /api/orders] [--title T] [--api-version 1.0.0]
      OpenAPI 3.1 を出す。--base-path を省くと components.schemas だけ。

  hatake types <file> --lang ts|java [--package io.example.api] [--out dir]
      ネイティブ型を出す。--out でファイルに書く（省略時は標準出力）。

  hatake new <kind> --id <id> --title <title> [--repository <key>] [--out file]
      ページ定義の雛形を出す。kind: ${scaffoldKinds.join(" | ")}

  hatake reference [name] [--page-kind <kind>] [--out file]
      機械可読な DSL リファレンス（JSON）。name にノード名・キー名・ページ種別を
      渡すとその1件だけ。--page-kind でその画面で使えるところだけに絞る。

  hatake reference --placeholders [--json]
      **文言に書ける差し込みの全部**（{count} / {failed} / {failedKeys} / {error} /
      {value} / $row.<項目名>）と、それぞれ**いつ埋まるか**。
      差し込みは閉じた集合で、3つの文脈（ボタンの文言・検証のメッセージ・遷移の
      パラメータ）に散っている。ここに無いものは書いても文字のまま出る。

  hatake examples [query] [--json]
      例のカタログ（やりたいこと → 例）。query で絞り込む。

  hatake failures [query] [--json]
      実際に定義を書いて転んだ実例（こう書いた → こう言われた → こう直した）。
      「なぜそう書いてしまうか」も持つ。機械では拾えない件も載っている。

  hatake pitfalls [query] [--json] [--lang ja|en]
      よくある間違い → 正しい書き方の対照表。validate も未知キーからこれを引く。

  hatake --help / --version

終了コード: 問題があれば 1、無ければ 0。`;

const VERSION = "0.0.1";


/**
 * 値を取らないフラグ。これを知らないと `validate --warn-as-error a.yaml` で
 * ファイル名をフラグの値として食ってしまう（＝ファイル指定なし扱いになる）。
 */
const BOOLEAN_FLAGS = new Set([
  "json",
  "markdown",
  "diff",
  "brief",
  "roles",
  "placeholders",
  "all-roles",
  "review",
  "repro",
  "write",
  "no-strict",
  "no-warn",
  "warn-as-error",
  "caution-as-error",
  "api-only",
  "needs-registration",
  "unused",
  "unused-as-error",
  "filled",
  "pending-as-error",
  "todo",
  "dry-run",
  "if-changed",
  "help",
  "h",
  "version",
]);

/** `--key value` / `--key=value` / `--flag` だけを見る素直な解析。 */
export function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const body = arg.slice(2);
    const eq = body.indexOf("=");
    if (eq >= 0) {
      flags[body.slice(0, eq)] = body.slice(eq + 1);
      continue;
    }
    const next = argv[i + 1];
    if (
      !BOOLEAN_FLAGS.has(body) &&
      next !== undefined &&
      !next.startsWith("--")
    ) {
      flags[body] = next;
      i++;
    } else {
      flags[body] = true;
    }
  }
  return { command: positional[0], positional: positional.slice(1), flags };
}


/**
 * CLI 本体。終了コードを返す（`process.exit` はしないので、テストから普通に呼べる）。
 */
export function runCli(argv: string[], io: CliIo = nodeIo): number {
  const { command, positional, flags } = parseArgs(argv);

  if (flags.help === true || flags.h === true || command === undefined) {
    io.out(USAGE);
    return command === undefined && flags.help !== true && flags.h !== true
      ? 1
      : 0;
  }
  if (flags.version === true) {
    io.out(VERSION);
    return 0;
  }

  try {
    switch (command) {
      case "validate":
        return validate(positional, flags, io);
      case "dto":
        return emit(positional, io, (page) =>
          JSON.stringify(deriveDto(page), null, 2),
        );
      case "schema":
        return emit(positional, io, (page) =>
          JSON.stringify(toJsonSchema(deriveDto(page)), null, 2),
        );
      case "openapi":
        return emit(positional, io, (page) =>
          JSON.stringify(
            toOpenApi(deriveDto(page), {
              basePath: str(flags, "base-path"),
              title: str(flags, "title"),
              version: str(flags, "api-version"),
            }),
            null,
            2,
          ),
        );
      case "diff":
        return diff(positional, flags, io);
      case "refs":
        return refs(positional, flags, io);
      case "registry":
        return registry(positional, flags, io);
      case "wire":
        return wire(positional, flags, io);
      case "probe":
      case "attack":
        // 通信するので入口が別（[runCliAsync]）。bin はそちらを呼ぶ。
        io.err(`${command} は通信するコマンドなので、この入口からは呼べません。`);
        return 1;
      case "explain":
        return explain(positional, flags, io);
      case "harvest":
        return harvest(positional, flags, io);
      case "minimize":
        return minimize(positional, flags, io);
      case "fix":
        return fix(positional, flags, io);
      case "advise":
        return advise(positional, flags, io);
      case "index":
        return screenIndex(positional, flags, io);
      case "diagram":
        return diagram(positional, flags, io);
      case "paper":
        return paper(positional, flags, io);
      case "types":
        return types(positional, flags, io);
      case "new":
        return scaffoldCommand(positional, flags, io);
      case "reference":
        return reference(positional, flags, io);
      case "examples":
        return examples(positional, flags, io);
      case "pitfalls":
        return pitfalls(positional, flags, io);
      case "failures":
        return failures(positional, flags, io);
      default:
        io.err(`知らないコマンド "${command}" です。--help を見てください。`);
        return 1;
    }
  } catch (error) {
    io.err(message(error));
    return 1;
  }
}

/**
 * 通信するコマンドを含む入口。bin はこれを呼ぶ。
 *
 * なぜ2つに分けるか: CLI の本体は同期で書いてある（`process.exit` を使わず、試験から
 * 素直に呼べる形）。**叩いて確かめる道具だけ**が非同期なので、そこだけを外に出す。
 * 全部を async にすると、通信しないコマンド全部まで await が要る。
 *
 * [send] を差し替えられるのは試験のため（偽のサーバを渡せば通信せずに回る）。
 */
export async function runCliAsync(
  argv: string[],
  io: CliIo = nodeIo,
  send: HttpSend = fetchSend,
  // 資格を取る口（`--login`）は**別の送り口**。業務の口を叩く [send] は GET しか
  // 送れないままにしておく（縛りを解かない）。
  loginSend: LoginSend = loginFetch,
): Promise<number> {
  const { command, positional, flags } = parseArgs(argv);
  if (command !== "probe" && command !== "attack") return runCli(argv, io);
  try {
    return command === "probe"
      ? await probeCommand(positional, flags, io, send, loginSend)
      : await attackCommand(positional, flags, io, send, loginSend);
  } catch (error) {
    io.err(message(error));
    return 1;
  }
}

/** 解析して問題を報告する。1ファイルでも落ちれば終了コードは 1。 */
function validate(files: string[], flags: Args["flags"], io: CliIo): number {
  if (files.length === 0) {
    io.err("検証するファイルを指定してください。");
    return 1;
  }
  const strict = flags["no-strict"] !== true;
  const asJson = flags.json === true;
  const results: unknown[] = [];
  let failures = 0;
  let warned = 0;

  for (const file of files) {
    try {
      const source = io.readFile(file);
      const parsed = parseDefinition(source, file, { strict });
      // 登録済み一覧は「渡されたら見る」もの。無ければ定義の中だけで閉じた検査。
      const registry = loadRegistry(file, flags, io);
      // 警告は「解析は通った定義」に対してだけ意味がある。
      const warnings =
        flags["no-warn"] === true ? [] : warningsIn(source, registry);
      warned += warnings.length;
      if (asJson) {
        results.push({
          file,
          ok: true,
          kind: parsed.kind,
          ...(warnings.length > 0 ? { warnings } : {}),
        });
      } else {
        io.out(`OK   ${file} (${parsed.kind})`);
        for (const warning of warnings) {
          io.err(`     警告 ${warning.path}: ${warning.message}`);
          io.err(`          → ${warning.fix}`);
        }
      }
    } catch (error) {
      failures++;
      const hints = hintsFor(error, flags, io);
      if (asJson) {
        results.push({
          file,
          ok: false,
          ...problem(error),
          ...(hints.length > 0 ? { hints } : {}),
        });
      } else {
        io.out(`FAIL ${file}`);
        for (const line of problemLines(error)) io.err(`     ${line}`);
        for (const hint of hints) io.err(`     ヒント: ${hint}`);
      }
    }
  }
  if (asJson) io.out(JSON.stringify(results, null, 2));
  if (failures > 0) return 1;
  // 警告で終了コードを変えるかは呼び出し側が決める（既定は「見せるだけ」）。
  return warned > 0 && flags["warn-as-error"] === true ? 1 : 0;
}

/** 素の document を見て、通るけれど意図どおり動かない書き方を拾う。 */
function warningsIn(
  source: string,
  registry?: DefinitionRegistry,
): DefinitionWarning[] {
  try {
    const document = parseYamlText(source);
    return typeof document === "object" && document !== null
      ? findWarnings(document as Record<string, unknown>, { registry })
      : [];
  } catch {
    return []; // 解析が通っている前提なので、ここには来ない
  }
}

/** 登録済み一覧の既定の置き場所（定義の隣にあれば黙って拾う）。 */
const REGISTRY_FILE = "hatake-registry.json";

/**
 * アプリ側で登録済みのものの一覧を読む。
 *
 * `--registry` で明示するか、定義の隣（無ければカレント）の
 * `hatake-registry.json`。**無くても検証は成立する**ので、見つからないのは
 * エラーにしない（一覧を渡せない場所でも `validate` は動く必要がある）。
 * ただし明示されたのに読めないのは指定間違いなので投げる。
 */
function loadRegistry(
  file: string,
  flags: Args["flags"],
  io: CliIo,
): DefinitionRegistry | undefined {
  const explicit = str(flags, "registry");
  if (explicit !== undefined) {
    return JSON.parse(io.readFile(explicit)) as DefinitionRegistry;
  }
  for (const candidate of [join(dirname(file), REGISTRY_FILE), REGISTRY_FILE]) {
    try {
      return JSON.parse(io.readFile(candidate)) as DefinitionRegistry;
    } catch {
      // 無ければ次の候補へ。全部無ければ「外との辻褄は見ない」。
    }
  }
  return undefined;
}

/**
 * 定義を人の言葉に開く。`--diff` で前後、`--brief` で1行、`--review` で助言も1枚に。
 *
 * 生成系と同じく strict で読む（書き間違いのある定義を説明すると、書いていない
 * つもりの機能まで説明してしまう）。読み方そのものは explainSource に置いてある
 * （CLI と MCP で結論が違うことが無いように）。
 */
function explain(files: string[], flags: Args["flags"], io: CliIo): number {
  if (bothFormats(flags, io)) return 1;
  if (flags.diff === true) return explainChanges(files, flags, io);
  if (files.length !== 1) {
    io.err("説明する定義ファイルを1つ指定してください。");
    return 1;
  }
  const lang = readLang(flags, io);
  if (lang === null) return 1;
  const source = io.readFile(files[0]);
  const wanted = str(flags, "page");
  if (flags.roles === true) return explainRoles(source, flags, io);
  if (flags.review === true) return review(source, wanted, flags, io);
  const document =
    flags.brief === true
      ? briefSource(source, { page: wanted, lang })
      : explainSource(source, { page: wanted, lang });

  if (flags.json === true) {
    io.out(JSON.stringify(document, null, 2));
    return 0;
  }
  const markdown = flags.markdown === true;
  if (flags.brief === true) {
    const brief = document as ReturnType<typeof briefSource>;
    io.out(markdown ? briefMarkdown(brief) : renderBrief(brief));
    return 0;
  }
  const explained = document as ReturnType<typeof explainSource>;
  io.out(markdown ? explainMarkdown(explained) : renderExplain(explained));
  return 0;
}

/**
 * `--lang` を読む。知らない言語は**黙って日本語に落とさない**。
 *
 * 落とすと「英語で出したつもりの日本語」が PR に貼られる（貼った人は気づかない）。
 * まだ英語で出せない道具（`--diff` / `--review`）で `--lang en` を渡されたときも、
 * 半分だけ英語の文書を出すより**出さない**ほうがよい。
 */
function readLang(flags: Args["flags"], io: CliIo): Lang | null {
  const given = str(flags, "lang");
  if (given === undefined) return "ja";
  if (given !== "ja" && given !== "en") {
    io.err(`--lang は ja か en です（"${given}" は知りません）。`);
    return null;
  }
  if (given === "en" && (flags.diff === true || flags.review === true)) {
    io.err(
      "--lang en は説明（explain / --brief / --markdown）だけです。" +
        "変更の言い直し（--diff）と助言（--review）はまだ日本語しかありません" +
        "（半分だけ英語の文書を出すほうが困るので、出しません）。",
    );
    return null;
  }
  return given;
}

/**
 * 形は1つだけ選ぶ。
 *
 * 両方渡されたときに片方を黙って無視すると、**貼った先で形が違う**という気づきにくい
 * 事故になる（CI が JSON を期待しているのに Markdown が出る）。
 */
function bothFormats(flags: Args["flags"], io: CliIo): boolean {
  if (flags.json === true && flags.markdown === true) {
    io.err("--json と --markdown は同時に使えません（どちらか1つ）。");
    return true;
  }
  return false;
}

/**
 * 変更を画面の言葉で言う。
 *
 * **終了コードは変えない**（変わっていても 0）。ここは読むための道具で、止めるための
 * 道具は `hatake diff`。混ぜると「見え方が変わっただけ」で CI が落ちるようになる。
 */
function explainChanges(
  files: string[],
  flags: Args["flags"],
  io: CliIo,
): number {
  const pair = sourcePair(files, flags, io, "explain --diff");
  if (pair === null) return 1;
  const diff = explainDiffSources(pair.before, pair.after);
  // 変わっていないときに**何も出さない**旗。PR に貼る仕掛けはこれが無いと、
  // 「見え方は変わりません。」という文を grep することになる（文言を直したら壊れる）。
  if (flags["if-changed"] === true && diff.same) return 0;
  if (flags.json === true) {
    io.out(JSON.stringify(diff, null, 2));
    return 0;
  }
  if (flags.markdown === true) {
    // 何と何を比べたかは、貼った先では**本文からしか分からない**。
    if (pair.label !== undefined) io.out(`_${pair.label}_\n`);
    io.out(explainDiffMarkdown(diff));
    return 0;
  }
  if (pair.label !== undefined) io.out(`（${pair.label}）`);
  io.out(renderExplainDiff(diff));
  return 0;
}

/** 比べる2つの定義（ファイル2つ、または `--git` の範囲＋ファイル1つ）。 */
interface SourcePair {
  before: string;
  after: string;
  /** `--git` のときだけ、何と何を比べたか。 */
  label?: string;
}

/**
 * 比べる2つを揃える。
 *
 * `--git` を足したのは、**変更前は git が持っている**から。手で書き出させている限り
 * 「変更のたびに説明が付く」は CI に置けない。
 */
function sourcePair(
  files: string[],
  flags: Args["flags"],
  io: CliIo,
  command: string,
): SourcePair | null {
  const range = str(flags, "git");
  if (range === undefined) {
    if (files.length !== 2) {
      io.err(
        `変更前と変更後の定義ファイルを2つ指定してください` +
          `（git から取るなら ${command} --git HEAD~1..HEAD <file>）。`,
      );
      return null;
    }
    return { before: io.readFile(files[0]), after: io.readFile(files[1]) };
  }
  if (files.length !== 1) {
    io.err("--git を使うときは、定義ファイルを1つだけ指定してください。");
    return null;
  }
  const git = io.git;
  if (git === undefined) {
    io.err("この環境では --git を使えません（git を呼ぶ口がありません）。");
    return null;
  }
  // 先に git そのものを1回叩く。これをしないと、git が無い所での失敗が
  // 「そのリビジョンにファイルが無い」に化けて、直しようのない案内になる。
  try {
    git(["--version"]);
  } catch {
    io.err("git を実行できません（PATH に git がありますか）。");
    return null;
  }
  try {
    return readGitPair(range, files[0], git, (path) => io.readFile(path));
  } catch (error) {
    io.err(error instanceof Error ? error.message : String(error));
    return null;
  }
}

/**
 * 実例カタログの候補を集める。
 *
 * 読めなかった定義があれば**終了コード 1**（`registry` と同じ考え方＝走査が不完全な
 * ことを黙らない）。候補が出たこと自体は失敗ではないので 0。
 */
function harvest(paths: string[], flags: Args["flags"], io: CliIo): number {
  if (paths.length === 0) {
    io.err("走査する定義のファイルかディレクトリを指定してください。");
    return 1;
  }
  // 登録済み一覧は**定義ごと**に探す（複数のアプリをまとめて走査するのが普通の使い方
  // なので、1つの一覧を全部に当てると嘘の候補が出る）。同じ場所は読み直さない。
  const registries = new Map<string, DefinitionRegistry | undefined>();
  const registryFor = (file: string): DefinitionRegistry | undefined => {
    const dir = dirname(file);
    if (!registries.has(dir)) registries.set(dir, loadRegistry(file, flags, io));
    return registries.get(dir);
  };
  const inputs: HarvestInput[] = collectPaths(
    paths,
    io,
    DEFINITION_EXTENSIONS,
  ).map((path) => ({
    file: path,
    source: io.readFile(path),
    registry: registryFor(path),
  }));
  if (inputs.length === 0) {
    io.err(
      `走査できる定義がありません（対象の拡張子: ${DEFINITION_EXTENSIONS.join(" ")}）。`,
    );
    return 1;
  }

  const min = Math.max(1, Number.parseInt(str(flags, "min") ?? "2", 10) || 2);
  const result = harvestFailures(inputs, {
    min,
    repro: flags.repro === true,
    catalog: loadFailures(flags, io),
  });

  if (flags.json === true) {
    io.out(JSON.stringify(result, null, 2));
  } else {
    io.out(renderHarvest(result, min));
  }
  if (result.unreadable.length === 0) return 0;
  io.err(
    `読めなかった定義が ${result.unreadable.length} 件あります（走査は**不完全**です）:`,
  );
  for (const entry of result.unreadable) {
    io.err(`     ${entry.file}  ${entry.reason}`);
  }
  return 1;
}

/**
 * 意味を変えずに定義を短くする。
 *
 * 標準出力に出すのは**定義だけ**（`hatake minimize a.yaml > b.yaml` が使えるように）。
 * 落としたものは標準エラーに出す。黙って短くしないのが要点なので、報告は省けない。
 */
/**
 * 定義から「アプリ側の配線」の下書きを出す。
 *
 * 画面は定義から出るのに、**繋ぐコード**は毎回手書きだった。何を登録すればいいかは
 * 定義に全部書いてある（`refs --needs-registration` が出せる）ので、そこは機械が書く。
 * 中身（業務・環境）は決められないので TODO で空ける。
 */
function wire(files: string[], flags: Args["flags"], io: CliIo): number {
  if (files.length !== 1) {
    io.err("配線を出す定義ファイルを1つ指定してください。");
    return 1;
  }
  const file = files[0];
  const document = parseYamlText(io.readFile(file)) as Record<string, unknown>;
  const source = file.split(/[\/]/).pop() ?? file;
  const into = str(flags, "merge");
  if (into !== undefined) return wireMerge(into, document, flags, io);
  const code = wireApp(document, {
    className: str(flags, "class"),
    assets: str(flags, "assets"),
    baseUrl: str(flags, "base"),
    source,
  });
  const out = str(flags, "out");
  if (out === undefined) {
    io.out(code.trimEnd());
  } else {
    io.writeFile(out, code);
    io.out(`書きました: ${out}`);
  }
  io.err(
    "TODO の所はアプリの担当です（何をするかは業務、どう繋ぐかは環境）。" +
      "埋めるまでは UnimplementedError で落ちます。",
  );
  return 0;
}

/**
 * 既にある配線に、足りない登録だけを足す（`wire --merge <file>`）。
 *
 * 既定は標準出力に出すだけ（`fix` と同じ作法）。`--write` で元のファイルを上書き、
 * `--out` で別の場所へ。何をしたかは標準エラーに出す（**足したものが黙って増える**の
 * が一番困るので、出力とは別の流れに書く）。
 */
function wireMerge(
  into: string,
  document: Record<string, unknown>,
  flags: Args["flags"],
  io: CliIo,
): number {
  const result = mergeWiring(io.readFile(into), document, {
    collections: collectionOverrides(str(flags, "collection")),
  });
  const out = str(flags, "out") ?? (flags.write === true ? into : undefined);
  // 渡す形（`--todo`）のときは、標準出力は**一覧**になる（コードは --write / --out で
  // 書く）。足したコードと渡す一覧を同じ流れに混ぜると、どちらも使えなくなる。
  if (flags.todo === true) {
    if (out !== undefined) io.writeFile(out, result.code);
    const todo = wireTodo(result, out);
    io.out(
      flags.json === true
        ? JSON.stringify(todo, null, 2)
        : renderWireTodo(todo),
    );
    return 0;
  }
  if (flags.json === true) {
    io.out(JSON.stringify(result, null, 2));
    return 0;
  }
  if (out === undefined) {
    io.out(result.code.trimEnd());
  } else if (result.code === io.readFile(into) && out === into) {
    // 足すものが無いなら書かない（日付だけが変わるのを避ける）。
    io.out(`変わりません: ${into}`);
  } else {
    io.writeFile(out, result.code);
    io.out(`書きました: ${out}`);
  }
  io.err(renderWireMerge(result));
  return 0;
}

function minimize(files: string[], flags: Args["flags"], io: CliIo): number {
  if (files.length !== 1) {
    io.err("最小化する定義ファイルを1つ指定してください。");
    return 1;
  }
  const schema = readSpec(flags, io, SCHEMA_FILE);
  if (schema === null) return 1;
  const result = minimizeSource(
    io.readFile(files[0]),
    buildReference(schema as Record<string, unknown>),
  );

  if (flags.json === true) {
    io.out(JSON.stringify(result, null, 2));
    return 0;
  }
  const out = str(flags, "out");
  if (out === undefined) {
    io.out(result.source.trimEnd());
  } else {
    io.writeFile(out, result.source);
    io.out(`書きました: ${out}`);
  }
  io.err(renderMinimize(result));
  return 0;
}

/**
 * 直し方が一意に決まる問題を直す。
 *
 * **既定ではファイルを触らない**（標準出力に出すだけ）。書き換える道具は、見せてから
 * 当てるのが順番。`--write` のときだけ上書きし、何をしたかは必ず標準エラーに出す。
 *
 * 終了コードは「直せなかったものが残っているか」ではなく**直す前に問題があったか**で
 * 決めない: 直したあとに残った問題があれば 1（CI で「まだ人の手が要る」と分かる）。
 */
function fix(files: string[], flags: Args["flags"], io: CliIo): number {
  if (files.length !== 1) {
    io.err("直す定義ファイルを1つ指定してください。");
    return 1;
  }
  const source = io.readFile(files[0]);
  const result = fixSource(source, {
    registry: loadRegistry(files[0], flags, io),
  });

  // 残った仕事を「次の1往復で渡す形」にする。手掛かりは実例カタログから引く
  // （引くのは CLI の仕事＝fix 自身はファイルを読まない）。
  const todo = flags.todo === true ? fixTodo(result, failureHint(flags, io)) : undefined;
  if (flags.json === true) {
    io.out(
      JSON.stringify(todo === undefined ? result : { ...result, todo }, null, 2),
    );
    return result.remaining.length > 0 ? 1 : 0;
  }
  if (todo !== undefined) {
    // 渡す文だけを標準出力に出す（そのまま AI への指示として使える）。
    io.out(renderFixTodo(todo));
    if (flags.write === true && result.applied.length > 0) {
      io.writeFile(files[0], result.source);
      io.err(`書きました: ${files[0]}`);
    }
    return result.remaining.length > 0 ? 1 : 0;
  }
  if (flags.write === true) {
    if (result.applied.length > 0) {
      io.writeFile(files[0], result.source);
      io.out(`書きました: ${files[0]}`);
    } else {
      io.out("書き換えるものはありませんでした。");
    }
  } else {
    io.out(result.source.trimEnd());
  }
  io.err(renderFix(result));
  // 直した所を画面の言葉で言えるなら添える（前後どちらも strict で読めるときだけ）。
  if (result.applied.length > 0) {
    try {
      io.err("");
      io.err(renderExplainDiff(explainDiffSources(source, result.source)));
    } catch {
      io.err(
        "（直す前の定義は strict で読めないので、画面の言葉での差分は出せません）",
      );
    }
  }
  return result.remaining.length > 0 ? 1 : 0;
}

/**
 * 定義に出てくる役割を数える（`explain --roles`）。
 *
 * 終了コードは変えない（**読むための道具**。役割が1つも無いことは間違いではない
 * ＝小さな社内ツールなら権限を書かない）。書き忘れを言うのは advise の担当。
 */
function explainRoles(source: string, flags: Args["flags"], io: CliIo): number {
  // 役割は**定義全体**で数える（1枚に絞ると、メニューに書いた役割が落ちて
  // 「この画面には役割が無い」に見える）。黙って無視せず、そう言って止める。
  if (str(flags, "page") !== undefined) {
    io.err(
      "--roles は定義全体で数えます（--page では絞れません）。" +
        "メニューに書いた役割はどの画面のものでもないので、1枚に絞ると落ちます。",
    );
    return 1;
  }
  const document = parseYamlText(source);
  if (typeof document !== "object" || document === null) {
    io.err("定義（map）として読めません。");
    return 1;
  }
  const raw = document as Record<string, unknown>;
  const inventory = roleInventory(raw);
  if (flags.json === true) {
    io.out(JSON.stringify(inventory, null, 2));
    return 0;
  }
  const access = appAccess(raw);
  io.out(renderRoles(inventory, roleTitleOf(raw), opensByRole(access)));
  return 0;
}

/**
 * 書き足したほうがいい所を挙げる。
 *
 * **終了コードは always 0**。助言で CI を落とすと、助言が「守らせるもの」になって好みを
 * 強制することになる。事実（書いたのに効かない）は `validate` の担当。
 */
function advise(files: string[], flags: Args["flags"], io: CliIo): number {
  if (files.length !== 1) {
    io.err("助言する定義ファイルを1つ指定してください。");
    return 1;
  }
  const source = io.readFile(files[0]);
  const document = parseYamlText(source);
  if (typeof document !== "object" || document === null) {
    io.err("定義（map）として読めません。");
    return 1;
  }
  const rules = loadAdviceRules(flags, io);
  const picks = str(flags, "apply");
  if (picks !== undefined) {
    return applyPicked(files[0], source, picks, rules, flags, io);
  }
  // 下書きも添える（「何を足すか」までは言えても、値で止まるので）。
  const advice = withDrafts(
    document as Record<string, unknown>,
    findAdvice(document as Record<string, unknown>, rules),
  );
  // 物差しが「その場所に書けないキー」を勧めていたら、助言を出す前に止める。
  // 間違いを教える助言は、無いほうがまし。
  if (unwritable(advice, flags, io) > 0) return 1;

  if (flags.json === true) {
    io.out(JSON.stringify(advice, null, 2));
    return 0;
  }
  io.out(renderAdvice(advice, { rulesFrom: str(flags, "rules"), rules }));
  return 0;
}

/**
 * 選んだ助言を当てる（`--apply picks.json`）。
 *
 * 終了コードは**頼んだのに当てられなかったものがあるか**で決める（1件でもあれば 1）。
 * 残っている助言では落とさない＝助言は好みなので、書き足していないこと自体は失敗ではない。
 */
function applyPicked(
  file: string,
  source: string,
  path: string,
  rules: AdviceRules,
  flags: Args["flags"],
  io: CliIo,
): number {
  const given: unknown = JSON.parse(io.readFile(path));
  const picks =
    Array.isArray(given)
      ? given
      : typeof given === "object" && given !== null
        ? (given as { picks?: unknown }).picks
        : undefined;
  if (!Array.isArray(picks) || picks.length === 0) {
    io.err(
      '当てる助言を並べてください（[{ "rule": "money-without-format" }] か ' +
        '{ "picks": [ ... ] } の形）。全部当てる口はありません＝助言は好みなので、' +
        "当てるかどうかは業務の判断です。",
    );
    return 1;
  }
  const result = applyAdvice(source, picks as AdvicePick[], {
    rules,
    registry: loadRegistry(file, flags, io),
  });
  if (flags.json === true) {
    io.out(JSON.stringify(result, null, 2));
    return result.skipped.length > 0 ? 1 : 0;
  }
  if (flags.write === true) {
    if (result.applied.length > 0) {
      io.writeFile(file, result.source);
      io.out(`書きました: ${file}`);
    } else {
      io.out("書き換えるものはありませんでした。");
    }
  } else {
    io.out(result.source.trimEnd());
  }
  io.err(renderAdviceApply(result));
  // 当てた所を画面の言葉で言い直す（道で言われてもレビューできない）。
  if (result.applied.length > 0) {
    const said = describeChange(source, result.source);
    io.err("");
    io.err(
      said ??
        "（当てる前の定義は strict で読めないので、画面の言葉での言い直しは出せません）",
    );
  }
  return result.skipped.length > 0 ? 1 : 0;
}

/**
 * 助言の物差し。`--rules` を渡さなければ組み込みのまま。
 *
 * 読めない物差しは**例外で落とす**（黙って組み込みに戻すと、渡したつもりで効いていない
 * ことに気づけない）。runCli が捕まえて理由を出す。
 */
function loadAdviceRules(flags: Args["flags"], io: CliIo): AdviceRules {
  const path = str(flags, "rules");
  if (path === undefined) return DEFAULT_RULES;
  return parseAdviceRules(JSON.parse(io.readFile(path)));
}

/**
 * 助言が挙げるキーが本当に書けるかを、リファレンス（スキーマ由来）で確かめる。
 *
 * spec/ が無い場所でも助言は使えるべきなので、**リファレンスが無ければ確かめない**
 * （黙って確かめないのではなく、そう言う）。
 */
function unwritable(advice: Advice[], flags: Args["flags"], io: CliIo): number {
  const schema = optionalSpec(flags, io, SCHEMA_FILE);
  if (schema === null) return 0;
  const bad = unwritableAdvice(advice, buildReference(schema as Record<string, unknown>));
  for (const one of bad) {
    io.err(
      `助言 [${one.rule}] は ${one.node} に書けないキー "${one.key}" を勧めています` +
        `（${one.where}）。物差しの node と key を直してください。`,
    );
  }
  return bad.length;
}

/**
 * 助言と説明を1枚にする（レビュー用）。
 *
 * **終了コードは変えない**。1枚にしても助言は助言のままで、止めるための道具ではない。
 */
function review(
  source: string,
  page: string | undefined,
  flags: Args["flags"],
  io: CliIo,
): number {
  const rules = loadAdviceRules(flags, io);
  const document = reviewSource(source, { page, rules });
  if (unwritable(document.advice, flags, io) > 0) return 1;
  if (flags.json === true) {
    io.out(JSON.stringify(document, null, 2));
    return 0;
  }
  const options = { rulesFrom: str(flags, "rules"), rules };
  io.out(
    flags.markdown === true
      ? reviewMarkdown(document, options)
      : renderReview(document, options),
  );
  return 0;
}

/**
 * 画面の索引。
 *
 * 索引は「どこに何があるか」を答えるものなので、**読めない定義があっても作る**（消すと
 * 余計に探せなくなる）。ただし不完全なことは言う＝読めなかった定義があれば終了コード 1。
 */
function screenIndex(paths: string[], flags: Args["flags"], io: CliIo): number {
  if (paths.length === 0) {
    io.err("索引を作る定義のファイルかディレクトリを指定してください。");
    return 1;
  }
  const inputs: IndexInput[] = collectPaths(paths, io, DEFINITION_EXTENSIONS).map(
    (path) => ({ file: path, source: io.readFile(path) }),
  );
  if (inputs.length === 0) {
    io.err(
      `走査できる定義がありません（対象の拡張子: ${DEFINITION_EXTENSIONS.join(" ")}）。`,
    );
    return 1;
  }

  const index = buildIndex(inputs);
  let found = searchIndex(index, str(flags, "find"));
  if (str(flags, "by") === "size") {
    found = [...found].sort((a, b) => sizeOf(b) - sizeOf(a));
  }

  if (str(flags, "out") !== undefined) {
    output(JSON.stringify({ ...index, screens: found }, null, 2), flags, io);
  } else if (flags.json === true) {
    io.out(JSON.stringify({ ...index, screens: found }, null, 2));
  } else {
    io.out(renderIndex(found, { showSize: str(flags, "by") === "size" }));
  }
  if (index.unreadable.length === 0) return 0;
  io.err(`読めなかった定義が ${index.unreadable.length} 件あります（索引は不完全です）:`);
  for (const one of index.unreadable) io.err(`     ${one.file}  ${one.reason}`);
  return 1;
}

/**
 * 図解を描く。
 *
 * 渡されたものが**図の元データ**（`rows` を持つ JSON）ならそれを描き、**定義**なら図を
 * 作ってから描く。同じコマンドで両方受けるのは、資料の図（手書きの元データ）と定義から
 * 作る図で**描画を2本持たない**ため。
 */
function diagram(files: string[], flags: Args["flags"], io: CliIo): number {
  if (files.length !== 1) {
    io.err("図にするファイルを1つ指定してください。");
    return 1;
  }
  const source = io.readFile(files[0]);
  const raw = parseYamlText(source) as Record<string, unknown>;
  let picture;
  if (looksLikeDiagram(raw)) {
    picture = parseDiagram(raw);
  } else if (isAppSource(source)) {
    picture = appDiagram(parseAppSource(source).app, raw, {
      role: str(flags, "role"),
    });
  } else {
    io.err(
      "図にできるのは app: の定義か、図の元データ（rows を持つ JSON）です。" +
        "1枚の画面は hatake explain のほうが読めます。",
    );
    return 1;
  }

  if (flags.json === true) {
    io.out(JSON.stringify(picture, null, 2));
    return 0;
  }
  const svg = renderDiagram(picture);
  const out = str(flags, "out");
  if (out === undefined) {
    io.out(svg.trimEnd());
  } else {
    io.writeFile(out, svg);
    io.out(`書きました: ${out}`);
  }
  return 0;
}

/**
 * 実例のカタログ（あれば）。
 *
 * 無ければ「既に載っている診断か」を見ないだけで、収穫自体は成立する（spec/ を
 * 持たない場所でも走らせたいので、無いことをエラーにしない）。
 */
function loadFailures(
  flags: Args["flags"],
  io: CliIo,
): FailureCatalog | undefined {
  const dir = findSpecDir(str(flags, "spec"));
  if (dir === null) return undefined;
  try {
    return JSON.parse(io.readFile(join(dir, FAILURES_FILE))) as FailureCatalog;
  } catch {
    return undefined;
  }
}

/**
 * アプリの実装から「登録済みのもの」の一覧を作る。
 *
 * 読めなかった登録があれば**終了コード 1**。生成した一覧はそのとき不完全なので、
 * 気づかないまま `--registry` に渡されると「登録してあるのに未登録」という嘘の
 * 警告が出る。出力自体は書く（手で足せるように）。
 */
function registry(files: string[], flags: Args["flags"], io: CliIo): number {
  if (files.length === 0) {
    io.err("ソースのファイルかディレクトリを指定してください。");
    return 1;
  }
  const sources: SourceFile[] = [];
  for (const path of collectPaths(files, io, SCANNABLE_EXTENSIONS)) {
    sources.push({ path, source: io.readFile(path) });
  }
  if (sources.length === 0) {
    io.err(
      `走査できるソースがありません（対象の拡張子: ${SCANNABLE_EXTENSIONS.join(" ")}）。`,
    );
    return 1;
  }

  const scan = scanRegistrations(sources);
  const document = {
    $comment:
      "hatake registry が実装から作った「登録済みのもの」の一覧。手で直さず、再生成すること。" +
      "定義の隣に置くと hatake validate が黙って拾い、定義が要求している名前と突き合わせる。",
    ...scan.registry,
  };

  if (str(flags, "out") !== undefined) {
    // ファイルに書くのは一覧そのもの（読めなかったものは下で人に言う）。
    output(JSON.stringify(document, null, 2), flags, io);
  } else if (flags.json === true) {
    io.out(JSON.stringify({ ...document, unreadable: scan.unreadable }, null, 2));
  } else {
    // 種類ごとに並べ、名前がどこで登録されているかを添える（直しに行けるように）。
    const where = new Map<string, string>();
    for (const site of scan.sites) {
      for (const name of site.names) {
        const key = `${site.kind}/${name}`;
        if (!where.has(key)) where.set(key, `${site.file}:${site.line}`);
      }
    }
    for (const [kind, names] of Object.entries(scan.registry)) {
      io.out(`${kind}:`);
      const width = Math.max(...names.map((name) => name.length));
      for (const name of names) {
        io.out(`  ${name.padEnd(width)}   ${where.get(`${kind}/${name}`) ?? ""}`);
      }
    }
    if (scan.sites.length === 0) io.out("登録は見つかりませんでした。");
  }

  if (scan.unreadable.length === 0) return 0;
  io.err(
    `読めなかった登録が ${scan.unreadable.length} 件あります。` +
      "一覧は**不完全**なので、その分は手で足してください:",
  );
  for (const site of scan.unreadable) {
    io.err(`     ${site.file}:${site.line} (${site.kind}) ${site.reason}`);
  }
  return 1;
}

/**
 * 指定された path を、走査するファイルの一覧に開く。
 *
 * ディレクトリは拡張子で絞る。**ファイルを明示したときは絞らない**（拡張子が違う
 * ものを指されたら、それは読みたいということ）。
 */
function collectPaths(
  paths: string[],
  io: CliIo,
  extensions: string[],
): string[] {
  const found: string[] = [];
  for (const path of paths) {
    const children = io.listFiles(path);
    if (children === null) {
      found.push(path);
      continue;
    }
    found.push(
      ...children.filter((child) =>
        extensions.some((extension) => child.endsWith(extension)),
      ),
    );
  }
  return [...new Set(found)].sort();
}

/** 定義が外に要求しているものを並べる。出力はそのまま --registry に渡せる形。 */
function refs(files: string[], flags: Args["flags"], io: CliIo): number {
  if (files.length === 0) {
    io.err("定義ファイルを指定してください。");
    return 1;
  }
  const collected = files.flatMap((file) => {
    const document = parseYamlText(io.readFile(file));
    return typeof document === "object" && document !== null
      ? collectRefs(document as Record<string, unknown>)
      : [];
  });
  if (flags.filled === true) return filled(files, collected, flags, io);
  if (flags.unused === true) return unused(files, collected, flags, io);
  const grouped =
    flags["needs-registration"] === true
      ? refsNeedingRegistration(collected)
      : groupRefs(collected);

  if (flags.json === true) {
    io.out(JSON.stringify(grouped, null, 2));
    return 0;
  }
  const kinds = Object.keys(grouped);
  if (kinds.length === 0) {
    io.out("外に要求しているものはありません。");
    return 0;
  }
  for (const kind of kinds) {
    const names = grouped[kind as keyof typeof grouped] ?? [];
    io.out(`${kind}:`);
    for (const name of names) {
      const needs = collected.some(
        (r) => r.kind === kind && r.name === name && !r.builtIn,
      );
      io.out(`  ${name}${needs ? "   ← 登録が要る" : ""}`);
    }
  }
  return 0;
}

/**
 * 登録してあるのに、どの定義も使っていないもの（逆向きの突き合わせ）。
 *
 * **終了コードは変えない。** 定義から呼ばれていない登録は、アプリのコードから直接
 * 使っていることがある（画面の外で使う変換など）。事実は言うが、消すかどうかは人が決める。
 *
 * 渡した定義が**全部そろっていること**が前提なので、何件見たかを必ず書く。1枚だけ渡して
 * 「使われていない」と読むのが、この道具で一番やりがちな読み違え。
 */
function unused(
  files: string[],
  collected: DefinitionRef[],
  flags: Args["flags"],
  io: CliIo,
): number {
  const registry = loadRegistry(files[0], flags, io);
  if (registry === undefined) {
    io.err(
      "登録済みの一覧が見つかりません（--registry で渡すか、定義の隣に " +
        `${REGISTRY_FILE} を置いてください。hatake registry で作れます）。`,
    );
    return 1;
  }
  // 落とす旗は、実装を見ていないと置けない（画面の外から直接呼んでいる登録を
  // 「使われていない」と言って落とすのは嘘）。
  if (flags["unused-as-error"] === true && str(flags, "source") === undefined) {
    throw new Error(
      "--unused-as-error には --source <実装のパス> が要ります。" +
        "定義から使われていないことは「消してよい」を意味しません" +
        "（画面の外から直接呼んでいる登録が普通に在ります）。",
    );
  }
  const grouped = unusedRegistrations(registry, collected);
  const names = Object.values(grouped).flatMap((one) => one ?? []);
  // 実装を渡されたら、**登録の外**で名前が書かれているかも見る（画面の外から直接
  // 呼んでいる登録は「消してよい」ではない）。落とす旗はこれが在って初めて置ける。
  const scanned = str(flags, "source") === undefined ? undefined : sources(flags, io);
  const inCode =
    scanned === undefined
      ? {}
      : usesInCode(names, scanned.sources, scanned.scan.sites);
  const dead = names.filter((name) => inCode[name] === undefined);

  if (flags.json === true) {
    io.out(
      JSON.stringify(
        {
          files: files.length,
          unused: grouped,
          ...(scanned === undefined ? {} : { usedInCode: inCode, dead }),
        },
        null,
        2,
      ),
    );
    return failIf(flags, "unused-as-error", scanned !== undefined && dead.length > 0);
  }
  const kinds = Object.keys(grouped);
  if (kinds.length === 0) {
    io.out(`登録はすべて使われています（定義 ${files.length} 件と突き合わせました）。`);
    return 0;
  }
  io.out(`定義 ${files.length} 件のどこからも使われていない登録:`);
  for (const kind of kinds) {
    io.out(`${kind}:`);
    for (const name of grouped[kind as keyof typeof grouped] ?? []) {
      const uses = inCode[name];
      io.out(
        uses === undefined
          ? `  ${name}`
          : `  ${name}   ← コードに名前が書かれています（${uses.join(" / ")}）`,
      );
    }
  }
  io.out("");
  if (scanned === undefined) {
    io.out(
      "※ 渡した定義の中では使われていない、という事実だけです。" +
        "**定義を全部渡していないと嘘になります**（app なら1枚で足ります）。" +
        "アプリのコードから直接使っている登録もあるので、消す前に確かめてください" +
        "（--source <実装のパス> を渡すと、そこも見ます）。",
    );
    return 0;
  }
  io.out(
    `実装 ${scanned.sources.length} ファイルも見ました。` +
      `コードのどこにも名前が無いのは ${dead.length} 件です` +
      "（そこが消す候補。**定義を全部渡していないと嘘になります**）。",
  );
  if (scanned.scan.unreadable.length > 0) {
    io.out(
      `読めなかった登録が ${scanned.scan.unreadable.length} 件あるので、` +
        "その分は消す候補に入れていません。",
    );
  }
  return failIf(flags, "unused-as-error", dead.length > 0);
}

/** `--source` で渡された実装を走査する（`refs --filled` / `--unused` が使う）。 */
function sources(
  flags: Args["flags"],
  io: CliIo,
): { sources: SourceFile[]; scan: RegistryScan } {
  const path = str(flags, "source");
  if (path === undefined) {
    throw new Error(
      "--source <実装のパス> を渡してください（実装を読まないと、埋まったかは言えません）。",
    );
  }
  const found: SourceFile[] = [];
  for (const one of collectPaths([path], io, SCANNABLE_EXTENSIONS)) {
    found.push({ path: one, source: io.readFile(one) });
  }
  if (found.length === 0) {
    throw new Error(
      `走査できるソースがありません（対象の拡張子: ${SCANNABLE_EXTENSIONS.join(" ")}）。`,
    );
  }
  return { sources: found, scan: scanRegistrations(found) };
}

/** 旗が立っていれば落とす（既定は事実を言うだけ＝消す/埋めるかは業務の判断）。 */
const failIf = (flags: Args["flags"], flag: string, bad: boolean): number =>
  flags[flag] === true && bad ? 1 : 0;

/**
 * 要求している登録が**本当に埋まったか**を数える（`refs --filled --source <実装>`）。
 *
 * 足す所までは機械にやらせられるが、埋め忘れは動かして初めて分かる。定義と実装の
 * 両方を読めば出荷前に数えられる。
 */
function filled(
  files: string[],
  collected: DefinitionRef[],
  flags: Args["flags"],
  io: CliIo,
): number {
  const scanned = sources(flags, io);
  const report = filledReport(
    collected,
    scanned.scan,
    scanned.sources.length,
    looseTodos(scanned.sources, scanned.scan.sites),
  );
  io.out(
    flags.json === true
      ? JSON.stringify(report, null, 2)
      : renderFilled(report),
  );
  if (flags.json !== true && report.items.length > 0) {
    const pending = inState(report, "pending").length;
    if (pending > 0) {
      io.err(
        `TODO のまま残っているのが ${pending} 件あります` +
          "（hatake wire --merge --todo で渡した所です）。",
      );
    }
  }
  return failIf(flags, "pending-as-error", hasUnfilled(report));
}

/**
 * 規則名 → 実例カタログの直し方（無ければ undefined）。
 *
 * カタログは「実際にこう書いて、こう言われて、こう直した」の記録なので、**残った仕事の
 * 手掛かりとしてそのまま使える**。spec/ が無い所でも `fix` は動く必要があるので、
 * 読めなければ手掛かり無しで続ける。
 */
function failureHint(
  flags: Args["flags"],
  io: CliIo,
): (rule: string) => string | undefined {
  const catalog = loadFailures(flags, io);
  if (catalog === undefined) return () => undefined;
  return (rule) => {
    const found = catalog.failures.find((failure) =>
      (failure.diagnosis.warnings ?? []).includes(rule),
    );
    if (found === undefined) return undefined;
    return `${found.fix}（実例: hatake failures ${found.id}）`;
  };
}

/**
 * 未知キーに当てはまる「よくある間違い」の助言。
 *
 * 助言は**あれば出すもの**なので、spec/ が無くても読めなくても検証自体は成立させる
 * （`hatake validate` は spec/ を持たない場所でも動く必要がある）。
 */
function hintsFor(error: unknown, flags: Args["flags"], io: CliIo): string[] {
  if (!(error instanceof UnknownKeysError)) return [];
  const dir = findSpecDir(str(flags, "spec"));
  if (dir === null) return [];
  try {
    const catalog = JSON.parse(
      io.readFile(join(dir, PITFALLS_FILE)),
    ) as PitfallCatalog;
    return pitfallsForKeys(
      catalog,
      error.keys.map((k) => k.key),
    ).map((pitfall) => describePitfall(pitfall));
  } catch {
    return [];
  }
}

/** `page:` と `app:` のどちらでも受ける（どちらを渡されるか AI は迷うので）。 */
function parseDefinition(
  source: string,
  file: string,
  options: { strict: boolean },
): { kind: string } {
  if (/^\s*app\s*:/m.test(source)) {
    const app = parseAppYaml(source, options);
    return { kind: `app: ${app.pages.length} ページ` };
  }
  return { kind: parsePageYaml(source, options).kind };
}

/** 生成系はどれも「1ファイル読んで1つの文字列を出す」形。 */
function emit(
  files: string[],
  io: CliIo,
  render: (page: PageDefinition) => string,
): number {
  const page = onePage(files, io);
  if (page === null) return 1;
  io.out(render(page));
  return 0;
}

/**
 * 定義を変えたときの影響範囲。**壊す変更があれば終了コード 1** なので、
 * 「壊すつもりが無い変更」を CI で守れる（壊すときは意図して外す）。
 */
function diff(files: string[], flags: Args["flags"], io: CliIo): number {
  if (bothFormats(flags, io)) return 1;
  const pair = sourcePair(files, flags, io, "diff");
  if (pair === null) return 1;
  // 生成系と同じく常に strict で読む（書き間違いを差分として見せないため）。
  const before = readSource(pair.before, pair.label ?? files[0]);
  const after = readSource(pair.after, files[0]);
  const result = diffDefinitions(before, after);
  const changes =
    flags["api-only"] === true
      ? result.changes.filter((c) => c.area === "api")
      : result.changes;
  // 壊す変更が出ないようにするのが目的なので、終了コードは breaking で決める。
  const failed =
    !result.compatible ||
    (flags["caution-as-error"] === true && !result.quiet);

  if (flags.json === true) {
    io.out(JSON.stringify({ ...result, changes }, null, 2));
    return failed ? 1 : 0;
  }
  if (flags.markdown === true) {
    if (pair.label !== undefined) io.out(`_${pair.label}_\n`);
    io.out(definitionDiffMarkdown(result, changes));
    return failed ? 1 : 0;
  }
  if (changes.length === 0) {
    io.out("変わりません。");
    return 0;
  }
  for (const change of changes) {
    io.out(`${mark(change)} [${change.area}] ${change.path}: ${change.message}`);
  }
  io.out(
    result.compatible
      ? result.quiet
        ? "後方互換です。"
        : "後方互換ですが、**目で見て確かめてほしい変更**があります（上の「要確認」）。"
      : "**後方互換を壊します**（既存の呼び出し側の修正が要ります）。",
  );
  return failed ? 1 : 0;
}

const mark = (change: DefinitionChange): string =>
  change.impact === "breaking"
    ? "✗ 破壊的"
    : change.impact === "caution"
      ? "△ 要確認"
      : "・安全 ";

/**
 * strict で読んで、素の document をそのまま返す。
 *
 * 差分は**書いてあるとおり**を比べたいので、解析後のモデルではなく素の document を
 * 使う（既定値で埋まったものと書いた指定の区別が付かなくなるため）。strict に通すのは
 * 「書き間違いを差分として見せない」ための門番。
 */
function readDocument(file: string, io: CliIo): Record<string, unknown> {
  return readSource(io.readFile(file), file);
}

/** 読んだ文字列から（`--git` は文字列で来るので、ファイル読みとは別にする）。 */
function readSource(source: string, where: string): Record<string, unknown> {
  parseDefinition(source, where, { strict: true });
  return parseYamlText(source) as Record<string, unknown>;
}

/**
 * 帳票を「刷ったらどう見えるか」に開く（文字で）。
 *
 * 刷るのは Dart 版（`hatake_print`）。ここは**読ませるため**に同じ座標を組んで文字に
 * 落とす。列の並び・小計の位置・切れた文字・右寄せは、座標を見れば分かる。
 *
 * 行を渡さなければ**見本の行を作る**（データを用意しないと紙が見られない、では
 * 誰も確かめない）。作った行であることは必ず言う。
 */
function paper(files: string[], flags: Args["flags"], io: CliIo): number {
  if (files.length !== 1) {
    io.err("帳票の定義ファイルを1つ指定してください。");
    return 1;
  }
  const page = reportPageOf(io.readFile(files[0]), str(flags, "page"), io);
  if (page === null) return 1;

  const rowsFile = str(flags, "rows");
  let rows: Record<string, unknown>[];
  if (rowsFile === undefined) {
    rows = sampleRows(page);
  } else {
    const parsed = JSON.parse(io.readFile(rowsFile));
    if (!Array.isArray(parsed)) {
      io.err("--rows には行の配列（JSON）を渡してください。");
      return 1;
    }
    rows = parsed as Record<string, unknown>[];
  }

  const role = str(flags, "role");
  const layout = layoutReport(page, buildReport(page.report, rows), {
    roles: role === undefined ? [] : [role],
    style: printStyle(),
  });

  if (flags.json === true) {
    io.out(JSON.stringify(layout, null, 2));
    return 0;
  }
  const columns = Number.parseInt(str(flags, "columns") ?? "110", 10);
  io.out(renderPaperText(layout, { columns: Number.isNaN(columns) ? 110 : columns }));
  if (rowsFile === undefined) {
    io.err("");
    io.err(
      "※ 行は**見本**です（定義の項目名と型から作ったそれらしい値）。" +
        "本物のデータで見るなら --rows に行の配列（JSON）を渡してください。",
    );
  }
  return 0;
}

/**
 * 帳票のページを1枚取り出す。
 *
 * `app:` なら `--page` で選ぶ。帳票が1枚しか無ければ選ばなくてよい（そこで手間を
 * 取らせる意味がない）。何が在るかまで言って落ちる。
 */
function reportPageOf(
  source: string,
  wanted: string | undefined,
  io: CliIo,
): ReportPageDefinition | null {
  const pages: PageDefinition[] = isAppSource(source)
    ? parseAppSource(source).pages
    : [parsePageYaml(source, { strict: true })];
  const reports = pages.filter(
    (page): page is ReportPageDefinition => page.kind === "report",
  );
  if (reports.length === 0) {
    io.err("帳票（type: report）の定義がありません。");
    return null;
  }
  if (wanted === undefined) {
    if (reports.length === 1) return reports[0];
    io.err(
      `帳票が ${reports.length} 枚あります。--page で選んでください` +
        `（${reports.map((one) => one.id).join(" / ")}）。`,
    );
    return null;
  }
  const found = reports.find((one) => one.id === wanted);
  if (found === undefined) {
    io.err(
      `帳票 "${wanted}" はありません（${reports.map((one) => one.id).join(" / ")}）。`,
    );
    return null;
  }
  return found;
}

function types(files: string[], flags: Args["flags"], io: CliIo): number {
  const lang = str(flags, "lang");
  if (lang !== "ts" && lang !== "java") {
    io.err("--lang ts か --lang java を指定してください。");
    return 1;
  }
  const page = onePage(files, io);
  if (page === null) return 1;
  const spec = deriveDto(page);
  const out = str(flags, "out");

  if (lang === "ts") {
    const source = toTypeScript(spec);
    if (out === undefined) {
      io.out(source);
    } else {
      const path = join(out, `${spec.page}.ts`);
      io.writeFile(path, source);
      io.out(`書きました: ${path}`);
    }
    return 0;
  }

  // Java は 1レコード＝1ファイル（public な型はファイル名と一致しないと通らない）。
  const records = toJavaRecords(spec, { packageName: str(flags, "package") });
  for (const [name, source] of Object.entries(records)) {
    if (out === undefined) {
      io.out(`// ${name}`);
      io.out(source);
    } else {
      const path = join(out, name);
      io.writeFile(path, source);
      io.out(`書きました: ${path}`);
    }
  }
  return 0;
}

function scaffoldCommand(
  positional: string[],
  flags: Args["flags"],
  io: CliIo,
): number {
  const kind = positional[0];
  const id = str(flags, "id");
  const title = str(flags, "title");
  if (kind === undefined || id === undefined || title === undefined) {
    io.err(
      `hatake new <kind> --id <id> --title <title> の形で指定してください` +
        `（kind: ${scaffoldKinds.join(" | ")}）。`,
    );
    return 1;
  }
  const yaml = scaffold(kind, {
    id,
    title,
    repository: str(flags, "repository"),
  });
  const out = str(flags, "out");
  if (out === undefined) {
    io.out(yaml);
  } else {
    io.writeFile(out, yaml);
    io.out(`書きました: ${out}`);
  }
  return 0;
}

/**
 * spec/ の中の1ファイルを、**あれば**読む（無ければ null で、エラーにしない）。
 *
 * spec/ を持たない場所でも動くべき道具（助言・レビュー）が、確かめられるときだけ確かめる
 * ために使う。無いことを黙るのではなく、呼ぶ側が「確かめていない」と言えるようにしている。
 */
function optionalSpec(
  flags: Args["flags"],
  io: CliIo,
  ...names: string[]
): unknown | null {
  const dir = findSpecDir(str(flags, "spec"));
  if (dir === null) return null;
  try {
    return JSON.parse(io.readFile(join(dir, ...names)));
  } catch {
    return null;
  }
}

/** spec/ の中の1ファイルを読む。見つからなければ理由を出して null。 */
function readSpec(
  flags: Args["flags"],
  io: CliIo,
  ...names: string[]
): unknown | null {
  const dir = findSpecDir(str(flags, "spec"));
  if (dir === null) {
    io.err(
      `spec/${SCHEMA_FILE} が見つかりません（--spec <dir> で場所を渡せます）。`,
    );
    return null;
  }
  return JSON.parse(io.readFile(join(dir, ...names)));
}

/**
 * 機械可読な DSL リファレンス。仕様書を読ませる代わりに引かせるためのもの。
 * スキーマから毎回作るので、古い写しを配ることがない。
 */
function reference(
  positional: string[],
  flags: Args["flags"],
  io: CliIo,
): number {
  // 差し込みの一覧（スキーマではなく、埋める側の取り決め）。
  if (flags.placeholders === true) {
    io.out(
      flags.json === true
        ? JSON.stringify({ contexts: PLACEHOLDER_CONTEXTS }, null, 2)
        : renderPlaceholders(PLACEHOLDER_CONTEXTS),
    );
    return 0;
  }
  const schema = readSpec(flags, io, SCHEMA_FILE);
  if (schema === null) return 1;
  let ref = buildReference(schema as Record<string, unknown>);

  const kind = str(flags, "page-kind");
  if (kind !== undefined) {
    const only = filterByPageKind(ref, kind);
    if (only === null) {
      io.err(
        `知らないページ種別 "${kind}" です` +
          `（${ref.pageKinds.map((k) => k.type).join(" | ")}）。`,
      );
      return 1;
    }
    ref = only;
  }

  const name = positional[0];
  if (name === undefined) return output(JSON.stringify(ref, null, 2), flags, io);

  const found = lookupReference(ref, name);
  if (found === null) {
    const suggestion = closestKey(name, [
      ...Object.keys(ref.nodes),
      ...Object.keys(ref.keyIndex),
    ]);
    io.err(
      `"${name}" はリファレンスにありません` +
        `${suggestion === null ? "" : `（${suggestion} の間違い？）`}。`,
    );
    return 1;
  }
  return output(JSON.stringify(found, null, 2), flags, io);
}

/** 例のカタログ。「やりたいこと」で引いて、近い例をコピーしてもらう。 */
function examples(
  positional: string[],
  flags: Args["flags"],
  io: CliIo,
): number {
  const catalog = readSpec(flags, io, ...CATALOG_PATH);
  if (catalog === null) return 1;
  const query = positional[0];
  const found = filterExamples(catalog as ExampleCatalog, query);

  if (flags.json === true) {
    io.out(JSON.stringify(found, null, 2));
    return found.length === 0 ? 1 : 0;
  }
  if (found.length === 0) {
    io.err(`"${query}" に近い例は見つかりませんでした。`);
    return 1;
  }
  for (const example of found) {
    io.out(`${example.file}  [${example.kind}]  ${example.title}`);
    io.out(`    ${example.task}`);
    io.out(`    キー: ${example.keys.join(" ")}`);
  }
  return 0;
}

/** よくある間違いの対照表。書く前に眺めるのと、落ちた後に引くのの両方に使う。 */
/** 実際に転んだ実例。書く前に眺めるのにも、落ちてから引くのにも使う。 */
function failures(
  positional: string[],
  flags: Args["flags"],
  io: CliIo,
): number {
  const catalog = readSpec(flags, io, FAILURES_FILE);
  if (catalog === null) return 1;
  const query = positional[0];
  const found = filterFailures(catalog as FailureCatalog, query);

  if (flags.json === true) {
    io.out(JSON.stringify(found, null, 2));
    return found.length === 0 ? 1 : 0;
  }
  if (found.length === 0) {
    io.err(`"${query}" に近い実例は載っていません。`);
    return 1;
  }
  for (const failure of found) {
    io.out(describeFailure(failure));
    io.out("");
  }
  return 0;
}

function pitfalls(
  positional: string[],
  flags: Args["flags"],
  io: CliIo,
): number {
  const catalog = readSpec(flags, io, PITFALLS_FILE);
  if (catalog === null) return 1;
  const query = positional[0];
  const found = filterPitfalls(catalog as PitfallCatalog, query);

  if (flags.json === true) {
    io.out(JSON.stringify(found, null, 2));
    return found.length === 0 ? 1 : 0;
  }
  if (found.length === 0) {
    io.err(`"${query}" に近い間違いは載っていません。`);
    return 1;
  }
  const lang = str(flags, "lang") === "en" ? "en" : "ja";
  // 見出しも訳す（英語で引いたのに見出しだけ日本語だと読みにくい）。
  const label =
    lang === "en"
      ? { why: "Why", fix: "Fix", good: "Correct form" }
      : { why: "なぜ", fix: "直し方", good: "正しい書き方" };
  for (const pitfall of found) {
    io.out(`✗ ${pitfall.wrong[lang]}`);
    io.out(`  ${label.why}: ${pitfall.why[lang]}`);
    io.out(`  ${label.fix}: ${pitfall.fix[lang]}`);
    io.out(`  ${label.good}:`);
    for (const line of snippet(pitfall.good).split("\n")) io.out(`    ${line}`);
    io.out("");
  }
  return 0;
}

/** `--out` があればファイルへ、無ければ標準出力へ（どちらも末尾は改行1つ）。 */
function output(text: string, flags: Args["flags"], io: CliIo): number {
  const out = str(flags, "out");
  if (out === undefined) {
    io.out(text);
  } else {
    io.writeFile(out, `${text}\n`);
    io.out(`書きました: ${out}`);
  }
  return 0;
}

function onePage(files: string[], io: CliIo): PageDefinition | null {
  if (files.length !== 1) {
    io.err("定義ファイルを1つ指定してください。");
    return null;
  }
  // 生成は「1ページ = 1つの API の形」なので、常に strict で読む。
  return parsePageYaml(io.readFile(files[0]), { strict: true });
}

/** 例外を「1行1問題」に開く。未知キーは全部並べる。 */
function problemLines(error: unknown): string[] {
  if (error instanceof UnknownKeysError) {
    return error.keys.map(describeUnknownKey);
  }
  return [message(error)];
}

function problem(error: unknown): Record<string, unknown> {
  if (error instanceof UnknownKeysError) {
    return { unknownKeys: error.keys };
  }
  if (error instanceof DefinitionParseError) {
    return { error: error.message, path: error.path };
  }
  return { error: message(error) };
}

const message = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

// bin として呼ばれたときだけ走る（テストからは runCli を直接呼ぶ）。
if (process.argv[1]?.endsWith("cli.js")) {
  // `hatake reference | head` のように受け側が先に閉じても、スタックトレースを
  // 吐いて落ちない（JSON を出すコマンドなので、パイプで切るのは普通の使い方）。
  process.stdout.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code !== "EPIPE") throw error;
  });
  // 通信するコマンド（probe / attack）があるので、入口は async 側。
  process.exitCode = await runCliAsync(process.argv.slice(2));
}
