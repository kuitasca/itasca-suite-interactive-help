import React, { useState } from 'react';
import ValueEditor from './ValueEditor';
import { ReactComponent as HelpIcon } from './assets/icons/help.svg';

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
  onShowHelp,
  helpContext,
  extractedArgValues
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
        {onShowHelp && (
          <button
            className="row-help-button"
            title="Selection Reference"
            onClick={(e) => { e.stopPropagation(); onShowHelp(row); }}
          >
            <HelpIcon className="icon" />
          </button>
        )}
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
          display={row.display}
          helpContext={helpContext}
          extractedArgValues={extractedArgValues}
        />
      )}
    </li>
  );
};

export default PaletteRow;
