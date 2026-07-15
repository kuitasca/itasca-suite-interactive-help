/**
 * Recursively flatten a command tree into a searchable list of leaf commands.
 * Shared between PaletteApp and IntelliSenseApp.
 */
export function buildIndex(node, path = [], parentArgs = []) {
  if (!node?.title) return [];

  const ownArgs = Array.isArray(node.inputs) ? node.inputs : [];
  const parentDeduped = [...new Map(parentArgs.map(a => [a.name, a])).values()];
  const argsEq = (a, b) => a.name === b.name && a.type === b.type;
  const n = parentDeduped.length, m = ownArgs.length;
  const ownRedundant = m > 0 && m <= n && parentDeduped.slice(n - m).every((p, i) => argsEq(p, ownArgs[i]));
  const args = ownRedundant ? parentDeduped : [...parentDeduped, ...ownArgs];

  const commandLabel = (node.title || node.display).split(' ')[0];
  const display = node.display || node.title;

  let commands = [];
  const nextPath = [...path, commandLabel];

  if (!node.children || node.children.length === 0) {
    const fullPath = nextPath.join(' ');
    const fullDisplayPath = [...path.map(p => p), display].join(' ');
    const tokenKey = nextPath.join(' ').toLowerCase();

    commands.push({
      label: commandLabel,
      display: fullDisplayPath,
      path: nextPath,
      pathString: fullPath,
      searchKey: fullDisplayPath.toLowerCase(),
      searchTokens: tokenKey.split(/[\s\-_/]+/),
      args,
      item: node,
    });
  }

  if (node.children) {
    for (const child of node.children) {
      const childCommands = buildIndex(child, nextPath, args);
      if (childCommands.length) {
        commands.push(...childCommands);
      }
    }
  }

  return commands;
}

/**
 * Build a flat index from all root-level tree nodes.
 */
export function buildAllCommands(treeChildren) {
  const commands = [];
  if (!treeChildren) return commands;
  for (const node of treeChildren) {
    const childCommands = buildIndex(node);
    if (childCommands.length) {
      commands.push(...childCommands);
    }
  }
  return commands;
}
