import 'package:flutter/widgets.dart';
import 'package:hatake_core/hatake_core.dart';

import '../runtime/crud_controller.dart';
import '../runtime/dashboard_controller.dart';
import '../runtime/detail_controller.dart';
import '../runtime/form_controller.dart';
import '../runtime/hatake_router.dart';
import '../runtime/list_controller.dart';
import '../runtime/wizard_controller.dart';

/// Converts a [PageDefinition] into Flutter widgets.
///
/// A renderer's sole responsibility is presentation. It must not contain
/// business logic, hold a [Repository], or perform I/O — it reads the supplied
/// controller's state and calls the controller's methods for interaction.
///
/// The set of pages is closed ([PageDefinition] is sealed), so a renderer
/// exposes one build method per page kind.
abstract interface class Renderer {
  /// Builds the widget tree for a CRUD-like page (crud, master).
  Widget buildCrudPage(
    BuildContext context,
    CrudLike definition,
    CrudController controller,
  );

  /// Builds the widget tree for a read-only search/list page.
  Widget buildSearchPage(
    BuildContext context,
    SearchPageDefinition definition,
    ListController controller,
  );

  /// Builds the widget tree for a read-only single-record detail page.
  Widget buildDetailPage(
    BuildContext context,
    DetailPageDefinition definition,
    DetailController controller,
  );

  /// Builds the widget tree for a standalone create/edit form page.
  Widget buildFormPage(
    BuildContext context,
    FormPageDefinition definition,
    FormController controller,
  );

  /// Builds the widget tree for a stepped-input (wizard) page.
  Widget buildWizardPage(
    BuildContext context,
    WizardPageDefinition definition,
    WizardController controller,
  );

  /// Builds the widget tree for a dashboard page (a grid of card queries).
  Widget buildDashboardPage(
    BuildContext context,
    DashboardPageDefinition definition,
    DashboardController controller,
  );

  /// Builds the app shell (navigation menu + current page) for an
  /// [AppDefinition], driven by [router].
  Widget buildApp(
    BuildContext context,
    AppDefinition definition,
    HatakeRouter router,
  );
}
