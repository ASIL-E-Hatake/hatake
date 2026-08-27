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

  /// いま入力されている値を配る先（画面のボタンの `enabledWhen` が見る）。
  ///
  /// 渡さないこともある（ダイアログの中のフォームには画面のボタンが無い）。
  final _LiveRecord? live;

  /// Repositories, for fields whose options come from one (`optionsSource`).
  /// Passed in for the same reason as [validators]: a dialog route sits outside
  /// the `HatakeScope` subtree.
  final RepositoryRegistry? repositories;

  /// Computed-value operations (`computed.op`). Passed in for the same reason as
  /// [validators]; the app registers its own on `HatakeScope(computeds:)`.
  final ComputedRegistry? computeds;

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
    this.computeds,
    this.live,
  });

  @override
  State<_HatakeFormFields> createState() => _HatakeFormFieldsState();
}

class _HatakeFormFieldsState extends State<_HatakeFormFields> {
  final Map<String, TextEditingController> _text = {};
  final Map<String, Object?> _values = {};

  /// 選択肢の連動（定義に書いた絞り込み＋`optionsSource` で引く方）。検索欄と共有。
  late final _OptionsFetcher _options = _OptionsFetcher(
    repositories: widget.repositories,
    onFetched: () {
      if (mounted) setState(() {});
    },
  );

  /// 計算の op はアプリが足せる（`HatakeScope(computeds:)`）。ここで固定の
  /// レジストリを作ってしまうと、独自の op が黙って計算されない。
  late final ComputedRegistry _computeds =
      widget.computeds ?? ComputedRegistry();
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
    // 画面のボタンにも同じ record を渡す（フォームの外に居るので届けないと見えない）。
    widget.live?.publish(record);
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final section in widget.form.sections)
          ..._buildSection(section, record),
      ],
    );
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
    // セクションごと隠す（「法人のときだけ請求先の枠を出す」）。中の項目は検証も
    // されない（FormValidator も同じ条件を見る）。
    if (section.visibleWhen != null &&
        !evaluateCondition(section.visibleWhen, record, mode: widget.mode)) {
      return const [];
    }
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

    // 「非活性」と「読み取り専用」は別物として描く:
    //   enabledWhen が false … グレーになる（いま触れるものではない、と見て分かる）
    //   readOnly / readOnlyWhen … 見た目は普通のまま、直せないだけ（値は読ませたい）
    // 触れないという結果は同じなので、入力の可否は locked でまとめて見る。
    final enabled = field.enabledWhen == null ||
        evaluateCondition(field.enabledWhen, record, mode: widget.mode);
    final readOnly = field.readOnly ||
        (field.readOnlyWhen != null &&
            evaluateCondition(field.readOnlyWhen, record, mode: widget.mode));
    final locked = readOnly || !enabled;

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
          computeds: _computeds,
          fieldBuilders: widget.fieldBuilders,
          roles: widget.roles,
          readOnly: locked,
        );
      case FieldTypes.subTable:
        input = _SubTableField(
          field: field,
          rows: _subTableRows(_values[field.field]),
          formatters: _formatters,
          validators: _validators,
          computeds: _computeds,
          fieldBuilders: widget.fieldBuilders,
          roles: widget.roles,
          readOnly: locked,
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
            enabled: enabled,
          ),
          items: [
            for (final option in _options.optionsFor(field, record))
              DropdownMenuItem<Object?>(
                value: option.value,
                child: Text(option.label),
              ),
          ],
          onChanged: locked
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
          onChanged: locked
              ? null
              : (value) => setState(() => _values[field.field] = value),
        );
      case FieldTypes.radio:
        input = InputDecorator(
          decoration: InputDecoration(
            labelText: label,
            border: InputBorder.none,
            errorText: errorText,
            enabled: enabled,
          ),
          child: RadioGroup<Object?>(
            groupValue: _values[field.field],
            onChanged: (value) {
              if (locked) return;
              setState(() => _values[field.field] = value);
            },
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (final option in _options.optionsFor(field, record))
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
            enabled: enabled,
          ),
          child: Wrap(
            spacing: 8,
            children: [
              for (final option in _options.optionsFor(field, record))
                FilterChip(
                  key: Key('hatake.form.${field.field}.${option.value}'),
                  label: Text(option.label),
                  selected: selected.contains(option.value),
                  onSelected: locked
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
          onTap: locked ? null : () => _pickDate(field),
          child: InputDecorator(
            decoration: InputDecoration(
              labelText: label,
              border: const OutlineInputBorder(),
              errorText: errorText,
              suffixIcon: const Icon(Icons.calendar_today),
              enabled: enabled,
            ),
            child: Text('${_values[field.field] ?? ''}'),
          ),
        );
      default:
        input = TextField(
          key: Key('hatake.form.${field.field}'),
          controller: _text[field.field],
          enabled: enabled,
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
