import React from 'react';

const TypeOverlay = ({ query, hidden }) => {
  if (hidden) return null;
  const hasQuery = query && query.trim().length > 0;

  return (
    <div id="typeOverlay" className={hasQuery ? 'has-query' : ''}>
      {hasQuery ? query : 'Start typing to search…'}
    </div>
  );
};

export default TypeOverlay;
