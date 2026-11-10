import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import App from './App.jsx';
import ChartEditor from './ui/ChartEditor.jsx';
import { getState } from './lib/store.js';

// handy for troubleshooting from Chrome's console (F12)
window.DeckStudio = { getState };

const params = new URLSearchParams(location.search);
const root = createRoot(document.getElementById('root'));
if (params.get('view') === 'chart-editor') {
  root.render(<ChartEditor name={params.get('name')} />);
} else {
  root.render(<App join={params.get('join')} />);
}
