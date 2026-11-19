import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import './payment-instructions.css';
import './staff-dashboard.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
