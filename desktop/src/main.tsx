import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { loadAppConfig } from './services/appConfig';
import './index.css';

// Paths come from ~/.myaos/config.json, so load them before the first render.
loadAppConfig().finally(() => {
  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});
