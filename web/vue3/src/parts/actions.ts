import { FormValidator } from "@hatake-fw/api";
import type { FormatterRegistry, ValidationError } from "@hatake-fw/api";
import type { ActionDefinition } from "@hatake-fw/api/internal";
import { ActionScopes, isAllowed, recordKeyOf } from "@hatake-fw/api/internal";
import {
  ActionRunner,
  type ActionAsk,
  type ActionSurroundings,
  confirmAsk,
  type DataRecord,
  onPageTop,
  rowSlots,
} from "@hatake-fw/runtime";
import { h, onScopeDispose, shallowRef, type Ref, type VNode } from "vue";

import { useController, useMessages, useRegistries, useRouter } from "../scope.js";
import { HatakeField } from "./field.js";
import { icon } from "./icon.js";

/**
 * ボタンを押したときのひと揃い（**判断は土台、ここは描くだけ**）。
 *
 * 画面が書くのは3行:
 *
 * ```ts
 * const bar = useActions({ roles });
 * // …描くとき
 * bar.top(definition.actions, definition.table.rowActions, around, { rows: controller.selectedRows })
 * bar.overlay()
 * ```
 *
 * 押せるか・聞くか・何件ずつ送るか・何と言うかは1つも持たない。それは
 * [`ActionRunner`](../../../runtime/src/actionRunner.ts) が決めていて、React 版も
 * 同じものを読む＝**2つの Renderer で判断が食い違わない**。
 */
export interface ActionBar {
  readonly runner: ActionRunner;
  /**
   * 画面の上に出すボタン。
   *
   * **行に出したボタンはここに出さない**（同じボタンが2か所に出る）。ただし
   * `scope: selection` は行に並べても行には出せないので、上に残す（消すと
   * **どこからも押せないボタン**になる）。
   */
  top(
    actions: readonly ActionDefinition[],
    rowActionIds: readonly string[],
    around: (action: ActionDefinition) => ActionSurroundings,
    where?: { rows?: readonly DataRecord[]; record?: DataRecord; mode?: string; loading?: boolean },
  ): VNode | null;
  /**
   * 表の行に出すボタン（**`table.rowActions` の並び順**）。組み込みの「編集」「削除」は
   * 書いたときだけ、**絵のボタン**で出す（Flutter 版と同じ）。
   */
  row(
    actions: readonly ActionDefinition[],
    rowActionIds: readonly string[],
    record: DataRecord,
    around: (action: ActionDefinition) => ActionSurroundings,
    builtIn?: { edit?: () => void; delete?: () => void },
  ): VNode | null;
  /**
   * 組み込みの「削除」の前に聞く。`confirm` を書いていなくても**必ず聞く**
   * （取り消せない唯一の操作）。聞く場所はボタンと同じダイアログ。
   */
  confirmDelete(declaration: ActionDefinition | undefined): Promise<boolean>;
  /** 一覧を持たない画面（`form` / `detail` / `wizard` / `dashboard` / `report`）のボタン。 */
  page(
    actions: readonly ActionDefinition[],
    around: (action: ActionDefinition) => ActionSurroundings,
    where?: { record?: DataRecord; mode?: string },
  ): VNode | null;
  /** 聞くダイアログ・進み具合・押したあとの1行。**画面の最後に1つ置く。** */
  overlay(): VNode | null;
}

export function useActions(options: {
  roles: readonly string[];
  formatters?: FormatterRegistry;
  /** 行を指す項目（組み込みの「編集」「削除」の印に鍵を出す）。 */
  keyFields?: readonly string[];
}): ActionBar {
  const registries = useRegistries();
  const router = useRouter();
  // アプリが文の置き場を配っていればそこへ書く（画面を移っても残る）。配って
  // いなければ自分のぶんを持ち、[[overlay]] がこの画面に出す。
  const messages = useMessages();
  // 聞いている最中だけ中身が入る。`resolve` を握っておいて、押されたら答えを返す。
  const asking = shallowRef<AskState | null>(null);

  const runner = new ActionRunner({
    roles: options.roles,
    actions: registries.actions,
    exportSink: registries.exportSink,
    printSink: registries.printSink,
    router,
    formatters: options.formatters,
    messages,
    ask: (ask) =>
      new Promise<DataRecord | null>((resolve) => {
        asking.value = { ask, resolve, draft: draftOf(ask), errors: [] };
      }),
  });
  const { version } = useController(runner);
  onScopeDispose(() => {
    // 開いたまま画面を離れたら、待っている約束を**やめた扱い**で閉じる
    // （放っておくと await が永遠に戻らない）。
    asking.value?.resolve(null);
  });

  const press = (action: ActionDefinition, around: ActionSurroundings): void => {
    void runner.run(action, around);
  };

  /** ボタン1つ（押せない理由まで添える）。 */
  const button = (
    action: ActionDefinition,
    around: (action: ActionDefinition) => ActionSurroundings,
    given: { why?: string; label?: string; primary: boolean; text?: boolean },
  ): VNode =>
    h(
      "button",
      {
        class: [
          "hatake-button",
          given.primary ? "hatake-button-primary" : null,
          given.text === true ? "hatake-button-text" : null,
        ],
        type: "button",
        "data-hatake": `action:${action.id}`,
        disabled: given.why !== undefined || runner.running !== null,
        // **理由の無い灰色を出さない**（押せないだけなら「壊れている」と読まれる）。
        title: given.why,
        onClick: () => press(action, around(action)),
      },
      given.label ?? action.label,
    );

  return {
    runner,

    top(actions, rowActionIds, around, where = {}) {
      const rows = where.rows ?? [];
      const mine = actions.filter(
        (one) => isAllowed(one.roles, options.roles) && onPageTop(one, rowActionIds),
      );
      if (mine.length === 0) return null;
      return h(
        "div",
        { class: "hatake-actions", "data-hatake": "actions:page" },
        mine.map((action) => {
          if (action.scope !== ActionScopes.selection) {
            const state = runner.enabledFor(action, { record: where.record, mode: where.mode });
            return button(action, around, {
              why: runner.unwiredReason(action) ?? whyOf(state),
              primary: true,
            });
          }
          // 選んだ行に実行するボタン。**何件選ばれているかをラベルに出す**
          // （「3件のつもりが30件」を、押す前に目で見られるようにする）。
          const state = runner.enabledFor(action, { rows });
          const over = runner.overLimit(action, rows.length);
          const why =
            runner.unwiredReason(action) ??
            (rows.length === 0
              ? "行を選んでください"
              : over !== undefined
                ? `一度に実行できるのは ${over} 件までです（${rows.length} 件選ばれています）`
                : state.failing > 0
                  ? `選んだうち ${state.failing} 件が条件に合いません（${state.fields.join(" / ")}）`
                  : undefined);
          return button(action, around, {
            why,
            // 押せない理由は**札にも出す**（Flutter 版と同じ）。灰色のボタンだけ並んで
            // いると、壊れているのか選んでいないだけなのか分からない。
            label:
              rows.length === 0
                ? `${action.label}（行を選んでください）`
                : `${action.label}（${rows.length} 件）`,
            primary: true,
          });
        }),
      );
    },

    row(actions, rowActionIds, record, around, builtIn = {}) {
      const slots = rowSlots(rowActionIds, actions, options.roles);
      if (slots.length === 0) return null;
      return h(
        "span",
        { class: "hatake-row-buttons" },
        slots.map((slot) => {
          if (slot.kind === "action") {
            // **その行のレコード**で判定する（`enabledWhen`）。
            const state = runner.enabledFor(slot.action, { record });
            return button(slot.action, around, {
              why: runner.unwiredReason(slot.action) ?? whyOf(state),
              primary: false,
              text: true,
            });
          }
          // 組み込みの「編集」「削除」。宣言に `enabledWhen` が在ればその行で判定する
          // （「出荷済は消せない」）。
          const press = slot.kind === "edit" ? builtIn.edit : builtIn.delete;
          const why =
            press === undefined
              ? "この画面では使えません"
              : slot.declaration === undefined
                ? undefined
                : whyOf(runner.enabledFor(slot.declaration, { record }));
          const label = slot.kind === "edit" ? "編集" : "削除";
          return h(
            "button",
            {
              key: slot.kind,
              class: "hatake-icon-button",
              type: "button",
              title: why ?? label,
              "aria-label": label,
              disabled: why !== undefined,
              "data-hatake": `${slot.kind}:${String(recordKeyOf(options.keyFields ?? [], record))}`,
              onClick: () => press?.(),
            },
            [icon(slot.kind)],
          );
        }),
      );
    },

    confirmDelete(declaration) {
      const ask = confirmAsk(
        declaration ?? ({ id: "delete", type: "delete", label: "削除", scope: "page", config: {}, roles: [] } as never),
        undefined,
        { destructive: true },
      );
      return runner.ask(ask).then((answer) => answer !== null);
    },

    page(actions, around, where = {}) {
      const mine = actions.filter((one) => isAllowed(one.roles, options.roles));
      if (mine.length === 0) return null;
      return h(
        "div",
        { class: "hatake-actions", "data-hatake": "actions:page" },
        mine.map((action) =>
          button(action, around, {
            why:
              runner.unwiredReason(action) ??
              whyOf(runner.enabledFor(action, { record: where.record, mode: where.mode })),
            primary: true,
          }),
        ),
      );
    },

    overlay() {
      // 版を読む（読まないと更新が届かない）。
      void version.value;
      return h("div", { class: "hatake-overlay" }, [
        progressNode(runner),
        // 上に置き場が在るなら、そちらが出す（同じ文を2か所に出さない）。
        messages === undefined ? messageNode(runner) : null,
        askNode(asking),
      ]);
    },
  };
}

interface AskState {
  readonly ask: ActionAsk;
  readonly resolve: (answer: DataRecord | null) => void;
  readonly draft: DataRecord;
  readonly errors: readonly ValidationError[];
}

/** 聞く項目の既定値（`defaultValue` を書いてあるものだけ先に入れる）。 */
function draftOf(ask: ActionAsk): DataRecord {
  const out: DataRecord = {};
  for (const one of ask.fields) {
    if (one.defaultValue !== undefined) out[one.field] = one.defaultValue;
  }
  return out;
}

/** 押せない理由（**何の状態で決まるのか**まで言う）。押せるなら undefined。 */
function whyOf(state: { enabled: boolean; fields: readonly string[] }): string | undefined {
  if (state.enabled) return undefined;
  if (state.fields.length === 0) return "いまは押せません";
  return `いまは押せません（${state.fields.join(" / ")} によります）`;
}

function progressNode(runner: ActionRunner): VNode | null {
  const progress = runner.progress;
  if (progress === null) return null;
  return h(
    "p",
    { class: "hatake-progress", "data-hatake": "action:progress", role: "status" },
    `${progress.done} / ${progress.total} 件おわりました`,
  );
}

function messageNode(runner: ActionRunner): VNode | null {
  const message = runner.message;
  if (message === null) return null;
  return h(
    "p",
    {
      class: ["hatake-message", message.ok ? "hatake-message-ok" : "hatake-message-ng"],
      "data-hatake": message.ok ? "action:done" : "action:failed",
      role: message.ok ? "status" : "alert",
      onClick: () => runner.clearMessage(),
    },
    message.text,
  );
}

/**
 * 聞くダイアログ。**確認と `prompt` を1枚で出す**（`prompt` の OK が確認そのもの
 * なので、ダイアログを2枚出さない）。
 */
function askNode(asking: Ref<AskState | null>): VNode | null {
  const state = asking.value;
  if (state === null) return null;

  const close = (answer: DataRecord | null): void => {
    asking.value = null;
    state.resolve(answer);
  };

  const submit = (): void => {
    // 聞いた項目も**画面の入力と同じ検証を通す**（`validators` を書いた意味が
    // ダイアログだけ消える、を作らない）。
    // 聞いた項目を**1枚のフォームとして**検証に通す（画面の入力と同じ道）。
    const now = asking.value;
    if (now === null) return;
    const result = new FormValidator().validate(
      { sections: [{ columns: 1, fields: [...now.ask.fields] }] },
      now.draft,
    );
    if (!result.valid) {
      asking.value = { ...now, errors: result.errors };
      return;
    }
    close(now.draft);
  };

  return h(
    "div",
    {
      class: "hatake-dialog-backdrop",
      "data-hatake": "ask",
      onClick: (event: MouseEvent) => {
        // 外を押したらやめる（中を押したときは閉じない）。
        if (event.target === event.currentTarget) close(null);
      },
    },
    [
      h(
        "div",
        {
          class: "hatake-dialog",
          role: "dialog",
          "aria-modal": "true",
          "aria-label": state.ask.title,
        },
        [
          h("h2", { class: "hatake-dialog-title" }, state.ask.title),
          ...(state.ask.message === undefined
            ? []
            : [h("p", { class: "hatake-dialog-message" }, state.ask.message)]),
          ...state.ask.fields.map((field) =>
            h(HatakeField, {
              field,
              record: state.draft,
              errors: state.errors,
              // **いまの下書きを読み直す**（描いた時点のものを掴まない）。掴むと、
              // 1回の描き直しを挟まずに2つ入れたとき**先に入れたほうが消える**
              // （state.draft が古いままで上書きされる）。
              onChange: (name: string, value: unknown, copied?: Readonly<Record<string, unknown>>) => {
                const now = asking.value;
                if (now === null) return;
                asking.value = { ...now, draft: { ...now.draft, ...copied, [name]: value } };
              },
            }),
          ),
          h("div", { class: "hatake-dialog-actions" }, [
            h(
              "button",
              {
                class: "hatake-button",
                type: "button",
                "data-hatake": "ask:cancel",
                onClick: () => close(null),
              },
              state.ask.cancelLabel,
            ),
            h(
              "button",
              {
                class: [
                  "hatake-button",
                  state.ask.danger ? "hatake-button-danger" : "hatake-button-primary",
                ],
                type: "button",
                "data-hatake": "ask:ok",
                onClick: submit,
              },
              state.ask.okLabel,
            ),
          ]),
        ],
      ),
    ],
  );
}
