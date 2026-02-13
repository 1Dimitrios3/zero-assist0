import { experimental_transcribe as transcribe } from "ai";
import { openai } from "@ai-sdk/openai";

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof Blob)) {
      return Response.json({ error: "No audio file provided" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();

    const result = await transcribe({
      model: openai.transcription("whisper-1"),
      audio: new Uint8Array(arrayBuffer),
      providerOptions: {
        openai: { language: "en" },
      },
    });

    return Response.json({ text: result.text });
  } catch (error) {
    console.error("Transcription error:", error);
    return Response.json(
      { error: "Transcription failed. Please try again." },
      { status: 500 }
    );
  }
}
