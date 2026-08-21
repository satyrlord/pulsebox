import { useState, type CSSProperties } from "react";

import { type EffectInstanceId } from "../../../contracts";
import { EffectActionIcon } from "../controls/EffectActionIcon";
import { Knob } from "../controls/Knob";
import { automationShortcut } from "../controls/automation-shortcut";
import { displayEnumValue } from "../controls/display-enum-value";
import { useAppStore, useDependencies } from "../store/app-store-context";
import { EffectEditor } from "./EffectEditor";
import { SENDS, sendIdFor } from "./sends";
import styles from "./Shell.module.css";

function CompactMacro(props: {
  readonly effectId: EffectInstanceId;
  readonly owner: string;
  readonly effectName: string;
  readonly parameterId: string;
  readonly label: string;
  readonly value: number;
  readonly minimum: number;
  readonly maximum: number;
  readonly step: number;
  readonly resetValue: number;
  readonly precision: number;
  readonly unit: string | undefined;
  readonly normalizedPercent: boolean;
}) {
  const setEffectParameter = useAppStore((state) => state.setEffectParameter);
  const previewEffectParameter = useAppStore((state) => state.previewEffectParameter);
  const openExternalAutomationTarget = useAppStore((state) => state.openExternalAutomationTarget);
  return (
    <Knob
      controlId={`effect-${props.effectId}-${props.parameterId}`}
      label={`${props.owner} ${props.effectName} ${props.label} macro`}
      caption={props.label}
      value={props.value}
      min={props.minimum}
      max={props.maximum}
      step={props.step}
      defaultValue={props.resetValue}
      precision={props.normalizedPercent ? 0 : props.precision}
      unit={props.normalizedPercent ? "percent" : props.unit}
      {...(props.normalizedPercent
        ? {
            formatValue: (value: number) => value * 100,
            parseValue: (value: number) => value / 100,
            displayMin: 0,
            displayMax: 100,
            displayStep: 1,
          }
        : {})}
      onInput={(value) => previewEffectParameter(props.effectId, props.parameterId, value)}
      onCommit={(value, gestureId) => setEffectParameter(props.effectId, props.parameterId, value, gestureId)}
      onAutomate={() =>
        openExternalAutomationTarget({
          scope: "effect",
          targetId: props.effectId,
          parameterId: props.parameterId,
        })
      }
    />
  );
}

function CompactEnumMacro(props: {
  readonly effectId: EffectInstanceId;
  readonly owner: string;
  readonly effectName: string;
  readonly parameterId: string;
  readonly label: string;
  readonly value: string;
  readonly values: readonly string[];
}) {
  const setEffectParameter = useAppStore((state) => state.setEffectParameter);
  const openExternalAutomationTarget = useAppStore((state) => state.openExternalAutomationTarget);
  const automation = automationShortcut(() =>
    openExternalAutomationTarget({
      scope: "effect",
      targetId: props.effectId,
      parameterId: props.parameterId,
    }),
  );
  return (
    <label className={styles.compactSelect}>
      <span>{props.label}</span>
      <select
        aria-label={`${props.owner} ${props.effectName} ${props.label} macro`}
        aria-keyshortcuts={automation.ariaKeyShortcuts}
        value={props.value}
        onChange={(event) =>
          setEffectParameter(props.effectId, props.parameterId, event.currentTarget.value)
        }
        onKeyDown={automation.onKeyDown}
        onContextMenu={automation.onContextMenu}
      >
        {props.values.map((value) => (
          <option key={value} value={value}>
            {displayEnumValue(value)}
          </option>
        ))}
      </select>
    </label>
  );
}

export function EffectsBank() {
  const [editorSend, setEditorSend] = useState<number | undefined>(undefined);
  const selectedSend = useAppStore((state) => state.selectedSend);
  const chains = useAppStore((state) => state.project.project.effects.sendChains);
  const instances = useAppStore((state) => state.project.project.effects.instances);
  const modules = useAppStore((state) => state.project.project.modules);
  const setSendReturnLevel = useAppStore((state) => state.setSendReturnLevel);
  const previewSendReturnLevel = useAppStore((state) => state.previewSendReturnLevel);
  const setSendChainBypassed = useAppStore((state) => state.setSendChainBypassed);
  const openSend = useAppStore((state) => state.openSend);
  const openExternalAutomationTarget = useAppStore((state) => state.openExternalAutomationTarget);
  const { manifestFor } = useDependencies();
  const activeEditorId = editorSend === undefined ? undefined : sendIdFor(editorSend);
  const activeEditorChain = activeEditorId === undefined ? undefined : chains[activeEditorId];

  return (
    <>
      <section className={styles.effectsBank} data-component="effects-bank" aria-label="Send chains">
        {SENDS.map((send, index) => {
          const id = sendIdFor(index);
          const chain = chains[id];
          if (chain === undefined) return null;
          const selected = selectedSend === send;
          const focusId = chain.pinnedEffectId;
          const focus = focusId === null ? undefined : instances[focusId];
          const manifest = focus === undefined ? undefined : manifestFor(focus.pluginId);
          const macros = manifest?.kind === "effect" ? manifest.ui.compactControls.slice(0, 4) : [];
          const occupied = chain.slots.filter((slot) => slot !== null).length;
          const active = Object.values(modules).some(
            (module) => (module.sends[id]?.amount ?? 0) > 0,
          );
          return (
            <article
              key={send}
              className={styles.effectCard}
              data-component="effect-slot"
              data-selected={selected}
              aria-current={selected ? "true" : undefined}
              data-active={active}
              data-bypassed={chain.bypassed}
              style={
                {
                  "--send-accent":
                    manifest?.ui.moduleAccent.accent ??
                    "var(--pulse-color-accent, #7ed9a3)",
                  "--send-accent-muted":
                    manifest?.ui.moduleAccent.accentMuted ??
                    "var(--pulse-color-selection, #244d38)",
                  "--send-led":
                    manifest?.ui.moduleAccent.led ??
                    "var(--pulse-color-status-success, #62d28a)",
                  "--module-control-ring":
                    manifest?.ui.moduleAccent.controlRing ??
                    "var(--pulse-color-control-fill, #b0f2ca)",
                } as CSSProperties
              }
            >
              <div className={styles.effectSummary}>
                <div className={styles.effectHeading} data-component="effect-heading">
                  <button
                    type="button"
                    className={styles.sendBadge}
                    aria-label={`Select send ${send}`}
                    aria-pressed={selected}
                    onClick={() => openSend(send)}
                  >
                    {send}
                  </button>
                  <div className={styles.effectIdentity}>
                    <span
                      className={styles.effectFamilyChip}
                      data-component="effect-family-chip"
                    >
                      {manifest?.shortLabel ?? "SEND"}
                    </span>
                    <h3>
                      {focus === undefined
                        ? "Empty chain"
                        : manifest?.productName ?? focus.pluginId}
                    </h3>
                  </div>
                  <output
                    className={styles.effectCount}
                    aria-label={`${occupied} effects in send ${send}`}
                  >
                    {`${occupied}/8`}
                  </output>
                  <output
                    className={styles.effectStatus}
                    data-active={active}
                    aria-label={`Send ${send} status`}
                  >
                    {active ? "Active" : "Idle"}
                  </output>
                </div>
                <div className={styles.effectBody}>
                  <div
                    className={styles.effectControlGroup}
                    data-component="effect-macro-region"
                    role="group"
                    aria-label={`Send ${send} effect controls`}
                  >
                    <div
                      className={styles.effectMacros}
                      data-component="effect-macros"
                      aria-label={`Send ${send} macros`}
                    >
                      {macros.length === 0 ? (
                        <span className={styles.emptyMacros}>No compact controls</span>
                      ) : null}
                      {macros.map((macro) => {
                        const descriptor = manifest?.parameters.find(
                          (item) => item.id === macro.parameterId,
                        );
                        const value = focus?.state[macro.parameterId] ?? descriptor?.defaultValue;
                        if (descriptor === undefined || focus === undefined) return null;
                        if (
                          descriptor.valueType === "enum" &&
                          typeof value === "string" &&
                          descriptor.enumValues !== undefined
                        ) {
                          return (
                            <CompactEnumMacro
                              key={macro.parameterId}
                              effectId={focus.id}
                              owner={`Send ${send}`}
                              effectName={manifest?.productName ?? focus.pluginId}
                              parameterId={macro.parameterId}
                              label={descriptor.shortLabel ?? descriptor.name}
                              value={value}
                              values={descriptor.enumValues}
                            />
                          );
                        }
                        if (typeof value !== "number") return null;
                        return (
                          <CompactMacro
                            key={macro.parameterId}
                            effectId={focus.id}
                            owner={`Send ${send}`}
                            effectName={manifest?.productName ?? focus.pluginId}
                            parameterId={macro.parameterId}
                            label={descriptor.shortLabel ?? descriptor.name}
                            value={value}
                            minimum={descriptor.minimum ?? 0}
                            maximum={descriptor.maximum ?? 1}
                            step={descriptor.step ?? 0.01}
                            resetValue={
                              typeof descriptor.resetValue === "number"
                                ? descriptor.resetValue
                                : value
                            }
                            precision={descriptor.displayPrecision}
                            unit={descriptor.unit === "none" ? undefined : descriptor.unit}
                            normalizedPercent={
                              descriptor.unit === "percent" &&
                              descriptor.minimum === 0 &&
                              descriptor.maximum === 1
                            }
                          />
                        );
                      })}
                    </div>
                  </div>
                  <div
                    className={styles.effectOutputGroup}
                    data-component="effect-output-region"
                    role="group"
                    aria-label={`Send ${send} output`}
                  >
                    <div className={styles.effectReturn}>
                      <Knob
                        controlId={`send-return-${send}`}
                        label={`Send ${send} Return Level`}
                        caption="Return Level"
                        value={chain.returnLevel}
                        min={0}
                        max={1}
                        step={0.01}
                        defaultValue={1}
                        precision={2}
                        onInput={(value) => previewSendReturnLevel(id, value)}
                        onCommit={(value, gestureId) =>
                          setSendReturnLevel(id, value, gestureId)
                        }
                        onAutomate={() =>
                          openExternalAutomationTarget({
                            scope: "send-return",
                            targetId: id,
                            parameterId: "return-level",
                          })
                        }
                      />
                    </div>
                  </div>
                  <div
                    className={styles.effectChainGroup}
                    data-component="effect-chain-region"
                    role="group"
                    aria-label={`Send ${send} chain controls`}
                  >
                    <div className={styles.effectActions} data-component="effect-actions">
                      <button
                        type="button"
                        aria-label={
                          chain.bypassed
                            ? `Send ${send} chain bypassed`
                            : `Bypass Send ${send} chain`
                        }
                        aria-pressed={chain.bypassed}
                        onClick={() => setSendChainBypassed(id, !chain.bypassed)}
                      >
                        {chain.bypassed ? "Bypassed" : "Bypass"}
                      </button>
                      <button
                        type="button"
                        aria-label={`Automate send ${send} bypass`}
                        title={`Automate send ${send} chain bypass.`}
                        onClick={() =>
                          openExternalAutomationTarget({
                            scope: "send-return",
                            targetId: id,
                            parameterId: "chain-bypassed",
                          })
                        }
                      >
                        <EffectActionIcon kind="automation" />
                        <span>Auto</span>
                      </button>
                      <button
                        type="button"
                        aria-label={`Edit Send ${send} effects`}
                        title={`Edit Send ${send} effects.`}
                        onClick={() => setEditorSend(index)}
                      >
                        <EffectActionIcon kind="edit" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </section>
      {activeEditorId !== undefined && activeEditorChain !== undefined ? (
        <EffectEditor
          chain={{ scope: "send", targetId: activeEditorId }}
          title={`Send ${SENDS[editorSend ?? 0]}`}
          slots={activeEditorChain.slots}
          pinnedEffectId={activeEditorChain.pinnedEffectId}
          onClose={() => setEditorSend(undefined)}
        />
      ) : null}
    </>
  );
}
