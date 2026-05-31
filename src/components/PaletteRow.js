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

  const handleMenuButtonClick = (e) => {
    // prevent the row click/toggle from firing
    e.stopPropagation();
    // forward the original mouse event to the context menu handler
    onContextMenu && onContextMenu(e);
  };

  return (
    <li
      className={`palette-row ${isSelected ? 'selected' : ''} ${isExpanded ? 'show-value' : ''}`}
      onMouseMove={onMouseMove}
      onClick={handleClick}
      onContextMenu={onContextMenu}
    >
      <span className="label">{row.display}</span>
    <button
        className="row-menu-button"
        title="Open menu"
        onClick={handleMenuButtonClick}
        onContextMenu={(e) => { e.stopPropagation(); onContextMenu && onContextMenu(e); }}
      >
        ⋮
      </button>
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
