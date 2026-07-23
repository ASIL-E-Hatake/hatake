import 'package:equatable/equatable.dart';

/// A selectable option for select / radio / multiSelect fields and filters.
class OptionItem extends Equatable {
  /// The stored value (kept as-is; may be String, num, bool, ...).
  final Object? value;

  /// The human-readable label shown in the UI.
  final String label;

  const OptionItem({required this.value, required this.label});

  @override
  List<Object?> get props => [value, label];
}
