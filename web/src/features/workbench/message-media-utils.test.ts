import { describe, expect, it, vi } from "vitest";
import {
  arrayBufferToBase64,
  guessMimeType,
  inferMediaTypeFromFile,
  recordingFileNameForMimeType,
  selectVoiceRecordingMimeType,
} from "./message-media-utils";

describe("message-media-utils", () => {
  it("将文件二进制转换为 base64", () => {
    expect(arrayBufferToBase64(new Uint8Array([1, 2, 3]).buffer)).toBe("AQID");
  });

  it("按扩展名和发送类型推断 MIME", () => {
    expect(guessMimeType("voice.silk", "voice")).toBe("audio/silk");
    expect(guessMimeType("clip.webm", "voice")).toBe("audio/webm");
    expect(guessMimeType("movie.mp4", "video")).toBe("video/mp4");
    expect(guessMimeType("photo.PNG", "image")).toBe("image/png");
    expect(guessMimeType("archive.bin", "file")).toBe("application/octet-stream");
    expect(guessMimeType("unknown", "voice")).toBe("audio/mpeg");
  });

  it("按浏览器 File 信息推断发送媒体类型", () => {
    expect(inferMediaTypeFromFile(new File([""], "photo.png", { type: "image/png" }))).toBe("image");
    expect(inferMediaTypeFromFile(new File([""], "voice.silk", { type: "" }))).toBe("voice");
    expect(inferMediaTypeFromFile(new File([""], "voice.webm", { type: "audio/webm" }))).toBe("voice");
    expect(inferMediaTypeFromFile(new File([""], "movie.mp4", { type: "video/mp4" }))).toBe("video");
    expect(inferMediaTypeFromFile(new File([""], "note.txt", { type: "text/plain" }))).toBe("file");
  });

  it("按录音 MIME 生成文件名", () => {
    expect(recordingFileNameForMimeType("audio/mp4")).toBe("recording.m4a");
    expect(recordingFileNameForMimeType("audio/ogg;codecs=opus")).toBe("recording.ogg");
    expect(recordingFileNameForMimeType("audio/mpeg")).toBe("recording.mp3");
    expect(recordingFileNameForMimeType("audio/wav")).toBe("recording.wav");
    expect(recordingFileNameForMimeType("audio/webm")).toBe("recording.webm");
  });

  it("选择浏览器支持的首个录音 MIME", () => {
    class FakeMediaRecorder {
      static isTypeSupported = vi.fn((mimeType: string) => mimeType === "audio/webm");
    }
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder);

    expect(selectVoiceRecordingMimeType()).toBe("audio/webm");
    expect(FakeMediaRecorder.isTypeSupported).toHaveBeenCalledWith("audio/webm;codecs=opus");
    expect(FakeMediaRecorder.isTypeSupported).toHaveBeenCalledWith("audio/webm");
  });
});
