These checks drive the real canvas UI in a downloaded CI-built web app. They do not compile SolidCraft. OCR locates controls because eframe's web backend does not expose its AccessKit tree as DOM elements.

1. Download the `github-pages` artifact from the Pages workflow and extract `artifact.tar` into a temporary directory.
2. Serve that directory: `python3 -m http.server 8765 --directory /path/to/extracted/web`.
3. In this directory, run `npm ci` and `npx playwright install chromium`.
4. Run `npm run phone -- http://127.0.0.1:8765/ /path/to/evidence`.

The script captures full-window dark and light number/code screens and a 480×640 small-window check. It verifies an arbitrary six-digit code, verifies the form stays dismissed afterward, and skips then advances browser time to check the three-minute return. During typing, sending, verification and skipping it asserts zero network requests, network API calls and console output. A dedicated run uses the existing `?embed=editor` nonpersistent launch and asserts zero storage writes. Normal launches may save existing `egui_memory_ron` and `solidcraft.prefs` settings; those are the only allowed write paths, and every write is inspected for input without retaining or printing its contents. While guarded, all network API calls throw before delegation and a browser route aborts any other request, so a regression cannot transmit even the synthetic inputs. Service workers are blocked so they cannot bypass routing. Storage probes cover Web Storage, IndexedDB, Cache and filesystem writes. Inputs use a fictional reserved phone number and are never printed in the report. Initial app loading and theme setup happen before the privacy guard is armed.

`tesseract.js` downloads its English OCR model to the system temporary directory on first use. That test-runner download is independent of the browser under test. Output screenshots and `audit.json` belong in a separate evidence location, outside the source diff.
