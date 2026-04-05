import React from 'react';
import ReactDOM from 'react-dom/client';
import pkg from './package.json';
import { Provider } from 'react-redux';
import { store } from './store/store';
import App from './App';
import * as Sentry from "@sentry/react";
import { API_BASE_URL } from './constants';

console.log(`Version: ${pkg.version}`);

// Vite automatically exposes environment variables prefixed with VITE_ to the client
const sentryDsn = import.meta.env.VITE_SENTRY_DSN || '';
const isProduction = import.meta.env.PROD;

if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration(),
    ],
    // Tracing
    tracesSampleRate: isProduction ? 0.1 : 1.0, // 10% in production, 100% in development
    tracePropagationTargets: [
      "localhost",
      /^https:\/\/nw2ghqgbe5\.execute-api\.us-east-1\.amazonaws\.com/,
      new RegExp(`^${API_BASE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
    ],
    // Session Replay
    replaysSessionSampleRate: isProduction ? 0.1 : 1.0, // 10% in production, 100% in development
    replaysOnErrorSampleRate: 1.0, // Always capture replays on errors
    environment: isProduction ? 'production' : 'development',
  });
} else {
  console.warn('Sentry DSN not configured. Error tracking is disabled.');
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </React.StrictMode>
);