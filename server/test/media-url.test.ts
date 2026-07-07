import { describe, expect, it } from "vitest";
import { signFileUrl, verifyFileSignature } from "../src/modules/media/media-url.js";

describe("媒体文件签名 URL", () => {
  it("生成 /files/:id 签名 URL，并校验 id/exp/sig 三元组", () => {
    const url = signFileUrl({
      assetId: "asset_1",
      baseUrl: "http://localhost:3000",
      expiresAt: 1_893_456_000,
      secret: "test-session-secret"
    });

    expect(url).toBe("http://localhost:3000/files/asset_1?exp=1893456000&sig=DdOnbYtsbV4lCsdSaUrfzuXJW6z-TmksedcdEU3xVz0");
    expect(verifyFileSignature({
      assetId: "asset_1",
      exp: "1893456000",
      now: 1_893_455_999,
      secret: "test-session-secret",
      sig: "DdOnbYtsbV4lCsdSaUrfzuXJW6z-TmksedcdEU3xVz0"
    })).toBe(true);
  });

  it("拒绝过期或被篡改的签名", () => {
    expect(verifyFileSignature({
      assetId: "asset_1",
      exp: "1893456000",
      now: 1_893_456_001,
      secret: "test-session-secret",
      sig: "DdOnbYtsbV4lCsdSaUrfzuXJW6z-TmksedcdEU3xVz0"
    })).toBe(false);

    expect(verifyFileSignature({
      assetId: "asset_2",
      exp: "1893456000",
      now: 1_893_455_999,
      secret: "test-session-secret",
      sig: "DdOnbYtsbV4lCsdSaUrfzuXJW6z-TmksedcdEU3xVz0"
    })).toBe(false);
  });
});
