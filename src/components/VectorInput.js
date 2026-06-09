import React from 'react';

const VectorInput = ({ itemId, argIndex, argName, onChange, defaultValue }) => {
  const axes = ['x', 'y', 'z'];
  const defaults = defaultValue ? defaultValue.split(',').map(v => v.trim()) : [];

  const handleChange = () => {
    const values = axes
      .map(axis => {
        const el = document.getElementById(`${itemId}_${argIndex}_${argName}_${axis}`);
        return el?.value || '';
      })
      .filter(Boolean)
      .join(',');
    onChange(values);
  };

  return (
    <div className="vector">
      {axes.map((axis, i) => {
        const fieldKey = `${itemId}_${argIndex}_${argName}_${axis}`;
        return (
          <div key={fieldKey}>
            <input
              id={fieldKey}
              name={fieldKey}
              type="number"
              step="any"
              placeholder={axis}
              className="vector-input"
              defaultValue={defaults[i] ?? ''}
              onChange={handleChange}
            />
          </div>
        );
      })}
    </div>
  );
};

export default VectorInput;
