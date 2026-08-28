import 'package:flutter/widgets.dart';
import 'package:hatake_core/hatake_core.dart';

import '../renderer/renderer.dart';
import '../runtime/action_registry.dart';
import '../runtime/export_sink.dart';
import '../runtime/print_sink.dart';
import '../runtime/repository_registry.dart';
import '../runtime/sub_table_controller.dart';

/// Builds the runtime for a repository-backed `subTable` field. Renderers get
/// one of these from [HatakeScope.subTableController] so they never resolve
/// repositories themselves; it is a plain function so it can also be passed
/// into dialog routes, which sit outside the scope's subtree.
typedef SubTableControllerFactory = SubTableController Function(
  FieldDefinition field,
  Object? parentKey,
);

/// Provides the active [Renderer], [RepositoryRegistry], and the plugin
/// registries ([ValidatorRegistry], [ActionRegistry]) to the widget tree.
///
/// Wrap the part of your app that renders hatake pages in a [HatakeScope].
class HatakeScope extends InheritedWidget {
  final RepositoryRegistry repositories;
  final Renderer renderer;

  /// Validators available to forms. Register custom validators here to extend
  /// the framework without modifying it.
  final ValidatorRegistry validators;

  /// Converters used to normalize field input before validation/persistence.
  final ConverterRegistry converters;

  /// Aggregations available to dashboards and reports (`count` / `sum` / … plus
  /// whatever the app registered).
  ///
  /// Without this the definition could name an aggregate no one can register —
  /// `validate` even says "register it in AggregateRegistry", which was not
  /// possible from an app until this existed.
  final AggregateRegistry aggregates;

  /// Computed-value operations available to form fields (`multiply` / `sum` / …
  /// plus the app's own). Same reason as [aggregates].
  final ComputedRegistry computeds;

  /// Handlers for `type: plugin` actions.
  final ActionRegistry actions;

  /// Receives the documents `type: export` actions produce (CSV and friends).
  /// Null = no sink, and an export says so instead of silently doing nothing:
  /// the framework builds the text but never performs I/O.
  final ExportSink? exportSink;

  /// Receives the reports `type: print` actions want on paper. Null = no sink,
  /// and a print action says so instead of silently doing nothing.
  ///
  /// The framework hands over the report and its rows; making bytes out of them
  /// is an opt-in adapter's job (`hatake_print`), and printing them is platform
  /// I/O. Neither is something this package knows how to do — which is why an
  /// app that never prints carries no printing code at all.
  final PrintSink? printSink;

  /// Roles of the current user, used to gate fields/columns/actions declared
  /// with `roles` (see `isAllowed`). Empty = the user has no roles, so anything
  /// with a non-empty `roles` is hidden. UI-level display gating only — real
  /// authorization stays outside the framework.
  final Set<String> roles;

  /// このアプリが**配りうる役割の全部**（語彙）。空 = 宣言していない。
  ///
  /// [roles] との違いが要点。[roles] は**いま見ている人**の役割なので、staff で
  /// ログインしている間は `{staff}` しか無い。定義に書いた役割名（`roles: [manager]`）と
  /// 突き合わせる相手にそれを使うと、「manager はアプリに無い」と言い出す＝**嘘になる**。
  /// だから語彙を別に宣言できるようにしてある。
  ///
  /// 宣言しておくと2つ効く:
  ///   ・`registrySnapshot` がこれを申告する → `hatake validate --registry` が
  ///     **定義にしか無い役割**（誰にも見えない列やボタン）を言える
  ///   ・配られた役割がこの語彙に無ければ、開発中（assert）に気づける＝**アプリ側の
  ///     綴り違い**（`manager` を `manger` で配っている）は画面を見ても分からない
  ///
  /// 認可そのものではない（誰に何を配るかはアプリの仕事）。ここに書くのは名前だけ。
  final Set<String> knownRoles;

  HatakeScope({
    super.key,
    required this.repositories,
    required this.renderer,
    ValidatorRegistry? validators,
    ConverterRegistry? converters,
    AggregateRegistry? aggregates,
    ComputedRegistry? computeds,
    ActionRegistry? actions,
    this.exportSink,
    this.printSink,
    Set<String>? roles,
    Set<String>? knownRoles,
    required super.child,
  })  : validators = validators ?? ValidatorRegistry(),
        converters = converters ?? ConverterRegistry(),
        aggregates = aggregates ?? AggregateRegistry(),
        computeds = computeds ?? ComputedRegistry(),
        actions = actions ?? ActionRegistry(),
        roles = roles ?? const {},
        knownRoles = knownRoles ?? const {} {
    // 語彙を宣言したなら、配る役割はその中に在るはず。無いものが配られているのは
    // **アプリ側の綴り違い**で、画面を見ても気づけない（多く見えるか、何も見えない）。
    assert(
      knownRoles == null ||
          knownRoles.isEmpty ||
          (roles ?? const {}).every(knownRoles.contains),
      '配っている役割が knownRoles に在りません: '
      '${(roles ?? const <String>{}).where((r) => !knownRoles.contains(r)).join(" / ")}'
      '（knownRoles: ${knownRoles.join(" / ")}）',
    );
  }

  /// Runtime for a repository-backed `subTable` [field] under the parent record
  /// identified by [parentKey] (null while the parent is unsaved). The caller
  /// owns the returned controller and must dispose it.
  SubTableController subTableController(
    FieldDefinition field,
    Object? parentKey,
  ) {
    return SubTableController(
      field: field,
      repository: repositories.resolve(field.source!.repository),
      parentKey: parentKey,
      validator: FormValidator(validators),
    );
  }

  static HatakeScope of(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<HatakeScope>();
    assert(scope != null, 'No HatakeScope found in the widget tree.');
    return scope!;
  }

  @override
  bool updateShouldNotify(HatakeScope oldWidget) {
    return oldWidget.repositories != repositories ||
        oldWidget.renderer != renderer ||
        oldWidget.validators != validators ||
        oldWidget.converters != converters ||
        oldWidget.aggregates != aggregates ||
        oldWidget.computeds != computeds ||
        oldWidget.actions != actions ||
        oldWidget.exportSink != exportSink ||
        oldWidget.printSink != printSink ||
        oldWidget.roles != roles ||
        oldWidget.knownRoles != knownRoles;
  }
}
