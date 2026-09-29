import { FormValidator } from "@hatake-fw/api";
import type { FormatterRegistry, ValidationError } from "@hatake-fw/api";
import type { ActionDefinition } from "@hatake-fw/api/internal";
import { ActionScopes, isAllowed } from "@hatake-fw/api/internal";
import {
  ActionRunner,
  type ActionAsk,
  type ActionSurroundings,
  type DataRecord,
} from "@hatake-fw/runtime";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { HatakeField } from "./field.js";
import { useController, useMessages, useOnce, useRegistries, useRouter } from "../scope.js";

/**
 * ボタンを押したときのひと揃い（**判断は土台、ここは描くだけ**）。
 *
 * 画面が書くのは3行:
 *
 * ```tsx
 * const bar = useActions({ roles });
 * {bar.top(definition.actions, definition.table.rowActions, around, { rows: controller.selectedRows })}
 * {bar.overlay()}
 * ```
 *
 * 押せるか・聞くか・何件ずつ送るか・何と言うかは1つも持たない。それは
 * [`ActionRunner`](../../../runtime/src/actionRunner.ts) が決めていて、**Vue 版と
 * 同じものを読む**＝2つの Renderer で判断が食い違わない。印もクラス名も Vue と同じ
 * （`web/tool/check-same-marks.mjs` が見ている）。
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
    where?: { rows?: readonly DataRecord[]; record?: DataRecord; mode?: string },
  ): ReactNode;
  /** 表の行に出すボタン（`table.rowActions` の並び順）。 */
  row(
    actions: readonly ActionDefinition[],
    rowActionIds: readonly string[],
    record: DataRecord,
    around: (action: ActionDefinition) => ActionSurroundings,
  ): ReactNode;
  /** 一覧を持たない画面（`form` / `detail` / `wizard` / `dashboard` / `report`）のボタン。 */
  page(
    actions: readonly ActionDefinition[],
    around: (action: ActionDefinition) => ActionSurroundings,
    where?: { record?: DataRecord; mode?: string },
  ): ReactNode;
  /** 聞くダイアログ・進み具合・押したあとの1行。**画面の最後に1つ置く。** */
  overlay(): ReactNode;
  /** 行を選べるようにするか（`scope: selection` が1つでも見えているか）。 */
  selectable(actions: readonly ActionDefinition[]): boolean;
}

export function useActions(options: {
  roles: readonly string[];
  formatters?: FormatterRegistry;
}): ActionBar {
  const registries = useRegistries();
  const router = useRouter();
  // アプリが文の置き場を配っていればそこへ書く（画面を移っても残る）。
  const messages = useMessages();
  const [asking, setAsking] = useState<AskState | null>(null);
  // 待っている約束。**画面を離れたらやめた扱いで閉じる**（放っておくと await が
  // 永遠に戻らない）。
  const pending = useRef<((answer: DataRecord | null) => void) | null>(null);

  const runner = useOnce(
    () =>
      new ActionRunner({
        roles: options.roles,
        actions: registries.actions,
        exportSink: registries.exportSink,
        printSink: registries.printSink,
        router,
        formatters: options.formatters,
        messages,
        ask: (ask) =>
          new Promise<DataRecord | null>((resolve) => {
            pending.current = resolve;
            setAsking({ ask, draft: draftOf(ask), errors: [] });
          }),
      }),
    [registries, router, messages],
  );
  useController(runner);
  // 役割は描き直しで変わりうる（`?role=` を変えた）。作り直さずに入れ替える。
  useEffect(() => {
    runner.setRoles(options.roles);
  }, [runner, options.roles.join(",")]);
  useEffect(
    () => () => {
      pending.current?.(null);
      pending.current = null;
    },
    [],
  );

  const press = (action: ActionDefinition, around: ActionSurroundings): void => {
    void runner.run(action, around);
  };

  const button = (
    action: ActionDefinition,
    around: (action: ActionDefinition) => ActionSurroundings,
    given: { why?: string; label?: string; primary: boolean },
  ): ReactNode => (
    <button
      key={action.id}
      className={given.primary ? "hatake-button hatake-button-primary" : "hatake-button"}
      type="button"
      data-hatake={`action:${action.id}`}
      disabled={given.why !== undefined || runner.running !== null}
      // **理由の無い灰色を出さない**（押せないだけなら「壊れている」と読まれる）。
      title={given.why}
      onClick={() => press(action, around(action))}
    >
      {given.label ?? action.label}
    </button>
  );

  return {
    runner,

    top(actions, rowActionIds, around, where = {}) {
      const rows = where.rows ?? [];
      const mine = actions.filter(
        (one) =>
          isAllowed(one.roles, options.roles) && (!rowActionIds.includes(one.id) || !fitsRow(one)),
      );
      if (mine.length === 0) return null;
      return (
        <div className="hatake-actions" data-hatake="actions:page">
          {mine.map((action) => {
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
              label: rows.length === 0 ? action.label : `${action.label}（${rows.length} 件）`,
              primary: true,
            });
          })}
        </div>
      );
    },

    row(actions, rowActionIds, record, around) {
      const declared = new Map(actions.map((one) => [one.id, one]));
      const mine: ActionDefinition[] = [];
      for (const id of rowActionIds) {
        const found = declared.get(id);
        // 引けないものは行に出さない: 宣言が無い（`rowaction-not-declared`）・その
        // 役割には見せない・選んだ行に実行するボタン（`selection-as-rowaction`）。
        if (found === undefined || !fitsRow(found) || !isAllowed(found.roles, options.roles)) {
          continue;
        }
        mine.push(found);
      }
      if (mine.length === 0) return null;
      return (
        <span className="hatake-row-buttons">
          {mine.map((action) => {
            // **その行のレコード**で判定する（`enabledWhen`）。
            const state = runner.enabledFor(action, { record });
            return button(action, around, {
              why: runner.unwiredReason(action) ?? whyOf(state),
              primary: false,
            });
          })}
        </span>
      );
    },

    page(actions, around, where = {}) {
      const mine = actions.filter((one) => isAllowed(one.roles, options.roles));
      if (mine.length === 0) return null;
      return (
        <div className="hatake-actions" data-hatake="actions:page">
          {mine.map((action) =>
            button(action, around, {
              why:
                runner.unwiredReason(action) ??
                whyOf(runner.enabledFor(action, { record: where.record, mode: where.mode })),
              primary: true,
            }),
          )}
        </div>
      );
    },

    selectable(actions) {
      return runner.visible(actions, ActionScopes.selection).length > 0;
    },

    overlay() {
      const progress = runner.progress;
      const message = runner.message;
      const close = (answer: DataRecord | null): void => {
        setAsking(null);
        pending.current?.(answer);
        pending.current = null;
      };
      const submit = (): void => {
        if (asking === null) return;
        // 聞いた項目も**画面の入力と同じ検証を通す**（`validators` を書いた意味が
        // ダイアログだけ消える、を作らない）。
        const result = new FormValidator().validate(
          { sections: [{ columns: 1, fields: [...asking.ask.fields] }] },
          asking.draft,
        );
        if (!result.valid) {
          setAsking({ ...asking, errors: result.errors });
          return;
        }
        close(asking.draft);
      };

      return (
        <div className="hatake-overlay">
          {progress === null ? null : (
            <p className="hatake-progress" data-hatake="action:progress" role="status">
              {progress.done} / {progress.total} 件おわりました
            </p>
          )}
          {/* 上に置き場が在るなら、そちらが出す（同じ文を2か所に出さない）。 */}
          {messages !== undefined || message === null ? null : (
            <p
              className={`hatake-message ${message.ok ? "hatake-message-ok" : "hatake-message-ng"}`}
              data-hatake={message.ok ? "action:done" : "action:failed"}
              role={message.ok ? "status" : "alert"}
              onClick={() => runner.clearMessage()}
            >
              {message.text}
            </p>
          )}
          {asking === null ? null : (
            <div
              className="hatake-dialog-backdrop"
              data-hatake="ask"
              onClick={(event) => {
                // 外を押したらやめる（中を押したときは閉じない）。
                if (event.target === event.currentTarget) close(null);
              }}
            >
              <div
                className="hatake-dialog"
                role="dialog"
                aria-modal="true"
                aria-label={asking.ask.title}
              >
                <h2 className="hatake-dialog-title">{asking.ask.title}</h2>
                {asking.ask.message === undefined ? null : (
                  <p className="hatake-dialog-message">{asking.ask.message}</p>
                )}
                {asking.ask.fields.map((field) => (
                  <HatakeField
                    key={field.field}
                    field={field}
                    record={asking.draft}
                    errors={asking.errors}
                    onChange={(name, value) =>
                      // **いまの下書きに足す**（描いた時点のものを掴まない）。
                      setAsking((now) =>
                        now === null ? now : { ...now, draft: { ...now.draft, [name]: value } },
                      )
                    }
                  />
                ))}
                <div className="hatake-dialog-actions">
                  <button
                    className="hatake-button"
                    type="button"
                    data-hatake="ask:cancel"
                    onClick={() => close(null)}
                  >
                    {asking.ask.cancelLabel}
                  </button>
                  <button
                    className={
                      asking.ask.danger
                        ? "hatake-button hatake-button-danger"
                        : "hatake-button hatake-button-primary"
                    }
                    type="button"
                    data-hatake="ask:ok"
                    onClick={submit}
                  >
                    {asking.ask.okLabel}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      );
    },
  };
}

/**
 * そのボタンを**行に出せる**か。
 *
 * 出せないのは `scope: selection` だけ。行に並べると、押した行ではなく**チェックした
 * 行**に実行することになる＝押した人には壊れて見える（`selection-as-rowaction`）。
 */
const fitsRow = (action: ActionDefinition): boolean => action.scope !== ActionScopes.selection;

interface AskState {
  readonly ask: ActionAsk;
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
