import EventEmitter from 'events'

import { initTRPC } from '@trpc/server'
import { observable } from '@trpc/server/observable'
import superjson from 'superjson'

import { DefaultCounterId } from '../models/Counter'

import { Context } from './context'
import { prisma } from './prisma'

const { router, procedure } = initTRPC.context<Context>().create({
  transformer: superjson,
})

// NOTE: In real applications, it is replaced by Redis, etc.
const emitter = new EventEmitter()

export const appRouter = router({
  getCounter: procedure.query(async ({ ctx }) => {
    try {
      const counter = await prisma.counter.findFirstOrThrow({
        where: {
          id: DefaultCounterId,
        },
      })
      return counter.count
    } catch (error) {
      console.log(error)
      return 0
    }
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
    emitter.emit('add', counter.count)
    return counter.count
  }),
  onIncrementCounter: procedure.subscription(({ ctx }) => {
    return observable<number>((emit) => {
      const onAdd = (counter: number) => {
        emit.next(counter)
      }
      emitter.on('add', onAdd)
      return () => {
        emitter.off('add', onAdd)
      }
    })
  }),
})

export type AppRouter = typeof appRouter
