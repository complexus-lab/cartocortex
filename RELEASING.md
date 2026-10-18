# Releasing Cartocortex

## Build a release

1. Set the same version in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml` (they are not linked; `cargo check` refreshes `Cargo.lock`).
2. Merge to `main`, then tag it: `git tag v0.1.3 && git push origin v0.1.3`.
3. The **Release** workflow builds macOS (Apple silicon and Intel), Windows and Linux and attaches the installers to a **draft** GitHub release. Review it, then publish by hand.

To try the pipeline without publishing anything, run **Release** from the Actions tab (*Run workflow*). It builds all four targets and keeps the installers as workflow artifacts.

## macOS signing and notarization

Without the secrets below, the macOS builds are unsigned and users need the right-click → Open workaround. With all six present, the workflow signs with a Developer ID certificate and notarizes the app with Apple (the run takes a few minutes longer).

You need a paid Apple Developer Program membership. Then:

| Secret | Value |
|---|---|
| `APPLE_CERTIFICATE` | A **Developer ID Application** certificate exported from Keychain Access as `.p12`, then `base64 -i cert.p12 \| pbcopy` |
| `APPLE_CERTIFICATE_PASSWORD` | The password chosen when exporting the `.p12` |
| `APPLE_SIGNING_IDENTITY` | The certificate's name, e.g. `Developer ID Application: Your Name (TEAMID)` (`security find-identity -v -p codesigning`) |
| `APPLE_ID` | The Apple ID of the developer account |
| `APPLE_PASSWORD` | An app-specific password from appleid.apple.com (not the account password) |
| `APPLE_TEAM_ID` | The 10-character team id (Membership details) |

Add them under *Settings → Secrets and variables → Actions*. The workflow checks that all six exist; if one is missing it falls back to the unsigned build instead of failing.

Check a signed build on a Mac that has never seen the app: `spctl -a -vv /Applications/Cartocortex.app` should answer `accepted` with `source=Notarized Developer ID`.

## Not done yet

- **Windows signing.** Installers are unsigned, so SmartScreen warns on first run. Fixing it needs a code-signing certificate (an EV certificate removes the warning at once; a standard one earns reputation over time).
- **Automatic updates.** Needs `tauri-plugin-updater`, a key pair from `npm run tauri signer generate`, the public key in `tauri.conf.json`, the private key as a secret, and an update check in the app.
- **File associations.** Double-clicking a `.xmind` file would need `bundle.fileAssociations` plus code that opens the path the system passes in (arguments on Windows and Linux, an open-file event on macOS). The app has neither yet.
