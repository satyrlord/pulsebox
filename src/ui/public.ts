import "../themes/themes.css";
import "../styles/global.css";

/**
 * The UI layer's public port.
 *
 * Composition mounts the application and holds the returned handle; everything
 * else — the store, the shell, and the control primitives — is internal to this
 * layer and imported directly by the modules that compose it. Re-exporting them
 * here would advertise a boundary that nothing crosses.
 */
export { mountPulseboxApp, type MountOptions, type PulseboxAppHandle } from "./react/mount";
export type {
  AppStoreDependencies,
  AppStorePort,
  AudioControlPort,
  AudioStatus,
  ProjectServicePort,
  SavedProjectSummary,
  WorkspaceView,
} from "./react/store/app-store";
