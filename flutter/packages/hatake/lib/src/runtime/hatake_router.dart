import 'package:flutter/foundation.dart';
import 'package:hatake_core/hatake_core.dart';

/// One entry on the navigation stack: a page id + resolved route params.
@immutable
class AppRoute {
  final String pageId;
  final Map<String, Object?> params;

  const AppRoute(this.pageId, {this.params = const {}});
}

/// 開いているタブ1枚（読む側に見せる形）。
@immutable
class AppTab {
  /// 安定した id。**閉じても番号を詰めない**＝タブの中身（検索結果や入力）が
  /// 付いて回る（画面の作り直しが起きない）。
  final int id;

  /// そのタブでいま見ている画面。
  final AppRoute current;

  /// そのタブの中で何枚重なっているか（1 なら戻る先が無い）。
  final int depth;

  const AppTab({required this.id, required this.current, required this.depth});
}

/// A minimal, dependency-free navigation stack for `HatakeApp`.
///
/// Holds a stack of [AppRoute]s and notifies on change. The shell renders the
/// top route's page; menu selection [go]es (resets), `navigate` actions [push]
/// (so back returns). No external routing package — Web URL sync is a later add.
///
/// **タブで使うときは、スタックがタブごとに1本ずつ在る。** `single`（既定）のときは
/// 1本だけなので、[current] / [push] / [go] / [pop] の意味はいままでと同じ＝**前面の
/// タブに対する操作**。タブが増えても、URL に出るのは前面のタブだけ（タブ列ごと URL に
/// 載せると、共有リンクが他人の作業状態になる）。
class HatakeRouter extends ChangeNotifier {
  /// タブごとのスタック（`single` なら1本）。
  final List<List<AppRoute>> _tabs;

  /// タブの安定した id（`_tabs` と同じ並び）。
  final List<int> _ids;

  /// 何枚目が前面か。
  int _front = 0;

  /// 次に配る id。閉じた番号は再利用しない。
  int _nextId = 1;

  /// 画面をどう開くか（[AppNavigation]）。**アプリ側が決めた最終の値**
  /// （定義の既定を上書きしたあとのもの）。
  final String navigation;

  /// 開けるタブの上限。
  ///
  /// 上限に達したら**開かずにそう言う**（古いタブを勝手に閉じない＝入力中かもしれない）。
  static const maxTabs = 10;

  HatakeRouter(AppRoute initial, {this.navigation = AppNavigation.single})
      : _tabs = [
          [initial]
        ],
        _ids = [0];

  /// 並べて開くアプリか。
  bool get tabsOpen => navigation == AppNavigation.tabs;

  /// 開いているタブ（左から）。
  List<AppTab> get tabs => [
        for (var i = 0; i < _tabs.length; i++)
          AppTab(id: _ids[i], current: _tabs[i].last, depth: _tabs[i].length),
      ];

  int get tabCount => _tabs.length;

  /// 何枚目が前面か（0 始まり）。
  int get frontTab => _front;

  List<AppRoute> get _stack => _tabs[_front];

  AppRoute get current => _stack.last;
  bool get canPop => _stack.length > 1;
  int get depth => _stack.length;

  /// The current stack, oldest first. Read-only; use it to render a trail
  /// (breadcrumb) of where the user came from.
  List<AppRoute> get stack => List.unmodifiable(_stack);

  /// メニューで選んだとき。
  ///
  /// `single` なら入れ替え（[go]）。タブなら**同じ画面が開いていればそれを前に出す**
  /// （同じものを2枚開いて別々に編集できると、どちらが正か分からない）。無ければ
  /// 新しいタブ。上限に達していたら**開かない**＝false を返すので、呼んだ側が言える。
  bool select(String pageId, {Map<String, Object?> params = const {}}) {
    if (!tabsOpen) {
      go(pageId, params: params);
      return true;
    }
    return _focusOrOpen(pageId, params);
  }

  /// 遷移のボタンを押したとき。
  ///
  /// [newTab] は定義の `action.open: tab`。並べる場所が無ければ（`single`）無視して
  /// いままで通り重ねる＝**書いても壊れない**（効かないことは `validate` が言う）。
  bool navigate(
    String pageId, {
    Map<String, Object?> params = const {},
    bool newTab = false,
  }) {
    if (!tabsOpen || !newTab) {
      push(pageId, params: params);
      return true;
    }
    return _focusOrOpen(pageId, params);
  }

  /// 同じ画面（ページ id ＋ params）のタブが在れば前に出し、無ければ開く。
  bool _focusOrOpen(String pageId, Map<String, Object?> params) {
    for (var i = 0; i < _tabs.length; i++) {
      final route = _tabs[i].last;
      if (route.pageId == pageId && _sameParams(route.params, params)) {
        if (_front != i) {
          _front = i;
          notifyListeners();
        }
        return true;
      }
    }
    if (_tabs.length >= maxTabs) return false;
    _tabs.add([AppRoute(pageId, params: params)]);
    _ids.add(_nextId++);
    _front = _tabs.length - 1;
    notifyListeners();
    return true;
  }

  /// [index] のタブを前に出す。
  void selectTab(int index) {
    if (index < 0 || index >= _tabs.length || index == _front) return;
    _front = index;
    notifyListeners();
  }

  /// [index] のタブを閉じる。**最後の1枚は閉じない**（画面が無くなるので）。
  ///
  /// 閉じたら隣が前に出る（右より左＝いま見ていたものに近い方）。
  bool closeTab(int index) {
    if (_tabs.length <= 1 || index < 0 || index >= _tabs.length) return false;
    _tabs.removeAt(index);
    _ids.removeAt(index);
    if (_front > index || _front >= _tabs.length) _front--;
    notifyListeners();
    return true;
  }

  /// Pushes [pageId] with [params]; back will return to the previous route.
  void push(String pageId, {Map<String, Object?> params = const {}}) {
    _stack.add(AppRoute(pageId, params: params));
    notifyListeners();
  }

  /// Replaces the whole stack with a single route (menu selection).
  void go(String pageId, {Map<String, Object?> params = const {}}) {
    _stack
      ..clear()
      ..add(AppRoute(pageId, params: params));
    notifyListeners();
  }

  /// Pops the top route; no-op when only the root remains.
  void pop() {
    if (canPop) {
      _stack.removeLast();
      notifyListeners();
    }
  }

  /// Drops every route above [index], making it the top (breadcrumb jump).
  /// No-op when [index] is out of range or already the top.
  void popTo(int index) {
    if (index < 0 || index >= _stack.length - 1) return;
    _stack.removeRange(index + 1, _stack.length);
    notifyListeners();
  }
}

/// 同じ遷移先か（ページ id が同じでも、`params` が違えば別のもの）。
///
/// 受注 SO-1 と SO-2 は別のタブ。同じ SO-1 をもう一度開いたら、開いているタブを前に出す。
bool _sameParams(Map<String, Object?> a, Map<String, Object?> b) {
  if (a.length != b.length) return false;
  for (final entry in a.entries) {
    if (!b.containsKey(entry.key)) return false;
    if (b[entry.key] != entry.value) return false;
  }
  return true;
}

/// Resolves route-param templates against a [record].
///
/// Values like `$row.field` / `$record.field` become `record[field]`;
/// everything else passes through unchanged.
Map<String, Object?> resolveRouteParams(
  Map<String, Object?>? params,
  Map<String, Object?>? record,
) {
  if (params == null) return const {};
  return {
    for (final e in params.entries) e.key: _resolveValue(e.value, record),
  };
}

Object? _resolveValue(Object? value, Map<String, Object?>? record) {
  if (value is String &&
      (value.startsWith(r'$row.') || value.startsWith(r'$record.'))) {
    final field = value.substring(value.indexOf('.') + 1);
    return record?[field];
  }
  return value;
}
