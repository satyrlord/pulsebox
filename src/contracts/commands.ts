import type {
  CommandId,
  EffectInstanceId,
  GestureId,
  ModuleInstanceId,
  PatternId,
  RackSlotId,
  SendBusId,
  StateRevision,
  VoiceId,
} from "./ids";

export type CommandOrigin = "ui" | "undo" | "redo" | "system";

export interface CommandEnvelope<TType extends string, TPayload> {
  readonly commandId: CommandId;
  readonly type: TType;
  readonly payload: TPayload;
  readonly expectedProjectRevision: StateRevision;
  readonly origin: CommandOrigin;
  readonly gestureId?: GestureId;
  readonly metadata?: Readonly<Record<string, string | number | boolean>>;
}

export interface CommandValidationError {
  readonly field: string;
  readonly message: string;
  readonly recoveryAction: string;
}

export type CommandResult =
  | {
      readonly status: "accepted";
      readonly changed: boolean;
      readonly projectRevision: StateRevision;
    }
  | {
      readonly status: "rejected";
      readonly error: CommandValidationError;
    };

export type EngineTargetId =
  | ModuleInstanceId
  | EffectInstanceId
  | RackSlotId
  | VoiceId
  | PatternId
  | SendBusId;

export interface EngineDelta<TKind extends string, TPayload> {
  readonly kind: TKind;
  readonly projectRevision: StateRevision;
  readonly targetIds: readonly EngineTargetId[];
  readonly payload: TPayload;
}

export type Selector<State, Selected> = (
  state: Readonly<State>,
) => Selected;
export type Listener<Selected> = (
  selected: Selected,
  previous: Selected,
) => void;
export type Unsubscribe = () => void;

export interface PulseStore<State, Command> {
  getState(): Readonly<State>;
  dispatch(command: Command): CommandResult;
  subscribe<Selected>(
    selector: Selector<State, Selected>,
    listener: Listener<Selected>,
  ): Unsubscribe;
  undo(): CommandResult;
  redo(): CommandResult;
}

export interface EngineProjectionPort<Delta> {
  project(delta: Delta): Promise<void>;
  replaceFromCurrentState(projectRevision: StateRevision): Promise<void>;
}

export interface PreferencePort<Key, Value> {
  read(key: Key): Promise<Value | undefined>;
  write(key: Key, value: Value): Promise<void>;
  remove(key: Key): Promise<void>;
}
