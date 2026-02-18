# Interactive Help - React App

This is a React conversion of the original `help.html` interactive help palette system. 

## Features

- **Search & Filter Palette**: Type to search and filter through commands hierarchically
- **Interactive Command List**: Click on commands to expand and view/edit arguments
- **Value Editors**: Different input types for command arguments:
  - Numbers (int/float)
  - Dropdowns (groups, slots, geometry sets)
  - Vectors (x, y, z inputs)
  - Checkboxes (boolean)
  - Text inputs
- **Repeatable Arguments**: Add/remove repeated argument instances
- **Keyboard Navigation & Mouse Interaction**: 
  - Arrow keys to navigate (selection follows highlight)
  - Enter to insert the currently selected command via Qt
  - Backspace to go back
  - Space to commit tokens
  - Tab for autocomplete
  - Clicking a command filters the palette and toggles its value editor
- **Context Menu**: Right-click for insert options
- **Type Overlay**: Visual feedback of current search query

## Project Structure

```
React/
├── public/
│   └── index.html           # HTML entry point
├── src/
│   ├── components/
│   │   ├── PaletteApp.js    # Main app component
│   │   ├── PaletteList.js   # List container
│   │   ├── PaletteRow.js    # Individual row
│   │   ├── ValueEditor.js   # Value editing interface
│   │   ├── ArgumentInput.js # Individual argument input
│   │   ├── VectorInput.js   # Vector (x,y,z) input
│   │   ├── ContextMenu.js   # Right-click menu
│   │   └── TypeOverlay.js   # Search query display
│   ├── utils/
│   │   └── parseArgs.js     # Argument parsing logic
│   ├── App.js               # App wrapper
│   ├── App.css              # Styles
│   ├── index.js             # React entry point
│   └── index.css            # Base styles
├── package.json
└── README.md
```

## Installation & Setup

1. Navigate to the React folder:
```bash
cd React
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm start
```

4. The app will open at `http://localhost:3000`

## Usage

1. Place `treedebug.txt` in the React folder with your command tree data
2. Start the app - it will auto-load the debug data
3. Type to search for commands
4. Use arrow keys to navigate results
5. Press Enter to insert a command, or click to expand and edit arguments
6. Right-click for context menu options

## Building for Production

```bash
npm run build
```

This creates an optimized production build in the `build/` folder.

## Qt Bridge Integration

This React version includes full support for the Qt WebChannel API.

- The `qrc:///qtwebchannel/qwebchannel.js` script is injected in `public/index.html`.
- `PaletteApp` initializes the channel on mount and stores the bridge in a ref (`qtBridgeRef`).
- For convenience `window.qtBridge` also points to the same object so any component can invoke it.
- When argument inputs change the `ValueEditor` automatically calls `window.qtBridge.setArgValue()`.
- Keyboard `Enter`, context menu entries and other actions call Qt through helper `callQt()`.

Global functions exposed for the Qt side:

- `window.loadTree(data)` – pass the JSON tree from Qt to the React app
- `window.resetTreeUI()` – clear filters and selection (useful after data reload)

Example Qt usage:

```cpp
// from C++/Python code in the Qt host application:
engine->rootContext()->setContextProperty("qtBridge", &bridgeObject);
webView->setUrl("qrc:/index.html");
...
// later:
webView->page()->runJavaScript("window.loadTree(" + jsonString + ")");
```

These hooks mirror the behaviour of the original help.html but fit naturally into React's state model.

## Notes

- The app uses React Hooks for state management
- Keyboard navigation and search logic mirror the original HTML implementation
- Styles are preserved from the original CSS
- All original functionality has been transformed to React component architecture
