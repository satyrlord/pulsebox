/**
 * Click-safe playback for one prepared mono or stereo PCM source.
 *
 * The reader owns only sample boundaries. Callers keep their own voice and
 * synthesis envelopes. It has no allocation path in `render()`, so a worklet
 * can use it once for each audio frame.
 */

export const SAMPLE_BOUNDARY_FADE_IN_SECONDS = 0.002;
export const SAMPLE_BOUNDARY_FADE_OUT_SECONDS = 0.004;

const MINIMUM_PLAYBACK_RATE = 1e-6;

export interface SampleLoop {
  readonly startFrame: number;
  readonly endFrame: number;
}

export interface SampleStart {
  /** The first source frame. Fractional offsets use linear interpolation. */
  readonly startFrame?: number;
  /** The exclusive source-frame boundary. */
  readonly endFrame?: number;
  /** An optional loop inside the selected source range. */
  readonly loop?: SampleLoop;
  /** A same-voice restart can omit this fade without moving its transient. */
  readonly fadeIn?: boolean;
}

/**
 * Reads prepared planar PCM with linear boundary ramps.
 *
 * The constructor measures one DC value for each source channel. It runs only
 * during voice preparation. `render()` subtracts those values before it applies
 * the per-channel boundary gains.
 */
export class SampleBoundaryPlayer {
  readonly #channels: readonly Float32Array[];
  readonly #channelCount: 1 | 2;
  readonly #frameCount: number;
  readonly #leftDcOffset: number;
  readonly #rightDcOffset: number;
  readonly #fadeInFrames: number;
  readonly #fadeOutFrames: number;
  #endFrame: number;
  #cursor = 0;
  #loopStart = -1;
  #loopEnd = -1;
  #fadeInFrame = 0;
  #fadeInEnabled = true;
  #naturalFadeFrame = -1;
  #releaseFrame = 0;
  #releasing = false;
  #active = false;
  #hasHeldFrame = false;
  #heldLeft = 0;
  #heldRight = 0;
  #left = 0;
  #right = 0;

  constructor(channels: readonly Float32Array[], outputSampleRate: number) {
    if (!Number.isFinite(outputSampleRate) || outputSampleRate <= 0) {
      throw new RangeError("Output sample rate must be a positive finite number.");
    }
    if (channels.length !== 1 && channels.length !== 2) {
      throw new RangeError("A sample must have one or two channels.");
    }
    const first = channels[0];
    if (!(first instanceof Float32Array) || first.length === 0) {
      throw new RangeError("A sample channel must contain at least one frame.");
    }
    const second = channels[1];
    if (channels.length === 2 && (!(second instanceof Float32Array) || second.length !== first.length)) {
      throw new RangeError("Stereo sample channels must have the same frame count.");
    }

    this.#channels = channels;
    this.#channelCount = channels.length === 1 ? 1 : 2;
    this.#frameCount = first.length;
    this.#leftDcOffset = measureDcOffset(first);
    this.#rightDcOffset = second === undefined ? this.#leftDcOffset : measureDcOffset(second);
    this.#fadeInFrames = framesForDuration(outputSampleRate, SAMPLE_BOUNDARY_FADE_IN_SECONDS);
    this.#fadeOutFrames = framesForDuration(outputSampleRate, SAMPLE_BOUNDARY_FADE_OUT_SECONDS);
    this.#endFrame = this.#frameCount;
  }

  get active(): boolean {
    return this.#active;
  }

  get channelCount(): 1 | 2 {
    return this.#channelCount;
  }

  get frameCount(): number {
    return this.#frameCount;
  }

  get fadeInFrames(): number {
    return this.#fadeInFrames;
  }

  get fadeOutFrames(): number {
    return this.#fadeOutFrames;
  }

  /** Starts at a safe source boundary and clears a prior release. */
  start(options: SampleStart = {}): void {
    const startFrame = clampFrame(options.startFrame, 0, this.#frameCount - 1, 0);
    const endFrame = clampIntegerFrame(
      options.endFrame,
      startFrame + 1,
      this.#frameCount,
      this.#frameCount,
    );
    const loop = options.loop;
    let loopStart = -1;
    let loopEnd = -1;
    if (
      loop !== undefined &&
      Number.isFinite(loop.startFrame) &&
      Number.isFinite(loop.endFrame) &&
      startFrame < loop.endFrame
    ) {
      const candidateStart = clampIntegerFrame(loop.startFrame, startFrame, endFrame - 1, startFrame);
      const candidateEnd = clampIntegerFrame(loop.endFrame, candidateStart + 1, endFrame, endFrame);
      if (candidateStart < candidateEnd) {
        loopStart = candidateStart;
        loopEnd = candidateEnd;
      }
    }

    this.#endFrame = endFrame;
    this.#cursor = startFrame;
    this.#loopStart = loopStart;
    this.#loopEnd = loopEnd;
    this.#fadeInEnabled = options.fadeIn ?? true;
    this.#fadeInFrame = this.#fadeInEnabled ? 0 : this.#fadeInFrames;
    this.#naturalFadeFrame = -1;
    this.#releaseFrame = 0;
    this.#releasing = false;
    this.#active = true;
    this.#hasHeldFrame = false;
    this.#heldLeft = 0;
    this.#heldRight = 0;
    this.#left = 0;
    this.#right = 0;
  }

  /** Starts the specified linear four-millisecond release. */
  release(): void {
    if (!this.#active || this.#releasing) return;
    this.#releasing = true;
    this.#releaseFrame = 0;
  }

  /** Stops without rendering another source frame. Use only for hard resets. */
  stop(): void {
    this.#active = false;
    this.#releasing = false;
    this.#naturalFadeFrame = -1;
    this.#hasHeldFrame = false;
    this.#heldLeft = 0;
    this.#heldRight = 0;
    this.#left = 0;
    this.#right = 0;
  }

  /**
   * Renders one source frame. The caller reads the channels with `channel()`.
   *
   * Playback rate is a source-frame advance per output frame. A live rate change
   * changes the next source position but does not restart either fade.
   */
  render(playbackRate: number): boolean {
    this.#left = 0;
    this.#right = 0;
    if (!this.#active) return false;
    if (!Number.isFinite(playbackRate) || playbackRate <= 0) {
      this.stop();
      return false;
    }
    const rate = Math.max(MINIMUM_PLAYBACK_RATE, playbackRate);
    const fadeInGain = this.#fadeInEnabled
      ? Math.min(1, this.#fadeInFrame / this.#fadeInFrames)
      : 1;
    const releaseGain = this.#releasing
      ? Math.max(0, 1 - this.#releaseFrame / this.#fadeOutFrames)
      : 1;
    const commonGain = Math.min(fadeInGain, releaseGain);

    if (this.#loopStart >= 0 && this.#cursor >= this.#loopStart && this.#cursor < this.#loopEnd) {
      this.#renderLoopFrame(rate, commonGain);
    } else {
      this.#beginNaturalFadeIfRequired(rate);
      const naturalGain =
        this.#naturalFadeFrame < 0
          ? 1
          : Math.max(0, 1 - this.#naturalFadeFrame / this.#fadeOutFrames);
      this.#renderFiniteFrame(rate, Math.min(commonGain, naturalGain));
    }

    this.#fadeInFrame += 1;
    if (this.#naturalFadeFrame >= 0) {
      this.#naturalFadeFrame += 1;
      if (this.#naturalFadeFrame >= this.#fadeOutFrames) this.#active = false;
    }
    if (this.#releasing) {
      this.#releaseFrame += 1;
      if (this.#releaseFrame >= this.#fadeOutFrames) this.#active = false;
    }
    return this.#active;
  }

  /** Returns the current prepared source value for the requested output channel. */
  channel(index: 0 | 1): number {
    if (index === 0 || this.#channelCount === 1) return this.#left;
    return this.#right;
  }

  #renderFiniteFrame(rate: number, commonGain: number): void {
    if (this.#cursor >= this.#endFrame) {
      if (!this.#hasHeldFrame) {
        this.#active = false;
        return;
      }
      this.#left = this.#heldLeft * commonGain;
      this.#right = this.#heldRight * commonGain;
      return;
    }

    const left = this.#readChannel(0, this.#cursor, 0, this.#endFrame);
    const right =
      this.#channelCount === 2 ? this.#readChannel(1, this.#cursor, 0, this.#endFrame) : left;
    this.#heldLeft = left;
    this.#heldRight = right;
    this.#hasHeldFrame = true;
    this.#left = left * commonGain;
    this.#right = right * commonGain;
    this.#cursor += rate;
    if (this.#loopStart >= 0 && this.#cursor >= this.#loopEnd) {
      const overshoot = this.#cursor - this.#loopEnd;
      this.#cursor = this.#wrapLoopFrame(this.#loopStart + overshoot);
    }
  }

  /** Starts a fixed output-time tail before a finite source can end abruptly. */
  #beginNaturalFadeIfRequired(rate: number): void {
    if (this.#releasing || this.#naturalFadeFrame >= 0) return;
    if (this.#cursor >= this.#endFrame) {
      this.#naturalFadeFrame = 0;
      return;
    }
    const outputFramesToEnd = Math.ceil((this.#endFrame - this.#cursor) / rate);
    if (outputFramesToEnd > this.#fadeOutFrames) return;
    // A source that starts inside its final four milliseconds has no full-gain
    // interval. Align its two boundary ramps so even a two-frame source stays
    // below the jump limit. A later rate change starts a new four-millisecond
    // output ramp and holds the last rendered source frame if necessary.
    this.#naturalFadeFrame = this.#hasHeldFrame
      ? 0
      : Math.max(0, this.#fadeOutFrames - outputFramesToEnd);
  }

  #renderLoopFrame(rate: number, commonGain: number): void {
    const loopStart = this.#loopStart;
    const loopEnd = this.#loopEnd;
    const remainingFrames = loopEnd - this.#cursor;
    const outputFramesToBoundary = remainingFrames / rate;
    const tailGain = Math.min(1, Math.max(0, outputFramesToBoundary / this.#fadeOutFrames));
    const headGain =
      outputFramesToBoundary < this.#fadeInFrames
        ? Math.min(1, Math.max(0, 1 - outputFramesToBoundary / this.#fadeInFrames))
        : 0;
    const headFrame =
      headGain === 0
        ? loopStart
        : this.#wrapLoopFrame(loopStart + (this.#fadeInFrames - outputFramesToBoundary) * rate);

    this.#writeChannels(
      this.#cursor,
      loopStart,
      loopEnd,
      tailGain * commonGain,
      headFrame,
      headGain * commonGain,
    );
    this.#cursor += rate;
    if (this.#cursor >= loopEnd) {
      const overshoot = this.#cursor - loopEnd;
      this.#cursor = this.#wrapLoopFrame(loopStart + this.#fadeInFrames * rate + overshoot);
    }
  }

  #writeChannels(
    tailFrame: number,
    lower: number,
    upper: number,
    tailGain: number,
    headFrame: number,
    headGain: number,
  ): void {
    this.#left =
      this.#readChannel(0, tailFrame, lower, upper) * tailGain +
      this.#readChannel(0, headFrame, lower, upper) * headGain;
    if (this.#channelCount === 2) {
      this.#right =
        this.#readChannel(1, tailFrame, lower, upper) * tailGain +
        this.#readChannel(1, headFrame, lower, upper) * headGain;
    } else {
      this.#right = this.#left;
    }
  }

  #readChannel(index: 0 | 1, frame: number, lower: number, upper: number): number {
    const channelIndex = index === 1 && this.#channelCount === 2 ? 1 : 0;
    const channel = this.#channels[channelIndex];
    const dcOffset = channelIndex === 0 ? this.#leftDcOffset : this.#rightDcOffset;
    const boundedFrame = Math.min(Math.max(frame, lower), upper - 1);
    const frameIndex = Math.floor(boundedFrame);
    const nextIndex = Math.min(frameIndex + 1, upper - 1);
    const fraction = boundedFrame - frameIndex;
    const current = (channel?.[frameIndex] ?? 0) - dcOffset;
    const next = (channel?.[nextIndex] ?? 0) - dcOffset;
    return current + (next - current) * fraction;
  }

  #wrapLoopFrame(frame: number): number {
    const span = this.#loopEnd - this.#loopStart;
    if (span <= 0) return this.#loopStart;
    const relative = frame - this.#loopStart;
    return this.#loopStart + relative - Math.floor(relative / span) * span;
  }
}

function framesForDuration(sampleRate: number, seconds: number): number {
  return Math.max(1, Math.round(sampleRate * seconds));
}

function clampFrame(value: number | undefined, minimum: number, maximum: number, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, value));
}

function clampIntegerFrame(
  value: number | undefined,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  return Math.floor(clampFrame(value, minimum, maximum, fallback));
}

function measureDcOffset(channel: Float32Array): number {
  const scale = 1 / channel.length;
  let offset = 0;
  for (const value of channel) {
    if (!Number.isFinite(value)) throw new RangeError("Sample PCM must contain only finite values.");
    offset += value * scale;
  }
  if (!Number.isFinite(offset)) throw new RangeError("Sample DC offset is not finite.");
  return offset;
}
