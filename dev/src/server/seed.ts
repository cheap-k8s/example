import { DefaultCounterId } from '../models/Counter'

import { prisma } from './prisma'

await prisma.counter.create({
  data: {
    id: DefaultCounterId,
    count: 0,
  },
})
