import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import App from './app/App.jsx';
import { AuthProvider } from './app/state/AuthContext.jsx';
import { DataProvider } from './app/state/DataContext.jsx';
import './shared/styles/base.css';
import './shared/styles/tailwind.css';

const Router = import.meta.env.VITE_ROUTER_MODE === 'hash' ? HashRouter : BrowserRouter;

// En el build de demostración (VITE_DEMO=true) se simula la API con datos sintéticos antes de montar la app.
// En el build normal este bloque no se incluye.
const preparar = import.meta.env.VITE_DEMO === 'true'
  ? import('./demo/demoApi.js').then(modulo => modulo.instalarApiDemo())
  : Promise.resolve();

preparar.then(() => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <Router>
        <AuthProvider>
          <DataProvider>
            <App />
          </DataProvider>
        </AuthProvider>
      </Router>
    </React.StrictMode>,
  );
});
