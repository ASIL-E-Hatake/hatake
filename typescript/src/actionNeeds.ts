// ボタンが**効くために画面が持っていなければならないもの**の表。
//
// なぜ1枚にするか: 「押しても何も起きない」は、この枠組みで一番まずい転び方。定義は通り、
// 画面にもボタンが出て、**押すまで気づけない**（押した人には「壊れている」に見える）。
// `type` は7つ・画面の種別は8つあるので、種別ごとに規則を手で書くとどこかが必ず抜ける
// ＝抜けた組み合わせだけ黙って通る。なので**表を1枚**にして、規則はそこから作る。
// 7つぜんぶ載っていることは試験で確かめる（新しい `type` を足したら、ここを決めないと
// 通らない）。
//
// この表は Flutter 側の押した時の言い方（`page_actions.dart` の「このページでは使え
// ません」「出力できません」「刷れません」）と対になっている。あちらは最後の砦で、
// こちらは押す前に言う側。**片方だけ直すと食い違う**ので、どちらかを変えたらもう片方も
// 見ること（型では縛れないので、ここに書いておく）。
//
// 決めごと:
//   ・**言うのは「画面の側に無い」ことだけ。** 名前が登録されているか（`plugin` の
//     ハンドラが在るか）は外の話で、`--registry` を渡したときだけ言う（`unknown-plugin`）。
//   ・**規則名は既にあるものを変えない**（`create-action-unusable` /
//     `print-without-report`）。

import { ActionTypes } from "./definition.js";

type Dict = Record<string, unknown>;

const isDict = (v: unknown): v is Dict =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const str = (v: unknown): string | undefined =>
  typeof v === "string" ? v : undefined;

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** 一覧を持つ画面（表の行を作るのはこの4つ）。CSV に出せるのもここだけ。 */
export const PAGE_KINDS_WITH_ROWS = ["search", "crud", "master", "report"];

/** 一覧とフォームを両方持つ画面（新規入力の枠を開ける・行を直す/消す）。 */
export const PAGE_KINDS_WITH_FORM_ROWS = ["crud", "master"];

/** 行アクションとして組み込みで在るもの（この2つだけ id と type が同じ名前）。 */
export const BUILT_IN_ROW_ACTIONS = ["edit", "delete"];

/** 実行の前後に足せる口（宣言しても読まれないなら、そこを言う）。 */
const HOOKS = ["confirm", "prompt", "onSuccess", "onError"];

/** 空振りしていたときに言うこと。 */
interface Dead {
  /** `actions[i]` の何を指すか（`type` / `plugin` / `page` / `id`）。 */
  at: string;
  what: string;
  fix: string;
}

/** `type` 1つぶんの「効く条件」。 */
export interface ActionCase {
  type: string;
  rule: string;
  pitfall?: string;
  /** 空振りしているなら、何が起きるか・どうするかを返す。 */
  dead(action: Dict, page: Dict, label: string): Dead | undefined;
}

const kindOf = (page: Dict): string => str(page.type) ?? "";

/** その画面が行に並べている id（`table.rowActions`）。 */
export const rowActionsOf = (page: Dict): string[] => {
  const table = isDict(page.table) ? page.table : undefined;
  if (table === undefined) return [];
  return list(table.rowActions)
    .map(str)
    .filter((one): one is string => one !== undefined);
};

/**
 * 行の操作（`edit` / `delete`）を `actions:` に書いたとき。
 *
 * ここは「置く場所が違う」ではない。**行の操作の言い方を業務の言葉にする宣言**として
 * 正しい書き方（`type: delete` に `confirm` を書くと、行の削除がその文で聞く）なので、
 * 効いているなら何も言わない。言うのは、その宣言が**どこにも効かない**ときだけ:
 *
 *   1. 行を直す/消す枠が無い画面（一覧＋フォームを持たない種別）
 *   2. `table.rowActions` にその名前が並んでいない（行にボタンが出ない）
 *   3. id が組み込みの名前ではない（宣言は id で引かれるので、読まれない）
 */
const rowDeclaration = (type: string): ActionCase["dead"] =>
  (action, page, label) => {
    const kind = kindOf(page);
    const at = "type";
    if (!PAGE_KINDS_WITH_FORM_ROWS.includes(kind)) {
      return {
        at,
        what:
          `「${label}」は押しても何も起きません（\`type: ${type}\` は**行の操作**ですが、` +
          `\`${kind}\` の画面には行を${type === "edit" ? "直す" : "消す"}枠がありません）。`,
        fix:
          `一覧とフォームを両方持つ画面（${PAGE_KINDS_WITH_FORM_ROWS.join(" / ")}）に` +
          "置いてください。画面全体のボタンとして何かするなら `type: plugin` です。",
      };
    }
    if (!rowActionsOf(page).includes(type)) {
      return {
        at,
        what:
          `「${label}」は行にも画面にも出ません（\`table.rowActions\` に \`${type}\` が` +
          `並んでいないので、行のボタンが出ません）。`,
        fix:
          `\`table.rowActions: [${type}]\` を足してください（行の右端に出ます）。` +
          "画面全体のボタンにしたいなら `type: plugin` です。",
      };
    }
    const id = str(action.id);
    if (id !== type) {
      return {
        at: "id",
        what:
          `「${label}」の宣言は読まれません（行の${type === "edit" ? "編集" : "削除"}が` +
          `引くのは \`id: ${type}\` の宣言だけです。いまの id は "${id ?? "（無し）"}"）。`,
        fix:
          `id を \`${type}\` にしてください（\`confirm\` や \`onSuccess\` を業務の言葉に` +
          "したいときの書き方です）。",
      };
    }
    if (type === "edit") {
      const written = HOOKS.filter((one) => action[one] !== undefined);
      if (written.length > 0) {
        return {
          at: written[0],
          what:
            `「${label}」の ${written.join(" / ")} は読まれません` +
            `（行の編集は入力の枠を開くだけで、そこでは聞きません）。`,
          fix:
            "保存のときに聞く・終わったあとに何かするなら、フォームの保存を" +
            "`type: plugin` のボタンにしてください（削除は `type: delete` で読まれます）。",
        };
      }
    }
    return undefined;
  };

/** `type` ごとの条件。**7種類ぜんぶ**載っていること（試験が確かめる）。 */
export const ACTION_CASES: ActionCase[] = [
  {
    type: ActionTypes.create,
    rule: "create-action-unusable",
    dead: (_action, page, label) => {
      const kind = kindOf(page);
      if (PAGE_KINDS_WITH_FORM_ROWS.includes(kind)) return undefined;
      return {
        at: "type",
        what:
          `「${label}」は押しても何も起きません（\`type: create\` が開くのは` +
          `**一覧からの新規入力**なので、置けるのは ${PAGE_KINDS_WITH_FORM_ROWS.join(" / ")} です）。`,
        fix:
          kind === "form" || kind === "wizard"
            ? "この画面には保存ボタンが最初から出ています（新規登録のボタンは要りません）。" +
              "保存のときに独自の処理が要るなら `type: plugin` で書いてください。"
            : "新規入力は一覧のある画面（`crud` / `master`）に置くか、" +
              "`type: navigate` で入力画面へ移ってください。",
      };
    },
  },
  {
    type: ActionTypes.edit,
    rule: "row-declaration-unused",
    dead: rowDeclaration(ActionTypes.edit),
  },
  {
    type: ActionTypes.delete,
    rule: "row-declaration-unused",
    dead: rowDeclaration(ActionTypes.delete),
  },
  {
    type: ActionTypes.plugin,
    rule: "plugin-without-name",
    dead: (action, _page, label) =>
      str(action.plugin) !== undefined
        ? undefined
        : {
            at: "plugin",
            what:
              `「${label}」は押しても何も起きません（\`type: plugin\` なのに \`plugin:\` が` +
              `書かれていないので、呼ぶ相手がありません）。`,
            fix:
              "`plugin: <登録した名前>` を書いてください（アプリ側の ActionRegistry に" +
              "登録する名前。`hatake refs --needs-registration` で一覧が出ます）。",
          },
  },
  {
    type: ActionTypes.export,
    rule: "export-without-rows",
    dead: (_action, page, label) => {
      const kind = kindOf(page);
      if (PAGE_KINDS_WITH_ROWS.includes(kind)) return undefined;
      return {
        at: "type",
        what:
          `「${label}」は押しても何も出ません（CSV にするのは**表の行**ですが、` +
          `\`${kind}\` の画面に表はありません）。`,
        fix:
          `一覧のある画面（${PAGE_KINDS_WITH_ROWS.join(" / ")}）に置いてください。` +
          "入力中の内容を持ち出したいなら、それは業務の処理なので `type: plugin` です。",
      };
    },
  },
  {
    type: ActionTypes.print,
    rule: "print-without-report",
    pitfall: "print-without-report",
    dead: (_action, page, label) =>
      isDict(page.report)
        ? undefined
        : {
            at: "type",
            what:
              `「${label}」は紙に刷るボタンですが、この画面には report がありません。` +
              `刷る紙が無いので、押しても何も出ません。`,
            fix:
              "帳票の画面（`type: report` ＋ `report:`）に置いてください。" +
              "一覧をファイルに持ち出すだけなら `type: export`（CSV）です。",
          },
  },
  {
    type: ActionTypes.navigate,
    rule: "navigate-to-self",
    dead: (action, page, label) => {
      const selfId = str(page.id);
      if (selfId === undefined || str(action.page) !== selfId) return undefined;
      return {
        at: "page",
        what:
          `「${label}」の行き先はこの画面自身です。押しても**同じ画面がもう1枚開くだけ**` +
          `なので、使う人には何も起きなかったように見えます。`,
        fix:
          "行き先（`page:`）を別の画面に直してください。同じ画面を条件だけ変えて" +
          "開き直すなら、遷移ではなく絞り込み（`search.filters`）の仕事です。",
      };
    },
  },
];

/** 空振りしているボタン1件。 */
export interface DeadAction extends Dead {
  rule: string;
  index: number;
  pitfall?: string;
}

/**
 * その画面で**押しても何も起きない**ボタンを全部挙げる。
 *
 * 1画面ぶんの情報だけで決まる（外の登録も、他の画面も見ない）ので、機械が先に言える。
 */
export function deadActions(page: Dict, actions: Dict[]): DeadAction[] {
  const found: DeadAction[] = [];
  actions.forEach((action, index) => {
    const type = str(action.type);
    const one = ACTION_CASES.find((each) => each.type === type);
    if (one === undefined) return;
    const label = str(action.label) ?? str(action.id) ?? "ボタン";
    const dead = one.dead(action, page, label);
    if (dead === undefined) return;
    found.push({
      ...dead,
      rule: one.rule,
      index,
      ...(one.pitfall === undefined ? {} : { pitfall: one.pitfall }),
    });
  });
  return found;
}

/** いま開いているレコードを持つ画面（そこに1件在るので、状態で出し分けられる）。 */
export const PAGE_KINDS_WITH_RECORD = ["form", "detail", "wizard"];

/**
 * 判定する相手が無い所に書いた `enabledWhen`。
 *
 * 出し分けが効くのは3つだけ:
 *   ・`table.rowActions` に並んでいる … その行のレコード
 *   ・`scope: selection` … 選んだ行（全部満たすときだけ押せる）
 *   ・レコードを持つ画面のボタン … いま開いているレコード
 *
 * 一覧の上のボタン（`search` / `crud` / `master` / `report` / `dashboard`）には
 * 「いま開いているレコード」が無いので、**書いても出し分けられない**。画面は出るし
 * ボタンも押せるので、書いた人は効いていると思ったまま出荷できる。
 *
 * **判定できないときに押せなくする、はしない**（押せるまま）。書き間違いで業務が
 * 止まるほうが、出し分けが効かないより悪いので。
 */
export function unjudgeableEnabledWhen(
  page: Dict,
  actions: Dict[],
): Array<{ index: number; what: string; fix: string }> {
  const kind = kindOf(page);
  if (PAGE_KINDS_WITH_RECORD.includes(kind)) return [];
  const rowActions = rowActionsOf(page);
  const found: Array<{ index: number; what: string; fix: string }> = [];
  actions.forEach((action, index) => {
    const condition = action.enabledWhen;
    if (!isDict(condition) || Object.keys(condition).length === 0) return;
    const id = str(action.id);
    if (id !== undefined && rowActions.includes(id)) return;
    if (str(action.scope) === "selection") return;
    const label = str(action.label) ?? id ?? "ボタン";
    found.push({
      index,
      what:
        `「${label}」の \`enabledWhen\` は効きません（\`${kind}\` の画面のボタンには` +
        `**いま開いているレコード**が無いので、何の状態で出し分けるのかが決まりません）。` +
        `ボタンは出て、押せます。`,
      fix:
        `行ごとに出し分けるなら \`table.rowActions\` にその id を並べてください` +
        `（その行で判定します）。選んだ行に対してなら \`scope: selection\`` +
        `（選んだ行が全部満たすときだけ押せます）。` +
        `画面全体の話なら、押せるかどうかではなく**押した先で断る**のが筋です` +
        `（\`type: plugin\` の中で判定して \`onError\` で言う）。`,
    });
  });
  return found;
}

/**
 * 組み込みの行アクション（`edit` / `delete`）を、行を直す枠が無い画面の
 * `table.rowActions` に書いたとき。
 *
 * `search` の `rowActions` が指すのは**画面のアクションの id**（`detail` のような
 * `plugin` / `navigate`）。組み込みの2つは一覧とフォームを両方持つ画面の機能なので、
 * `search` / `report` に書くと**行に何も出ない**（黙って消える）。
 */
export function unsupportedRowActions(
  page: Dict,
): Array<{ index: number; name: string; what: string; fix: string }> {
  const kind = kindOf(page);
  if (PAGE_KINDS_WITH_FORM_ROWS.includes(kind)) return [];
  const found: Array<{ index: number; name: string; what: string; fix: string }> = [];
  rowActionsOf(page).forEach((name, index) => {
    if (!BUILT_IN_ROW_ACTIONS.includes(name)) return;
    found.push({
      index,
      name,
      what:
        `行アクション "${name}" は \`${kind}\` の画面では出ません` +
        `（組み込みの ${BUILT_IN_ROW_ACTIONS.join(" / ")} は、一覧とフォームを両方持つ` +
        `画面の機能です）。行には何も出ません。`,
      fix:
        `${PAGE_KINDS_WITH_FORM_ROWS.join(" / ")} の画面に置くか、行から開く` +
        "ボタン（`type: navigate` / `type: plugin`）を `actions` に書いて、その id を" +
        "`rowActions` に並べてください。",
    });
  });
  return found;
}
