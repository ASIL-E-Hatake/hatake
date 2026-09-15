// AI の1往復を1本で回す（`hatake check` ／ MCP の `hatake_check`）。
//
// いま AI は定義を書いたあと `validate` → `explain` → `advise` → `ask` を別々に呼ぶ。
// 4回ぶんの往復と、4回ぶんの「読んだもの」が文脈に積まれる。そして順番は MCP の説明が
// 渡しているだけなので、**守らなかったときに誰も気づけない**（`validate` だけかけて
// 「通りました」と言う AI は実際に居る）。1本にすれば、順番を覚えなくてよくなる。
//
// 大事なのは**混ぜないこと**。1枚にまとめるときに、いちばん壊れやすいのがここ:
//
//   ・事実（警告）… 書いたのに効かない。CI で落としてよい。
//   ・読み返し（explain）… そう書いてある、と言い直しただけ。良し悪しは言わない。
//   ・好み（advise）… 書いていないと不便かも。**終了コードを動かさない**。
//   ・人が決めること（ask）… 定義に書けないので、道具はどちらとも言えない。
//
// だから欄を分けたまま並べる（同じ配列に混ぜない・件数も別に数える）。混ぜた瞬間に
// 「助言を直さないと CI が赤い」になり、そうなると事実の側まで読まれなくなる。
//
// 組み立てがこのファイルに在るのは、**CLI と MCP が同じ道を通るため**（別々に組むと、
// 片方だけ下書きを添えたり片方だけ印を見なかったりして、同じ定義について違う件数を
// 言い出す）。ここが受け取るのは既に読んだもの（一覧・前書き・問いの表）だけで、
// ファイルは読まない。
//
// `design` との線: あちらは**人に渡す紙**（Markdown・意図の1枚つき・合否なし）。
// こちらは**AI が1往復で引く紙**（JSON・警告つき・合否あり）。

import { parse as parseSource } from "yaml";
import { type Advice, ADVICE_NOTE, findAdvice } from "./advise.js";
import { withDrafts } from "./adviseDraft.js";
import {
  adviceRuleNames,
  applyAdviseOff,
  parseAdviseOff,
  type SilencedAdvice,
  silencedNote,
} from "./adviseOff.js";
import { type AdviceRules, DEFAULT_RULES } from "./adviseRules.js";
import { type AppBrief, briefSource, type PageBrief, renderBrief } from "./explainBrief.js";
import { type ExplainDocument, renderExplain } from "./explain.js";
import { explainSource } from "./explainSource.js";
import { type ProjectDocument } from "./project.js";
import { findProjectAdvice } from "./projectAdvise.js";
import {
  answeredBy,
  askQuestions,
  checkQuestionAreas,
  type Question,
  type QuestionKind,
  questionLines,
} from "./questions.js";
import { type DefinitionRegistry } from "./refs.js";
import { type ResponsibilityCatalog } from "./responsibility.js";
import { type DefinitionWarning, findWarnings } from "./warnings.js";

type Dict = Record<string, unknown>;

/** 事実の欄（**旗で落とせない**）。 */
export interface CheckFacts {
  warnings: DefinitionWarning[];
  /**
   * 登録済みの一覧を渡されたか（1行）。
   *
   * 渡されていないと、**画面の外との辻褄は見ていない**（登録していない Repository も
   * プラグインも言えない）。ここを黙ると、警告ゼロが「全部見て何も無かった」に見える。
   */
  registry: string;
}

/** 読み返しの欄。 */
export interface CheckReadback {
  brief: PageBrief | AppBrief;
  /** 1画面に決まっているときだけ全文（app ぜんたいでは重すぎる）。 */
  explain?: ExplainDocument;
}

/** 好みの欄。 */
export interface CheckPreferences {
  advice: Advice[];
  /** 定義の隣の印で黙らせた助言（印が無ければ undefined）。 */
  silenced?: SilencedAdvice;
}

/** 人が決めることの欄。 */
export interface CheckQuestions {
  list: Question[];
  /** 見た問いの総数（組み込み＋会社＋案件）。 */
  total: number;
  /** 前書きで答えた印。 */
  answered: string[];
  /** 既定のままでよいと決めた印。 */
  decided: string[];
  fromProject: number;
}

/** 入れなかった欄と、その理由。**節を消さずに理由を書く**。 */
export interface CheckOmitted {
  part: string;
  why: string;
}

/** 1往復ぶんの紙。 */
export interface CheckSheet {
  /** 読んだ定義（ファイル名か、渡された印）。 */
  from: string;
  /** `page` か `app`（呼ぶ側が既に解析して付けた言い方）。 */
  kind: string;
  facts: CheckFacts;
  readback?: CheckReadback;
  preferences?: CheckPreferences;
  questions?: CheckQuestions;
  omitted: CheckOmitted[];
  /** 次の1手（この紙を読んだ AI が何をするか）。 */
  next: string[];
  /** この紙に言えないこと（JSON で読む側にも必ず届く）。 */
  note: string;
}

/** 欄の名前（JSON のキーと、人が読む見出しを1か所で対応させる）。 */
export const CHECK_PARTS = {
  facts: "事実（書いたのに効かない）",
  readback: "読み返し（そう書いてある）",
  preferences: "好み（書いていないと不便かも）",
  questions: "人が決めること（定義に書けない）",
} as const;

/** 組み立てに要るもの。**ファイルは読まない**（読んだものを渡す）。 */
export interface CheckInput {
  from: string;
  kind: string;
  source: string;
  /** app の中の1枚に絞る。 */
  page?: string;
  registry?: DefinitionRegistry;
  /** その一覧が動いているアプリの申告だったか。 */
  registryFromApp?: boolean;
  rules?: AdviceRules;
  project?: ProjectDocument;
  /** 問いの表と担当の表（両方そろっているときだけ問いの欄を作る）。 */
  questions?: { kinds: QuestionKind[]; areas: ResponsibilityCatalog };
  /**
   * 落とす欄と、その理由。
   *
   * 理由を呼ぶ側が持つのは、**旗の名前が入口ごとに違う**から（CLI は `--no-advise`、
   * MCP は `parts`）。落ちた欄は消さずに「入れなかった欄」に出る。
   */
  drop?: { readback?: string; preferences?: string; questions?: string };
}

/** 一覧を渡されたかの1行（言い方は1か所）。 */
const registryLine = (input: CheckInput): string => {
  if (input.registry === undefined) {
    return (
      "登録済みの一覧は渡されていません＝**画面の外との辻褄は見ていません**" +
      "（登録していない Repository・プラグイン・出す口は言えません）。" +
      "hatake registry で作れます。"
    );
  }
  return (
    `登録済みの一覧を見ました（${
      input.registryFromApp === true ? "動いているアプリの申告" : "渡された一覧"
    }）。繋がっていない所を1枚で見るなら hatake gaps。`
  );
};

/**
 * 1枚に組み立てる。
 *
 * 新しい判断はしない＝どの欄も、その道具が単体で通る道をそのまま通す（別の数え方を
 * した瞬間に、道具ごとに違うことを言う紙になる）。
 */
export function buildCheckSheet(input: CheckInput): CheckSheet {
  const raw = asDict(input.source);
  const omitted: CheckOmitted[] = [];
  const sheet: CheckSheet = {
    from: input.from,
    kind: input.kind,
    facts: {
      warnings: findWarnings(raw, {
        ...(input.registry === undefined ? {} : { registry: input.registry }),
        registryFromApp: input.registryFromApp === true,
      }),
      registry: registryLine(input),
    },
    omitted,
    next: [],
    note: CHECK_NOTE,
  };

  const drop = input.drop ?? {};
  const only = input.page === undefined ? {} : { page: input.page };

  if (drop.readback !== undefined) {
    omitted.push({ part: CHECK_PARTS.readback, why: drop.readback });
  } else {
    const brief = briefSource(input.source, only);
    const single = !("pages" in brief);
    sheet.readback = {
      brief,
      ...(single ? { explain: explainSource(input.source, only) } : {}),
    };
    if (!single) {
      omitted.push({
        part: "読み返しの全文",
        why:
          `画面が ${brief.pages.length} 枚あるので1行ずつにしました` +
          "（画面を1枚に絞ると、その画面の全文になります）。",
      });
    }
  }

  if (drop.preferences !== undefined) {
    omitted.push({ part: CHECK_PARTS.preferences, why: drop.preferences });
  } else {
    const off = adviceOf(raw, input);
    sheet.preferences = {
      advice: off.kept,
      ...(off.marks.length === 0 ? {} : { silenced: off }),
    };
  }

  if (drop.questions !== undefined) {
    omitted.push({ part: CHECK_PARTS.questions, why: drop.questions });
  } else if (input.questions === undefined) {
    omitted.push({
      part: CHECK_PARTS.questions,
      why:
        "問いの表が読めませんでした＝**数えていません**（0 件ではありません）。" +
        "spec/question-kinds.json と spec/responsibility.json が要ります。",
    });
  } else {
    sheet.questions = questionsOf(raw, input.questions, input.project);
  }

  sheet.next = nextSteps(sheet);
  return sheet;
}

/** 定義（map）として読む。読めないものは読み返せないので投げる。 */
function asDict(source: string): Dict {
  // 解析そのものは呼ぶ側が済ませている（kind を付けるため）ので、ここは形だけ見る。
  const document: unknown = parseSource(source);
  if (typeof document !== "object" || document === null || Array.isArray(document)) {
    throw new Error("定義（map）として読めません。");
  }
  return document as Dict;
}

/** 助言（下書きつき）と、定義の隣の印。 */
function adviceOf(raw: Dict, input: CheckInput): SilencedAdvice {
  const rules = input.rules ?? DEFAULT_RULES;
  const all = withDrafts(raw, [
    ...findAdvice(raw, rules),
    // 案件の決めごと（名前・用語）は、前書きが在るときだけ。
    ...(input.project === undefined
      ? []
      : findProjectAdvice(raw, input.project, rules, {
          ...(input.registry === undefined ? {} : { registry: input.registry }),
        })),
  ]);
  const mine =
    input.page === undefined ? all : all.filter((one) => one.page === input.page);
  return applyAdviseOff(mine, parseAdviseOff(input.source, adviceRuleNames(rules)));
}

/** 問い（`ask` と同じ道）。答えたつもりで答えていなければ投げる。 */
function questionsOf(
  raw: Dict,
  table: { kinds: QuestionKind[]; areas: ResponsibilityCatalog },
  project: ProjectDocument | undefined,
): CheckQuestions {
  checkQuestionAreas(table.kinds, table.areas);
  const answers = answeredBy(project, table.kinds, table.areas);
  if (answers.problems.length > 0) {
    // 答えたつもりで答えていないのは**事実の間違い**なので、紙に載せる前に言う。
    throw new Error(answers.problems.join("\n"));
  }
  return {
    list: askQuestions(raw, table.kinds, table.areas, {
      answered: answers.answered,
      decided: answers.decided,
    }),
    total: table.kinds.length,
    answered: [...answers.answered],
    decided: [...answers.decided],
    fromProject: table.kinds.filter((one) => one.from !== undefined).length,
  };
}

/**
 * 次の1手。
 *
 * **数を言って、道具の名前を言う**だけ。何を直すべきかは各欄が言っているので、ここで
 * 優先順位を決めない（決めると「助言を先に直す AI」が生まれる）。
 */
export function nextSteps(sheet: CheckSheet): string[] {
  const out: string[] = [];
  const warnings = sheet.facts.warnings.length;
  if (warnings > 0) {
    out.push(
      `事実の直しが ${warnings} 件（書いたのに効かない所）。綴り違いのような**一意な` +
        "直し**は hatake fix で当てられます。ここは好みではないので、直してから次へ。",
    );
  }
  const advice = sheet.preferences?.advice.length ?? 0;
  if (advice > 0) {
    out.push(
      `好みが ${advice} 件（書いていないと不便かも）。当てるなら hatake advise --apply、` +
        "案件で要らないと決めたなら物差しの off か定義の印（# advise-off:）。" +
        "**直さなくても CI は赤くなりません**。",
    );
  }
  const questions = sheet.questions?.list.length ?? 0;
  if (questions > 0) {
    out.push(
      `人に聞くことが ${questions} 件。**AI が決めて書いてはいけません**` +
        "（答えは業務の判断で、当てると嘘の設計書ができます）。決まったら前書きの " +
        "logic に1行足して answers を付けてください。",
    );
  }
  if (out.length === 0) {
    out.push(
      "道具から言うことはありません（この定義について、事実・好み・問いのどれも" +
        "残っていません）。",
    );
  }
  return out;
}

/** 人が読む形。 */
export function checkLines(sheet: CheckSheet): string[] {
  const out = [`${sheet.from}（${sheet.kind}）を1回で見ました。`];

  out.push("");
  out.push(`## ${CHECK_PARTS.facts}`);
  out.push(sheet.facts.registry);
  if (sheet.facts.warnings.length === 0) {
    out.push("警告はありません。");
  } else {
    out.push(`警告が ${sheet.facts.warnings.length} 件:`);
    for (const one of sheet.facts.warnings) {
      out.push(`  ${one.path}: ${one.message} [${one.rule}]`);
      out.push(`    → ${one.fix}`);
    }
  }

  if (sheet.readback !== undefined) {
    out.push("");
    out.push(`## ${CHECK_PARTS.readback}`);
    out.push(
      sheet.readback.explain === undefined
        ? renderBrief(sheet.readback.brief)
        : renderExplain(sheet.readback.explain),
    );
  }

  if (sheet.preferences !== undefined) {
    out.push("");
    out.push(`## ${CHECK_PARTS.preferences}`);
    const advice = sheet.preferences.advice;
    out.push(
      advice.length === 0
        ? "書き足したほうがいい所は見つかりませんでした。"
        : `書き足すと良さそうな所が ${advice.length} 件:`,
    );
    for (const one of advice) {
      out.push(`  ${one.where} [${one.rule}]`);
      out.push(`    こうなる: ${one.says}`);
      out.push(`    書き足す: ${one.add}`);
    }
    if (sheet.preferences.silenced !== undefined) {
      out.push(silencedNote(sheet.preferences.silenced));
    }
    out.push(ADVICE_NOTE);
  }

  if (sheet.questions !== undefined) {
    out.push("");
    out.push(`## ${CHECK_PARTS.questions}`);
    out.push(
      ...questionLines(sheet.questions.list, {
        total: sheet.questions.total,
        answered: new Set(sheet.questions.answered),
        decided: new Set(sheet.questions.decided),
        fromProject: sheet.questions.fromProject,
      }),
    );
  }

  if (sheet.omitted.length > 0) {
    out.push("");
    out.push("## 入れなかった欄");
    for (const one of sheet.omitted) out.push(`  ${one.part} … ${one.why}`);
  }

  out.push("");
  out.push("## 次の1手");
  for (const one of sheet.next) out.push(`  ・${one}`);
  out.push("");
  out.push(sheet.note);
  return out;
}

/** この紙に言えないことを毎回書く。 */
export const CHECK_NOTE =
  "※ この紙は hatake validate / explain / advise / ask を1回で回したものです" +
  "（**欄は混ぜていません**＝終了コードを動かすのは事実の欄だけ）。" +
  "**動かしてはいません**＝その値でいくらになるか・押せるかは hatake run の担当、" +
  "画面の外との辻褄（登録していない Repository やプラグイン）は" +
  "登録済みの一覧を渡したときだけ見ます。" +
  "人に渡す1枚が要るなら hatake design（あちらは意図の1枚と突き合わせる紙で、合否は" +
  "言いません）。";
