import '../definition/page_definition.dart';

/// The `page.type` strings a definition is written with.
///
/// The parser turns these into the sealed [PageDefinition] classes; tooling that
/// starts from a parsed page needs the way back (an index, a summary and a
/// diagram all speak in `type` because that is what a human wrote).
abstract final class PageKinds {
  static const String crud = 'crud';
  static const String search = 'search';
  static const String master = 'master';
  static const String detail = 'detail';
  static const String form = 'form';
  static const String wizard = 'wizard';
  static const String dashboard = 'dashboard';
  static const String report = 'report';

  /// Every built-in kind, in the order the spec lists them.
  static const List<String> all = [
    crud,
    search,
    master,
    detail,
    form,
    wizard,
    dashboard,
    report,
  ];
}

/// The `type` this page was written as.
///
/// Exhaustive over the sealed hierarchy: adding a page kind without teaching it
/// here is a compile error, not a screen that quietly reports the wrong kind.
String pageKindOf(PageDefinition page) => switch (page) {
      CrudPageDefinition() => PageKinds.crud,
      SearchPageDefinition() => PageKinds.search,
      MasterPageDefinition() => PageKinds.master,
      DetailPageDefinition() => PageKinds.detail,
      FormPageDefinition() => PageKinds.form,
      WizardPageDefinition() => PageKinds.wizard,
      DashboardPageDefinition() => PageKinds.dashboard,
      ReportPageDefinition() => PageKinds.report,
    };
