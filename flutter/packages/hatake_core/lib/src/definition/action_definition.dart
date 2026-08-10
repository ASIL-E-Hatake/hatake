import 'package:equatable/equatable.dart';

import 'action_success_definition.dart';
import 'action_types.dart';
import 'confirm_definition.dart';

/// A page-level or row-level action (button / menu item).
class ActionDefinition extends Equatable {
  /// Stable identifier, referenced by e.g. `TableDefinition.rowActions`.
  final String id;

  /// Action type (see [ActionTypes]). Open string, plugin-extensible.
  final String type;

  /// Display label.
  final String label;

  /// When [type] is `plugin`, the registered action plugin key to invoke.
  final String? plugin;

  /// Ask before running. A `delete` action asks even when this is null.
  final ConfirmDefinition? confirm;

  /// What to do once it succeeded (message / navigation). Not run on failure.
  final ActionSuccessDefinition? onSuccess;

  /// Plugin / renderer specific extra configuration.
  final Map<String, Object?> config;

  /// Roles allowed to use this action (see `isAllowed`). Empty = everyone.
  final List<String> roles;

  const ActionDefinition({
    required this.id,
    required this.type,
    required this.label,
    this.plugin,
    this.confirm,
    this.onSuccess,
    this.config = const {},
    this.roles = const [],
  });

  @override
  List<Object?> get props =>
      [id, type, label, plugin, confirm, onSuccess, config, roles];
}
