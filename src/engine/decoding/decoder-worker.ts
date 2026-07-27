/// <reference lib="webworker" />

import { decodeBundledAudio } from "./bundled-decoders";

interface DecodeRequest {
  readonly kind: "decode";
  readonly requestId: string;
  readonly source: ArrayBuffer;
}

const scope = self as DedicatedWorkerGlobalScope;

scope.addEventListener("message", (event: MessageEvent<unknown>) => {
  void handleMessage(event.data);
});

async function handleMessage(value: unknown): Promise<void> {
  if (!isDecodeRequest(value)) return;
  try {
    const decoded = await decodeBundledAudio(value.source);
    const channelData = decoded.channelData.map((channel) => channel.buffer);
    scope.postMessage(
      {
        kind: "decoded",
        requestId: value.requestId,
        codec: decoded.codec,
        sampleRate: decoded.sampleRate,
        frames: decoded.frames,
        channelData,
      },
      channelData,
    );
  } catch (error) {
    scope.postMessage({
      kind: "decode-error",
      requestId: value.requestId,
      message: error instanceof Error ? error.message : "Audio decoding failed.",
    });
  }
}

function isDecodeRequest(value: unknown): value is DecodeRequest {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    value.kind === "decode" &&
    "requestId" in value &&
    typeof value.requestId === "string" &&
    "source" in value &&
    value.source instanceof ArrayBuffer
  );
}
