// よくある間違い → 正しい書き方（spec/pitfalls.json）。
//
// strict パースが拾えるのは「知らないキー」まで。そこから先の
//   ・構造の間違い（書ける場所を間違える・別の種別のキーを使う）
//   ・落ちないけど意図と違う（groupBy に sort が無い、metric が件数になる）
// は、名前を見ても直し方が分からない。だから対照表として持ち、未知キーから引く。

/** 日本語と英語の対（AI も人も同じ表を読む）。 */
export interface Bilingual {
  ja: string;
  en: string;
}

export interface Pitfall {
  id: string;
  /** この落とし穴に関係するキー。未知キーからここを引いて助言を出す。 */
  keys: string[];
  /** 関係するページ種別。空 = どの種別でも起こる。 */
  pageKinds: string[];
  wrong: Bilingual;
  why: Bilingual;
  fix: Bilingual;
  /** strict で必ず落ちる書き方（行の配列）。落ちない類の間違いには無い。 */
  bad?: string[];
  /** 必ず通る正しい書き方（行の配列）。 */
  good: string[];
}

export interface PitfallCatalog {
  pitfalls: Pitfall[];
}

export type Lang = "ja" | "en";

/** 行の配列を YAML に戻す。 */
export const snippet = (lines: string[]): string => lines.join("\n");

/**
 * 未知キーの名前から、当てはまる落とし穴を引く。
 *
 * ページ種別で絞らないのは、**未知キーの一覧がすでに種別を通っている**から。
 * `form` がそのページで書けるなら未知キーにならないので、名前だけで十分。
 */
export function pitfallsForKeys(
  catalog: PitfallCatalog,
  keys: string[],
): Pitfall[] {
  const wanted = new Set(keys);
  return catalog.pitfalls.filter((p) => p.keys.some((k) => wanted.has(k)));
}

/** 落とし穴1つを1行の助言にする（検証結果に添えるため）。 */
export const describePitfall = (pitfall: Pitfall, lang: Lang = "ja"): string =>
  `${pitfall.wrong[lang]} → ${pitfall.fix[lang]}`;

/**
 * query で絞る。id・キー・本文のどこかに含まれていれば当たり（大文字小文字は無視）。
 * 空 query は全件。
 */
export function filterPitfalls(
  catalog: PitfallCatalog,
  query?: string,
): Pitfall[] {
  const needle = query?.trim().toLowerCase();
  if (needle === undefined || needle === "") return catalog.pitfalls;
  return catalog.pitfalls.filter((p) =>
    [
      p.id,
      ...p.keys,
      ...p.pageKinds,
      p.wrong.ja,
      p.wrong.en,
      p.why.ja,
      p.why.en,
      p.fix.ja,
      p.fix.en,
    ]
      .join("\n")
      .toLowerCase()
      .includes(needle),
  );
}
