import { useEffect, useRef, useState } from "react";
import {
  recordingFileNameForMimeType,
  selectVoiceRecordingMimeType,
} from "@/features/workbench/message-media-utils";

interface VoiceRecorderOptions {
  enabled: boolean;
  onError: (message: string) => void;
  onReady: (file: File, options: { durationMs?: number }) => void | Promise<void>;
}

export function useVoiceRecorder({ enabled, onError, onReady }: VoiceRecorderOptions) {
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number | null>(null);
  const mimeTypeRef = useRef("audio/webm");
  const cancelledRef = useRef(false);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.stop();
      }
      stopStream();
    };
  }, []);

  async function toggleRecording() {
    if (recording) {
      stopRecording();
      return;
    }
    await startRecording();
  }

  async function startRecording() {
    if (!enabled || recording) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      onError("当前浏览器不支持麦克风录音，可改用选择语音文件发送");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const preferredMimeType = selectVoiceRecordingMimeType();
      const recorder = preferredMimeType ? new MediaRecorder(stream, { mimeType: preferredMimeType }) : new MediaRecorder(stream);
      const startedAt = Date.now();

      chunksRef.current = [];
      recorderRef.current = recorder;
      startedAtRef.current = startedAt;
      mimeTypeRef.current = recorder.mimeType || preferredMimeType || "audio/webm";
      cancelledRef.current = false;

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data?.size) {
          chunksRef.current.push(event.data);
        }
      });
      recorder.addEventListener(
        "stop",
        () => {
          void finishRecording();
        },
        { once: true },
      );
      recorder.addEventListener(
        "error",
        () => {
          resetState();
          stopStream();
          onError("录音失败，请重试，或改用选择语音文件发送");
        },
        { once: true },
      );
      recorder.start();
      setRecording(true);
    } catch (recordError) {
      resetState();
      stopStream();
      onError(recordError instanceof Error ? `无法开启麦克风：${recordError.message}` : "无法开启麦克风");
    }
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      resetState();
      stopStream();
      return;
    }
    recorder.stop();
  }

  async function finishRecording() {
    const chunks = chunksRef.current;
    const startedAt = startedAtRef.current;
    const durationMs = startedAt ? Math.max(1, Date.now() - startedAt) : undefined;
    const mimeType = mimeTypeRef.current || chunks[0]?.type || "audio/webm";
    const cancelled = cancelledRef.current;

    resetState();
    stopStream();

    if (cancelled) return;
    if (chunks.length === 0) {
      onError("没有录到语音内容，请重试");
      return;
    }

    const file = new File([new Blob(chunks, { type: mimeType })], recordingFileNameForMimeType(mimeType), { type: mimeType });
    await onReady(file, { durationMs });
  }

  function resetState() {
    recorderRef.current = null;
    chunksRef.current = [];
    startedAtRef.current = null;
    cancelledRef.current = false;
    setRecording(false);
  }

  function stopStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  return {
    recording,
    toggleRecording,
  };
}
