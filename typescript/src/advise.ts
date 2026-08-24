// 「書き足したほうがいい所」を挙げる。
//
// [minimizeSource] は**書きすぎ**を直す。しかし業務システムで多いのは書きすぎより
// **書き足りない**（並べ替えできない一覧・絞り込みの無い一覧・誰でも消せる画面）。書いて
// いないから困る所は、警告にもスキーマにも出ない。書いていないものは検査できないので。
//
// これは**警告ではなく助言**。この2つは絶対に混ぜない:
//   ・警告 … 書いたのに効かない。事実なので、CI で落としてよい
//   ・助言 … 書いていないから不便かもしれない。**好み**なので、CI で落としてはいけない
// 混ぜると警告の信頼が落ちる（「hatake は好みを押し付ける」になった時点で誰も読まない）。
//
// 嘘をつかないための決めごと: 助言が「これを足せ」と言うキーは、**その場所に本当に書ける
// キー**であること。スキーマから作ったリファレンスで確かめる（試験でも見ている）。名前から
// 推測している助言（「金額らしいのに桁区切りが無い」）には `guess` を立てて、推測だと言う。
//
// 何を言うかは**外から変えられる**（[AdviceRules]）。好みなので、案件ごとの決めごとを
// 渡せないと「合わないから使わない」になる。渡せるのは「切る・目盛りを変える・足す」の3つ。

import { ActionScopes } from "./definition.js";
import { checkCompare } from "./adviseCompare.js";
import { checkRequired } from "./adviseRequire.js";
import { type AdviceRules, DEFAULT_RULES, enabled, knob } from "./adviseRules.js";
import { type DslReference } from "./reference.js";

type Dict = Record<string, unknown>;

const isDict = (v: unknown): v is Dict =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const str = (v: unknown): string | undefined =>
  typeof v === "string" ? v : undefined;

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const dicts = (v: unknown): Dict[] => list(v).filter(isDict);

/** 助言1件。 */
export interface Advice {
  /** 規則名（安定した識別子）。 */
  rule: string;
  /** どの画面の話か（app の中の1枚に絞って読むため）。 */
  page?: string;
  /** 場所（警告と同じ道の書き方）。 */
  where: string;
  /** 何が不便か。 */
  says: string;
  /** 何を書き足すか。 */
  add: string;
  /** 足すキー（その場所に本当に書けるかを確かめるため）。 */
  key: string;
  /** そのキーを書くノード名（リファレンスの名前）。 */
  node: string;
  /** true = 名前から推測している（外れることがある）。 */
  guess?: boolean;
}

/** 保存する画面。ここでしか「必須が無い」は言わない（照会に必須は無関係）。 */
const WRITES = new Set(["crud", "master", "form", "wizard"]);

/** 金額らしい名前（桁区切りが無いと読めない列を拾うための、名前による推測）。 */
const MONEY_WORDS = [
  "amount",
  "price",
  "total",
  "cost",
  "fee",
  "salary",
  "金額",
  "価格",
  "単価",
  "合計",
  "税",
  "料金",
];

/**
 * 戻せない操作らしい名前（一括の確認を赤くしておきたい所を拾うための、名前による推測）。
 *
 * 型が `delete` なら Renderer が既定で赤くするので、ここで拾うのは**プラグインの一括**
 * （`type: plugin` で消す・戻せないことをする）だけ。
 */
const DESTRUCTIVE_WORDS = [
  "delete",
  "remove",
  "purge",
  "discard",
  "reject",
  "cancel",
  "削除",
  "取消",
  "破棄",
  "却下",
  "廃止",
];

/**
 * 1回の上限が**誰かに効いている**か。
 *
 * 数を書いてあれば効いている。役割ごとの形は、既定も役割も全部 `all` なら誰にも
 * 効いていない＝書いていないのと同じなので、助言する側では「無い」と数える。
 */
function hasRowLimit(raw: unknown): boolean {
  if (typeof raw === "number") return true;
  if (!isDict(raw)) return false;
  const values = [raw.default, ...Object.values(isDict(raw.byRole) ? raw.byRole : {})];
  return values.some((one) => typeof one === "number");
}

/**
 * 助言を集める。素の document を見る（既定値で埋まった姿ではなく、**書いてあるもの**を
 * 見たいので）。
 *
 * [rules] を渡すと物差しが変わる（規則を切る・目盛りを変える・案件の決めごとを足す）。
 * 渡さなければ組み込みの規則を既定の目盛りで全部使う。
 */
export function findAdvice(
  document: Dict,
  rules: AdviceRules = DEFAULT_RULES,
): Advice[] {
  const found: Advice[] = [];
  const app = isDict(document.app) ? document.app : undefined;
  if (app !== undefined) {
    dicts(app.pages).forEach((page, i) =>
      checkPage(page, `app.pages[${i}]`, found, rules),
    );
  }
  if (isDict(document.page)) checkPage(document.page, "page", found, rules);
  return found;
}

function checkPage(page: Dict, path: string, found: Advice[], rules: AdviceRules): void {
  const from = found.length;
  checkBuiltins(page, path, found, rules);
  checkCompare(page, path, formFields(page), found, rules);
  checkRequired(page, path, found, rules);
  // どの画面の話かを添える（app の1枚だけ読むときに絞れるように）。場所の道からも読めるが、
  // 道は「何番目のページか」しか言わないので、id で引けるほうが使える。
  const id = str(page.id);
  if (id !== undefined) {
    for (let at = from; at < found.length; at++) found[at].page = id;
  }
}

function checkBuiltins(
  page: Dict,
  path: string,
  found: Advice[],
  rules: AdviceRules,
): void {
  const kind = str(page.type) ?? "";
  const table = isDict(page.table) ? page.table : undefined;
  const columns = table === undefined ? [] : dicts(table.columns);
  const search = isDict(page.search) ? page.search : undefined;
  const filters = search === undefined ? [] : dicts(search.filters);
  const actions = dicts(page.actions);
  const fields = formFields(page);

  // 一覧はあるのに、並べ替えできる列が1つも無い。
  // 帳票では言わない（印字順は report.sort が決めるので、画面の並べ替えは無い）。
  if (
    enabled(rules, "no-sortable-column") &&
    kind !== "report" &&
    columns.length >= knob(rules, "no-sortable-column", "minColumns", 3) &&
    !columns.some((column) => column.sortable === true)
  ) {
    found.push({
      rule: "no-sortable-column",
      where: `${path}.table.columns`,
      says: `列が ${columns.length} 本あるのに、並べ替えできる列が1つもありません。`,
      add: "よく並べ替える列に `sortable: true`（日付・金額・コードあたり）。",
      key: "sortable",
      node: "column",
    });
  }

  // 一覧はあるのに、絞り込みが1つも無い（件数が増えると使えなくなる）。
  if (
    enabled(rules, "no-search-filter") &&
    columns.length >= knob(rules, "no-search-filter", "minColumns", 1) &&
    filters.length === 0 &&
    kind !== "report"
  ) {
    found.push({
      rule: "no-search-filter",
      where: `${path}.search`,
      says: "絞り込みが無いので、一覧は毎回全件から始まります。件数が増えると使えません。",
      add: "`search.filters` に、現場が必ず使う条件（コード・名称・日付の範囲）。",
      key: "filters",
      node: "search",
    });
  }

  // 1件を指すキーが一覧に出ていない（行を見ても、どのレコードか分からない）。
  const key = str(page.key);
  if (
    enabled(rules, "key-not-in-table") &&
    key !== undefined &&
    columns.length > 0 &&
    !columns.some((column) => str(column.field) === key)
  ) {
    found.push({
      rule: "key-not-in-table",
      where: `${path}.table.columns`,
      says: `1件を指すキー "${key}" が一覧に出ていないので、行を見てもどのレコードか分かりません。`,
      add: `一覧に \`{ field: ${key}, label: … }\` を足す（現場は id を見て電話で話します）。`,
      key: "columns",
      node: "table",
    });
  }

  // 入力できるのに、必須が1つも無い。
  // 照会（detail）では言わない。項目は並んでいるが、そこから保存はしない。
  if (
    enabled(rules, "no-required-field") &&
    WRITES.has(kind) &&
    fields.length > 0 &&
    !fields.some((f) => f.required === true)
  ) {
    const conditional = fields.some((field) => field.requiredWhen !== undefined);
    if (!conditional) {
      found.push({
        rule: "no-required-field",
        where: `${path}.form`,
        says: "必須の項目が1つも無いので、空のまま保存できます。",
        add: "本当に必須の項目に `required: true`（条件つきなら `requiredWhen`）。",
        key: "required",
        node: "field",
      });
    }
  }

  // 消せる・持ち出せるのに、誰に見えるかを決めていない。
  const dangerous: string[] = knob(rules, "open-dangerous-action", "types", [
    "delete",
    "export",
    // 紙も持ち出しの口（画面の外に出たものは取り戻せない）。
    "print",
  ]);
  for (const [index, action] of actions.entries()) {
    const type = str(action.type) ?? "";
    const bulk = str(action.scope) === ActionScopes.selection;
    if (!enabled(rules, "open-dangerous-action")) break;
    // 一括は型に関わらず危ない側（1回の操作が件数ぶん動く）。
    if (!dangerous.includes(type) && !bulk) continue;
    if (list(action.roles).length > 0) continue;
    found.push({
      rule: "open-dangerous-action",
      where: `${path}.actions[${index}].roles`,
      says:
        `「${str(action.label) ?? action.id}」は誰でも押せます` +
        (bulk
          ? "（選んだ行にまとめて実行できます）。"
          : type === "delete"
            ? "（消したものは戻りません）。"
            : type === "export"
              ? "（データを持ち出せます）。"
              : type === "print"
                ? "（紙で持ち出せます）。"
                : "。"),
      add: "`roles` で見える人を決める（権限はアプリ側の判定と合わせて二重にかける）。",
      key: "roles",
      node: "action",
    });
  }

  // ── ここから「危ない一括」──────────────────────────────────────
  //
  // 助言は好みの話だが、**一括だけは既定で厳しくていい**。1件ずつなら「押し間違えた」で
  // 済むのに、一括は**1回の操作が件数ぶん動く**（しかも途中まで進んで終わる）。
  const bulkActions = actions
    .map((action, index) => ({ action, index }))
    .filter(({ action }) => str(action.scope) === ActionScopes.selection);
  const labelOf = (action: Dict): string =>
    str(action.label) ?? str(action.id) ?? "ボタン";

  // まとめて実行するのに、押す前の確認が無い。
  //
  // `confirm` は1行で足せるうえ、押し間違いを最後に止められる唯一の関門。
  // ただし `prompt` を書いてあるなら**その OK が確認そのもの**（ダイアログは1枚しか
  // 出ない）ので、聞いている＝止められる側として数える。
  for (const { action, index } of bulkActions) {
    if (!enabled(rules, "bulk-without-confirm")) break;
    if (isDict(action.confirm) || isDict(action.prompt)) continue;
    found.push({
      rule: "bulk-without-confirm",
      where: `${path}.actions[${index}].confirm`,
      says:
        `「${labelOf(action)}」は選んだ行にまとめて実行しますが、` +
        `確認を出しません。押し間違いが件数ぶん効きます。`,
      add: "`confirm: { message: … }`（何件に何をするのかを書く）。",
      key: "confirm",
      node: "action",
    });
  }

  // 確認は出すのに、**何件動くのか**を言っていない。
  //
  // ボタンには件数が出る（「一括承認（3 件）」）。しかし確認のダイアログはその上に
  // かぶるので、**最後に読む文には数が無い**。`{count}` は一括の確認で埋まる
  // （押す前に選んだ数は分かっている）ので、書けば数が出る。
  for (const { action, index } of bulkActions) {
    if (!enabled(rules, "bulk-confirm-without-count")) break;
    const prompt = isDict(action.prompt) ? action.prompt : undefined;
    const confirm = isDict(action.confirm) ? action.confirm : undefined;
    // 聞く形（prompt）の見出しも「押す前に読む文」。confirm と prompt.title の
    // どちらに書いてあってもよい（prompt に message は無い＝中身は聞く項目）。
    const shown = [str(confirm?.message), str(confirm?.title), str(prompt?.title)]
      .filter((text): text is string => text !== undefined);
    if (shown.length === 0) continue; // 確認そのものが無い＝上の規則の話
    if (shown.some((text) => text.includes("{count}"))) continue;
    found.push({
      rule: "bulk-confirm-without-count",
      where: `${path}.actions[${index}].confirm`,
      says:
        `「${labelOf(action)}」の確認に件数がありません。ボタンには件数が出ますが、` +
        `**最後に読む確認の文**には出ないので、3件のつもりが30件でも同じ文が出ます。`,
      add: "確認の文に `{count}`（`{count}` 件を承認します）。一括のときだけ埋まります。",
      key: "confirm",
      node: "action",
    });
  }

  // 一括なのに、失敗したときの言い方が無い。
  //
  // 一括は**途中まで進んで終わる**（100件のうち3件だけ失敗する）のが普通で、これは
  // 1件ずつのボタンには無い話。Renderer の既定でも件数は出るが、業務の言葉では出ない。
  for (const { action, index } of bulkActions) {
    if (!enabled(rules, "bulk-without-error-message")) break;
    if (isDict(action.onError)) continue;
    found.push({
      rule: "bulk-without-error-message",
      where: `${path}.actions[${index}].onError`,
      says:
        `「${labelOf(action)}」は一括ですが、失敗したときの言い方がありません。` +
        `一括は**途中まで進んで終わる**（何件かだけ失敗する）ので、` +
        `何が起きたのかを業務の言葉で言えません。`,
      add:
        "`onError: { message: '{count} 件を…（{failed} 件は…）' }`" +
        "（`{count}` / `{failed}` / `{total}` は一括で埋まります）。",
      key: "onError",
      node: "action",
    });
  }

  // 消す側の一括なのに、確認の OK が普通のボタンに見える。
  //
  // `type: delete` は Renderer が既定で赤くする。危ないのは**プラグインの一括**で、
  // 名前が「削除」でも見た目は普通の OK になる。名前から推測しているので `guess`。
  const destructive: string[] = knob(
    rules,
    "bulk-destructive-without-danger",
    "words",
    DESTRUCTIVE_WORDS,
  );
  for (const { action, index } of bulkActions) {
    if (!enabled(rules, "bulk-destructive-without-danger")) break;
    if (str(action.type) === "delete") continue; // 既定で赤い
    const name = `${str(action.id) ?? ""} ${str(action.label) ?? ""}`.toLowerCase();
    if (!destructive.some((word) => name.includes(word.toLowerCase()))) continue;
    const confirm = isDict(action.confirm) ? action.confirm : undefined;
    if (confirm?.danger === true) continue;
    found.push({
      rule: "bulk-destructive-without-danger",
      where: `${path}.actions[${index}].confirm`,
      says:
        `「${labelOf(action)}」は戻せない操作のようですが、確認の OK は普通のボタンに` +
        `見えます（赤くなるのは \`type: delete\` と \`danger: true\` だけ）。`,
      add: "`confirm: { message: …, danger: true }`。",
      key: "confirm",
      node: "action",
      guess: true,
    });
  }

  // 一括があるのに、1回で動く件数が決まっていない（または多い）。
  //
  // 一括が効くのは**選べる行**＝表に出ている行。ページ送りを切ると全件が出るので、
  // 「全部選ぶ」が1回で全件を動かす操作になる。
  //
  // **上限を書いてある（`maxRows`）ボタンは数えない。** 上限は業務の決めごとで、
  // 書いてあれば Renderer が止める＝助言の仕事は終わっている。1つでも上限の無い
  // 一括が残っているときだけ言う（言う場所は「何件出す表なのか」なので1件）。
  const uncapped = bulkActions.filter(({ action }) => !hasRowLimit(action.maxRows));
  if (uncapped.length > 0 && enabled(rules, "bulk-on-many-rows") && table !== undefined) {
    const pagination = isDict(table.pagination) ? table.pagination : undefined;
    const paging = pagination?.enabled !== false;
    const size = typeof pagination?.pageSize === "number" ? pagination.pageSize : undefined;
    const max = knob(rules, "bulk-on-many-rows", "maxRows", 100);
    const who = uncapped.map(({ action }) => `「${labelOf(action)}」`).join("");
    if (!paging) {
      found.push({
        rule: "bulk-on-many-rows",
        where: `${path}.actions[${uncapped[0].index}].maxRows`,
        says:
          `${who}はまとめて実行するボタンですが、この表はページ送りを切ってあります` +
          `（全件が1画面に出ます）。「全部選ぶ」が**1回で全件**を動かす操作になります。`,
        add: "`maxRows: 20`（1回で動かせる上限。超えて選んでいる間は押せなくなる）。",
        key: "maxRows",
        node: "action",
      });
    } else if (size !== undefined && size > max) {
      found.push({
        rule: "bulk-on-many-rows",
        where: `${path}.actions[${uncapped[0].index}].maxRows`,
        says:
          `1ページ ${size} 件なので、${who}は**1回で ${size} 件**動きます` +
          `（${max} 件を超えています）。`,
        add:
          `\`maxRows\`（1回で動かせる上限）を書く。` +
          `1回で ${size} 件を動かして良いなら、そう書いてあること自体が答えになります。`,
        key: "maxRows",
        node: "action",
      });
    }
  }

  // 金額らしい列・項目に見せ方が無い（桁区切りが無いと読めない）。
  const money: string[] = knob(rules, "money-without-format", "words", MONEY_WORDS);
  for (const [index, column] of columns.entries()) {
    if (!enabled(rules, "money-without-format")) break;
    const field = str(column.field) ?? "";
    if (!looksLikeMoney(field, money) || column.format !== undefined) continue;
    found.push({
      rule: "money-without-format",
      where: `${path}.table.columns[${index}].format`,
      says: `列 "${field}" は金額のようですが、桁区切りが無いので 1234567 と出ます。`,
      add: "`format: currency`（消費税や単価で見せ方を変えるなら `config` で）。",
      key: "format",
      node: "column",
      guess: true,
    });
  }

  // 明細（subTable）を別テーブルに持つのに、行を指すキーが無い。
  for (const field of fields) {
    if (!enabled(rules, "subtable-without-parent-key")) break;
    if (str(field.type) !== "subTable") continue;
    const source = isDict(field.source) ? field.source : undefined;
    if (source === undefined || str(source.parentKey) !== undefined) continue;
    found.push({
      rule: "subtable-without-parent-key",
      where: `${path}.form…${str(field.field) ?? ""}.source.parentKey`,
      says: `明細 "${str(field.label) ?? field.field}" は別テーブルから引くのに、親を指すキーがありません。`,
      add: "`source.parentKey` に、親のどの項目で子を引くかを書く。",
      key: "parentKey",
      node: "subTableSource",
    });
  }

  // 帳票なのに合計が無い（業務帳票で合計が無いことは、まず無い）。
  if (kind === "report" && enabled(rules, "report-without-totals")) {
    const report = isDict(page.report) ? page.report : {};
    if (list(report.totals).length === 0) {
      found.push({
        rule: "report-without-totals",
        where: `${path}.report.totals`,
        says: "合計が1つもありません。帳票は合計を見るために配られることが多いです。",
        add: "`totals` に集計する項目（`{ field: amount, aggregate: sum }`）。",
        key: "totals",
        node: "report",
      });
    }
  }
}

/**
 * 金額らしい名前か。
 *
 * 大文字小文字は無視する（`unitPrice` も `UNIT_PRICE` も拾う）。語は外から差し替えられる
 * ので、正規表現ではなく語の一覧で持つ（設定に正規表現を書かせない）。
 */
const looksLikeMoney = (field: string, words: string[]): boolean => {
  const name = field.toLowerCase();
  return words.some((word) => name.includes(word.toLowerCase()));
};

/** フォームとステップの項目を、区別せず全部。 */
function formFields(page: Dict): Dict[] {
  const fields: Dict[] = [];
  const form = isDict(page.form) ? page.form : undefined;
  if (form !== undefined) {
    for (const section of dicts(form.sections)) fields.push(...dicts(section.fields));
  }
  for (const step of dicts(page.steps)) fields.push(...dicts(step.fields));
  return fields;
}

/**
 * 助言が挙げるキーが、そのノードに**本当に書けるか**を確かめる。
 *
 * 書けないキーを勧めるのは、間違いを教えるのと同じ。スキーマから作ったリファレンスで
 * 照合するので、DSL が変わればここで落ちる。
 */
export function unwritableAdvice(
  advice: Advice[],
  reference: DslReference,
): Advice[] {
  return advice.filter((one) => {
    const node = reference.nodes[one.node];
    if (node === undefined) return true;
    return !node.keys.some((key) => key.key === one.key);
  });
}

/**
 * 人が読む形。**助言であって警告ではない**ことを毎回言う。
 *
 * 物差しを外から渡したときは**そう書く**。読む人が組み込みの助言だと思ったまま案件の
 * 決めごとを読むと、話が噛み合わない（「hatake がこう言っている」ではなく「うちがこう
 * 決めた」なので）。
 */
export function renderAdvice(
  advice: Advice[],
  options: { rulesFrom?: string; rules?: AdviceRules } = {},
): string {
  const ruler = rulerNote(options);
  if (advice.length === 0) {
    return [
      "書き足したほうがいい所は見つかりませんでした。",
      "",
      ...ruler,
      ADVICE_NOTE,
    ].join("\n");
  }
  const out = [`書き足すと良さそうな所が ${advice.length} 件:`];
  for (const one of advice) {
    out.push("");
    out.push(`# ${one.where} [${one.rule}]${one.guess === true ? "（名前からの推測）" : ""}`);
    out.push(`  こうなる: ${one.says}`);
    out.push(`  書き足す: ${one.add}`);
  }
  out.push("");
  out.push(...ruler);
  out.push(ADVICE_NOTE);
  return out.join("\n");
}

/** どの物差しで見たか（渡していなければ何も言わない）。 */
function rulerNote(options: { rulesFrom?: string; rules?: AdviceRules }): string[] {
  if (options.rulesFrom === undefined) return [];
  const rules = options.rules ?? DEFAULT_RULES;
  const parts: string[] = [];
  if (rules.off.length > 0) parts.push(`止めた規則 ${rules.off.length} 件`);
  if (rules.require.length > 0) {
    parts.push(`案件の決めごと ${rules.require.length} 件`);
  }
  const tuned = Object.keys(rules.options).length;
  if (tuned > 0) parts.push(`目盛りを変えた規則 ${tuned} 件`);
  return [
    `※ 物差しは ${options.rulesFrom} を使いました` +
      `（${parts.length === 0 ? "組み込みのまま" : parts.join(" / ")}）。`,
    "",
  ];
}

/** 助言の位置づけは毎回書く。読み手が警告と混同すると、警告の信頼が落ちる。 */
export const ADVICE_NOTE =
  "※ ここは**助言**（書いていないから不便かもしれない所）で、警告ではありません。" +
  "業務によっては要らないものもあるので、終了コードは変えません。" +
  "「書いたのに効かない」は hatake validate が見ます。";
