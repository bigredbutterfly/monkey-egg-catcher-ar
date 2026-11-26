import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Route benign TensorFlow Lite XNNPACK informational messages to console.info
const origError = console.error;
const origWarn = console.warn;

function isTfLiteInfo(args: any[]): boolean {
  const str = args.map(a => (typeof a === 'string' ? a : (a?.message || ''))).join(' ');
  return str.includes('INFO: Created TensorFlow Lite') || str.includes('XNNPACK delegate');
}

console.error = (...args: any[]) => {
  if (isTfLiteInfo(args)) {
    console.info(...args);
    return;
  }
  origError.apply(console, args);
};

console.warn = (...args: any[]) => {
  if (isTfLiteInfo(args)) {
    console.info(...args);
    return;
  }
  origWarn.apply(console, args);
};

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <App />
);