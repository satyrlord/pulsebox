import { defineElement } from "../define-element";
import { requiredElement } from "../required-element";

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

export class PulseMeter extends HTMLElement {
  static readonly observedAttributes = ["label", "peak", "value"];

  readonly #canvas: HTMLCanvasElement;
  readonly #context: CanvasRenderingContext2D;
  readonly #output: HTMLOutputElement;
  #abortController: AbortController | undefined;
  #animationFrame: number | undefined;
  #displayValue = 0;
  #resizeObserver: ResizeObserver | undefined;
  #targetValue = 0;
  #themeObserver: MutationObserver | undefined;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        :host,
        *,
        *::before,
        *::after {
          box-sizing: border-box;
        }
        :host {
          display: inline-grid;
          width: 16px;
          min-width: var(--pulse-target-min, 24px);
          height: 84px;
          min-height: var(--pulse-target-min, 24px);
          place-items: stretch center;
        }
        canvas {
          width: 10px;
          height: 100%;
          border: var(--pulse-border-thin, 1px) solid var(--pulse-color-border-default, #6d7881);
          border-radius: 2px;
          background: var(--pulse-color-meter-track, #20262b);
        }
        output {
          position: absolute;
          width: 1px;
          height: 1px;
          overflow: hidden;
          clip-path: inset(50%);
          white-space: nowrap;
        }
      </style>
      <canvas aria-hidden="true"></canvas>
      <output></output>
    `;
    this.#canvas = requiredElement(shadow, "canvas", HTMLCanvasElement);
    const context = this.#canvas.getContext("2d");
    if (context === null) throw new Error("Pulsebox requires a 2D canvas context for meters.");
    this.#context = context;
    this.#output = requiredElement(shadow, "output", HTMLOutputElement);
  }

  get label(): string {
    return this.getAttribute("label") ?? "Level";
  }

  set label(value: string) {
    this.setAttribute("label", value);
  }

  get peak(): boolean {
    return this.hasAttribute("peak");
  }

  set peak(value: boolean) {
    this.toggleAttribute("peak", value);
  }

  get value(): number {
    return this.#targetValue;
  }

  set value(value: number) {
    this.#targetValue = clamp01(value);
    this.setAttribute("value", String(this.#targetValue));
    this.#startAnimation();
    this.#patchOutput();
  }

  connectedCallback(): void {
    this.#targetValue = clamp01(Number(this.getAttribute("value") ?? 0));
    this.#displayValue = this.#targetValue;
    this.#abortController?.abort();
    this.#abortController = new AbortController();
    document.addEventListener(
      "visibilitychange",
      () => {
        if (document.hidden) this.#stopAnimation();
        else this.#startAnimation();
      },
      { signal: this.#abortController.signal },
    );
    this.#resizeObserver = new ResizeObserver(() => this.#draw());
    this.#resizeObserver.observe(this);
    const themeHost = this.closest("[data-theme]") ?? document.documentElement;
    this.#themeObserver = new MutationObserver(() => this.#draw());
    this.#themeObserver.observe(themeHost, {
      attributeFilter: ["data-high-contrast", "data-theme"],
    });
    this.#patchOutput();
    this.#draw();
  }

  disconnectedCallback(): void {
    this.#abortController?.abort();
    this.#abortController = undefined;
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = undefined;
    this.#themeObserver?.disconnect();
    this.#themeObserver = undefined;
    this.#stopAnimation();
  }

  attributeChangedCallback(name: string): void {
    if (!this.isConnected) return;
    if (name === "value") {
      this.#targetValue = clamp01(Number(this.getAttribute("value") ?? 0));
      this.#startAnimation();
    }
    this.#patchOutput();
    this.#draw();
  }

  #draw(): void {
    const rect = this.#canvas.getBoundingClientRect();
    const scale = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(rect.width * scale));
    const height = Math.max(1, Math.round(rect.height * scale));
    if (this.#canvas.width !== width || this.#canvas.height !== height) {
      this.#canvas.width = width;
      this.#canvas.height = height;
    }
    const style = getComputedStyle(this);
    const track = style.getPropertyValue("--pulse-color-meter-track").trim() || "#20262b";
    const low = style.getPropertyValue("--pulse-color-meter-low").trim() || "#62d28a";
    const mid = style.getPropertyValue("--pulse-color-meter-mid").trim() || "#f2c14e";
    const high = style.getPropertyValue("--pulse-color-meter-high").trim() || "#ff7667";
    this.#context.clearRect(0, 0, width, height);
    this.#context.fillStyle = track;
    this.#context.fillRect(0, 0, width, height);
    const fillHeight = height * this.#displayValue;
    const gradient = this.#context.createLinearGradient(0, height, 0, 0);
    gradient.addColorStop(0, low);
    gradient.addColorStop(0.7, low);
    gradient.addColorStop(0.85, mid);
    gradient.addColorStop(1, high);
    this.#context.fillStyle = gradient;
    this.#context.fillRect(0, height - fillHeight, width, fillHeight);
    if (this.peak) {
      this.#context.fillStyle = high;
      this.#context.fillRect(0, 0, width, Math.max(2, scale * 2));
    }
  }

  #patchOutput(): void {
    const percent = Math.round(this.#targetValue * 100);
    const peakText = this.peak ? ", peak" : "";
    this.#output.textContent = `${String(percent)}%${peakText}`;
    this.#output.setAttribute("aria-label", `${this.label}: ${String(percent)}%${peakText}`);
  }

  #startAnimation(): void {
    if (!this.isConnected || document.hidden || this.#animationFrame !== undefined) return;
    const tick = (): void => {
      const difference = this.#targetValue - this.#displayValue;
      if (Math.abs(difference) < 0.002) {
        this.#displayValue = this.#targetValue;
        this.#animationFrame = undefined;
        this.#draw();
        return;
      }
      this.#displayValue += difference > 0 ? difference * 0.45 : difference * 0.12;
      this.#draw();
      this.#animationFrame = requestAnimationFrame(tick);
    };
    this.#animationFrame = requestAnimationFrame(tick);
  }

  #stopAnimation(): void {
    if (this.#animationFrame !== undefined) cancelAnimationFrame(this.#animationFrame);
    this.#animationFrame = undefined;
  }
}

defineElement("pulse-meter", PulseMeter);
