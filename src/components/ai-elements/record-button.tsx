"use client";

import { type AudioRecorderState } from "@/hooks/use-audio-recorder";
import { PromptInputButton } from "./prompt-input";
import { Loader2Icon, MicIcon } from "lucide-react";

type RecordButtonProps = {
  state: AudioRecorderState;
  onStart: () => void;
  onStop: () => void;
  className?: string;
};

export function RecordButton({
  state,
  onStart,
  onStop,
  className,
}: RecordButtonProps) {
  if (state === "transcribing") {
    return (
      <PromptInputButton disabled aria-label="Transcribing audio" className={className}>
        <Loader2Icon className="size-4 animate-spin" />
      </PromptInputButton>
    );
  }

  if (state === "recording") {
    return (
      <PromptInputButton
        onPointerUp={onStop}
        onPointerLeave={onStop}
        aria-label="Release to stop recording"
        className={className}
      >
        <span className="relative flex items-center justify-center">
          <span className="absolute size-4 rounded-full bg-purple-500/15 animate-[ripple_1.5s_ease-out_infinite]" />
          <span className="absolute size-4 rounded-full bg-purple-500/15 animate-[ripple_1.5s_ease-out_0.5s_infinite]" />
          <MicIcon className="relative size-4 text-purple-500" />
        </span>
      </PromptInputButton>
    );
  }

  return (
    <PromptInputButton
      onPointerDown={(e) => {
        e.preventDefault();
        onStart();
      }}
      disabled={state === "requesting"}
      aria-label="Hold to record"
      className={className}
    >
      <MicIcon className="size-4" />
    </PromptInputButton>
  );
}
