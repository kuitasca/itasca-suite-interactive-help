import React, { useState, useCallback, useEffect, useRef } from 'react';
import ArgumentInput from './ArgumentInput';

const ValueEditor = ({ item, args: argsProp, display, helpContext, extractedArgValues }) => {

  const args = argsProp !== undefined ? argsProp : (Array.isArray(item.inputs) ? item.inputs : []);

  // Helper to strip quotes from string values
  const stripQuotes = (val) => {
    if (!val || typeof val !== 'string') return val;
    return val.replace(/^['"]|['"]$/g, '');
  };

  // Compute argIndex → default value string from the raw extracted arg value tokens.
  // Uses the same pre/post-range ordering logic as callQt2.
  const prefillMap = (() => {
    if (!extractedArgValues) return {};
    const d = display || '';
    const rangeMatch = d.match(/\brange\b/);
    const rangePos = rangeMatch ? rangeMatch.index : Infinity;

    const sorted = args
      .map((arg, originalIndex) => {
        const pos = d.indexOf(arg.name);
        return { originalIndex, pos: pos === -1 ? Infinity : pos };
      })
      .sort((a, b) => a.pos - b.pos);

    const isPost = ({ pos }) => rangePos < Infinity && pos !== Infinity && pos > rangePos;
    const preRangeArgs = sorted.filter(s => !isPost(s));
    const postRangeArgs = sorted.filter(isPost);

    const map = {};
    extractedArgValues.preRange.forEach((val, i) => {
      if (preRangeArgs[i]) map[preRangeArgs[i].originalIndex] = stripQuotes(val);
    });
    extractedArgValues.postRange.forEach((val, i) => {
      if (postRangeArgs[i]) map[postRangeArgs[i].originalIndex] = stripQuotes(val);
    });
    return map;
  })();

  // ✅ Hooks must always run
  const [inputValues, setInputValues] = useState({});
  const containerRef = useRef(null);

  const handleValueChange = useCallback((argIndex, values) => {
    setInputValues(prev => ({
      ...prev,
      [argIndex]: values
    }));

    if (window.qtBridge && typeof window.qtBridge.setArgValue === 'function') {
      window.qtBridge.setArgValue(item.id, argIndex, values);
    }
  }, [item.id]);

  useEffect(() => {
    if (containerRef.current) {
      const firstInput =
        containerRef.current.querySelector('input, select, textarea');
      if (firstInput) firstInput.focus();
    }
  }, []);

  // ✅ Early return AFTER hooks
  if (!args.length) return null;

  return (
    <div className="value" ref={containerRef}>
      {args.map((arg, index) => (
        <ArgumentInput
          key={index}
          argIndex={index}
          arg={arg}
          itemId={item.id}
          helpContext={helpContext}
          onChange={(values) => handleValueChange(index, values)}
          defaultValue={prefillMap[index]}
        />
      ))}
    </div>
  );
};

export default ValueEditor;