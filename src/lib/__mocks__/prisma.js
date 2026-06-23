const prisma = {
  user: {
    create: jest.fn(),
    findUnique: jest.fn(),
  },
  userIdentity: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
}

export default prisma
