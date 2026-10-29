<div align="center">

# 🪐 Oort Notes

**A canvas notebook that thinks like an IDE and teaches like a tutor.**

Whiteboards are great for systems design. Notebooks are great for learning.
Oort Notes is both — a **finite, paginated canvas** with **real components** (code
blocks, equation cards, callout cards, tables, SVG diagrams) and an **AI toolbox**
that can read and edit your whole canvas.

[![Downloads](https://img.shields.io/badge/⬇_Windows_Setup.exe-blueviolet?style=for-the-badge&logo=color&logoColor=white)](releases/pre-release/Oort-Notes-0.1.0-x64-setup.exe)
[![Downloads](https://img.shields.io/badge/⬇_Windows_Installer_.msi-blue?style=for-the-badge&logo=windows&logoColor=white)](releases/pre-release/Oort-Notes-0.1.0-x64.msi)

**Pre‑release `v0.1.0`** — test-drive it. Official release coming soon.

</div>

---

## 🤔 Why Oort Notes?

There are excellent canvas apps out there — Excalidraw, tldraw, Miro and many
more. They are wonderful *drawing* tools. But for **studying and note-taking**,
every one of them falls short:

- **No real note keeping.** A whiteboard is one endless scroll of nothing:
  no notebooks, no chapters, no pages — content drowns in an infinite void.
- **Content as pictures, not components.** Paste code into Excalidraw and you
  get decorative text, not a syntax-highlighted, editable code block. Tables,
  equations and callouts are all just… shapes.

- **Infinite canvas everywhere.** Great for brainstorming, terrible for
  reading. You can never say "this is page 3", print it, or scroll through it
  like a document.

So I built my own: a canvas with **pages you can paginate**, **components that
behave like real widgets**, and an **AI that manipulates the canvas with you**.

---

## ✨ Features

### 📒 Notebooks, chapters, finite canvas
- ** notebooks → chapters → topics **: your notes finally have structure —
  a notebook per subject, a chapter per lecture, a topic per page.
- **Finite canvas with pagination** — every topic is a fixed-height sheet
  stacked like a PDF viewer. Scroll wheel pans smoothly sheet-to-sheet while
  the active page chip follows you. Zooming, drawing, connecting still works.

- The classic shapes are all there: sticky notes, text, geo shapes and
  arrows/connector lines.

### 🧩 First-class components
- **Code blocks** — real editable code, syntax-highlighted by
  [Shiki](https://shiki.style) across 13 languages + plain text, growing with
  content or fixed with a manual height.
- **Equation cards (KaTeX)** — inline `$…$` / display `$$…$$` LaTeX anywhere in
  text, or dedicated equation cards. Paste multi-line formulas from ChatGPT,
  docs or your own LaTeX and they render intact — unfinished or malformed
  LaTeX just stays as text.

- **Callout cards** — note / info / tip / success / warning / danger variants
  with icons, badges, tinting and collapse.
- **Tables** — paste GitHub-flavored markdown and it becomes an editable table;
  per-row/per-column alignment and draggable column widths.

- **SVG diagrams** — generated or hand-pasted SVG lands as a proper shape.
- **Icon finder** — search thousands of Iconify icons, served by the app core
  (works without the note server running).

### 🤖 AI that works on the canvas
- **Assistant chat** with streaming answers, markdown and diagrams rendered
  in the window.
- **Anchored canvas prompt** — select shapes (or right-click the canvas), ask,
  and a floating card stays at the anchor while it works: loading spinner
  while the turn runs, toast on failure, results land in the assistant window.

- **18 canvas tools** — the AI can read your canvas (`get_canvas`,
  `get_selection`, screenshots…) and write it: create notes, text, tables,
  code blocks, equation cards, callout cards, SVG diagrams, icon shapes,
  structural shapes, pages; update, delete, convert selections to other
  types, frame the viewport.
- **Shimmer previews** — while the AI works, a violet shimmer "forming here"
  card previews each creation at its real aspect ratio, and selected shapes
  shimmer **on the shapes themselves** while they're being edited in place.

- **Safe by design** — view mode blocks all AI mutation; destructive actions
  require a confirmation step; the API key lives in your OS keyring.
- **MCP server per canvas** — connect an external MCP client to your canvas
  and drive it programmatically (token auth, built-in token rotation).

### ☁️ Backup & documents
- **Google Drive backup** — connect once; the app keeps a single
  always-latest archive of everything in a hidden Drive app-data folder.
  Configure from the UI (the desktop OAuth client is baked into official
  builds) or schedule it.
- **Import/export** — restore from a backup archive at any time.
- **PDF export** of chapter content.

### 🌙 Desktop app polish
- App-wide dark theme, custom violet branding, overlay titlebar window
  chrome, self-healing UI states.
- **Local-first**: everything lives in a local SQLite database — the canvas
  content never needs to leave your machine unless you connect Drive backup.

---

## 🏗 Architecture

Oort Notes is a Tauri 2 desktop app — a Rust core with a web-frontend UI.

```
┌────────────────────────────────────────────────────────────┐
│                    apps/desktop  (Tauri 2)                 │
│   window management, SQLite (oort.db), AI turn runner,     │
│   canvas MCP server, OS-keyring secrets, icon commands     │
├────────────────────────────────────────────────────────────┤
│                   packages/core  (Rust)                    │
│   note-core: SQL repository layer, Google Drive client     │
│   (OAuth PKCE + refresh), iconify proxy with cache,        │
│   error types shared with all commands                     │
├────────────────────────────────────────────────────────────┤
│                  apps/frontend  (Web)                      │
│   React + tldraw canvas: pages, shapes, math/KaTeX,        │
│   code blocks/tables/cards, AI bridge, ghost shimmer,      │
│   assistant window, backup UI, settings                    │
└────────────────────────────────────────────────────────────┘
        │
        ▼ optional
   apps/server — the web/e2e sibling (HTTP API, icon fallback)
```

**How the AI works end-to-end:** the frontend builds the AI's "eyeballs"
(canvas outlines of every shape), sends it through the desktop AI runner
(streaming chat), and executes returned tool calls against the live tldraw
editor with ghost-previews and confirmations. The same tool registry is
exposed as an MCP server for external clients.

**Storage:** one SQLite database holds notebooks/chapters/topics, the canvas
store snapshots (per chapter), settings and backup state. Passing an
`OORT_GOOGLE_CLIENT_ID` at compile time bakes the OAuth desktop client into
the binary so end users never configure anything.

---

## 🚀 Run it on your system

### Prerequisites
- [Bun](https://bun.sh) (JS runner/package manager)
- [Rust](https://rustup.rs) with `stable` toolchain, and on Windows the
  **MSVC build tools** (via Visual Studio Build Tools)
- [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) runtime (pre-installed on Windows 11)

### Development
```bash
git clone https://github.com/viskar-dev/Oort-Notes.git
cd Oort-Notes
bun install

# desktop dev — builds frontend + core + desktop and opens the app
cd apps/desktop
bunx tauri dev
```

For the web frontend only:
```bash
bun run --cwd apps/frontend dev
```

### Building installers (Windows)
```bash
cd apps/desktop
# optional: bake your Google OAuth desktop client id in
#   (create a "Desktop app" OAuth credential in Google Cloud Console)
set OORT_GOOGLE_CLIENT_ID=....apps.googleusercontent.com
bunx tauri build
```
Outputs:
- `target/release/bundle/nsis/*-setup.exe` — installer
- `target/release/bundle/msi/*.msi` — MSI package

### Tests
```bash
bunx vitest run          # frontend (in apps/frontend)
cargo test -p note-core  # core unit/integration tests
```

---

## 📜 Status

**Pre-release `0.1.0` is available for testing** (buttons at the top). The
official version is coming soon — expect polish, more components and stable
release channels. Issues and feedback are very welcome.
