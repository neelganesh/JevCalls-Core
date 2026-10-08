import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Aggressively unregister all Service Workers and clear all PWA caches
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister().then((success) => {
        if (success) console.log('Successfully unregistered PWA service worker:', registration.scope);
      });
    }
  });
}

if ('caches' in window) {
  caches.keys().then((names) => {
    for (const name of names) {
      caches.delete(name);
    }
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
