import { recordKeyOf } from "@hatake-fw/api/internal";

import { Notifier } from "./notifier.js";
import {
  type DataRecord,
  type PageResult,
  type Repository,
  type RepositoryQuery,
  repositoryQuery,
} from "./repository.js";

/**
 * 一覧を持つ画面（search / crud の一覧側 / master）が共通で使う読み取りの道。
 *
 * **Repository と話すのはここだけ。** 条件・ページ・並べ替えの状態を1か所に置いて、
 * Renderer は結果を描くだけにする。Dart 側の `ListController` と同じ振る舞い。
 */
export class ListController extends Notifier {
  readonly repository: Repository;
  readonly pageSize: number;
  /** 行を指す項目（`page.key`）。選んだ行を覚えるのに使う。 */
  readonly keyFields: readonly string[];

  private _query: RepositoryQuery;
  private _loading = false;
  private _error: unknown = null;
  private _items: readonly DataRecord[] = [];
  private _totalCount = 0;
  /**
   * 選んだ行の鍵。**並び順ではなく鍵で覚える**ので、読み直しても選択が生き残る
   * （区切って実行して途中で止めたとき、残りを選んだまま次を押せるのが要点）。
   *
   * 中身は `String(鍵)`。合成鍵は `recordKeyOf` が1つの値にまとめてくれるが、
   * それが object のことがあるので、比べられる字にしてから持つ。
   */
  private _selected = new Set<string>();

  constructor(options: {
    repository: Repository;
    pageSize: number;
    keyFields?: readonly string[];
    /**
     * 最初の読み込みの条件（検索欄の既定値。`filterDefaults` が解いたもの）。
     * 入力欄だけ埋まって一覧は全件、にしないため。
     */
    filters?: Readonly<Record<string, unknown>>;
  }) {
    super();
    this.repository = options.repository;
    this.pageSize = options.pageSize;
    this.keyFields = options.keyFields ?? [];
    this._query = repositoryQuery({ pageSize: options.pageSize, filters: { ...(options.filters ?? {}) } });
  }

  get query(): RepositoryQuery {
    return this._query;
  }
  get loading(): boolean {
    return this._loading;
  }
  get error(): unknown {
    return this._error;
  }
  get items(): readonly DataRecord[] {
    return this._items;
  }
  get totalCount(): number {
    return this._totalCount;
  }
  get page(): number {
    return this._query.page;
  }

  get pageCount(): number {
    if (this.pageSize <= 0) return 1;
    const count = Math.ceil(this._totalCount / this.pageSize);
    return count < 1 ? 1 : count;
  }

  // ── 選んだ行（`scope: selection` のボタンが実行する相手） ────────

  /**
   * いま選ばれている行のうち、**このページに出ているもの**。
   *
   * 出ていない行を実行の相手にしないのは、押した人が見ていない行を動かさないため
   * （ページを移ったあとに「前のページで選んだ3件」が一緒に動くのは事故）。
   */
  get selectedRows(): readonly DataRecord[] {
    return this._items.filter((row) => this._selected.has(this._keyOf(row)));
  }

  /** 選ばれている行の鍵（このページに出ているもの）。 */
  get selectedKeys(): readonly unknown[] {
    return this.selectedRows.map((row) => recordKeyOf(this.keyFields, row));
  }

  get selectedCount(): number {
    return this.selectedRows.length;
  }

  /** このページの行が全部選ばれているか（1行も無ければ false）。 */
  get allSelected(): boolean {
    return this._items.length > 0 && this.selectedRows.length === this._items.length;
  }

  isSelected(key: unknown): boolean {
    return this._selected.has(String(key));
  }

  /** 1行の選び・選び直し。 */
  toggleSelected(key: unknown): void {
    const id = String(key);
    if (this._selected.has(id)) this._selected.delete(id);
    else this._selected.add(id);
    this.notify();
  }

  /** このページぜんぶを選ぶ／外す。 */
  toggleAllSelected(): void {
    if (this.allSelected) {
      for (const row of this._items) this._selected.delete(this._keyOf(row));
    } else {
      for (const row of this._items) this._selected.add(this._keyOf(row));
    }
    this.notify();
  }

  /**
   * 選び直す（**入れ替え**。足すのではない）。
   *
   * 区切って実行したあと「終わっていない行」「失敗した行」だけを残すのに使う。
   */
  setSelection(keys: readonly unknown[]): void {
    this._selected = new Set(keys.map(String));
    this.notify();
  }

  clearSelection(): void {
    if (this._selected.size === 0) return;
    this._selected.clear();
    this.notify();
  }

  private _keyOf(row: DataRecord): string {
    return String(recordKeyOf(this.keyFields, row));
  }

  /** 最初の1ページ。作ったあとに1回呼ぶ。 */
  init(): Promise<void> {
    return this.load();
  }

  /** いまの条件で読み直す。 */
  async load(): Promise<void> {
    this._loading = true;
    this._error = null;
    this.notify();
    try {
      const result: PageResult = await this.repository.search(this._query);
      this._items = result.items;
      this._totalCount = result.totalCount;
    } catch (error) {
      this._error = error;
      this._items = [];
      this._totalCount = 0;
    } finally {
      this._loading = false;
      this.notify();
    }
  }

  /** 条件を入れ替えて、**1ページ目から**読み直す。 */
  search(filters: Readonly<Record<string, unknown>>): Promise<void> {
    this._query = { ...this._query, filters, page: 0 };
    // **条件が変われば別の一覧**なので、選択は持ち越さない（見えなくなった行が
    // 選ばれたまま次の一括に混ざる、を作らない）。
    this._selected.clear();
    return this.load();
  }

  /** ページを移る（範囲の外と、同じページは何もしない）。 */
  setPage(page: number): Promise<void> {
    if (page < 0 || page >= this.pageCount || page === this._query.page) {
      return Promise.resolve();
    }
    this._query = { ...this._query, page };
    return this.load();
  }

  /** 並べ替えて読み直す。 */
  sortBy(field: string, ascending = true): Promise<void> {
    this._query = { ...this._query, sortField: field, sortAscending: ascending };
    return this.load();
  }

  /**
   * 1件消して読み直す。消した結果そのページが空になるなら1つ戻る。
   *
   * **Repository が断った場合（「まだ受注から参照されています」）も、読み込みの
   * 失敗と同じように `error` に出す。** 投げっぱなしにしないのは、押した人にも
   * 呼んだ側にも「消えなかった」が伝わる必要があるため。
   */
  async deleteRecord(key: unknown): Promise<void> {
    try {
      await this.repository.delete(key);
    } catch (error) {
      this.setError(error);
      return;
    }
    if (this._items.length <= 1 && this._query.page > 0) {
      this._query = { ...this._query, page: this._query.page - 1 };
    }
    await this.load();
  }

  /**
   * 出力のために、いまの条件をもう一度**大きい1ページ**で引く。
   *
   * 画面に出ている行だけを出力すると「見えているものと違う」が起きる。かといって
   * 上限なしで全部持つのも事故なので、`limit` で切る。
   */
  async fetchForExport(limit: number): Promise<readonly DataRecord[]> {
    const result = await this.repository.search({
      ...this._query,
      page: 0,
      pageSize: limit,
    });
    return result.items;
  }

  protected setError(error: unknown): void {
    this._error = error;
    this.notify();
  }
}
