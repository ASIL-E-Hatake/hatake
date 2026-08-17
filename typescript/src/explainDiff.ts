// 変更を「画面の言葉」で言う。
//
// [diffDefinitions] は機械の言葉で言う（`ui / column-format-changed /
// pages.order_search.table.columns.amount.format`）。壊れるかどうかを CI で見るには
// それが正しいが、**人がレビューするときに読みたいもの**ではない。
//
// ここでやるのは「説明どうしを比べる」こと。定義の差分から文を組み立てるのではなく、
// [explainPage] が出した説明を前後で比べる。理由は2つ:
//   ・読む人が見るのは説明なので、**説明が変わったところ**がそのまま知りたいこと
//   ・既定値の変化・「できないこと」の増減のような、差分の規則を書いていない変化も
//     自動で入ってくる（説明に出るものは全部拾える）
//
// できないこと: 後方互換（呼び出し側が壊れるか）は言わない。それは `hatake diff` の
// 担当で、両方要る。混ぜると「見え方が変わっただけ」で CI が落ちる道具になる。

import { type ExplainDocument, explainApp, explainPage } from "./explain.js";
import {
  isAppSource,
  parseAppSource,
  parseOnePage,
  explainSource,
} from "./explainSource.js";

/** 変わったところ1つ。 */
export interface ExplainChange {
  /** どの節の話か（説明の見出しそのまま。app なら `画面名 / 見出し`）。 */
  section: string;
  /** 何について（項目・列・ボタンのラベル）。文の書き出しが揃わないものは無し。 */
  subject?: string;
  kind: "added" | "removed" | "changed";
  before?: string;
  after?: string;
  /** そのまま人に見せる1行。 */
  message: string;
}

export interface ExplainDiff {
  headline: string;
  /** 説明が1文字も変わらないなら true。 */
  same: boolean;
  changes: ExplainChange[];
}

/** 「請求先（区分 が 法人 のときだけ出る枠）」を base と条件に割る。 */
const SECTION_CONDITION = /^(.+)（(.+)だけ出る枠）$/;

interface SectionName {
  base: string;
  condition?: string;
}

const sectionName = (title: string): SectionName => {
  const found = SECTION_CONDITION.exec(title);
  return found === null
    ? { base: title }
    : { base: found[1], condition: found[2] };
};

/**
 * 行の主語（「コード … 必須」なら「コード」）。
 *
 * 説明の行はどれも「主語 … 説明」「ラベル（注記）」「道 → 行き先」のどれかなので、
 * 先に来る区切りで割れば、前後で同じものを指す行が組める。割れない行（帳票の体裁や
 * 「できないこと」）は行そのものを主語とする。
 */
export function subjectOf(line: string): string {
  for (const separator of ["…", " → "]) {
    const at = line.indexOf(separator);
    if (at > 0) return line.slice(0, at).trim();
  }
  const paren = line.indexOf("（");
  return (paren > 0 ? line.slice(0, paren) : line).trim();
}

const quote = (subject: string): string =>
  subject.includes("「") || subject.length > 24 ? subject : `「${subject}」`;

/** 説明2つを比べる。[prefix] があれば見出しの前に付ける（app のページ名）。 */
export function diffExplanations(
  before: ExplainDocument,
  after: ExplainDocument,
  prefix = "",
): ExplainChange[] {
  const at = (title: string): string =>
    prefix === "" ? title : `${prefix} / ${title}`;
  const changes: ExplainChange[] = [];

  if (before.headline !== after.headline) {
    changes.push({
      section: at("画面"),
      kind: "changed",
      before: before.headline,
      after: after.headline,
      message: "画面の位置づけが変わりました",
    });
  }

  const remaining = new Map(indexed(after.sections));
  for (const [key, section] of indexed(before.sections)) {
    const next = remaining.get(key);
    if (next === undefined) {
      changes.push({
        section: at(section.title),
        subject: sectionName(section.title).base,
        kind: "removed",
        message: `${quote(sectionName(section.title).base)}が無くなりました`,
      });
      continue;
    }
    remaining.delete(key);
    changes.push(...diffSection(at(next.title), section, next));
  }
  for (const section of remaining.values()) {
    const base = sectionName(section.title).base;
    changes.push({
      section: at(section.title),
      subject: base,
      kind: "added",
      message: `${quote(base)}が増えました`,
    });
    for (const line of section.lines) {
      changes.push({
        section: at(section.title),
        subject: subjectOf(line),
        kind: "added",
        after: line,
        message: `${quote(subjectOf(line))}が増えました`,
      });
    }
  }
  return changes;
}

/**
 * 節を「見出しの素の名前＋同名の何番目か」で引けるようにする。
 *
 * 見出しに条件が入る（枠が出る条件）ので、素の名前で組まないと「条件が付いた」が
 * 「枠が消えて別の枠が増えた」に見える。無題の枠が並ぶと同名になるので順番も鍵に入れる。
 */
function indexed(
  sections: ExplainDocument["sections"],
): [string, ExplainDocument["sections"][number]][] {
  const seen = new Map<string, number>();
  return sections.map((section) => {
    const base = sectionName(section.title).base;
    const nth = (seen.get(base) ?? 0) + 1;
    seen.set(base, nth);
    return [`${base}#${nth}`, section];
  });
}

function diffSection(
  section: string,
  before: ExplainDocument["sections"][number],
  after: ExplainDocument["sections"][number],
): ExplainChange[] {
  const changes: ExplainChange[] = [];
  const was = sectionName(before.title);
  const now = sectionName(after.title);
  if (was.condition !== now.condition) {
    changes.push({
      section,
      subject: now.base,
      kind: "changed",
      before: was.condition,
      after: now.condition,
      message:
        now.condition === undefined
          ? `枠${quote(now.base)}は、条件なしでいつでも出るようになりました`
          : was.condition === undefined
            ? `枠${quote(now.base)}は、${now.condition}だけ出るようになりました`
            : `枠${quote(now.base)}が出る条件が、${was.condition}から${now.condition}に変わりました`,
    });
  }
  changes.push(...diffLines(section, before.lines, after.lines));
  return changes;
}

function diffLines(
  section: string,
  before: string[],
  after: string[],
): ExplainChange[] {
  const changes: ExplainChange[] = [];
  const pending = [...after];
  const orphans: string[] = [];

  for (const line of before) {
    const subject = subjectOf(line);
    const at = pending.findIndex(
      (candidate) => subjectOf(candidate) === subject,
    );
    if (at < 0) {
      orphans.push(line);
      continue;
    }
    const [matched] = pending.splice(at, 1);
    if (matched === line) continue;
    changes.push({
      section,
      subject,
      kind: "changed",
      before: line,
      after: matched,
      message: `${quote(subject)}が変わりました`,
    });
  }

  // 主語で組めなかった行は、まず**行き先が同じもの**同士で組む（メニューの札を変えた・
  // 入れ子を移した。「消えて増えた」と言うと、移動が2件の変更に見える）。
  const moved: string[] = [];
  for (const line of orphans) {
    const at = pending.findIndex((candidate) => sameDestination(line, candidate));
    if (at < 0) {
      moved.push(line);
      continue;
    }
    const [matched] = pending.splice(at, 1);
    changes.push({
      section,
      subject: subjectOf(matched),
      kind: "changed",
      before: line,
      after: matched,
      message: `${quote(subjectOf(line))}は${quote(subjectOf(matched))}に変わりました（開く先は同じ）`,
    });
  }

  // それでも組めなかった行は、書き出しが同じもの同士で組む（「データの出どころは …」の
  // ように、変わった所が主語に入っている行がある）。組めなければ増減として言う。
  for (const line of moved) {
    const at = bestOpening(line, pending);
    if (at < 0) {
      changes.push({
        section,
        subject: subjectOf(line),
        kind: "removed",
        before: line,
        message: `${quote(subjectOf(line))}が無くなりました`,
      });
      continue;
    }
    const [matched] = pending.splice(at, 1);
    changes.push({
      section,
      kind: "changed",
      before: line,
      after: matched,
      message: "内容が変わりました",
    });
  }
  for (const line of pending) {
    changes.push({
      section,
      subject: subjectOf(line),
      kind: "added",
      after: line,
      message: `${quote(subjectOf(line))}が増えました`,
    });
  }
  return changes;
}

/**
 * 同じ所を開く行か（メニューの `道 → ページ id`）。
 *
 * 札を変えた・入れ子を移したときに、行の主語（道）は変わるが行き先は変わらない。
 */
function sameDestination(before: string, after: string): boolean {
  const at = [before, after].map((line) => line.indexOf(" → "));
  if (at[0] < 0 || at[1] < 0) return false;
  return (
    before.slice(at[0] + 3) === after.slice(at[1] + 3) &&
    before.slice(0, at[0]) !== after.slice(0, at[1])
  );
}

/** 書き出しが一番長く一致する行（6文字以上一致しなければ -1）。 */
function bestOpening(line: string, candidates: string[]): number {
  let best = -1;
  let length = 5;
  candidates.forEach((candidate, index) => {
    let shared = 0;
    while (
      shared < line.length &&
      shared < candidate.length &&
      line[shared] === candidate[shared]
    ) {
      shared++;
    }
    if (shared > length) {
      best = index;
      length = shared;
    }
  });
  return best;
}

/**
 * 定義の文字列2つを比べる。`page:` どうし・`app:` どうしのどちらでも。
 *
 * app のときは、アプリ全体（メニュー・画面の一覧）に加えて、**両方にあるページ**を
 * 1枚ずつ比べる。増えた・消えたページは画面の一覧に出るので繰り返さない。
 */
export function explainDiffSources(
  before: string,
  after: string,
): ExplainDiff {
  const beforeIsApp = isAppSource(before);
  if (beforeIsApp !== isAppSource(after)) {
    throw new Error(
      "片方が app、もう片方が単票のページ定義です。同じ種類のもの同士で比べてください。",
    );
  }
  if (!beforeIsApp) {
    const next = explainSource(after);
    return result(next, diffExplanations(explainSource(before), next));
  }

  const was = parseAppSource(before);
  const now = parseAppSource(after);
  const whole = explainApp(now.app);
  const changes = diffExplanations(explainApp(was.app), whole);
  for (const page of now.app.pages) {
    const rawBefore = was.raw.get(page.id);
    const rawAfter = now.raw.get(page.id);
    if (rawBefore === undefined || rawAfter === undefined) continue;
    changes.push(
      ...diffExplanations(
        explainPage(parseOnePage(rawBefore), rawBefore),
        explainPage(parseOnePage(rawAfter), rawAfter),
        page.title,
      ),
    );
  }
  return result(whole, changes);
}

const result = (
  after: ExplainDocument,
  changes: ExplainChange[],
): ExplainDiff => ({
  // 説明の見出しと同じ形（`画面名（id）— …`）に揃える。
  headline: `${after.headline.split("— ")[0].trimEnd()}— 変わったところ`,
  same: changes.length === 0,
  changes,
});

/**
 * 後方互換の話をしないことは、毎回書く。
 *
 * 「変わりません」だけ読んで「安全だ」と受け取られるのが一番危ない読み違いなので、
 * 変化が無いときも出す。
 */
export const EXPLAIN_DIFF_NOTE =
  "※ ここは**見え方**の話です。呼び出し側が壊れるか（後方互換）は hatake diff で見てください。";

/** 人が読む形。節ごとにまとめ、文が言っていない値だけ前後を添える。 */
export function renderExplainDiff(diff: ExplainDiff): string {
  const out = [diff.headline, ""];
  if (diff.same) {
    out.push("見え方は変わりません。");
  } else {
    let section = "";
    for (const change of diff.changes) {
      if (change.section !== section) {
        section = change.section;
        out.push(`## ${section}`);
      }
      out.push(`  ・${change.message}`);
      if (shows(change.before, change.message)) out.push(`      前: ${change.before}`);
      if (shows(change.after, change.message)) out.push(`      後: ${change.after}`);
    }
  }
  out.push("");
  out.push(EXPLAIN_DIFF_NOTE);
  return out.join("\n").trimEnd();
}

/** 前後の値は、文が既に言っていないときだけ添える（同じことを2度書かない）。 */
const shows = (value: string | undefined, message: string): boolean =>
  value !== undefined && !message.includes(value);
