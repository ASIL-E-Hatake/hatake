part of '../material_renderer.dart';

class _MaterialCrudPage extends StatefulWidget {
  final CrudLike definition;
  final CrudController controller;
  final Map<String, MaterialFieldBuilder> fieldBuilders;
  final FormatterRegistry? formatters;

  const _MaterialCrudPage({
    required this.definition,
    required this.controller,
    required this.fieldBuilders,
    required this.formatters,
  });

  @override
  State<_MaterialCrudPage> createState() => _MaterialCrudPageState();
}

class _MaterialCrudPageState extends State<_MaterialCrudPage> {
  late final FormatterRegistry _formatters =
      widget.formatters ?? FormatterRegistry();

  /// 一括実行のために選んだ行（`scope: selection` のボタンが在るときだけ使う）。
  final _selection = _RowSelection();

  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_onRowsChanged);
  }

  @override
  void dispose() {
    widget.controller.removeListener(_onRowsChanged);
    super.dispose();
  }

  /// 行が入れ替わったら選択を捨てる（画面に無い行へ実行できてしまうのを防ぐ）。
  void _onRowsChanged() {
    if (_selection.syncRows(widget.controller.items) && mounted) {
      setState(() {});
    }
  }

  CrudLike get _def => widget.definition;
  CrudController get _controller => widget.controller;
  Set<String> get _roles => HatakeScope.of(context).roles;

  Future<void> _openForm() {
    return showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (_) => _FormDialog(
        definition: _def,
        controller: _controller,
        fieldBuilders: widget.fieldBuilders,
        roles: _roles,
        formatters: _formatters,
        validators: HatakeScope.of(context).validators,
        computeds: HatakeScope.of(context).computeds,
        subTables: HatakeScope.of(context).subTableController,
        repositories: HatakeScope.of(context).repositories,
      ),
    );
  }

  /// One dispatcher for every page kind (see `_runPageAction`), so `confirm` /
  /// `onSuccess` behave the same wherever the action sits.
  Future<void> _onAction(ActionDefinition action, {DataRecord? record}) async {
    final selected = action.scope == ActionScopes.selection
        ? _selection.pick(_controller.items, _def.keyField)
        : const <DataRecord>[];
    final ran = await _runPageAction(
      context,
      action,
      _controller,
      record: record,
      records: selected,
      onExport: _export,
      onCreate: () {
        _controller.startCreate();
        return _openForm();
      },
      onSelectRows: _selectRows,
      keyField: _def.keyField,
      onExportLeftover: _exportLeftoverRows,
    );
    // 実行できたら選択を解く（同じ行に二度実行するのは、まず事故）。
    if (ran && selected.isNotEmpty && mounted) {
      setState(_selection.clear);
    }
  }

  /// **その行だけを選び直す**（一括の続きを押せるようにする）。
  ///
  /// 使う場面は2つ。**一部だけ失敗した**とき（失敗した行だけ）と、**区切って実行して
  /// 途中で終わった**とき（まだ終わっていない行だけ）。「3件失敗しました」「3件は
  /// 実行していません」で終わると、現場は全部やり直すか選び直すことになる。
  /// いま画面に無い行は選ばない（[_RowSelection.keepOnly] が絞る）。
  void _selectRows(List<Object?> keys) {
    if (!mounted) return;
    setState(() => _selection.keepOnly(keys, _controller.items, _def.keyField));
  }

  /// Re-query so the CSV holds the whole result, not just the page shown.

  /// 一括のあとに残った行を**画面の外へ持ち出す**（表の列と整形はこの画面が知っている）。
  ///
  /// 出す口と役割は**この画面の context**から引く（押されるのはダイアログの中＝
  /// `HatakeScope` の外なので、そこから引くと落ちる）。
  Future<bool> _exportLeftoverRows(
    ActionDefinition action,
    _Leftover leftover,
  ) {
    final scope = HatakeScope.of(context);
    return _exportLeftover(
      action,
      leftover,
      sink: scope.exportSink,
      roles: scope.roles,
      columns: _def.table.columns,
      keyField: _def.keyField,
      formatters: _formatters,
    );
  }

  Future<bool> _export(BuildContext context, ActionDefinition action) {
    return _runExportAction(
      context,
      action,
      columns: _def.table.columns,
      rows: _controller.fetchForExport,
      formatters: _formatters,
      fallbackName: _def.title,
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _listHeader(_def.title, theme, [
            for (final action in _pageOnlyActions(_def.actions))
              if (isAllowed(action.roles, _roles))
                if (action.scope == ActionScopes.selection)
                  _bulkButton(
                    action: action,
                    count: _selection
                        .pick(_controller.items, _def.keyField)
                        .length,
                    onPressed: () => _onAction(action),
                    roles: _roles,
                    // 読み込み中は「行が無い」と決めつけない（待っている間だけ嘘になる）。
                    hasRows: _controller.loading
                        ? null
                        : _controller.items.isNotEmpty,
                    // 選んだ行が全部満たすときだけ押せる（合わない件数はラベルへ）。
                    failing: _actionEnabled(
                      action,
                      rows: _selection.pick(_controller.items, _def.keyField),
                    ).failing,
                  )
                else
                  // 一覧の上のボタンには判定する相手が無い（開いているレコードが
                  // 無い）ので出し分けない。書いても効かないことは validate が言う。
                  FilledButton(
                    key: Key('hatake.action.${action.id}'),
                    onPressed: () => _onAction(action),
                    child: Text(action.label),
                  ),
          ]),
          const SizedBox(height: 12),
          if (_def.search != null) ...[
            _SearchArea(search: _def.search!, onSearch: _controller.search),
            const SizedBox(height: 12),
          ],
          Expanded(child: _buildBody()),
          const SizedBox(height: 8),
          _buildPagination(theme),
        ],
      ),
    );
  }

  Widget _buildBody() {
    if (_controller.loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_controller.error != null) {
      return Center(
        child: Text(
          'エラー: ${_controller.error}',
          key: const Key('hatake.error'),
          style: TextStyle(color: Theme.of(context).colorScheme.error),
        ),
      );
    }
    if (_controller.items.isEmpty) {
      return const Center(
        child: Text('データがありません', key: Key('hatake.empty')),
      );
    }
    return _buildTable();
  }

  Widget _buildTable() {
    final columns =
        _def.table.columns.where((c) => isAllowed(c.roles, _roles)).toList();
    final hasRowActions = _rowSlots().isNotEmpty;
    final selectable = _hasSelectionAction(_def.actions, _roles);

    return SingleChildScrollView(
      scrollDirection: Axis.vertical,
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: DataTable(
          // 表が選択可能になるのは、選んだ行に対して実行するボタンが在るときだけ。
          showCheckboxColumn: selectable,
          columns: [
            for (final column in columns)
              DataColumn(
                label: _sizedColumn(column, Text(column.label)),
                onSort: column.sortable
                    ? (index, ascending) =>
                        _controller.sortBy(column.field, ascending: ascending)
                    : null,
              ),
            if (hasRowActions) const DataColumn(label: Text('')),
          ],
          rows: [
            for (final record in _controller.items)
              DataRow(
                selected: selectable && _selection.has(record[_def.keyField]),
                onSelectChanged: !selectable
                    ? null
                    : (value) => setState(() => _selection.toggle(
                          record[_def.keyField],
                          selected: value ?? false,
                          rows: _controller.items,
                        )),
                cells: [
                  for (final column in columns)
                    DataCell(_sizedColumn(
                        column, _buildCell(column, record[column.field]))),
                  if (hasRowActions) DataCell(_buildRowActions(record)),
                ],
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildCell(ColumnDefinition column, Object? value) {
    final text = column.format != null
        ? _formatters.format(column.format!, value, column.config)
        : value?.toString() ?? '';
    switch (column.type) {
      case ColumnTypes.badge:
        return Chip(
          label: Text(text),
          visualDensity: VisualDensity.compact,
        );
      case ColumnTypes.boolean:
        return Icon(value == true ? Icons.check : Icons.close, size: 18);
      default:
        return Text(text);
    }
  }

  /// 画面のボタンにするアクション（行の操作の**宣言**は外す）。
  ///
  /// `type: edit` / `type: delete` を `actions:` に書くのは、行の操作の言い方を業務の
  /// 言葉にするための宣言（`confirm` を書くと行の削除がその文で聞く）。ボタンとして
  /// 押す口ではないので、並べると**押しても「未実装です」と言うだけのボタン**が出る
  /// ＝この枠組みで一番まずい転び方（押すまで気づけない）。
  ///
  /// 行に出す口は [_buildRowActions]（`table.rowActions` が決める）。**行に出した
  /// ボタンは上に出さない**（同じボタンが2か所に出ると、どちらを押すのが正しいのか
  /// 分からない）。判定は `search` と同じ規則（[_onPageTop]）を通す。
  List<ActionDefinition> _pageOnlyActions(List<ActionDefinition> actions) => [
        for (final action in actions)
          if (action.type != ActionTypes.edit &&
              action.type != ActionTypes.delete &&
              _onPageTop(action, _def.table.rowActions))
            action,
      ];

  /// Deletes a row, asking first.
  ///
  /// **A delete always asks**, even when the definition says nothing: it is the
  /// one action that cannot be undone. Declaring `confirm` on a `delete` action
  /// replaces the wording; `onSuccess` adds a message or a move afterwards.
  Future<void> _delete(Object key, DataRecord record) async {
    final declared = _declaredAction(_def.actions, ActionTypes.delete);
    if (!await _confirmAction(context, declared?.confirm, destructive: true)) {
      return;
    }
    if (!mounted) return;
    await _controller.deleteRecord(key);
    if (!mounted) return;
    final failure = _controller.error;
    if (failure != null) {
      // 消せなかった理由は画面にも出るが、業務の言葉で言えるなら定義側が言う
      // （「受注が残っているので削除できません」）。
      if (declared?.onError != null) {
        _showActionFailure(context, declared!, error: failure);
      }
      return;
    }
    _afterActionSuccess(context, declared?.onSuccess, record: record);
  }

  /// 行の右端に**何か出る** id（`table.rowActions` の並び順）。
  ///
  /// 組み込み（`edit` / `delete`）はこの画面の機能なので、宣言が無くても出る。それ以外は
  /// 同じ id の宣言を引けたものだけ（引けないことは `validate` が言う
  /// ＝`rowaction-not-declared`）。1つも無ければ列そのものを出さない。
  List<String> _rowSlots() {
    final declared = {
      for (final action
          in _rowActions(_def.table.rowActions, _def.actions, _roles))
        action.id,
    };
    return [
      for (final id in _def.table.rowActions)
        if (id == ActionTypes.edit ||
            id == ActionTypes.delete ||
            declared.contains(id))
          id,
    ];
  }

  /// 行のボタン（組み込みの編集・削除＋定義した行アクション）。
  ///
  /// 宣言（`actions` の `type: edit` / `type: delete`）に `enabledWhen` が書いてあれば、
  /// **その行のレコード**で判定する（「出荷済は消せない」）。押せないときは灰色にして、
  /// 何の状態で決まるのかを添える＝理由の無い灰色を出さない。
  ///
  /// 組み込み以外（`rowActions: [detail]` のような独自のボタン）も**同じ行に出す**。
  /// 同じ書き方が画面の種別で違う所に出ると覚えられないので、`search` と揃えてある
  /// （引き当ても判定も [_rowActions] / [_rowActionButton] を通る）。出る順は定義のまま。
  Widget _buildRowActions(DataRecord record) {
    final key = record[_def.keyField];
    final labels = {
      for (final column in _def.table.columns) column.field: column.label,
    };
    final declared = {
      for (final action
          in _rowActions(_def.table.rowActions, _def.actions, _roles))
        action.id: action,
    };
    Widget rowButton(String type, IconButton button) {
      final declaration = _declaredAction(_def.actions, type);
      if (declaration == null) return button;
      final state = _actionEnabled(declaration, record: record);
      if (state.enabled) return button;
      return _withReason(
        IconButton(
          key: button.key,
          icon: button.icon,
          tooltip: button.tooltip,
          onPressed: null,
        ),
        state,
        labels,
      );
    }

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (final id in _rowSlots())
          if (id == ActionTypes.edit)
            rowButton(
              ActionTypes.edit,
              IconButton(
                key: Key('hatake.edit.$key'),
                icon: const Icon(Icons.edit_outlined),
                tooltip: '編集',
                onPressed: () {
                  _controller.startEdit(record);
                  _openForm();
                },
              ),
            )
          else if (id == ActionTypes.delete)
            rowButton(
              ActionTypes.delete,
              IconButton(
                key: Key('hatake.delete.$key'),
                icon: const Icon(Icons.delete_outline),
                tooltip: '削除',
                onPressed: key == null ? null : () => _delete(key, record),
              ),
            )
          else
            _rowActionButton(
              action: declared[id]!,
              record: record,
              rowKey: key,
              labels: labels,
              onPressed: () => _onAction(declared[id]!, record: record),
            ),
      ],
    );
  }

  Widget _buildPagination(ThemeData theme) {
    final page = _controller.page;
    final pageCount = _controller.pageCount;
    return Row(
      mainAxisAlignment: MainAxisAlignment.end,
      children: [
        Text('全 ${_controller.totalCount} 件', style: theme.textTheme.bodySmall),
        const SizedBox(width: 16),
        IconButton(
          key: const Key('hatake.prev'),
          icon: const Icon(Icons.chevron_left),
          onPressed: page > 0 ? () => _controller.setPage(page - 1) : null,
        ),
        Text('${page + 1} / $pageCount'),
        IconButton(
          key: const Key('hatake.next'),
          icon: const Icon(Icons.chevron_right),
          onPressed:
              page < pageCount - 1 ? () => _controller.setPage(page + 1) : null,
        ),
      ],
    );
  }
}

/// The create/edit form shown as a dialog (used by CRUD/master pages).
class _FormDialog extends StatefulWidget {
  final CrudLike definition;
  final CrudController controller;
  final Map<String, MaterialFieldBuilder> fieldBuilders;
  final Set<String> roles;
  final FormatterRegistry formatters;
  final ValidatorRegistry validators;
  final ComputedRegistry computeds;
  final SubTableControllerFactory subTables;

  /// 選択肢を Repository から引く項目（`optionsSource`）のため。ダイアログは
  /// HatakeScope の外なので、開く側から渡してもらう。
  final RepositoryRegistry repositories;

  const _FormDialog({
    required this.definition,
    required this.controller,
    required this.fieldBuilders,
    required this.roles,
    required this.formatters,
    required this.validators,
    required this.computeds,
    required this.subTables,
    required this.repositories,
  });

  @override
  State<_FormDialog> createState() => _FormDialogState();
}

class _FormDialogState extends State<_FormDialog> {
  final GlobalKey<_HatakeFormFieldsState> _fields = GlobalKey();

  Future<void> _submit() async {
    final values = _fields.currentState!.collect();
    await widget.controller.submitForm(values);
    if (widget.controller.mode == CrudMode.list && mounted) {
      Navigator.of(context).pop();
    }
  }

  void _cancel() {
    widget.controller.cancelForm();
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final controller = widget.controller;
    final isCreate = controller.mode == CrudMode.create;
    return ListenableBuilder(
      listenable: controller,
      builder: (context, _) {
        return AlertDialog(
          title: Text(isCreate ? '新規登録' : '編集'),
          content: SizedBox(
            width: 420,
            child: SingleChildScrollView(
              child: _HatakeFormFields(
                key: _fields,
                form: widget.definition.form,
                initial: controller.draft,
                validation: controller.validation,
                fieldBuilders: widget.fieldBuilders,
                roles: widget.roles,
                formatters: widget.formatters,
                validators: widget.validators,
                computeds: widget.computeds,
                subTables: widget.subTables,
                repositories: widget.repositories,
                // 条件式の `{ mode: create }` / `{ mode: edit }` 用。検証と同じ
                // ものを使う（ズレると「見えているのに検証されない項目」になる）。
                mode: controller.formMode,
                // Child rows need the parent key; null while creating.
                recordKey: isCreate
                    ? null
                    : controller.draft[widget.definition.keyField],
              ),
            ),
          ),
          actions: [
            TextButton(
              key: const Key('hatake.form.cancel'),
              onPressed: controller.submitting ? null : _cancel,
              child: const Text('キャンセル'),
            ),
            FilledButton(
              key: const Key('hatake.form.save'),
              onPressed: controller.submitting ? null : _submit,
              child: controller.submitting
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('保存'),
            ),
          ],
        );
      },
    );
  }
}
