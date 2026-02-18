import React, { useState, useCallback } from 'react';
import { parseArgsFromTitle } from '../utils/parseArgs';
import ArgumentInput from './ArgumentInput';

const ValueEditor = ({ item, helpContext }) => {
  const args = parseArgsFromTitle(item.title);

  // if there are no arguments we bail out early before running any hooks
  if (!args.length) return null;

  const [inputValues, setInputValues] = useState({});
  const containerRef = React.useRef(null);

  const handleValueChange = useCallback((argIndex, values) => {
    setInputValues(prev => ({
      ...prev,
      [argIndex]: values
    }));
    // send to Qt if available
    if (window.qtBridge && typeof window.qtBridge.setArgValue === 'function') {
      window.qtBridge.setArgValue(item.id, argIndex, values);
    }
  }, [item.id]);

  // focus first input when editor mounts
  React.useEffect(() => {
    if (containerRef.current) {
      const firstInput = containerRef.current.querySelector('input, select, textarea');
      if (firstInput) firstInput.focus();
    }
  }, []);

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
        />
      ))}
    </div>
  );
};

export default ValueEditor;
