import 'package:equatable/equatable.dart';

/// A selectable option for select / radio / multiSelect fields and filters.
class OptionItem extends Equatable {
  /// The stored value (kept as-is; may be String, num, bool, ...).
  final Object? value;

  /// The human-readable label shown in the UI.
  final String label;

  /// Parent value this option belongs to (see `FieldDefinition.optionsFrom`).
  ///
  /// Null = always offered. This is how a static cascade is written: every
  /// choice says which parent value it belongs to, and the child shows the ones
  /// that match.
  final Object? when;

  const OptionItem({required this.value, required this.label, this.when});

  @override
  List<Object?> get props => [value, label, when];
}
