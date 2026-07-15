import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

const root = ReactDOM.createRoot(document.getElementById('root'));

if (process.env.REACT_APP_ENTRY === 'intellisense') {
  // IntelliSense mode
  import('./intellisense/IntelliSense.css');
  import('./App.css');
  const { default: IntelliSenseApp } = await import('./intellisense/IntelliSenseApp');
  root.render(
    <React.StrictMode>
      <IntelliSenseApp />
    </React.StrictMode>
  );
} else {
  // Default: Palette mode
  const { default: App } = await import('./App');
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
