import { useCallback, useEffect, useRef, useState } from "react";

export type AudioRecorderState =
  | "idle"
  | "requesting"
  | "recording"
  | "transcribing";

type UseAudioRecorderOptions = {
  onTranscriptionComplete: (text: string) => void;
  onError?: (error: string) => void;
  transcribeEndpoint?: string;
};

export function useAudioRecorder({
  onTranscriptionComplete,
  onError,
  transcribeEndpoint = "/api/transcribe",
}: UseAudioRecorderOptions) {
  const [state, setState] = useState<AudioRecorderState>("idle");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const onTranscriptionCompleteRef = useRef(onTranscriptionComplete);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onTranscriptionCompleteRef.current = onTranscriptionComplete;
  }, [onTranscriptionComplete]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const sendForTranscription = useCallback(
    async (blob: Blob) => {
      setState("transcribing");

      try {
        const formData = new FormData();
        formData.append("file", blob, `recording.${getExtension(blob.type)}`);

        const response = await fetch(transcribeEndpoint, {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(
            data.error || `Transcription failed (${response.status})`
          );
        }

        const data: { text: string } = await response.json();

        if (data.text.trim()) {
          onTranscriptionCompleteRef.current(data.text.trim());
        }
      } catch (err) {
        onErrorRef.current?.(
          err instanceof Error ? err.message : "Failed to transcribe audio."
        );
      } finally {
        setState("idle");
      }
    },
    [transcribeEndpoint]
  );

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startRecording = useCallback(async () => {
    if (state !== "idle") return;

    // Check browser support
    if (!navigator.mediaDevices?.getUserMedia) {
      onErrorRef.current?.(
        "Your browser does not support audio recording."
      );
      return;
    }

    setState("requesting");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Pick a supported mime type
      const preferredTypes = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/ogg;codecs=opus",
      ];
      let mimeType = "";
      for (const type of preferredTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
          mimeType = type;
          break;
        }
      }

      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined
      );
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: mimeType || "audio/webm",
        });
        chunksRef.current = [];
        mediaRecorderRef.current = null;
        sendForTranscription(blob);
      };

      recorder.start();
      setState("recording");
    } catch (err) {
      stopStream();
      setState("idle");

      if (err instanceof DOMException && err.name === "NotAllowedError") {
        onErrorRef.current?.(
          "Microphone permission denied. Please allow microphone access in your browser settings."
        );
      } else {
        onErrorRef.current?.(
          err instanceof Error ? err.message : "Failed to start recording."
        );
      }
    }
  }, [state, sendForTranscription, stopStream]);

  const stopRecording = useCallback(() => {
    if (state === "recording" && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      stopStream();
    }
  }, [state, stopStream]);

  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current && state === "recording") {
      // Remove onstop handler to prevent transcription
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
      chunksRef.current = [];
      stopStream();
      setState("idle");
    }
  }, [state, stopStream]);

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.onstop = null;
        mediaRecorderRef.current.stop();
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return { state, startRecording, stopRecording, cancelRecording };
}

function getExtension(mimeType: string): string {
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("ogg")) return "ogg";
  return "webm";
}
