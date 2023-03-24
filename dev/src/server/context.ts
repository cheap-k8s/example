import { inferAsyncReturnType } from '@trpc/server'
import { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify'

export function createContext({ req, res }: CreateFastifyContextOptions) {
  // NOTE: In a typical application, a context such as 'userId' is set here.
  return {}
}

export type Context = inferAsyncReturnType<typeof createContext>
