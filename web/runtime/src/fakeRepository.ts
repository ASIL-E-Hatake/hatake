import { recordKeyId, recordKeyOf } from "@hatake-fw/api/internal";

import {
  type DataRecord,
  type PageResult,
  type Repository,
  type RepositoryQuery,
} from "./repository.js";

/**
 * 手元の配列で動く Repository。**試験と、繋ぐ前の下書き**のためのもの。
 *
 * Dart 側の `hatake_test` の `FakeRepository` と同じ役目。配るのは、画面の試験を
 * 書く人に**毎回これを書かせない**ため（書かせると人ごとに振る舞いが違って、
 * 「試験では通るのに本物では落ちる」が出る）。
 *
 * 絞り込みは**含む**で見る（文字は部分一致、それ以外は等しいか）。本物の
 * Repository は SQL なり API なりで決めるので、ここは試験が読める最小限。
 */
export class FakeRepository implements Repository {
  private _rows: DataRecord[];
  readonly keyFields: readonly string[];

  constructor(rows: readonly DataRecord[] = [], keyFields: readonly string[] = ["id"]) {
    this._rows = rows.map((one) => ({ ...one }));
    this.keyFields = keyFields;
  }

  /** いま持っている行（試験が結果を見るため）。 */
  get rows(): readonly DataRecord[] {
    return this._rows;
  }

  async search(query: RepositoryQuery): Promise<PageResult> {
    let found = this._rows.filter((row) =>
      Object.entries(query.filters).every(([field, wanted]) => {
        if (wanted === undefined || wanted === null || wanted === "") return true;
        const value = row[field];
        if (typeof wanted === "string" && typeof value === "string") {
          return value.includes(wanted);
        }
        return value === wanted;
      }),
    );

    const sortField = query.sortField;
    if (sortField !== undefined) {
      const sign = query.sortAscending ? 1 : -1;
      found = [...found].sort((a, b) => {
        const left = a[sortField];
        const right = b[sortField];
        if (left === right) return 0;
        // 比べられないものは**並べない**（当てにいって別の順を作らない）。
        if (typeof left === "number" && typeof right === "number") {
          return (left - right) * sign;
        }
        return String(left).localeCompare(String(right)) * sign;
      });
    }

    const from = query.page * query.pageSize;
    return {
      items: found.slice(from, from + query.pageSize).map((one) => ({ ...one })),
      totalCount: found.length,
    };
  }

  async findByKey(key: unknown): Promise<DataRecord | null> {
    const found = this._rows.find((row) => this._idOf(row) === recordKeyId(key));
    return found === undefined ? null : { ...found };
  }

  async create(data: DataRecord): Promise<DataRecord> {
    const made = { ...data };
    this._rows.push(made);
    return { ...made };
  }

  async update(key: unknown, data: DataRecord): Promise<DataRecord> {
    const at = this._rows.findIndex((row) => this._idOf(row) === recordKeyId(key));
    if (at < 0) throw new Error(`更新する1件が見つかりません: ${String(key)}`);
    this._rows[at] = { ...this._rows[at], ...data };
    return { ...this._rows[at] };
  }

  async delete(key: unknown): Promise<void> {
    const at = this._rows.findIndex((row) => this._idOf(row) === recordKeyId(key));
    if (at < 0) throw new Error(`消す1件が見つかりません: ${String(key)}`);
    this._rows.splice(at, 1);
  }

  private _idOf(row: DataRecord): string {
    return recordKeyId(recordKeyOf(this.keyFields, row));
  }
}
