import { jest } from "@jest/globals";

const uploadStreamEnd = jest.fn();
const uploadStream = jest.fn((options, callback) => {
  queueMicrotask(() =>
    callback(null, {
      secure_url: "https://res.cloudinary.com/demo/image/upload/alice.png",
      public_id: "bujo/avatars/demo-users/alice",
    }),
  );
  return { end: uploadStreamEnd };
});

jest.unstable_mockModule("cloudinary", () => ({
  v2: {
    config: jest.fn(),
    uploader: {
      upload_stream: uploadStream,
      destroy: jest.fn(),
    },
  },
}));

const { uploadAvatarImage } = await import(
  "../services/cloudinaryAvatarService.js"
);

describe("uploadAvatarImage", () => {
  beforeEach(() => {
    uploadStream.mockClear();
    uploadStreamEnd.mockClear();
  });

  it("seed 可指定固定 public ID 並覆寫同名頭像", async () => {
    const buffer = Buffer.from("avatar");

    await uploadAvatarImage(
      { buffer },
      { publicId: "demo-users/alice" },
    );

    expect(uploadStream).toHaveBeenCalledWith(
      expect.objectContaining({
        public_id: "demo-users/alice",
        overwrite: true,
        invalidate: true,
      }),
      expect.any(Function),
    );
    expect(uploadStreamEnd).toHaveBeenCalledWith(buffer);
  });

  it("既有 API 呼叫未指定 public ID 時維持原上傳 options", async () => {
    await uploadAvatarImage({ buffer: Buffer.from("avatar") });

    expect(uploadStream).toHaveBeenCalledWith(
      {
        folder: "bujo/avatars",
        resource_type: "image",
      },
      expect.any(Function),
    );
  });
});
