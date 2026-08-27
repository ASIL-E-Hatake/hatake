// 文言に書ける差し込みの一覧。
//
// 正は [`spec/placeholders.json`](../../spec/placeholders.json)。ここは転記で、一致する
// ことを試験で確かめている（埋める側の Dart も同じ1枚を読む）。転記するのは、警告が
// **素の関数**であるため（ファイルを読める場所でしか動かない道具にしたくない）。
//
// 差し込みは**閉じた集合**。開いていると思われがちなのが問題で、`{orderNo}` のように
// 項目名を書くと、そのまま文字として出る（レコードの値は文言に渡っていない）。開いた形
// なのは遷移のパラメータ（`$row.<項目名>`）だけで、そこと混同しているのが原因。
//
// 判定に使うのは3つの印だけ。prose を読まずに規則が作れるようにしてある:
//   ・[bulkOnly]    … `scope: selection` のボタンでしか埋まらない
//   ・[afterRun]    … 走ったあとにしか分からない（押す前の文言では埋まらない）
//   ・[failureOnly] … 失敗したときにしか無い（成功の文言では埋まらない）

/** 差し込み1つ。 */
export interface Placeholder {
  /** 書き方（`{count}` / `$row.<項目名>`）。 */
  name: string;
  /** 何が入るか。 */
  means: string;
  /** `scope: selection` のボタンでしか埋まらない。 */
  bulkOnly: boolean;
  /** 走ったあとにしか分からない（押す前の文言では埋まらない）。 */
  afterRun: boolean;
  /** 失敗したときにしか無い（成功の文言では埋まらない）。 */
  failureOnly: boolean;
  /** 気をつけること。 */
  note?: string;
}

/** 差し込みが書ける場所のひとまとまり。 */
export interface PlaceholderContext {
  id: string;
  title: string;
  /** 誰が埋めるか。 */
  filledBy: string;
  /** 書ける場所（定義の道）。 */
  where: string[];
  placeholders: Placeholder[];
}

/** ボタンの文言（押す前・成功・失敗）。 */
const ACTION_MESSAGE: PlaceholderContext = {
  id: "action-message",
  title: "ボタンの文言",
  filledBy: "Renderer（押したときに埋める）",
  where: [
    "action.confirm.title",
    "action.confirm.message",
    "action.prompt.title",
    "action.onSuccess.message",
    "action.onError.message",
  ],
  placeholders: [
    {
      name: "{count}",
      means: "件数。押す前は「選んだ件数」、走ったあとは「うまくいった件数」",
      bulkOnly: true,
      afterRun: false,
      failureOnly: false,
      note: "1件ずつのボタンには件数が無いので埋まらない（`scope: selection` だけ）",
    },
    {
      name: "{total}",
      means: "渡した行の合計（うまくいった数＋失敗した数）",
      bulkOnly: true,
      afterRun: true,
      failureOnly: false,
    },
    {
      name: "{failed}",
      means: "失敗した件数",
      bulkOnly: true,
      afterRun: true,
      failureOnly: false,
      note:
        "成功の文言に書くと 0 が入る（一括は途中まで進んで終わるのが普通なので、" +
        "失敗0件も結果の1つ）",
    },
    {
      name: "{failedKeys}",
      means: "失敗した行のキーを並べたもの（`SO-1, SO-7`）",
      bulkOnly: true,
      afterRun: true,
      failureOnly: true,
      note:
        "**アプリ側が行を名指しで報告したときだけ**埋まる（`ActionOutcome.rejected` の " +
        "`rows`）。件数だけの報告なら文字のまま出る＝「行が分かっていない」と読める",
    },
    {
      name: "{skipped}",
      means:
        "送っていない件数（区切りで止めた・途中で失敗して残りを送らなかった）",
      bulkOnly: true,
      afterRun: true,
      failureOnly: true,
      note:
        "区切って実行するとき（batchSize）だけ 0 より大きくなる。" +
        "「実行していない」と「失敗した」は別なので、数も別に持つ。",
    },
    {
      name: "{error}",
      means: "失敗の理由（例外の文字）",
      bulkOnly: false,
      afterRun: true,
      failureOnly: true,
      note: "生の理由なので、業務の言葉は前後に自分で書く",
    },
  ],
};

/** 検証のメッセージ（3エディション共通の MessageResolver が埋める）。 */
const VALIDATION_MESSAGE: PlaceholderContext = {
  id: "validation-message",
  title: "検証のメッセージ",
  filledBy: "MessageResolver（3エディション共通）",
  where: ["field.validators[].message"],
  placeholders: [
    {
      name: "{value}",
      means: "その規則に書いた値（`maxLength: 20` の 20）",
      bulkOnly: false,
      afterRun: false,
      failureOnly: false,
    },
    {
      name: "{target}",
      means: "比べる相手の**ラベル**（`compare` の相手項目）",
      bulkOnly: false,
      afterRun: false,
      failureOnly: false,
    },
  ],
};

/** 遷移のパラメータ（ここだけ開いた形）。 */
const ROUTE_PARAMS: PlaceholderContext = {
  id: "route-params",
  title: "遷移のパラメータ",
  filledBy: "Renderer（遷移するときに埋める）",
  where: ["action.params.*", "action.onSuccess.params.*"],
  placeholders: [
    {
      name: "$row.<項目名>",
      means: "押した行のその項目の値（`$row.orderNo`）",
      bulkOnly: false,
      afterRun: false,
      failureOnly: false,
      note:
        "**文言ではなくパラメータ**。ここだけは開いた形（行の項目名を書ける）＝文言に " +
        "`{orderNo}` と書けるように見えるのは、この形と混同しているため",
    },
    {
      name: "$record.<項目名>",
      means: "いま開いている1件のその項目の値",
      bulkOnly: false,
      afterRun: false,
      failureOnly: false,
      note: "`$row` と同じ形。行から来たか、開いている1件から来たかの違い",
    },
  ],
};

/** 差し込みの全部（文脈ごと）。 */
export const PLACEHOLDER_CONTEXTS: PlaceholderContext[] = [
  ACTION_MESSAGE,
  VALIDATION_MESSAGE,
  ROUTE_PARAMS,
];

/** ボタンの文言に書ける差し込み（ここに無いものは埋まらない）。 */
export const ACTION_PLACEHOLDERS: Placeholder[] = ACTION_MESSAGE.placeholders;

/** 名前だけ。 */
export const namesOf = (placeholders: Placeholder[]): string[] =>
  placeholders.map((one) => one.name);

/**
 * 人が読む形。**いつ埋まるか**を印から文にする（一覧と規則が同じ印を見ているので、
 * 書いてあることと検査がズレない）。
 */
export function renderPlaceholders(contexts: PlaceholderContext[]): string {
  const out: string[] = ["定義の文言に書ける差し込み（これだけ）"];
  for (const context of contexts) {
    out.push("");
    out.push(`## ${context.title}（${context.filledBy}）`);
    out.push(`  書ける場所: ${context.where.join(" / ")}`);
    for (const one of context.placeholders) {
      out.push("");
      out.push(`  ${one.name} … ${one.means}`);
      const when = whenFilled(one);
      if (when.length > 0) out.push(`    埋まるのは: ${when.join("・")}`);
      if (one.note !== undefined) out.push(`    ${one.note}`);
    }
  }
  out.push("");
  out.push(
    "※ ここに無いものは埋まりません（`{orderNo}` のように項目名を書くと、" +
      "そのまま文字として出ます）。開いた形は遷移のパラメータだけです。",
  );
  return out.join("\n");
}

/** いつ埋まるか（印から作る）。 */
function whenFilled(one: Placeholder): string[] {
  const when: string[] = [];
  if (one.bulkOnly) when.push("`scope: selection` のボタン");
  if (one.afterRun) when.push("走ったあと（押す前の文言では埋まらない）");
  if (one.failureOnly) when.push("失敗したとき（成功の文言では埋まらない）");
  return when;
}

/** その印が立っているものだけ。 */
export const placeholdersWhere = (
  pick: (one: Placeholder) => boolean,
): string[] => namesOf(ACTION_PLACEHOLDERS.filter(pick));
