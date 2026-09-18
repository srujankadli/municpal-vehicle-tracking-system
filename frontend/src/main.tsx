import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './design-system/tokens.css';
import 'leaflet/dist/leaflet.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Failed to find root element');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
