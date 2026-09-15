// 警告の規則そのものの表（`hatake rules` が引く1枚）。
//
// 警告は**1件ごとに**「どこで・何が起きるか」を言う（`warning.message`）。それは在る所の
// 話なので、**規則そのものが何か**は定義を1つ転ばせないと読めなかった。AI から見ると
// 「`groupby-without-sort` と言われた。で、それは何か」を引く先が無い＝仕様書を全文
// 読ませることになる。だから規則の単位で1枚にする（`reference.json` と同じ立ち位置）。
//
// **ここが正**。`fix` は1件ごとの言い方と同じ字なので、[warn] は書かれていなければ
// この表から採る（呼び出し側に同じ字を2つ置かない）。`pitfall` もこの表だけが持つ。
// 1件ごとにしか言えないこと（綴り違いの候補・件数・紙の実寸）は message の側に残る。
//
// **数え落とせない**ようにしてある: 実装が出しうる規則名を機械で数えて、この表と
// **完全一致**することを試験が見る（[rulesCatalog] の試験）。新しい警告を足したら、
// ここに書くまで通らない。消した規則がここに残っていても落ちる。

/** 規則1つの説明。 */
export interface RuleDoc {
  /** 何を見ている規則か（1行の題）。 */
  what: string;
  /** 通してしまうと何が起きるか（規則の単位）。 */
  happens: string;
  /** どう直すか（規則の単位。1件ごとの言い方は `warning.fix`）。 */
  fix: string;
  /** 対照表（`spec/pitfalls.json`）の id。 */
  pitfall?: string;
}

/**
 * 警告の全部。
 *
 * 並びは名前順（引く側は id で引くので、読み物としての並びより探しやすさを採る）。
 */
export const WARNING_RULES: Record<string, RuleDoc> = {
  "aggregate-without-field": {
    what: "畳み込む項目の無い集計",
    happens: "集計が null になります（0 ではないので、画面では空欄に見えます）。",
    fix: "field（チャートなら valueField）を書いてください。count なら field は不要です。",
  },
  "batchsize-above-maxrows": {
    what: "1回で動く上限より大きい区切り",
    happens:
      "区切りが1回で終わるので、**進み具合も中断も出ません**（区切った意味が無くなります）。",
    fix: "区切りを上限より小さくしてください。区切る意味が無いなら `batchSize` を消してください。",
  },
  "batchsize-unknown-role": {
    what: "誰にも当てはまらない役割の区切り",
    happens:
      "その役割はこのボタンを押せない（か、アプリのどこにも出てこない）ので、" +
      "この区切りは効きません＝みんな既定の件数で動きます。",
    fix: "`roles` に足すか、`roles` に書いてある役割名で書いてください。",
  },
  "batchsize-without-selection": {
    what: "一括でないボタンに書いた区切り",
    happens: "区切るものが無いので、何も起きません。",
    fix:
      "`scope: selection` を書いてください（区切りは一括のときだけ効きます）。" +
      "1件ずつのボタンなら、区切りは要りません。",
  },
  "builtin-rowaction-unsupported": {
    what: "その画面では出ない組み込みの行アクション",
    happens:
      "`edit` / `delete` は一覧とフォームを両方持つ画面の機能なので、行には何も出ません。",
    fix:
      "`crud` / `master` の画面に置くか、行から開くボタン（`type: navigate` / " +
      "`type: plugin`）を `actions` に書いて、その id を `rowActions` に並べてください。",
  },
  "columns-wider-than-paper": {
    what: "紙に入らない列幅",
    happens: "刷ると全体が縮められて、どの列も読めなくなります。",
    fix:
      "列の width を減らす・列を減らす・paper.orientation を landscape にする、" +
      "のどれかです（width は紙の上ではポイント＝1/72 inch。画面の px を" +
      "そのまま書くと広すぎます）。",
  },
  "compare-aggregate-without-of": {
    what: "畳む項目の無い項目間の検証",
    happens: "相手の値が null になるので、この検証は**黙って通ります**。",
    fix: "`of: <行の項目名>` を書いてください（`count` だけは要りません）。",
  },
  "compare-bad-operator": {
    what: "大小を比べられない突合の演算子",
    happens: "この検証は何も判定しません（書いたのに効かない検証が残ります）。",
    fix: "大小を比べられる演算子（gt / gte / lt / lte）を書いてください。",
  },
  "compare-unknown-field": {
    what: "同じフォームに無い相手との突合",
    happens: "相手の値が取れないので、この検証は**黙って通ります**。",
    fix: "同じフォームの項目名を書いてください（明細の中なら、その行の項目名）。",
  },
  "compare-where-ignored": {
    what: "畳んでいないのに書いた行の絞り込み（検証）",
    happens: "`where` は効かず、絞られていない値と比べられます。",
    fix:
      "明細を畳んで比べるなら `aggregate: sum` と `of: <行の項目名>` を足して" +
      "ください。1つの項目と比べるだけなら `where` を消してください。",
  },
  "compare-with-itself": {
    what: "自分自身との突合",
    happens: "いつも同じ値なので、判定は変わりません（検証が在っても意味がありません）。",
    fix: "比べたい**別の**項目名を書いてください。",
  },
  "compare-without-field": {
    what: "相手の無い項目間の検証",
    happens: "この検証は何も判定しません。",
    fix: "`field: <相手の項目名>` を書いてください（`operator` の既定は gte）。",
  },
  "compare-where-mode": {
    what: "行に対して判定できないフォームの状態（検証）",
    happens:
      "行には新規/編集の状態が無いので条件は常に false＝**1件も残らず**、0 と比べることになります。",
    fix:
      "行の値で絞ってください（`field` と `operator`）。新規のときだけ効かせたいなら、" +
      "それは行の絞り込みではなく `visibleWhen` / `requiredWhen` の話です。",
  },
  "compare-where-unknown-field": {
    what: "明細の行に無い項目での絞り込み（検証）",
    happens: "条件が当たらないので、1件も数えない値と比べることになります。",
    fix: "行の項目名を書いてください（行に持っているだけで画面に出していない値なら、そのままで合っています）。",
  },
  "computed-aggregate-without-of": {
    what: "畳む項目の無い計算",
    happens: "その計算項目は空欄になります。",
    fix: "`of: <行の項目名>` を書いてください（`count` だけは要りません）。",
  },
  "computed-field-and-fields": {
    what: "明細をまとめる指定と、項目を畳む指定の同居",
    happens: "**`field` が勝つ**ので `fields` は効きません。",
    fix:
      "行をまとめるなら `fields` を消してください。同じレコードの項目を畳むなら " +
      "`field` と `of` を消してください。",
  },
  "computed-of-paged-subtable": {
    what: "ページ送りの明細をまとめる計算",
    happens: "行はここに揃っていないので、結果は 0 になります（画面に出ている行だけの数にもなりません）。",
    fix:
      "全部を足した数が要るなら、サーバ側で計算して1つの項目として返してください" +
      "（画面に出ている行だけを足しても、業務の合計にはなりません）。",
  },
  "computed-of-unknown-field": {
    what: "まとめる相手が無い／明細でない計算",
    happens: "まとめられる行か値が無いので、その計算項目は空欄か 0 になります。",
    fix:
      "同じフォームの明細（`type: subTable`）とその行の項目名を書いてください。" +
      "同じレコードの項目を足すなら `fields: [...]` を使います。",
  },
  "computed-order": {
    what: "後ろに書いた計算項目への依存",
    happens:
      "計算は書いた順に1回なので、依存している値が**空のまま**計算されます（消費税だけ 0 円の伝票が出ます）。",
    fix:
      "依存している計算項目を前に置いてください（小計 → 消費税 → 合計 の順）。" +
      "依存が絡んでいるときは hatake diagram --computed で1枚の絵にできます。",
  },
  "computed-overflow-unused": {
    what: "効かない「切ったぶんを言う文」",
    happens: "行を切らない計算（数を1つにする op・`limit` が無い）では、`overflow` は出ません。",
    fix:
      "`op: join` と `limit` を書いてください（数を畳むときは、切ったことは数から読めません）。",
  },
  "computed-rows-unsupported-op": {
    what: "明細の行をまとめられない op",
    happens: "その計算項目は計算されず、空欄になります。",
    fix: "合計なら `op: sum`、並べて1行にするなら `op: join` です。",
  },
  "computed-self-reference": {
    what: "自分自身を使う計算",
    happens:
      "計算は書いた順に1回なので、いつも1つ前の値（はじめは空）を使うことになります。",
    fix:
      "使うのは別の項目です（前回の値が要るなら、それは計算ではなくレコードに" +
      "持つ値です）。",
  },
  "computed-sort-unknown-field": {
    what: "明細の行に無い項目での並べ替え",
    happens:
      "値が無い行は後ろへ回すので、**全部が「値なし」＝並べ替えは効きません**（行の順のままです）。",
    fix: "行の項目名（`fields` に書いた `field`）を書いてください。",
  },
  "computed-sort-without-field": {
    what: "並べる項目の無い並べ替え",
    happens:
      "並べ替えが効かないので、「上位」に見えて上位ではない値になります。",
    fix:
      "`sort: { field: <行の項目名>, ascending: false }` の形で書いてください" +
      "（`ascending: false` が大きい順）。",
  },
  "computed-sort-without-rows": {
    what: "行を持たない計算に書いた並べ替え・上限",
    happens: "同じレコードの項目を畳む計算には順番も上限も無いので、効きません。",
    fix:
      "行を並べたいなら `field: <明細の項目名>` で明細を畳む形にしてください" +
      "（同じレコードの項目には順番も上限もありません）。",
  },
  "computed-where-ignored": {
    what: "畳んでいないのに書いた行の絞り込み（計算）",
    happens: "`where` は効かず、絞られずに計算されます。",
    fix:
      "行を絞りたいなら `field: <明細の項目名>` で明細を畳む形にしてください。" +
      "レコードの状態で計算を変えたいなら、それは計算ではなく `visibleWhen` の話です。",
  },
  "computed-where-mode": {
    what: "行に対して判定できないフォームの状態（計算）",
    happens:
      "行には新規/編集の状態が無いので条件は常に false＝**1件も残らず**、空欄か 0 になります。",
    fix:
      "行の値で絞ってください（`field` と `operator`）。新規のときだけ効かせたいなら、" +
      "それは行の絞り込みではなく `visibleWhen` / `requiredWhen` の話です。",
  },
  "computed-where-unknown-field": {
    what: "明細の行に無い項目での絞り込み（計算）",
    happens: "条件が当たらないので、1件も数えない値になります。",
    fix: "行の項目名を書いてください（行に持っているだけで画面に出していない値なら、そのままで合っています）。",
  },
  "condition-operator-unsupported": {
    what: "条件が理解しない演算子",
    happens: "常に false になり、その項目は出てきません。",
    fix:
      "条件で使える演算子を書いてください（`between` は検索専用。範囲は `all` ＋ gte/lte で書きます）。",
    pitfall: "between-in-condition",
  },
  "create-action-unusable": {
    what: "一覧の無い画面に置いた新規登録のボタン",
    happens:
      "`type: create` が開くのは**一覧からの新規入力**なので、押しても何も起きません。",
    fix:
      "一覧のある画面（`crud` / `master`）に置くか、`type: navigate` で入力画面へ" +
      "移してください（`form` / `wizard` には保存ボタンが最初から出ます）。",
  },
  "duplicate-action-id": {
    what: "重複したアクション id",
    happens: "id で引くので、後ろの1つは使われません。",
    fix: "どちらかの id を変えてください。",
  },
  "duplicate-field": {
    what: "2回書かれた項目",
    happens: "同じ値を2箇所で編集することになります。",
    fix: "片方を消すか、別の項目名にしてください。",
  },
  "duplicate-page-id": {
    what: "重複したページ id",
    happens: "id でページを引くので、後ろの1枚は開けません。",
    fix: "どちらかの id を変えてください。",
  },
  "enabledwhen-never-true": {
    what: "永久に成り立たない押せる条件",
    happens: "ボタンは出ますが、どうやっても押せません。",
    fix:
      "`all` は全部を満たす条件です。どれか1つでよいなら `any` に、" +
      "どちらかが要らないなら消してください。項目名が違うなら直してください。",
  },
  "enabledwhen-without-record": {
    what: "見るレコードの無い画面での押せる条件",
    happens:
      "その画面のボタンには**いま開いているレコード**が無いので、条件は効きません（ボタンは出て、押せます）。",
    fix:
      "行ごとに出し分けるなら `table.rowActions` に、選んだ行に対してなら " +
      "`scope: selection`。画面全体の話なら、押した先で断るのが筋です。",
  },
  "export-without-rows": {
    what: "表の無い画面に置いた CSV 出力",
    happens: "CSV にするのは**表の行**なので、押しても何も出ません。",
    fix:
      "一覧のある画面に置いてください。入力中の内容を書き出したいなら、それは" +
      "業務の処理なので `type: plugin` です。",
  },
  "groupby-without-sort": {
    what: "並びの決まっていないグループ",
    happens:
      "グループはコントロールブレイクなので、行がその順で届かないとグループが分裂し、小計が何度も出ます。",
    fix: "report.sort に印刷したい並びを書いてください（並べ替えは Repository の責務）。",
    pitfall: "groupby-without-sort",
  },
  "maxrows-above-page-size": {
    what: "1ページの件数より大きい上限",
    happens:
      "選べるのは**画面に出ている行**だけなので、その件数は選べません＝この上限は一度も効きません。",
    fix:
      "上限を1ページの件数以下にするか、`table.pagination.pageSize` を上げてください" +
      "（1回で動く件数を増やすことになるので、上限の意味を先に決めてください）。",
  },
  "maxrows-unknown-role": {
    what: "誰にも当てはまらない役割の上限",
    happens:
      "その役割はこのボタンを押せない（か、アプリのどこにも出てこない）ので、" +
      "この上限は効きません＝みんな既定の上限になります。",
    fix: "`roles` に足すか、`roles` に書いてある役割名で書いてください。",
  },
  "maxrows-without-selection": {
    what: "一括でないボタンに書いた1回の上限",
    happens: "数える対象が無いので、上限は効きません。",
    fix:
      "選んだ行にまとめて実行するなら `scope: selection` を足してください。" +
      "画面全体に対する操作なら `maxRows` を消してください（件数の概念がありません）。",
  },
  "navigate-to-self": {
    what: "自分自身への遷移",
    happens:
      "押すと**同じ画面をもう1枚開く**ので、使う人には何も起きなかったように見えます。",
    fix:
      "行き先（`page:`）を別の画面に直してください。同じ画面を条件だけ変えて" +
      "開きたいなら、遷移ではなく絞り込み（`search.filters`）の仕事です。",
  },
  "open-without-navigate": {
    what: "遷移でないボタンに書いた開き方",
    happens: "開く先が無いので、何も起きません。",
    fix: "`type: navigate`（＋`page`）にするか、`open` を消してください。",
  },
  "open-without-tabs": {
    what: "画面を並べないアプリでの別タブ指定",
    happens: "並べる場所が無いので、いままで通り**同じ画面の続き**として開きます。",
    fix:
      "並べて開くなら `app.navigation: tabs` を書いてください" +
      "（アプリ側で上書きしているなら、そのままで意図どおりです）。",
  },
  "option-when-without-optionsfrom": {
    what: "親の決まっていない選択肢の連動",
    happens:
      "どの項目と連動するのか決まらないので、全部の選択肢がそのまま出ます。",
    fix: "`optionsFrom: <親の項目名>` を足してください。",
  },
  "options-and-optionssource": {
    what: "静的な選択肢と引いてくる選択肢の同居",
    happens: "引いてくる方が勝つので、書いた `options` は出ません。",
    fix: "どちらかにしてください（静的な選択肢だけなら `optionsSource` を消す）。",
  },
  "optionsfrom-unknown-field": {
    what: "その場に無い親項目",
    happens: "親の値が取れないので、`when` 付きの選択肢は出ません。",
    fix: "同じ場所（フォームか検索欄）にある項目名を書いてください（別の場所の項目は見えません）。",
  },
  "optionssource-parentkey-without-optionsfrom": {
    what: "親の決まっていない絞り込みキー",
    happens: "絞り込みに使う親の値が決まらないので、`parentKey` が効きません（全件を引きます）。",
    fix: "`optionsFrom: <親の項目名>` を足してください（親の値が `parentKey` の名前で Repository に渡ります）。",
  },
  "page-nobody-can-open": {
    what: "開ける人が居ない画面",
    happens: "入口はあるのに権限が食い違っていて、**誰もその画面を開けません**。",
    fix: "入口の roles を見直してください（入口側を広げるか、その手前の画面を開ける人に合わせる）。",
  },
  "placeholder-not-filled": {
    what: "埋まらない差し込み",
    happens: "埋める口が無いので、そのまま文字として出ます。",
    fix:
      "書ける差し込みは決まっています（件数は `scope: selection` のボタンだけ、" +
      "失敗の理由は `onError` だけ）。レコードの値は文言に差し込めません。",
  },
  "plugin-without-name": {
    what: "呼ぶ相手の無いプラグインのボタン",
    happens: "`plugin:` が書かれていないので、押しても何も起きません。",
    fix:
      "`plugin: <登録した名前>` を書いてください（アプリ側の ActionRegistry に" +
      "登録する名前。`hatake refs --needs-registration` で一覧が出ます）。",
  },
  "print-without-report": {
    what: "紙の無い画面に置いた印刷ボタン",
    happens: "刷る紙が無いので、押しても何も出ません。",
    fix:
      "帳票の画面（`type: report` ＋ `report:`）に置いてください。" +
      "一覧をファイルに書き出したいなら `type: export`（CSV）です。",
    pitfall: "print-without-report",
  },
  "prompt-unsupported-type": {
    what: "聞いた値を受け取れないボタン",
    happens: "実行前に入力を聞いても、その値は捨てられます。",
    fix:
      "入力を使うなら `type: plugin`（＋`plugin:`）にしてください" +
      "（ハンドラが `ActionContext.input` で受け取ります）。" +
      "聞く必要が無いなら `confirm` です。",
  },
  "readonlywhen-never-true": {
    what: "永久に読み取り専用にならない条件",
    happens:
      "守るつもりだった値が、いつでも編集できます（画面を見ても「編集していい項目」に見えます）。",
    fix:
      "`all` は全部を満たす条件です。どれか1つでよいなら `any` に、" +
      "どちらかが要らないなら消してください。項目名が違うなら直してください。",
  },
  "readonlywhen-with-readonly": {
    what: "常に読み取り専用なのに書いた条件",
    happens: "`readOnly: true` が勝つので、`readOnlyWhen` は効きません。",
    fix: "条件付きにしたいなら `readOnly: true` を消してください。",
  },
  "requiredwhen-never-true": {
    what: "永久に必須にならない条件",
    happens:
      "その項目は空のまま保存できます（必須にしたつもりの値が、あとから空で見つかります）。",
    fix:
      "`all` は全部を満たす条件です。どれか1つでよいなら `any` に、" +
      "どちらかが要らないなら消してください。項目名が違うなら直してください。",
  },
  "required-as-validator-only": {
    what: "オブジェクトでない validators の要素",
    happens: "検証は足されません（書いたのに効かない検証が残ります）。",
    fix: "`- { type: email }` の形で書いてください。",
    pitfall: "required-as-validator-only",
  },
  "requiredwhen-with-required": {
    what: "常に必須なのに書いた条件",
    happens: "`required: true` が勝つので、`requiredWhen` は効きません。",
    fix: "条件付きにしたいなら `required: true` を消してください（両方なら常に必須）。",
  },
  "role-not-in-app": {
    what: "アプリが配らない役割",
    happens:
      "その役割で出し分けている所は**誰にも見えません**（列もボタンも出ません）。" +
      "役割ごとの件数（`maxRows` / `batchSize` の `byRole`）に書いてあるなら、" +
      "その数は誰にも効きません。",
    fix:
      "定義の役割名を、配る役割の名前に合わせてください。配る役割そのものを増やすなら " +
      "`app.roles` に足す（定義1枚で閉じる）か、アプリ側の語彙" +
      "（`HatakeScope(knownRoles:)`）に足します。**アプリ側の綴り違い**のこともあります。",
  },
  "route-param-unknown-field": {
    what: "この画面に無い項目を指す遷移のパラメータ",
    happens:
      "遷移は起きて、**渡る値だけが空**になります＝開いた先が「該当なし」になります。",
    fix: "項目名を直してください（一覧に出していないだけで行が持っている値なら、そのままで合っています）。",
  },
  "row-declaration-unused": {
    what: "行の操作として使われていない宣言",
    happens:
      "`type: edit` / `type: delete` は行の操作の言い方を決める宣言で、`rowActions` に" +
      "並べなければ**どこにも出ません**（画面の上のボタンにもなりません）。",
    fix: "その id を `table.rowActions` に並べてください。要らないなら消してください。",
  },
  "rowaction-not-declared": {
    what: "宣言の無い行アクション",
    happens: "対応する `actions` が無いので、ボタンが黙って出ません。",
    fix:
      "actions に `{ id: …, type: …, label: … }` を足してください" +
      "（組み込みは edit / delete のみ）。",
  },
  "rowactions-as-objects": {
    what: "文字列でない rowActions の要素",
    happens: "行アクションとして扱われません（ボタンが出ません）。",
    fix: "アクション id の文字列を並べてください（実体は actions に書く）。",
    pitfall: "rowactions-as-objects",
  },
  "rows-per-page-too-many": {
    what: "1枚に詰めすぎた行数",
    happens: "1行あたりの高さが足りず、文字がつぶれて刷っても読めません。",
    fix:
      "rowsPerPage を減らしてください（A4 縦なら 30〜40 行が目安）。" +
      "どうしても載せたいなら、大きい紙か横向きにします。",
  },
  "selection-as-rowaction": {
    what: "行に並べた一括ボタン",
    happens:
      "押した行ではなくチェックした行に実行することになるので、行には出ず一覧の上に出ます。",
    fix:
      "`table.rowActions` からこの id を外してください（一覧の上に出ます）。" +
      "押した行1件に実行するボタンにするなら `scope: selection` を外してください" +
      "（行のボタンはその行のレコードを受け取ります）。",
  },
  "selection-unsupported-type": {
    what: "選んだ行に対して実行できない型",
    happens: "画面全体の操作なので、押しても実行されません。",
    fix:
      "一括の中身は業務なので `type: plugin`（＋`plugin:`）で書き、" +
      "選んだ行はハンドラが受け取ってください。",
    pitfall: "bulk-delete",
  },
  "selection-without-table": {
    what: "表の無い画面に置いた一括ボタン",
    happens: "選ぶ手段が無いので、押せないままになります。",
    fix:
      "一覧のある画面（`search` / `crud` / `master`）に置くか、`scope` を外して" +
      "画面全体に対する操作にしてください。",
  },
  "sink-not-declared": {
    what: "出す口が1つも登録されていない",
    happens:
      "Framework は中身（CSV の文字列・紙の中身）までしか作らないので、" +
      "**ボタンは出るのに何も起きません**。",
    fix:
      "`HatakeScope` に `exportSink` / `printSink` を渡してください" +
      "（何も起きないボタンは、押した人には壊れて見えます）。",
  },
  "total-without-column": {
    what: "列に無い項目の合計",
    happens: "合計は列の下に出るので、どこにも表示されません。",
    fix: "その項目を table.columns に足すか、列にある項目で合計してください。",
  },
  "unique-on-paged-subtable": {
    what: "ページ送りの明細に書いた重なりの検証",
    happens: "行がここに揃っていないので、この検証は**黙って通ります**。",
    fix:
      "全部の行で重なりを見るなら、サーバ側で見てください（画面に出ている行だけを" +
      "見ても、重なっていないとは言えません）。",
  },
  "unique-unknown-field": {
    what: "明細の行に無い項目の重なり",
    happens: "どの行も値が取れないので、この検証は**黙って通ります**。",
    fix: "行の項目名（`fields` に書いた `field`）を書いてください。",
  },
  "unique-without-of": {
    what: "見る項目の無い重なりの検証",
    happens: "この検証は何も判定しません。",
    fix: "`of: <行の項目名>` を書いてください（例: `{ type: unique, of: item }`）。",
  },
  "unique-without-subtable": {
    what: "明細でない項目に書いた重なりの検証",
    happens: "見る行が無いので、この検証は**黙って通ります**。",
    fix:
      "明細の項目に書いてください（1つの値が他と重ならないことは、画面の中だけでは" +
      "決められません＝サーバの仕事です）。",
  },
  "visiblewhen-never-true": {
    what: "永久に成り立たない出し分けの条件",
    happens:
      "その項目は**永久に出ません**（入力欄が無いのと同じ）。画面を見ても「そういう仕様」に" +
      "見えるので、いちばん気づきにくい形です。",
    fix:
      "`all` は全部を満たす条件です。どれか1つでよいなら `any` に、" +
      "どちらかが要らないなら消してください。項目名が違うなら直してください。",
  },
  "unknown-action": {
    what: "カードが指す存在しないアクション",
    happens: "押しても何も起きません。",
    fix: "actions に足すか、既にある id に直してください。",
  },
  "unknown-action-type": {
    what: "知らないアクションの型",
    happens: "押しても何も起きません。",
    fix: "組み込みの型か `type: plugin`（＋`plugin:`）を使ってください。",
  },
  "unknown-aggregate": {
    what: "登録されていない集約",
    happens: "集計されず、値が空になります。",
    fix: "`AggregateRegistry` に登録するか、組み込みの集約を使ってください。",
  },
  "unknown-chart-kind": {
    what: "知らないグラフの種類",
    happens: "グラフが描かれません。",
    fix: "組み込みの種類を使うか、登録済み一覧に足してください。",
  },
  "unknown-column-type": {
    what: "知らない列の型",
    happens: "組み込みでも登録済みでもないので、素の文字列として出ます。",
    fix: "組み込みの列型を使うか、登録済み一覧に足してください。",
  },
  "unknown-computed-op": {
    what: "登録されていない計算の op",
    happens: "計算されず、その項目が空になります。",
    fix: "`ComputedRegistry` に登録するか、組み込みの op を使ってください。",
  },
  "unknown-converter": {
    what: "登録されていないコンバータ",
    happens: "その正規化は**黙って行われません**（全角のまま保存されます）。",
    fix: "`ConverterRegistry` に登録するか、組み込みの名前を使ってください。",
  },
  "unknown-dashboard-item-type": {
    what: "知らないカードの型",
    happens: "そのカードは出ません。",
    fix: "`dashboardItemBuilders` に登録するか、組み込みの型を使ってください。",
  },
  "unknown-field-type": {
    what: "知らない項目の型",
    happens: "組み込みでも登録済みでもないので、ただのテキスト入力になります。",
    fix: "`fieldBuilders` に登録するか、組み込みの型を使ってください。",
  },
  "unknown-formatter": {
    what: "登録されていないフォーマッタ",
    happens: "整形されず、素の値がそのまま出ます。",
    fix: "`FormatterRegistry` に登録するか、組み込みの名前を使ってください。",
  },
  "unknown-home": {
    what: "当たらない初期ルート",
    happens: "指したメニュー項目もページも無いので、先頭のページが開きます。",
    fix: "menu の id か pages の id を書いてください。",
  },
  "unknown-navigation": {
    what: "知らない画面の開き方",
    happens: "黙って `single`（1画面ずつ）になります。",
    fix: "書けるのは single / tabs です。",
  },
  "unknown-open": {
    what: "知らないボタンの開き方",
    happens: "黙って `same`（いまの画面の続き）になります。",
    fix: "書けるのは same / tab です。",
  },
  "unknown-page": {
    what: "存在しないページへの遷移",
    happens: "メニューから選んでも、ボタンを押しても、何も出ません。",
    fix: "pages に定義するか、既にある id に直してください。",
  },
  "unknown-page-ref": {
    what: "登録されていないページ",
    happens: "遷移しても開けません。",
    fix: "そのページを `app.pages` に足すか、id を直してください。",
  },
  "unknown-paper-size": {
    what: "組み込みでない紙の名前",
    happens:
      "刷る側が知らない紙は **A4 として刷られます**＝書いたつもりの大きさになりません" +
      "（列が溢れても、刷るまで分かりません）。",
    fix:
      "組み込みの紙（A4 / A3 / B5 / letter）にするか、Renderer がその紙を" +
      "知っていることを確かめてください。",
  },
  "unknown-plugin": {
    what: "登録されていないプラグイン",
    happens: "ボタンは出ますが、押しても何も起きません。",
    fix: "アプリ側のアクション登録に同じ名前で足すか、定義の名前を直してください。",
  },
  "unknown-repository": {
    what: "登録されていない Repository",
    happens: "画面は出ますがデータが来ません（実行時に引き先が見つからない）。",
    fix: "アプリ側の `RepositoryRegistry` に同じ名前で登録するか、定義の名前を直してください。",
  },
  "unknown-validator": {
    what: "登録されていないバリデータ",
    happens: "その検証は**黙って行われません**（今まで弾いていた値が通ります）。",
    fix: "`ValidatorRegistry` に登録するか、組み込みの型を使ってください。",
  },
  "unregistered-sink": {
    what: "登録されていない出力先",
    happens: "ボタンは出ますが、押すと「出力先が未登録です」と言われます。",
    fix:
      "`HatakeScope` に登録してください（CSV は `exportSink`、印刷は `printSink`）。" +
      "Framework は文書までを作り、ファイルを書く・刷るのはアプリの担当です。",
  },
};

/**
 * 助言の規則そのものの表。
 *
 * 助言も1件ごとに「どこで・何が足りないか」を言う（`advice.says` / `advice.add`）ので、
 * **規則そのものが何か**は同じように引けなかった。鍵は [BUILTIN_RULES] と**完全に同じ**
 * であることを試験が見る（つまみの表と説明の表は別々に持つが、鍵は1つ）。
 *
 * `happens` は警告と言い方を変えてある ── 助言は「書いていないから不便かもしれない」で
 * あって、**事実ではない**。「〜になります」ではなく「〜ことがあります」で書く。
 */
export const ADVICE_RULES: Record<string, RuleDoc> = {
  "no-sortable-column": {
    what: "並べ替えできる列が1つも無い一覧",
    happens:
      "件数が増えると目当ての行を探せなくなります（現場は「日付の新しい順」で見ます）。",
    fix: "よく見る列に `sortable: true` を書いてください。",
  },
  "no-search-filter": {
    what: "絞り込みの無い一覧",
    happens: "全件から目で探すことになります。",
    fix: "`search.filters` に、現場が口にする条件（受注番号・顧客名・日付）を足してください。",
  },
  "key-not-in-table": {
    what: "1件を指すキーが一覧に出ていない",
    happens:
      "行を見てもどのレコードか分からないので、電話で「どれですか」が始まります。",
    fix: "一覧に `{ field: <key>, label: … }` を足してください。",
  },
  "no-required-field": {
    what: "保存する画面に必須が1つも無い",
    happens: "空のレコードが保存できます（あとから誰も直せない行が増えます）。",
    fix: "業務として無いと困る項目に `required: true` を書いてください。",
  },
  "open-dangerous-action": {
    what: "誰でも押せる危ないボタン",
    happens: "消す・持ち出すが**全員に見えます**（消したものは戻りません）。",
    fix: "`roles` で見える人を決めてください（権限はアプリ側の判定と合わせて二重にかける）。",
  },
  "bulk-without-confirm": {
    what: "確認の無い一括",
    happens: "1回の押し間違いが件数ぶん動きます。",
    fix: "`confirm: { message: … }` を書いてください（`prompt` を書いてあれば、その OK が確認です）。",
  },
  "bulk-confirm-without-count": {
    what: "何件動くのかを言わない確認",
    happens: "押す人は何件に効くのか分からないまま OK を押します。",
    fix: "確認の文に `{count}` を入れてください（一括では選んだ件数が入ります）。",
  },
  "bulk-without-error-message": {
    what: "失敗の言い方が無い一括",
    happens:
      "一括は**途中まで進んで終わる**ので、何が起きたのかを業務の言葉で言えません。",
    fix: "`onError: { message: '{count} 件を…（{failed} 件は…）' }` を書いてください。",
  },
  "bulk-destructive-without-danger": {
    what: "戻せない一括なのに赤くない確認",
    happens: "普通の OK に見えるので、確かめずに押されることがあります。",
    fix: "`confirm: { danger: true }` を書いてください（`type: delete` は既定で赤くなります）。",
  },
  "bulk-on-many-rows": {
    what: "1回で動く件数が決まっていない一括",
    happens: "選んだぶん全部が動きます（1画面ぶん選べば、その件数がそのまま走ります）。",
    fix: "`maxRows` で1回の上限を決めてください（役割ごとに変えるなら `byRole`）。",
  },
  "bulk-without-batchsize": {
    what: "区切りの無い、待たせる一括",
    happens:
      "終わるまで画面が止まり、進み具合も出ず、途中で止めることもできません。",
    fix: "`batchSize` を書いてください（区切るたびに進み具合が出て、止められます）。",
  },
  "too-many-row-actions": {
    what: "行に並べすぎたボタン",
    happens: "狭い画面では押し間違えます（隣のボタンが「削除」のことがあります）。",
    fix:
      "行に残すのは1〜2個にして、残りは行から開いた先か、選んだ行への一括に移してください。",
  },
  "destructive-without-confirm": {
    what: "押す前に何も聞かない、戻せないボタン",
    happens: "押し間違えると戻せません（一括は別の規則が見ています）。",
    fix: "`confirm: { message: …, danger: true }` を書いてください。",
  },
  "prompt-field-without-required": {
    what: "聞くのに必須が1つも無い",
    happens: "空欄のまま OK を押せるので、記録には空が残ります。",
    fix:
      "聞く意味のある項目に `required: true`。最低の長さが要るなら " +
      "`validators: [{ type: minLength, value: 10 }]`。",
  },
  "prompt-without-success-message": {
    what: "聞くだけ聞いて、終わったことを言わないボタン",
    happens:
      "入れた人は、その値が効いたのかどうか画面から分かりません（同じ操作を2回する元になります）。",
    fix: "`onSuccess: { message: '…しました' }` を書いてください。",
  },
  "error-without-failed-keys": {
    what: "件数だけの失敗の言い方",
    happens: "どの行が落ちたのかが分からないので、やり直す相手を人が探すことになります。",
    fix:
      "失敗の文言に `{failedKeys}` を足してください（**アプリ側が行を名指しで返したときだけ**埋まります）。",
  },
  "money-without-format": {
    what: "見せ方の無い金額らしい列",
    happens: "桁区切りが無いと読み違えます（1000000 と 100000 は見分けが付きません）。",
    fix: "`format: { type: currency }` を書いてください。",
  },
  "subtable-without-parent-key": {
    what: "親を指すキーの無い明細",
    happens: "別のテーブルに持つ明細を、どの親の行か決めずに引くことになります。",
    fix: "`source.parentKey` に、親のどの値で引くかを書いてください。",
  },
  "report-without-totals": {
    what: "合計の無い帳票",
    happens: "紙にした人が電卓を叩くことになります。",
    fix: "`report.totals` に、合計したい列を書いてください。",
  },
  "dates-without-compare": {
    what: "向きを縛っていない期間",
    happens: "「開始 > 終了」で保存できるので、その条件では1件も出ない行ができます。",
    fix:
      "終了側に `validators: [{ type: compare, field: <開始>, operator: gte }]` を書いてください。",
  },
  "total-without-compare": {
    what: "明細の和と突き合わせていない合計",
    happens: "手で入れた合計と明細がずれたまま保存できます。",
    fix:
      "合計の項目に `validators: [{ type: compare, field: <明細>, aggregate: sum, of: <行の項目>, operator: equals }]` を書いてください。",
  },
};
