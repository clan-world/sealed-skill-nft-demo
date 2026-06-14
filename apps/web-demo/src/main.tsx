import React from 'react';
import ReactDOM from 'react-dom/client';
import { DynamicContextProvider } from '@dynamic-labs/sdk-react-core';
import { SolanaWalletConnectors } from '@dynamic-labs/solana';
import { App } from './App.js';
import './styles.css';

const dynamicEnvironmentId = import.meta.env.VITE_DYNAMIC_ENVIRONMENT_ID;

function MissingDynamicConfig() {
  return (
    <main>
      <header className="hero">
        <div>
          <p className="eyebrow">Dynamic wallet setup</p>
          <h1>Dynamic environment required</h1>
          <p>Set VITE_DYNAMIC_ENVIRONMENT_ID and enable Solana in the Dynamic dashboard to run the wallet-connected demo.</p>
        </div>
      </header>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {dynamicEnvironmentId ? (
      <DynamicContextProvider
        settings={{
          environmentId: dynamicEnvironmentId,
          walletConnectors: [SolanaWalletConnectors],
          initialAuthenticationMode: 'connect-only',
          appName: 'NFTee Demo',
          networkValidationMode: 'never'
        }}
      >
        <App />
      </DynamicContextProvider>
    ) : (
      <MissingDynamicConfig />
    )}
  </React.StrictMode>
);
