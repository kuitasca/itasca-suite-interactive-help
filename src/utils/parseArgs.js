// parseArgs.js is retained for legacy imports but the
// deprecated helper no longer performs any work.  The
// command tree JSON now supplies an `inputs` array directly on
// each node, so callers should read that instead of attempting
//to parse titles.

// NOTE: we leave a stub export so that old imports don't
// break immediately; the function will simply return an empty
// array and print a warning.

export function parseArgsFromTitle(/* title */) {
  console.warn('parseArgsFromTitle is deprecated; use node.inputs');
  return [];
}
