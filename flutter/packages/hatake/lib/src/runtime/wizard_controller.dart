import 'package:flutter/foundation.dart';
import 'package:hatake_core/hatake_core.dart';

/// Renderer-independent runtime for a [WizardPageDefinition]: walks the steps,
/// validating **one step at a time**, and persists once at the end.
///
/// Nothing is written until [submit]; the accumulated input lives in [draft].
/// With a [recordKey] the wizard edits that record, otherwise it creates one.
class WizardController extends ChangeNotifier {
  final WizardPageDefinition definition;
  final Repository repository;
  final Object? recordKey;
  final FormValidator _validator;
  final FormNormalizer _normalizer;

  WizardController({
    required this.definition,
    required this.repository,
    this.recordKey,
    FormValidator? validator,
    FormNormalizer? normalizer,
  })  : _validator = validator ?? FormValidator(),
        _normalizer = normalizer ?? FormNormalizer();

  bool get isEdit => recordKey != null;

  /// Form state for `{ mode: create }` / `{ mode: edit }` conditions
  /// ([ConditionModes]). Renderer と検証で同じものを使うため、出どころはここ1つ。
  String get formMode =>
      isEdit ? ConditionModes.edit : ConditionModes.create;

  int _stepIndex = 0;
  int get stepIndex => _stepIndex;

  List<WizardStepDefinition> get steps => definition.steps;

  /// The step currently being shown.
  WizardStepDefinition get step => steps[_stepIndex];

  bool get isFirstStep => _stepIndex == 0;
  bool get isLastStep => _stepIndex == steps.length - 1;

  bool _loading = false;
  bool get loading => _loading;

  Object? _error;
  Object? get error => _error;

  DataRecord _draft = const {};

  /// Everything entered so far, merged across the steps visited.
  DataRecord get draft => _draft;

  ValidationResult _validation = ValidationResult.valid;
  ValidationResult get validation => _validation;

  bool _submitting = false;
  bool get submitting => _submitting;

  DataRecord? _savedRecord;

  /// The record produced by a successful [submit], or null.
  DataRecord? get savedRecord => _savedRecord;

  /// Loads the record for edit, or seeds defaults for create. Call once.
  Future<void> init() async {
    if (recordKey == null) {
      _draft = {
        for (final field in definition.form.fields)
          if (field.defaultValue != null) field.field: field.defaultValue,
      };
      notifyListeners();
      return;
    }
    _loading = true;
    _error = null;
    notifyListeners();
    try {
      _draft = await repository.findByKey(recordKey!) ?? const {};
    } catch (error) {
      _error = error;
      _draft = const {};
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  /// Validates **only the current step** and advances on success. [values] is
  /// the step's current input; it is merged into [draft] either way, so going
  /// back and forth never loses what was typed.
  ///
  /// Returns true when the wizard advanced.
  bool next(DataRecord values) {
    _draft = {..._draft, ...values};
    final result = _validator.validate(step.form, _draft, mode: formMode);
    if (!result.isValid) {
      _validation = result;
      notifyListeners();
      return false;
    }
    _validation = ValidationResult.valid;
    if (!isLastStep) _stepIndex++;
    notifyListeners();
    return true;
  }

  /// Goes back one step, keeping [values]. Never validates — a user must be able
  /// to retreat from a half-filled step.
  void back(DataRecord values) {
    _draft = {..._draft, ...values};
    _validation = ValidationResult.valid;
    if (!isFirstStep) _stepIndex--;
    notifyListeners();
  }

  /// Validates the current step, then the whole record, then persists.
  ///
  /// If a whole-form error belongs to an earlier step, the wizard jumps back to
  /// that step so the user sees the offending field instead of a silent failure.
  Future<DataRecord?> submit(DataRecord values) async {
    _draft = {..._draft, ...values};

    final stepResult =
        _validator.validate(step.form, _draft, mode: formMode);
    if (!stepResult.isValid) {
      _validation = stepResult;
      notifyListeners();
      return null;
    }

    final normalized = _normalizer.normalize(definition.form, _draft);
    final whole =
        _validator.validate(definition.form, normalized, mode: formMode);
    if (!whole.isValid) {
      _draft = normalized;
      _validation = whole;
      _jumpToFirstErroredStep(whole);
      notifyListeners();
      return null;
    }

    _draft = normalized;
    _submitting = true;
    _validation = ValidationResult.valid;
    notifyListeners();
    try {
      _savedRecord = isEdit
          ? await repository.update(recordKey!, normalized)
          : await repository.create(normalized);
      return _savedRecord;
    } catch (error) {
      _error = error;
      return null;
    } finally {
      _submitting = false;
      notifyListeners();
    }
  }

  void _jumpToFirstErroredStep(ValidationResult result) {
    for (final error in result.errors) {
      final index = definition.stepIndexOfField(error.field);
      if (index >= 0 && index < _stepIndex) {
        _stepIndex = index;
        return;
      }
    }
  }
}
