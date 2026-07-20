import React, { useState, useEffect, useRef, useCallback } from 'react';
import PaletteList from '../components/PaletteList';
import { buildAllCommands } from '../utils/buildIndex';
import { normalizeQtKeyToDomKey } from '../utils/qtKeys';

const MAX_RESULTS = 50;

const IntelliSenseApp = () => {
  const [allCommands, setAllCommands] = useState([]);
  const [visibleRows, setVisibleRows] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [expandedRows, setExpandedRows] = useState({});
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState('');
  const [isFish, setIsFish] = useState(false);

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

  // Apply query → filter → display
  useEffect(() => {
    const results = filterCommands(query, allCommands, isFish);
    setVisibleRows(results);
    setSelectedIndex(results.length > 0 ? 0 : -1);
    setExpandedRows({});
  }, [query, allCommands, isFish, filterCommands]);

  // Scroll selected into view
  useEffect(() => {
    const list = listRef.current;
    if (!list || selectedIndex < 0) return;
    const items = list.querySelectorAll('li');
    const li = items[selectedIndex];
    if (li) li.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  // Call Qt bridge action
  const callQt = useCallback((action, arg) => {
    const bridge = bridgeRef.current;
    if (bridge && typeof bridge[action] === 'function') {
      bridge[action](arg);
    }
  }, []);

  // Insert the selected command
  const insertCommand = useCallback((row) => {
    const command = row.pathString || row.label || '';
    callQt('insertAllCommand', command);
    setVisible(false);
    setQuery('');
  }, [callQt]);

  // Keyboard handler
  const handleKey = useCallback((text, key, modifiers, autoRepeat) => {
    const domKey = normalizeQtKeyToDomKey(text, key);
    if (!domKey) return;

    if (domKey === 'Escape') {
      setVisible(false);
      setQuery('');
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
        insertCommand(visibleRows[selectedIndex]);
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

    // Printable character
    if (domKey.length === 1) {
      setQuery(prev => prev + domKey.toLowerCase());
      if (!visible) setVisible(true);
    }
  }, [visible, visibleRows, selectedIndex, insertCommand]);

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

    window.showIntelliSense = (lineOfText, fishMode) => {
      setIsFish(!!fishMode);
      // Extract last token from the current line as initial query
      const tokens = (lineOfText || '').trim().split(/\s+/).filter(Boolean);
      const lastToken = tokens[tokens.length - 1] || '';
      setQuery(lastToken);
      setVisible(true);

      // Rebuild index for the right tree
      const tree = fishMode ? fishTreeRef.current : commandsTreeRef.current;
      const cmds = buildAllCommands(tree?.children);
      setAllCommands(cmds);
    };

    window.hideIntelliSense = () => {
      setVisible(false);
      setQuery('');
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

    return () => clearInterval(timer);
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
          insertCommand(row);
        }}
        onInsertAll={(row) => insertCommand(row)}
        helpContext={{ slots: [], groups: [], geometrySets: [], ranges: [] }}
      />
    </div>
  );
};

export default IntelliSenseApp;
