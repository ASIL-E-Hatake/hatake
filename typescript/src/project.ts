// 案件の前書き（この案件は何のシステムか・用語・名前の決めごと）を1枚にする。
//
// 定義を書く道具は揃ったが、**定義の手前**が無かった。「何のシステムで、誰が使い、
// 何ができないか」は定義のどこにも書いていないので、2枚目の画面を頼むたびに人が
// 口で言い直すことになる（言い直さなければ AI は書ける方に倒す）。
//
// 決めごと:
//
// * **書くのは定義に現れるものだけ。** ブランチ名・コミット規約・レビューの回し方は
//   ここに書かない。機械が突き合わせられないものを置くと、必ず腐る（そちらは
//   AGENTS.md / CLAUDE.md の担当）
// * **前書きを定義から生成してはいけない。** 意図（[parseIntent]）と同じ理由で、
//   生成すれば必ず一致するので読む値打ちが無くなる
// * **機械が見る所と、見ない所を分ける。** `system` は人と AI が読むだけ（機械は
//   見ない）。`glossary` と `naming` は定義と突き合わせる。どちらなのかは読み返し
//   （[projectLines]）が毎回言う＝見ていないものを見ているように見せない
// * 知らないキー・知らない名前は**エラー**（助言の物差しと同じ）。設定が黙って
//   効かないのが一番まずい

import { parse as parseYamlText } from "yaml";

import { FieldTypes } from "./definition.js";
import {
  type DecidedQuestion,
  parseQuestionKinds,
  type QuestionKind,
} from "./questions.js";
import { type Where, WHERE_KINDS } from "./responsibility.js";
import { closestKey } from "./strictKeys.js";

/** この形式の版（定義の `dsl_version` と同じ考えで、後方互換のために持つ）。 */
export const PROJECT_VERSION = "1.0";

/** 名前の形。**閉じた集合**（増やすと案件ごとに違う形が生えるので増やさない）。 */
export const NAME_SHAPES = [
  "camelCase",
  "snake_case",
  "PascalCase",
  "kebab-case",
] as const;

export type NameShape = (typeof NAME_SHAPES)[number];

/** 形を決められる名前。定義に**業務の名前として**現れるものだけ。 */
export const NAMING_TARGETS = [
  "page",
  "field",
  "action",
  "repository",
  "role",
] as const;

export type NamingTarget = (typeof NAMING_TARGETS)[number];

/** 用語辞書の1件。 */
export interface GlossaryEntry {
  /** 業務の言葉（画面に出す字）。 */
  term: string;
  /** 定義に書く項目名。 */
  field?: string;
  /** その言葉で呼ばない言い換え。 */
  avoid: string[];
  /** なぜその言葉なのか。 */
  note?: string;
}

/** 外の相手（Repository / プラグインの名前と、その向こうに居るもの）。 */
export interface ExternalSystem {
  name: string;
  what: string;
  owner?: string;
}

/**
 * 業務ロジック1件の置き場。
 *
 * 書けるのは**名前と担当と理由だけ**。条件式を書けるようにしたら業務ロジックの DSL に
 * なり、枠組みが業務を持つことになる（CLAUDE.md の Scope を破る）。
 */
export interface LogicRule {
  /** 何の規則か（業務の言葉で1行）。 */
  what: string;
  /** 誰の担当か（担当の表と同じ閉じた集合）。 */
  where: Where;
  /** その規則の名前（`plugin` は必須。`covers: [logic:<name>]` から指すのにも要る）。 */
  name?: string;
  /** なぜその担当なのか（`outside` は必須）。 */
  why?: string;
  /**
   * この1行で答えた問いの印（`hatake ask` が出す印）。
   *
   * 書くと次からその問いは出ない＝**答えたら消える**。消えることで、問いが実在の穴を
   * 指していた証拠になる（知らない印・担当の食い違いは道具が落とす）。
   */
  answers?: string[];
}

/** 名前の決めごと。**書いたものだけ**入る（空なら見ない）。 */
export interface NamingRules {
  shapes: Partial<Record<NamingTarget, NameShape>>;
  /** 項目の型 → 名前の終わり方（`date` → `Date`）。 */
  suffix: Record<string, string>;
}

/**
 * 案件ごとの問い返し。
 *
 * 組み込みの問い（`spec/question-kinds.json`）は「業務システムで大抵決めていないこと」で、
 * 現場の決めごとは会社ごとに違う（稟議番号の採番規則・保存期間）。渡せないと「合わない
 * から使わない」になるので、**足せる**ようにした。ただし読み手は組み込みと同じ
 * （[parseQuestionKinds]）＝案件の紙にだけ緩い形は書けない。
 */
export interface ProjectQuestions {
  /** この案件で必ず決めること（足す問い）。 */
  ask: QuestionKind[];
  /** 既定のままでよいと決めたもの（もう聞かない）。 */
  decided: DecidedQuestion[];
}

export interface ProjectDocument {
  version: string;
  system: {
    what: string;
    users: string[];
    premises: string[];
    external: ExternalSystem[];
  };
  glossary: GlossaryEntry[];
  /** 業務ロジックの置き場（宣言だけ。実装は持たない）。 */
  logic: LogicRule[];
  naming: NamingRules;
  /** 案件ごとの問い返し（足す問いと、既定のままでよいと決めたもの）。 */
  questions: ProjectQuestions;
}

export class ProjectParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectParseError";
  }
}

const TOP_KEYS = [
  "$comment",
  "project_version",
  "system",
  "glossary",
  "logic",
  "naming",
  "questions",
];
const QUESTIONS_KEYS = ["ask", "decided"];
// `on` は使えない（YAML 1.1 の読み手が真偽値にする＝[YAML11_WORDS]）。
const DECIDED_KEYS = ["id", "why", "date"];
const LOGIC_KEYS = ["what", "where", "name", "why", "answers"];
const SYSTEM_KEYS = ["what", "users", "premises", "external"];
const EXTERNAL_KEYS = ["name", "what", "owner"];
const GLOSSARY_KEYS = ["term", "field", "avoid", "note"];
const NAMING_KEYS = [...NAMING_TARGETS, "suffix"];

const isDict = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const bad = (message: string): never => {
  throw new ProjectParseError(`案件の前書きが読めません: ${message}`);
};

/** 知らないキーは黙って捨てない（捨てると「書いたのに効いていない」が起きる）。 */
function checkKeys(
  node: Record<string, unknown>,
  known: string[],
  at: string,
): void {
  for (const key of Object.keys(node)) {
    if (known.includes(key)) continue;
    const near = closestKey(key, known);
    bad(
      `${at}: 知らないキー "${key}"` +
        `${near === null ? "" : `（${near} の間違い？）`}。`,
    );
  }
}

const strings = (value: unknown, at: string): string[] => {
  if (value === undefined) return [];
  if (!Array.isArray(value)) bad(`${at} は文字の並びで書いてください。`);
  return (value as unknown[]).map((one, index) => {
    if (typeof one !== "string" || one === "") {
      bad(`${at}[${index}] は文字で書いてください。`);
    }
    return one as string;
  });
};

const text = (value: unknown, at: string): string => {
  if (typeof value !== "string" || value === "") {
    bad(`${at} は文字で書いてください。`);
  }
  return value as string;
};

/** 案件の前書きを読む（YAML / JSON どちらでも）。 */
export function parseProject(source: string): ProjectDocument {
  let document: unknown;
  try {
    document = parseYamlText(source);
  } catch (error) {
    return bad(error instanceof Error ? error.message : String(error));
  }
  if (!isDict(document)) bad("map として読めません。");
  const node = document as Record<string, unknown>;
  checkKeys(node, TOP_KEYS, "前書き");

  const version = node.project_version;
  if (version !== PROJECT_VERSION) {
    bad(
      `project_version は "${PROJECT_VERSION}" と書いてください` +
        `（いまの版はこれだけ。渡されたのは ${JSON.stringify(version)}）。`,
    );
  }

  return {
    version: PROJECT_VERSION,
    system: parseSystem(node.system),
    glossary: parseGlossary(node.glossary),
    logic: parseLogic(node.logic),
    naming: parseNaming(node.naming),
    questions: parseQuestions(node.questions),
  };
}

/**
 * 案件ごとの問い返し。
 *
 * 足す問いは**組み込みと同じ読み手**を通す（形が違うと、案件の紙にだけ緩い問いが書ける
 * ことになる）。`decided` の `why` を必須にしてあるのは `where: outside` と同じ考えで、
 * 理由の無い決定は後から誰も直せないから＝「なぜ聞かれなくなったのか」が消える。
 */
function parseQuestions(value: unknown): ProjectQuestions {
  if (value === undefined) return { ask: [], decided: [] };
  if (!isDict(value)) bad("questions は map で書いてください。");
  const node = value as Record<string, unknown>;
  checkKeys(node, QUESTIONS_KEYS, "questions");

  let ask: QuestionKind[] = [];
  if (node.ask !== undefined) {
    if (!Array.isArray(node.ask)) bad("questions.ask は並びで書いてください。");
    try {
      ask = parseQuestionKinds(node.ask, {
        from: "project",
        requireAllTriggers: false,
      });
    } catch (error) {
      bad(error instanceof Error ? error.message : String(error));
    }
  }

  const decided: DecidedQuestion[] = [];
  if (node.decided !== undefined) {
    if (!Array.isArray(node.decided)) {
      bad("questions.decided は並びで書いてください。");
    }
    const seen = new Set<string>();
    for (const [index, one] of (node.decided as unknown[]).entries()) {
      const at = `questions.decided[${index}]`;
      if (!isDict(one)) bad(`${at} は map で書いてください。`);
      const item = one as Record<string, unknown>;
      checkKeys(item, DECIDED_KEYS, at);
      const id = text(item.id, `${at}.id`);
      if (seen.has(id)) bad(`${at}: "${id}" が2回出てきます。`);
      seen.add(id);
      decided.push({
        id,
        why: text(item.why, `${at}.why`),
        ...(item.date === undefined
          ? {}
          : { date: text(item.date, `${at}.date`) }),
      });
    }
  }
  return { ask, decided };
}

function parseSystem(value: unknown): ProjectDocument["system"] {
  if (!isDict(value)) {
    bad("system は要ります（何のシステムかを1〜3行で書いてください）。");
  }
  const node = value as Record<string, unknown>;
  checkKeys(node, SYSTEM_KEYS, "system");
  return {
    what: text(node.what, "system.what"),
    users: strings(node.users, "system.users"),
    premises: strings(node.premises, "system.premises"),
    external: parseExternal(node.external),
  };
}

function parseExternal(value: unknown): ExternalSystem[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) bad("system.external は並びで書いてください。");
  return (value as unknown[]).map((one, index) => {
    const at = `system.external[${index}]`;
    if (!isDict(one)) bad(`${at} は map で書いてください。`);
    const node = one as Record<string, unknown>;
    checkKeys(node, EXTERNAL_KEYS, at);
    return {
      name: text(node.name, `${at}.name`),
      what: text(node.what, `${at}.what`),
      ...(node.owner === undefined
        ? {}
        : { owner: text(node.owner, `${at}.owner`) }),
    };
  });
}

function parseGlossary(value: unknown): GlossaryEntry[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) bad("glossary は並びで書いてください。");
  const found = (value as unknown[]).map((one, index) => {
    const at = `glossary[${index}]`;
    if (!isDict(one)) bad(`${at} は map で書いてください。`);
    const node = one as Record<string, unknown>;
    checkKeys(node, GLOSSARY_KEYS, at);
    return {
      term: text(node.term, `${at}.term`),
      ...(node.field === undefined
        ? {}
        : { field: text(node.field, `${at}.field`) }),
      avoid: strings(node.avoid, `${at}.avoid`),
      ...(node.note === undefined ? {} : { note: text(node.note, `${at}.note`) }),
    };
  });
  // 同じ言葉を2回決めると、どちらが正か分からない。
  const seen = new Set<string>();
  for (const entry of found) {
    if (seen.has(entry.term)) bad(`glossary の "${entry.term}" が2回出てきます。`);
    seen.add(entry.term);
  }
  // 「呼ばない言葉」が別の項目の見出し語になっていたら、辞書が自分と食い違っている。
  const terms = new Set(found.map((entry) => entry.term));
  for (const entry of found) {
    for (const word of entry.avoid) {
      if (terms.has(word)) {
        bad(
          `glossary: "${word}" は見出し語なのに、"${entry.term}" の avoid にも` +
            "書いてあります（どちらで呼ぶのかが決まりません）。",
        );
      }
    }
  }
  return found;
}

/**
 * 業務ロジックの宣言を読む。
 *
 * 縛るのは2つだけで、どちらも**後から効かせるため**:
 *   ・`plugin` は `name` 必須＝定義の `plugin:` と突き合わせられるようにする
 *   ・`outside` は `why` 必須＝外に置くと決めた理由が無いと、後から誰も直せない
 */
function parseLogic(value: unknown): LogicRule[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) bad("logic は並びで書いてください。");
  const found = (value as unknown[]).map((one, index) => {
    const at = `logic[${index}]`;
    if (!isDict(one)) bad(`${at} は map で書いてください。`);
    const node = one as Record<string, unknown>;
    checkKeys(node, LOGIC_KEYS, at);
    const where = node.where;
    if (typeof where !== "string" || !WHERE_KINDS.includes(where as Where)) {
      bad(
        `${at}.where は ${WHERE_KINDS.join(" / ")} のどれかです` +
          `（\`npx hatake where <やりたいこと>\` で引いた区分を書いてください）。`,
      );
    }
    const rule: LogicRule = {
      what: text(node.what, `${at}.what`),
      where: where as Where,
      ...(node.name === undefined ? {} : { name: text(node.name, `${at}.name`) }),
      ...(node.why === undefined ? {} : { why: text(node.why, `${at}.why`) }),
      ...(node.answers === undefined
        ? {}
        : { answers: strings(node.answers, `${at}.answers`) }),
    };
    if (rule.where === "plugin" && rule.name === undefined) {
      bad(
        `${at}: where が plugin なら name が要ります` +
          "（定義の `plugin:` に書く字と同じにする＝登録されているかを機械が見られる）。",
      );
    }
    if (rule.where === "outside" && rule.why === undefined) {
      bad(
        `${at}: where が outside なら why が要ります` +
          "（外に置くと決めた理由が無いと、後から誰も直せない）。",
      );
    }
    return rule;
  });
  const seen = new Set<string>();
  for (const rule of found) {
    if (rule.name === undefined) continue;
    if (seen.has(rule.name)) bad(`logic の "${rule.name}" が2回出てきます。`);
    seen.add(rule.name);
  }
  return found;
}

function parseNaming(value: unknown): NamingRules {
  if (value === undefined) return { shapes: {}, suffix: {} };
  if (!isDict(value)) bad("naming は map で書いてください。");
  const node = value as Record<string, unknown>;
  checkKeys(node, NAMING_KEYS, "naming");

  const shapes: Partial<Record<NamingTarget, NameShape>> = {};
  for (const target of NAMING_TARGETS) {
    const given = node[target];
    if (given === undefined) continue;
    if (typeof given !== "string" || !NAME_SHAPES.includes(given as NameShape)) {
      bad(
        `naming.${target} は ${NAME_SHAPES.join(" / ")} のどれかです` +
          `（渡されたのは ${JSON.stringify(given)}）。`,
      );
    }
    shapes[target] = given as NameShape;
  }

  const suffix: Record<string, string> = {};
  if (node.suffix !== undefined) {
    if (!isDict(node.suffix)) bad("naming.suffix は map で書いてください。");
    const types = Object.keys(FieldTypes);
    for (const [type, ending] of Object.entries(
      node.suffix as Record<string, unknown>,
    )) {
      if (!types.includes(type)) {
        const near = closestKey(type, types);
        bad(
          `naming.suffix: "${type}" という項目の型はありません` +
            `${near === null ? "" : `（${near} の間違い？）`}` +
            `。書けるのは ${types.join(" / ")}。`,
        );
      }
      suffix[type] = text(ending, `naming.suffix.${type}`);
    }
  }
  return { shapes, suffix };
}

/**
 * 何の名前かを人の言葉で。助言・読み返し・貼る断片で**同じ字**を使うため1か所に置く。
 */
export const NAMING_WORDS: Record<NamingTarget, string> = {
  page: "画面 id",
  field: "項目名",
  action: "ボタン id",
  repository: "Repository キー",
  role: "役割名",
};

/**
 * 「画面 id は」「項目名は」。英字で終わる言葉だけ助詞の前を空ける
 * （`項目名 は` は読みにくく、`id は` は空けないと読みにくい）。
 */
export const namingSubject = (target: NamingTarget): string =>
  `${NAMING_WORDS[target]}${/[A-Za-z0-9]$/.test(NAMING_WORDS[target]) ? " " : ""}は`;

/** 雛形の埋め忘れの印。名前として見ない（形を直すと目立たなくなる）。 */
export const isPlaceholderName = (name: string): boolean =>
  name.startsWith("TODO_");

const SHAPE_TESTS: Record<NameShape, RegExp> = {
  camelCase: /^[a-z][a-zA-Z0-9]*$/,
  snake_case: /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/,
  PascalCase: /^[A-Z][a-zA-Z0-9]*$/,
  "kebab-case": /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/,
};

/** その名前が決めごとの形になっているか。 */
export const matchesShape = (name: string, shape: NameShape): boolean =>
  SHAPE_TESTS[shape].test(name);

/** 名前を語に割る（`orderDate` / `order_date` / `order-date` → ["order","date"]）。 */
export function nameWords(name: string): string[] {
  return name
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(" ")
    .filter((word) => word !== "")
    .map((word) => word.toLowerCase());
}

/** 名前を決めごとの形に直す（`TODO_` の印はそのまま）。 */
export function toShape(name: string, shape: NameShape): string {
  if (isPlaceholderName(name)) return name;
  const words = nameWords(name);
  if (words.length === 0) return name;
  const upper = (word: string): string =>
    `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`;
  switch (shape) {
    case "camelCase":
      return words.map((word, at) => (at === 0 ? word : upper(word))).join("");
    case "PascalCase":
      return words.map(upper).join("");
    case "snake_case":
      return words.join("_");
    case "kebab-case":
      return words.join("-");
  }
}
