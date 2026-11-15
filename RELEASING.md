# Releasing Cartocortex

## Build a release

1. Set the same version in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml` (they are not linked; `cargo check` refreshes `Cargo.lock`).
2. Merge to `main`, then tag it: `git tag v0.1.3 && git push origin v0.1.3`.
3. The **Release** workflow builds macOS (Apple silicon and Intel), Windows and Linux and attaches the installers to a **draft** GitHub release. Review it, then publish by hand.

To try the pipeline without publishing anything, run **Release** from the Actions tab (*Run workflow*). It builds all four targets and keeps the installers as workflow artifacts.

## Signed checksums

When a release is published, the **Sign release** workflow (`.github/workflows/sign.yml`) lists every installer with its SHA-256 digest in `SHA256SUMS`, signs that file with the Complexus Lab Ed25519 key, attaches `SHA256SUMS` and `SHA256SUMS.sig` to the release, and copies both to `https://complexuslab.fr/cartocortex/releases/<tag>/`. The second copy lets a user check the signature against a host other than GitHub. To sign a release published earlier, run **Sign release** from the Actions tab with its tag.

This signature proves where the files come from. It does not replace the operating systems' own code signing: macOS and Windows still warn about installers that are not signed with an Apple or Windows certificate.

The key is the one that signs Rouvre releases and its bundle index. Its public half is [`keys/release-signing.pub.pem`](keys/release-signing.pub.pem); SHA-256 of its DER encoding: `695c39099ec072b9acc83a113cf80b107b7590dca84672593e79431d8bc5e9df`. The workflow refuses to sign when the private key does not match that file.

### One-time setup

In *Settings → Environments*, create an environment named `release`:

1. Under *Deployment branches and tags*, choose *Selected branches and tags* and add the branch `main` and the tag pattern `v*`. A published release runs the workflow on its tag; a manual run runs on `main`.
2. Add the secret `COMPLEXUS_LAB_SIGNING_KEY`: the PEM private key, the same one stored as `ROUVRE_SIGNING_KEY` in the Rouvre repository, starting with `-----BEGIN PRIVATE KEY-----`.
3. Add the secret `SITE_TOKEN`: a fine-grained personal access token limited to `complexus-lab/complexus-lab-site`, with read and write access to its contents. The token already used by Rouvre fits.

### Checking a download

With OpenSSL 3 (on macOS, `brew install openssl@3`, then use `$(brew --prefix openssl@3)/bin/openssl`: the `openssl` shipped with macOS cannot verify Ed25519):

```bash
curl -LO https://complexuslab.fr/cartocortex/release-signing-key.pem
curl -LO https://complexuslab.fr/cartocortex/releases/v0.1.2/SHA256SUMS
curl -LO https://complexuslab.fr/cartocortex/releases/v0.1.2/SHA256SUMS.sig
openssl pkeyutl -verify -pubin -inkey release-signing-key.pem -rawin -in SHA256SUMS -sigfile SHA256SUMS.sig
grep Cartocortex_0.1.2_aarch64.dmg SHA256SUMS | shasum -a 256 -c   # name of the file you downloaded
```

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

## Opening files from the system

`.xmind` files are registered with the app (`bundle.fileAssociations`), so double-click and *Open With* work once it is installed. Windows and Linux pass the file as a launch argument; macOS sends an open-file event, which also covers files dropped on the Dock icon. Each file opens in its own tab (a file already open is shown, not duplicated).

Checked so far: launching the Linux debug build with a `.xmind` argument opens it in a new tab. Not checked: the macOS open-file event, the Windows association, and a second double-click while the app is already running (each launch starts a separate instance, as there is no single-instance handling yet).

Only `.xmind` is registered. The app's own maps are plain `.json`, an extension too common to claim.
