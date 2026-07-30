import { memo, useMemo } from "react";

import type { PluginManifest, RackSlotId } from "../../../contracts";
import type { RackModuleState } from "../../../state/public";
import { AuditionButton } from "../controls/AuditionButton";
import { Knob } from "../controls/Knob";
import { LevelMeter } from "../controls/LevelMeter";
import { useAppStore, useDependencies } from "../store/app-store-context";
import { cx } from "../class-names";
import styles from "./RackModule.module.css";

interface RackModuleProps {
  readonly slotId: RackSlotId;
  readonly slotNumber: number;
  readonly module: RackModuleState | undefined;
  readonly canMoveLeft: boolean;
  readonly canMoveRight: boolean;
  readonly hasEmptySlot: boolean;
  readonly previousSlotId: RackSlotId | undefined;
  readonly nextSlotId: RackSlotId | undefined;
  readonly firstEmptySlotId: RackSlotId | undefined;
}

function accentStyle(manifest: PluginManifest | undefined): React.CSSProperties {
  const accent = manifest?.ui.moduleAccent;
  if (accent === undefined) return {};
  return {
    "--module-accent": accent.accent,
    "--module-accent-muted": accent.accentMuted,
    "--module-led": accent.led,
    "--module-control-ring": accent.controlRing,
  } as React.CSSProperties;
}

/**
 * Memoized so a rack re-render only produces new output for the module whose
 * data changed. Every prop is a primitive or a frozen state object, so
 * reference equality is a sound test.
 */
export const RackModule = memo(function RackModule(props: RackModuleProps) {
  const { module, slotId, slotNumber } = props;
  const { manifestFor, addablePluginIds } = useDependencies();

  const selectedModuleId = useAppStore((state) => state.project.ui.selectedModuleId);
  const collapsed = useAppStore((state) =>
    module === undefined ? false : state.project.ui.collapsedModuleIds.has(module.id),
  );
  const level = useAppStore((state) =>
    module === undefined ? 0 : (state.meterLevels[module.id] ?? 0),
  );
  const addModule = useAppStore((state) => state.addModule);
  const removeModule = useAppStore((state) => state.removeModule);
  const duplicateModule = useAppStore((state) => state.duplicateModule);
  const moveModule = useAppStore((state) => state.moveModule);
  const selectModule = useAppStore((state) => state.selectModule);
  const toggleCollapse = useAppStore((state) => state.toggleCollapse);
  const selectVoice = useAppStore((state) => state.selectVoice);
  const selectedVoice = useAppStore((state) =>
    module === undefined ? undefined : state.selectedVoiceByModule[module.id],
  );
  const startAudition = useAppStore((state) => state.startAudition);
  const stopAudition = useAppStore((state) => state.stopAudition);
  const commitParameter = useAppStore((state) => state.commitParameter);
  const previewParameter = useAppStore((state) => state.previewParameter);

  const manifest = module === undefined ? undefined : manifestFor(module.pluginId);
  const style = useMemo(() => accentStyle(manifest), [manifest]);

  if (module === undefined || manifest === undefined) {
    return (
      <section
        className={styles.module}
        data-component="rack-module"
        data-label="Empty"
        aria-label={`Rack slot ${String(slotNumber).padStart(2, "0")}, empty`}
      >
        <header className={styles.header}>
          <span className={styles.slot}>{String(slotNumber).padStart(2, "0")}</span>
          <span className={styles.title}>Empty</span>
        </header>
        <div className={styles.addRow}>
          {addablePluginIds.map((pluginId) => {
            const candidate = manifestFor(pluginId);
            if (candidate === undefined) return null;
            return (
              <button
                key={pluginId}
                type="button"
                className={styles.action}
                onClick={() => {
                  addModule(slotId, pluginId);
                }}
              >
                {`Add ${candidate.productName}`}
              </button>
            );
          })}
        </div>
      </section>
    );
  }

  const selected = module.id === selectedModuleId;
  const voices = manifest.kind === "instrument" ? manifest.voices : [];
  const selectedVoiceId = selectedVoice ?? voices[0]?.id;
  const compact = manifest.ui.compactControls
    .map((control) => manifest.parameters.find((one) => one.id === control.parameterId))
    .filter((descriptor) => descriptor !== undefined);

  return (
    <section
      className={cx(styles.module, selected && styles.selected)}
      style={style}
      data-component="rack-module"
      data-label={manifest.productName}
      data-selected={selected}
      data-collapsed={collapsed}
      aria-label={`Rack slot ${String(slotNumber).padStart(2, "0")}, ${manifest.productName}`}
    >
      <header className={styles.header}>
        <span className={styles.slot}>{String(slotNumber).padStart(2, "0")}</span>
        <span className={styles.title}>{manifest.productName}</span>
        <AuditionButton
          label={manifest.productName}
          className={styles.action}
          onStart={() => {
            startAudition(module.id);
          }}
          onStop={() => {
            stopAudition(module.id);
          }}
        />
        <LevelMeter
          label={`${manifest.productName} output level`}
          level={level}
          width={6}
          height={18}
        />
      </header>

      <div className={styles.actions} role="group" aria-label={`${manifest.productName} actions`}>
        <button
          type="button"
          className={styles.action}
          aria-label="Select module"
          disabled={selected}
          onClick={() => {
            selectModule(module.id);
          }}
        >
          Select
        </button>
        <button
          type="button"
          className={styles.action}
          aria-label="Move left"
          disabled={!props.canMoveLeft || props.previousSlotId === undefined}
          onClick={() => {
            if (props.previousSlotId !== undefined) moveModule(module.id, props.previousSlotId);
          }}
        >
          &#8592;
        </button>
        <button
          type="button"
          className={styles.action}
          aria-label="Move right"
          disabled={!props.canMoveRight || props.nextSlotId === undefined}
          onClick={() => {
            if (props.nextSlotId !== undefined) moveModule(module.id, props.nextSlotId);
          }}
        >
          &#8594;
        </button>
        <button
          type="button"
          className={styles.action}
          aria-label="Duplicate module"
          disabled={!props.hasEmptySlot || props.firstEmptySlotId === undefined}
          onClick={() => {
            if (props.firstEmptySlotId !== undefined) {
              duplicateModule(module.id, props.firstEmptySlotId);
            }
          }}
        >
          Dup
        </button>
        <button
          type="button"
          className={styles.action}
          aria-label={collapsed ? "Expand module" : "Collapse module"}
          aria-expanded={!collapsed}
          onClick={() => {
            toggleCollapse(module.id);
          }}
        >
          {collapsed ? "Expand" : "Collapse"}
        </button>
        <button
          type="button"
          className={styles.action}
          aria-label="Remove module"
          onClick={() => {
            removeModule(module.id);
          }}
        >
          Remove
        </button>
      </div>

      {collapsed ? null : (
        <>
          {voices.length > 1 ? (
            <label className={styles.voiceSelector}>
              <span>Voice</span>
              <select
                aria-label={`${manifest.productName} voice`}
                value={selectedVoiceId}
                onChange={(event) => {
                  selectVoice(module.id, event.currentTarget.value);
                }}
              >
                {voices.map((voice) => (
                  <option key={voice.id} value={voice.id}>
                    {voice.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div className={styles.controls}>
            {compact.map((descriptor) => {
              const raw = module.parameters[descriptor.id];
              if (
                descriptor.minimum === undefined ||
                descriptor.maximum === undefined ||
                descriptor.step === undefined
              ) {
                return null;
              }
              const value = typeof raw === "number" ? raw : Number(descriptor.defaultValue);
              return (
                <Knob
                  key={descriptor.id}
                  controlId={descriptor.id}
                  label={descriptor.shortLabel ?? descriptor.name}
                  value={value}
                  min={descriptor.minimum}
                  max={descriptor.maximum}
                  step={descriptor.step}
                  defaultValue={Number(descriptor.resetValue)}
                  unit={descriptor.unit === "none" ? undefined : descriptor.unit}
                  precision={descriptor.displayPrecision}
                  onInput={(next) => {
                    previewParameter(module.id, descriptor.id, next);
                  }}
                  onCommit={(next, gestureId) => {
                    commitParameter(module.id, descriptor.id, next, gestureId);
                  }}
                />
              );
            })}
          </div>
        </>
      )}
    </section>
  );
});
