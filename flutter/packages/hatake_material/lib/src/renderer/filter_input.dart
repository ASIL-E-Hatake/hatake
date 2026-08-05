part of '../material_renderer.dart';

/// The search area shared by every list-style page (CRUD / master / search).
///
/// Owns the filter input values and hands them to [onSearch] as a filter map.
/// Only filters with a value are included; empty inputs are omitted.
///
/// Keys: each input is `hatake.filter.<field>` — for an `operator: between`
/// filter the two inputs are `hatake.filter.<field>.from` / `.to` and the value
/// is sent as a 2-element `[from, to]` list. The button is `hatake.search`.
class _SearchArea extends StatefulWidget {
  final SearchDefinition search;
  final ValueChanged<Map<String, Object?>> onSearch;

  const _SearchArea({required this.search, required this.onSearch});

  @override
  State<_SearchArea> createState() => _SearchAreaState();
}

class _SearchAreaState extends State<_SearchArea> {
  /// Text inputs, keyed by slot (`field`, or `field.from` / `field.to`).
  final Map<String, TextEditingController> _text = {};

  /// Picked values for non-text inputs (select / checkbox / date), by slot.
  final Map<String, Object?> _values = {};

  static const double _spacing = 12;
  static const double _slotWidth = 220;

  List<FilterDefinition> get _filters => widget.search.filters;

  static bool _isRange(FilterDefinition filter) =>
      filter.operator == FilterOperators.between;

  static List<String> _slotsOf(FilterDefinition filter) => _isRange(filter)
      ? ['${filter.field}.from', '${filter.field}.to']
      : [filter.field];

  /// Types captured with a [TextField]; everything else keeps a picked value.
  static bool _isTextInput(String type) =>
      type != FieldTypes.select &&
      type != FieldTypes.checkbox &&
      type != FieldTypes.date &&
      type != FieldTypes.dateTime;

  @override
  void initState() {
    super.initState();
    for (final filter in _filters) {
      for (final slot in _slotsOf(filter)) {
        if (_isTextInput(filter.type)) {
          _text[slot] = TextEditingController();
        } else {
          _values[slot] = null;
        }
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

  /// The current value of one input, or null when it carries no condition.
  Object? _slotValue(FilterDefinition filter, String slot) {
    final controller = _text[slot];
    if (controller == null) return _values[slot];
    final text = controller.text.trim();
    if (text.isEmpty) return null;
    if (filter.type == FieldTypes.number) return num.tryParse(text) ?? text;
    return text;
  }

  void _runSearch() {
    final filters = <String, Object?>{};
    for (final filter in _filters) {
      if (_isRange(filter)) {
        final from = _slotValue(filter, '${filter.field}.from');
        final to = _slotValue(filter, '${filter.field}.to');
        if (from == null && to == null) continue;
        filters[filter.field] = [from, to];
      } else {
        final value = _slotValue(filter, filter.field);
        if (value == null) continue;
        filters[filter.field] = value;
      }
    }
    widget.onSearch(filters);
  }

  static String _formatDate(DateTime date) {
    String two(int value) => value.toString().padLeft(2, '0');
    return '${date.year}-${two(date.month)}-${two(date.day)}';
  }

  Future<void> _pickDate(String slot) async {
    final current = DateTime.tryParse('${_values[slot] ?? ''}');
    final picked = await showDatePicker(
      context: context,
      initialDate: current ?? DateTime.now(),
      firstDate: DateTime(2000),
      lastDate: DateTime(2100),
    );
    if (picked != null) {
      setState(() => _values[slot] = _formatDate(picked));
    }
  }

  @override
  Widget build(BuildContext context) {
    final columns = widget.search.layout.columns;
    if (columns <= 1) {
      return _wrap([
        for (final filter in _filters)
          SizedBox(
            width: _isRange(filter) ? _slotWidth * 2 + _spacing : _slotWidth,
            child: _filterInput(filter),
          ),
      ]);
    }
    // Multi-column: split the available width, collapsing when it gets narrow.
    return LayoutBuilder(
      builder: (context, constraints) {
        final available = constraints.maxWidth.isFinite
            ? constraints.maxWidth
            : _slotWidth * columns + _spacing * (columns - 1);
        final perRow = available < _slotWidth * 2 ? 1 : columns;
        final width =
            ((available - _spacing * (perRow - 1)) / perRow).floorToDouble();
        return _wrap([
          for (final filter in _filters)
            SizedBox(width: width, child: _filterInput(filter)),
        ]);
      },
    );
  }

  Widget _wrap(List<Widget> inputs) {
    return Wrap(
      spacing: _spacing,
      runSpacing: _spacing,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        ...inputs,
        FilledButton.icon(
          key: const Key('hatake.search'),
          onPressed: _runSearch,
          icon: const Icon(Icons.search),
          label: const Text('検索'),
        ),
      ],
    );
  }

  Widget _filterInput(FilterDefinition filter) {
    if (!_isRange(filter)) {
      return _slotInput(filter, filter.field, filter.label);
    }
    return Row(
      children: [
        Expanded(
          child: _slotInput(
              filter, '${filter.field}.from', '${filter.label}（開始）'),
        ),
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 6),
          child: Text('〜'),
        ),
        Expanded(
          child:
              _slotInput(filter, '${filter.field}.to', '${filter.label}（終了）'),
        ),
      ],
    );
  }

  InputDecoration _decoration(String label) => InputDecoration(
        labelText: label,
        border: const OutlineInputBorder(),
        isDense: true,
      );

  Widget _slotInput(FilterDefinition filter, String slot, String label) {
    final key = Key('hatake.filter.$slot');
    switch (filter.type) {
      case FieldTypes.select:
        return DropdownButtonFormField<Object?>(
          key: key,
          initialValue: _values[slot],
          decoration: _decoration(label),
          items: [
            const DropdownMenuItem<Object?>(value: null, child: Text('—')),
            for (final option in filter.options)
              DropdownMenuItem<Object?>(
                value: option.value,
                child: Text(option.label),
              ),
          ],
          onChanged: (value) => setState(() => _values[slot] = value),
        );
      // Tri-state: no condition / true / false.
      case FieldTypes.checkbox:
        return DropdownButtonFormField<bool?>(
          key: key,
          initialValue: _values[slot] as bool?,
          decoration: _decoration(label),
          items: const [
            DropdownMenuItem<bool?>(value: null, child: Text('指定なし')),
            DropdownMenuItem<bool?>(value: true, child: Text('はい')),
            DropdownMenuItem<bool?>(value: false, child: Text('いいえ')),
          ],
          onChanged: (value) => setState(() => _values[slot] = value),
        );
      case FieldTypes.date:
      case FieldTypes.dateTime:
        return InkWell(
          key: key,
          onTap: () => _pickDate(slot),
          child: InputDecorator(
            decoration: _decoration(label).copyWith(
              suffixIcon: const Icon(Icons.calendar_today, size: 18),
            ),
            child: Text('${_values[slot] ?? ''}'),
          ),
        );
      default:
        return TextField(
          key: key,
          controller: _text[slot],
          keyboardType:
              filter.type == FieldTypes.number ? TextInputType.number : null,
          decoration: _decoration(label),
          onSubmitted: (_) => _runSearch(),
        );
    }
  }
}
