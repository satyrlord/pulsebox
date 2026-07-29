import { act, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { GestureId } from "../../src/contracts";
import { Knob } from "../../src/ui/react/controls/Knob";

interface Recorded {
  readonly inputs: number[];
  readonly commits: { value: number; gestureId: GestureId }[];
}

function renderKnob(overrides: Partial<React.ComponentProps<typeof Knob>> = {}) {
  const recorded: Recorded = { inputs: [], commits: [] };
  const view = render(
    <Knob
      controlId="cutoff"
      label="Cutoff"
      value={500}
      min={0}
      max={1_000}
      step={10}
      defaultValue={720}
      precision={0}
      onInput={(value) => recorded.inputs.push(value)}
      onCommit={(value, gestureId) => recorded.commits.push({ value, gestureId })}
      {...overrides}
    />,
  );
  const dial = screen.getByRole("slider", { name: "Cutoff" });
  return { recorded, dial, view };
}

/** jsdom does not implement pointer capture, so the calls are stubbed. */
function stubPointerCapture(element: Element): void {
  Object.assign(element, {
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
    hasPointerCapture: () => true,
  });
}

describe("Knob", () => {
  it("exposes the range and current value to assistive technology", () => {
    const { dial } = renderKnob();
    expect(dial).toHaveAttribute("aria-valuemin", "0");
    expect(dial).toHaveAttribute("aria-valuemax", "1000");
    expect(dial).toHaveAttribute("aria-valuenow", "500");
  });

  it("steps with the arrow keys and commits once on release", () => {
    const { recorded, dial } = renderKnob();

    fireEvent.keyDown(dial, { key: "ArrowUp" });
    fireEvent.keyDown(dial, { key: "ArrowUp" });
    fireEvent.keyDown(dial, { key: "ArrowUp" });
    expect(recorded.commits).toHaveLength(0);
    expect(recorded.inputs).toEqual([510, 520, 530]);

    fireEvent.keyUp(dial, { key: "ArrowUp" });
    expect(recorded.commits).toHaveLength(1);
    expect(recorded.commits[0]?.value).toBe(530);
  });

  it("uses a larger increment for PageUp and PageDown", () => {
    const { recorded, dial } = renderKnob();
    fireEvent.keyDown(dial, { key: "PageUp" });
    fireEvent.keyUp(dial, { key: "PageUp" });
    expect(recorded.commits[0]?.value).toBe(600);
  });

  it("jumps to the bounds with Home and End", () => {
    const { recorded, dial } = renderKnob();
    fireEvent.keyDown(dial, { key: "End" });
    fireEvent.keyUp(dial, { key: "End" });
    fireEvent.keyDown(dial, { key: "Home" });
    fireEvent.keyUp(dial, { key: "Home" });
    expect(recorded.commits.map((one) => one.value)).toEqual([1_000, 0]);
  });

  it("clamps at the declared range", () => {
    const { recorded, dial } = renderKnob({ value: 1_000 });
    fireEvent.keyDown(dial, { key: "ArrowUp" });
    fireEvent.keyUp(dial, { key: "ArrowUp" });
    // Already at the maximum, so nothing changed and nothing was committed.
    expect(recorded.inputs).toEqual([]);
    expect(recorded.commits).toEqual([]);
  });

  it("abandons a keyboard gesture on Escape and restores the prior value", () => {
    const { recorded, dial } = renderKnob();
    fireEvent.keyDown(dial, { key: "ArrowUp" });
    fireEvent.keyDown(dial, { key: "ArrowUp" });
    fireEvent.keyDown(dial, { key: "Escape" });

    expect(recorded.commits).toEqual([]);
    expect(recorded.inputs.at(-1)).toBe(500);
    expect(dial).toHaveAttribute("aria-valuenow", "500");
  });

  it("commits a repeated keyboard gesture once when focus leaves the control", () => {
    const { recorded, dial } = renderKnob();
    fireEvent.keyDown(dial, { key: "ArrowUp" });
    fireEvent.keyDown(dial, { key: "ArrowUp" });

    fireEvent.blur(dial);
    fireEvent.keyUp(dial, { key: "ArrowUp" });

    expect(recorded.commits).toHaveLength(1);
    expect(recorded.commits[0]?.value).toBe(520);
  });

  it("commits the last wheel preview once when the window loses focus", () => {
    vi.useFakeTimers();
    const { recorded, dial } = renderKnob();
    fireEvent.wheel(dial, { deltaY: -1 });

    fireEvent.blur(window);
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(recorded.commits).toHaveLength(1);
    expect(recorded.commits[0]?.value).toBe(600);
    vi.useRealTimers();
  });

  it("commits the last valid preview when the control disconnects", () => {
    const { recorded, dial, view } = renderKnob();
    fireEvent.keyDown(dial, { key: "ArrowUp" });

    view.unmount();

    expect(recorded.commits).toHaveLength(1);
    expect(recorded.commits[0]?.value).toBe(510);
  });

  it("resets to the default on double click and commits once", () => {
    const { recorded, dial } = renderKnob();
    fireEvent.doubleClick(dial);
    expect(recorded.commits).toHaveLength(1);
    expect(recorded.commits[0]?.value).toBe(720);
  });

  it("coalesces a pointer drag into one commit", () => {
    const { recorded, dial } = renderKnob();
    stubPointerCapture(dial);

    fireEvent.pointerDown(dial, { pointerId: 1, button: 0, clientY: 100 });
    fireEvent.pointerMove(dial, { pointerId: 1, clientY: 80 });
    fireEvent.pointerMove(dial, { pointerId: 1, clientY: 60 });
    fireEvent.pointerMove(dial, { pointerId: 1, clientY: 40 });
    expect(recorded.commits).toHaveLength(0);
    expect(recorded.inputs.length).toBeGreaterThan(1);

    fireEvent.pointerUp(dial, { pointerId: 1 });
    expect(recorded.commits).toHaveLength(1);
    // One drag is one undo entry, so every preview shares the commit's gesture.
    expect(recorded.commits[0]?.gestureId).toBeDefined();
  });

  it("raises the value when dragged upward", () => {
    const { recorded, dial } = renderKnob();
    stubPointerCapture(dial);
    fireEvent.pointerDown(dial, { pointerId: 1, button: 0, clientY: 100 });
    fireEvent.pointerMove(dial, { pointerId: 1, clientY: 10 });
    fireEvent.pointerUp(dial, { pointerId: 1 });
    expect(recorded.commits[0]?.value).toBeGreaterThan(500);
  });

  it("commits a wheel burst once after it goes idle", () => {
    vi.useFakeTimers();
    const { recorded, dial } = renderKnob();

    for (let index = 0; index < 4; index += 1) {
      fireEvent.wheel(dial, { deltaY: -1 });
    }
    expect(recorded.commits).toHaveLength(0);

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(recorded.commits).toHaveLength(1);
    vi.useRealTimers();
  });

  it("uses a fine wheel increment when Shift is held", () => {
    vi.useFakeTimers();
    const { recorded, dial } = renderKnob();

    fireEvent.wheel(dial, { deltaY: -1, shiftKey: true });
    expect(recorded.inputs[0]).toBe(510);

    fireEvent.wheel(dial, { deltaY: -1 });
    expect(recorded.inputs[1]).toBe(610);

    act(() => {
      vi.advanceTimersByTime(300);
    });
    vi.useRealTimers();
  });

  it("does not leak a wheel listener across a StrictMode remount", () => {
    vi.useFakeTimers();
    const recorded: Recorded = { inputs: [], commits: [] };
    render(
      <StrictMode>
        <Knob
          controlId="cutoff"
          label="Cutoff"
          value={500}
          min={0}
          max={1_000}
          step={10}
          defaultValue={720}
          precision={0}
          onInput={(value) => recorded.inputs.push(value)}
          onCommit={(value, gestureId) => recorded.commits.push({ value, gestureId })}
        />
      </StrictMode>,
    );

    fireEvent.wheel(screen.getByRole("slider", { name: "Cutoff" }), { deltaY: -1 });
    // One coarse wheel notch is ten steps. A duplicated listener would apply it
    // twice and land on 700.
    expect(recorded.inputs).toEqual([600]);

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(recorded.commits).toHaveLength(1);
    vi.useRealTimers();
  });
});
