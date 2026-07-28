import "../themes/themes.css";
import "../styles/global.css";

import type { PulseFader } from "./controls/pulse-fader";
import type { PulseKnob } from "./controls/pulse-knob";
import type { PulseMeter } from "./controls/pulse-meter";
import type { PulseSegmentDisplay } from "./controls/pulse-segment-display";
import type { PulseLedButton, PulseToggle } from "./controls/pulse-toggle";
import type { PulseEditorWorkspace } from "./shell/pulse-editor-workspace";
import type { PulsePatternStrip } from "./shell/pulse-pattern-strip";
import type { PulseRackModule } from "./shell/pulse-rack-module";
import type { PulseRack } from "./shell/pulse-rack";
import type { PulseSettingsPage } from "./shell/pulse-settings-page";
import type { PulseTransportBar } from "./shell/pulse-transport-bar";
import type { PulseUnsupportedSize } from "./shell/pulse-unsupported-size";
import type { PulseWorkspaceBar } from "./shell/pulse-workspace-bar";

import "./controls/pulse-fader";
import "./controls/pulse-knob";
import "./controls/pulse-meter";
import "./controls/pulse-segment-display";
import "./controls/pulse-toggle";
import "./shell/pulse-editor-workspace";
import "./shell/pulse-pattern-strip";
import "./shell/pulse-rack";
import "./shell/pulse-rack-module";
import "./shell/pulse-settings-page";
import "./shell/pulse-transport-bar";
import "./shell/pulse-unsupported-size";
import "./shell/pulse-workspace-bar";

export {
  mountPulseboxApp,
  type MountPulseboxAppOptions,
  type PulseAppStorePort,
  type PulseAudioControlPort,
  type PulseAudioStatus,
  type PulseboxAppHandle,
} from "./app/pulse-app";
export type { PulseControlEventDetail, PulseControlSource, PulseStepChangeDetail } from "./events";
export type { PulsePatternStep } from "./shell/pulse-pattern-strip";
export { PulseFader } from "./controls/pulse-fader";
export { PulseKnob } from "./controls/pulse-knob";
export { PulseLedButton, PulseToggle } from "./controls/pulse-toggle";
export { PulseMeter } from "./controls/pulse-meter";
export { PulseSegmentDisplay } from "./controls/pulse-segment-display";
export { PulseEditorWorkspace } from "./shell/pulse-editor-workspace";
export { PulsePatternStrip } from "./shell/pulse-pattern-strip";
export { PulseRack } from "./shell/pulse-rack";
export { PulseRackModule } from "./shell/pulse-rack-module";
export { PulseSettingsPage } from "./shell/pulse-settings-page";
export { PulseTransportBar } from "./shell/pulse-transport-bar";
export { PulseUnsupportedSize } from "./shell/pulse-unsupported-size";
export { PulseWorkspaceBar } from "./shell/pulse-workspace-bar";

declare global {
  interface HTMLElementTagNameMap {
    "pulse-editor-workspace": PulseEditorWorkspace;
    "pulse-fader": PulseFader;
    "pulse-knob": PulseKnob;
    "pulse-led-button": PulseLedButton;
    "pulse-meter": PulseMeter;
    "pulse-pattern-strip": PulsePatternStrip;
    "pulse-rack": PulseRack;
    "pulse-rack-module": PulseRackModule;
    "pulse-segment-display": PulseSegmentDisplay;
    "pulse-settings-page": PulseSettingsPage;
    "pulse-toggle": PulseToggle;
    "pulse-transport-bar": PulseTransportBar;
    "pulse-unsupported-size": PulseUnsupportedSize;
    "pulse-workspace-bar": PulseWorkspaceBar;
  }
}
