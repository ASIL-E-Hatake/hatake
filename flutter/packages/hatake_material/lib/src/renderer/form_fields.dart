part of '../material_renderer.dart';

/// Shared, reusable form body: renders a form's fields (same field types and
/// custom `fieldBuilders` as everywhere) and collects their current values.
/// Used by both the CRUD edit dialog and the standalone form page.
class _HatakeFormFields extends StatefulWidget {
  final FormDefinition form;
  final DataRecord initial;
  final ValidationResult validation;
  final Map<String, MaterialFieldBuilder> fieldBuilders;
  final Set<String> roles;

  /// Formatters used by `subTable` grids (`format:` on a child column).
  /// Defaults to the built-ins when the caller has none.
  final FormatterRegistry? formatters;

  /// Validators used for `subTable` row editing. Passed in (not read from the
  /// scope) because this widget also runs inside a dialog route, which sits
  /// outside the `HatakeScope` subtree.
  final ValidatorRegistry? validators;

  /// Builds the runtime for a `subTable` with a `source` (repository-backed
  /// rows). Passed in for the same reason as [validators]. When null, such a
  /// field falls back to the embedded grid.
  final SubTableControllerFactory? subTables;

  /// Primary-key value of the record being edited, or null when creating.
  /// Repository-backed child rows need it as their foreign key.
  final Object? recordKey;

  /// Form state for `{ mode: create }` / `{ mode: edit }` conditions
  /// ([ConditionModes]). The caller knows it; the record does not.
  final String mode;

  /// Repositories, for fields whose options come from one (`optionsSource`).
  /// Passed in for the same reason as [validators]: a dialog route sits outside
  /// the `HatakeScope` subtree.
  final RepositoryRegistry? repositories;

  const _HatakeFormFields({
    super.key,
    required this.form,
    required this.initial,
    required this.validation,
    required this.fieldBuilders,
    required this.roles,
    this.formatters,
    this.validators,
    this.subTables,
    this.recordKey,
    required this.mode,
    this.repositories,
  });

  @override
  State<_HatakeFormFields> createState() => _HatakeFormFieldsState();
}

class _HatakeFormFieldsState extends State<_HatakeFormFields> {
  final Map<String, TextEditingController> _text = {};
  final Map<String, Object?> _values = {};

  /// `optionsSource` で引いた選択肢。キーは「項目名＋親の値」なので、親が変われば
  /// 引き直す（同じ親のままなら1回だけ引く）。
  final Map<String, List<OptionItem>> _fetched = {};

  /// いま引いている最中のキー（毎フレーム投げないため）。
  final Set<String> _fetching = {};
  final ComputedRegistry _computeds = ComputedRegistry();
  late final FormatterRegistry _formatters =
      widget.formatters ?? FormatterRegistry();
  late final ValidatorRegistry _validators =
      widget.validators ?? ValidatorRegistry();

  bool _isTextField(String type) =>
      type == FieldTypes.text ||
      type == FieldTypes.textarea ||
      type == FieldTypes.number ||
      type == FieldTypes.time;

  @override
  void initState() {
    super.initState();
    _values.addAll(widget.initial);
    for (final field in widget.form.fields) {
      final initial = widget.initial[field.field];
      if (_isTextField(field.type)) {
        _text[field.field] =
            TextEditingController(text: initial?.toString() ?? '');
      } else {
        _values[field.field] = initial;
      }
    }
  }

  @override
  void dispose() {
    for (final controller in _text.values) {
      controller.dispose();
    }
    super.dispose();
  }

  /// Gathers the current field values into a record. Computed fields are
  /// derived from the gathered inputs (single pass, applied last).
  DataRecord collect() {
    final values = <String, Object?>{..._values};
    for (final field in widget.form.fields) {
      final controller = _text[field.field];
      if (controller == null) continue;
      final text = controller.text.trim();
      if (field.type == FieldTypes.number) {
        values[field.field] = text.isEmpty ? null : num.tryParse(text) ?? text;
      } else {
        values[field.field] = text;
      }
    }
    for (final field in widget.form.fields) {
      if (field.computed != null) {
        values[field.field] = _computeds.compute(field.computed, values);
      }
      // Repository-backed child rows are saved on their own; they must not ride
      // along in the parent record.
      if (field.type == FieldTypes.subTable && field.source != null) {
        values.remove(field.field);
      }
    }
    return values;
  }

  static String _formatDate(DateTime d) {
    String two(int v) => v.toString().padLeft(2, '0');
    return '${d.year}-${two(d.month)}-${two(d.day)}';
  }

  Future<void> _pickDate(FieldDefinition field) async {
    final current = DateTime.tryParse('${_values[field.field] ?? ''}');
    final picked = await showDatePicker(
      context: context,
      initialDate: current ?? DateTime(2026),
      firstDate: DateTime(2000),
      lastDate: DateTime(2100),
    );
    if (picked != null) {
      setState(() => _values[field.field] = _formatDate(picked));
    }
  }

  @override
  Widget build(BuildContext context) {
    // Live record (inputs + computed) drives visibleWhen / enabledWhen.
    var record = collect();
    // 親が変わって選べない値が残っていたら捨てる（「大阪府なのに渋谷区」で保存させない）。
    if (_clearStaleChildValues(record)) record = collect();
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final section in widget.form.sections)
          ..._buildSection(section, record),
      ],
    );
  }

  /// この項目がいま出すべき選択肢。
  ///
  /// `optionsSource` があれば Repository から引いたもの、無ければ定義に書いた
  /// 選択肢を親の値で絞ったもの（[visibleOptions]）。**絞り込みの判定は
  /// hatake_core にある**（Renderer 固有の話ではないので）。
  List<OptionItem> _optionsFor(FieldDefinition field, DataRecord record) {
    final source = field.optionsSource;
    if (source == null) return visibleOptions(field, record);
    final parentValue =
        field.optionsFrom == null ? null : record[field.optionsFrom!];
    final key = '${field.field}#$parentValue';
    final fetched = _fetched[key];
    if (fetched != null) return fetched;
    _fetchOptions(field, source, parentValue, key);
    return const []; // 引けるまでは空（選択肢が出ないだけで、画面は出る）
  }

  /// 選択肢を Repository から引く。Framework は HTTP も SQL も知らないので、
  /// 一覧画面と同じ契約（`search`）で頼むだけ。
  Future<void> _fetchOptions(
    FieldDefinition field,
    OptionsSource source,
    Object? parentValue,
    String key,
  ) async {
    if (_fetching.contains(key)) return;
    final registry = widget.repositories;
    if (registry == null || !registry.contains(source.repository)) return;
    // 親を見る指定なのに親が空なら、まだ引かない（全件出すと連動の意味がない）。
    if (source.parentKey != null &&
        field.optionsFrom != null &&
        (parentValue == null || parentValue.toString().isEmpty)) {
      _fetched[key] = const [];
      return;
    }
    _fetching.add(key);
    try {
      final result = await registry.resolve(source.repository).search(
            RepositoryQuery(
              filters: {
                if (source.parentKey != null && parentValue != null)
                  source.parentKey!: parentValue,
              },
              pageSize: source.limit,
            ),
          );
      final options = [
        for (final row in result.items)
          OptionItem(
            value: row[source.value],
            label: row[source.label]?.toString() ?? '',
          ),
      ];
      if (!mounted) return;
      setState(() => _fetched[key] = options);
    } catch (_) {
      // 引けなかったことは画面では言わない（選択肢が空になるだけ）。Repository の
      // 失敗は一覧と同じくアプリ側のログの話。
      if (mounted) setState(() => _fetched[key] = const []);
    } finally {
      _fetching.remove(key);
    }
  }

  /// 親が変わって選べなくなった子の値を捨てる。捨てたら true。
  ///
  /// build の中で `_values` を直接直す（setState は呼ばない）。このフレームで
  /// 正しい状態が描かれるので、1フレーム古い値が見えることがない。
  bool _clearStaleChildValues(DataRecord record) {
    var changed = false;
    for (final field in widget.form.fields) {
      if (field.optionsFrom == null) continue;
      if (field.optionsSource != null) continue; // 引いてくる側は空振りが普通
      if (optionValueIsStale(field, record)) {
        _values[field.field] = null;
        changed = true;
      }
    }
    return changed;
  }

  List<Widget> _buildSection(SectionDefinition section, DataRecord record) {
    final visible = [
      for (final field in section.fields)
        if (isAllowed(field.roles, widget.roles) &&
            (field.visibleWhen == null ||
                evaluateCondition(field.visibleWhen, record,
                    mode: widget.mode)))
          field,
    ];
    if (visible.isEmpty) return const [];
    return [
      if (section.title != null && section.title!.isNotEmpty)
        Padding(
          padding: const EdgeInsets.only(top: 8, bottom: 4),
          child: Text(
            section.title!,
            style: Theme.of(context).textTheme.titleSmall,
          ),
        ),
      for (final field in visible) _buildField(field, record),
    ];
  }

  Widget _buildField(FieldDefinition field, DataRecord record) {
    // Computed fields are derived and shown read-only.
    if (field.computed != null) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: InputDecorator(
          decoration: InputDecoration(
            labelText: field.label,
            border: const OutlineInputBorder(),
          ),
          child: Text(
            '${record[field.field] ?? ''}',
            key: Key('hatake.form.${field.field}'),
          ),
        ),
      );
    }
    final errors = widget.validation.forField(field.field);
    final errorText = errors.isEmpty ? null : errors.first.message;
    final label = field.required ? '${field.label} *' : field.label;

    // A registered custom builder takes precedence over built-in field types.
    final custom = widget.fieldBuilders[field.type];
    if (custom != null) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: custom(MaterialFieldContext(
          buildContext: context,
          field: field,
          value: _values[field.field],
          errorText: errorText,
          onChanged: (value) => setState(() => _values[field.field] = value),
        )),
      );
    }

    final enabled = field.enabledWhen == null ||
        evaluateCondition(field.enabledWhen, record, mode: widget.mode);
    final readOnly = field.readOnly || !enabled;

    Widget input;
    switch (field.type) {
      // Child-row grid (master-detail). With a `source` the rows live in their
      // own repository and are paged; otherwise the value is a list of rows.
      case FieldTypes.subTable when field.source != null &&
          widget.subTables != null:
        input = _PagedSubTableField(
          field: field,
          factory: widget.subTables!,
          parentKey: widget.recordKey,
          formatters: _formatters,
          validators: _validators,
          fieldBuilders: widget.fieldBuilders,
          roles: widget.roles,
          readOnly: readOnly,
        );
      case FieldTypes.subTable:
        input = _SubTableField(
          field: field,
          rows: _subTableRows(_values[field.field]),
          formatters: _formatters,
          validators: _validators,
          fieldBuilders: widget.fieldBuilders,
          roles: widget.roles,
          readOnly: readOnly,
          errorText: errorText,
          repositories: widget.repositories,
          onChanged: (next) => setState(() => _values[field.field] = next),
        );
      case FieldTypes.select:
        input = DropdownButtonFormField<Object?>(
          key: Key('hatake.form.${field.field}'),
          initialValue: _values[field.field],
          decoration: InputDecoration(
            labelText: label,
            border: const OutlineInputBorder(),
            errorText: errorText,
          ),
          items: [
            for (final option in _optionsFor(field, record))
              DropdownMenuItem<Object?>(
                value: option.value,
                child: Text(option.label),
              ),
          ],
          onChanged: readOnly
              ? null
              : (value) => setState(() => _values[field.field] = value),
        );
      case FieldTypes.checkbox:
        input = CheckboxListTile(
          key: Key('hatake.form.${field.field}'),
          title: Text(label),
          subtitle: errorText == null
              ? null
              : Text(
                  errorText,
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
          value: _values[field.field] == true,
          onChanged: readOnly
              ? null
              : (value) => setState(() => _values[field.field] = value),
        );
      case FieldTypes.radio:
        input = InputDecorator(
          decoration: InputDecoration(
            labelText: label,
            border: InputBorder.none,
            errorText: errorText,
          ),
          child: RadioGroup<Object?>(
            groupValue: _values[field.field],
            onChanged: (value) {
              if (readOnly) return;
              setState(() => _values[field.field] = value);
            },
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (final option in _optionsFor(field, record))
                  RadioListTile<Object?>(
                    key: Key('hatake.form.${field.field}.${option.value}'),
                    title: Text(option.label),
                    value: option.value,
                    contentPadding: EdgeInsets.zero,
                    dense: true,
                  ),
              ],
            ),
          ),
        );
      case FieldTypes.multiSelect:
        final selected = (_values[field.field] as List?) ?? const [];
        input = InputDecorator(
          decoration: InputDecoration(
            labelText: label,
            border: const OutlineInputBorder(),
            errorText: errorText,
          ),
          child: Wrap(
            spacing: 8,
            children: [
              for (final option in _optionsFor(field, record))
                FilterChip(
                  key: Key('hatake.form.${field.field}.${option.value}'),
                  label: Text(option.label),
                  selected: selected.contains(option.value),
                  onSelected: readOnly
                      ? null
                      : (on) => setState(() {
                            final next = [...selected];
                            if (on) {
                              next.add(option.value);
                            } else {
                              next.remove(option.value);
                            }
                            _values[field.field] = next;
                          }),
                ),
            ],
          ),
        );
      case FieldTypes.date:
      case FieldTypes.dateTime:
        input = InkWell(
          key: Key('hatake.form.${field.field}'),
          onTap: readOnly ? null : () => _pickDate(field),
          child: InputDecorator(
            decoration: InputDecoration(
              labelText: label,
              border: const OutlineInputBorder(),
              errorText: errorText,
              suffixIcon: const Icon(Icons.calendar_today),
            ),
            child: Text('${_values[field.field] ?? ''}'),
          ),
        );
      default:
        input = TextField(
          key: Key('hatake.form.${field.field}'),
          controller: _text[field.field],
          readOnly: readOnly,
          maxLines: field.type == FieldTypes.textarea ? 3 : 1,
          keyboardType:
              field.type == FieldTypes.number ? TextInputType.number : null,
          decoration: InputDecoration(
            labelText: label,
            border: const OutlineInputBorder(),
            errorText: errorText,
          ),
          // Rebuild so visibleWhen / enabledWhen / computed react to typing.
          onChanged: (_) => setState(() {}),
        );
    }

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: input,
    );
  }
}
