import { type OptionItem, type OptionsSource, visibleOptions } from "@hatake-fw/api/internal";

import { Notifier } from "./notifier.js";
import type { DataRecord, RepositoryRegistry } from "./repository.js";

/** 選択肢を持つもの（入力項目・検索条件・列）。 */
export interface OptionsOwnerLike {
  readonly field: string;
  readonly options: OptionItem[];
  readonly optionsFrom?: string;
  readonly optionsSource?: OptionsSource;
}

/**
 * 選択肢の取り寄せ（`optionsSource`）。**Flutter 版の `_OptionsFetcher` と同じ規則**（0.9.23）。
 *
 * 0.9.22 までブラウザ版は `optionsSource` を読んでおらず、同梱の例（`dept_master.yaml`）の
 * 「選択肢をマスタから引く」欄は**空の選択肢**で出ていた（画面は出る・エラーも出ない）。
 *
 *   ・定義に書いた選択肢（`options` と `optionsFrom` の絞り込み）は `visibleOptions` のまま
 *   ・`optionsSource` は Repository から引いて、「項目名＋親の値」で覚える＝親が変われば
 *     引き直し、同じ親のままなら1回だけ引く
 *   ・親を見る指定なのに親が空なら、まだ引かない（全件出すと連動の意味がない）
 *   ・引けなかったら空（画面では言わない。Repository の失敗はアプリ側の話）
 *   ・引いた行も覚える（`optionsSource.copy` で写す元。写し方は `copiedFrom`）
 *
 * 引けたら知らせる（`subscribe`）ので、描く側は描き直すだけ。Framework は HTTP も SQL も
 * 知らないので、一覧と同じ契約（`Repository.search`）で頼むだけ。
 */
export class OptionsFetcher extends Notifier {
  private readonly _fetched = new Map<string, OptionItem[]>();
  private readonly _rows = new Map<string, readonly DataRecord[]>();
  private readonly _fetching = new Set<string>();

  constructor(private readonly repositories?: RepositoryRegistry) {
    super();
  }

  private keyOf(owner: OptionsOwnerLike, values: Readonly<Record<string, unknown>>): string {
    const parent = owner.optionsFrom;
    return `${owner.field}#${String(parent === undefined ? null : values[parent] ?? null)}`;
  }

  /** [owner] がいま出すべき選択肢。引けるまでは空。 */
  optionsFor(owner: OptionsOwnerLike, values: Readonly<Record<string, unknown>>): OptionItem[] {
    const source = owner.optionsSource;
    if (source === undefined) return visibleOptions(owner, { ...values });
    const key = this.keyOf(owner, values);
    const found = this._fetched.get(key);
    if (found !== undefined) return found;
    void this.fetch(owner, source, values, key);
    return [];
  }

  /** [value] を選んだときの元の行（`optionsSource.copy` で写す元）。無ければ undefined。 */
  rowFor(
    owner: OptionsOwnerLike,
    values: Readonly<Record<string, unknown>>,
    value: unknown,
  ): DataRecord | undefined {
    const source = owner.optionsSource;
    if (source === undefined || value === null || value === undefined) return undefined;
    return this._rows.get(this.keyOf(owner, values))?.find((row) => row[source.value] === value);
  }

  private async fetch(
    owner: OptionsOwnerLike,
    source: OptionsSource,
    values: Readonly<Record<string, unknown>>,
    key: string,
  ): Promise<void> {
    if (this._fetching.has(key)) return;
    const registry = this.repositories;
    if (registry === undefined || !registry.has(source.repository)) return;
    const parent = owner.optionsFrom;
    const parentValue = parent === undefined ? undefined : values[parent];
    if (
      source.parentKey !== undefined &&
      parent !== undefined &&
      (parentValue === undefined || parentValue === null || String(parentValue) === "")
    ) {
      this._fetched.set(key, []);
      return;
    }
    this._fetching.add(key);
    try {
      const result = await registry.resolve(source.repository).search({
        filters:
          source.parentKey !== undefined && parentValue !== undefined && parentValue !== null
            ? { [source.parentKey]: parentValue }
            : {},
        page: 0,
        pageSize: source.limit,
        sortAscending: true,
      });
      this._rows.set(key, result.items);
      this._fetched.set(
        key,
        result.items.map((row) => ({ value: row[source.value], label: String(row[source.label] ?? "") })),
      );
    } catch {
      this._fetched.set(key, []);
    } finally {
      this._fetching.delete(key);
      this.notify();
    }
  }
}
