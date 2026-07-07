import { jest } from "@jest/globals";

jest.unstable_mockModule("../app.js", () => ({
  default: {
    listen: jest.fn((port, cb) => {
      cb?.();
      return { close: jest.fn() };
    }),
  },
}));

describe("server.js 的 process 級保底防線", () => {
  let exitSpy;
  let errorSpy;

  beforeAll(async () => {
    exitSpy = jest.spyOn(process, "exit").mockImplementation(() => {});
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    await import("../server.js");
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it("unhandledRejection 只記錄 log，不會呼叫 process.exit", () => {
    process.emit("unhandledRejection", new Error("boom"));

    expect(errorSpy).toHaveBeenCalledWith("Unhandled Rejection：", expect.any(Error));
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("uncaughtException 會記錄 log 並呼叫 process.exit(1)", () => {
    process.emit("uncaughtException", new Error("boom"));

    expect(errorSpy).toHaveBeenCalledWith("Uncaught Exception：", expect.any(Error));
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
