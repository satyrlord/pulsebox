import { useState, type CSSProperties } from "react";

import { type EffectInstanceId } from "../../../contracts";
import { Knob } from "../controls/Knob";
import { automationShortcut } from "../controls/automation-shortcut";
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
      precision={props.normalizedPercent ? 0 : 2}
      unit={props.normalizedPercent ? "percent" : undefined}
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

function displayEnumValue(value: string): string {
  return value
    .split("-")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
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
          const model = focus?.state.model;
          const primaryName =
            typeof model === "string"
              ? displayEnumValue(model)
              : manifest?.productName ?? focus?.pluginId ?? "Empty chain";
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
              style={
                {
                  "--send-accent": manifest?.ui.moduleAccent.accent,
                } as CSSProperties
              }
            >
              <button
                type="button"
                className={styles.sendBadge}
                aria-label={`Select send ${send}`}
                aria-pressed={selected}
                onClick={() => openSend(send)}
              >
                {send}
              </button>
              <div className={styles.effectSummary}>
                <div className={styles.effectHeading}>
                  <div>
                    <h3>{`Send ${send}`}</h3>
                    <p>{focus === undefined ? "Empty chain" : primaryName}</p>
                  </div>
                  <output aria-label={`${occupied} effects in send ${send}`}>{`${occupied}/8`}</output>
                  <output aria-label={`Send ${send} status`}>{active ? "Active" : "Idle"}</output>
                </div>
                <div className={styles.effectMacros} aria-label={`Send ${send} macros`}>
                  {macros.length === 0 ? <span className={styles.emptyMacros}>No compact controls</span> : null}
                  {macros.map((macro) => {
                    const descriptor = manifest?.parameters.find((item) => item.id === macro.parameterId);
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
                        normalizedPercent={
                          descriptor.unit === "percent" &&
                          descriptor.minimum === 0 &&
                          descriptor.maximum === 1
                        }
                      />
                    );
                  })}
                </div>
                <div className={styles.effectControls}>
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
                    onCommit={(value, gestureId) => setSendReturnLevel(id, value, gestureId)}
                    onAutomate={() =>
                      openExternalAutomationTarget({
                        scope: "send-return",
                        targetId: id,
                        parameterId: "return-level",
                      })
                    }
                  />
                  <button
                    type="button"
                    aria-pressed={chain.bypassed}
                    onClick={() => setSendChainBypassed(id, !chain.bypassed)}
                  >
                    {chain.bypassed ? "Chain bypassed" : "Chain bypass"}
                  </button>
                  <button
                    type="button"
                    title={`Automate send ${send} chain bypass.`}
                    onClick={() =>
                      openExternalAutomationTarget({
                        scope: "send-return",
                        targetId: id,
                        parameterId: "chain-bypassed",
                      })
                    }
                  >
                    Automate bypass
                  </button>
                  <button type="button" onClick={() => setEditorSend(index)}>
                    Edit
                  </button>
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
