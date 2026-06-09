import React, { useState, useEffect, useRef, useCallback } from 'react';
import PaletteList from './PaletteList';
import ContextMenu from './ContextMenu';
import TypeOverlay from './TypeOverlay';
// parseArgsFromTitle is deprecated, inputs are sent as part of the data
import { ReactComponent as FilterIcon } from './assets/icons/filter.svg';
import { ReactComponent as HelpIcon } from './assets/icons/help.svg';
import { ReactComponent as CloseIcon } from './assets/icons/close_off.svg';
import { ReactComponent as ResetIcon } from './assets/icons/reset_tree.svg';


// Walk the tree to separate command-path keyword tokens from embedded arg values.
// Tokens that match a child node label are command keywords; everything else is an arg value.
// Returns { commandTokens, preRangeArgValues, postRangeArgValues }.
function parseLineOfText(lineOfText, rootNodes) {
  const tokens = lineOfText.trim().split(/\s+/).filter(Boolean);
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

const PaletteApp = () => {
  const [treeData, setTreeData] = useState(null);
  const [commandsTreeData, setCommandsTreeData] = useState(null);
  const [fishTreeData, setFishTreeData] = useState(null);
  const [allCommands, setAllCommands] = useState([]);
  const [visibleRows, setVisibleRows] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [currentTokenFilter, setCurrentTokenFilter] = useState('');
  const [tokensFilter, setTokensFilter] = useState([]);
  const [mode, setMode] = useState('palette');
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, node: null });
  const [bubbleContextMenu, setBubbleContextMenu] = useState({ visible: false, x: 0, y: 0, selectedText: '' });
  const [selectedRow, setSelectedRow] = useState(null);
  const [helpContext, setHelpContext] = useState({ slots: [], groups: [], geometrySets: [], ranges: [], title: 'Title' });
  const [expandedRows, setExpandedRows] = useState({});

  const [filterActive, setFilterActive] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');
  const [filteredFlatRows, setFilteredFlatRows] = useState([]);

  const [activeTab, setActiveTab] = useState('palette'); // 'palette' | 'ai'
  const [filterAIActive, setFilterAIActive] = useState(false);
  const [aiInput, setAiInput] = useState('');
  const [aiMessages, setAiMessages] = useState([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(false);
  const [aiErrorMessage, setAiErrorMessage] = useState('');
  const [aiResults, setAiResults] = useState([]);
  const [aiExpandedRows, setAiExpandedRows] = useState({});

  // extractedArgValues: arg value tokens parsed from lineOfText { preRange: string[], postRange: string[] }
  const [extractedArgValues, setExtractedArgValues] = useState(null);

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
  const buildIndex = useCallback((node, path = [], parentArgs = []) => {
    if (!node?.title) return [];

    const ownArgs = Array.isArray(node.inputs) ? node.inputs : [];
    // Merge: parent args first, then own args; skip parent args whose name already exists in ownArgs
    const ownNames = new Set(ownArgs.map(a => a.name));
    const args = [...parentArgs.filter(a => !ownNames.has(a.name)), ...ownArgs];

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
        const childCommands = buildIndex(child, nextPath, args);
        if (childCommands.length) {
          commands.push(...childCommands);
        }
      }
    }

    return commands;
  }, []);

  // Load tree data
  const handleLoadTree = useCallback((datacommand, datafish) => {
    //setTreeData(datacommand.children);
    setCommandsTreeData(datacommand);
    setFishTreeData(datafish);

    //for testing mode without Qt, we can directly set the tree data and help context here
    // setHelpContext({
    //   slots: Array.isArray(datacommand.slots) ? datacommand.slots : [],
    //   groups: Array.isArray(datacommand.groups) ? datacommand.groups : [],
    //   geometrySets: Array.isArray(datacommand.geometrySets) ? datacommand.geometrySets : [],
    //   title: datacommand.title || 'Commands List',
    //   isFish: false,
    //   lineOfText: 'block fix'
    // });
  }, []);

  // Search index
  const handleSearchIndex = useCallback((query) => {
    const tokens = query.trim() ? query.toLowerCase().split(/\s+/) : [];

    let results = [];

    const getLabel = (n) => ((n.title || n.display) + '').split(' ')[0];
    const getDisplay = (n) => n.display || n.title || '';
    const getArgs = (n) => Array.isArray(n.inputs) ? n.inputs : [];
    // Merge parent args into own args, skipping duplicates by name
    const mergeArgs = (parent, own) => {
      const ownNames = new Set(own.map(a => a.name));
      return [...parent.filter(a => !ownNames.has(a.name)), ...own];
    };

    if (tokens.length === 0) {
      if (treeData) {
        results = treeData.map(node => ({
          // root items: single-token label and full display
          label: getLabel(node),
          display: getDisplay(node),
          args: getArgs(node),
          item: node
        }));
      }
    } else {
      let currentNodes = treeData || [];
      let path = [];
      let displayPath = [];
      let parentArgs = [];

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
        parentArgs = mergeArgs(parentArgs, getArgs(found));
        currentNodes = found.children || [];
      }

      const lastToken = tokens[tokens.length - 1];
      const levelMatches = currentNodes.filter(n =>
        getLabel(n).toLowerCase().startsWith(lastToken)
      );

      if (helpContext?.isFish) {
        // Fish mode: show only leaf command names without full paths
        for (const node of levelMatches) {
          const name = getLabel(node);
          const fullPath = [...path, name].join(' ');
          const nodeArgs = mergeArgs(parentArgs, getArgs(node));

          results.push({
            label: fullPath,
            display: getDisplay(node),
            args: nodeArgs,
            item: node
          });

          if (node.children?.length) {
            for (const child of node.children) {
              const childName = getLabel(child);
              results.push({
                label: [...path, name, childName].join(' '),
                display: getDisplay(child),
                args: mergeArgs(nodeArgs, getArgs(child)),
                item: child
              });
            }
          }
        }
      } else {
        // Palette mode: show full display paths
        for (const node of levelMatches) {
          const name = getLabel(node);
          const displayName = getDisplay(node);
          const fullLabelPath = [...path, name].join(' ');
          const fullDisplayPath = [...displayPath, displayName].join(' ');
          const nodeArgs = mergeArgs(parentArgs, getArgs(node));

          results.push({
            label: fullLabelPath,
            display: fullDisplayPath,
            args: nodeArgs,
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
                args: mergeArgs(nodeArgs, getArgs(child)),
                item: child
              });
            }
          }
        }
      }
    }

    setVisibleRows(results);
    const newIndex = results.length > 0 ? 0 : -1;
    setSelectedIndex(newIndex);
    setSelectedRow(newIndex >= 0 ? results[0] : null);
  }, [treeData, helpContext]);

  // Helpers
  const clearSelection = useCallback(() => {
    setSelectedRow(null);
    setSelectedIndex(-1);
    setExpandedRows({});
    setExtractedArgValues(null);
  }, []);

  const callQt = useCallback((action, itemId) => {
    if (!itemId) return;
    console.log(action + ": " + itemId);
    const bridge = qtBridgeRef.current;
    if (bridge && typeof bridge[action] === 'function') {
      bridge[action](itemId);
    } else {
      console.warn('Qt action not available:', action);
    }
  }, []);

  const callQt2 = useCallback((action, row) => {
    console.log(row)
    const item = row?.item;
    if (!item) return;
    
    // Split label at 'range' keyword: base command tokens before it,
    // range-path tokens (range + qualifiers) go after all arg values.
    const labelTokens = (row.label || '').split(/\s+/).filter(Boolean);
    const rangeIdx = labelTokens.indexOf('range');
    const commandNames = rangeIdx === -1 ? labelTokens : labelTokens.slice(0, rangeIdx);
    const labelRangeTokens = rangeIdx === -1 ? [] : labelTokens.slice(rangeIdx);

    // Use row.args (includes inherited parent args) for DOM lookup —
    // indices must match what ValueEditor rendered.
    const argDefs = Array.isArray(row.args) ? row.args : [];
    const display = row.display || '';

    // Find where 'range' keyword appears in the display string so we can put
    // args that fall after it (e.g. fl, fu) after the range label tokens.
    const rangeDisplayMatch = display.match(/\brange\b/);
    const rangeDisplayPos = rangeDisplayMatch ? rangeDisplayMatch.index : Infinity;

    // Sort by position of arg.name in display so order matches command syntax.
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
    console.log(`${action} (callQt2): ${command}`);
    const bridge = qtBridgeRef.current;
    if (bridge && typeof bridge[action] === 'function') {
      bridge[action](command);
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

  const resolveDocLink = (href) => {
    const trimmed = (href || '').trim();
    if (!trimmed) return trimmed;
    return trimmed;
  };

  const handleAiLinkClick = (e, href) => {
    e.preventDefault();
    e.stopPropagation();

    const selectedId = selectedRow?.item?.id || contextMenu?.node?.item?.id;
    if (selectedId) {
      callQt('showHelpCommand', selectedId);
      return;
    }

    const resolved = resolveDocLink(href);
    if (resolved) {
      window.open(resolved, '_blank', 'noopener');
    }
  };

  const renderTextWithLinks = (text) => {
    const nodes = [];
    const urlPattern = /\b(?:https?:\/\/|file:\/\/\/|www\.|[A-Za-z0-9_.-]+\/[A-Za-z0-9_.\-\/%]+)\b/g;
    let lastIndex = 0;
    let match;

    while ((match = urlPattern.exec(text)) !== null) {
      const url = match[0];
      const index = match.index;
      if (index > lastIndex) {
        nodes.push(text.slice(lastIndex, index));
      }
      nodes.push(
        <a
          key={`plain-link-${index}-${lastIndex}`}
          href={resolveDocLink(url)}
          onClick={(event) => handleAiLinkClick(event, url)}
        >
          {url}
        </a>
      );
      lastIndex = index + url.length;
    }

    if (lastIndex < text.length) {
      nodes.push(text.slice(lastIndex));
    }

    return nodes;
  };

  const renderAiMessageContent = (content) => {
    if (!content) return null;

    const nodes = [];
    const markdownLinkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
    let lastIndex = 0;
    let match;

    while ((match = markdownLinkPattern.exec(content)) !== null) {
      const [fullMatch, label, href] = match;
      const index = match.index;
      if (index > lastIndex) {
        nodes.push(...renderTextWithLinks(content.slice(lastIndex, index)));
      }
      nodes.push(
        <a
          key={`md-link-${index}`}
          href={resolveDocLink(href)}
          onClick={(event) => handleAiLinkClick(event, href)}
        >
          {label}
        </a>
      );
      lastIndex = index + fullMatch.length;
    }

    if (lastIndex < content.length) {
      nodes.push(...renderTextWithLinks(content.slice(lastIndex)));
    }

    return nodes;
  };

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
      //if (e.key === 'Home') {
      if (e.ctrlKey && e.key === 'Home') {
        setCurrentTokenFilter('');
        setTokensFilter([]);
        handleSearchIndex('');
        e.preventDefault();
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        callQtCloseEvent('eventCloseFunction');
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
            const hasArgs = Array.isArray(row.args) && row.args.length > 0;
            if (hasArgs && !expandedRows[selectedIndex]) {
              setExpandedRows(prev => ({ ...prev, [selectedIndex]: true }));
            } else {
              callQt2('insertAllCommand', row);
            }
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
    if (filterActive || filterAIActive) return;   // prevent mixing search systems

    const fullQuery = [...tokensFilter, currentTokenFilter].join(' ').trim();
    handleSearchIndex(fullQuery);
  }, [tokensFilter, currentTokenFilter, handleSearchIndex, filterActive, filterAIActive]);

  useEffect(() => {
    if (filterActive || filterAIActive) {
      setVisibleRows(filteredFlatRows);
    }
  }, [filterActive, filterAIActive, filteredFlatRows]);

  useEffect(() => {
    if (!filterActive && !filterAIActive) return;

    const q = debouncedFilterQuery.trim().toLowerCase();
    let results = [];

    if (!q) {
      results = allCommands.slice(0, 200);
    } else {
      results = allCommands.filter(cmd =>
        cmd.searchKey.includes(q) ||
        cmd.searchTokens.some(t => t.includes(q))
      ).slice(0, MAX_RESULTS);
    }

    // In fish mode, filter out parent commands (those with children) and show only leaf command names
    if (helpContext?.isFish) {
      results = results
        .filter(cmd => !cmd.item?.children || cmd.item.children.length === 0)
        .map(cmd => {
          // Remove (2d only) or (3d only) markers and extract the command name
          let display = cmd.display.trim().replace(/\s*\([23]d\s+only\)\s*$/, '');
          // Take the last token (the actual command name, not the parent)
          const parts = display.split(/\s+/);
          let leafCommand = parts[parts.length - 1] || cmd.display;
          if (cmd.display.includes('(2d only)') || cmd.display.includes('(3d only)')) {
            leafCommand += cmd.display.includes('(2d only)') ? ' (2d only)' : ' (3d only)';
          }
          return {
            ...cmd,
            display: leafCommand
          };
        });
    }

    setFilteredFlatRows(results);
  }, [filterActive, filterAIActive, debouncedFilterQuery, allCommands, helpContext]);
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

  const resetTreeUIFunction = useCallback((data) => {
    const lineOfText = data.lineOfText || '';
    setCurrentTokenFilter('');
    clearSelection();
    setHelpContext({
      slots: Array.isArray(data.slots) ? data.slots : [],
      groups: Array.isArray(data.groups) ? data.groups : [],
      geometrySets: Array.isArray(data.geometrySets) ? data.geometrySets : [],
      ranges: Array.isArray(data.ranges) ? data.ranges : [],
      title: data.title + ' List',
      isFish: data.isFish || false,
      lineOfText,
    });

    if(lineOfText !== '') {
      setActiveTab('palette');
      setFilterAIActive(false);
      setFilterActive(false);
    }

    // Separate command-path keywords from embedded arg values in lineOfText.
    // e.g. "zone copy 21,21,21 false range active" → commandTokens: ["zone","copy","range","active"],
    //      preRangeArgValues: ["21,21,21","false"], postRangeArgValues: []
    const rootNodes = data.isFish ? fishTreeData?.children : commandsTreeData?.children;
    const { commandTokens, preRangeArgValues, postRangeArgValues } = parseLineOfText(lineOfText, rootNodes);
    const hasArgValues = preRangeArgValues.length > 0 || postRangeArgValues.length > 0;
    if (hasArgValues) {
      setExtractedArgValues({ preRange: preRangeArgValues, postRange: postRangeArgValues });
    }

    // Navigate using only the command-path tokens (arg values stripped out).
    updateOverlayAndSearch(commandTokens.join(' '));
    let commands = [];
    if (data.isFish) {
      setTreeData(fishTreeData?.children);
      if (fishTreeData?.children) {
        for (const node of fishTreeData.children) {
          const childCommands = buildIndex(node);
          if (childCommands.length) {
            commands.push(...childCommands);
          }
        }
      } /*else {
          alert('Fish tree data is missing children');
        }  */
    } else {
      setTreeData(commandsTreeData?.children);
      if (commandsTreeData?.children) {
        for (const node of commandsTreeData.children) {
          const childCommands = buildIndex(node);
          if (childCommands.length) {
            commands.push(...childCommands);
          }
        }
      } /*else {
          alert('Commands tree data is missing children');
        } */
    }

    setAllCommands(commands);
    handleSearchIndex('');
  }, [buildIndex, clearSelection, updateOverlayAndSearch, handleSearchIndex, fishTreeData, commandsTreeData]);

  // Trigger tree UI reset when tree data is loaded from Qt (if not already loaded)
  useEffect(() => {
    if (commandsTreeData && !treeData) {
      resetTreeUIFunction(helpContext, commandsTreeData, fishTreeData);
    }
  }, [commandsTreeData, fishTreeData, treeData, resetTreeUIFunction, helpContext]);

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
      resetTreeUIFunction(data);
    };

    window.loadTree = (datacommand, datafish) => {
      handleLoadTree(datacommand, datafish);
    };

  }, [clearSelection, handleLoadTree, updateOverlayAndSearch, resetTreeUIFunction]);

  // Prevent browser context menu on AI bubbles
  useEffect(() => {
    const handleContextMenu = (e) => {
      if (e.target.closest('.ai-message-bubble')) {
        e.preventDefault();
        return false;
      }
    };

    document.addEventListener('contextmenu', handleContextMenu, true);
    return () => document.removeEventListener('contextmenu', handleContextMenu, true);
  }, []);

  // Load debug data on mount
  // useEffect(() => {
  //   const loadFromFile = async () => {
  //     let datac, dataf;
  //     try {
  //       const response = await fetch('commandtreedebug.txt');
  //       if (!response.ok) {
  //         console.error(`Failed to load commandtreedebug.txt: ${response.status} ${response.statusText}`);
  //         alert(`Error loading file: ${response.status} ${response.statusText}\n\nMake sure commandtreedebug.txt exists in the public folder.`);
  //         return;
  //       }
  //       const text = await response.text();
  //       datac = JSON.parse(text);

  //     } catch (error) {
  //       console.error('Error loading debug data:', error);
  //       if (error instanceof SyntaxError) {
  //         alert('JSON parse error: ' + error.message + '\n\nMake sure commandtreedebug.txt contains valid JSON.');
  //       } else {
  //         alert('Error loading file: ' + error.message);
  //       }
  //     }

  //     try {
  //       const response = await fetch('fishtreedebug.txt');
  //       if (!response.ok) {
  //         console.error(`Failed to load fishtreedebug.txt: ${response.status} ${response.statusText}`);
  //         alert(`Error loading file: ${response.status} ${response.statusText}\n\nMake sure fishtreedebug.txt exists in the public folder.`);
  //         return;
  //       }
  //       const text = await response.text();
  //       dataf = JSON.parse(text);

  //     } catch (error) {
  //       console.error('Error loading debug data:', error);
  //       if (error instanceof SyntaxError) {
  //         alert('JSON parse error: ' + error.message + '\n\nMake sure fishtreedebug.txt contains valid JSON.');
  //       } else {
  //         alert('Error loading file: ' + error.message);
  //       }
  //     }
  //     handleLoadTree(datac, dataf);
  //   };

  //   loadFromFile();
  // }, [handleLoadTree, resetTreeUIFunction]);

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
    setBubbleContextMenu({ visible: false, x: 0, y: 0, selectedText: '' });
  };

  const handleBubbleContextMenu = (e) => {
    const selectedText = window.getSelection()?.toString().trim() || '';
    if (!selectedText) return;

    e.preventDefault();
    e.stopPropagation();
    setContextMenu(prev => ({ ...prev, visible: false }));
    setBubbleContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      selectedText
    });
  };

  const handleBubbleMouseUp = (e) => {
    if (e.button !== 0) return;

    const selectedText = window.getSelection()?.toString().trim() || '';
    if (!selectedText) return;

    e.preventDefault();
    e.stopPropagation();
    setContextMenu(prev => ({ ...prev, visible: false }));

    const selection = window.getSelection();
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    setBubbleContextMenu({
      visible: true,
      x: rect.left,
      y: rect.bottom + 5,
      selectedText
    });
  };

  const handleCloseContextMenu = () => {
    setContextMenu(prev => ({ ...prev, visible: false }));
    setBubbleContextMenu(prev => ({ ...prev, visible: false, selectedText: '' }));
  };

  const mapAiResults = useCallback((nodes) => {
    return nodes.map(node => {
      const match = allCommands.find(cmd => cmd.item.id === node.id);
      if (match) return match;
      return {
        label: (node.title || '').split(' ')[0],
        display: node.display || node.title || '',
        args: Array.isArray(node.inputs) ? node.inputs : [],
        item: node,
      };
    });
  }, [allCommands]);

  const mapAiResults2 = useCallback((nodes) => {
    // Map each AI result to a command object from allCommands
    // AI results have: {command, syntax, source, score}
    console.log('mapAiResults2 called with nodes:', nodes);

    let results = nodes
      .map(node => {
        const commandName = node.command || node.syntax || '';

        // Try to find match by command name in allCommands
        let match = allCommands.find(cmd =>
          cmd.display.toLowerCase() === commandName.toLowerCase() ||
          cmd.searchKey.includes(commandName.toLowerCase()) ||
          cmd.item.title?.toLowerCase() === commandName.toLowerCase()
        );

        if (match) return match;

        // If no match, create a command object from the node
        return {
          label: commandName.split(' ')[0],
          display: commandName,
          args: [],
          item: {
            title: commandName,
            display: commandName,
            id: commandName
          },
          searchKey: commandName.toLowerCase(),
          searchTokens: commandName.toLowerCase().split(/[\s\-_/]+/)
        };
      })
      .filter(Boolean)
      .slice(0, MAX_RESULTS);

    // In fish mode, filter out parent commands and show only leaf command names
    if (helpContext?.isFish) {
      results = results
        .filter(cmd => !cmd.item?.children || cmd.item.children.length === 0)
        .map(cmd => {
          let display = cmd.display.trim().replace(/\s*\([23]d\s+only\)\s*$/, '');
          const parts = display.split(/\s+/);
          let leafCommand = parts[parts.length - 1] || cmd.display;
          if (cmd.display.includes('(2d only)') || cmd.display.includes('(3d only)')) {
            leafCommand += cmd.display.includes('(2d only)') ? ' (2d only)' : ' (3d only)';
          }
          return {
            ...cmd,
            display: leafCommand
          };
        });
    }

    console.log('mapAiResults2 returning:', results.length, 'items');
    return results;

  }, [allCommands, helpContext]);

  const sendAiQuery = async (query) => {
    if (!query || aiLoading) return;
    setAiInput('');
    setAiMessages(prev => [...prev, { role: 'user', content: query }]);
    setAiLoading(true);
    setAiError(false);
    setAiErrorMessage('');
    setAiResults([]);
    setAiExpandedRows({});
    try {
      let res = 0;
      if (!helpContext.isFish) {
        res = await fetch('http://127.0.0.1:7432/ask?db=commands', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query }),
        });
      } else {
        res = await fetch('http://127.0.0.1:7432/ask?db=fish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query }),
        });
      }
      const data = await res.json();
      console.log(data);
      if (data.explanation) {
        setAiMessages(prev => [...prev, { role: 'assistant', content: data.explanation }]);
      }
      if (data.results?.length) {
        setAiResults(mapAiResults2(data.results));
      }
    } catch (error) {
      console.error('AI Server Error:', error);
      setAiError(true);
      setAiErrorMessage(error.message || 'Could not reach AI server');
    } finally {
      setAiLoading(false);
    }
  };

  const handleAiSend = async () => {
    await sendAiQuery(aiInput.trim());
  };

  const handleAskToAI = async (text) => {
    setActiveTab('ai');
    setFilterAIActive(true);
    setFilterActive(false);
    await sendAiQuery(text.trim());
  };

  return (
    <div className="palette-app" tabIndex={0}>
      <div className="palette-header">
        {/*<div className="title">
          {helpContext?.title}
        </div>*/}
        {/* Tabs */}
        <div className="palette-tabs">
          <button
            className={activeTab === 'palette' ? 'active' : ''}
            onClick={() => {
              setActiveTab('palette');
              setFilterAIActive(false);
            }}
          >
            {helpContext?.title}
          </button>
          <button
            className={activeTab === 'ai' ? 'active' : ''}
            onClick={() => {
              setActiveTab('ai');
              setFilterAIActive(true);
            }}
          >
            AI Mode(Beta)
          </button>
        </div>
        {/* top‑right utility bar */}
        <div className="top-right-bar">
          <a
            href="#"
            className="reset-button"
            title="Reset Tree"
            onClick={(e) => {
              e.preventDefault();
              setCurrentTokenFilter('');
              setTokensFilter([]);
              handleSearchIndex('');
            }}
          >
          <ResetIcon className="icon" />
          </a>
          <button
            title="Filter Commands"
            onClick={() => {
              if (!filterActive) {
                setFilterQuery('');
              }
              setFilterActive(prev => !prev);
            }}
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
              placeholder="Filter"
            />
          )}
          <a
            href="common/docproject/source/manual/program_guide/mechanics/datafiles/editor_pane/inline_help.html"
            target="_blank"
            rel="noopener noreferrer"
            title="Help"
          >
          <HelpIcon className="icon" />
          </a>
          <a
            href="#"
            className="close-button"
            title="Close"
            onClick={(e) => {
              e.preventDefault();
              callQtCloseEvent('eventCloseFunction');
            }}
          >
            <CloseIcon className="icon" />
          </a>
        </div>
      </div>

      {activeTab === 'palette' ? (
        <>
      <TypeOverlay query={[...tokensFilter, currentTokenFilter].join(' ')} hidden={filterActive} />    
          <ContextMenu
            {...contextMenu}
            usePathString={filterActive}
            onClose={handleCloseContextMenu}
            onUpOneLevel={goUpOneLevel}
            onInsertLast={() => callQt('insertLastCommand', contextMenu.node?.item?.id)}
            onInsertAll={() => callQt2('insertAllCommand', contextMenu.node)}
            onShowHelp={() => callQt('showHelpCommand', contextMenu.node?.item?.id)}
            onAskToAI={handleAskToAI}
            helpContext={helpContext}
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
            onInsertAll={(row) => callQt2('insertAllCommand', row)}
            helpContext={helpContext}
            extractedArgValues={extractedArgValues}
          />
        </>
      ) : (
        <div className="ai-mode-panel">
          <div className="ai-chat-body">
            {aiMessages.map((msg, index) => (
              <div key={index} className={`ai-message-row ${msg.role}`}>
                <div
                  className={`ai-message-bubble ${msg.role}`}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    handleBubbleContextMenu(e);
                  }}
                  onMouseUp={handleBubbleMouseUp}
                  onClick={(e) => e.stopPropagation()}
                >
                  {renderAiMessageContent(msg.content)}
                </div>
              </div>
            ))}
            {aiLoading && <div className="ai-loading">Searching…</div>}
            {aiError && (
              <div className="ai-message-bubble assistant">
                {aiErrorMessage || 'Could not reach AI server.'}
              </div>
            )}
          </div>

          <ContextMenu
            {...bubbleContextMenu}
            onlyAsk={true}
            onClose={handleCloseContextMenu}
            onAskToAI={handleAskToAI}
          />

          {aiResults.length > 0 && (
            <>
              <ContextMenu
                {...contextMenu}
                usePathString={filterAIActive}
                onClose={handleCloseContextMenu}
                onUpOneLevel={goUpOneLevel}
                onInsertLast={() => callQt('insertLastCommand', contextMenu.node?.item?.id)}
                onInsertAll={() => callQt2('insertAllCommand', contextMenu.node)}
                onShowHelp={() => callQt('showHelpCommand', contextMenu.node?.item?.id)}
                onAskToAI={handleAskToAI}
                helpContext={helpContext}
              />
              <PaletteList
                ref={paletteListRef}
                visibleRows={aiResults}
                selectedIndex={selectedIndex}
                expandedRows={aiExpandedRows}
                onToggleExpand={(idx) =>
                  setAiExpandedRows(prev => ({ ...prev, [idx]: !prev[idx] }))
                }
                onSelectRow={(index) => {
                  setSelectedIndex(index);
                  setSelectedRow(aiResults[index] || null);
                }}
                onContextMenu={handleContextMenu}
                onRowClick={(row, index) => {
                  setSelectedIndex(index);
                  setSelectedRow(row);
                  setAiExpandedRows(prev => ({ ...prev, [index]: !prev[index] }));
                }}
                helpContext={helpContext}
              />
            </>
          )}

          <div className="ai-input-bar">
            <textarea
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              placeholder="Ask me about ITASCA Software commands..."
              rows={1}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleAiSend();
                }
              }}
            />
            <button className="send-button" onClick={handleAiSend} disabled={aiLoading}>
              {aiLoading ? '…' : 'Send'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PaletteApp;
