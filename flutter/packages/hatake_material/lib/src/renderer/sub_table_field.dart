part of '../material_renderer.dart';

/// Normalizes a `subTable` value (from a repository or YAML) to child rows.
List<DataRecord> _subTableRows(Object? value) {
  if (value is! Iterable) return const [];
  return [
    for (final row in value)
      if (row is Map) row.cast<String, Object?>(),
  ];
}

/// Row editor fields: the declared `fields`, or derived from `columns` when
/// omitted so a grid stays usable with the shorter definition.
List<FieldDefinition> _rowEditorFields(FieldDefinition field) {
  if (field.rowFields.isNotEmpty) return field.rowFields;
  return [
    for (final column in field.columns)
      FieldDefinition(
        field: column.field,
        label: column.label,
        type: column.type == ColumnTypes.number
            ? FieldTypes.number
            : FieldTypes.text,
      ),
  ];
}

/// Child-row grid for a `type: subTable` field (master-detail): shows the rows
/// via the declared `columns` and edits them with a row dialog built from the
/// declared `fields` (so row validators and `computed` apply as usual).
class _SubTableField extends StatelessWidget {
  final FieldDefinition field;
  final List<DataRecord> rows;
  final FormatterRegistry formatters;
  final ValidatorRegistry validators;
  final Map<String, MaterialFieldBuilder> fieldBuilders;
  final Set<String> roles;
  final bool readOnly;
  final String? errorText;
  final ValueChanged<List<DataRecord>> onChanged;

  const _SubTableField({
    required this.field,
    required this.rows,
    required this.formatters,
    required this.validators,
    required this.fieldBuilders,
    required this.roles,
    required this.readOnly,
    required this.errorText,
    required this.onChanged,
  });

  Future<void> _editRow(BuildContext context, {int? index}) async {
    final edited = await showDialog<DataRecord>(
      context: context,
      barrierDismissible: false,
      builder: (_) => _SubTableRowDialog(
        field: field,
        initial: index == null ? const {} : rows[index],
        fieldBuilders: fieldBuilders,
        roles: roles,
        validators: validators,
      ),
    );
    if (edited == null) return;
    final next = [...rows];
    if (index == null) {
      next.add(edited);
    } else {
      next[index] = edited;
    }
    onChanged(next);
  }

  void _removeRow(int index) {
    final next = [...rows]..removeAt(index);
    onChanged(next);
  }

  /// Swaps the row with its neighbour: 明細 order matters in business documents.
  void _moveRow(int index, int to) {
    final next = [...rows];
    final moved = next[index];
    next[index] = next[to];
    next[to] = moved;
    onChanged(next);
  }

  /// Row reordering is on by default; `config: { reorderable: false }` opts out.
  bool get _reorderable => field.config['reorderable'] != false;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final columns =
        field.columns.where((c) => isAllowed(c.roles, roles)).toList();
    final reorderable = !readOnly && _reorderable;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(field.label, style: theme.textTheme.titleSmall),
            ),
            if (!readOnly)
              TextButton.icon(
                key: Key('hatake.subtable.${field.field}.add'),
                onPressed: () => _editRow(context),
                icon: const Icon(Icons.add),
                label: const Text('行を追加'),
              ),
          ],
        ),
        if (errorText != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 4),
            child: Text(
              errorText!,
              style: TextStyle(color: theme.colorScheme.error, fontSize: 12),
            ),
          ),
        if (rows.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: Text(
              '明細がありません',
              key: Key('hatake.subtable.${field.field}.empty'),
              style: TextStyle(color: theme.colorScheme.outline),
            ),
          )
        else
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: DataTable(
              key: Key('hatake.subtable.${field.field}'),
              columnSpacing: 24,
              headingRowHeight: 40,
              dataRowMinHeight: 40,
              dataRowMaxHeight: 48,
              columns: [
                for (final column in columns)
                  DataColumn(label: _sizedColumn(column, Text(column.label))),
                if (!readOnly) const DataColumn(label: Text('')),
              ],
              rows: [
                for (var i = 0; i < rows.length; i++)
                  DataRow(
                    cells: [
                      for (final column in columns)
                        DataCell(
                          _sizedColumn(column, Text(_cellText(column, rows[i]))),
                          onTap: readOnly ? null : () => _editRow(context, index: i),
                        ),
                      if (!readOnly)
                        DataCell(Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            if (reorderable) ...[
                              IconButton(
                                key: Key('hatake.subtable.${field.field}.up.$i'),
                                icon: const Icon(Icons.arrow_upward, size: 18),
                                tooltip: '上へ',
                                onPressed: i == 0 ? null : () => _moveRow(i, i - 1),
                              ),
                              IconButton(
                                key: Key('hatake.subtable.${field.field}.down.$i'),
                                icon: const Icon(Icons.arrow_downward, size: 18),
                                tooltip: '下へ',
                                onPressed: i == rows.length - 1
                                    ? null
                                    : () => _moveRow(i, i + 1),
                              ),
                            ],
                            IconButton(
                              key: Key('hatake.subtable.${field.field}.edit.$i'),
                              icon: const Icon(Icons.edit_outlined, size: 18),
                              tooltip: '編集',
                              onPressed: () => _editRow(context, index: i),
                            ),
                            IconButton(
                              key: Key('hatake.subtable.${field.field}.delete.$i'),
                              icon: const Icon(Icons.delete_outline, size: 18),
                              tooltip: '削除',
                              onPressed: () => _removeRow(i),
                            ),
                          ],
                        )),
                    ],
                  ),
              ],
            ),
          ),
      ],
    );
  }

  String _cellText(ColumnDefinition column, DataRecord row) {
    final value = row[column.field];
    if (column.format != null) {
      return formatters.format(column.format!, value, column.config);
    }
    return value?.toString() ?? '';
  }
}

/// Edits one child row. Reuses [_HatakeFormFields] so the row's `required`,
/// `validators`, `normalize` and `computed` behave exactly like a normal form.
class _SubTableRowDialog extends StatefulWidget {
  final FieldDefinition field;
  final DataRecord initial;
  final Map<String, MaterialFieldBuilder> fieldBuilders;
  final Set<String> roles;
  final ValidatorRegistry validators;

  const _SubTableRowDialog({
    required this.field,
    required this.initial,
    required this.fieldBuilders,
    required this.roles,
    required this.validators,
  });

  @override
  State<_SubTableRowDialog> createState() => _SubTableRowDialogState();
}

class _SubTableRowDialogState extends State<_SubTableRowDialog> {
  final GlobalKey<_HatakeFormFieldsState> _fields = GlobalKey();
  ValidationResult _validation = ValidationResult.valid;

  late final FormDefinition _rowForm = FormDefinition(
    sections: [SectionDefinition(fields: _rowEditorFields(widget.field))],
  );

  void _save() {
    final row = _fields.currentState!.collect();
    final result = FormValidator(widget.validators).validate(_rowForm, row);
    if (!result.isValid) {
      setState(() => _validation = result);
      return;
    }
    Navigator.of(context).pop(row);
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text('${widget.field.label}の行'),
      content: SizedBox(
        width: 420,
        child: SingleChildScrollView(
          child: _HatakeFormFields(
            key: _fields,
            form: _rowForm,
            initial: widget.initial,
            validation: _validation,
            fieldBuilders: widget.fieldBuilders,
            roles: widget.roles,
            validators: widget.validators,
          ),
        ),
      ),
      actions: [
        TextButton(
          key: Key('hatake.subtable.${widget.field.field}.row.cancel'),
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('キャンセル'),
        ),
        FilledButton(
          key: Key('hatake.subtable.${widget.field.field}.row.save'),
          onPressed: _save,
          child: const Text('OK'),
        ),
      ],
    );
  }
}
