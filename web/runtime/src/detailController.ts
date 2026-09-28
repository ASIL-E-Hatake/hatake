import { Notifier } from "./notifier.js";
import type { DataRecord, Repository } from "./repository.js";

/**
 * 詳細画面（`kind: detail`）の土台。鍵で1件だけ読む。
 *
 * 鍵が無いときに**取りに行かない**のは、足りない鍵で取りに行くと別の1件が開く
 * ため（複合キーで1つでも欠けたら `undefined` になる、と同じ話）。
 */
export class DetailController extends Notifier {
  readonly repository: Repository;
  readonly recordKey: unknown;

  private _loading = false;
  private _error: unknown = null;
  private _record: DataRecord | null = null;

  constructor(options: { repository: Repository; recordKey: unknown }) {
    super();
    this.repository = options.repository;
    this.recordKey = options.recordKey;
  }

  get loading(): boolean {
    return this._loading;
  }
  get error(): unknown {
    return this._error;
  }
  get record(): DataRecord | null {
    return this._record;
  }

  init(): Promise<void> {
    return this.load();
  }

  async load(): Promise<void> {
    this._loading = true;
    this._error = null;
    this.notify();
    try {
      const key = this.recordKey;
      this._record =
        key === undefined || key === null ? null : await this.repository.findByKey(key);
    } catch (error) {
      this._error = error;
      this._record = null;
    } finally {
      this._loading = false;
      this.notify();
    }
  }
}
