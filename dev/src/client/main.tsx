import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React, { FC, useMemo } from 'react'
import ReactDOM from 'react-dom/client'

import App from './App'
import './index.css'
import { queryClient, trpc, trpcClient } from './trcp'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </trpc.Provider>
  </React.StrictMode>,
)
