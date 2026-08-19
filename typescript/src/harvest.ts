// 転び方を機械で集める（`spec/failures.json` の候補づくり）。
//
// カタログは手で書くと増えない。増えないカタログは、道具が良くなったのか実例を拾って
// いないだけなのか**見分けが付かない**ので、書き手の記憶ではなく定義の山から拾う。
//
// できないことを先に書く:
//   ・`why`（なぜそう書いてしまうか）は機械には書けない。**そこがカタログの価値**なので、
//     候補は「人が書く欄」を空のまま出す。`failures.json` に自動で足すことは絶対にしない。
//   ・定義そのものは持ち出さない（ラベルや列名に客先の語彙が入る）。出すのはファイル名・
//     場所・回数と、道具が言ったことだけ。
//   ・機械が言わない転び方（枠の条件と噛み合わない条件など）はここには出ない。それは
//     `explain` で読み返して人が見つけるもので、この道具の穴ではなく**分担**。
//   ・1回だけ出たものは転び方ではなく、ただの間違い。既定は2回以上（[min]）。

import { parse as parseYamlText } from "yaml";
import { type FailureCatalog } from "./failures.js";
import { reproOf } from "./repro.js";
import { type DefinitionRegistry } from "./refs.js";
import { findUnknownKeys } from "./strictKeys.js";
import { findWarnings } from "./warnings.js";

/** 走査する定義の拡張子。 */
export const DEFINITION_EXTENSIONS = [".yaml", ".yml", ".json"];

/** 走査する定義1つ。 */
export interface HarvestInput {
  file: string;
  source: string;
  /**
   * その定義の隣にある「登録済みのもの」の一覧。
   *
   * **定義ごと**に持てるのが要点。複数のアプリの定義をまとめて走査するのが普通の使い方
   * なので、1つの一覧を全部に当てると「登録してあるのに未登録」という嘘の候補が出る。
   */
  registry?: DefinitionRegistry;
}

/** 出た所1つ。定義の中身は持たない（持ち出さないため）。 */
export interface HarvestHit {
  file: string;
  /** 定義の中の場所（`app.pages[2].table.rowActions[0]`）。 */
  path: string;
}

/** カタログに入れるかもしれない候補1件。 */
export interface FailureCandidate {
  /** id の下書き。診断名そのままなので、人が転び方の名前に付け替える。 */
  id: string;
  /** その診断（`failures.json` の diagnosis と同じ形）。 */
  diagnosis: { warnings?: string[]; unknownKeys?: string[] };
  /** 道具が実際に言ったこと（1件目のもの）。題を書くときの元。 */
  says: string;
  /** 出た回数と、出た定義の本数。 */
  hits: number;
  files: number;
  where: HarvestHit[];
  /**
   * 最小の再現の下書き（`--repro` のときだけ）。**定義の本文が入る**ので既定では作らない。
   * 自由文は記号に置き換えてあるが、id や項目名は残る（[reproOf] 参照）。
   */
  wrote?: string[];
  /** 下書きを作るときに削った箇所の数。 */
  removed?: number;
  /**
   * 直した形の下書き（`--repro` のときで、**直したら診断がゼロになった**ときだけ）。
   * 一意に直せない件には入らない（そこは意図が要る＝人の仕事）。
   */
  fixed?: string[];
  /** `fixed` を作れなかった理由。 */
  fixNote?: string;
  /** 人が書く欄。機械には書けないものだけを並べる。 */
  todo: string[];
}

/** 数えたけれど候補にしなかったもの（黙って落とさない）。 */
export interface HarvestSkipped {
  diagnosis: string;
  hits: number;
  files: number;
  /** 既にカタログにあるなら、その id。 */
  known?: string;
}

export interface HarvestResult {
  /** 走査できた定義の本数。 */
  scanned: number;
  /** 定義ではなかったので飛ばしたファイルの数（pubspec.yaml などは普通に混ざる）。 */
  ignored: number;
  candidates: FailureCandidate[];
  /** 既にカタログにある診断。 */
  known: HarvestSkipped[];
  /** 回数が足りなかった診断（[min] を下げれば候補になる）。 */
  rare: HarvestSkipped[];
  /** 読めなかった定義。1件でもあれば、この結果は**不完全**。 */
  unreadable: { file: string; reason: string }[];
}

export interface HarvestOptions {
  /** 既にある実例のカタログ。渡すと、載っている診断は候補から外す。 */
  catalog?: FailureCatalog;
  /** 候補にするのに要る回数。既定 2（＝同じ手が2度伸びたもの）。 */
  min?: number;
  /** 定義ごとに一覧が無いときの既定（[HarvestInput.registry] が優先）。 */
  registry?: DefinitionRegistry;
  /**
   * 最小の再現（`wrote` の下書き）まで作る。**既定は false**。
   *
   * 出力に定義の本文が入るので、既定のまま（作らない）が「定義そのものは持ち出さない」に
   * 合う。作るときも自由文は記号に置き換えるが、id や項目名は残る。
   */
  repro?: boolean;
}

/** 診断1つの数え上げ。 */
interface Tally {
  /** 診断の名前（警告の規則名、または `キー名` の未知キー）。 */
  name: string;
  unknownKey: boolean;
  says: string;
  where: HarvestHit[];
  files: Set<string>;
  /** 最初に見つけた定義（最小の再現を作る元。持ち出す判断は呼ぶ側）。 */
  found: Record<string, unknown>;
  /** その定義に効いていた登録済み一覧（外との辻褄の診断を再現するのに要る）。 */
  registry?: DefinitionRegistry;
}

/**
 * 定義の山を走査して、繰り返し出ている診断を候補として返す。
 *
 * 並びは「出た回数の多い順 → 名前順」。同じ入力なら常に同じ結果になる（候補の順が
 * 走査順で揺れると、差分として読めない）。
 */
export function harvestFailures(
  inputs: HarvestInput[],
  options: HarvestOptions = {},
): HarvestResult {
  const min = options.min ?? 2;
  const tallies = new Map<string, Tally>();
  const unreadable: HarvestResult["unreadable"] = [];
  let scanned = 0;
  let ignored = 0;

  for (const input of inputs) {
    // strict では読まない。**通らない定義こそ拾いたい**のがこの道具の目的なので、
    // 見るのは素の document（`validate` と同じ材料）。
    const read = parse(input.source);
    if (read.document === undefined) {
      if (read.broken) {
        unreadable.push({ file: input.file, reason: read.reason });
      } else {
        ignored++;
      }
      continue;
    }
    const document = read.document;
    scanned++;

    const registry = input.registry ?? options.registry;
    for (const warning of findWarnings(document, { registry })) {
      add(tallies, {
        name: warning.rule,
        unknownKey: false,
        says: warning.message,
        file: input.file,
        path: warning.path,
        document,
        registry,
      });
    }
    for (const unknown of findUnknownKeys(document)) {
      add(tallies, {
        name: unknown.key,
        unknownKey: true,
        says:
          `知らないキー "${unknown.key}"` +
          (unknown.suggestion === null ? "" : `（${unknown.suggestion} の間違い？）`),
        file: input.file,
        path: unknown.path === "" ? unknown.key : `${unknown.path}.${unknown.key}`,
        document,
        registry,
      });
    }
  }

  const candidates: FailureCandidate[] = [];
  const known: HarvestSkipped[] = [];
  const rare: HarvestSkipped[] = [];
  for (const tally of [...tallies.values()].sort(byHitsThenName)) {
    const summary: HarvestSkipped = {
      diagnosis: tally.name,
      hits: tally.where.length,
      files: tally.files.size,
    };
    const inCatalog =
      options.catalog === undefined
        ? false
        : catalogEntry(options.catalog, tally);
    if (inCatalog !== false) {
      known.push({ ...summary, known: inCatalog });
      continue;
    }
    if (tally.where.length < min) {
      rare.push(summary);
      continue;
    }
    // 最小の再現は**頼まれたときだけ**作る（出力に定義の本文が入るので）。
    const repro =
      options.repro === true
        ? reproOf(tally.found, tally.name, { registry: tally.registry })
        : null;
    candidates.push({
      id: tally.name,
      diagnosis: tally.unknownKey
        ? { unknownKeys: [tally.name] }
        : { warnings: [tally.name] },
      says: tally.says,
      hits: tally.where.length,
      files: tally.files.size,
      where: tally.where,
      ...(repro === null
        ? {}
        : {
            wrote: repro.wrote,
            removed: repro.removed,
            ...(repro.fixed === undefined ? {} : { fixed: repro.fixed }),
            ...(repro.fixNote === undefined ? {} : { fixNote: repro.fixNote }),
          }),
      todo:
        repro === null
          ? [...TODO]
          : repro.fixed === undefined
            ? [...TODO_WITH_REPRO]
            : [...TODO_WITH_FIXED],
    });
  }

  return { scanned, ignored, candidates, known, rare, unreadable };
}

/**
 * 人が書く欄。機械が埋められるもの（診断・場所・回数）は候補に入っているので、
 * ここに並ぶのは**全部人の仕事**。
 */
const TODO = [
  "why: なぜそう書いてしまうか。この表の価値はここ（対照表に無い列）。",
  "title: 何をしようとして、どう書いたか（1行）。",
  "wrote / fixed: 最小の再現。当たった定義から要らない所を削って作る（客先の語彙は残さない）。",
  "fix: 直し方（1行）。",
  "id: 転び方が分かる名前に付け替える（診断名は diagnosis にあるので要らない）。",
];

/** 再現と直した形の両方が入っているときの、残った人の仕事（**言葉だけ**）。 */
const TODO_WITH_FIXED = [
  "why: なぜそう書いてしまうか。この表の価値はここ（対照表に無い列）。",
  "title: 何をしようとして、どう書いたか（1行）。",
  "fix: 直し方（1行）。下書きの wrote と fixed の差を見れば書ける。",
  "wrote / fixed: 下書きが入っている。ラベルは記号に置き換えたが、**id や項目名は元のまま**なので、客先の語彙が残っていないか見る。",
  "id: 転び方が分かる名前に付け替える（診断名は diagnosis にあるので要らない）。",
];

/** `--repro` で下書きが入っているときの、残った人の仕事。 */
const TODO_WITH_REPRO = [
  "why: なぜそう書いてしまうか。この表の価値はここ（対照表に無い列）。",
  "title: 何をしようとして、どう書いたか（1行）。",
  "wrote: 下書きが入っている。ラベルは記号に置き換えたが、**id や項目名は元のまま**なので、客先の語彙が残っていないか見る。",
  "fixed: 直したあとの形（下書きから作る。問題ゼロで通ること）。",
  "fix: 直し方（1行）。",
  "id: 転び方が分かる名前に付け替える（診断名は diagnosis にあるので要らない）。",
];

const byHitsThenName = (a: Tally, b: Tally): number =>
  b.where.length - a.where.length || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

function add(
  tallies: Map<string, Tally>,
  found: {
    name: string;
    unknownKey: boolean;
    says: string;
    file: string;
    path: string;
    document: Record<string, unknown>;
    registry?: DefinitionRegistry;
  },
): void {
  // 警告の規則名と未知キーの名前は別の空間なので、鍵を分ける。
  const key = `${found.unknownKey ? "key" : "rule"}:${found.name}`;
  const tally = tallies.get(key) ?? {
    name: found.name,
    unknownKey: found.unknownKey,
    says: found.says,
    where: [],
    files: new Set<string>(),
    found: found.document,
    registry: found.registry,
  };
  tally.where.push({ file: found.file, path: found.path });
  tally.files.add(found.file);
  tallies.set(key, tally);
}

/** その診断を載せている実例の id（無ければ false）。 */
function catalogEntry(catalog: FailureCatalog, tally: Tally): string | false {
  for (const failure of catalog.failures) {
    const names = tally.unknownKey
      ? (failure.diagnosis.unknownKeys ?? [])
      : (failure.diagnosis.warnings ?? []);
    if (names.includes(tally.name)) return failure.id;
  }
  return false;
}

/** 読んだ結果。`document` が無いとき、`broken` なら壊れた定義・でなければ別物。 */
interface ReadResult {
  document?: Record<string, unknown>;
  /** 定義のつもりで書かれているのに読めない（＝報告する価値がある）。 */
  broken: boolean;
  reason: string;
}

/**
 * YAML でも JSON でも読む。
 *
 * ディレクトリを走査すると `pubspec.yaml` や `hatake-registry.json` のような**定義で
 * ないファイル**が普通に混ざる。それを「読めなかった」と言うと警報が鳴りっぱなしに
 * なるので、`page:` / `app:` を名乗っているものだけを壊れた定義として扱う。
 */
function parse(source: string): ReadResult {
  const claims = /^\s*(page|app)\s*:/m.test(source) || /"(page|app)"\s*:/.test(source);
  let document: unknown;
  try {
    document = parseYamlText(source);
  } catch (error) {
    return {
      broken: claims,
      reason: error instanceof Error ? error.message.split("\n")[0] : String(error),
    };
  }
  if (typeof document !== "object" || document === null || Array.isArray(document)) {
    return { broken: claims, reason: "定義（map）ではありません。" };
  }
  const dict = document as Record<string, unknown>;
  if (dict.page === undefined && dict.app === undefined) {
    return { broken: false, reason: "page: も app: もありません。" };
  }
  return { document: dict, broken: false, reason: "" };
}

/** 人が読む形。候補は「そのまま人に渡せる下書き」として出す。 */
export function renderHarvest(result: HarvestResult, min: number): string {
  const out = [
    `走査: 定義 ${result.scanned} 本` +
      (result.ignored === 0 ? "" : `（定義でないファイル ${result.ignored} 件は飛ばした）`),
    "",
  ];
  if (result.candidates.length === 0) {
    out.push("候補はありません（繰り返し出ている診断が無い＝いまの定義は健康）。");
  } else {
    out.push(
      `候補 ${result.candidates.length} 件（載せるかは人が決める。自動では足さない）:`,
    );
    for (const candidate of result.candidates) {
      out.push("");
      out.push(`# ${candidate.id}  ${candidate.hits} 箇所 / ${candidate.files} 本`);
      out.push(`  道具が言うこと: ${candidate.says}`);
      for (const hit of candidate.where.slice(0, 5)) {
        out.push(`  出た所: ${hit.file}  ${hit.path}`);
      }
      if (candidate.where.length > 5) {
        out.push(`  出た所: （ほか ${candidate.where.length - 5} 箇所）`);
      }
      if (candidate.wrote !== undefined) {
        out.push(`  最小の再現（${candidate.removed} 箇所削った下書き）:`);
        for (const line of candidate.wrote) out.push(`    ${line}`);
      }
      if (candidate.fixed !== undefined) {
        out.push("  直した形（診断ゼロを確かめた下書き）:");
        for (const line of candidate.fixed) out.push(`    ${line}`);
      } else if (candidate.fixNote !== undefined) {
        out.push(`  直した形: ${candidate.fixNote}`);
      }
      for (const todo of candidate.todo) out.push(`  人が書く: ${todo}`);
    }
  }
  if (result.known.length > 0) {
    out.push("");
    out.push("既にカタログにある（数えただけ）:");
    for (const entry of result.known) {
      out.push(`  ${entry.diagnosis} → ${entry.known}  ${entry.hits} 箇所`);
    }
  }
  if (result.rare.length > 0) {
    out.push("");
    out.push(`${min} 回に届かなかった（--min を下げれば候補になる）:`);
    for (const entry of result.rare) {
      out.push(`  ${entry.diagnosis}  ${entry.hits} 箇所`);
    }
  }
  out.push("");
  out.push(HARVEST_NOTE);
  return out.join("\n");
}

/** 収穫できる範囲を毎回言う。ここを黙ると「これで全部」という嘘になる。 */
export const HARVEST_NOTE =
  "※ ここに出るのは**道具が言えた転び方**だけです。言われない転び方（枠の条件と噛み合わない" +
  "条件・意図と違う項目を必須にした等）は hatake explain で読み返して人が見つけてください。";
