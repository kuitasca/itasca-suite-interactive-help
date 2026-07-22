import React, { useState, useEffect, useRef, useCallback } from 'react';
import PaletteList from '../components/PaletteList';
import { buildAllCommands } from '../utils/buildIndex';
import { normalizeQtKeyToDomKey, QT_MODIFIERS } from '../utils/qtKeys';

const MAX_RESULTS = 50;

const IntelliSenseApp = () => {
  const [allCommands, setAllCommands] = useState([]);
  const [visibleRows, setVisibleRows] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [expandedRows, setExpandedRows] = useState({});
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState('');
  const [isFish, setIsFish] = useState(false);
  const [helpContext, setHelpContext] = useState({ slots: [], groups: [], geometrySets: [], ranges: [] });

  // Tree data received once from Qt via window.loadTree
  const commandsTreeRef = useRef(null);
  const fishTreeRef = useRef(null);
  const listRef = useRef(null);
  const bridgeRef = useRef(null);
  const bridgeConnectedRef = useRef(false);

  // Build flat index from tree data
  const rebuildIndex = useCallback((forFish) => {
    const tree = forFish ? fishTreeRef.current : commandsTreeRef.current;
    const cmds = buildAllCommands(tree?.children);
    setAllCommands(cmds);
    return cmds;
  }, []);

  // Filter commands by query
  const filterCommands = useCallback((q, commands, fishMode) => {
    const lower = q.trim().toLowerCase();
    let results;

    if (!lower) {
      results = commands.slice(0, MAX_RESULTS);
    } else {
      results = commands.filter(cmd =>
        cmd.searchKey.includes(lower) ||
        cmd.searchTokens.some(t => t.startsWith(lower))
      ).slice(0, MAX_RESULTS);
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
        });
    }

    return results;
  }, []);

  // Apply query → filter → display (DON'T reset expandedRows on every query change)
  useEffect(() => {
    const results = filterCommands(query, allCommands, isFish);
    setVisibleRows(results);
    setSelectedIndex(results.length > 0 ? 0 : -1);
  }, [query, allCommands, isFish, filterCommands]);

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

  // Tell Qt to hide the popup widget after insert
  const dismissPopup = useCallback(() => {
    setVisible(false);
    setQuery('');
    setExpandedRows({});
    const bridge = bridgeRef.current || window.qtBridge;
    if (bridge && typeof bridge.eventCloseFunction === 'function') {
      bridge.eventCloseFunction();
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
      const token = arg.type === 'namedRange' ? `range ${value}` : value;
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
  }, [visible, visibleRows, selectedIndex, expandedRows, insertCommand, insertCommandWithArgs]);

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

    // showIntelliSense: only call this on FIRST show or context change,
    // NOT on every keypress (Qt should guard this)
    window.showIntelliSense = (lineOfText, fishMode, context) => {
      setIsFish(!!fishMode);
      if (context && typeof context === 'object') {
        setHelpContext(prev => ({ ...prev, ...context }));
      }
      // Extract last token from the current line as initial query
      const tokens = (lineOfText || '').trim().split(/\s+/).filter(Boolean);
      const lastToken = tokens[tokens.length - 1] || '';
      setQuery(lastToken);
      setVisible(true);
      setExpandedRows({});

      // Rebuild index for the right tree
      const tree = fishMode ? fishTreeRef.current : commandsTreeRef.current;
      const cmds = buildAllCommands(tree?.children);
      setAllCommands(cmds);
    };

    window.hideIntelliSense = () => {
      setVisible(false);
      setQuery('');
      setExpandedRows({});
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
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [rebuildIndex]);

  if (!visible || visibleRows.length === 0) return null;

  return (
    <div className="intellisense-app">
      <div className="intellisense-query">
        {query || 'Type to filter…'}
      </div>
      <PaletteList
        ref={listRef}
        visibleRows={visibleRows}
        selectedIndex={selectedIndex}
        expandedRows={expandedRows}
        onToggleExpand={(idx) => setExpandedRows(prev => ({ ...prev, [idx]: !prev[idx] }))}
        onSelectRow={(index) => setSelectedIndex(index)}
        onContextMenu={() => {}}
        onRowClick={(row, index) => {
          setSelectedIndex(index);
          const hasArgs = Array.isArray(row.args) && row.args.length > 0;
          const isExpanded = !!expandedRows[index];
          if (hasArgs && !isExpanded) {
            // 1. First click expands to show args
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
        helpContext={helpContext}
      />
    </div>
  );
};

export default IntelliSenseApp;
