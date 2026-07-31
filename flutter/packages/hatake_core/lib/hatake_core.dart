/// hatake_core — the pure-Dart core of the hatake framework.
///
/// Exposes the [PageDefinition] model (the Single Source of Truth), the
/// [Repository] contract, and validation primitives. No Flutter dependency.
library;

// Type constants (open, plugin-extensible).
export 'src/definition/action_types.dart';
export 'src/definition/column_types.dart';
export 'src/definition/field_types.dart';
export 'src/definition/filter_operators.dart';
export 'src/definition/validator_types.dart';

// Value objects.
export 'src/definition/option_item.dart';
export 'src/definition/validator_definition.dart';
export 'src/definition/layout_definition.dart';
export 'src/definition/pagination_definition.dart';

// Field / column / filter.
export 'src/definition/field_definition.dart';
export 'src/definition/column_definition.dart';
export 'src/definition/filter_definition.dart';

// Composite definitions.
export 'src/definition/section_definition.dart';
export 'src/definition/search_definition.dart';
export 'src/definition/table_definition.dart';
export 'src/definition/form_definition.dart';
export 'src/definition/action_definition.dart';

// Pages.
export 'src/definition/page_definition.dart';

// Repository contract.
export 'src/repository/repository.dart';

// Validation.
export 'src/validation/validation_result.dart';
export 'src/validation/validators.dart';
export 'src/validation/form_validator.dart';

// Formatting / conversion (P0 registries + P1 built-ins).
export 'src/format/formatter_registry.dart';
export 'src/format/converter_registry.dart';
export 'src/format/form_normalizer.dart';

// Domain utilities (Japanese business).
export 'src/domain/tax.dart';
export 'src/domain/fiscal.dart';
export 'src/domain/age.dart';
export 'src/domain/business_day.dart';
