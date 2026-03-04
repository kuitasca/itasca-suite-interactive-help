import React, { useState } from 'react';
import ValueEditor from './ValueEditor';

const PaletteRow = ({
  index,
  row,
  isSelected,
  isExpanded,
  onMouseMove,
  onClick,
  onToggle,
  onContextMenu,
  helpContext
}) => {
  const handleClick = (e) => {
    // ignore clicks that originate inside the value editor
    if (e.target.closest('.value')) return;
    onClick();
    onToggle && onToggle();
  };

  return (
    <li
      className={`palette-row ${isSelected ? 'selected' : ''} ${isExpanded ? 'show-value' : ''}`}
      onMouseMove={onMouseMove}
      onClick={handleClick}
      onContextMenu={onContextMenu}
    >
      <span className="label">{row.label}</span>
      {isExpanded && row.item && (
        <ValueEditor
          item={row.item}
          helpContext={helpContext}
        />
      )}
    </li>
  );
};

export default PaletteRow;
