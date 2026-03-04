import React, { useState, useEffect, useRef, useCallback } from 'react';
import PaletteList from './PaletteList';
import ContextMenu from './ContextMenu';
import TypeOverlay from './TypeOverlay';
// parseArgsFromTitle is deprecated, inputs are sent as part of the data

const PaletteApp = () => {
  const [treeData, setTreeData] = useState(null);
  const [allCommands, setAllCommands] = useState([]);
  const [visibleRows, setVisibleRows] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [currentTokenFilter, setCurrentTokenFilter] = useState('');
  const [tokensFilter, setTokensFilter] = useState([]);
  const [mode, setMode] = useState('palette');
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, node: null });
  const [selectedRow, setSelectedRow] = useState(null);
  const [helpContext, setHelpContext] = useState({ slots: [], groups: [], geometrySets: [] });
  const [expandedRows, setExpandedRows] = useState({});

  const paletteListRef = useRef(null);
  //TODO - we should ideally have a more robust way to ensure qtBridge is ready before calling, rather than just checking if the method exists at call time. Maybe a promise-based initialization or an event system.
  const qtBridgeRef = useRef(null); // to hold reference to Qt bridge object once initialized
  // Parse command tree and build index
  const buildIndex = useCallback((node, path = []) => {
    if (!node?.title) return [];

    // new JSON structure passes argument descriptions directly
    const args = Array.isArray(node.inputs) ? node.inputs : [];
    // `label` is the search token (first word of title), `display` is full shown title
    const label = (node.title || node.display).split(' ')[0];
    const display = node.display || node.title;

    const nextPath = [...path, label];

    let commands = [];

    if (!node.children || node.children.length === 0) {
      commands.push({
        label,
        display,
        path: nextPath,
        pathString: nextPath.join(' '),
        args,
        item: node
      });
    }

    if (node.children) {
      for (const child of node.children) {
        commands = [...commands, ...buildIndex(child, nextPath)];
      }
    }

    return commands;
  }, []);

  // Load tree data
  const handleLoadTree = useCallback((data) => {
    setTreeData(data.children);
    setHelpContext({
      slots: Array.isArray(data.slots) ? data.slots : [],
      groups: Array.isArray(data.groups) ? data.groups : [],
      geometrySets: Array.isArray(data.geometrySets) ? data.geometrySets : []
    });

    let commands = [];
    if (data.children) {
      for (const node of data.children) {
        commands = [...commands, ...buildIndex(node)];
      }
    }

    setAllCommands(commands);
    handleSearchIndex('');
  }, [buildIndex]);

  // Search index
  const handleSearchIndex = useCallback((query) => {
    const tokens = query.trim() ? query.toLowerCase().split(/\s+/) : [];

    let results = [];

    const getLabel = (n) => ((n.title || n.display) + '').split(' ')[0];
    const getDisplay = (n) => n.display || n.title || '';

    if (tokens.length === 0) {
      if (treeData) {
        results = treeData.map(node => ({
          // label used for search, display used for UI
          label: getLabel(node),
          display: getDisplay(node),
          item: node
        }));
      }
    } else {
      let currentNodes = treeData || [];
      let path = [];

      for (let i = 0; i < tokens.length - 1; i++) {
        const token = tokens[i];
        const found = currentNodes.find(n =>
          getLabel(n).toLowerCase().startsWith(token)
        );

        if (!found) {
          currentNodes = [];
          break;
        }

        // keep path entries as the node's label (search tokens)
        path.push(getLabel(found));
        currentNodes = found.children || [];
      }

      const lastToken = tokens[tokens.length - 1];
      const levelMatches = currentNodes.filter(n =>
        getLabel(n).toLowerCase().startsWith(lastToken)
      );

      for (const node of levelMatches) {
        const name = getLabel(node);
        const fullPath = [...path, name].join(' ');

        results.push({
          label: fullPath,
          display: getDisplay(node),
          item: node
        });

        if (node.children?.length) {
          for (const child of node.children) {
            const childName = getLabel(child);
            results.push({
              label: [...path, name, childName].join(' '),
              display: getDisplay(child),
              item: child
            });
          }
        }
      }
    }

    setVisibleRows(results);
    const newIndex = results.length > 0 ? 0 : -1;
    setSelectedIndex(newIndex);
    setSelectedRow(newIndex >= 0 ? results[0] : null);
  }, [treeData]);

  // Helpers
  const clearSelection = useCallback(() => {
    setSelectedRow(null);
    setSelectedIndex(-1);
    setExpandedRows({});
  }, []);

  const callQt = useCallback((action, itemId) => {
    if (!itemId) return;
    const bridge = qtBridgeRef.current;
    if (bridge && typeof bridge[action] === 'function') {
      bridge[action](itemId);
    } else {
      console.warn('Qt action not available:', action);
    }
  }, []);

  const updateOverlayAndSearch = useCallback((commandText) => {
    setTokensFilter(commandText.split(' ').filter(Boolean));
    setCurrentTokenFilter('');
  }, []);
  
  const goUpOneLevel = useCallback(() => {
    // build current full query from tokens
    const full = [...tokensFilter, currentTokenFilter].join(' ').trim();
    if (!full) return;
    const parts = full.split(/\s+/);
    if (parts.length <= 1) return; // already at root

    parts.pop(); // remove last token

    clearSelection();
    updateOverlayAndSearch(parts.join(' '));
  }, [tokensFilter, currentTokenFilter, clearSelection, updateOverlayAndSearch]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setCurrentTokenFilter('');
        setTokensFilter([]);
        handleSearchIndex('');
        e.preventDefault();
        return;
      }

      const el = e.target;
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement ||
        el.isContentEditable
      ) {
        return;
      }

      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === 'Backspace') {
        if (currentTokenFilter.length > 0) {
          setCurrentTokenFilter(prev => prev.slice(0, -1));
        } else if (tokensFilter.length > 0) {
          setTokensFilter(prev => prev.slice(0, -1));
          setCurrentTokenFilter(prev => tokensFilter[tokensFilter.length - 1] || '');
        }
        e.preventDefault();
        return;
      }

      if (e.key === ' ') {
        if (currentTokenFilter.length > 0) {
          setTokensFilter(prev => [...prev, currentTokenFilter]);
          setCurrentTokenFilter('');
        }
        e.preventDefault();
        return;
      }

      if (e.key === 'Tab') {
        if (selectedIndex >= 0 && visibleRows[selectedIndex]) {
          const fullPath = visibleRows[selectedIndex].label;
          const pathTokens = fullPath.split(' ');
          setTokensFilter(pathTokens.slice(0, pathTokens.length - 1));
          setCurrentTokenFilter(pathTokens[pathTokens.length - 1]);
        }
        e.preventDefault();
        return;
      }

      if (e.key === 'ArrowRight') {
        if (selectedIndex >= 0 && visibleRows[selectedIndex]) {
          const fullPath = visibleRows[selectedIndex].label;
          setTokensFilter(fullPath.split(' '));
          setCurrentTokenFilter('');
        }
        e.preventDefault();
        return;
      }

      if (e.key === 'ArrowDown') {
        setSelectedIndex(prev =>
          prev < visibleRows.length - 1 ? prev + 1 : prev
        );
        e.preventDefault();
        return;
      }

      if (e.key === 'ArrowUp') {
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : prev));
        e.preventDefault();
        return;
      }

      if (e.key === 'Enter') {
        if (selectedIndex >= 0) {
          const row = visibleRows[selectedIndex];
          if (row) {
            callQt('insertAllCommand', row.item?.id);
          }
        }
        e.preventDefault();
        return;
      }

      if (e.key.length === 1) {
        if (mode !== 'palette') {
          setMode('palette');
        }
        setCurrentTokenFilter(prev => prev + e.key.toLowerCase());
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentTokenFilter, tokensFilter, selectedIndex, visibleRows, mode, handleSearchIndex]);

  // Update search index when query changes
  useEffect(() => {
    const fullQuery = [...tokensFilter, currentTokenFilter].join(' ').trim();
    handleSearchIndex(fullQuery);
  }, [tokensFilter, currentTokenFilter, handleSearchIndex]);

  // scroll selected row into view when it changes
  useEffect(() => {
    const list = paletteListRef.current;
    if (!list || selectedIndex < 0) return;
    const items = list.querySelectorAll('li');
    const li = items[selectedIndex];
    if (li) {
      li.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // when a row expands, ensure its value editor is visible
  useEffect(() => {
    const list = paletteListRef.current;
    if (!list || selectedIndex < 0) return;
    const items = list.querySelectorAll('li');
    const li = items[selectedIndex];
    if (li && expandedRows[selectedIndex]) {
      const valueDiv = li.querySelector('.value');
      if (valueDiv) {
        const rect = valueDiv.getBoundingClientRect();
        const rootRect = list.getBoundingClientRect();
        if (rect.bottom > rootRect.bottom) {
          list.scrollTop += rect.bottom - rootRect.bottom + 8;
        } else if (rect.top < rootRect.top) {
          list.scrollTop -= rootRect.top - rect.top + 8;
        }
      }
    }
  }, [expandedRows, selectedIndex]);

  // Qt bridge initialization and global methods
  useEffect(() => {
    if (window.QWebChannel && window.qt) {
      new window.QWebChannel(window.qt.webChannelTransport, channel => {
        qtBridgeRef.current = channel.objects.qtBridge;
        // also expose globally for easier access in other components
        window.qtBridge = qtBridgeRef.current;
        if (qtBridgeRef.current?.debugFromJs) {
          qtBridgeRef.current.debugFromJs('qtBridge is ok');
        }
      });
    }

    // expose utilities for Qt to call
    window.resetTreeUI = () => {
      setCurrentTokenFilter('');
      setTokensFilter([]);
      clearSelection();
      updateOverlayAndSearch('');
    };
    window.loadTree = (data) => {
      handleLoadTree(data);
    };
  }, [clearSelection, handleLoadTree, updateOverlayAndSearch]);

  // close context menu when window loses focus
  useEffect(() => {
    const handleBlur = () => {
      handleCloseContextMenu();
    };
    window.addEventListener('blur', handleBlur);
    return () => window.removeEventListener('blur', handleBlur);
  }, []);

  // Load debug data on mount
  useEffect(() => {
    const loadFromFile = async () => {
      try {
        const response = await fetch('treedebug.txt');
        if (!response.ok) {
          console.error(`Failed to load treedebug.txt: ${response.status} ${response.statusText}`);
          alert(`Error loading file: ${response.status} ${response.statusText}\n\nMake sure treedebug.txt exists in the public folder.`);
          return;
        }
        const text = await response.text();
        const data = JSON.parse(text);
        handleLoadTree(data);
      } catch (error) {
        console.error('Error loading debug data:', error);
        if (error instanceof SyntaxError) {
          alert('JSON parse error: ' + error.message + '\n\nMake sure treedebug.txt contains valid JSON.');
        } else {
          alert('Error loading file: ' + error.message);
        }
      }
    };

    loadFromFile();
  }, [handleLoadTree]);

  const handleRowClick = (row, index) => {
    const commandText = row.label || '';

    // determine whether we should show value editor after filtering
    const willShow = !(expandedRows[index] || false);

    // update overlay and search tokens (this will trigger visibleRows re‑calc)
    updateOverlayAndSearch(commandText);

    // after the list is filtered the clicked command becomes first result,
    // so we store expansion state at index 0 only
    setExpandedRows({ 0: willShow });
  };

  const handleContextMenu = (x, y, row, index) => {
    setSelectedIndex(index);
    setSelectedRow(row);
    setContextMenu({ visible: true, x, y, node: row });
  };

  const handleCloseContextMenu = () => {
    setContextMenu(prev => ({ ...prev, visible: false }));
  };

  return (
    <div className="palette-app" tabIndex={0}>
      <TypeOverlay query={[...tokensFilter, currentTokenFilter].join(' ')} />
      <ContextMenu
        {...contextMenu}
        onClose={handleCloseContextMenu}
        onUpOneLevel={goUpOneLevel}
        onInsertAll={() => callQt('insertAllCommand', contextMenu.node?.item?.id)}
        onInsertLast={() => callQt('insertLastCommand', contextMenu.node?.item?.id)}
      />
      <PaletteList
        ref={paletteListRef}
        visibleRows={visibleRows}
        selectedIndex={selectedIndex}
        expandedRows={expandedRows}
        onToggleExpand={(idx) => setExpandedRows(prev => ({ ...prev, [idx]: !prev[idx] }))}
        onSelectRow={(index) => {
          setSelectedIndex(index);
          setSelectedRow(visibleRows[index] || null);
        }}
        onContextMenu={handleContextMenu}
        onRowClick={handleRowClick}
        helpContext={helpContext}
      />
    </div>
  );
};

export default PaletteApp;
