import React from 'react';
import ReactDOM from 'react-dom/client';
import '../index.css';
import '../App.css';
import './IntelliSense.css';
import IntelliSenseApp from './IntelliSenseApp';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <IntelliSenseApp />
  </React.StrictMode>
);
