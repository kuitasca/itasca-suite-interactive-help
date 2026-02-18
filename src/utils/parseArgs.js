/**
 * Parse arguments from a command title string
 * Handles various argument types: group, slot, int, float, vector, bool, string
 * Also handles optional arguments (< >) and repeatable arguments (...)
 */
export function parseArgsFromTitle(title) {
  if (!title) return [];

  // Remove comments and normalize whitespace
  title = title
    .replace(/<\s+/g, '<')
    .replace(/\s+>/g, '>')
    .replace(/\([^)]*\)/g, '');

  const rawTokens = title.split(/\s+/).filter(Boolean);

  const semanticStarters = new Set([
    'group', 'groups', 'slot', 'by-slot', 'set',
    'i', 'f', 'v', 's', 'b'
  ]);

  let tokens;
  if (semanticStarters.has(rawTokens[0].replace(/[<>]/g, '').toLowerCase())) {
    tokens = rawTokens;
  } else {
    tokens = rawTokens.slice(1);
  }

  // Skip 'id' token if present
  if (tokens[0] === 'id') {
    tokens = tokens.slice(1);
  }

  const args = [];

  for (let i = 0; i < tokens.length; i++) {
    let token = tokens[i];

    // Merge optional groups < ... >
    if (token.startsWith('<') && !token.endsWith('>')) {
      let merged = token;
      while (i + 1 < tokens.length && !tokens[i + 1].endsWith('>')) {
        merged += ' ' + tokens[++i];
      }
      if (i + 1 < tokens.length) {
        merged += ' ' + tokens[++i];
      }
      token = merged;
    }

    // Skip keyword selector
    if (token === 'keyword') {
      if (tokens[i + 1] === '...') i++;
      continue;
    }

    // Handle repeatable marker
    if (token === '...') {
      if (args.length) {
        args[args.length - 1].repeatable = true;
      }
      continue;
    }

    const next = tokens[i + 1];

    // Semantic string selectors (group, slot, by-slot, set)
    if (
      (token === 'group' ||
        token === 'slot' ||
        token === 'by-slot' ||
        token === 'set') &&
      next === 's'
    ) {
      args.push({
        name: token,
        type:
          token === 'group' ? 'group' :
            token === 'set' ? 'geometrySets' :
              'slot',
        optional: false,
        repeatable: false
      });
      i++; // skip the 's'
      continue;
    }

    // Normal arguments
    const optional = token.startsWith('<');
    token = token.replace(/[<>]/g, '');

    let type = 'string';

    if (/^f\d*$/.test(token)) {
      type = 'float';
    } else if (/^i\d*$/.test(token)) {
      type = 'int';
    } else if (/^v\d*$/.test(token)) {
      type = 'vector';
    } else if (/^b\d*$/.test(token)) {
      type = 'bool';
    } else if (token === 's') {
      type = 'string';
    }

    args.push({
      name: token,
      type,
      optional,
      repeatable: false
    });
  }

  return args;
}
