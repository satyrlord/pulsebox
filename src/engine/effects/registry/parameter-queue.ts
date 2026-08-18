import type { ParameterValue } from "../../../contracts/parameters";

/** One slot stays unused so the retained queue remains below 256 changes. */
export const EFFECT_PARAMETER_QUEUE_CAPACITY = 255;

/** Fixed storage for absolute-frame effect changes on the audio thread. */
export class EffectParameterQueue {
  readonly #frames = new Float64Array(EFFECT_PARAMETER_QUEUE_CAPACITY);
  readonly #parameterIds = new Array<string | undefined>(EFFECT_PARAMETER_QUEUE_CAPACITY);
  readonly #values = new Array<ParameterValue | undefined>(EFFECT_PARAMETER_QUEUE_CAPACITY);
  #count = 0;

  get count(): number {
    return this.#count;
  }

  get firstFrame(): number {
    return this.#count === 0 ? Number.POSITIVE_INFINITY : (this.#frames[0] ?? Number.POSITIVE_INFINITY);
  }

  get firstParameterId(): string | undefined {
    return this.#parameterIds[0];
  }

  get firstValue(): ParameterValue | undefined {
    return this.#values[0];
  }

  enqueue(atFrame: number, parameterId: string, value: ParameterValue): boolean {
    for (let index = 0; index < this.#count; index += 1) {
      if (this.#frames[index] === atFrame && this.#parameterIds[index] === parameterId) {
        this.#values[index] = value;
        return true;
      }
    }
    if (this.#count >= EFFECT_PARAMETER_QUEUE_CAPACITY) return false;
    let insertion = this.#count;
    while (insertion > 0) {
      const prior = insertion - 1;
      const priorFrame = this.#frames[prior] ?? 0;
      const priorParameterId = this.#parameterIds[prior] ?? "";
      if (
        priorFrame < atFrame ||
        (priorFrame === atFrame && priorParameterId <= parameterId)
      ) {
        break;
      }
      this.#frames[insertion] = priorFrame;
      this.#parameterIds[insertion] = this.#parameterIds[prior];
      this.#values[insertion] = this.#values[prior];
      insertion = prior;
    }
    this.#frames[insertion] = atFrame;
    this.#parameterIds[insertion] = parameterId;
    this.#values[insertion] = value;
    this.#count += 1;
    return true;
  }

  removeFirst(): void {
    if (this.#count === 0) return;
    for (let index = 1; index < this.#count; index += 1) {
      this.#frames[index - 1] = this.#frames[index] ?? 0;
      this.#parameterIds[index - 1] = this.#parameterIds[index];
      this.#values[index - 1] = this.#values[index];
    }
    this.#count -= 1;
    this.#parameterIds[this.#count] = undefined;
    this.#values[this.#count] = undefined;
  }

  clearFrom(fromFrame: number): void {
    let write = 0;
    for (let read = 0; read < this.#count; read += 1) {
      const frame = this.#frames[read] ?? 0;
      if (frame >= fromFrame) continue;
      if (write !== read) {
        this.#frames[write] = frame;
        this.#parameterIds[write] = this.#parameterIds[read];
        this.#values[write] = this.#values[read];
      }
      write += 1;
    }
    for (let index = write; index < this.#count; index += 1) {
      this.#parameterIds[index] = undefined;
      this.#values[index] = undefined;
    }
    this.#count = write;
  }

  reset(): void {
    for (let index = 0; index < this.#count; index += 1) {
      this.#parameterIds[index] = undefined;
      this.#values[index] = undefined;
    }
    this.#count = 0;
  }
}
