import { writeFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AudioTranscodeService } from "../src/modules/media/audio-transcode.service.js";

const childProcess = vi.hoisted(() => ({
  execFile: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFile: childProcess.execFile,
}));

describe("AudioTranscodeService", () => {
  beforeEach(() => {
    childProcess.execFile.mockReset();
    childProcess.execFile.mockImplementation(
      (command: string, args: string[], callback: (error: Error | null) => void) => {
        if (command.includes("decoder")) {
          writeFileSync(args[1]!, Buffer.from([4, 5, 6]));
        }
        if (command === "ffmpeg") {
          writeFileSync(args.at(-1)!, Buffer.from([7, 8, 9]));
        }
        callback(null);
      },
    );
    vi.stubEnv("GEWE_SILK_DECODER_PATH", "/custom/silk/decoder");
  });

  it("入站 Silk 语音先用 silk decoder 解为 PCM，再用 ffmpeg 生成 MP3", async () => {
    const service = new AudioTranscodeService();

    const output = await service.transcodeVoiceToMp3(Buffer.from([1, 2, 3]), {
      sourceMimeType: "audio/silk",
      sourceFileName: "voice.silk",
    });

    expect(output).toEqual(Buffer.from([7, 8, 9]));
    expect(childProcess.execFile).toHaveBeenCalledTimes(2);

    const decoderCall = childProcess.execFile.mock.calls[0] as [
      string,
      string[],
      (error: Error | null) => void,
    ];
    const ffmpegCall = childProcess.execFile.mock.calls[1] as [
      string,
      string[],
      (error: Error | null) => void,
    ];
    expect(decoderCall[0]).toBe("/custom/silk/decoder");
    expect(decoderCall[1][0]).toMatch(/voice\.silk$/);
    expect(decoderCall[1][1]).toMatch(/voice\.pcm$/);
    expect(ffmpegCall[0]).toBe("ffmpeg");
    expect(ffmpegCall[1]).toEqual(
      expect.arrayContaining(["-f", "s16le", "-ar", "24000", "-ac", "1"]),
    );
    expect(ffmpegCall[1][ffmpegCall[1].indexOf("-i") + 1]).toBe(decoderCall[1][1]);
    expect(ffmpegCall[1].at(-1)).toMatch(/output\.mp3$/);
  });
});
