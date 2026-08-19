import { useState } from "react";

import { type ModuleInstanceId, type SendBusId } from "../../../contracts";
import { DEFAULT_MASTER_LEVEL, DEFAULT_MODULE_LEVEL } from "../../../state/public";
import { Fader } from "../controls/Fader";
import { Knob } from "../controls/Knob";
import { LevelMeter } from "../controls/LevelMeter";
import { Toggle } from "../controls/Toggle";
import { masterMeterDisplayLevel } from "../store/app-store";
import { useAppStore, useDependencies } from "../store/app-store-context";
import { decibelsToGain, gainToDecibels, MINIMUM_FADER_DB } from "./fader-decibels";
import { SENDS, sendIdFor, type SendLetter } from "./sends";
import styles from "./Mixer.module.css";

interface OpenSendSurface {
  readonly moduleId: ModuleInstanceId;
  readonly moduleName: string;
  readonly send: SendLetter;
  readonly sendBusId: SendBusId;
}

function SendValueSurface(props: {
  readonly active: OpenSendSurface;
  readonly amount: number;
  readonly onClose: () => void;
}) {
  const setChannelSendAmount = useAppStore((state) => state.setChannelSendAmount);
  const previewChannelSendAmount = useAppStore((state) => state.previewChannelSendAmount);
  const openExternalAutomationTarget = useAppStore((state) => state.openExternalAutomationTarget);
  return (
    <section className={styles.sendSurface} data-component="send-value-surface" aria-label={`Send ${props.active.send} value`}>
      <div>
        <strong>{`${props.active.moduleName} send ${props.active.send}`}</strong>
        <button type="button" aria-label="Close send value" onClick={props.onClose}>
          Close
        </button>
      </div>
      <Knob
        controlId={`send-${props.active.moduleId}-${props.active.sendBusId}-amount`}
        label="Amount"
        value={props.amount}
        min={0}
        max={1}
        step={0.01}
        defaultValue={0}
        precision={2}
        onInput={(value) =>
          previewChannelSendAmount(props.active.moduleId, props.active.sendBusId, value)
        }
        onCommit={(value, gestureId) =>
          setChannelSendAmount(
            props.active.moduleId,
            props.active.sendBusId,
            value,
            gestureId,
          )
        }
        onAutomate={() =>
          openExternalAutomationTarget({
            scope: "send",
            targetId: props.active.moduleId,
            parameterId: `${props.active.sendBusId}-amount`,
          })
        }
      />
      <button
        type="button"
        title={`Automate ${props.active.moduleName} send ${props.active.send}.`}
        onClick={() =>
          openExternalAutomationTarget({
            scope: "send",
            targetId: props.active.moduleId,
            parameterId: `${props.active.sendBusId}-amount`,
          })
        }
      >
        Automate
      </button>
    </section>
  );
}

/**
 * Leaf meter subscription for one strip. Meter frames arrive per animation
 * frame, so only this small component re-renders, not the nine-strip mixer.
 */
function StripMeter(props: { readonly moduleId: ModuleInstanceId; readonly label: string }) {
  const level = useAppStore((state) => state.meterLevels[props.moduleId] ?? 0);
  const clipped = level >= 0.98;
  return (
    <div className={styles.meterStack}>
      <output
        className={styles.clipIndicator}
        data-active={clipped}
        aria-label={`${props.label} clip indicator, ${clipped ? "clipping" : "clear"}`}
        title={clipped ? "Clip" : "No clip"}
      >
        C
      </output>
      <LevelMeter label={props.label} level={level} width={6} stretch />
    </div>
  );
}

/** Leaf meter subscription for the master strip, for the same reason. */
function MasterStripMeter() {
  const level = useAppStore((state) => masterMeterDisplayLevel(state.masterMeter));
  return <LevelMeter label="Master output" level={level} width={6} stretch />;
}

export function Mixer() {
  const [openSendSurface, setOpenSendSurface] = useState<OpenSendSurface | undefined>(undefined);
  const { visibleSlotCount, manifestFor } = useDependencies();
  const rackSlots = useAppStore((state) => state.project.project.rackSlots);
  const modules = useAppStore((state) => state.project.project.modules);
  const masterLevel = useAppStore((state) => state.project.project.masterLevel);
  const masterEffectsBypassed = useAppStore(
    (state) => state.project.project.effects.masterEffectsBypassed,
  );
  const selectedModuleId = useAppStore((state) => state.project.ui.selectedModuleId);
  const toggleMute = useAppStore((state) => state.toggleMute);
  const toggleSolo = useAppStore((state) => state.toggleSolo);
  const setChannelLevel = useAppStore((state) => state.setChannelLevel);
  const setChannelPan = useAppStore((state) => state.setChannelPan);
  const setMasterLevel = useAppStore((state) => state.setMasterLevel);
  const toggleMasterEffectsBypass = useAppStore((state) => state.toggleMasterEffectsBypass);
  const previewChannelMix = useAppStore((state) => state.previewChannelMix);
  const previewMasterLevel = useAppStore((state) => state.previewMasterLevel);
  const selectModule = useAppStore((state) => state.selectModule);
  const openExternalAutomationTarget = useAppStore((state) => state.openExternalAutomationTarget);
  const visible = rackSlots.slice(0, visibleSlotCount);
  const loaded = visible.flatMap((slot) => {
    const module = slot.moduleId === undefined ? undefined : modules[slot.moduleId];
    return module === undefined ? [] : [module];
  });
  const anySolo = loaded.some((module) => module.solo);

  return (
    <section className={styles.mixer} data-component="mixer" aria-label="Mixer">
      {visible.map((slot, index) => {
        const module = slot.moduleId === undefined ? undefined : modules[slot.moduleId];
        const manifest = module === undefined ? undefined : manifestFor(module.pluginId);
        const slotNumber = String(index + 1).padStart(2, "0");
        if (module === undefined || manifest === undefined) {
          return (
            <article
              key={slot.id}
              className={styles.emptyStrip}
              aria-label={`Rack slot ${slotNumber}, Empty channel`}
              data-component="channel-strip"
              data-empty="true"
            >
              <button
                type="button"
                className={styles.channelName}
                disabled
                aria-label={`Select rack slot ${slotNumber} channel, no module loaded`}
                title={`Rack slot ${slotNumber} has no module.`}
              >
                {slotNumber}
              </button>
              {/* The empty channel keeps the loaded strip's silhouette. Each
                  visible control is disabled until the user loads a module. */}
              <div className={styles.panControl}>
                <Knob
                  controlId="pan"
                  label={`Rack slot ${slotNumber} pan`}
                  caption="Pan"
                  value={0}
                  min={-1}
                  max={1}
                  step={0.01}
                  defaultValue={0}
                  precision={2}
                  disabled
                  onInput={() => undefined}
                  onCommit={() => undefined}
                />
              </div>
              <div className={styles.sendGrid} aria-label={`Rack slot ${slotNumber} sends`}>
                {SENDS.map((send) => (
                  <button
                    key={send}
                    type="button"
                    disabled
                    aria-label={`Send ${send}, rack slot ${slotNumber}, no module loaded`}
                    title={`Send ${send} is unavailable. Rack slot ${slotNumber} has no module.`}
                  >
                    <span data-part="send-label" aria-hidden="true">
                      {send}
                    </span>
                  </button>
                ))}
              </div>
              <div className={`${styles.faderWell} ${styles.emptyFader}`}>
                <Fader
                  label={`Rack slot ${slotNumber} level`}
                  value={DEFAULT_MODULE_LEVEL}
                  min={0}
                  max={1}
                  step={0.01}
                  defaultValue={DEFAULT_MODULE_LEVEL}
                  unit="dB"
                  precision={1}
                  formatValue={gainToDecibels}
                  parseValue={decibelsToGain}
                  displayMin={MINIMUM_FADER_DB}
                  displayMax={0}
                  displayStep={0.1}
                  disabled
                  onInput={() => undefined}
                  onCommit={() => undefined}
                />
                <LevelMeter
                  label={`Rack slot ${slotNumber} output`}
                  level={0}
                  width={6}
                  stretch
                  inert
                  hiddenFromAssistiveTechnology
                />
              </div>
              <div className={styles.muteSolo}>
                <Toggle
                  label={`Solo rack slot ${slotNumber}, no module loaded`}
                  caption="S"
                  tone="warn"
                  pressed={false}
                  disabled
                  onToggle={() => undefined}
                />
                <Toggle
                  label={`Mute rack slot ${slotNumber}, no module loaded`}
                  caption="M"
                  tone="neutral"
                  pressed={false}
                  disabled
                  onToggle={() => undefined}
                />
              </div>
            </article>
          );
        }

        const name = manifest.productName;
        const silenced = module.muted || (anySolo && !module.solo);
        return (
          <article
            key={module.id}
            className={styles.strip}
            aria-label={`${name} channel`}
            data-component="channel-strip"
            data-silenced={silenced}
            data-selected={selectedModuleId === module.id}
            style={{ "--module-accent": manifest.ui.moduleAccent.accent } as React.CSSProperties}
          >
            <button
              type="button"
              className={styles.channelName}
              aria-pressed={selectedModuleId === module.id}
              aria-label={`Select ${name} channel`}
              onClick={() => selectModule(module.id)}
            >
              {manifest.shortLabel}
            </button>
            <div className={styles.panControl}>
              <Knob
                controlId="pan"
                label={`${name} pan`}
                caption="Pan"
                value={module.pan}
                min={-1}
                max={1}
                step={0.01}
                defaultValue={0}
                precision={2}
                onInput={(value) => previewChannelMix(module.id, "pan", value)}
                onCommit={(value, gestureId) => setChannelPan(module.id, value, gestureId)}
                onAutomate={() =>
                  openExternalAutomationTarget({
                    scope: "mixer",
                    targetId: module.id,
                    parameterId: "pan",
                  })
                }
              />
            </div>
            <div className={styles.sendGrid} aria-label={`${name} sends`}>
              {SENDS.map((send, sendIndex) => {
                const sendBusId = sendIdFor(sendIndex);
                const state = module.sends[sendBusId];
                if (state === undefined) return null;
                const active = state.amount > 0;
                return (
                  <button
                    key={send}
                    type="button"
                    data-active={active}
                    aria-label={`${active ? "Edit active" : "Open"} send ${send} for ${name}. ${Math.round(state.amount * 100)} percent, pre-fader.`}
                    title={`Open send ${send} for ${name}.`}
                    onClick={() => setOpenSendSurface({ moduleId: module.id, moduleName: name, send, sendBusId })}
                  >
                    <span data-part="send-label" aria-hidden="true">{send}</span>
                    {active ? <i aria-hidden="true" /> : null}
                  </button>
                );
              })}
            </div>
            <div className={styles.faderWell}>
              <Fader
                label={`${name} level`}
                value={module.level}
                min={0}
                max={1}
                step={0.01}
                defaultValue={DEFAULT_MODULE_LEVEL}
                unit="dB"
                precision={1}
                formatValue={gainToDecibels}
                parseValue={decibelsToGain}
                displayMin={MINIMUM_FADER_DB}
                displayMax={0}
                displayStep={0.1}
                onInput={(value) => previewChannelMix(module.id, "level", value)}
                onCommit={(value, gestureId) => setChannelLevel(module.id, value, gestureId)}
                onAutomate={() =>
                  openExternalAutomationTarget({
                    scope: "mixer",
                    targetId: module.id,
                    parameterId: "level",
                  })
                }
              />
              <StripMeter moduleId={module.id} label={`${name} output`} />
            </div>
            {/* Solo leads and mute follows. Solo uses warning. Mute uses a neutral cap. */}
            <div className={styles.muteSolo}>
              <Toggle
                label={`Solo ${name}`}
                caption="S"
                tone="warn"
                pressed={module.solo}
                onToggle={() => toggleSolo(module.id)}
                onAutomate={() =>
                  openExternalAutomationTarget({
                    scope: "mixer",
                    targetId: module.id,
                    parameterId: "solo",
                  })
                }
              />
              <Toggle
                label={`Mute ${name}`}
                caption="M"
                tone="neutral"
                pressed={module.muted}
                onToggle={() => toggleMute(module.id)}
                onAutomate={() =>
                  openExternalAutomationTarget({
                    scope: "mixer",
                    targetId: module.id,
                    parameterId: "muted",
                  })
                }
              />
            </div>
          </article>
        );
      })}

      <article className={styles.master} aria-label="Master channel" data-component="master-strip">
        <span className={styles.channelName}>
          MIX
        </span>
        <div className={styles.faderWell}>
          <Fader
            label="Master level"
            value={masterLevel}
            min={0}
            max={1}
            step={0.01}
            defaultValue={DEFAULT_MASTER_LEVEL}
            unit="dB"
            precision={1}
            formatValue={gainToDecibels}
            parseValue={decibelsToGain}
            displayMin={MINIMUM_FADER_DB}
            displayMax={0}
            displayStep={0.1}
            onInput={previewMasterLevel}
            onCommit={(value, gestureId) => setMasterLevel(value, gestureId)}
            onAutomate={() =>
              openExternalAutomationTarget({
                scope: "master",
                targetId: "master",
                parameterId: "level",
              })
            }
          />
          <MasterStripMeter />
        </div>
        <button
          type="button"
          className={styles.masterBypass}
          aria-label="Bypass master effects"
          aria-pressed={masterEffectsBypassed}
          data-bypassed={masterEffectsBypassed}
          title="Bypass all user master effects. The master gain and protected limiter stay active."
          onClick={toggleMasterEffectsBypass}
        >
          {masterEffectsBypassed ? "FX OFF" : "FX ON"}
        </button>
      </article>
      {openSendSurface !== undefined ? (() => {
        const module = modules[openSendSurface.moduleId];
        const send = module?.sends[openSendSurface.sendBusId];
        return send === undefined ? null : (
          <SendValueSurface
            active={openSendSurface}
            amount={send.amount}
            onClose={() => setOpenSendSurface(undefined)}
          />
        );
      })() : null}
    </section>
  );
}
