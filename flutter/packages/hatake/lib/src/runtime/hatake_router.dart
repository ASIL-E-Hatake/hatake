import 'package:flutter/foundation.dart';

/// One entry on the navigation stack: a page id + resolved route params.
@immutable
class AppRoute {
  final String pageId;
  final Map<String, Object?> params;

  const AppRoute(this.pageId, {this.params = const {}});
}

/// A minimal, dependency-free navigation stack for `HatakeApp`.
///
/// Holds a stack of [AppRoute]s and notifies on change. The shell renders the
/// top route's page; menu selection [go]es (resets), `navigate` actions [push]
/// (so back returns). No external routing package — Web URL sync is a later add.
class HatakeRouter extends ChangeNotifier {
  final List<AppRoute> _stack;

  HatakeRouter(AppRoute initial) : _stack = [initial];

  AppRoute get current => _stack.last;
  bool get canPop => _stack.length > 1;
  int get depth => _stack.length;

  /// The current stack, oldest first. Read-only; use it to render a trail
  /// (breadcrumb) of where the user came from.
  List<AppRoute> get stack => List.unmodifiable(_stack);

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
