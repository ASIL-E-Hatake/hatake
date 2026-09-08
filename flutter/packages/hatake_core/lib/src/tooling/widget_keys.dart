/// 画面の試験が押す・入れる・確かめるための**キーの規約**。
///
/// Renderer が付けている `Key` の文字列は、画面の試験にとっては**公開された契約**。
/// けれど今まではどこにも書いておらず、Renderer の中を読み解いてから試験を書くことに
/// なっていた（AI は当てずっぽうになる）。ここが規約の出どころ。
///
/// ```dart
/// await tester.enterText(find.byKey(Key(HatakeKeys.form('orderNo'))), 'SO-1');
/// await tester.tap(find.byKey(Key(HatakeKeys.action('approve'))));
/// await tester.tap(find.byKey(Key(HatakeKeys.confirmOk)));
/// ```
///
/// 試験から使うときは `hatake_test` の `finders` を通すほうが短い（`Key(...)` を
/// 自分で包まなくてよい）。
///
/// **文字列を返す**（`Key` ではない）のは、ここが Renderer に依らない層だから。
/// Material 以外の Renderer も同じ規約を守れば、同じ試験がそのまま回る。
///
/// [shapes] は**規約の全体**（差し込みを `*` にしたもの）。Renderer に在るキーが
/// ここに無い／ここに在るキーが Renderer に無い、を機械が突き合わせる
/// （`hatake_material/test/widget_keys_test.dart`）。規約を変えたら落ちる所が
/// 1か所にまとまる、というのがこの一覧の値打ち。
///
/// 知られている穴: 項目名が `save` / `cancel` の画面では、その項目のキーが保存ボタンと
/// 同じになる（`hatake.form.save`）。規約を変えると既にある試験が全部落ちるので、
/// 直さずに書いておく＝そういう項目名の画面では `find.byType` で探すこと。
abstract final class HatakeKeys {
  /// 差し込みの位置を表す印（[shapes] を作るときだけ使う）。
  static const any = '*';

  // ── 入力の枠 ──────────────────────────────────────────────────────
  /// 入力の項目（`hatake.form.<項目>`）。
  static String form(String field) => 'hatake.form.$field';

  /// 選択肢1つ（`radio` / `multiSelect` の各項目）。
  static String option(String field, Object value) =>
      'hatake.form.$field.$value';

  static const formSave = 'hatake.form.save';
  static const formCancel = 'hatake.form.cancel';

  /// 詳細画面の1項目（読むだけの画面）。
  static String detail(String field) => 'hatake.detail.$field';

  // ── 一覧 ──────────────────────────────────────────────────────────
  /// 画面のボタン（`hatake.action.<id>`）。一覧の上でも入力の枠の下でも同じ。
  static String action(String id) => 'hatake.action.$id';

  /// 行のボタン（`hatake.rowaction.<id>.<行の鍵>`）。
  static String rowAction(String id, Object rowKey) =>
      'hatake.rowaction.$id.$rowKey';

  /// 組み込みの行のボタン（`edit` / `delete` は id ではなく専用のキー）。
  static String edit(Object rowKey) => 'hatake.edit.$rowKey';
  static String delete(Object rowKey) => 'hatake.delete.$rowKey';

  /// 絞り込みの入力欄（`slot` は項目名。`between` は `<項目>.from` / `.to`）。
  static String filter(String slot) => 'hatake.filter.$slot';

  static const search = 'hatake.search';
  static const prev = 'hatake.prev';
  static const next = 'hatake.next';
  static const empty = 'hatake.empty';
  static const error = 'hatake.error';

  // ── 確認と、押す前に聞く入力 ──────────────────────────────────────
  static const confirm = 'hatake.confirm';
  static const confirmOk = 'hatake.confirm.ok';
  static const confirmCancel = 'hatake.confirm.cancel';

  /// 押す前に値を聞くダイアログ（`prompt` を持つボタン）。
  static String prompt(String actionId) => 'hatake.prompt.$actionId';
  static String promptOk(String actionId) => 'hatake.prompt.$actionId.ok';
  static String promptCancel(String actionId) =>
      'hatake.prompt.$actionId.cancel';

  // ── 一括（選んだ行をまとめて動かす） ──────────────────────────────
  static const bulkProgress = 'hatake.bulkProgress';
  static const bulkProgressCancel = 'hatake.bulkProgress.cancel';

  /// 失敗した行の一覧（一括のあと始末）。
  static const failedRows = 'hatake.failedRows';
  static const failedRowsSelect = 'hatake.failedRows.select';
  static const failedRowsClose = 'hatake.failedRows.close';

  /// 途中でやめたときの「残りを書き出す」。
  static const leftoverExport = 'hatake.leftover.export';

  // ── 明細（subTable） ──────────────────────────────────────────────
  /// 規約だけ小文字（`subtable`）。ほかは camelCase だが、変えると既にある試験が
  /// 全部落ちるので直していない。
  static String subTable(String field) => 'hatake.subtable.$field';
  static String subTableAdd(String field) => 'hatake.subtable.$field.add';
  static String subTableEdit(String field, Object index) =>
      'hatake.subtable.$field.edit.$index';
  static String subTableDelete(String field, Object index) =>
      'hatake.subtable.$field.delete.$index';
  static String subTableUp(String field, Object index) =>
      'hatake.subtable.$field.up.$index';
  static String subTableDown(String field, Object index) =>
      'hatake.subtable.$field.down.$index';
  static String subTableRowSave(String field) =>
      'hatake.subtable.$field.row.save';
  static String subTableRowCancel(String field) =>
      'hatake.subtable.$field.row.cancel';
  static String subTableEmpty(String field) => 'hatake.subtable.$field.empty';
  static String subTableError(String field) => 'hatake.subtable.$field.error';

  /// 親を保存する前は行を持てない（`source` つきの明細）。
  static String subTableNeedsParent(String field) =>
      'hatake.subtable.$field.needsParent';
  static String subTablePrev(String field) => 'hatake.subtable.$field.prev';
  static String subTableNext(String field) => 'hatake.subtable.$field.next';

  // ── ステップ入力（wizard） ────────────────────────────────────────
  static const wizardBack = 'hatake.wizard.back';
  static const wizardNext = 'hatake.wizard.next';
  static const wizardSave = 'hatake.wizard.save';
  static const wizardError = 'hatake.wizard.error';
  static String wizardStep(String id) => 'hatake.wizard.step.$id';

  // ── アプリの外枠（app: の定義） ───────────────────────────────────
  static const appBack = 'hatake.app.back';
  static const appNotFound = 'hatake.app.notfound';
  static String tab(String pageId) => 'hatake.app.tab.$pageId';
  static String tabClose(String pageId) => 'hatake.app.tab.$pageId.close';
  static const tabConfirmClose = 'hatake.app.tab.confirmClose';
  static const tabConfirmCloseOk = 'hatake.app.tab.confirmClose.ok';

  /// メニューの項目（id が無ければ開く画面の id）。
  static String menu(String idOrPage) => 'hatake.menu.$idOrPage';

  /// メニューの束（ラベルで引く＝束に id は書けない）。
  static String menuGroup(String label) => 'hatake.menu.group.$label';
  static String breadcrumb(String pageId) => 'hatake.breadcrumb.$pageId';

  // ── ダッシュボード ────────────────────────────────────────────────
  static String card(String id) => 'hatake.dashboard.$id';
  static String cardValue(String id) => 'hatake.dashboard.$id.value';
  static String cardChart(String id) => 'hatake.dashboard.$id.chart';
  static String cardTable(String id) => 'hatake.dashboard.$id.table';
  static String cardEmpty(String id) => 'hatake.dashboard.$id.empty';
  static String cardError(String id) => 'hatake.dashboard.$id.error';
  static String cardUnsupported(String id) =>
      'hatake.dashboard.$id.unsupported';
  static const dashboardReload = 'hatake.dashboard.reload';

  // ── 帳票（report） ────────────────────────────────────────────────
  static const reportSheet = 'hatake.report.sheet';
  static const reportPrev = 'hatake.report.prev';
  static const reportNext = 'hatake.report.next';
  static const reportPageIndicator = 'hatake.report.pageIndicator';
  static String reportGroup(Object index) => 'hatake.report.group.$index';
  static String reportDetail(Object index) => 'hatake.report.detail.$index';

  /// 規約の全体（差し込みは `*`）。**値は builder が作る**ので、ここと実装が
  /// ズレることはない（ズレるのは「この一覧に足し忘れる」だけで、それは
  /// Renderer との突き合わせが言う）。
  static List<String> get shapes => [
        form(any),
        option(any, any),
        formSave,
        formCancel,
        detail(any),
        action(any),
        rowAction(any, any),
        edit(any),
        delete(any),
        filter(any),
        search,
        prev,
        next,
        empty,
        error,
        confirm,
        confirmOk,
        confirmCancel,
        prompt(any),
        promptOk(any),
        promptCancel(any),
        bulkProgress,
        bulkProgressCancel,
        failedRows,
        failedRowsSelect,
        failedRowsClose,
        leftoverExport,
        subTable(any),
        subTableAdd(any),
        subTableEdit(any, any),
        subTableDelete(any, any),
        subTableUp(any, any),
        subTableDown(any, any),
        subTableRowSave(any),
        subTableRowCancel(any),
        subTableEmpty(any),
        subTableError(any),
        subTableNeedsParent(any),
        subTablePrev(any),
        subTableNext(any),
        wizardBack,
        wizardNext,
        wizardSave,
        wizardError,
        wizardStep(any),
        appBack,
        appNotFound,
        tab(any),
        tabClose(any),
        tabConfirmClose,
        tabConfirmCloseOk,
        menu(any),
        menuGroup(any),
        breadcrumb(any),
        card(any),
        cardValue(any),
        cardChart(any),
        cardTable(any),
        cardEmpty(any),
        cardError(any),
        cardUnsupported(any),
        dashboardReload,
        reportSheet,
        reportPrev,
        reportNext,
        reportPageIndicator,
        reportGroup(any),
        reportDetail(any),
      ];
}
