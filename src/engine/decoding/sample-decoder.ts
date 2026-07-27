import type { DecodedAudio, SupportedCodec } from "./bundled-decoders";

interface PendingRequest {
  readonly resolve: (audio: DecodedAudio) => void;
  readonly reject: (error: Error) => void;
}

interface WorkerDecoded {
  readonly kind: "decoded";
  readonly requestId: string;
  readonly codec: SupportedCodec;
  readonly sampleRate: number;
  readonly frames: number;
  readonly channelData: readonly ArrayBuffer[];
}

interface WorkerDecodeError {
  readonly kind: "decode-error";
  readonly requestId: string;
  readonly message: string;
}

export class SampleDecoder {
  readonly #worker: Worker;
  readonly #pending = new Map<string, PendingRequest>();
  #nextRequest = 0;
  #disposed = false;

  constructor(worker = new Worker(new URL("./decoder-worker.ts", import.meta.url), { type: "module" })) {
    this.#worker = worker;
    worker.addEventListener("message", this.#onMessage);
    worker.addEventListener("error", this.#onError);
  }

  decode(source: ArrayBuffer): Promise<DecodedAudio> {
    if (this.#disposed) return Promise.reject(new Error("Sample decoder is disposed."));
    const requestId = `decode-${String(this.#nextRequest)}`;
    this.#nextRequest += 1;
    return new Promise((resolve, reject) => {
      this.#pending.set(requestId, { resolve, reject });
      this.#worker.postMessage({ kind: "decode", requestId, source }, [source]);
    });
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#worker.removeEventListener("message", this.#onMessage);
    this.#worker.removeEventListener("error", this.#onError);
    this.#worker.terminate();
    for (const request of this.#pending.values()) request.reject(new Error("Sample decoder was disposed."));
    this.#pending.clear();
  }

  readonly #onMessage = (event: MessageEvent<unknown>): void => {
    if (!isWorkerResult(event.data)) return;
    const pending = this.#pending.get(event.data.requestId);
    if (pending === undefined) return;
    this.#pending.delete(event.data.requestId);
    if (event.data.kind === "decode-error") {
      pending.reject(new Error(event.data.message));
      return;
    }
    pending.resolve(
      Object.freeze({
        codec: event.data.codec,
        sampleRate: event.data.sampleRate,
        frames: event.data.frames,
        channelData: event.data.channelData.map((buffer) => new Float32Array(buffer)),
      }),
    );
  };

  readonly #onError = (): void => {
    for (const request of this.#pending.values()) request.reject(new Error("The audio decoder worker failed."));
    this.#pending.clear();
  };
}

function isWorkerResult(value: unknown): value is WorkerDecoded | WorkerDecodeError {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    (value.kind === "decoded" || value.kind === "decode-error") &&
    "requestId" in value &&
    typeof value.requestId === "string"
  );
}
