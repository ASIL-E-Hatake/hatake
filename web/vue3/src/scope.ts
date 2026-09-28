import type {
  ActionRegistry,
  ExportSink,
  Notifier,
  PrintSink,
  RepositoryRegistry,
} from "@hatake-fw/runtime";
import {
  defineComponent,
  h,
  inject,
  markRaw,
  onScopeDispose,
  provide,
  shallowRef,
  type InjectionKey,
  type PropType,
  type Ref,
  type VNode,
} from "vue";

/**
 * アプリが登録したもの一式。**枠組みは何も作らない**ので、ここに入っているものが
 * その案件で「繋がっている」もののすべて。
 */
export interface HatakeRegistries {
  readonly repositories: RepositoryRegistry;
  readonly actions?: ActionRegistry;
  readonly exportSink?: ExportSink;
  readonly printSink?: PrintSink;
}

const key: InjectionKey<HatakeRegistries> = Symbol("hatake");

/**
 * 画面の下に登録を配る。Flutter 側の `HatakeScope` に当たる。
 *
 * 使い方は囲むだけ:
 *
 * ```ts
 * h(HatakeScope, { registries }, () => h(HatakePage, { definition }))
 * ```
 */
export const HatakeScope = defineComponent({
  name: "HatakeScope",
  props: {
    registries: { type: Object as PropType<HatakeRegistries>, required: true },
  },
  setup(props, { slots }) {
    // **`markRaw` が要る。** 登録は Repository や handler の**実物**で、Vue の反応系に
    // 包ませるものではない。包まれると `#repositories` のような私有フィールドが
    // Proxy 越しに読めなくなり、
    //   Cannot read private member #repositories from an object whose class did not declare it
    // で落ちる（実際にこれで8件とも落とした）。しかも落ちるのは**使う側の画面**なので、
    // 気づくのが遅い。
    provide(key, markRaw(props.registries));
    return () => slots.default?.();
  },
});

/**
 * 囲みから登録を取る。**無ければ落とす** — 登録し忘れた画面が「出ているのに
 * 何も起きない」状態になるのが、この枠組みがいちばん避けたい形。
 */
export function useRegistries(): HatakeRegistries {
  const found = inject(key, undefined);
  if (found === undefined) {
    throw new Error(
      "HatakeScope が見つかりません。画面を <HatakeScope :registries=\"…\"> で囲んでください。",
    );
  }
  return found;
}

/**
 * controller（[[Notifier]]）を Vue の反応に繋ぐ。
 *
 * controller は**入れ子の地図**を持つので、状態そのものではなく**版の番号**を
 * 見る（毎回新しい地図を作ると、比べるたびに別物になって描き直しが止まらない）。
 * 番号が変わったら読み直す、という形にして、読み出しは controller の getter を
 * そのまま使う。
 */
export function useController<T extends Notifier>(controller: T): { version: Ref<number> } {
  const version = shallowRef(controller.getSnapshot());
  const off = controller.subscribe(() => {
    version.value = controller.getSnapshot();
  });
  onScopeDispose(off);
  return { version };
}

/** 描画関数の中で「版を読んだ」と言うための印（読まないと更新が届かない）。 */
export const touch = (version: Ref<number>): number => version.value;

export type Rendered = VNode | VNode[] | null;
export { h };
