import { defineElement } from "../define-element";
import { PulseRangeControl } from "./range-control";

export class PulseKnob extends PulseRangeControl {
}

defineElement("pulse-knob", PulseKnob);
