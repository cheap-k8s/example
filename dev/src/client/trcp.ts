import { createTRPCReact } from '@trpc/react-query'
import { createWSClient, wsLink } from '@trpc/client'
import { QueryClient } from '@tanstack/react-query'
import superjson from 'superjson'

import type { AppRouter } from '../server/router'

import { getEnvVars } from './env'

const env = getEnvVars()

export const trpcWSLink = wsLink({
  client: createWSClient({
    url: `ws://${env.apiServerHost}:${env.apiServerPort}/trpc`,
  }),
})
export const trpc = createTRPCReact<AppRouter>()

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
})

export const trpcClient = trpc.createClient({
  transformer: superjson,
  links: [trpcWSLink],
})
