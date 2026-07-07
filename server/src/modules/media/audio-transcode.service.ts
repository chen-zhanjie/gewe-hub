import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { Injectable } from "@nestjs/common";

const execFileAsync = promisify(execFile);

export interface VoiceTranscodeOptions {
  sourceMimeType: string;
  sourceFileName?: string;
  decoderPath?: string;
}

export interface OutboundSilkOptions extends VoiceTranscodeOptions {
  encoderPath?: string;
  decoderPath?: string;
}

@Injectable()
export class AudioTranscodeService {
  async transcodeVoiceToMp3(bytes: Buffer, options: VoiceTranscodeOptions): Promise<Buffer> {
    const directory = await mkdtemp(join(tmpdir(), "gewehub-voice-"));
    const inputPath = join(directory, resolveInputFileName(options.sourceFileName));
    const pcmPath = join(directory, "voice.pcm");
    const outputPath = join(directory, "output.mp3");
    const ffmpegInputPath = isSilkAudio(options.sourceMimeType, options.sourceFileName)
      ? pcmPath
      : inputPath;
    try {
      await writeFile(inputPath, bytes);
      if (ffmpegInputPath === pcmPath) {
        const decoder = options.decoderPath ?? process.env.GEWE_SILK_DECODER_PATH ?? "/opt/silk-v3-decoder/silk/decoder";
        await execFileAsync(decoder, [inputPath, pcmPath]);
      }
      const ffmpegArgs = [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
      ];
      if (ffmpegInputPath === pcmPath) {
        ffmpegArgs.push("-f", "s16le", "-ar", "24000", "-ac", "1");
      }
      ffmpegArgs.push(
        "-i",
        ffmpegInputPath,
        "-vn",
        "-acodec",
        "libmp3lame",
        outputPath,
      );
      await execFileAsync("ffmpeg", ffmpegArgs);
      return await readFile(outputPath);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  }

  async transcodeVoiceToSilk(bytes: Buffer, options: OutboundSilkOptions): Promise<Buffer> {
    const directory = await mkdtemp(join(tmpdir(), "gewehub-outbound-voice-"));
    const inputPath = join(directory, resolveInputFileName(options.sourceFileName));
    const pcmPath = join(directory, "voice.pcm");
    const silkPath = join(directory, "voice.silk");
    const decodedPcmPath = join(directory, "voice.decoded.pcm");
    const encoder = options.encoderPath ?? process.env.GEWE_SILK_ENCODER_PATH ?? "/opt/silk-v3-encoder/silk/encoder";
    const decoder = options.decoderPath ?? process.env.GEWE_SILK_DECODER_PATH ?? "/opt/silk-v3-decoder/silk/decoder";
    try {
      await writeFile(inputPath, bytes);
      await execFileAsync("ffmpeg", [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        inputPath,
        "-af",
        "loudnorm=I=-16:TP=-1.5:LRA=11",
        "-f",
        "s16le",
        "-ar",
        "24000",
        "-ac",
        "1",
        pcmPath,
      ]);
      await execFileAsync(encoder, [pcmPath, silkPath, "-Fs_API", "24000", "-tencent"]);
      await execFileAsync(decoder, [silkPath, decodedPcmPath]);
      return await readFile(silkPath);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  }
}

function resolveInputFileName(sourceFileName: string | undefined): string {
  if (!sourceFileName) return "input.voice";
  const safe = sourceFileName.replace(/[^\w.-]+/g, "_");
  return safe || "input.voice";
}

function isSilkAudio(mimeType: string, fileName: string | undefined): boolean {
  return (
    mimeType.toLowerCase().includes("silk") ||
    (fileName?.toLowerCase().endsWith(".silk") ?? false)
  );
}
