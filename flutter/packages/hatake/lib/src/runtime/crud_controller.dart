import 'package:hatake_core/hatake_core.dart';

import 'list_controller.dart';

/// Which surface the CRUD page is currently showing.
enum CrudMode { list, create, edit }

/// Runtime for a [CrudLike] page (crud, master). Extends [ListController] with
/// the create/edit form workflow. Renderers read its state and call its
/// methods — they hold no business logic and never touch a repository directly.
class CrudController extends ListController {
  final CrudLike definition;
  final FormValidator _formValidator;
  final FormNormalizer _normalizer;

  CrudController({
    required this.definition,
    required super.repository,
    FormValidator? formValidator,
    FormNormalizer? formNormalizer,
  })  : _formValidator = formValidator ?? FormValidator(),
        _normalizer = formNormalizer ?? FormNormalizer(),
        super(pageSize: definition.table.pagination.pageSize);

  // --- Form state ---------------------------------------------------------

  CrudMode _mode = CrudMode.list;
  CrudMode get mode => _mode;

  Object? _editingKey;

  DataRecord _draft = const {};

  /// The record currently being created/edited, pre-filled with defaults (for
  /// create) or the selected record's values (for edit).
  DataRecord get draft => _draft;

  ValidationResult _validation = ValidationResult.valid;
  ValidationResult get validation => _validation;

  bool _submitting = false;
  bool get submitting => _submitting;

  /// Begins creating a new record; seeds the draft from field default values.
  void startCreate() {
    _mode = CrudMode.create;
    _editingKey = null;
    _validation = ValidationResult.valid;
    _draft = {
      for (final field in definition.form.fields)
        if (field.defaultValue != null) field.field: field.defaultValue,
    };
    notifyListeners();
  }

  /// Begins editing [record]; the draft is a copy so edits are cancellable.
  void startEdit(DataRecord record) {
    _mode = CrudMode.edit;
    _editingKey = record[definition.keyField];
    _validation = ValidationResult.valid;
    _draft = {...record};
    notifyListeners();
  }

  /// Discards the in-progress form and returns to the list.
  void cancelForm() {
    _mode = CrudMode.list;
    _validation = ValidationResult.valid;
    notifyListeners();
  }

  /// Validates and submits [values]. On validation failure, updates
  /// [validation] and stays in form mode. On success, persists via the
  /// repository, reloads, and returns to the list.
  Future<void> submitForm(DataRecord values) async {
    // Normalize input (e.g. full-width → half-width, trim) before validating
    // and persisting, driven by each field's `normalize` chain.
    final normalized = _normalizer.normalize(definition.form, values);
    final result = _formValidator.validate(definition.form, normalized);
    if (!result.isValid) {
      _validation = result;
      notifyListeners();
      return;
    }

    _submitting = true;
    _validation = ValidationResult.valid;
    notifyListeners();
    try {
      if (_mode == CrudMode.edit && _editingKey != null) {
        await repository.update(_editingKey!, normalized);
      } else {
        await repository.create(normalized);
      }
      _mode = CrudMode.list;
      await load();
    } catch (error) {
      setError(error);
    } finally {
      _submitting = false;
      notifyListeners();
    }
  }
}
