import ws from '@fastify/websocket'
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify'
import { fastify } from 'fastify'
import cors from '@fastify/cors'

import { appRouter } from './router'
import { createContext } from './context'

const port = 3000
const server = fastify({ logger: true })

await server.register(cors, {
  maxAge: 86_400,
})
await server.register(ws)
await server.register(fastifyTRPCPlugin, {
  prefix: '/trpc',
  useWSS: true,
  trpcOptions: { router: appRouter, createContext },
})

server.get('/healthz', () => 'OK\n')

try {
  await server.listen({ port, host: '0.0.0.0' })
  console.log('listening on port', port, process.env.db_uri)
} catch (error) {
  server.log.error(error)
  process.exit(1)
}
