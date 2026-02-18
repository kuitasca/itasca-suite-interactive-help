import React, { useEffect } from 'react';

const ContextMenu = ({ visible, x, y, node, onClose, onInsertAll, onInsertLast }) => {
  useEffect(() => {
    const handleClick = () => {
      onClose && onClose();
    };

    if (visible) {
      window.addEventListener('click', handleClick);
      return () => window.removeEventListener('click', handleClick);
    }
  }, [visible, onClose]);

  if (!visible) return null;

  const handleInsertAll = (e) => {
    e.stopPropagation();
    onInsertAll && onInsertAll(node);
    onClose && onClose();
  };

  const handleInsertLast = (e) => {
    e.stopPropagation();
    onInsertLast && onInsertLast(node);
    onClose && onClose();
  };

  return (
    <div
      className="context-menu"
      style={{
        position: 'fixed',
        left: `${x}px`,
        top: `${y}px`,
        display: visible ? 'block' : 'none'
      }}
    >
      <div className="menu-item" onClick={handleInsertAll}>
        Insert all command
      </div>
      <div className="menu-item" onClick={handleInsertLast}>
        Insert last command
      </div>
    </div>
  );
};

export default ContextMenu;
