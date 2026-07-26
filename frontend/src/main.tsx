import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { createQueryClient } from './shared/api/queries';
import { SessionProvider } from './shared/session/SessionProvider';
import './index.css';

const container = document.getElementById('root');
if (!container) throw new Error('No #root element — index.html is malformed.');

/**
 * Provider order matters: SessionProvider uses the query client to clear the cache on sign-out,
 * so it must sit INSIDE QueryClientProvider.
 */
createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={createQueryClient()}>
      <BrowserRouter>
        <SessionProvider>
          <App />
        </SessionProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
