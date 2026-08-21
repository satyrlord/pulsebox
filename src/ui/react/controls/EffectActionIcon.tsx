import styles from "./EffectActionIcon.module.css";

export type EffectActionIconKind =
  | "automation"
  | "drag"
  | "edit"
  | "move-left"
  | "move-right"
  | "pin"
  | "remove";

export function EffectActionIcon(props: { readonly kind: EffectActionIconKind }) {
  const common = {
    className: styles.icon,
    viewBox: "0 0 16 16",
    "aria-hidden": true,
    focusable: false,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "data-component": "effect-action-icon",
  };

  if (props.kind === "drag") {
    return (
      <svg {...common} fill="currentColor" stroke="none">
        <circle cx="5" cy="4" r="1" />
        <circle cx="11" cy="4" r="1" />
        <circle cx="5" cy="8" r="1" />
        <circle cx="11" cy="8" r="1" />
        <circle cx="5" cy="12" r="1" />
        <circle cx="11" cy="12" r="1" />
      </svg>
    );
  }
  if (props.kind === "move-left" || props.kind === "move-right") {
    return (
      <svg {...common}>
        <path d={props.kind === "move-left" ? "M10.5 3 5.5 8l5 5" : "M5.5 3l5 5-5 5"} />
      </svg>
    );
  }
  if (props.kind === "automation") {
    return (
      <svg {...common}>
        <path d="m2.5 11.5 3.2-4 3 2 4.8-5" />
        <circle cx="2.5" cy="11.5" r="1" fill="currentColor" stroke="none" />
        <circle cx="5.7" cy="7.5" r="1" fill="currentColor" stroke="none" />
        <circle cx="8.7" cy="9.5" r="1" fill="currentColor" stroke="none" />
        <circle cx="13.5" cy="4.5" r="1" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (props.kind === "remove") {
    return (
      <svg {...common}>
        <path d="M3.5 4.5h9M6 4.5V3h4v1.5M5 6.5l.5 6h5l.5-6M7 7v3.5M9 7v3.5" />
      </svg>
    );
  }
  if (props.kind === "pin") {
    return (
      <svg {...common}>
        <path d="M5 2.5h6l-1.1 4 2.1 2.1v1.1H8.8V14L7.2 12.4V9.7H4V8.6l2.1-2.1L5 2.5Z" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="m3 11.8.5-2.7L10.8 2l2.2 2.2-7.2 7.2-2.8.4Z" />
      <path d="m9.7 3.1 2.2 2.2M3.6 9.2l2.2 2.2" />
    </svg>
  );
}
