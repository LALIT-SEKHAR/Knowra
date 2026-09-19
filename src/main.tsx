import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { installPdfCompatPolyfills } from './utils/pdfCompat';
import './index.css';
import App from './App.tsx';

installPdfCompatPolyfills();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
