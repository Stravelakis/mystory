import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './styles/deco-noir.js'; // side effect: defines window.DecoNoir

// Outside React on purpose: init installs document-level listeners and must run
// exactly once. In StrictMode an effect would run twice.
(window as any).DecoNoir?.init({
  ground: 'on',
  grain: true,
  glow: true,
  spark: false, // a spark under the cursor is wrong company for this material
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
