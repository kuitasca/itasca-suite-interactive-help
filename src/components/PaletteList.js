import React, { forwardRef } from 'react';
import PaletteRow from './PaletteRow';

const PaletteList = forwardRef((
  {
    visibleRows,
    selectedIndex,
    expandedRows,
    onToggleExpand,
    onSelectRow,
    onContextMenu,
    onRowClick,
    onInsertAll,
    helpContext
  },
  ref
) => {
  // expandedRows is now controlled by parent

  const handleRowClick = (index, row) => {
    onRowClick(row, index);
    onToggleExpand && onToggleExpand(index);
  };

  const handleRowContextMenu = (e, index, row) => {
    e.preventDefault();
    e.stopPropagation();
    onContextMenu(e.clientX, e.clientY, row, index);
  };

  return (
    <div className="palette-list">
    <ul
      ref={ref}
      id="results"
      className="palette"
      onContextMenu={(e) => e.preventDefault()}
    >
      {visibleRows.map((row, index) => (
        <PaletteRow
          key={index}
          index={index}
          row={row}
          isSelected={selectedIndex === index}
          isExpanded={expandedRows ? expandedRows[index] : false}
          onMouseMove={() => onSelectRow(index)}
          onClick={() => handleRowClick(index, row)}
          onToggle={() => onToggleExpand && onToggleExpand(index)}
          onContextMenu={(e) => handleRowContextMenu(e, index, row)}
          onInsertAll={onInsertAll}
          helpContext={helpContext}
        />
      ))}
    </ul>
    </div>
  );
});

PaletteList.displayName = 'PaletteList';

export default PaletteList;
