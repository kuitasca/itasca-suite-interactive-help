import React from 'react';

const TypeOverlay = ({ query }) => {
  const show = query && query.trim().length > 0;

  return (
    <div
      id="typeOverlay"
      style={{
        display: show ? 'block' : 'none'
      }}
    >
      {query}
    </div>
  );
};

export default TypeOverlay;
