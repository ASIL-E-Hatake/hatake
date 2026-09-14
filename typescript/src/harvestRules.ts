// 案件の決めごと（助言の物差し）を、**既にある定義から**起こす。
//
// 物差しは手で書くと最初の一歩が重い。けれど案件の決めごとは、たいてい**もう定義に
// 書いてある**（誰も明文化していないだけ）。「この案件では全部の列に `width` を書いて
// いる」を数えて、`require` 規則の下書きにする。
//
// 決めごと5つ:
//   ・**全部に書いてあるものだけ**を起こす。8割に書いてあるのは決めごとではなく揺れで、
//     揺れを規則にすると「2割を直す」宿題が黙って生まれる。足りない側は理由つきで出す
//   ・**1箇所しか無いものは起こさない**（[min]）。1つを見て規則にするのは、ただの写し
//   ・**スキーマで必須のキーは起こさない**。書いてあって当たり前のものを決めごとにすると、
//     物差しが「当たり前」で埋まって、本当の決めごとが読めなくなる
//   ・**起こした物差しを、同じ定義の山に当てて確かめる**。1件でも鳴ったら候補から落とす
//     ＝「起こした規則が、当てたら鳴る」は道具として一番みっともない形なので、機械で潰す
//   ・**書き込まない**。出すのは貼れる形の下書きまでで、`--rules` に渡すのは人
//
// 絞り（`pages` / `when`）は付けない。「受注の画面だけ」のような絞りは業務の判断で、
// 数からは出てこない（人が手で足す欄として空けておく）。

import { parse as parseYamlText } from "yaml";
import { findAdvice } from "./advise.js";
import { nodesOf, referenceNode, written } from "./adviseRequire.js";
import { type AdviceRules, type RequireNode, type RequireRule } from "./adviseRules.js";
import { type HarvestInput } from "./harvest.js";
import { type DslReference } from "./reference.js";

type Dict = Record<string, unknown>;

const isDict = (v: unknown): v is Dict =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const dicts = (v: unknown): Dict[] => (Array.isArray(v) ? v.filter(isDict) : []);

const str = (v: unknown): string | undefined =>
  typeof v === "string" ? v : undefined;

/** 数える場所（物差しが見られる場所と同じ。ここが増えたら物差しの側も増えている）。 */
const NODES: RequireNode[] = ["page", "column", "filter", "field", "action"];

/** 起こした決めごと1件。 */
export interface RuleCandidate {
  /** 規則名の下書き（人が付け替えてよい）。 */
  rule: string;
  node: RequireNode;
  key: string;
  /** 何箇所に書いてあったか（＝その場所の全部）。 */
  spots: number;
  /** 何本の定義に出てきたか。 */
  files: number;
}

/** 数えたけれど起こさなかったもの（黙って落とさない）。 */
export interface RuleSkipped {
  node: RequireNode;
  key: string;
  /** 書いてあった箇所。 */
  written: number;
  /** その場所の総数。 */
  spots: number;
  why: string;
}

export interface HarvestRulesResult {
  /** 走査できた定義の本数。 */
  scanned: number;
  /** 読めなかった定義。1件でもあれば、この結果は**不完全**。 */
  unreadable: { file: string; reason: string }[];
  /** 場所ごとに何箇所見たか（0 の場所は「見ていない」と言うために要る）。 */
  counted: Record<RequireNode, number>;
  candidates: RuleCandidate[];
  skipped: RuleSkipped[];
}

export interface HarvestRulesOptions {
  /** 決めごとと見なすのに要る箇所の数。既定 2（1箇所は写しであって決めごとではない）。 */
  min?: number;
  /**
   * スキーマ由来のリファレンス。渡すと**必須のキー**を候補から外す。
   *
   * 渡さなければ外さない＝そのぶん当たり前の規則が混ざる。黙って確かめないのではなく、
   * 報告に「確かめていない」と書く（[renderHarvestRules]）。
   */
  reference?: DslReference;
}

/**
 * 1つの場所・1つのキーの数え上げ。
 *
 * 場所とキーを**そのまま持つ**（Map の鍵から切り出さない）。鍵を文字で組んで後から
 * 割ると、区切りの1文字を間違えただけで場所の名前が化ける＝黙って壊れる。
 */
interface Tally {
  node: RequireNode;
  key: string;
  written: number;
  spots: number;
  files: Set<string>;
}

/** 定義1本の中のページ（`app:` でも `page:` でも同じ歩き方にする）。 */
const pagesOf = (document: Dict): { page: Dict; path: string }[] => {
  const app = isDict(document.app) ? document.app : undefined;
  if (app !== undefined) {
    return dicts(app.pages).map((page, i) => ({ page, path: `app.pages[${i}]` }));
  }
  return isDict(document.page) ? [{ page: document.page, path: "page" }] : [];
};

/** そのキーが**スキーマで必須**か（必須なら、書いてあって当たり前）。 */
function required(
  reference: DslReference | undefined,
  node: RequireNode,
  kind: string,
  key: string,
): boolean {
  if (reference === undefined) return false;
  const found = reference.nodes[referenceNode(node, kind)];
  return found?.keys.some((one) => one.key === key && one.required) === true;
}

/**
 * 定義の山から決めごとを起こす。
 *
 * 並びは「場所の順 → キー名順」。同じ入力なら常に同じ結果になる（走査順で揺れると
 * 差分として読めない）。
 */
export function harvestRules(
  inputs: HarvestInput[],
  options: HarvestRulesOptions = {},
): HarvestRulesResult {
  const min = options.min ?? 2;
  const unreadable: HarvestRulesResult["unreadable"] = [];
  const counted: Record<RequireNode, number> = {
    page: 0,
    column: 0,
    filter: 0,
    field: 0,
    action: 0,
  };
  const documents: { file: string; document: Dict }[] = [];
  // 1周目: **どのキーを見るか**を集める。どれかの定義が書いているキーだけが決めごとに
  // なり得る（書かれたことの無いキーをスキーマから並べても、ただの一覧になる）。
  // 必須のキーはここで外す（書いてあって当たり前のものは決めごとではない）。
  const watched = new Map<RequireNode, Set<string>>(
    NODES.map((node) => [node, new Set<string>()]),
  );

  for (const input of inputs) {
    let document: unknown;
    try {
      document = parseYamlText(input.source);
    } catch (error) {
      unreadable.push({
        file: input.file,
        reason: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    if (!isDict(document)) continue;
    const pages = pagesOf(document);
    if (pages.length === 0) continue;
    documents.push({ file: input.file, document });

    for (const { page, path } of pages) {
      const kind = str(page.type) ?? "";
      for (const node of NODES) {
        const spots = nodesOf(page, path, node);
        counted[node] += spots.length;
        for (const spot of spots) {
          for (const key of Object.keys(spot.node)) {
            if (!written(spot.node[key])) continue;
            if (required(options.reference, node, kind, key)) continue;
            watched.get(node)?.add(key);
          }
        }
      }
    }
  }

  // 2周目: **書いてある所と、その場所の総数**を対にする。書いてある所だけを数えると、
  // 分母が分子と同じになって必ず 100%（＝何もかも決めごと）になる。
  const tallies = new Map<string, Tally>();
  for (const { file, document } of documents) {
    for (const { page, path } of pagesOf(document)) {
      for (const node of NODES) {
        for (const spot of nodesOf(page, path, node)) {
          for (const key of watched.get(node) ?? []) {
            const at = `${node} ${key}`;
            let tally = tallies.get(at);
            if (tally === undefined) {
              tally = { node, key, written: 0, spots: 0, files: new Set() };
              tallies.set(at, tally);
            }
            tally.spots += 1;
            if (written(spot.node[key])) {
              tally.written += 1;
              tally.files.add(file);
            }
          }
        }
      }
    }
  }

  const candidates: RuleCandidate[] = [];
  const skipped: RuleSkipped[] = [];
  for (const [, tally] of [...tallies].sort((a, b) => a[0].localeCompare(b[0]))) {
    const one = {
      node: tally.node,
      key: tally.key,
      written: tally.written,
      spots: tally.spots,
    };
    if (tally.spots < min) {
      skipped.push({ ...one, why: `その場所が ${tally.spots} 箇所しかありません` });
      continue;
    }
    if (tally.written < tally.spots) {
      skipped.push({
        ...one,
        why:
          `${tally.spots} 箇所のうち ${tally.written} 箇所にしか書いていません` +
          "＝決めごとではなく揺れです（どちらが正かは人が決めます）",
      });
      continue;
    }
    candidates.push({
      rule: `${tally.node}-needs-${tally.key}`,
      node: tally.node,
      key: tally.key,
      spots: tally.spots,
      files: tally.files.size,
    });
  }

  return {
    scanned: documents.length,
    unreadable,
    counted,
    ...verify(candidates, skipped, documents),
  };
}

/**
 * 起こした物差しを、**同じ定義の山に当てて**確かめる。
 *
 * 「全部に書いてある」から起こした規則なので、当てて鳴ったらこちらの数え方が間違って
 * いる。鳴った規則は候補から落とし、落とした理由を出す（黙って出すと、貼った人の所で
 * いきなり助言が並ぶ）。
 */
function verify(
  candidates: RuleCandidate[],
  skipped: RuleSkipped[],
  documents: { file: string; document: Dict }[],
): Pick<HarvestRulesResult, "candidates" | "skipped"> {
  if (candidates.length === 0) return { candidates, skipped };
  const rules: AdviceRules = {
    off: [],
    options: {},
    require: candidates.map(asRequire),
  };
  const names = new Set(candidates.map((one) => one.rule));
  const noisy = new Set<string>();
  for (const { document } of documents) {
    for (const advice of findAdvice(document, rules)) {
      if (names.has(advice.rule)) noisy.add(advice.rule);
    }
  }
  return {
    candidates: candidates.filter((one) => !noisy.has(one.rule)),
    skipped: [
      ...skipped,
      ...candidates
        .filter((one) => noisy.has(one.rule))
        .map((one) => ({
          node: one.node,
          key: one.key,
          written: one.spots,
          spots: one.spots,
          why: "起こした規則を同じ定義に当てたら鳴りました（数え方が合っていません）",
        })),
    ],
  };
}

/** 候補を `require` 規則1件にする（貼れる形の1件）。 */
const asRequire = (one: RuleCandidate): RequireRule => ({
  rule: one.rule,
  node: one.node,
  key: one.key,
  every: true,
});

/** そのまま `--rules` に渡せる形（貼るのは人）。 */
export const rulesDraft = (result: HarvestRulesResult): Record<string, unknown> => ({
  $comment: RULES_DRAFT_COMMENT,
  require: result.candidates.map(asRequire),
});

/** 下書きであることを、貼った先でも読める所に残す。 */
export const RULES_DRAFT_COMMENT =
  "hatake harvest --rules が既にある定義から起こした下書きです。" +
  "**人が読んで直すまでは正ではありません**（数が揃っているだけで、" +
  "決めごとかどうかは業務の判断です）。画面種別で絞るなら pages を、" +
  "値で絞るなら when を手で足してください。";

/** 端末に「あと少し」として出す割合（これ未満は数えるだけ）。 */
const NEARLY = 0.8;

/** 場所の呼び方（助言の報告と同じ語）。 */
const NODE_WORDS: Record<RequireNode, string> = {
  page: "画面",
  column: "一覧の列",
  filter: "絞り込みの条件",
  field: "入力の項目",
  action: "ボタン",
};

export function renderHarvestRules(
  result: HarvestRulesResult,
  options: { min: number; checkedRequired: boolean },
): string {
  const out = [`走査: 定義 ${result.scanned} 本`, ""];
  for (const one of result.unreadable) {
    out.push(`読めなかった: ${one.file}（${one.reason}）＝この結果は不完全です。`);
  }
  if (result.unreadable.length > 0) out.push("");

  out.push(
    "見た場所: " +
      NODES.map((node) => `${NODE_WORDS[node]} ${result.counted[node]} 箇所`).join(" / "),
    "",
  );
  if (result.candidates.length === 0) {
    out.push("起こせる決めごとはありませんでした（全部に書いてあるキーが無い）。");
  } else {
    out.push(`起こせた決めごと ${result.candidates.length} 件:`);
    for (const one of result.candidates) {
      out.push(
        `  ・${NODE_WORDS[one.node]}は**全部**（${one.spots} 箇所 / ${one.files} 本）に ` +
          `${one.key} を書いています  [${one.rule}]`,
      );
    }
    out.push("");
    out.push("そのまま --rules に渡せる形（貼るのは人）:");
    for (const line of JSON.stringify(rulesDraft(result), null, 2).split("\n")) {
      out.push(`  ${line}`);
    }
  }
  if (result.skipped.length > 0) {
    // 端末には**あと少しの所**（[NEARLY] 以上書いてある）だけ出す。全部並べると、
    // 1箇所しか書いていないキーが何十行も出て、肝心の候補が読まれなくなる。
    // 落としたものが消えるわけではない（--json には全部入る、とここで言う）。
    const near = result.skipped.filter(
      (one) => one.spots > 0 && one.written / one.spots >= NEARLY,
    );
    out.push("");
    out.push("あと少しで決めごとになる所（いまは揺れています）:");
    if (near.length === 0) out.push("  ・ありません。");
    for (const one of near) {
      out.push(`  ・${NODE_WORDS[one.node]}の ${one.key} … ${one.why}`);
    }
    out.push(
      `  （ほか ${result.skipped.length - near.length} 件は数えただけで、` +
        "書いてある所がもっと少ないものです。全部は --json に入っています。）",
    );
  }
  out.push("");
  out.push(
    `※ 決めごとと見なすのに要る箇所は ${options.min} 以上です（--min で変えられます）。` +
      (options.checkedRequired
        ? ""
        : "スキーマが見つからないので、**書いて当たり前のキー（必須）を外していません**。") +
      HARVEST_RULES_NOTE,
  );
  return out.join("\n");
}

/** この道具に言えないことを毎回書く。 */
export const HARVEST_RULES_NOTE =
  "起こせるのは「どの場所に・どのキーを書いているか」だけで、**なぜそう決めたか**は" +
  "書けません（そこがこの物差しの値打ちなので、says と add は空のままにしてあります）。" +
  "絞り（pages / when）も数からは出ないので、要るなら人が足してください。" +
  "この物差しは**この定義の山のもの**です＝別の案件に当てれば鳴ります。";
