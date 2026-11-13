<div align="center">

<img src="apps/desktop/src-tauri/icons/icon.png" width="104" alt="Oort Notes app icon" />

# Oort Notes

A canvas notebook that thinks like an IDE and teaches like a tutor.

<a href="https://github.com/viskar-dev/Oort-Notes/releases/latest/download/Oort.Notes_0.1.0_x64-setup.exe"><img src="docs/assets/download-windows.svg" height="44" alt="Download Oort Notes for Windows — .exe installer" /></a>
&nbsp;
<a href="https://github.com/viskar-dev/Oort-Notes/releases/latest/download/Oort.Notes_0.1.0_x64_en-US.msi"><img src="docs/assets/download-windows-msi.svg" height="44" alt="Download Oort Notes for Windows — MSI package" /></a>

<br />

**Release v0.1.0** · Windows 10/11
<br />
<sub>Windows is the supported release platform. macOS and Linux can be built locally from source — see <a href="#run-it-locally">Run it locally</a> · <a href="https://github.com/viskar-dev/Oort-Notes/releases/tag/v0.1.0">all release files</a></sub>

</div>

## Platform notes

- **Windows 10/11 (x64) — supported release:** run the `.exe` installer; the `.msi` is for managed or silent installs.
- **macOS / Linux — local builds only:** CI currently publishes Windows installers only. The app still builds on macOS and Linux from source; see [Run it locally](#run-it-locally) and [Build installers](#build-installers). Local macOS/Linux builds are unsigned — on macOS, right-click the app and choose **Open** on first launch.

## Why Oort Notes

- Whiteboards are built for systems design; notebooks are built for learning. Oort Notes is both.
- Every topic is a **finite, paginated canvas** — page 3 is page 3, not a coordinate.
- Content is made of **real components**, not pictures: editable code, math, callouts, tables, SVG.
- An **AI toolbox** can read and edit the entire canvas with you.

## Features

**Structure**
- Notebooks → chapters → topics; each topic is a fixed-height page.
- Scroll pans sheet to sheet; the active page chip follows.
- Sticky notes, text, geometric shapes, arrows and connector lines.
- PDF export of chapter content.

**Components**
- Editable, syntax-highlighted code blocks (Shiki, 13 languages + plain text).
- KaTeX math: inline `$…$`, display `$$…$$`, and dedicated equation cards.
- Callout cards: note, info, tip, success, warning, danger.
- Markdown tables with alignment and draggable column widths.
- SVG diagrams and a built-in Iconify icon finder.
- Dark theme with violet branding and an overlay titlebar.

**AI**
- Streaming assistant chat with markdown and diagrams.
- Anchored canvas prompts: select shapes, ask, and results land where you asked.
- 18 canvas tools for reading, creating, updating, deleting and converting shapes.
- Shimmer previews for new and edited shapes.
- View mode blocks mutations; destructive actions ask for confirmation.
- Per-canvas MCP server for external clients.

**Backup and data**
- Google Drive backup as one always-latest archive.
- Import and export backup archives.
- Local-first SQLite storage; data leaves your machine only if you connect Drive.

## Architecture

- `apps/desktop` — Tauri 2 shell: window, SQLite, AI turn runner, MCP server, OS keyring.
- `packages/core` — Rust core: SQL repository, Google Drive client, Iconify proxy.
- `apps/frontend` — React + tldraw: canvas, components, AI bridge, settings.
- `apps/server` — optional web/e2e sibling.

## Run it locally

CI builds and publishes **Windows** installers only. The macOS and Linux steps
below are kept so you can build those packages locally.

**Prerequisites**
- [Bun](https://bun.sh) (package manager and runtime)
- [Rust](https://rustup.rs) stable
- **Windows:** [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the C++ workload, plus [WebView2](https://developer.microsoft.com/microsoft-edge/webview2/) (preinstalled on Windows 11)
- **macOS:** Xcode Command Line Tools — `xcode-select --install`
- **Linux:** `sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev libdbus-1-dev libxdo-dev`

**Install dependencies**

```bash
git clone https://github.com/viskar-dev/Oort-Notes.git
cd Oort-Notes

cd apps/frontend
bun install

cd ../desktop
bun install
```

**Desktop app (development)**

```bash
cd apps/desktop
bunx tauri dev
```

**Web UI only**

```bash
bun run --cwd apps/frontend dev
```

**Build installers**

Windows is the only platform built by CI. Local builds still work on macOS and
Linux (run the build on the target OS; Tauri does not cross-compile these
bundles from Windows):

```bash
cd apps/desktop
bunx tauri build
```

- Windows → `target/release/bundle/nsis/*-setup.exe`, `target/release/bundle/msi/*.msi`
- Linux (local build) → `target/release/bundle/deb/*.deb`, `rpm/*.rpm`, `appimage/*.AppImage`
- macOS (local build) → `target/release/bundle/dmg/*.dmg`, `macos/*.app`
- Optional: set `OORT_GOOGLE_CLIENT_ID` before building to bake in the Google Drive OAuth client.

Release builds sign updater artifacts. Without the updater signing key, disable them for a local build:

```bash
bunx tauri build --config '{"bundle":{"createUpdaterArtifacts":false}}'
```

**Tests**

```bash
bun run --cwd apps/frontend test
cargo test -p note-core
```

## Auto-update

- Installed Windows desktops check GitHub Releases at launch and show an update banner in the titlebar.
- Windows release builds are signed with the Tauri updater key; CI produces the updater artifacts.
- Draft releases must be published before clients can see an update.

## Status

- **v0.1.0** — Windows packages. macOS and Linux can be built locally from source. Feedback is welcome via [issues](https://github.com/viskar-dev/Oort-Notes/issues).
- More components and additional release channels are next.
