import type {
  ActionRegistry,
  ExportSink,
  Notifier,
  PrintSink,
  RepositoryRegistry,
} from "@hatake-fw/runtime";
import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";

/**
 * アプリが登録したもの一式。**枠組みは何も作らない**ので、ここに入っているものが
 * その案件で「繋がっている」もののすべて。
 *
 * Vue 版（`@hatake-fw/vue3`）とまったく同じ形。**同じ土台を2つの Renderer で
 * 共有している**ので、案件のコードは登録の書き方を変えずに Renderer を差し替えられる。
 */
export interface HatakeRegistries {
  readonly repositories: RepositoryRegistry;
  readonly actions?: ActionRegistry;
  readonly exportSink?: ExportSink;
  readonly printSink?: PrintSink;
}

const Registries = createContext<HatakeRegistries | undefined>(undefined);

/** 画面の下に登録を配る。Flutter 側の `HatakeScope` に当たる。 */
export function HatakeScope(props: {
  registries: HatakeRegistries;
  children: ReactNode;
}): ReactNode {
  return <Registries.Provider value={props.registries}>{props.children}</Registries.Provider>;
}

/**
 * 囲みから登録を取る。**無ければ落とす** — 登録し忘れた画面が「出ているのに
 * 何も起きない」状態になるのが、この枠組みがいちばん避けたい形。
 */
export function useRegistries(): HatakeRegistries {
  const found = useContext(Registries);
  if (found === undefined) {
    throw new Error("HatakeScope が見つかりません。画面を <HatakeScope registries={…}> で囲んでください。");
  }
  return found;
}

/**
 * controller（[[Notifier]]）を React に繋ぐ。
 *
 * `useSyncExternalStore` がそのまま食べられる形で土台を作ってあるので、ここは
 * 3行で済む。**状態そのものではなく版の番号**を見るのが要点で、controller が持つ
 * 入れ子の地図をそのまま返すと、比べるたびに別物になって描き直しが止まらない。
 */
export function useController<T extends Notifier>(controller: T): number {
  return useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
}

/**
 * controller を1回だけ作る。
 *
 * `useMemo` で包まないと、描き直すたびに作り直して**読み込みが止まらなくなる**
 * （作る → 読む → 描き直す → 作る …）。
 */
export function useOnce<T>(make: () => T, deps: unknown[]): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(make, deps);
}

/** 失敗をそのまま出す。**黙って空の一覧を出さない**（この枠組みが避けたい形）。 */
export function HatakeError({ error }: { error: unknown }): ReactNode {
  if (error === null || error === undefined) return null;
  return (
    <p className="hatake-field-message" role="alert" data-hatake="error">
      {error instanceof Error ? error.message : String(error)}
    </p>
  );
}
