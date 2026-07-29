export interface TransportSnapshot {
  readonly status: "stopped" | "playing" | "paused";
  readonly tempo: number;
  readonly positionTicks: number;
  readonly startMarkerTicks: number;
}

const TICKS_PER_QUARTER = 960;

export class TransportClock {
  readonly #sampleRate: number;
  #status: TransportSnapshot["status"] = "stopped";
  #tempo = 130;
  #positionTicks = 0;
  #startMarkerTicks = 0;
  #anchorFrame = 0;

  constructor(sampleRate: number, tempo = 130) {
    if (!Number.isFinite(sampleRate) || sampleRate <= 0)
      throw new RangeError("sampleRate must be positive");
    this.#sampleRate = sampleRate;
    this.setTempo(tempo, 0);
  }

  getSnapshot(currentFrame: number): TransportSnapshot {
    return Object.freeze({
      status: this.#status,
      tempo: this.#tempo,
      positionTicks: this.#positionAt(currentFrame),
      startMarkerTicks: this.#startMarkerTicks,
    });
  }

  play(currentFrame: number): boolean {
    validateFrame(currentFrame);
    if (this.#status === "playing") return false;
    this.#anchorFrame = currentFrame;
    this.#status = "playing";
    return true;
  }

  pause(currentFrame: number): boolean {
    validateFrame(currentFrame);
    if (this.#status !== "playing") return false;
    this.#positionTicks = this.#positionAt(currentFrame);
    this.#anchorFrame = currentFrame;
    this.#status = "paused";
    return true;
  }

  stop(currentFrame: number): boolean {
    validateFrame(currentFrame);
    const alreadyAtMarker =
      this.#status === "stopped" && this.#positionTicks === this.#startMarkerTicks;
    if (alreadyAtMarker) return false;
    this.#positionTicks = this.#startMarkerTicks;
    this.#anchorFrame = currentFrame;
    this.#status = "stopped";
    return true;
  }

  seekWhileStopped(positionTicks: number, currentFrame: number): void {
    validateTicks(positionTicks);
    validateFrame(currentFrame);
    if (this.#status === "playing")
      throw new Error("Stop or pause before setting the transport marker.");
    this.#positionTicks = positionTicks;
    this.#startMarkerTicks = positionTicks;
    this.#anchorFrame = currentFrame;
  }

  setTempo(tempo: number, currentFrame: number): void {
    validateFrame(currentFrame);
    if (!Number.isFinite(tempo) || tempo < 40 || tempo > 240)
      throw new RangeError("Tempo must be between 40 and 240 BPM.");
    if (this.#status === "playing") this.#positionTicks = this.#positionAt(currentFrame);
    this.#anchorFrame = currentFrame;
    this.#tempo = tempo;
  }

  ticksToFrames(ticks: number): number {
    validateTicks(ticks);
    return Math.round((ticks * 60 * this.#sampleRate) / (this.#tempo * TICKS_PER_QUARTER));
  }

  #positionAt(currentFrame: number): number {
    validateFrame(currentFrame);
    if (this.#status !== "playing") return this.#positionTicks;
    const elapsedFrames = Math.max(0, currentFrame - this.#anchorFrame);
    return (
      this.#positionTicks +
      Math.round((elapsedFrames * this.#tempo * TICKS_PER_QUARTER) / (60 * this.#sampleRate))
    );
  }
}

function validateFrame(frame: number): void {
  if (!Number.isSafeInteger(frame) || frame < 0)
    throw new RangeError("Audio frame must be a non-negative safe integer.");
}

function validateTicks(ticks: number): void {
  if (!Number.isSafeInteger(ticks) || ticks < 0)
    throw new RangeError("Transport ticks must be a non-negative safe integer.");
}
