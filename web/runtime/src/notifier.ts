// 「変わった」を伝えるだけの土台。**依存を足さないための最小限。**
//
// Dart 側は `ChangeNotifier` を使っている。こちらで signals や zustand のような
// ものを持ってくると、**Vue と React のどちらかに寄る**か、依存が1つ増える。
// 必要なのは「購読する／外す／変わったと言う」の3つだけなので、自分で持つ。
//
// これは React の `useSyncExternalStore` がそのまま食べられる形でもある
// （`subscribe(listener) => unsubscribe` と `getSnapshot()`）。Vue 側は
// `subscribe` を `onScopeDispose` で外す。

export type Unsubscribe = () => void;

export abstract class Notifier {
  private readonly _listeners = new Set<() => void>();

  /** 変わったら呼ばれる。戻り値を呼ぶと外れる。 */
  subscribe = (listener: () => void): Unsubscribe => {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  };

  /**
   * いまの中身の見分け（React の `useSyncExternalStore` が同じものかを見る）。
   *
   * 状態そのものではなく**版の番号**を返すのは、controller が持つのが入れ子の
   * 地図で、毎回作り直すと React が無限に描き直すため。
   */
  getSnapshot = (): number => this._version;

  private _version = 0;

  protected notify(): void {
    this._version += 1;
    for (const listener of [...this._listeners]) listener();
  }

  /** 後片付け（購読を全部外す）。画面を閉じるときに呼ぶ。 */
  dispose(): void {
    this._listeners.clear();
  }
}
