import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hatake/hatake.dart';

/// **定義の言葉で**画面の中を探す。
///
/// キーの規約そのものは [HatakeKeys]（枠組み側の契約）。ここはそれを `Finder` に
/// するだけの薄い層＝`find.byKey(Key(HatakeKeys.form('orderNo')))` を毎回書かない
/// ためのもの。
///
/// ```dart
/// await tester.enterText(HatakeFind.field('orderNo'), 'SO-1');
/// await tester.tap(HatakeFind.action('approve'));
/// await tester.tap(HatakeFind.confirmOk);
/// ```
///
/// よく使うものだけ並べてある。ここに無いキーは [byKey] に [HatakeKeys] の文字列を
/// 渡す（規約の**全部**は [HatakeKeys.shapes] に在る）。
abstract final class HatakeFind {
  /// 規約の文字列から直に探す（ここに無いキー用の逃げ道）。
  static Finder byKey(String key) => find.byKey(Key(key));

  // ── 入力の枠 ──────────────────────────────────────────────────────
  static Finder field(String name) => byKey(HatakeKeys.form(name));
  static Finder option(String name, Object value) =>
      byKey(HatakeKeys.option(name, value));
  static Finder get formSave => byKey(HatakeKeys.formSave);
  static Finder get formCancel => byKey(HatakeKeys.formCancel);
  static Finder detail(String name) => byKey(HatakeKeys.detail(name));

  // ── 一覧 ──────────────────────────────────────────────────────────
  static Finder action(String id) => byKey(HatakeKeys.action(id));
  static Finder rowAction(String id, Object rowKey) =>
      byKey(HatakeKeys.rowAction(id, rowKey));
  static Finder edit(Object rowKey) => byKey(HatakeKeys.edit(rowKey));
  static Finder delete(Object rowKey) => byKey(HatakeKeys.delete(rowKey));
  static Finder filter(String slot) => byKey(HatakeKeys.filter(slot));
  static Finder get search => byKey(HatakeKeys.search);
  static Finder get prev => byKey(HatakeKeys.prev);
  static Finder get next => byKey(HatakeKeys.next);
  static Finder get empty => byKey(HatakeKeys.empty);
  static Finder get error => byKey(HatakeKeys.error);

  // ── 確認 ──────────────────────────────────────────────────────────
  static Finder get confirm => byKey(HatakeKeys.confirm);
  static Finder get confirmOk => byKey(HatakeKeys.confirmOk);
  static Finder get confirmCancel => byKey(HatakeKeys.confirmCancel);
  static Finder prompt(String actionId) => byKey(HatakeKeys.prompt(actionId));
  static Finder promptOk(String actionId) =>
      byKey(HatakeKeys.promptOk(actionId));

  // ── 明細 ──────────────────────────────────────────────────────────
  static Finder subTable(String name) => byKey(HatakeKeys.subTable(name));
  static Finder subTableAdd(String name) => byKey(HatakeKeys.subTableAdd(name));
  static Finder subTableEdit(String name, Object index) =>
      byKey(HatakeKeys.subTableEdit(name, index));
  static Finder subTableDelete(String name, Object index) =>
      byKey(HatakeKeys.subTableDelete(name, index));
  static Finder subTableRowSave(String name) =>
      byKey(HatakeKeys.subTableRowSave(name));

  // ── ステップ入力 ──────────────────────────────────────────────────
  static Finder get wizardNext => byKey(HatakeKeys.wizardNext);
  static Finder get wizardBack => byKey(HatakeKeys.wizardBack);
  static Finder get wizardSave => byKey(HatakeKeys.wizardSave);
  static Finder wizardStep(String id) => byKey(HatakeKeys.wizardStep(id));

  // ── アプリの外枠・ダッシュボード ──────────────────────────────────
  static Finder menu(String idOrPage) => byKey(HatakeKeys.menu(idOrPage));
  static Finder tab(String pageId) => byKey(HatakeKeys.tab(pageId));
  static Finder tabClose(String pageId) => byKey(HatakeKeys.tabClose(pageId));
  static Finder card(String id) => byKey(HatakeKeys.card(id));
  static Finder cardValue(String id) => byKey(HatakeKeys.cardValue(id));
}
