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
  onInsertAll,
  helpContext
}) => {
  const hasArgs = Array.isArray(row.args) && row.args.length > 0;

  const handleClick = (e) => {
    // ignore clicks that originate inside the value editor
    if (e.target.closest('.value')) return;
    onClick();
    onToggle && onToggle();
  };

  const handleInsertButtonClick = (e) => {
    e.stopPropagation();
    if (hasArgs && !isExpanded) {
      onClick();
      onToggle && onToggle();
    } else {
      onInsertAll && onInsertAll(row);
    }
  };

  const buttonTitle = hasArgs && !isExpanded ? 'Show parameters' : 'Insert command';

  return (
    <li
      className={`palette-row ${isSelected ? 'selected' : ''} ${isExpanded ? 'show-value' : ''}`}
      onMouseMove={onMouseMove}
      onClick={handleClick}
      onContextMenu={onContextMenu}
    >
      <div className="row-right">
        {hasArgs && (
          <span className="param-badge" title="Args required">{row.args.length}</span>
        )}
        <button
          className="row-menu-button"
          title={buttonTitle}
          onClick={handleInsertButtonClick}
          onContextMenu={(e) => { e.stopPropagation(); onContextMenu && onContextMenu(e); }}
        >
          &#x27A2;
        </button>
      </div>
      <span className="label">{row.display}</span>
      {isExpanded && row.item && (
        <ValueEditor
          item={row.item}
          args={row.args}
          helpContext={helpContext}
        />
      )}
    </li>
  );
};

export default PaletteRow;
