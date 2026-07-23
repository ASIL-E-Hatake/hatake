# hatake_example

A runnable example of [hatake](../../README.md): the **顧客マスタ** (customer
master) CRUD screen, defined entirely in
[`assets/customer_master.yaml`](assets/customer_master.yaml) and rendered with
`hatake_material`. There is **no screen-specific widget code** — the UI is
produced from the definition.

## Run

```bash
flutter pub get
flutter run            # desktop / mobile / web
```

## Build the web demo

```bash
flutter build web --release --base-href /hatake/
# output in build/web/
```

The repository's CI can publish this build to GitHub Pages
(see `.github/workflows/deploy-demo.yml`).
