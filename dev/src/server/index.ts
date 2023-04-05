import ws from '@fastify/websocket'
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify'
import { fastify } from 'fastify'
import cors from '@fastify/cors'

import { appRouter } from './router'
import { createContext } from './context'
import { prisma } from './prisma'

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
server.get('/healthz-with-db', async (_, rep) => {
  try {
    await prisma.$connect()
    return 'OK\n'
  } catch (erorr) {
    return rep.code(503).send('Unavailable\n')
  }
})

try {
  await server.listen({ port, host: '0.0.0.0' })
  console.log('listening on port', port, process.env.db_uri)
} catch (error) {
  server.log.error(error)
  process.exit(1)
}
