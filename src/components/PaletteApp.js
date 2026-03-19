import React, { useState, useEffect, useRef, useCallback } from 'react';
import PaletteList from './PaletteList';
import ContextMenu from './ContextMenu';
import TypeOverlay from './TypeOverlay';
// parseArgsFromTitle is deprecated, inputs are sent as part of the data
import { ReactComponent as FilterIcon } from './assets/icons/filter.svg';
import { ReactComponent as HelpIcon } from './assets/icons/help.svg';
import { ReactComponent as CloseIcon } from './assets/icons/close_off.svg';

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
  const [helpContext, setHelpContext] = useState({ slots: [], groups: [], geometrySets: [], title: 'Title' });
  const [expandedRows, setExpandedRows] = useState({});

  const [filterActive, setFilterActive] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');
  const [filteredFlatRows, setFilteredFlatRows] = useState([]);

  const paletteListRef = useRef(null);
  const qtBridgeRef = useRef(null); // holds the Qt bridge object when running inside QWebEngine

  const [debouncedFilterQuery, setDebouncedFilterQuery] = useState('');
  const MAX_RESULTS = 500;
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedFilterQuery(filterQuery);
    }, 120);   // 100–150ms ideal

    return () => clearTimeout(t);
  }, [filterQuery]);

  // Parse command tree and build index
  const buildIndex = useCallback((node, path = []) => {
    if (!node?.title) return [];

    // new JSON structure passes argument descriptions directly
    const args = Array.isArray(node.inputs) ? node.inputs : [];
    // `label` is the search token (first word of title), `display` is full shown title
    const commandLabel = (node.title || node.display).split(' ')[0];
    const display = node.display || node.title;

    let commands = [];
    const nextPath = [...path, commandLabel];

  if (!node.children || node.children.length === 0) {

    const fullPath = nextPath.join(' ');
    //  build full display path using real display values
    const fullDisplayPath = [...path.map(p => p), display].join(' ');

    // split path into searchable tokens
    const tokenKey = nextPath.join(' ').toLowerCase();

    commands.push({
      label: commandLabel,     // KEEP (overlay relies on it)
      display: fullDisplayPath,                 // KEEP
      path: nextPath,
      pathString: fullPath,

      // ✅ BETTER SEARCH INDEX
      searchKey: fullDisplayPath.toLowerCase(), // full path for substring matching
      searchTokens: tokenKey.split(/[\s\-_/]+/), // <-- NEW

      args,
      item: node
    });
  }
    if (node.children) {
      for (const child of node.children) {
        // use push to avoid creating new arrays each iteration
        const childCommands = buildIndex(child, nextPath);
        if (childCommands.length) {
          commands.push(...childCommands);
        }
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
      geometrySets: Array.isArray(data.geometrySets) ? data.geometrySets : [],
      title: data.title || 'Title'
    });

    let commands = [];
    if (data.children) {
      for (const node of data.children) {
        const childCommands = buildIndex(node);
        if (childCommands.length) {
          commands.push(...childCommands);
        }
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
          // root items: single-token label and full display
          label: getLabel(node),
          display: getDisplay(node),
          item: node
        }));
      }
    } else {
      let currentNodes = treeData || [];
      let path = [];
      let displayPath = [];

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
        // keep displayPath entries as the node's full display for nicer UI 
        displayPath.push(getDisplay(found)); 
        currentNodes = found.children || [];
      }

      const lastToken = tokens[tokens.length - 1];
      const levelMatches = currentNodes.filter(n =>
        getLabel(n).toLowerCase().startsWith(lastToken)
      );

      for (const node of levelMatches) {
        const name = getLabel(node);
        const displayName = getDisplay(node);
        const fullLabelPath = [...path, name].join(' ');
        const fullDisplayPath = [...displayPath, displayName].join(' ');

        results.push({
          label: fullLabelPath,
          display: fullDisplayPath,
          item: node
        });

        if (node.children?.length) {
          for (const child of node.children) {
            const childName = getLabel(child);
            const childDisplay = getDisplay(child);
            const fullLabelChildPath = [...path, name, childName].join(' ');
            const fullDisplayChildPath = [...displayPath, displayName, childDisplay].join(' ');
            results.push({
              label: fullLabelChildPath,
              display: fullDisplayChildPath,
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
    console.log(action+ ": " + itemId);
    const bridge = qtBridgeRef.current;
    if (bridge && typeof bridge[action] === 'function') {
      bridge[action](itemId);
    } else {
      console.warn('Qt action not available:', action);
    }
  }, []);
  const callQtCloseEvent = useCallback((action, ...args) => {
    const bridge = qtBridgeRef.current;

    if (bridge && typeof bridge[action] === 'function') {
      bridge[action](...args);
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

      // if (e.key === 'F1') {
      //   if (selectedIndex >= 0) {
      //     const row = visibleRows[selectedIndex];
      //     if (row) {
      //       console.log('showHelpCommand')
      //       callQt('showHelpCommand', row.item?.id); 
      //     }
      //   }
      //   e.preventDefault();
      //   return;
      // }
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
    if (filterActive) return;   // prevent mixing search systems

    const fullQuery = [...tokensFilter, currentTokenFilter].join(' ').trim();
    handleSearchIndex(fullQuery);
  }, [tokensFilter, currentTokenFilter, handleSearchIndex, filterActive]);

  useEffect(() => {
    if (filterActive) {
      setVisibleRows(filteredFlatRows);
    }
  }, [filterActive, filteredFlatRows]);

  useEffect(() => {
    if (!filterActive) return;

    const q = debouncedFilterQuery.trim().toLowerCase();

  if (!q) {
    setFilteredFlatRows(allCommands.slice(0, 200)); 
    return;
  }

  const results = allCommands.filter(cmd =>
    cmd.searchKey.includes(q) ||
    cmd.searchTokens.some(t => t.includes(q))
  ).slice(0, MAX_RESULTS);

    setFilteredFlatRows(results);
  }, [filterActive, debouncedFilterQuery, allCommands]);
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
    window.resetTreeUI = (data) => {
      setCurrentTokenFilter('');
      setTokensFilter([]);
      clearSelection();
      updateOverlayAndSearch('');
      // we can optionally update help context here if the data includes it,
      // or we could have a separate method for that
      setHelpContext({
      slots: Array.isArray(data.slots) ? data.slots : [],
      groups: Array.isArray(data.groups) ? data.groups : [],
      geometrySets: Array.isArray(data.geometrySets) ? data.geometrySets : [],
      title: data.title || 'Title'
    });
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
  // useEffect(() => {
  //   const loadFromFile = async () => {
  //     try {
  //       const response = await fetch('treedebug.txt');
  //       if (!response.ok) {
  //         console.error(`Failed to load treedebug.txt: ${response.status} ${response.statusText}`);
  //         alert(`Error loading file: ${response.status} ${response.statusText}\n\nMake sure treedebug.txt exists in the public folder.`);
  //         return;
  //       }
  //       const text = await response.text();
  //       const data = JSON.parse(text);
  //       handleLoadTree(data);
  //     } catch (error) {
  //       console.error('Error loading debug data:', error);
  //       if (error instanceof SyntaxError) {
  //         alert('JSON parse error: ' + error.message + '\n\nMake sure treedebug.txt contains valid JSON.');
  //       } else {
  //         alert('Error loading file: ' + error.message);
  //       }
  //     }
  //   };

  //   loadFromFile();
  // }, [handleLoadTree]);

  const handleRowClick = (row, index) => {

    const willShow = !(expandedRows[index] || false);

    // always keep track of which row was clicked
    setSelectedIndex(index);
    setSelectedRow(row);

    if (filterActive) {
      // FILTER MODE: only expand the clicked entry
      setExpandedRows({ [index]: willShow });
      return;
    }

    // PALETTE MODE (original behavior)
    const commandText = row.label || '';
    updateOverlayAndSearch(commandText);

    // expand the clicked item, not always index 0
    setExpandedRows({ [index]: willShow });
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
    <div className="palette-header">
    <div className="title">
      {helpContext?.title}
    </div>
      {/* top‑right utility bar */}
      <div className="top-right-bar">
        <button
          title="filter"
          onClick={() => setFilterActive(prev => !prev)}
        >
         <FilterIcon className="icon" />
        </button>
        {filterActive && (
          <input
            type="text"
            value={filterQuery}
            onChange={e => setFilterQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                // explicitly apply filter on Enter
                handleSearchIndex(filterQuery);
              }
            }}
            placeholder="filter"
          />
        )}
        <a
          href="common/docproject/source/manual/program_guide/mechanics/datafiles/editor_pane/inline_help.html"
          target="_blank"
          rel="noopener noreferrer"
        >
          <HelpIcon className="icon" />
        </a>
        <a
          href="#"
          className="close-button"
          onClick={(e) => {
            e.preventDefault();
            callQtCloseEvent('eventCloseFunction');
          }}
        >
          <CloseIcon className="icon" />
        </a>
      </div>
      </div>
      <ContextMenu
        {...contextMenu}
        onClose={handleCloseContextMenu}
        onUpOneLevel={goUpOneLevel}
        onInsertLast={() => callQt('insertLastCommand', contextMenu.node?.item?.id)}
        onInsertAll={() => callQt('insertAllCommand', contextMenu.node?.item?.id)}
        onShowHelp={() => callQt('showHelpCommand', contextMenu.node?.item?.id)}
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
