// 定義を直す（直し方が**一意に決まるものだけ**）。
//
// AI は指摘されると別の場所を直して壊すことがある。「`witdh` は知らないキーです」と言われて
// 列ごと書き換える、というような直し方をする。**一意な直しは機械がやったほうが速くて安全**。
//
// 直すのは2種類だけ:
//   ・**綴り違い**（キー名・Repository / プラグイン / 型 / ページ id / アクション id …）
//     … 近い名前が**1つに決まる**ときだけ。2つ候補があれば人の仕事（[soleClosestKey]）
//   ・**足りない指定で、入れる値が決まっているもの**（`groupBy` に対する `report.sort`）
//
// 直さないもの（意図が要る）: 同じ項目の重複（どちらを残すか）・`field` の無い集計（どの
// 項目か）・条件で使えない演算子（何をしたかったか）。**見なかったことにはせず、理由を
// 添えて「直さなかった」と言う**。
//
// 確かめ方（最小化がモデルの一致で守るのに対して、ここは**診断で守る**）:
//   1. 1件ずつ当てて、その定義の診断が**減る**こと（増えるものは当てない）
//   2. **新しい診断が出ない**こと（別の所を壊していない証拠）
//   3. 当て終わった文字列をもう一度読んで、1と2が成り立つこと。崩れたら**何もしない**
//
// 書き換えは元の文字列の切り貼り（yamlSpans.ts）。コメントも書き方も改行コードも残る。

import { parseDocument, parse as parseYamlText } from "yaml";
import { diagnoses, improves, readable } from "./diagnose.js";
import { builtInNames, collectRefs, type DefinitionRegistry } from "./refs.js";
import { type Path, parsePath, valueAt } from "./shrink.js";
import {
  closestKey,
  findUnknownKeys,
  soleClosestKey,
  walkNodes,
} from "./strictKeys.js";
import { findWarnings } from "./warnings.js";
import {
  applySpans,
  insertLineBefore,
  itemSpanAt,
  keySpanAt,
  type Span,
} from "./yamlSpans.js";

type Dict = Record<string, unknown>;

const isDict = (v: unknown): v is Dict =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const str = (v: unknown): string | undefined =>
  typeof v === "string" ? v : undefined;

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** 直したもの1件。 */
export interface Fix {
  /** 直した理由（警告の規則名、または `unknown-key`）。 */
  rule: string;
  /** 場所（警告と同じ道）。 */
  where: string;
  kind: "名前を直す" | "キー名を直す" | "行を足す";
  from?: string;
  to: string;
  /** そのまま人に見せる1行。 */
  message: string;
}

/** 直さなかったもの1件（黙って飛ばさない）。 */
export interface Skipped {
  rule: string;
  where: string;
  reason: string;
}

export interface FixResult {
  /** 直したあとの定義（1件も直せなければ元のまま）。 */
  source: string;
  applied: Fix[];
  skipped: Skipped[];
  /** 直したあとに残っている診断の名前（ゼロになるのが普通ではない）。 */
  remaining: string[];
}

/** 直しの案1つ。文字列に当てる前に、まず定義の上で試す。 */
interface Proposal {
  rule: string;
  where: string;
  path: Path;
  /** `item` = その場の値（キーの値・配列の要素）、`key` = キー名、`insert` = 1行足す。 */
  target: "item" | "key" | "insert";
  to: string;
  from?: string;
}

/** 直せない案（理由つき）。 */
interface Refusal {
  rule: string;
  where: string;
  reason: string;
}

/**
 * 略して書いた名前を、登録名に戻す（`orderRepository` を `orderRepo` と書いた形）。
 *
 * 当てはまるものが**1つだけ**のときに返す。綴り違い（編集距離）では拾えないが、実際に
 * いちばん多く、いちばん気づきにくい転び方（画面は出るのにデータが来ない）。
 */
function prefixHits(name: string, known: string[]): string[] {
  const lower = name.toLowerCase();
  if (lower.length < 4) return []; // 短すぎる名前は当たりすぎる
  return known.filter((candidate) => {
    const other = candidate.toLowerCase();
    return other.startsWith(lower) || lower.startsWith(other);
  });
}

const soleByPrefix = (name: string, known: string[]): string | null => {
  const hits = prefixHits(name, known);
  return hits.length === 1 ? hits[0] : null;
};

/** 直せない理由を、候補が「無い」のか「決まらない」のかで言い分ける。 */
function refusalFor(name: string, known: string[]): string {
  const hits = prefixHits(name, known);
  if (hits.length > 1) {
    return `"${name}" に当てはまる名前が1つに決まりません（${hits.join(" / ")}）。`;
  }
  const near = closestKey(name, known);
  return near === null
    ? `登録済みの名前に近いものがありません（"${name}"）。名前を決めるのは人の仕事です。`
    : `"${name}" に当てはまる名前が1つに決まりません（"${near}" ほか）。`;
}

/** 案を集める。集めるだけで、まだ何も直さない。 */
function propose(
  raw: Dict,
  registry?: DefinitionRegistry,
): { proposals: Proposal[]; refusals: Refusal[] } {
  const proposals: Proposal[] = [];
  const refusals: Refusal[] = [];

  // 1. 知らないキー（綴り違い）。近い既知キーが1つに決まるときだけ。
  walkNodes(raw, ({ path, dict, known }) => {
    for (const key of Object.keys(dict)) {
      if (known.includes(key)) continue;
      const where = path === "" ? key : `${path}.${key}`;
      const to = soleClosestKey(key, known);
      if (to === null) {
        refusals.push({
          rule: `unknown-key:${key}`,
          where,
          reason:
            closestKey(key, known) === null
              ? "近い既知キーがありません（そのキーは捨てられます）。書ける場所を hatake reference で確かめてください。"
              : `近い既知キーが1つに決まりません（そのキーは捨てられます）。`,
        });
        continue;
      }
      proposals.push({
        rule: `unknown-key:${key}`,
        where,
        path: [...parsePath(path), key],
        target: "key",
        to,
        from: key,
      });
    }
  });

  // 2. 外との辻褄（Repository・プラグイン・型・フォーマッタ…）。登録済み一覧を
  //    渡されたときだけ見る。同じ名前は**出てくる所を全部**直す（1箇所直しても他が残る）。
  if (registry !== undefined) {
    for (const ref of collectRefs(raw)) {
      const registered = registry[ref.kind];
      if (registered === undefined) continue;
      const known = [...builtInNames[ref.kind], ...registered];
      if (known.includes(ref.name)) continue;
      // 綴り違いに加えて**略して書いた**形も見る（`orderRepository` を `orderRepo`）。
      // 登録名の中で当てはまるものが1つだけなら、それしかない。
      const to = soleClosestKey(ref.name, known) ?? soleByPrefix(ref.name, known);
      if (to === null) {
        refusals.push({
          rule: `unknown-${ref.kind}`,
          where: ref.path,
          reason: refusalFor(ref.name, known),
        });
        continue;
      }
      proposals.push({
        rule: `unknown-${ref.kind}`,
        where: ref.path,
        path: parsePath(ref.path),
        target: "item",
        to,
        from: ref.name,
      });
    }
  }

  // 3. 定義の中だけで分かる食い違い。警告の道を起点に、候補をその場から作る。
  for (const warning of findWarnings(raw, { registry })) {
    const at = parsePath(warning.path);
    const candidates = candidatesFor(raw, warning.rule, at);
    if (candidates === null) continue; // 別の口（1・2）で見ているか、直せない類
    if (warning.rule === "groupby-without-sort") {
      const field = str((list(valueAt(raw, at))[0] as Dict | undefined)?.field);
      if (field === undefined) {
        refusals.push({
          rule: warning.rule,
          where: warning.path,
          reason: "並べる項目が決まりません（groupBy に field がありません）。",
        });
        continue;
      }
      proposals.push({
        rule: warning.rule,
        where: warning.path,
        path: at,
        target: "insert",
        to: `sort: { field: ${field} }`,
      });
      continue;
    }
    const current = str(valueAt(raw, at));
    if (current === undefined) continue;
    const to = soleClosestKey(current, candidates);
    if (to === null) {
      refusals.push({
        rule: warning.rule,
        where: warning.path,
        reason: `"${current}" に近いものが1つに決まりません（在るのは ${candidates.join(" / ") || "なし"}）。`,
      });
      continue;
    }
    proposals.push({
      rule: warning.rule,
      where: warning.path,
      path: at,
      target: "item",
      to,
      from: current,
    });
  }
  return { proposals, refusals };
}

/**
 * その警告で「本当は何と書きたかったのか」の候補。
 *
 * null = この規則はここでは扱わない（＝直さない）。候補が空配列なら、書けるものが1つも
 * 無いということなので直せない（理由として出す）。
 */
function candidatesFor(raw: Dict, rule: string, at: Path): string[] | null {
  switch (rule) {
    case "unknown-page":
      return pageIds(raw);
    case "unknown-home":
      return [...pageIds(raw), ...menuIds(list(appOf(raw).menu))];
    case "unknown-action":
    case "rowaction-not-declared":
      // 行アクションは組み込みの edit / delete もそのまま書ける。
      return [...actionIds(raw, at), "edit", "delete"];
    case "optionsfrom-unknown-field":
      // 親に指定できるのは**同じ枠の中**の項目だけ（別の枠は見えない）。
      return siblingFields(raw, at);
    case "groupby-without-sort":
      return []; // 値の付け替えではなく行を足す（呼び出し側で分岐）
    default:
      return null;
  }
}

const appOf = (raw: Dict): Dict => (isDict(raw.app) ? raw.app : {});

const pageIds = (raw: Dict): string[] =>
  list(appOf(raw).pages)
    .filter(isDict)
    .map((page) => str(page.id))
    .filter((id): id is string => id !== undefined);

function menuIds(items: unknown[]): string[] {
  const found: string[] = [];
  for (const item of items) {
    if (!isDict(item)) continue;
    const id = str(item.id);
    if (id !== undefined) found.push(id);
    found.push(...menuIds(list(item.items)));
  }
  return found;
}

/** その道を含むページの、宣言済みアクション id。 */
function actionIds(raw: Dict, at: Path): string[] {
  const owner = at[0] === "app" ? at.slice(0, 3) : ["page"];
  return list((valueAt(raw, [...owner, "actions"]) as unknown[]) ?? [])
    .filter(isDict)
    .map((action) => str(action.id))
    .filter((id): id is string => id !== undefined);
}

/** その項目と同じ配列（同じ枠・同じ検索欄）にある項目名。 */
function siblingFields(raw: Dict, at: Path): string[] {
  // 道は `….fields[3].optionsFrom` の形。配列までさかのぼる。
  const array = at.slice(0, -2);
  return list(valueAt(raw, array))
    .filter(isDict)
    .map((item) => str(item.field))
    .filter((field): field is string => field !== undefined);
}

/** 案を定義の上で当てた複製。当てられなければ null。 */
function tryOn(raw: Dict, proposal: Proposal): Dict | null {
  const copy = structuredClone(raw);
  const holder = valueAt(copy, proposal.path.slice(0, -1));
  const last = proposal.path[proposal.path.length - 1];

  if (proposal.target === "insert") {
    // `report.groupBy` の隣に `sort` を足す（親は report）。
    if (!isDict(holder)) return null;
    const field = proposal.to.replace(/^sort: \{ field: (.+) \}$/, "$1");
    holder.sort = { field };
    return copy;
  }
  if (proposal.target === "key") {
    if (!isDict(holder) || typeof last !== "string") return null;
    const value = holder[last];
    delete holder[last];
    holder[proposal.to] = value;
    return copy;
  }
  if (Array.isArray(holder) && typeof last === "number") {
    holder[last] = proposal.to;
    return copy;
  }
  if (isDict(holder) && typeof last === "string") {
    holder[last] = proposal.to;
    return copy;
  }
  return null;
}

const messageOf = (proposal: Proposal): string =>
  proposal.target === "insert"
    ? `${proposal.where} に ${proposal.to} を足しました`
    : proposal.target === "key"
      ? `${proposal.where} のキー名を ${proposal.to} に直しました`
      : `${proposal.where} を "${proposal.from}" から "${proposal.to}" に直しました`;

/**
 * 定義を直す。
 *
 * strict では読まない（**通らない定義こそ直したい**のがこの道具の目的）。1件も直せなければ
 * 元の文字列をそのまま返す。
 */
export function fixSource(
  source: string,
  options: { registry?: DefinitionRegistry } = {},
): FixResult {
  const raw = parseYamlText(source) as Dict;
  if (!isDict(raw)) {
    throw new Error("定義（map）として読めません。");
  }
  const registry = options.registry;
  const before = diagnoses(raw, registry);
  const { proposals, refusals } = propose(raw, registry);

  // 1件ずつ、定義の上で当てて確かめる。通ったものだけ文字列に当てる。
  const document = parseDocument(source);
  const edits: { at: Span; text: string }[] = [];
  const applied: Fix[] = [];
  const skipped: Skipped[] = refusals.map((refusal) => ({
    rule: refusal.rule,
    where: refusal.where,
    reason: refusal.reason,
  }));
  let current = raw;

  for (const proposal of proposals) {
    const candidate = tryOn(current, proposal);
    if (candidate === null) {
      skipped.push({
        rule: proposal.rule,
        where: proposal.where,
        reason: "定義の中にその場所が見つかりません。",
      });
      continue;
    }
    if (!readable(candidate)) {
      skipped.push({
        rule: proposal.rule,
        where: proposal.where,
        reason: "直すと定義として読めなくなります。",
      });
      continue;
    }
    if (!improves(diagnoses(current, registry), diagnoses(candidate, registry))) {
      skipped.push({
        rule: proposal.rule,
        where: proposal.where,
        reason: "直しても問題が減らない（別の問題が出る）ので触りません。",
      });
      continue;
    }
    const edit = editFor(document, source, proposal);
    if (edit === null) {
      skipped.push({
        rule: proposal.rule,
        where: proposal.where,
        reason: "文字列のどこを書き換えればよいか特定できません。",
      });
      continue;
    }
    edits.push(edit);
    applied.push({
      rule: proposal.rule,
      where: proposal.where,
      kind:
        proposal.target === "insert"
          ? "行を足す"
          : proposal.target === "key"
            ? "キー名を直す"
            : "名前を直す",
      ...(proposal.from === undefined ? {} : { from: proposal.from }),
      to: proposal.to,
      message: messageOf(proposal),
    });
    current = candidate;
  }

  if (applied.length === 0) {
    return { source, applied: [], skipped, remaining: before };
  }

  // まとめて当てた結果を、もう一度読んで確かめる。崩れていたら**何もしない**
  // （半端に直した定義を書き出すより、直さないほうがいい）。
  const fixed = applySpans(source, edits);
  let after: string[];
  try {
    const reread = parseYamlText(fixed) as Dict;
    if (!isDict(reread) || !readable(reread)) throw new Error("読めません");
    after = diagnoses(reread, registry);
  } catch {
    after = before;
    return {
      source,
      applied: [],
      skipped: [
        ...skipped,
        {
          rule: "-",
          where: "-",
          reason: "まとめて当てると読めなくなったので、何もしていません。",
        },
      ],
      remaining: before,
    };
  }
  if (!improves(before, after)) {
    return {
      source,
      applied: [],
      skipped: [
        ...skipped,
        {
          rule: "-",
          where: "-",
          reason: "まとめて当てると問題が減らないので、何もしていません。",
        },
      ],
      remaining: before,
    };
  }

  return { source: fixed, applied, skipped, remaining: after };
}

/** 案を、元の文字列に当てる形（範囲と入れる文字）に変える。 */
function editFor(
  document: ReturnType<typeof parseDocument>,
  source: string,
  proposal: Proposal,
): { at: Span; text: string } | null {
  if (proposal.target === "insert") {
    const insert = insertLineBefore(document, proposal.path, source, proposal.to);
    return insert === null ? null : { at: [insert.at, insert.at], text: insert.text };
  }
  const span =
    proposal.target === "key"
      ? keySpanAt(document, proposal.path)
      : itemSpanAt(document, proposal.path);
  if (span === null) return null;
  // 引用符つきで書いてあったら、そのまま同じ形で返す（書き方を変えない）。
  const was = source.slice(span[0], span[1]);
  const quote = was.startsWith('"') ? '"' : was.startsWith("'") ? "'" : "";
  return { at: span, text: `${quote}${proposal.to}${quote}` };
}

/** 人が読む形。**直したものと、直さなかったもの（理由つき）を必ず両方出す**。 */
export function renderFix(result: FixResult): string {
  const out: string[] = [];
  if (result.applied.length === 0) {
    out.push("直せるものはありませんでした（直し方が一意に決まるものだけを直します）。");
  } else {
    out.push(`${result.applied.length} 件を直しました:`);
    for (const fix of result.applied) out.push(`  ${fix.message}`);
  }
  if (result.skipped.length > 0) {
    out.push("");
    out.push("直さなかったもの（意図が要るので人の仕事です）:");
    for (const one of result.skipped) {
      out.push(`  ${one.where} [${one.rule}] ${one.reason}`);
    }
  }
  if (result.remaining.length > 0) {
    out.push("");
    out.push(
      `残っている問題 ${result.remaining.length} 件: ${[...new Set(result.remaining)].join(" / ")}`,
    );
    out.push("（何が起きるかは hatake validate、直し方は hatake pitfalls / failures）");
  }
  return out.join("\n");
}

/** 残っている仕事1件（次の1往復で渡す形）。 */
export interface FixTodoItem {
  rule: string;
  /** 場所（警告と同じ道）。 */
  where: string;
  /** 何が起きるか / なぜ機械が直せないか。 */
  reason: string;
  /** 何を考えればいいか（対照表・実例カタログから引いた手掛かり）。 */
  hint?: string;
}

/** 機械が直したあとに残っている仕事。 */
export interface FixTodo {
  /** 機械が直した件数（**もう見なくていい**と言うために持つ）。 */
  fixed: number;
  items: FixTodoItem[];
}

/**
 * 直せなかったものを「次の1往復で渡す形」にする。
 *
 * `fix` の結果は3つに散っている: 直した（applied）・直さなかった（skipped）・直したあとも
 * 残っている（remaining。**名前だけで場所が無い**）。この形のまま AI に渡すと、直った分まで
 * 文脈に積み、場所の無い指摘を探し回ることになる。
 *
 * ここでやるのは3つ。
 *   ・**直った分を落とす**（もう見なくていい所を渡さない）
 *   ・残りに**場所を付け直す**（直したあとの定義でもう一度診断する）
 *   ・**なぜ機械が直せないか**を1件ずつ言う（意図が要るのか、直し方が複数あるのか）
 *
 * [hint] を渡すと、規則名から手掛かり（実例カタログの直し方など）を添える。引くのは
 * 呼ぶ側の仕事＝この層はファイルを読まない（素の関数のまま置く）。
 */
export function fixTodo(
  result: FixResult,
  hint?: (rule: string) => string | undefined,
): FixTodo {
  const document = parseYamlText(result.source);
  const items: FixTodoItem[] = [];
  const seen = new Set<string>();
  const add = (rule: string, where: string, reason: string): void => {
    const key = `${rule}@${where}`;
    if (seen.has(key)) return;
    seen.add(key);
    const found = hint?.(rule);
    items.push({ rule, where, reason, ...(found === undefined ? {} : { hint: found }) });
  };

  // 直さなかったもの（理由が付いている＝これが一番強い手掛かり）。
  for (const one of result.skipped) add(one.rule, one.where, one.reason);

  // 直したあとの定義に残っている診断。場所はここで付け直す（remaining は名前だけ）。
  if (isDict(document)) {
    for (const warning of findWarnings(document)) {
      add(warning.rule, warning.path, `${warning.message} → ${warning.fix}`);
    }
    for (const unknown of findUnknownKeys(document)) {
      add(
        `unknown-key:${unknown.key}`,
        unknown.path,
        `知らないキー "${unknown.key}" は黙って捨てられます` +
          (unknown.suggestion === undefined
            ? "（書ける場所を間違えているか、この版に無いキーです）"
            : `（"${unknown.suggestion}" の間違いかもしれませんが、機械では決められませんでした）`),
      );
    }
  }
  return { fixed: result.applied.length, items };
}

/**
 * そのまま次の指示にできる文。
 *
 * 「この3件だけ直して、ほかは触らないこと」まで書く。**触ってよい範囲を言わない指示は、
 * 直した所を戻される**（機械が直した綴りを、AI が「元に戻す」ことが実際にある）。
 */
export function renderFixTodo(todo: FixTodo): string {
  const out: string[] = [];
  out.push(
    todo.fixed === 0
      ? "機械が直せたものはありません。"
      : `機械が ${todo.fixed} 件を直しました（そこはもう見なくていい）。`,
  );
  if (todo.items.length === 0) {
    out.push("残っている仕事はありません。");
    return out.join("\n");
  }
  out.push(
    `残りは ${todo.items.length} 件です。どれも**意図が要る**ので、機械には決められません。`,
  );
  todo.items.forEach((item, i) => {
    out.push("");
    out.push(`${i + 1}. ${item.where} [${item.rule}]`);
    out.push(`   何が起きるか: ${item.reason}`);
    if (item.hint !== undefined) out.push(`   手掛かり: ${item.hint}`);
  });
  out.push("");
  out.push(
    `この ${todo.items.length} 件だけを直してください。**ほかの所は触らないこと**` +
      "（機械が直した分はこの一覧に入っていません。触ると戻ります）。" +
      "直したら hatake validate と hatake explain に通して、意図どおりか読み返してください。",
  );
  return out.join("\n");
}
