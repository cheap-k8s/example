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

server.get('/health', () => "It's healthy!")

try {
  await server.listen({ port })
  console.log('listening on port', port)
} catch (error) {
  server.log.error(error)
  process.exit(1)
}
