import { initTRPC } from '@trpc/server'
import superjson from 'superjson'

import { DefaultCounterId } from '../models/Counter'

import { Context } from './context'
import { prisma } from './prisma'

const { router, procedure } = initTRPC.context<Context>().create({
  transformer: superjson,
})

export const appRouter = router({
  getCounter: procedure.query(async ({ ctx }) => {
    const counter = await prisma.counter.findFirstOrThrow({
      where: {
        id: DefaultCounterId,
      },
    })
    return counter.count
  }),
  incrementCounter: procedure.mutation(async ({ ctx }) => {
    const counter = await prisma.counter.update({
      where: {
        id: DefaultCounterId,
      },
      data: {
        count: {
          increment: 1,
        },
      },
    })
    return counter.count
  }),
})

export type AppRouter = typeof appRouter
