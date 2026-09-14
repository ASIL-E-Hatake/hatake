// 案件の前書きが、いま何件言えているか（`hatake project --coverage`）。
//
// 前書きは**足していく紙**なので、育っているかが見えないと放置される（1枚書いて満足
// して、画面が 30 枚になっても用語が3語のまま）。育ち具合は機械が数えられる ──
// 定義の側に項目名もラベルも全部あるので。
//
// 決めごと:
//
// * **数える元は既にある walk を使う**（[pageParts]）。助言が見ている所と数える所が
//   別々になると、「辞書に載っている」と言われた項目が助言では鳴る、が起きる
// * **数えていないものを必ず言う。** `system` と `premises` は誰も突き合わせていない
//   （読み返しが毎回言うのと同じ理由）。数字が出ると「全部見た」に見えるので、ここは
//   いつもより強く言う
// * **点数を付けない。** 割合は出すが「80点」のような総合点は作らない（辞書が要らない
//   案件もあるので、少ないことが悪いとは限らない）

import {
  rawFormFields,
  searchFilters,
  tableColumns,
} from "./pageParts.js";
import { NAMING_TARGETS, type ProjectDocument } from "./project.js";
import { type Where, WHERE_KINDS, WHERE_WORDS } from "./responsibility.js";

type Dict = Record<string, unknown>;

const isDict = (v: unknown): v is Dict =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const str = (v: unknown): string | undefined =>
  typeof v === "string" ? v : undefined;

const dicts = (v: unknown): Dict[] => (Array.isArray(v) ? v.filter(isDict) : []);

/** 棚卸しの結果。 */
export interface ProjectCoverage {
  /** 読んだ画面の数。 */
  pages: number;
  /** 定義に出てくる項目名（重複を除く）。 */
  fields: number;
  glossary: {
    /** 辞書の語数。 */
    terms: number;
    /** そのうち項目名を名指ししている語。 */
    named: number;
    /** 名指ししたのに**定義のどこにも無い**項目名（辞書が腐っている印）。 */
    missing: string[];
    /** 定義の項目名のうち、辞書が名指ししている数。 */
    covered: number;
  };
  naming: {
    /** 形を決めた対象の数。 */
    shapes: number;
    /** 決められる対象の数。 */
    targets: number;
    /** 型ごとの終わり方の数。 */
    suffix: number;
  };
  logic: {
    total: number;
    byWhere: Record<Where, number>;
  };
  questions: {
    /** 案件が足した問い。 */
    added: number;
    /** 答えを書いた問い。 */
    answered: number;
    /** 既定のままでよいと決めた問い。 */
    decided: number;
    /** まだ答えていない問い（定義を渡したときだけ数えられる）。 */
    open?: number;
  };
}

/** 定義に出てくる項目名を集める（助言と同じ walk）。 */
function fieldNames(documents: Dict[]): Set<string> {
  const found = new Set<string>();
  for (const page of pagesOf(documents)) {
    for (const part of [
      ...tableColumns(page),
      ...searchFilters(page),
      ...rawFormFields(page),
    ]) {
      const name = str(part.node.field);
      if (name !== undefined) found.add(name);
    }
  }
  return found;
}

const pagesOf = (documents: Dict[]): Dict[] => {
  const found: Dict[] = [];
  for (const document of documents) {
    const app = isDict(document.app) ? document.app : undefined;
    if (app !== undefined) found.push(...dicts(app.pages));
    if (isDict(document.page)) found.push(document.page);
  }
  return found;
};

/**
 * 数える。[documents] が空なら定義の側は数えない（前書きだけを数える）。
 *
 * `open`（まだ答えていない問い）は呼ぶ側が渡す＝問いを起こすには組み込みの表と担当の
 * 表が要るので、この層では持たない（同じ数え方が2つできるのを避ける）。
 */
export function projectCoverage(
  project: ProjectDocument,
  documents: Dict[] = [],
  options: { open?: number } = {},
): ProjectCoverage {
  const fields = fieldNames(documents);
  const named = project.glossary
    .map((entry) => entry.field)
    .filter((one): one is string => one !== undefined);
  const byWhere = Object.fromEntries(
    WHERE_KINDS.map((where) => [
      where,
      project.logic.filter((rule) => rule.where === where).length,
    ]),
  ) as Record<Where, number>;

  return {
    pages: pagesOf(documents).length,
    fields: fields.size,
    glossary: {
      terms: project.glossary.length,
      named: named.length,
      // 定義を渡していなければ「無い」とは言えない（数えていないだけなので空）。
      missing:
        documents.length === 0 ? [] : named.filter((one) => !fields.has(one)),
      covered: named.filter((one) => fields.has(one)).length,
    },
    naming: {
      shapes: NAMING_TARGETS.filter(
        (target) => project.naming.shapes[target] !== undefined,
      ).length,
      targets: NAMING_TARGETS.length,
      suffix: Object.keys(project.naming.suffix).length,
    },
    logic: { total: project.logic.length, byWhere },
    questions: {
      added: project.questions.ask.length,
      answered: project.logic.reduce(
        (sum, rule) => sum + (rule.answers ?? []).length,
        0,
      ),
      decided: project.questions.decided.length,
      ...(options.open === undefined ? {} : { open: options.open }),
    },
  };
}

/** 人が読む形。 */
export function coverageLines(coverage: ProjectCoverage): string[] {
  const out: string[] = [];
  out.push(
    coverage.pages === 0
      ? "決めごとの棚卸し（定義を渡していないので、前書きの側だけ数えました）。"
      : `決めごとの棚卸し（画面 ${coverage.pages} 枚・項目 ${coverage.fields} 個を読みました）。`,
  );

  out.push("");
  out.push(
    `用語: ${coverage.glossary.terms}語` +
      `（項目名を名指ししているのは ${coverage.glossary.named}語）`,
  );
  if (coverage.pages > 0) {
    out.push(
      `  定義の項目 ${coverage.fields} 個のうち、辞書が名指ししているのは ` +
        `${coverage.glossary.covered} 個`,
    );
    for (const one of coverage.glossary.missing) {
      out.push(`  ・"${one}" は辞書にありますが、定義のどこにも出てきません`);
    }
  }

  out.push("");
  out.push(
    `名前の決めごと: ${coverage.naming.shapes}/${coverage.naming.targets} の対象に形を決めた` +
      `（型ごとの終わり方 ${coverage.naming.suffix}件）`,
  );

  out.push("");
  out.push(`業務ロジックの置き場: ${coverage.logic.total}件`);
  for (const where of WHERE_KINDS) {
    const count = coverage.logic.byWhere[where];
    if (count === 0) continue;
    out.push(`  ・${WHERE_WORDS[where]} ${count}件`);
  }

  out.push("");
  const { questions } = coverage;
  out.push(
    `問い返し: 答えた ${questions.answered}件・既定のままでよいと決めた ` +
      `${questions.decided}件・この案件で足した問い ${questions.added}件` +
      `${questions.open === undefined ? "" : `・まだ答えていない ${questions.open}件`}`,
  );
  if (questions.open === undefined) {
    out.push("  （まだ答えていない数は、定義を渡すと出ます）");
  }

  out.push("");
  out.push(COVERAGE_NOTE);
  return out;
}

/** 数えていないものを毎回言う（数字が出ると「全部見た」に見えるので）。 */
export const COVERAGE_NOTE =
  "※ 数えたのは**機械が突き合わせられるもの**だけです。この案件の説明（`system`）と" +
  "業務の前提（`premises`）は**誰も突き合わせていません**（人と AI が読むだけ）ので、" +
  "ここには出ません。数が少ないことが悪いとも限りません（辞書が要らない案件もあります）" +
  "＝総合点は付けません。";

/** 前回と比べた1件。 */
export interface CoverageChange {
  /** 何の数か（人が読む言葉）。 */
  what: string;
  before: number;
  after: number;
}

/** 前回と比べた結果。 */
export interface CoverageDiff {
  /** 増えたもの。 */
  grew: CoverageChange[];
  /** 減ったもの（**事実として強い**ので分ける）。 */
  shrank: CoverageChange[];
  /** 変わらなかったもの。 */
  same: CoverageChange[];
}

/** 比べる数（ここに無いものは比べない＝増やすときはここに足す）。 */
const COUNTED: { what: string; of: (one: ProjectCoverage) => number }[] = [
  { what: "画面", of: (one) => one.pages },
  { what: "定義の項目", of: (one) => one.fields },
  { what: "用語", of: (one) => one.glossary.terms },
  { what: "項目名を名指しした用語", of: (one) => one.glossary.named },
  { what: "名前の決めごと", of: (one) => one.naming.shapes },
  { what: "業務ロジックの置き場", of: (one) => one.logic.total },
  { what: "答えた問い", of: (one) => one.questions.answered },
  { what: "既定のままでよいと決めた問い", of: (one) => one.questions.decided },
  { what: "この案件で足した問い", of: (one) => one.questions.added },
];

/** 前回の棚卸し（`--coverage --json` の出力）として読めるか。 */
export function parseCoverage(value: unknown): ProjectCoverage {
  const ok =
    typeof value === "object" &&
    value !== null &&
    typeof (value as ProjectCoverage).pages === "number" &&
    typeof (value as ProjectCoverage).glossary === "object" &&
    typeof (value as ProjectCoverage).questions === "object";
  if (!ok) {
    // 黙って 0 と比べると「全部増えた」と出る（前回が読めなかっただけなのに）。
    throw new Error(
      "前回の棚卸しとして読めません（`hatake project --coverage --json` の出力を渡してください）。",
    );
  }
  return value as ProjectCoverage;
}

/**
 * 前回と比べる。
 *
 * **良し悪しは言わない。** 「増えていない」は事実だが、悪いとは限らない（用語が
 * 増えないのは、その領域が固まったからかもしれない）。読む人が決める。
 */
export function compareCoverage(
  before: ProjectCoverage,
  after: ProjectCoverage,
): CoverageDiff {
  const diff: CoverageDiff = { grew: [], shrank: [], same: [] };
  for (const one of COUNTED) {
    const change = { what: one.what, before: one.of(before), after: one.of(after) };
    if (change.after > change.before) diff.grew.push(change);
    else if (change.after < change.before) diff.shrank.push(change);
    else diff.same.push(change);
  }
  return diff;
}

/** 人が読む形。 */
export function coverageDiffLines(diff: CoverageDiff): string[] {
  const out: string[] = ["前回からの移り変わり:"];
  const line = (one: CoverageChange): string =>
    `  ・${one.what}: ${one.before} → ${one.after}`;
  if (diff.shrank.length > 0) {
    out.push("");
    out.push("減ったもの:");
    for (const one of diff.shrank) out.push(line(one));
  }
  if (diff.grew.length > 0) {
    out.push("");
    out.push("増えたもの:");
    for (const one of diff.grew) out.push(line(one));
  }
  const stuck = diff.same.filter((one) => one.after > 0 || one.before > 0);
  if (stuck.length > 0) {
    out.push("");
    out.push("変わっていないもの:");
    for (const one of stuck) out.push(`  ・${one.what}: ${one.after}`);
  }
  out.push("");
  out.push(DIFF_NOTE);
  return out;
}

/** 増えていない＝悪い、ではない（道具は良し悪しを言わない）。 */
export const DIFF_NOTE =
  "※ **増えていないことが悪いとは限りません**（その領域が固まっただけかもしれません）。" +
  "道具が言えるのは数の増減だけで、良し悪しは読む人が決めます。";
