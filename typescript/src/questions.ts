// 人が決めないと決まらないことを問い返す（`spec/question-kinds.json`）。
//
// 雑な依頼から画面を起こすとき、AI は**書けることを全部書いて**終わる。書けないことは
// 書かないので、定義を読んでも「決まっていない」ようには見えない（空欄が無いので）。
// そのまま出来上がった画面が、動かした後にこう言われる: 「同時に直したらどうなるの」
// 「消したものは残ってるの」「この端数は切り捨て？」。**全部、定義に書けないこと**。
//
// この3つを絶対に混ぜない:
//   ・警告 … 書いたのに効かない。事実なので CI で落としてよい
//   ・助言 … 書いていないと不便かもしれない。**好み**なので落としてはいけない
//   ・問い … **定義に書けない**のに、画面が在るなら決まっていないと画面が嘘になる。
//            答えられるのは人だけなので、道具は聞くだけ（当てない・決めない）
//
// だから表に載せる条件はひとつ: **定義に書けないこと**。書けるなら助言の担当なので、
// 各件の `area` は担当の表（`responsibility.json`）の `server` か `outside` の項目しか
// 書けない（[checkQuestionAreas] が落とす）。
//
// 答えの置き場所は**案件の前書きの `logic`**。そこに1行足して `answers: [<印>]` を
// 付けると、その問いは出なくなる＝**答えたら消える**ことで、問いが実在の穴に対応して
// いる証拠になる（消えない問いは、穴の在り処が間違っている）。

import type { LogicRule } from "./project.js";
import {
  QUESTION_TRIGGERS,
  type QuestionTrigger,
  type TriggeredFact,
  factsOf,
} from "./questionTriggers.js";
import {
  type ResponsibilityCatalog,
  type Where,
  WHERE_WORDS,
} from "./responsibility.js";

type Dict = Record<string, unknown>;

/** 段。**2段だけ**（3段にすると真ん中が読まれない）。 */
export const QUESTION_STEPS = ["must", "should"] as const;

export type QuestionStep = (typeof QUESTION_STEPS)[number];

/** 段を人の言葉で（報告と MCP の答えで同じ字を使う）。 */
export const STEP_WORDS: Record<QuestionStep, string> = {
  must: "必ず決めること",
  should: "決めておくと後で揉めないこと",
};

/** 問い1種類。 */
export interface QuestionKind {
  id: string;
  step: QuestionStep;
  /** 担当の表の項目 id（`server` か `outside` のものだけ）。 */
  area: string;
  /** どの事実で聞くか。 */
  trigger: QuestionTrigger;
  /** 聞く文（そのまま人に投げられる1文）。 */
  ask: string;
  /** なぜ定義に書けないのか（＝なぜ助言ではなく問いなのか）。 */
  why: string;
  /** 決めないと何が起きるか。 */
  ifNot: string;
  /** 答えをどう書くか（前書きの `logic` に足す1行の例）。 */
  answer: string;
}

/** 出す問い1件（種類＋それを聞いた事実）。 */
export interface Question {
  kind: QuestionKind;
  /** 誰の担当か（担当の表から引いた区分）。 */
  where: Where;
  /** この問いを出した事実（定義のどこを見たか）。 */
  facts: TriggeredFact[];
}

const isDict = (v: unknown): v is Dict =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const bad = (message: string): never => {
  throw new Error(`問いの表が読めません: ${message}`);
};

const text = (value: unknown, at: string): string =>
  typeof value === "string" && value !== "" ? value : bad(`${at} が要ります。`);

const KIND_KEYS = ["id", "step", "area", "trigger", "ask", "why", "ifNot", "answer"];

/**
 * 表を読む。**引き金と両方向で突き合わせる**（表に無い引き金・使っていない引き金で落ちる）。
 *
 * 使っていない引き金でも落とすのは、拾う仕掛けだけ在って誰も聞かない事実＝**死んだ
 * コード**になるから（定義を読んでいるのに何も出ない、の原因になる）。
 */
export function parseQuestionKinds(value: unknown): QuestionKind[] {
  if (!isDict(value)) bad("map として読めません。");
  const raw = (value as { kinds?: unknown }).kinds;
  if (!Array.isArray(raw)) bad("kinds がありません。");

  const triggers = new Set<string>(QUESTION_TRIGGERS);
  const used = new Set<string>();
  const seen = new Set<string>();
  const found: QuestionKind[] = [];
  for (const [index, one] of (raw as unknown[]).entries()) {
    if (!isDict(one)) bad(`kinds[${index}] が map ではありません。`);
    const node = one as Dict;
    const id = text(node.id, `kinds[${index}].id`);
    if (seen.has(id)) bad(`印 "${id}" が2回出てきます。`);
    seen.add(id);
    for (const key of Object.keys(node)) {
      if (!KIND_KEYS.includes(key)) bad(`${id}: 知らないキー "${key}"。`);
    }
    const step = text(node.step, `${id}.step`);
    if (!QUESTION_STEPS.includes(step as QuestionStep)) {
      bad(`${id}: step は ${QUESTION_STEPS.join(" / ")} のどちらかです。`);
    }
    const trigger = text(node.trigger, `${id}.trigger`);
    if (!triggers.has(trigger)) {
      bad(
        `${id}: "${trigger}" という引き金はありません` +
          `（引き金は ${QUESTION_TRIGGERS.length} 個です）。`,
      );
    }
    used.add(trigger);
    found.push({
      id,
      step: step as QuestionStep,
      area: text(node.area, `${id}.area`),
      trigger: trigger as QuestionTrigger,
      ask: text(node.ask, `${id}.ask`),
      why: text(node.why, `${id}.why`),
      ifNot: text(node.ifNot, `${id}.ifNot`),
      answer: text(node.answer, `${id}.answer`),
    });
  }
  const idle = QUESTION_TRIGGERS.filter((trigger) => !used.has(trigger));
  if (idle.length > 0) {
    bad(
      `どの問いも使っていない引き金があります: ${idle.join(" / ")}` +
        "（拾うだけ拾って誰も聞かない事実は、消すか問いを足してください）。",
    );
  }
  return found;
}

/**
 * 問いの担当が、担当の表に在って**枠組みの外側**であることを確かめる。
 *
 * ここが問い返しの土台。定義で書けること（`definition` / `plugin`）を問いにすると、
 * それは助言と同じことを2か所で言っているだけになる（しかも問いのほうが強く読まれる
 * ので、好みを押し付ける道具になる）。
 */
export function checkQuestionAreas(
  kinds: QuestionKind[],
  catalog: ResponsibilityCatalog,
): void {
  const areas = new Map(catalog.areas.map((area) => [area.id, area.where]));
  for (const kind of kinds) {
    const where = areas.get(kind.area);
    if (where === undefined) {
      bad(`${kind.id}: 担当の表に "${kind.area}" という項目がありません。`);
    }
    if (where !== "server" && where !== "outside") {
      bad(
        `${kind.id}: "${kind.area}" は「${WHERE_WORDS[where as Where]}」なので、` +
          "定義かアプリ側で書けます＝問いではなく助言の担当です。",
      );
    }
  }
}

/** 前書きで答えたものを拾った結果。 */
export interface AnswerCheck {
  /** 答えが書いてある印。 */
  answered: Set<string>;
  /** 答えたつもりで答えられていない所（**黙って無視しない**）。 */
  problems: string[];
}

/**
 * 前書きの `logic` から「もう答えた印」を拾う。
 *
 * 綴り違いを黙って捨てると**答えたつもりで問いが出続ける**か、逆に**答えていない問いが
 * 消える**。どちらも嘘なので、拾えなかったものは問題として返す（呼ぶ側が落とす）。
 * 担当の食い違い（排他はサーバの担当なのに `where: definition` と書いた）も言う。
 */
export function answeredBy(
  logic: LogicRule[],
  kinds: QuestionKind[],
  catalog: ResponsibilityCatalog,
): AnswerCheck {
  const byId = new Map(kinds.map((kind) => [kind.id, kind]));
  const areas = new Map(catalog.areas.map((area) => [area.id, area.where]));
  const answered = new Set<string>();
  const problems: string[] = [];
  for (const [index, rule] of logic.entries()) {
    for (const id of rule.answers ?? []) {
      const kind = byId.get(id);
      if (kind === undefined) {
        problems.push(
          `logic[${index}].answers: "${id}" という問いはありません` +
            `（\`npx hatake ask --kinds\` で引けます）。`,
        );
        continue;
      }
      const expected = areas.get(kind.area);
      if (expected !== undefined && rule.where !== expected) {
        problems.push(
          `logic[${index}].answers: "${id}" は「${WHERE_WORDS[expected]}」ですが、` +
            `where に ${rule.where} と書いてあります` +
            "（担当が違うなら、答えになっていないか区分が間違っています）。",
        );
        continue;
      }
      answered.add(id);
    }
  }
  return { answered, problems };
}

/**
 * 定義から問いを起こす。
 *
 * 並びは**段のあと表のまま**（must が先。表の並びは決めやすい順に書いてある）。
 */
export function askQuestions(
  document: Dict,
  kinds: QuestionKind[],
  catalog: ResponsibilityCatalog,
  options: { answered?: Set<string> } = {},
): Question[] {
  const areas = new Map(catalog.areas.map((area) => [area.id, area.where]));
  const facts = factsOf(document);
  const answered = options.answered ?? new Set<string>();
  const found: Question[] = [];
  for (const step of QUESTION_STEPS) {
    for (const kind of kinds) {
      if (kind.step !== step || answered.has(kind.id)) continue;
      const mine = facts.filter((fact) => fact.trigger === kind.trigger);
      if (mine.length === 0) continue;
      found.push({
        kind,
        where: (areas.get(kind.area) ?? "outside") as Where,
        facts: mine,
      });
    }
  }
  return found;
}

/** 事実を1行にする（`受注入力: 保存できる画面（type: crud）`）。 */
const factLine = (fact: TriggeredFact): string =>
  fact.page === undefined ? fact.saw : `${fact.page}: ${fact.saw}`;

/** 人が読む形。 */
export function questionLines(
  questions: Question[],
  options: { total: number; answered?: Set<string> } = { total: 0 },
): string[] {
  const out: string[] = [];
  const skipped = options.answered?.size ?? 0;
  // 済んでいる件数は**残っていても言う**（黙ると、前書きに書いた答えが効いたのか
  // そもそも聞かれなかったのかが分からない）。
  const done = skipped === 0 ? "" : `前書きで ${skipped} 件は答えが済んでいます。`;
  out.push(
    questions.length === 0
      ? `決めていないことは見つかりませんでした。${done}`
      : `決めてください（${questions.length}件）。${done}`,
  );

  for (const step of QUESTION_STEPS) {
    const mine = questions.filter((one) => one.kind.step === step);
    if (mine.length === 0) continue;
    out.push("");
    out.push(`${STEP_WORDS[step]}（${mine.length}件）`);
    for (const [at, one] of mine.entries()) {
      out.push("");
      out.push(`${at + 1}. [${one.kind.id}] ${one.kind.ask}`);
      out.push(`   聞く理由: ${one.kind.why}`);
      out.push(`   決めないと: ${one.kind.ifNot}`);
      out.push(`   誰の担当か: ${WHERE_WORDS[one.where]}`);
      out.push(`   答えの書き方: ${one.kind.answer}`);
      // 何を見てそう言うのかを必ず添える（心当たりのある人が、その場で答えられる）。
      // 5件を超えたら数だけにする＝同じ字が並ぶと、上の問いの文まで読まれなくなる。
      out.push(
        one.facts.length === 1
          ? `   この定義で聞いた理由: ${factLine(one.facts[0])}`
          : `   この定義で聞いた理由（${one.facts.length}件）:`,
      );
      if (one.facts.length > 1) {
        for (const fact of one.facts.slice(0, 5)) out.push(`     ${factLine(fact)}`);
        if (one.facts.length > 5) out.push(`     ほか ${one.facts.length - 5} 画面`);
      }
    }
  }

  out.push("");
  out.push(questionNote(options.total));
  return out;
}

/** 見ていない所を毎回言う（出なかった＝決まっている、にしないため）。 */
export const questionNote = (total: number): string =>
  `※ この道具が見るのは **${total} 種類だけ**です。出なかった＝決まっている、では` +
  "ありません（表に無いことは聞きません）。**終了コードは変えません**" +
  "（問いは人への依頼で、機械の合否ではないので）。答えが決まったら、案件の前書きの " +
  "`logic` にその1行を足して `answers: [<印>]` を付けてください＝次からその問いは出ません。";

/** 表そのものを引く形（`--kinds`。定義が無くても読める）。 */
export function questionKindLines(
  kinds: QuestionKind[],
  catalog: ResponsibilityCatalog,
): string[] {
  const areas = new Map(catalog.areas.map((area) => [area.id, area.where]));
  const out: string[] = [`人が決めないと決まらないことは ${kinds.length} 種類。`];
  for (const step of QUESTION_STEPS) {
    const mine = kinds.filter((kind) => kind.step === step);
    if (mine.length === 0) continue;
    out.push("");
    out.push(`${STEP_WORDS[step]}（${mine.length}件）`);
    for (const kind of mine) {
      out.push("");
      out.push(`[${kind.id}] ${kind.ask}`);
      out.push(`  聞く理由: ${kind.why}`);
      out.push(`  決めないと: ${kind.ifNot}`);
      out.push(
        `  誰の担当か: ${WHERE_WORDS[(areas.get(kind.area) ?? "outside") as Where]}` +
          `（担当の表の ${kind.area}）`,
      );
      out.push(`  聞く引き金: ${kind.trigger}`);
      out.push(`  答えの書き方: ${kind.answer}`);
    }
  }
  out.push("");
  out.push(questionNote(kinds.length));
  return out;
}
