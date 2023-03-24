import { createTRPCReact } from '@trpc/react-query'
import { createWSClient, wsLink } from '@trpc/client'
import { QueryClient } from '@tanstack/react-query'
import superjson from 'superjson'

import type { AppRouter } from '../server/router'

const host = import.meta.env.VITE_API_SERVER_HOST
const port = import.meta.env.VITE_API_SERVER_PORT

export const trpcWSLink = wsLink({
  client: createWSClient({ url: `ws://${host}:${port}/trpc` }),
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
