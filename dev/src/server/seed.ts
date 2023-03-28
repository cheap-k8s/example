import { DefaultCounterId } from '../models/Counter'

import { prisma } from './prisma'

await prisma.counter.upsert({
  where: {
    id: DefaultCounterId,
  },
  update: {
    count: 0,
  },
  create: {
    count: 0,
  },
})
