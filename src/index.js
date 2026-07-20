import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

const root = ReactDOM.createRoot(document.getElementById('root'));

if (process.env.REACT_APP_ENTRY === 'intellisense') {
  // IntelliSense mode — static requires to prevent chunk splitting
  require('./intellisense/IntelliSense.css');
  require('./App.css');
  const IntelliSenseApp = require('./intellisense/IntelliSenseApp').default;
  root.render(
    <React.StrictMode>
      <IntelliSenseApp />
    </React.StrictMode>
  );
} else {
  // Default: Palette mode
  const App = require('./App').default;
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
