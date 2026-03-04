import React, { useState, useCallback, useEffect, useRef } from 'react';
import ArgumentInput from './ArgumentInput';

const ValueEditor = ({ item, helpContext }) => {

  const args = Array.isArray(item.inputs) ? item.inputs : [];

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
        />
      ))}
    </div>
  );
};

export default ValueEditor;