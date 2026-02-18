import React from 'react';

const VectorInput = ({ itemId, argIndex, argName, onChange }) => {
  const axes = ['x', 'y', 'z'];

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
      {axes.map(axis => {
        const fieldKey = `${itemId}_${argIndex}_${argName}_${axis}`;
        return (
          <div key={fieldKey}>
            <label htmlFor={fieldKey} className="visually-hidden">
              {argName} {axis}
            </label>
            <input
              id={fieldKey}
              name={fieldKey}
              type="number"
              step="any"
              placeholder={axis}
              className="vector-input"
              onChange={handleChange}
            />
          </div>
        );
      })}
    </div>
  );
};

export default VectorInput;
