import { type EffectInstanceId } from "../../../contracts";
import { Knob } from "../controls/Knob";
import { automationShortcut } from "../controls/automation-shortcut";
import { displayEnumValue } from "../controls/display-enum-value";
import { useAppStore } from "../store/app-store-context";
import styles from "./Shell.module.css";

export interface CompactEffectMacroProps {
  readonly effectId: EffectInstanceId;
  readonly owner: string;
  readonly effectName: string;
  readonly parameterId: string;
  readonly label: string;
  readonly description: string | undefined;
  readonly value: number;
  readonly minimum: number;
  readonly maximum: number;
  readonly step: number;
  readonly resetValue: number;
  readonly precision: number;
  readonly unit: string | undefined;
  readonly normalizedPercent: boolean;
}

export function CompactEffectMacro(props: CompactEffectMacroProps) {
  const setEffectParameter = useAppStore((state) => state.setEffectParameter);
  const previewEffectParameter = useAppStore((state) => state.previewEffectParameter);
  const openExternalAutomationTarget = useAppStore((state) => state.openExternalAutomationTarget);
  return (
    <Knob
      controlId={`effect-${props.effectId}-${props.parameterId}`}
      label={`${props.owner} ${props.effectName} ${props.label} macro`}
      caption={props.label}
      description={props.description}
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
      onCommit={(value, gestureId) =>
        setEffectParameter(props.effectId, props.parameterId, value, gestureId)
      }
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

export interface CompactEffectEnumMacroProps {
  readonly effectId: EffectInstanceId;
  readonly owner: string;
  readonly effectName: string;
  readonly parameterId: string;
  readonly label: string;
  readonly description: string | undefined;
  readonly value: string;
  readonly values: readonly string[];
}

export function CompactEffectEnumMacro(props: CompactEffectEnumMacroProps) {
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
        aria-description={props.description}
        aria-keyshortcuts={automation.ariaKeyShortcuts}
        title={props.description}
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