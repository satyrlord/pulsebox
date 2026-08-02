import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { TEST_UUID } from "../contracts/fixtures";

interface TestProcessor {
  readonly port: FakeProcessorPort;
  process(
    inputs: readonly (readonly Float32Array[])[],
    outputs: readonly (readonly Float32Array[])[],
    parameters: Readonly<Record<string, Float32Array>>,
  ): boolean;
}

type ProcessorConstructor = new (options?: AudioWorkletNodeOptions) => TestProcessor;

class FakeProcessorPort {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  readonly sent: unknown[] = [];

  postMessage(value: unknown): void {
    this.sent.push(value);
  }

  readonly close = vi.fn();

  receive(value: unknown): void {
    this.onmessage?.({ data: value } as MessageEvent<unknown>);
  }
}

class FakeAudioWorkletProcessor {
  readonly port = new FakeProcessorPort();
}

const processors = new Map<string, ProcessorConstructor>();

beforeAll(async () => {
  vi.stubGlobal("sampleRate", 48_000);
  vi.stubGlobal("currentFrame", 0);
  vi.stubGlobal("AudioWorkletProcessor", FakeAudioWorkletProcessor);
  vi.stubGlobal(
    "registerProcessor",
    vi.fn((name: string, constructor: ProcessorConstructor) => {
      processors.set(name, constructor);
    }),
  );
  await import("../../../src/engine/modules/bass-mono/bass-mono.worklet");
  await import("../../../src/engine/modules/drumline-six/drumline-six.worklet");
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("cross-module rendered timing", () => {
  it.each([44_100, 48_000])(
    "starts two worklet PCM streams together at %i Hz",
    (rate) => {
      vi.stubGlobal("sampleRate", rate);
      vi.stubGlobal("currentFrame", 10_000);
      const bass = createReadyProcessor("pulsebox-bass-mono", "bass-node");
      const drum = createReadyProcessor("pulsebox-drumline-six", "drum-node");
      scheduleOnset(bass, "bass-node", 10_032, 36);
      scheduleOnset(drum, "drum-node", 10_032, 36);
      const bassLeft = new Float32Array(128);
      const drumLeft = new Float32Array(128);

      expect(bass.process([], [[bassLeft, new Float32Array(128)]], {})).toBe(true);
      expect(drum.process([], [[drumLeft, new Float32Array(128)]], {})).toBe(true);

      const bassOnset = firstAudibleFrame(bassLeft);
      const drumOnset = firstAudibleFrame(drumLeft);
      expect(bassOnset).toBeGreaterThanOrEqual(32);
      expect(drumOnset).toBeGreaterThanOrEqual(32);
      expect(Math.abs(bassOnset - drumOnset)).toBeLessThanOrEqual(1);
    },
  );
});

describe("voice output meter", () => {
  it("meters a hard-panned voice from the louder channel", async () => {
    vi.stubGlobal("sampleRate", 48_000);
    vi.stubGlobal("currentFrame", 0);
    const { WorkletVoiceProcessor } = await import(
      "../../../src/engine/worklets/worklet-voice-processor"
    );

    // Renders only into the right channel, like a voice panned hard right.
    class RightOnlyProcessor extends WorkletVoiceProcessor<Record<string, never>> {
      protected readonly displayName = "Right Only";

      protected decodeParameterObject(): Record<string, never> {
        return {};
      }

      protected decodeParameterChanges(): Record<string, never> {
        return {};
      }

      protected applyParameters(): void {
        // No parameters.
      }

      protected triggerNoteOn(): void {
        // Renders unconditionally.
      }

      protected triggerNoteOff(): void {
        // Renders unconditionally.
      }

      protected resetDsp(): void {
        // Stateless.
      }

      protected renderBlock(
        left: Float32Array,
        right: Float32Array | undefined,
        start: number,
        end: number,
      ): void {
        for (let index = start; index < end; index += 1) {
          left[index] = 0;
          if (right !== undefined) right[index] = 0.5;
        }
      }
    }

    const processor = new RightOnlyProcessor() as unknown as TestProcessor;
    processor.port.receive(controllerEnvelope("meter-node", 0, "hello", {}));
    processor.port.receive(controllerEnvelope("meter-node", 1, "resume", {}));

    // One meter interval is sampleRate / 30 frames. Render past it.
    for (let block = 0; block * 128 < 48_000 / 30 + 128; block += 1) {
      vi.stubGlobal("currentFrame", block * 128);
      processor.process([], [[new Float32Array(128), new Float32Array(128)]], {});
    }

    const meterFrames = processor.port.sent.filter(
      (value) => (value as { readonly kind?: unknown }).kind === "meter-frame",
    );
    expect(meterFrames.length).toBeGreaterThan(0);
    expect(meterFrames[0]).toMatchObject({ payload: { level: 0.5 } });
  });
});

function createReadyProcessor(name: string, nodeId: string): TestProcessor {
  const Processor = processors.get(name);
  if (Processor === undefined) throw new Error(`Processor ${name} was not registered.`);
  const processor = new Processor();
  processor.port.receive(controllerEnvelope(nodeId, 0, "hello", {}));
  processor.port.receive(controllerEnvelope(nodeId, 1, "resume", {}));
  return processor;
}

function scheduleOnset(
  processor: TestProcessor,
  nodeId: string,
  audioFrame: number,
  note: number,
): void {
  processor.port.receive(
    controllerEnvelope(nodeId, 2, "event-batch", {
      events: [
        {
          eventId: `${nodeId}-onset`,
          audioFrame,
          priority: 2,
          data: { type: "note-on", note, velocity: 0.8, accent: false, slide: false },
        },
      ],
    }),
  );
}

function controllerEnvelope(
  nodeId: string,
  sequence: number,
  kind: string,
  payload: Readonly<Record<string, unknown>>,
) {
  return {
    protocolVersion: 1,
    sessionId: `session-${nodeId}`,
    nodeId,
    sequence,
    kind,
    projectRevision: { epoch: TEST_UUID, counter: 1 },
    payload,
  };
}

function firstAudibleFrame(samples: Float32Array): number {
  return samples.findIndex((sample) => Math.abs(sample) > 1e-7);
}
