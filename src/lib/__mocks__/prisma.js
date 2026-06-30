import { jest } from "@jest/globals";

const prisma = {
  user: {
    create: jest.fn(),
    findUnique: jest.fn(),
  },
  userIdentity: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  friendship: {
    findFirst: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
  },
};

export default prisma;
