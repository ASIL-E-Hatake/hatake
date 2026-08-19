import '../definition/field_definition.dart';
import '../definition/field_types.dart';
import '../definition/form_definition.dart';
import '../definition/section_definition.dart';
import '../definition/validator_definition.dart';
import '../definition/validator_types.dart';
import '../logic/condition_evaluator.dart';
import '../repository/repository.dart';
import 'validation_result.dart';
import 'validators.dart';

/// Validates a [DataRecord] against a [FormDefinition] using a
/// [ValidatorRegistry]. Reports at most one error per field.
///
/// Child rows of a `subTable` field are validated too: each row is checked
/// against the field's `rowFields`, and errors are reported with an indexed
/// path — `lines[0].qty`. Nested sub-tables recurse with the same convention.
///
/// A `subTable` with a `source` (repository-backed rows) is skipped entirely:
/// its rows live in another repository, not in this record, so validating them
/// here — including the field's own `required` — would be meaningless.
///
/// 条件も見る（ここだけ「条件は UI の話」から外れる）:
///
/// * `visibleWhen` で隠れている項目は**検証しない**。セクションの `visibleWhen`
///   で隠れているときも同じ。見えない項目を必須にすると、入力できないのに保存
///   できない画面になってしまう。
/// * `requiredWhen` が成立する項目は必須として扱う（`required: true` と同じ扱い）。
///
/// [mode] は `{ mode: create }` / `{ mode: edit }` を判定するための状態
/// （[ConditionModes]）。サーバ側なら POST / PUT で分かるので渡せる。渡さないと
/// mode の条件は false になる＝その条件で隠れている扱いになり、検証は緩む方に倒れる。
class FormValidator {
  final ValidatorRegistry registry;

  FormValidator([ValidatorRegistry? registry])
      : registry = registry ?? ValidatorRegistry();

  ValidationResult validate(
    FormDefinition form,
    DataRecord record, {
    String? mode,
  }) {
    final errors = <ValidationError>[];
    // 項目名 → ラベル。項目間の検証のメッセージを画面の言葉で出すために先に集める。
    final labels = _labelsOf(form);
    for (final section in form.sections) {
      // 隠れているセクションの項目は、この画面には無いものとして扱う。
      if (!_matches(section.visibleWhen, record, mode)) continue;
      for (final field in section.fields) {
        _validateField(field, record, mode, errors, labels);
      }
    }
    return ValidationResult(errors);
  }

  void _validateField(
    FieldDefinition field,
    DataRecord record,
    String? mode,
    List<ValidationError> errors,
    Map<String, String> labels,
  ) {
    // Repository-backed child rows are not part of this record.
    if (field.type == FieldTypes.subTable && field.source != null) return;
    // 隠れている項目は検証しない（入力できないものは求められない）。
    if (!_matches(field.visibleWhen, record, mode)) return;

    final value = record[field.field];
    final rules = <ValidatorDefinition>[
      if (field.required || _isRequiredByCondition(field, record, mode))
        const ValidatorDefinition(type: ValidatorTypes.required),
      ...field.validators,
    ];
    for (final rule in rules) {
      final message = registry.run(
        value,
        rule,
        ValidationContext(record: record, labels: labels, mode: mode),
      );
      if (message != null) {
        errors.add(
          ValidationError(field: field.field, message: rule.message ?? message),
        );
        break; // one error per field
      }
    }

    // Child rows (master-detail): validate each row against rowFields.
    if (field.type == FieldTypes.subTable && field.rowFields.isNotEmpty) {
      final rowForm =
          FormDefinition(sections: [SectionDefinition(fields: field.rowFields)]);
      var index = 0;
      for (final row in (value is Iterable ? value : const [])) {
        if (row is Map) {
          // 行の条件は行のレコードで判定する（親の値は見えない）。行の追加/編集は
          // 親のモードとは別物なので、mode は行には渡さない。
          final rowErrors = validate(rowForm, row.cast<String, Object?>()).errors;
          for (final error in rowErrors) {
            errors.add(ValidationError(
              field: '${field.field}[$index].${error.field}',
              message: error.message,
            ));
          }
        }
        index++;
      }
    }
  }

  bool _isRequiredByCondition(
    FieldDefinition field,
    DataRecord record,
    String? mode,
  ) =>
      field.requiredWhen != null &&
      evaluateCondition(field.requiredWhen, record, mode: mode);

  /// 項目名 → ラベル。明細（`rowFields`）の項目も入れる（行の中の検証でも使う）。
  Map<String, String> _labelsOf(FormDefinition form) {
    final labels = <String, String>{};
    for (final section in form.sections) {
      for (final field in section.fields) {
        labels[field.field] = field.label;
        for (final row in field.rowFields) {
          labels.putIfAbsent(row.field, () => row.label);
        }
      }
    }
    return labels;
  }

  /// 条件が無ければ true（＝制限なし）。
  bool _matches(
    Map<String, Object?>? condition,
    DataRecord record,
    String? mode,
  ) =>
      condition == null || evaluateCondition(condition, record, mode: mode);
}
