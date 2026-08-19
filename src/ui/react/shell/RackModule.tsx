import { memo, useId, useMemo, useRef, useState, type ReactNode } from "react";

import type {
  ModuleInstanceId,
  ParameterDescriptor,
  PluginManifest,
  RackSlotId,
} from "../../../contracts";
import type { RackModuleState } from "../../../state/public";
import { AuditionButton } from "../controls/AuditionButton";
import { BypassAllIcon } from "../controls/BypassAllIcon";
import { Knob } from "../controls/Knob";
import { LevelMeter } from "../controls/LevelMeter";
import { PopupMenu, type PopupMenuItem } from "../controls/PopupMenu";
import { Toggle } from "../controls/Toggle";
import { useAppStore, useDependencies } from "../store/app-store-context";
import { cx } from "../class-names";
import { EffectEditor } from "./EffectEditor";
import styles from "./RackModule.module.css";

interface RackModuleProps {
  readonly slotNumber: number;
  readonly module: RackModuleState | undefined;
  readonly canMoveUp: boolean;
  readonly canMoveDown: boolean;
  readonly hasEmptySlot: boolean;
  readonly previousSlotId: RackSlotId | undefined;
  readonly nextSlotId: RackSlotId | undefined;
  readonly firstEmptySlotId: RackSlotId | undefined;
  /** True while this module is the one being dragged. */
  readonly dragging?: boolean;
  /** True while a dragged module would land on this slot. */
  readonly dropTarget?: boolean;
  /**
   * Starts a pointer reorder gesture from one of the ear handles. The rack
   * passes one stable handler for every slot, so the memo below still holds.
   */
  readonly onReorderStart?:
    | ((moduleId: ModuleInstanceId, slotIndex: number, pointerId: number) => void)
    | undefined;
}

interface ModuleControlGroupProps {
  readonly label: string;
  readonly accessibleName: string;
  readonly group: "sound" | "voice" | "output";
  readonly children: ReactNode;
}

function ModuleControlGroup(props: ModuleControlGroupProps) {
  const [expanded, setExpanded] = useState(true);
  const contentId = useId();

  return (
    <div
      className={styles.controlGroup}
      data-component="module-control-group"
      data-group={props.group}
      data-expanded={expanded}
    >
      <button
        type="button"
        className={styles.groupToggle}
        aria-label={`${expanded ? "Collapse" : "Expand"} ${props.accessibleName}`}
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={() => {
          setExpanded((value) => !value);
        }}
      >
        <span>{props.label}</span>
        <span aria-hidden="true">{expanded ? "−" : "+"}</span>
      </button>
      <div
        id={contentId}
        className={styles.groupBody}
        role="group"
        aria-label={props.accessibleName}
        hidden={!expanded}
      >
        {props.children}
      </div>
    </div>
  );
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

function slotLabel(slotNumber: number): string {
  return String(slotNumber).padStart(2, "0");
}

/**
 * Leaf meter subscription. Meter frames arrive per animation frame, so only
 * this small component re-renders. The memoized faceplate around it does not
 * depend on the level.
 */
function ModuleLevelMeter(props: {
  readonly moduleId: ModuleInstanceId;
  readonly productName: string;
}) {
  const level = useAppStore((state) => state.meterLevels[props.moduleId] ?? 0);
  return (
    <LevelMeter label={`${props.productName} output level`} level={level} width={6} height={34} />
  );
}

/**
 * Memoized so a rack re-render only produces new output for the module whose
 * data changed. Every prop is a primitive, a frozen state object, or the rack's
 * one stable reorder handler, so reference equality is a sound test.
 */
export const RackModule = memo(function RackModule(props: RackModuleProps) {
  const { module, slotNumber } = props;
  const { manifestFor, addablePluginIds } = useDependencies();

  const selectedModuleId = useAppStore((state) => state.project.ui.selectedModuleId);
  const selectModule = useAppStore((state) => state.selectModule);
  const removeModule = useAppStore((state) => state.removeModule);
  const duplicateModule = useAppStore((state) => state.duplicateModule);
  const swapModule = useAppStore((state) => state.swapModule);
  const moveModule = useAppStore((state) => state.moveModule);
  const toggleMute = useAppStore((state) => state.toggleMute);
  const toggleSolo = useAppStore((state) => state.toggleSolo);
  const selectVoice = useAppStore((state) => state.selectVoice);
  const selectedVoice = useAppStore((state) =>
    module === undefined ? undefined : state.selectedVoiceByModule[module.id],
  );
  const startAudition = useAppStore((state) => state.startAudition);
  const stopAudition = useAppStore((state) => state.stopAudition);
  const commitParameter = useAppStore((state) => state.commitParameter);
  const previewParameter = useAppStore((state) => state.previewParameter);
  const openExternalAutomationTarget = useAppStore((state) => state.openExternalAutomationTarget);
  const toggleModuleEffectsBypass = useAppStore(
    (state) => state.toggleModuleEffectsBypass,
  );
  const moduleChain = useAppStore((state) =>
    module === undefined ? undefined : state.project.project.effects.moduleChains[module.id],
  );

  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | undefined>(undefined);
  const [effectsOpen, setEffectsOpen] = useState(false);
  const sectionRef = useRef<HTMLElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  // True when the trigger press found its own menu already open. The menu's
  // outside-press handler closes it on pointerdown, so without this guard the
  // click that follows would reopen the menu instead of toggling it shut.
  const menuTogglePress = useRef(false);

  const manifest = module === undefined ? undefined : manifestFor(module.pluginId);
  const style = useMemo(() => accentStyle(manifest), [manifest]);

  if (module === undefined || manifest === undefined) {
    return (
      <section
        className={cx(styles.module, props.dropTarget === true && styles.dropTarget)}
        data-component="rack-module"
        data-label="Empty"
        data-drop-target={props.dropTarget === true ? true : undefined}
        aria-label={`Rack slot ${slotLabel(slotNumber)}, empty`}
      >
        <div className={styles.nameBlock}>
          <header className={styles.header}>
            <span className={styles.slot}>{slotLabel(slotNumber)}</span>
            <span className={styles.title}>Empty</span>
          </header>
        </div>
      </section>
    );
  }

  const selected = module.id === selectedModuleId;
  const hasModuleEffects = moduleChain?.slots.some((effectId) => effectId !== null) ?? false;
  const voices = manifest.kind === "instrument" ? manifest.voices : [];
  const selectedVoiceId = selectedVoice ?? voices[0]?.id;
  const compact = manifest.ui.compactControls
    .map((control) => manifest.parameters.find((one) => one.id === control.parameterId))
    .filter((descriptor) => descriptor !== undefined);
  // Selected-voice fast controls resolve against the voice selector, so one
  // descriptor serves every voice (section 15).
  const voiceCompact =
    selectedVoiceId === undefined
      ? []
      : (manifest.ui.voiceCompactControls ?? [])
          .map((control) =>
            manifest.parameters.find(
              (one) => one.id === `${selectedVoiceId}-${control.parameterSuffix}`,
            ),
          )
          .filter((descriptor) => descriptor !== undefined);
  // A gated parameter is inert unless its gate parameter holds the declared
  // value (see `parameterGates` in the manifest), so the faceplate disables
  // that control to match the audio path.
  const gateByParameter = new Map(
    (manifest.ui.parameterGates ?? []).map((gate) => [gate.parameterId, gate]),
  );

  const openMenuAt = (x: number, y: number) => {
    setMenuPosition({ x, y });
  };

  const isGatedDisabled = (descriptor: ParameterDescriptor): boolean => {
    const gate = gateByParameter.get(descriptor.id);
    if (gate === undefined) return false;
    const raw = module.parameters[gate.gateParameterId];
    const gateDefault =
      manifest.parameters.find((one) => one.id === gate.gateParameterId)?.defaultValue;
    const gateHolds = typeof raw === "boolean" ? raw : gateDefault === true;
    return gateHolds !== gate.gateValue;
  };

  const renderParameterControl = (descriptor: ParameterDescriptor) => {
    const raw = module.parameters[descriptor.id];
    if (descriptor.valueType === "enum") {
      const value = typeof raw === "string" ? raw : String(descriptor.defaultValue);
      return (
        <label key={descriptor.id} className={styles.enumControl}>
          <span>{descriptor.shortLabel ?? descriptor.name}</span>
          <select
            aria-label={`${manifest.productName} ${descriptor.name}`}
            value={value}
            onChange={(event) => {
              commitParameter(module.id, descriptor.id, event.currentTarget.value);
            }}
          >
            {(descriptor.enumValues ?? []).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      );
    }
    if (descriptor.valueType === "boolean") {
      const value = typeof raw === "boolean" ? raw : descriptor.defaultValue === true;
      return (
        <Toggle
          key={descriptor.id}
          label={`${manifest.productName} ${descriptor.name}`}
          caption={descriptor.shortLabel ?? descriptor.name}
          pressed={value}
          onToggle={() => {
            commitParameter(module.id, descriptor.id, !value);
          }}
        />
      );
    }
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
        disabled={isGatedDisabled(descriptor)}
        onInput={(next) => {
          previewParameter(module.id, descriptor.id, next);
        }}
        onCommit={(next, gestureId) => {
          commitParameter(module.id, descriptor.id, next, gestureId);
        }}
      />
    );
  };

  const menuItems: readonly PopupMenuItem[] = [
    {
      id: "duplicate",
      label: "Duplicate",
      disabled: !props.hasEmptySlot || props.firstEmptySlotId === undefined,
      onSelect: () => {
        if (props.firstEmptySlotId !== undefined) duplicateModule(module.id, props.firstEmptySlotId);
      },
    },
    ...addablePluginIds.flatMap((pluginId): PopupMenuItem[] => {
      if (pluginId === module.pluginId) return [];
      const candidate = manifestFor(pluginId);
      if (candidate === undefined) return [];
      return [
        {
          id: `swap-${pluginId}`,
          label: `Swap to ${candidate.productName}`,
          onSelect: () => {
            swapModule(module.id, pluginId);
          },
        },
      ];
    }),
    {
      id: "delete",
      label: "Delete module",
      danger: true,
      onSelect: () => {
        removeModule(module.id);
      },
    },
  ];

  /**
   * Both rack ears carry the drag affordance, because either edge should be
   * grabbable. They are one command, so only the leading handle is named and
   * reachable by keyboard. The trailing one is a pointer-only duplicate: a
   * second identical entry in the tab order and the accessibility tree would
   * announce one control twice.
   */
  const reorderHandle = (edge: "start" | "end") => (
    <button
      type="button"
      className={cx(styles.earHandle, edge === "start" ? styles.earStart : styles.earEnd)}
      {...(edge === "start"
        ? {
            "aria-label": `Reorder ${manifest.productName}, rack slot ${slotLabel(slotNumber)}`,
          }
        : { "aria-hidden": true, tabIndex: -1 })}
      title="Drag to reorder. Arrow keys move the module."
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        props.onReorderStart?.(module.id, slotNumber - 1, event.pointerId);
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowUp" && props.canMoveUp && props.previousSlotId !== undefined) {
          event.preventDefault();
          moveModule(module.id, props.previousSlotId);
        }
        if (event.key === "ArrowDown" && props.canMoveDown && props.nextSlotId !== undefined) {
          event.preventDefault();
          moveModule(module.id, props.nextSlotId);
        }
      }}
    >
      <span aria-hidden="true" />
    </button>
  );

  return (
    <section
      ref={sectionRef}
      className={cx(
        styles.module,
        selected && styles.selected,
        props.dragging === true && styles.dragging,
        props.dropTarget === true && styles.dropTarget,
      )}
      style={style}
      data-component="rack-module"
      data-label={manifest.productName}
      data-selected={selected}
      data-drop-target={props.dropTarget === true ? true : undefined}
      aria-label={`Rack slot ${slotLabel(slotNumber)}, ${manifest.productName}`}
      onPointerDownCapture={() => selectModule(module.id)}
      onFocusCapture={() => selectModule(module.id)}
      onContextMenu={(event) => {
        // The loaded module's context menu owns `Delete module` (section 13.2).
        event.preventDefault();
        selectModule(module.id);
        openMenuAt(event.clientX, event.clientY);
      }}
      onKeyDown={(event) => {
        // The standard keyboard context-menu gesture opens the same menu.
        if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
          event.preventDefault();
          const rect = (menuButtonRef.current ?? sectionRef.current)?.getBoundingClientRect();
          if (rect !== undefined) openMenuAt(rect.left, rect.bottom + 2);
        }
      }}
    >
      {reorderHandle("start")}
      <div className={styles.nameBlock}>
        {manifest.ui.icon !== undefined ? (
          // Section 2.2: the icon is the loaded faceplate's only identity mark.
          // The section root's accessible name still carries the slot number
          // and the full product name.
          <span
            className={styles.iconBadge}
            data-component="module-icon"
            title={manifest.productName}
            aria-hidden="true"
          >
            <svg viewBox={manifest.ui.icon.viewBox} focusable="false">
              <path d={manifest.ui.icon.path} fill="currentColor" fillRule="evenodd" />
            </svg>
          </span>
        ) : (
          <header className={styles.header}>
            <span className={styles.slot}>{slotLabel(slotNumber)}</span>
            <span className={styles.title}>{manifest.shortLabel ?? manifest.productName}</span>
          </header>
        )}
      </div>

      <div className={styles.controlGroups} data-component="module-control-groups">
        <div className={styles.primaryControlGroups}>
          <ModuleControlGroup
            group="sound"
            label="Sound"
            accessibleName={`${manifest.productName} sound controls`}
          >
            {compact.map(renderParameterControl)}
          </ModuleControlGroup>

          {voices.length > 1 || voiceCompact.length > 0 ? (
            <ModuleControlGroup
              group="voice"
              label="Voice"
              accessibleName={`${manifest.productName} voice controls`}
            >
              <label className={styles.voiceSelector}>
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
              {voiceCompact.map(renderParameterControl)}
            </ModuleControlGroup>
          ) : null}
        </div>

        <ModuleControlGroup
          group="output"
          label="Output"
          accessibleName={`${manifest.productName} output controls`}
        >
          <Toggle
            label={`Mute ${manifest.productName} on the rack faceplate`}
            caption="M"
            pressed={module.muted}
            onToggle={() => {
              toggleMute(module.id);
            }}
            onAutomate={() =>
              openExternalAutomationTarget({
                scope: "mixer",
                targetId: module.id,
                parameterId: "muted",
              })
            }
          />
          <Toggle
            label={`Solo ${manifest.productName} on the rack faceplate`}
            caption="S"
            tone="warn"
            pressed={module.solo}
            onToggle={() => {
              toggleSolo(module.id);
            }}
            onAutomate={() =>
              openExternalAutomationTarget({
                scope: "mixer",
                targetId: module.id,
                parameterId: "solo",
              })
            }
          />
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
          <ModuleLevelMeter moduleId={module.id} productName={manifest.productName} />
          <button
            type="button"
            className={`${styles.action} ${styles.bypassAll}`}
            aria-label={`Bypass all Rack FX for ${manifest.productName}`}
            aria-pressed={moduleChain?.bypassed ?? false}
            data-bypassed={moduleChain?.bypassed ?? false}
            disabled={!hasModuleEffects}
            title={
              hasModuleEffects
                ? moduleChain?.bypassed === true
                  ? `Enable all Rack FX for ${manifest.productName}.`
                  : `Bypass all Rack FX for ${manifest.productName}.`
                : `${manifest.productName} has no Rack FX to bypass.`
            }
            onClick={() => toggleModuleEffectsBypass(module.id)}
          >
            <BypassAllIcon />
          </button>
          <button
            type="button"
            className={styles.action}
            disabled={moduleChain === undefined}
            onClick={() => setEffectsOpen(true)}
          >
            Effects
          </button>
          <button
            ref={menuButtonRef}
            type="button"
            className={styles.action}
            aria-label={`${manifest.productName} module menu`}
            aria-haspopup="menu"
            aria-expanded={menuPosition !== undefined}
            onPointerDown={() => {
              menuTogglePress.current = menuPosition !== undefined;
            }}
            onClick={(event) => {
              if (menuTogglePress.current) {
                menuTogglePress.current = false;
                return;
              }
              const rect = event.currentTarget.getBoundingClientRect();
              openMenuAt(rect.left, rect.bottom + 2);
            }}
          >
            Menu
          </button>
        </ModuleControlGroup>
      </div>
      {reorderHandle("end")}

      {menuPosition === undefined ? null : (
        <PopupMenu
          label={`${manifest.productName} module menu`}
          position={menuPosition}
          onClose={() => {
            setMenuPosition(undefined);
          }}
          items={menuItems}
        />
      )}
      {effectsOpen && moduleChain !== undefined ? (
        <EffectEditor
          chain={{ scope: "module", targetId: module.id }}
          title={`${manifest.productName} pedalboard`}
          slots={moduleChain.slots}
          onClose={() => setEffectsOpen(false)}
        />
      ) : null}
    </section>
  );
});
