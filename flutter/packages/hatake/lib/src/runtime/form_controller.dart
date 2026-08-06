import 'package:flutter/foundation.dart';
import 'package:hatake_core/hatake_core.dart';

/// Renderer-independent runtime for a [FormPageDefinition]: manages a single
/// create/edit form. With a [recordKey] it loads that record and edits it;
/// without one it creates a new record.
class FormController extends ChangeNotifier {
  final FormPageDefinition definition;
  final Repository repository;
  final Object? recordKey;
  final FormValidator _validator;
  final FormNormalizer _normalizer;

  FormController({
    required this.definition,
    required this.repository,
    this.recordKey,
    FormValidator? validator,
    FormNormalizer? normalizer,
  })  : _validator = validator ?? FormValidator(),
        _normalizer = normalizer ?? FormNormalizer();

  /// Whether the form was *opened* on an existing record.
  bool get isEdit => recordKey != null;

  /// The key of the record this form is working on — [recordKey], or the key of
  /// the record a successful create produced.
  ///
  /// Repository-backed `subTable` rows need it as their foreign key, so they
  /// become editable as soon as the parent has been saved. It also stops a
  /// second save from creating a duplicate.
  Object? get effectiveKey =>
      recordKey ?? _savedRecord?[definition.keyField];

  bool _loading = false;
  bool get loading => _loading;

  Object? _error;
  Object? get error => _error;

  DataRecord _draft = const {};
  DataRecord get draft => _draft;

  ValidationResult _validation = ValidationResult.valid;
  ValidationResult get validation => _validation;

  bool _submitting = false;
  bool get submitting => _submitting;

  DataRecord? _savedRecord;

  /// The record produced by the most recent successful submit, or null.
  DataRecord? get savedRecord => _savedRecord;

  /// Loads the record for edit (or seeds defaults for create). Call once.
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

  /// Validates and submits [values]. On validation failure, updates
  /// [validation] and stays. On success, persists and exposes [savedRecord].
  Future<DataRecord?> submit(DataRecord values) async {
    final normalized = _normalizer.normalize(definition.form, values);
    final result = _validator.validate(definition.form, normalized);
    if (!result.isValid) {
      _validation = result;
      notifyListeners();
      return null;
    }
    _submitting = true;
    _validation = ValidationResult.valid;
    notifyListeners();
    try {
      // Keyed off the effective key, so saving again after a create updates
      // that record instead of inserting a second one.
      final key = effectiveKey;
      _savedRecord = key == null
          ? await repository.create(normalized)
          : await repository.update(key, normalized);
      return _savedRecord;
    } catch (error) {
      _error = error;
      return null;
    } finally {
      _submitting = false;
      notifyListeners();
    }
  }
}
