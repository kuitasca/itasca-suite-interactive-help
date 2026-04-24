import React, { useEffect, useRef, useState } from 'react';

const ContextMenu = ({
  visible,
  x,
  y,
  node,
  onClose,
  onInsertAll,
  onInsertLast,
  onUpOneLevel,
  onShowHelp,
  helpContext
}) => {

  const menuRef = useRef(null);
  const [position, setPosition] = useState({ x, y });

  useEffect(() => {
    if (!visible || !menuRef.current) return;

    const rect = menuRef.current.getBoundingClientRect();

    const menuHeight = rect.height;
    const menuWidth = rect.width;

    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    let newX = x;
    let newY = y;

    const margin = 8;

    // flip vertically
    if (y + menuHeight > viewportHeight - margin) {
      newY = y - menuHeight;
    }

    // flip horizontally
    if (x + menuWidth > viewportWidth - margin) {
      newX = x - menuWidth;
    }

    setPosition({ x: newX, y: newY });

  }, [visible, x, y]);

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

  const handleUpOneLevel = (e) => {
    e.stopPropagation();
    onUpOneLevel && onUpOneLevel();
    onClose && onClose();
  };

  const handleInsertLast = (e) => {
    e.stopPropagation();
    onInsertLast && onInsertLast(node);
    onClose && onClose();
  };
  const handleShowHelp = (e) => {
    e.stopPropagation();
    onShowHelp && onShowHelp(node);
    onClose && onClose();
  };

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`
      }}
    >
      <div className="menu-item" onClick={handleUpOneLevel}>
        Up one level
      </div>

      <div className="separator" />

      {!helpContext?.isFish && (
        <div className="menu-item" onClick={handleInsertAll}>
          Insert all command
        </div>
      )}

      <div className="menu-item" onClick={handleInsertLast}>
        Insert command
      </div>
      <div className="separator" />
      <div className="menu-item" onClick={handleShowHelp}>
        Selection Reference
      </div>
    </div>
  );
};

export default ContextMenu;