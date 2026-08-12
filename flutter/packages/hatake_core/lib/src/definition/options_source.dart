import 'package:equatable/equatable.dart';

/// Where a field's choices come from, when listing them in the definition is
/// not an option (市区町村, 取引先, 品目…).
///
/// The framework knows no HTTP and no SQL: it asks the [Repository] the
/// application registered under [repository], the same contract a list screen
/// uses. When [parentKey] is set, the parent field's current value is passed as
/// a filter, which is how a cascade works (都道府県 → 市区町村).
class OptionsSource extends Equatable {
  /// Repository key holding the choices.
  final String repository;

  /// Field of a row to store as the value.
  final String value;

  /// Field of a row to show as the label.
  final String label;

  /// Field of a row holding the parent value. Null = always fetch every row.
  final String? parentKey;

  /// Rows to fetch (a select is not a list screen).
  final int limit;

  const OptionsSource({
    required this.repository,
    this.value = 'code',
    this.label = 'name',
    this.parentKey,
    this.limit = 200,
  });

  @override
  List<Object?> get props => [repository, value, label, parentKey, limit];
}
