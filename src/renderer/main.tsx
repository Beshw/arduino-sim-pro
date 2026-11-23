import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { getState, setState } from './store';
import * as A from './actions';

// test / automation hooks (read-only state access + actions)
(window as any).__aspState = getState;
(window as any).__aspSet = setState;
(window as any).__aspActions = A;

createRoot(document.getElementById('root')!).render(<App />);
