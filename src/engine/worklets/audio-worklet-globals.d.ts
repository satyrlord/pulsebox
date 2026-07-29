export {};

declare global {
  const currentFrame: number;
  const sampleRate: number;

  declare abstract class AudioWorkletProcessor {
    readonly port: MessagePort;
    constructor(options?: AudioWorkletNodeOptions);
    readonly process: (
      inputs: readonly (readonly Float32Array[])[],
      outputs: readonly (readonly Float32Array[])[],
      parameters: Readonly<Record<string, Float32Array>>,
    ) => boolean;
  }

  declare function registerProcessor(
    name: string,
    processorCtor: new (options?: AudioWorkletNodeOptions) => AudioWorkletProcessor,
  ): void;
}
