import { render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { describe, expect, it } from "vitest";

import { LevelMeter } from "../../src/ui/react/controls/LevelMeter";

/**
 * Environment contract for the component project: TSX compiles, jsdom renders,
 * `@testing-library/jest-dom` matchers are registered by the setup file, and
 * StrictMode is active so a component that leaks a listener or an animation
 * frame across its double-invoked effects fails here.
 *
 * React's own rendering and Zustand's own subscription behaviour are their
 * projects' contracts, not Pulsebox's, so they are not asserted here.
 */
describe("component test environment", () => {
  it("renders TSX through jsdom with the extended matchers registered", () => {
    render(<output data-testid="probe">ready</output>);
    // `toHaveTextContent` comes from the setup file rather than plain Vitest.
    expect(screen.getByTestId("probe")).toHaveTextContent("ready");
  });

  it("mounts a Pulsebox component under StrictMode without leaking its loop", () => {
    // The meter owns a canvas, an animation loop, a mutation observer, and a
    // visibility listener, which makes it the strictest cleanup case in the UI.
    const view = render(
      <StrictMode>
        <LevelMeter label="Probe output" level={0} />
      </StrictMode>,
    );

    expect(screen.getByRole("meter", { name: "Probe output" })).toBeInTheDocument();
    expect(() => {
      view.unmount();
    }).not.toThrow();
  });
});
