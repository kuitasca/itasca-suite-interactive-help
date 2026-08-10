import React, { useState, useEffect, useRef, useCallback } from 'react';
import PaletteList from '../components/PaletteList';
import { buildAllCommands } from '../utils/buildIndex';
import { normalizeQtKeyToDomKey, QT_MODIFIERS } from '../utils/qtKeys';

const MAX_RESULTS = 50;
const MAX_FISH_RESULTS = 500;

// Parse a line of text to separate command tokens from argument values
// Handles quoted strings and strips quotes from argument values.
function parseLineOfText(lineOfText, rootNodes) {
  // Parse tokens while respecting quoted strings
  const tokens = [];
  let current = '';
  let inQuotes = false;
  let quoteChar = '';
  
  for (let i = 0; i < lineOfText.length; i++) {
    const char = lineOfText[i];
    
    // Handle quote start/end
    if ((char === "'" || char === '"') && (i === 0 || lineOfText[i-1] !== '\\')) {
      if (!inQuotes) {
        inQuotes = true;
        quoteChar = char;
      } else if (char === quoteChar) {
        inQuotes = false;
        quoteChar = '';
      } else {
        current += char;
      }
    } else if (char === ' ' && !inQuotes) {
      if (current) {
        tokens.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }
  
  if (current) {
    tokens.push(current);
  }
  
  let currentNodes = rootNodes || [];
  const commandTokens = [];
  const preRangeArgValues = [];
  const postRangeArgValues = [];
  let seenRange = false;

  for (const token of tokens) {
    const tokenLower = token.toLowerCase();
    const matched = currentNodes.find(n => {
      const label = ((n.title || n.display) + '').split(' ')[0].toLowerCase();
      return label === tokenLower;
    });
    if (matched) {
      commandTokens.push(token);
      if (tokenLower === 'range') seenRange = true;
      currentNodes = matched.children || [];
    } else {
      (seenRange ? postRangeArgValues : preRangeArgValues).push(token);
    }
  }

  return { commandTokens, preRangeArgValues, postRangeArgValues };
}

const IntelliSenseApp = () => {
  const [allCommands, setAllCommands] = useState([]);
  const [visibleRows, setVisibleRows] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [expandedRows, setExpandedRows] = useState({});
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState('');
  const [isFish, setIsFish] = useState(false);
  const [helpContext, setHelpContext] = useState({ slots: [], groups: [], geometrySets: [], ranges: [] });
  const [extractedArgValues, setExtractedArgValues] = useState(null);
  const [toastMsg, setToastMsg] = useState('');

  // Tree data received once from Qt via window.loadTree
  const commandsTreeRef = useRef(null);
  const fishTreeRef = useRef(null);
  const listRef = useRef(null);
  const bridgeRef = useRef(null);
  const bridgeConnectedRef = useRef(false);
  const visibleRowsRef = useRef(0);
  const allCommandsRef = useRef([]);
  const indexedModeRef = useRef(null);

  // Build flat index from tree data
  const rebuildIndex = useCallback((forFish) => {
    const tree = forFish ? fishTreeRef.current : commandsTreeRef.current;
    const cmds = buildAllCommands(tree?.children);
    setAllCommands(cmds);
    allCommandsRef.current = cmds;
    indexedModeRef.current = forFish ? 'fish' : 'command';
    return cmds;
  }, []);

  // Filter commands by query
  const filterCommands = useCallback((q, commands, fishMode) => {
    const lower = q.trim().toLowerCase();
    let results;

    if (!lower) {
      results = fishMode ? commands : commands.slice(0, MAX_RESULTS);
    } else {
      results = commands.filter(cmd =>
        cmd.searchKey.includes(lower) ||
        cmd.searchTokens.some(t => t.startsWith(lower))
      );
      if (!fishMode) results = results.slice(0, MAX_RESULTS);
    }

    // In fish mode show only leaf names
    if (fishMode) {
      results = results
        .filter(cmd => !cmd.item?.children || cmd.item.children.length === 0)
        .map(cmd => {
          let display = cmd.display.trim().replace(/\s*\([23]d\s+only\)\s*$/, '');
          const parts = display.split(/\s+/);
          let leaf = parts[parts.length - 1] || cmd.display;
          if (cmd.display.includes('(2d only)') || cmd.display.includes('(3d only)')) {
            leaf += cmd.display.includes('(2d only)') ? ' (2d only)' : ' (3d only)';
          }
          return { ...cmd, display: leaf };
        })
        .slice(0, MAX_FISH_RESULTS);
    }

    return results;
  }, []);

  // Apply query → filter → display (DON'T reset expandedRows on every query change)
  useEffect(() => {
    const results = filterCommands(query, allCommands, isFish);
    setVisibleRows(results);
    setSelectedIndex(results.length > 0 ? 0 : -1);
    visibleRowsRef.current = results.length;
  }, [query, allCommands, isFish, filterCommands]);

  useEffect(() => {
    allCommandsRef.current = allCommands;
  }, [allCommands]);

  // Scroll selected into view
  useEffect(() => {
    const list = listRef.current;
    if (!list || selectedIndex < 0) return;
    const items = list.querySelectorAll('li');
    const li = items[selectedIndex];
    if (li) li.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  // Call Qt bridge action (use bridgeRef first, fallback to window.qtBridge)
  const callQt = useCallback((action, arg) => {
    const bridge = bridgeRef.current || window.qtBridge;
    if (bridge && typeof bridge[action] === 'function') {
      bridge[action](arg);
    } else {
      console.warn('IntelliSense: Qt action not available:', action);
    }
  }, []);

  const notifyQtArgsExpanded = useCallback((argCount) => {
    const bridge = bridgeRef.current || window.qtBridge;
    if (!bridge || typeof bridge.intelliSenseArgsExpanded !== 'function') return;
    bridge.intelliSenseArgsExpanded(Math.max(0, Number(argCount) || 0));
  }, []);

  // Tell Qt to hide the popup widget after insert
  const dismissPopup = useCallback(() => {
    setVisible(false);
    setQuery('');
    setExpandedRows({});
    const bridge = bridgeRef.current || window.qtBridge;
    if (bridge && typeof bridge.eventCloseIntellisenseFunction === 'function') {
      bridge.eventCloseIntellisenseFunction();
    }
  }, []);

  // 3. Insert command WITH filled arg values (same logic as PaletteApp's callQt2)
  const insertCommandWithArgs = useCallback((row) => {
    const item = row?.item;
    if (!item) return;

    const fullCommand = row.pathString || row.label || '';
    const labelTokens = fullCommand.split(/\s+/).filter(Boolean);
    const rangeIdx = labelTokens.indexOf('range');
    const commandNames = rangeIdx === -1 ? labelTokens : labelTokens.slice(0, rangeIdx);
    const labelRangeTokens = rangeIdx === -1 ? [] : labelTokens.slice(rangeIdx);

    const argDefs = Array.isArray(row.args) ? row.args : [];
    const display = row.display || '';

    const rangeDisplayMatch = display.match(/\brange\b/);
    const rangeDisplayPos = rangeDisplayMatch ? rangeDisplayMatch.index : Infinity;

    const sorted = argDefs
      .map((arg, originalIndex) => {
        const pos = display.indexOf(arg.name);
        return { arg, originalIndex, pos: pos === -1 ? Infinity : pos };
      })
      .sort((a, b) => a.pos - b.pos);

    const preRangeTokens = [];
    const postRangeTokens = [];

    sorted.forEach(({ arg, originalIndex: argIndex }) => {
      let value = '';
      if (arg.type === 'vector') {
        const x = document.getElementById(`${item.id}_${argIndex}_${arg.name}_x`)?.value ?? '';
        const y = document.getElementById(`${item.id}_${argIndex}_${arg.name}_y`)?.value ?? '';
        const z = document.getElementById(`${item.id}_${argIndex}_${arg.name}_z`)?.value ?? '';
        value = [x, y, z].filter(Boolean).join(',');
      } else {
        const el = document.getElementById(`${item.id}_${argIndex}_${arg.name}_0`);
        if (el) value = el.type === 'checkbox' ? (el.checked ? 'true' : 'false') : (el.value ?? '');
      }
      if (!value) return;
      const noQuotes = arg.type === 'int' || arg.type === 'float' || arg.type === 'vector' || arg.type === 'bool';
      const token = arg.type === 'namedRange' ? `range '${value}'` : (noQuotes ? value : `'${value}'`);
      const argPos = display.indexOf(arg.name);
      if (argPos !== -1 && argPos > rangeDisplayPos) {
        postRangeTokens.push(token);
      } else {
        preRangeTokens.push(token);
      }
    });

    const command = [...commandNames, ...preRangeTokens, ...labelRangeTokens, ...postRangeTokens].join(' ');
    callQt('insertAllCommand', command);
    dismissPopup();
  }, [callQt, dismissPopup]);

  // Simple insert (no args)
  const insertCommand = useCallback((row) => {
    const command = row.pathString || row.label || '';
    callQt('insertAllCommand', command);
    dismissPopup();
  }, [callQt, dismissPopup]);

  // Send query to Rosie via Qt bridge (fetch runs in Rosie's WebEngine)
  const askRosie = useCallback((row) => {
    const query = row?.pathString || row?.label || '';
    if (!query.trim()) return;
    callQt('askRosie', query);
    setToastMsg('Sent to Rosie');
    setTimeout(() => setToastMsg(''), 1500);
  }, [callQt]);

  // Keyboard handler
  const handleKey = useCallback((text, key, modifiers, autoRepeat) => {
    const domKey = normalizeQtKeyToDomKey(text, key);
    if (!domKey) return;

    const ctrl = !!(modifiers & QT_MODIFIERS.CTRL);

    // Ctrl+Space is reserved for the full palette widget — ignore here
    if (ctrl && domKey === ' ') return;
    // Ignore all ctrl/alt/meta combos
    if (ctrl || !!(modifiers & QT_MODIFIERS.ALT) || !!(modifiers & QT_MODIFIERS.META)) return;

    if (domKey === 'Escape') {
      setVisible(false);
      setQuery('');
      setExpandedRows({});
      return;
    }

    if (domKey === 'ArrowDown') {
      setSelectedIndex(prev => prev < visibleRows.length - 1 ? prev + 1 : prev);
      return; 
    }

    if (domKey === 'ArrowUp') {
      setSelectedIndex(prev => prev > 0 ? prev - 1 : prev);
      return;
    }

    if (domKey === 'Enter') {
      if (selectedIndex >= 0 && visibleRows[selectedIndex]) {
        const row = visibleRows[selectedIndex];
        const hasArgs = Array.isArray(row.args) && row.args.length > 0;
        if (hasArgs && !expandedRows[selectedIndex]) {
          // Expand to show parameters
          notifyQtArgsExpanded(row.args.length);
          setExpandedRows(prev => ({ ...prev, [selectedIndex]: true }));
        } else {
          // Insert with args if expanded, simple insert if no args
          if (expandedRows[selectedIndex]) {
            insertCommandWithArgs(row);
          } else {
            insertCommand(row);
          }
        }
      }
      return;
    }

    if (domKey === 'Backspace') {
      setQuery(prev => {
        const next = prev.slice(0, -1);
        if (!next) setVisible(false);
        return next;
      });
      return;
    }

    // Space appends to query (does NOT clear/reset)
    if (domKey === ' ') {
      setQuery(prev => prev.length > 0 ? prev + ' ' : prev);
      return;
    }

    // Printable character
    if (domKey.length === 1) {
      setQuery(prev => prev + domKey.toLowerCase());
      if (!visible) setVisible(true);
    }
  }, [visible, visibleRows, selectedIndex, expandedRows, insertCommand, insertCommandWithArgs, notifyQtArgsExpanded]);

  // Keep latest handler in ref for Qt signal
  const handleKeyRef = useRef(handleKey);
  useEffect(() => { handleKeyRef.current = handleKey; }, [handleKey]);

  // Qt bridge + global API setup (runs once)
  useEffect(() => {
    // Expose global API for Qt
    window.loadTree = (datacommand, datafish) => {
      commandsTreeRef.current = datacommand;
      fishTreeRef.current = datafish;
    };

    // showIntelliSense: called from Qt on every keypress with the full line text.
    window.showIntelliSense = (lineOfText, fishMode, context) => {
      const nextIsFish = !!fishMode;
      const modeKey = nextIsFish ? 'fish' : 'command';
      setIsFish(nextIsFish);
      if (context && typeof context === 'object') {
        setHelpContext(prev => ({ ...prev, ...context }));
      }
      // In fish mode show the full flat list regardless of line content
      const nextQuery = nextIsFish ? '' : (lineOfText || '').trim();
      setQuery(nextQuery);
      setVisible(true);

      // Build/reuse the index for the active mode, then compute row count immediately.
      let commands = allCommandsRef.current;
      const tree = nextIsFish ? fishTreeRef.current : commandsTreeRef.current;
      if (indexedModeRef.current !== modeKey || !Array.isArray(commands) || commands.length === 0) {
        commands = rebuildIndex(nextIsFish);
      }

      // Parse line of text to extract argument values for prefilling in value editor
      const rootNodes = tree?.children;
      const { commandTokens, preRangeArgValues, postRangeArgValues } = parseLineOfText(lineOfText, rootNodes);
      const hasArgValues = preRangeArgValues.length > 0 || postRangeArgValues.length > 0;
      if (hasArgValues) {
        setExtractedArgValues({ preRange: preRangeArgValues, postRange: postRangeArgValues });
      } else {
        setExtractedArgValues(null);
      }

      // Use only command tokens for filtering (strip arg values from search)
      const filterQuery = hasArgValues ? commandTokens.join(' ') : nextQuery;
      const results = filterCommands(filterQuery, commands, nextIsFish);
      visibleRowsRef.current = results.length;
      setVisibleRows(results);
      setSelectedIndex(results.length > 0 ? 0 : -1);
      return results.length;
    };

    window.hideIntelliSense = () => {
      setVisible(false);
      setQuery('');
      setExpandedRows({});
      setExtractedArgValues(null);
    };

    // Returns the count of visible rows (used by Qt to resize the popup)
    window.getIntelliSenseRowCount = () => {
      return visibleRowsRef.current;
    };

    window.handleQtKey = (text, key, modifiers, autoRepeat) => {
      handleKeyRef.current(text, key, modifiers, autoRepeat);
    };

    // Init Qt bridge
    const tryBridge = () => {
      if (bridgeConnectedRef.current) return;
      if (!window.QWebChannel || !window.qt?.webChannelTransport) return;

      new window.QWebChannel(window.qt.webChannelTransport, (channel) => {
        const bridge = channel.objects?.qtBridge;
        if (!bridge) return;

        bridgeRef.current = bridge;
        bridgeConnectedRef.current = true;
        window.qtBridge = bridge;

        if (bridge.debugFromJs) bridge.debugFromJs('intellisense ok');

        if (bridge.editorKeyPressedRequested?.connect) {
          bridge.editorKeyPressedRequested.connect((text, key, mods, repeat) => {
            handleKeyRef.current(text, key, mods, repeat);
          });
        }
      });
    };

    tryBridge();
    const timer = setInterval(tryBridge, 300);

    // Signal to Qt that the JS API is ready
    window.intellisenseReady = true;

    // Hide when page becomes hidden (parent minimized)
    const handleVisibility = () => {
      if (document.hidden) {
        setVisible(false);
        setQuery('');
        setExpandedRows({});
        setExtractedArgValues(null);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [rebuildIndex, filterCommands]);

  if (!visible) return null;

  return (
    <div className="intellisense-app">
      {isFish ? (
        <input
          className="intellisense-query intellisense-query-input"
          value={query}
          placeholder="Type to filter…"
          onChange={e => setQuery(e.target.value)}
          autoFocus
        />
      ) : (
        <div className="intellisense-query">
          {query || 'Type to filter…'}
        </div>
      )}
      {visibleRows.length === 0 ? (
        <div className="intellisense-no-results">No suggestions</div>
      ) : (
      <PaletteList
        ref={listRef}
        visibleRows={visibleRows}
        selectedIndex={selectedIndex}
        expandedRows={expandedRows}
        onToggleExpand={() => {}}
        onSelectRow={(index) => setSelectedIndex(index)}
        onContextMenu={() => {}}
        onRowClick={(row, index) => {
          setSelectedIndex(index);
          const hasArgs = Array.isArray(row.args) && row.args.length > 0;
          const isExpanded = !!expandedRows[index];
          if (hasArgs && !isExpanded) {
            // 1. First click expands to show args
            notifyQtArgsExpanded(row.args.length);
            setExpandedRows(prev => ({ ...prev, [index]: true }));
          } else if (hasArgs && isExpanded) {
            // 1. Second click (already expanded) inserts with args
            insertCommandWithArgs(row);
          } else {
            // No args — insert directly
            insertCommand(row);
          }
        }}
        onInsertAll={(row) => {
          // Insert button (➢): if expanded read args, otherwise insert plain
          if (expandedRows[visibleRows.indexOf(row)]) {
            insertCommandWithArgs(row);
          } else {
            insertCommand(row);
          }
        }}
        onShowHelp={(row) => callQt('showHelpCommand', row?.item?.id)}
        onAskRosie={askRosie}
        helpContext={helpContext}
        extractedArgValues={extractedArgValues}
      />
      )}
      {toastMsg && <div className="intellisense-toast">{toastMsg}</div>}
    </div>
  );
};

export default IntelliSenseApp;
