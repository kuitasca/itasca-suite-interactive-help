import React, { useState } from 'react';
import VectorInput from './VectorInput';

const ArgumentInput = ({ argIndex, arg, itemId, helpContext, onChange }) => {
  const [inputs, setInputs] = useState([0]); // Track number of repeated inputs

  const createInput = (inputIndex = 0) => {
    const fieldKey = `${itemId}_${argIndex}_${arg.name}_${inputIndex}`;

    switch (arg.type) {
      case 'group':
        return (
          <select key={fieldKey} id={fieldKey} name={fieldKey}>
            <option value="">Select a group</option>
            {helpContext.groups.map(g => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        );

      case 'slot':
      case 'by-slot':
        return (
          <select key={fieldKey} id={fieldKey} name={fieldKey}>
            <option value="">Select a slot</option>
            {helpContext.slots.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        );

      case 'geometrySets':
        return (
          <select key={fieldKey} id={fieldKey} name={fieldKey}>
            <option value="">Select a geometry set</option>
            {helpContext.geometrySets.map(gs => (
              <option key={gs} value={gs}>{gs}</option>
            ))}
          </select>
        );

      case 'int':
        return (
          <input
            key={fieldKey}
            id={fieldKey}
            name={fieldKey}
            type="number"
            step="1"
            onChange={(e) => onChange(e.target.value)}
          />
        );

      case 'float':
        return (
          <input
            key={fieldKey}
            id={fieldKey}
            name={fieldKey}
            type="number"
            step="any"
            onChange={(e) => onChange(e.target.value)}
          />
        );

      case 'vector':
        return (
          <VectorInput
            key={fieldKey}
            itemId={itemId}
            argIndex={argIndex}
            argName={arg.name}
            onChange={onChange}
          />
        );

      case 'bool':
        return (
          <input
            key={fieldKey}
            id={fieldKey}
            name={fieldKey}
            type="checkbox"
            onChange={(e) => onChange(e.target.checked ? '1' : '0')}
          />
        );

      default:
        return (
          <input
            key={fieldKey}
            id={fieldKey}
            name={fieldKey}
            type="text"
            onChange={(e) => onChange(e.target.value)}
          />
        );
    }
  };

  const addInput = () => {
    setInputs(prev => [...prev, prev.length]);
  };

  const removeInput = () => {
    if (inputs.length > 1) {
      setInputs(prev => prev.slice(0, -1));
      onChange('');
    }
  };

  return (
    <div className="arg">
      <div className="inputs">
        {inputs.map(inputIndex => createInput(inputIndex))}
      </div>

      {arg.repeatable && (
        <div className="repeat-controls">
          <button onClick={addInput}>+</button>
          <button onClick={removeInput}>−</button>
        </div>
      )}

      <label className="arg-label" htmlFor={`${itemId}_${argIndex}_${arg.name}_0`}>
        {arg.name}
        {arg.optional ? ' (opt)' : ''}
      </label>
    </div>
  );
};

export default ArgumentInput;
