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
// 各件の担当は**枠組みの外側**（`server` / `outside`）しか書けない（[checkQuestionAreas]
// が落とす）。組み込みは担当の表（`responsibility.json`）の項目を `area` で指し、案件が
// 足す問いは `where` を直に書く。
//
// 答えの置き場所は**案件の前書き**。`logic` に1行足して `answers: [<印>]` を付けるか、
// 「既定のままでよい」と決めたなら `questions.decided` に理由つきで残す。どちらでも
// その問いは出なくなる＝**答えたら消える**ことで、問いが実在の穴に対応している証拠に
// なる（消えない問いは、穴の在り処が間違っている）。

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

/** 問いを出せる担当。**枠組みの外側だけ**（内側は助言の担当）。 */
export const QUESTION_WHERES = ["server", "outside"] as const;

const outsideWhere = (value: string): boolean =>
  (QUESTION_WHERES as readonly string[]).includes(value);

/** 問い1種類。 */
export interface QuestionKind {
  id: string;
  step: QuestionStep;
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
  /** 組み込み: 担当の表の項目 id（`server` か `outside` のものだけ）。 */
  area?: string;
  /** 案件が足した問い: 担当を直に書く。 */
  where?: Where;
  /** 案件の前書きから来た問いの印（読む側が組み込みと区別できるように）。 */
  from?: "project";
}

/**
 * 「既定のままでよい」と決めた印。
 *
 * 答え（`logic` の `answers`）は**何かを決めて書いた**とき。こちらは**何も書かないと
 * 決めた**とき。理由を必須にしてあるのは `where: outside` と同じ考えで、理由の無い
 * 決定は後から誰も直せないから（「なぜ聞かれなくなったのか」が分からなくなる）。
 */
export interface DecidedQuestion {
  id: string;
  why: string;
  /**
   * いつ決めたか（`2026-09-14`。省略できる）。
   *
   * `on` ではない＝YAML 1.1 の読み手（PyYAML）は `on:` を真偽値として読むので、
   * キー名に使うと**読み手によって別のキーになる**（[YAML11_WORDS]）。
   */
  date?: string;
}

/** 案件の前書きのうち、問い返しが見る所だけ。 */
export interface AnswerSource {
  logic: { where: Where; answers?: string[] }[];
  questions: { ask: QuestionKind[]; decided: DecidedQuestion[] };
}

const isDict = (v: unknown): v is Dict =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const bad = (message: string): never => {
  throw new Error(`問いの表が読めません: ${message}`);
};

const text = (value: unknown, at: string): string =>
  typeof value === "string" && value !== "" ? value : bad(`${at} が要ります。`);

const COMMON_KEYS = ["id", "step", "trigger", "ask", "why", "ifNot", "answer"];

/** 表の読み方（組み込みの表と、案件が足す問いで少しだけ違う）。 */
export interface ParseQuestionOptions {
  /**
   * 引き金を全部使っていることを求めるか（組み込みの表だけ true）。
   *
   * 拾う仕掛けだけ在って誰も聞かない事実は**死んだコード**になる（定義を読んでいるのに
   * 何も出ない、の原因）。案件が足す問いにこれを求めると、1件足すだけで落ちてしまう。
   */
  requireAllTriggers?: boolean;
  /** 案件の前書きから読むとき（担当は `area` ではなく `where` で書く）。 */
  from?: "project";
}

/**
 * 表を読む。**引き金と突き合わせる**（表に無い引き金では聞けない）。
 *
 * 案件が足す問いも**この同じ読み手**を通す＝案件の紙にだけ緩い形は書けない。
 */
export function parseQuestionKinds(
  value: unknown,
  options: ParseQuestionOptions = {},
): QuestionKind[] {
  const { requireAllTriggers = true, from } = options;
  const raw = Array.isArray(value)
    ? value
    : isDict(value) && Array.isArray((value as { kinds?: unknown }).kinds)
      ? ((value as { kinds: unknown }).kinds as unknown[])
      : bad("kinds がありません。");

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
    const keys =
      from === "project" ? [...COMMON_KEYS, "where"] : [...COMMON_KEYS, "area"];
    for (const key of Object.keys(node)) {
      if (!keys.includes(key)) bad(`${id}: 知らないキー "${key}"。`);
    }
    const step = text(node.step, `${id}.step`);
    if (!QUESTION_STEPS.includes(step as QuestionStep)) {
      bad(`${id}: step は ${QUESTION_STEPS.join(" / ")} のどちらかです。`);
    }
    const trigger = text(node.trigger, `${id}.trigger`);
    if (!triggers.has(trigger)) {
      bad(
        `${id}: "${trigger}" という引き金はありません` +
          `（引き金は ${QUESTION_TRIGGERS.join(" / ")} の ${QUESTION_TRIGGERS.length} 個です）。`,
      );
    }
    used.add(trigger);
    const kind: QuestionKind = {
      id,
      step: step as QuestionStep,
      trigger: trigger as QuestionTrigger,
      ask: text(node.ask, `${id}.ask`),
      why: text(node.why, `${id}.why`),
      ifNot: text(node.ifNot, `${id}.ifNot`),
      answer: text(node.answer, `${id}.answer`),
    };
    if (from === "project") {
      const where = text(node.where, `${id}.where`);
      // 定義やアプリ側で書けるなら、それは問いではなく助言の担当（組み込みと同じ規則）。
      if (!outsideWhere(where)) {
        bad(
          `${id}: where は ${QUESTION_WHERES.join(" / ")} のどちらかです` +
            "（定義やアプリ側で書けることは、問いではなく助言の担当です）。",
        );
      }
      kind.where = where as Where;
      kind.from = "project";
    } else {
      kind.area = text(node.area, `${id}.area`);
    }
    found.push(kind);
  }
  if (requireAllTriggers) {
    const idle = QUESTION_TRIGGERS.filter((trigger) => !used.has(trigger));
    if (idle.length > 0) {
      bad(
        `どの問いも使っていない引き金があります: ${idle.join(" / ")}` +
          "（拾うだけ拾って誰も聞かない事実は、消すか問いを足してください）。",
      );
    }
  }
  return found;
}

/**
 * 組み込みの問いに、案件が足した問いを重ねる。
 *
 * **同じ印は持てない。** 上書きを許すと「この案件では `erase` の意味が違う」が起きて、
 * 答え（`answers: [erase]`）がどちらに対する答えなのか誰にも分からなくなる。
 */
export function mergeQuestionKinds(
  builtin: QuestionKind[],
  extra: QuestionKind[],
): QuestionKind[] {
  const known = new Set(builtin.map((kind) => kind.id));
  for (const kind of extra) {
    if (known.has(kind.id)) {
      bad(
        `案件の問い "${kind.id}" は組み込みの印と同じです` +
          "（上書きはできません。別の印にしてください）。",
      );
    }
  }
  return [...builtin, ...extra];
}

/** その問いの担当（組み込みは担当の表から、案件のものは書いてあるまま）。 */
export function whereOf(
  kind: QuestionKind,
  catalog: ResponsibilityCatalog,
): Where {
  if (kind.where !== undefined) return kind.where;
  const found = catalog.areas.find((area) => area.id === kind.area);
  return found === undefined ? "outside" : found.where;
}

/**
 * 問いの担当が**枠組みの外側**であることを確かめる。
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
    if (kind.where !== undefined) {
      if (!outsideWhere(kind.where)) {
        bad(`${kind.id}: 「${WHERE_WORDS[kind.where]}」は問いではなく助言の担当です。`);
      }
      continue;
    }
    const where = areas.get(kind.area ?? "");
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

/** 出す問い1件（種類＋それを聞いた事実）。 */
export interface Question {
  kind: QuestionKind;
  /** 誰の担当か。 */
  where: Where;
  /** この問いを出した事実（定義のどこを見たか）。 */
  facts: TriggeredFact[];
}

/** 前書きで片付いたものを拾った結果。 */
export interface AnswerCheck {
  /** 何かを決めて書いた印（`logic` の `answers`）。 */
  answered: Set<string>;
  /** 既定のままでよいと決めた印（`questions.decided`）。 */
  decided: Set<string>;
  /** 答えたつもりで答えられていない所（**黙って無視しない**）。 */
  problems: string[];
}

/**
 * 前書きから「もう片付いた印」を拾う。
 *
 * 綴り違いを黙って捨てると**答えたつもりで問いが出続ける**か、逆に**答えていない問いが
 * 消える**。どちらも嘘なので、拾えなかったものは問題として返す（呼ぶ側が落とす）。
 */
export function answeredBy(
  source: AnswerSource | undefined,
  kinds: QuestionKind[],
  catalog: ResponsibilityCatalog,
): AnswerCheck {
  const answered = new Set<string>();
  const decided = new Set<string>();
  const problems: string[] = [];
  if (source === undefined) return { answered, decided, problems };

  const byId = new Map(kinds.map((kind) => [kind.id, kind]));
  for (const [index, rule] of source.logic.entries()) {
    for (const id of rule.answers ?? []) {
      const kind = byId.get(id);
      if (kind === undefined) {
        problems.push(
          `logic[${index}].answers: "${id}" という問いはありません` +
            "（`npx hatake ask --kinds` で引けます）。",
        );
        continue;
      }
      const expected = whereOf(kind, catalog);
      if (rule.where !== expected) {
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

  for (const [index, one] of source.questions.decided.entries()) {
    if (!byId.has(one.id)) {
      problems.push(
        `questions.decided[${index}]: "${one.id}" という問いはありません` +
          "（`npx hatake ask --kinds` で引けます）。",
      );
      continue;
    }
    if (answered.has(one.id)) {
      // 「何かを決めて書いた」と「何も書かないと決めた」が両方あると、どちらが本当か
      // 分からない（片方を消すのは人の判断なので、道具は決めない）。
      problems.push(
        `questions.decided[${index}]: "${one.id}" は logic の answers でも答えています` +
          "（どちらか片方にしてください）。",
      );
      continue;
    }
    decided.add(one.id);
  }
  return { answered, decided, problems };
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
  options: { answered?: Set<string>; decided?: Set<string> } = {},
): Question[] {
  const facts = factsOf(document);
  const answered = options.answered ?? new Set<string>();
  const decided = options.decided ?? new Set<string>();
  const found: Question[] = [];
  for (const step of QUESTION_STEPS) {
    for (const kind of kinds) {
      if (kind.step !== step) continue;
      if (answered.has(kind.id) || decided.has(kind.id)) continue;
      const mine = facts.filter((fact) => fact.trigger === kind.trigger);
      if (mine.length === 0) continue;
      found.push({ kind, where: whereOf(kind, catalog), facts: mine });
    }
  }
  return found;
}

/** 事実を1行にする（`受注入力: 保存できる画面（type: crud）`）。 */
const factLine = (fact: TriggeredFact): string =>
  fact.page === undefined ? fact.saw : `${fact.page}: ${fact.saw}`;

/** 案件が足した問いには、そう書く（組み込みと混ぜない）。 */
const fromWord = (kind: QuestionKind): string =>
  kind.from === "project" ? "（この案件の決めごと）" : "";

/** 報告に添える数（見ていない所を毎回言うために要る）。 */
export interface QuestionRender {
  /** 見た問いの総数（組み込み＋案件）。 */
  total: number;
  answered?: Set<string>;
  decided?: Set<string>;
  /** 案件が足した問いの数。 */
  fromProject?: number;
}

/** 人が読む形。 */
export function questionLines(
  questions: Question[],
  options: QuestionRender = { total: 0 },
): string[] {
  const out: string[] = [];
  const answered = options.answered?.size ?? 0;
  const decided = options.decided?.size ?? 0;
  // 片付いた件数は**残っていても言う**（黙ると、前書きに書いたものが効いたのか
  // そもそも聞かれなかったのかが分からない）。
  const done: string[] = [];
  if (answered > 0) done.push(`答えが済んでいるもの ${answered}件`);
  if (decided > 0) done.push(`既定のままでよいと決めたもの ${decided}件`);
  const tail = done.length === 0 ? "" : `前書きで${done.join("・")}。`;
  out.push(
    questions.length === 0
      ? `決めていないことは見つかりませんでした。${tail}`
      : `決めてください（${questions.length}件）。${tail}`,
  );

  for (const step of QUESTION_STEPS) {
    const mine = questions.filter((one) => one.kind.step === step);
    if (mine.length === 0) continue;
    out.push("");
    out.push(`${STEP_WORDS[step]}（${mine.length}件）`);
    for (const [at, one] of mine.entries()) {
      out.push("");
      out.push(`${at + 1}. [${one.kind.id}]${fromWord(one.kind)} ${one.kind.ask}`);
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
  out.push(questionNote(options.total, options.fromProject));
  return out;
}

/** 見ていない所を毎回言う（出なかった＝決まっている、にしないため）。 */
export const questionNote = (total: number, fromProject = 0): string =>
  `※ この道具が見るのは **${total} 種類だけ**です` +
  `${fromProject === 0 ? "" : `（うち ${fromProject} 件はこの案件の決めごと）`}。` +
  "出なかった＝決まっている、ではありません（表に無いことは聞きません）。" +
  "**終了コードは変えません**（問いは人への依頼で、機械の合否ではないので）。" +
  "答えが決まったら、案件の前書きの `logic` にその1行を足して `answers: [<印>]` を" +
  "付けてください（既定のままでよいと決めたなら `questions.decided` に理由つきで）" +
  "＝次からその問いは出ません。";

/** 表そのものを引く形（`--kinds`。定義が無くても読める）。 */
export function questionKindLines(
  kinds: QuestionKind[],
  catalog: ResponsibilityCatalog,
): string[] {
  const fromProject = kinds.filter((kind) => kind.from === "project").length;
  const out: string[] = [`人が決めないと決まらないことは ${kinds.length} 種類。`];
  for (const step of QUESTION_STEPS) {
    const mine = kinds.filter((kind) => kind.step === step);
    if (mine.length === 0) continue;
    out.push("");
    out.push(`${STEP_WORDS[step]}（${mine.length}件）`);
    for (const kind of mine) {
      out.push("");
      out.push(`[${kind.id}]${fromWord(kind)} ${kind.ask}`);
      out.push(`  聞く理由: ${kind.why}`);
      out.push(`  決めないと: ${kind.ifNot}`);
      out.push(
        `  誰の担当か: ${WHERE_WORDS[whereOf(kind, catalog)]}` +
          `${kind.area === undefined ? "" : `（担当の表の ${kind.area}）`}`,
      );
      out.push(`  聞く引き金: ${kind.trigger}`);
      out.push(`  答えの書き方: ${kind.answer}`);
    }
  }
  out.push("");
  out.push(questionNote(kinds.length, fromProject));
  return out;
}
