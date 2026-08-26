import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { pingUniqueVisitor } from './lib/visitorPing';
import './styles/global.css';
import './styles/app.css';

pingUniqueVisitor();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
