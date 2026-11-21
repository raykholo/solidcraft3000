# Phone verification parody: browser evidence

These screenshots were captured from the CI-built web app. SolidCraft was not built locally.

- Source: `c3de5d1bc3fbcc6ce4b7906811943ba29062e04f` on `raykholo/solidcraft`'s `sc3000` branch.
- CI: https://github.com/raykholo/solidcraft3000/actions/runs/44847720883 — 64 feature-on tests passed; wasm release build passed.
- Artifact: `github-pages`, ID `14687721482`.
- GitHub artifact archive digest: `sha256:0d99797159df9995d72a8d6738a13ce6e257a1c9e50b94f255684e7f123df6ec`.
- Downloaded `artifact.tar` SHA-256: `16048aea08a58ff6b5cb3ca75923377d84bb8d80685b1a2d13ca04c522b11e9b`.
- Browser helper: `09eefaa` in `raykholo/solidcraft3000`, `site/tests/phone.mjs`.
- Capture command: `npm run phone -- http://127.0.0.1:8765/ /path/to/evidence`, serving the extracted CI artifact with a static HTTP server.
- Normal dark and light screenshots: 1280 × 720. Small-window screenshot: 480 × 640.

`audit.json` records the full passing run against this final artifact. Dark and light normal launches each wrote only the two existing settings keys, with zero writes containing input; the nonpersistent run had zero storage writes. All three guarded flows had zero network calls, browser requests and console output. The 480 × 640 layout check also passed. Verification accepts arbitrary six digits and stays dismissed after another three minutes; skipping returns the form after three minutes. All guarded interactions require zero network API calls, browser requests and console output. Guarded network attempts are blocked before delegation. The existing `?embed=editor` nonpersistent launch additionally requires zero storage writes. Normal mode allows only the existing `egui_memory_ron` and `solidcraft.prefs` settings writers, and inspects every write for synthetic input without retaining or printing its contents.

The modal screenshots contain the built-in public Sample Plate. The phone and code fields are masked. No actual messages or calls are sent.
