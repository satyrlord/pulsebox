import { useState } from "react";

import { PROTECTED_LIMITER_EFFECT_PLUGIN_ID } from "../../../contracts";
import { DEFAULT_MASTER_LEVEL } from "../../../state/public";
import { Fader } from "../controls/Fader";
import { LevelMeter } from "../controls/LevelMeter";
import { automationShortcut } from "../controls/automation-shortcut";
import { masterMeterDisplayLevel } from "../store/app-store";
import { useAppStore } from "../store/app-store-context";
import { EffectEditor } from "./EffectEditor";
import { decibelsToGain, gainToDecibels, MINIMUM_FADER_DB } from "./fader-decibels";
import styles from "./Shell.module.css";

export function MasterPanel() {
  const [editorOpen, setEditorOpen] = useState(false);
  const masterLevel = useAppStore((state) => state.project.project.masterLevel);
  const masterChain = useAppStore((state) => state.project.project.effects.masterChain);
  const instances = useAppStore((state) => state.project.project.effects.instances);
  const masterEffectsBypassed = useAppStore((state) => state.project.project.effects.masterEffectsBypassed);
  // A number selector, so meter frames re-render only this meter's subtree,
  // not the panel and its fader.
  const level = useAppStore((state) =>
    state.project.transport.status === "playing" ? masterMeterDisplayLevel(state.masterMeter) : 0,
  );
  const preLevel = useAppStore((state) =>
    state.project.transport.status === "playing"
      ? masterMeterDisplayLevel(state.masterChainPreMeter)
      : 0,
  );
  const postLevel = useAppStore((state) =>
    state.project.transport.status === "playing"
      ? masterMeterDisplayLevel(state.masterChainPostMeter)
      : 0,
  );
  const previewMasterLevel = useAppStore((state) => state.previewMasterLevel);
  const setMasterLevel = useAppStore((state) => state.setMasterLevel);
  const toggleMasterEffectsBypass = useAppStore((state) => state.toggleMasterEffectsBypass);
  const openExternalAutomationTarget = useAppStore((state) => state.openExternalAutomationTarget);
  const resetMasterPeak = useAppStore((state) => state.resetMasterPeak);
  const masterBypassAutomation = automationShortcut(() =>
    openExternalAutomationTarget({
      scope: "master",
      targetId: "master",
      parameterId: "effects-bypassed",
    }),
  );
  const limiterId = [...masterChain]
    .reverse()
    .find((id) => id !== null && instances[id]?.pluginId === PROTECTED_LIMITER_EFFECT_PLUGIN_ID) ?? undefined;
  const loaded = masterChain.filter((id) => id !== null).length;

  return (
    <section
      className={styles.masterPanel}
      data-component="master-panel"
      aria-label="Master routing"
    >
      <article>
        <h3>Output</h3>
        <div className={styles.masterOutput}>
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
            onCommit={(value, gestureId) => {
              setMasterLevel(value, gestureId);
            }}
            onAutomate={() =>
              openExternalAutomationTarget({
                scope: "master",
                targetId: "master",
                parameterId: "level",
              })
            }
          />
          <LevelMeter label="Master output level" level={level} width={12} height={120} />
        </div>
        <div className={styles.masterOutputActions}>
          <button type="button" onClick={resetMasterPeak}>Reset peak</button>
        </div>
      </article>
      <article>
        <h3>Master chain</h3>
        <p>{`${loaded} of 6 effects loaded. The protected limiter stays in the final slot.`}</p>
        <div className={styles.masterChainMeters} aria-label="Master chain meters">
          <span>Before</span>
          <LevelMeter label="Before master effects" level={preLevel} width={92} height={6} orientation="horizontal" />
          <span>After</span>
          <LevelMeter label="After master effects" level={postLevel} width={92} height={6} orientation="horizontal" />
        </div>
        <div className={styles.masterChainActions}>
          <button
            type="button"
            aria-pressed={masterEffectsBypassed}
            aria-keyshortcuts={masterBypassAutomation.ariaKeyShortcuts}
            onClick={toggleMasterEffectsBypass}
            onKeyDown={masterBypassAutomation.onKeyDown}
            onContextMenu={masterBypassAutomation.onContextMenu}
          >
            {masterEffectsBypassed ? "Master effects bypassed" : "Bypass master effects"}
          </button>
          <button type="button" onClick={() => setEditorOpen(true)}>
            Edit chain
          </button>
          <button
            type="button"
            title="Automate master effects bypass."
            onClick={() =>
              openExternalAutomationTarget({
                scope: "master",
                targetId: "master",
                parameterId: "effects-bypassed",
              })
            }
          >
            Automate
          </button>
        </div>
      </article>
      {editorOpen ? (
        <EffectEditor
          chain={{ scope: "master" }}
          title="Master chain"
          slots={masterChain}
          {...(limiterId === undefined ? {} : { protectedEffectId: limiterId })}
          onClose={() => setEditorOpen(false)}
        />
      ) : null}
    </section>
  );
}
