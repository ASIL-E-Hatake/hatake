import { AggregateRegistry } from "@hatake-fw/api";
import {
  buildReport,
  type ReportDocument,
  type ReportPageDefinition,
  type ReportSheet,
} from "@hatake-fw/api/internal";

import { Notifier } from "./notifier.js";
import type { DataRecord, Repository } from "./repository.js";

/**
 * 帳票（`kind: report`）の土台。条件を1回走らせて、行から紙を組む。
 *
 * **帳票は刷るもので、繰るものではない。** なので Repository を何ページも引かずに、
 * 区切り（`report.limit`）で1回だけ読む。ページ送りは**組み上がった紙の枚数**に
 * 対して起きる（[[sheetIndex]]）。
 */
export class ReportController extends Notifier {
  readonly definition: ReportPageDefinition;
  readonly repository: Repository;
  readonly aggregates: AggregateRegistry;

  private _loading = false;
  private _error: unknown = null;
  private _ran = false;
  private _rows: readonly DataRecord[] = [];
  private _document: ReportDocument = { sheets: [], totalPages: 0 };
  private _sheetIndex = 0;
  private _filters: Readonly<Record<string, unknown>> = {};

  constructor(options: {
    definition: ReportPageDefinition;
    repository: Repository;
    aggregates?: AggregateRegistry;
  }) {
    super();
    this.definition = options.definition;
    this.repository = options.repository;
    this.aggregates = options.aggregates ?? new AggregateRegistry();
  }

  get loading(): boolean {
    return this._loading;
  }
  get error(): unknown {
    return this._error;
  }
  /** 一度でも条件を走らせたか（押す前に空の紙を出さないため）。 */
  get hasRun(): boolean {
    return this._ran;
  }
  /** 紙を組んだ元の行（持ち出すときもこれを書く）。 */
  get rows(): readonly DataRecord[] {
    return this._rows;
  }
  get document(): ReportDocument {
    return this._document;
  }
  /** いま見ている紙（0 から数える）。 */
  get sheetIndex(): number {
    return this._sheetIndex;
  }
  get totalPages(): number {
    return this._document.totalPages;
  }
  /** いま見ている紙。行が1つも無ければ null。 */
  get sheet(): ReportSheet | null {
    return this._document.sheets.length === 0 ? null : this._document.sheets[this._sheetIndex];
  }
  /** いま当てている出力条件。 */
  get filters(): Readonly<Record<string, unknown>> {
    return this._filters;
  }

  /** いまの条件で走らせる。作ったあとに1回呼ぶ。 */
  async load(): Promise<void> {
    this._loading = true;
    this._error = null;
    this.notify();
    try {
      const result = await this.repository.search({
        filters: this._filters,
        page: 0,
        pageSize: this.definition.report.limit,
        // **組は改ページの区切り**なので、刷る順が出力そのものを変える。
        sortField: this.definition.report.sortField,
        sortAscending: this.definition.report.sortAscending,
      });
      this._rows = result.items;
      this._document = buildReport(
        this.definition.report,
        this._rows as DataRecord[],
        this.aggregates,
      );
      this._sheetIndex = 0;
    } catch (error) {
      this._error = error;
      this._rows = [];
      this._document = { sheets: [], totalPages: 0 };
    } finally {
      this._ran = true;
      this._loading = false;
      this.notify();
    }
  }

  /** 条件を入れ替えて走らせ直す。 */
  run(filters: Readonly<Record<string, unknown>>): Promise<void> {
    this._filters = filters;
    return this.load();
  }

  /** 紙を移る（在る枚数の外には出ない）。 */
  setSheet(index: number): void {
    if (index < 0 || index >= this.totalPages || index === this._sheetIndex) return;
    this._sheetIndex = index;
    this.notify();
  }
}
