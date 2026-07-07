import type { WorkbenchMediaSendType } from "@/features/workbench/queries";

type MediaSendType = WorkbenchMediaSendType;

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === "function") {
    return file.arrayBuffer();
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result);
        return;
      }
      reject(new Error("文件读取失败"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("文件读取失败"));
    reader.readAsArrayBuffer(file);
  });
}

export function readMediaDurationMs(file: File, elementName: "audio" | "video"): Promise<number | undefined> {
  if (typeof URL.createObjectURL !== "function") {
    return Promise.resolve(undefined);
  }

  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const media = document.createElement(elementName);
    let settled = false;
    const timeout = window.setTimeout(() => finish(undefined), 3000);

    function finish(value: number | undefined) {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      URL.revokeObjectURL(objectUrl);
      media.removeAttribute("src");
      resolve(value);
    }

    media.preload = "metadata";
    media.addEventListener(
      "loadedmetadata",
      () => {
        const duration = Number.isFinite(media.duration)
          ? Math.round(media.duration * 1000)
          : undefined;
        finish(duration && duration > 0 ? duration : undefined);
      },
      { once: true },
    );
    media.addEventListener("error", () => finish(undefined), { once: true });
    media.src = objectUrl;
  });
}

export function guessMimeType(fileName: string, type: MediaSendType): string {
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith(".silk")) return "audio/silk";
  if (lowerName.endsWith(".mp3")) return "audio/mpeg";
  if (lowerName.endsWith(".wav")) return "audio/wav";
  if (lowerName.endsWith(".m4a")) return "audio/mp4";
  if (lowerName.endsWith(".ogg")) return "audio/ogg";
  if (lowerName.endsWith(".webm")) return "audio/webm";
  if (lowerName.endsWith(".mp4")) return "video/mp4";
  if (lowerName.endsWith(".mov")) return "video/quicktime";
  if (lowerName.endsWith(".mkv")) return "video/x-matroska";
  if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) return "image/jpeg";
  if (lowerName.endsWith(".png")) return "image/png";
  if (lowerName.endsWith(".gif")) return "image/gif";
  if (lowerName.endsWith(".webp")) return "image/webp";
  if (lowerName.endsWith(".txt")) return "text/plain";
  if (lowerName.endsWith(".pdf")) return "application/pdf";
  if (lowerName.endsWith(".zip")) return "application/zip";
  if (type === "image") return "image/jpeg";
  if (type === "voice") return "audio/mpeg";
  if (type === "video") return "video/mp4";
  return "application/octet-stream";
}

export function inferMediaTypeFromFile(file: File): MediaSendType {
  const mimeType = file.type.toLowerCase();
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/") || file.name.toLowerCase().endsWith(".silk")) return "voice";
  if (mimeType.startsWith("video/")) return "video";
  return "file";
}

export function readTransferFiles(dataTransfer: Pick<DataTransfer, "files"> & Partial<Pick<DataTransfer, "items">> | null): File[] {
  if (!dataTransfer) return [];
  const files = Array.from(dataTransfer.files ?? []).filter(isFileLike);
  if (files.length > 0) return files;
  return Array.from(dataTransfer.items ?? [])
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter(isFileLike);
}

function isFileLike(value: unknown): value is File {
  return typeof value === "object" && value !== null && "name" in value && "size" in value && "type" in value;
}

export function selectVoiceRecordingMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return undefined;
  }
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((mimeType) => MediaRecorder.isTypeSupported(mimeType));
}

export function recordingFileNameForMimeType(mimeType: string): string {
  const lowerMimeType = mimeType.toLowerCase();
  if (lowerMimeType.includes("mp4")) return "recording.m4a";
  if (lowerMimeType.includes("ogg")) return "recording.ogg";
  if (lowerMimeType.includes("mpeg") || lowerMimeType.includes("mp3")) return "recording.mp3";
  if (lowerMimeType.includes("wav")) return "recording.wav";
  return "recording.webm";
}
