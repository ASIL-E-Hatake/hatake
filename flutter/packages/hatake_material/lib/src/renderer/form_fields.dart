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

  const _HatakeFormFields({
    super.key,
    required this.form,
    required this.initial,
    required this.validation,
    required this.fieldBuilders,
    required this.roles,
  });

  @override
  State<_HatakeFormFields> createState() => _HatakeFormFieldsState();
}

class _HatakeFormFieldsState extends State<_HatakeFormFields> {
  final Map<String, TextEditingController> _text = {};
  final Map<String, Object?> _values = {};
  final ComputedRegistry _computeds = ComputedRegistry();

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
    final record = collect();
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final section in widget.form.sections)
          ..._buildSection(section, record),
      ],
    );
  }

  List<Widget> _buildSection(SectionDefinition section, DataRecord record) {
    final visible = [
      for (final field in section.fields)
        if (isAllowed(field.roles, widget.roles) &&
            (field.visibleWhen == null ||
                evaluateCondition(field.visibleWhen, record)))
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
        evaluateCondition(field.enabledWhen, record);
    final readOnly = field.readOnly || !enabled;

    Widget input;
    switch (field.type) {
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
            for (final option in field.options)
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
                for (final option in field.options)
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
              for (final option in field.options)
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
