# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start        # Start dev server (localhost:3000)
npm run build    # Production build → build/
npm test         # Run tests (watch mode)
```

## Architecture

This is a **React 18 command palette** for the Itasca Suite desktop app, embedded in a Qt WebView. The palette lets users search and insert commands from a hierarchical command tree.

### Data flow

1. On mount, `PaletteApp` fetches `public/treedebug.txt` (120MB JSON command tree)
2. `buildIndex()` recursively flattens the tree into `allCommands[]`, adding `searchKey` (full path, lowercase) and `searchTokens` (split on space/dash/underscore) to each node
3. User keystrokes drive one of two search modes:
   - **Palette mode** (default): token-by-token hierarchical navigation via `handleSearchIndex()` — each Space commits a token and narrows the tree level
   - **Filter mode**: full-text substring/token search across `allCommands`, debounced 120ms, capped at 500 results
4. Selecting a row and pressing Enter (or using the context menu) calls a Qt bridge method to insert the command

### Qt bridge integration

`PaletteApp` initializes `QWebChannel` on mount and exposes:
- `window.qtBridge` — object for calling Qt-side methods: `insertAllCommand`, `insertLastCommand`, `showHelpCommand`, `eventCloseFunction`, `setArgValue`
- `window.loadTree(data)` — called by Qt to load a new command tree
- `window.resetTreeUI(data)` — called by Qt to reset UI state

When running outside Qt (e.g., in a browser dev server), the bridge is absent and `treedebug.txt` is loaded directly from `public/`.

### Component hierarchy

```
PaletteApp          ← all state lives here (12 useState hooks)
  TypeOverlay       ← shows current search query string
  ContextMenu       ← right-click menu; flips direction if near viewport edge
  PaletteList       ← forwarded-ref scroll container
    PaletteRow      ← one command row; click to expand or navigate
      ValueEditor   ← shown when row is expanded; renders argument inputs
        ArgumentInput   ← switches on arg.type: select | number | vector | checkbox | text
          VectorInput   ← x/y/z number fields for vector args
```

### Keyboard handling (all in `PaletteApp`)

| Key | Action |
|-----|--------|
| Arrow Up/Down | Move selection |
| Backspace | Delete char or pop last token |
| Space | Commit current token (palette mode) |
| Tab | Autocomplete from selected row |
| Arrow Right | Expand to full path |
| Enter | Insert command via Qt |
| Escape | Close palette |

### Styling

`src/App.css` uses CSS custom properties (`--bg-primary`, `--accent-blue`, etc.) for the light theme. Font stack is JetBrains Mono → Courier New. No CSS framework or preprocessor.
