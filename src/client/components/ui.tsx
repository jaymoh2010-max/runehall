import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";
import { AUTOMATION_HINTS, AUTOMATION_LABELS, type AutomationLevel } from "../../shared/automation";

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------
type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "gold";
type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  block?: boolean;
}

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  icon,
  block,
  children,
  className = "",
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={`btn btn-${variant} btn-${size} ${block ? "btn-block" : ""} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? (
        <Loader2 className="spin" size={16} />
      ) : icon ? (
        <span className="btn-icon">{icon}</span>
      ) : null}
      {children ? <span>{children}</span> : null}
    </button>
  );
}

export function IconButton({
  label,
  children,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button className={`icon-btn ${className}`} aria-label={label} title={label} {...rest}>
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Badges and tags
// ---------------------------------------------------------------------------
export function Badge({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: "neutral" | "gold" | "green" | "red" | "blue" | "violet";
  className?: string;
}) {
  return <span className={`badge badge-${tone} ${className}`}>{children}</span>;
}

export function Tag({
  children,
  tone = "neutral",
  title,
}: {
  children: ReactNode;
  tone?: "neutral" | "gold" | "red" | "blue" | "green" | "violet";
  title?: string;
}) {
  return (
    <span className={`tag tag-${tone}`} title={title}>
      {children}
    </span>
  );
}

export function RarityTag({ rarity }: { rarity: string }) {
  const tone =
    rarity === "rare" || rarity === "unique"
      ? "violet"
      : rarity === "uncommon"
        ? "blue"
        : "neutral";
  return <Tag tone={tone}>{rarity}</Tag>;
}

export function AutomationTag({ level }: { level: AutomationLevel }) {
  const tone = level === "full" ? "green" : level === "partial" ? "gold" : "neutral";
  return (
    <Tag tone={tone} title={AUTOMATION_HINTS[level]}>
      {AUTOMATION_LABELS[level]}
    </Tag>
  );
}

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------
export function Field({
  label,
  hint,
  error,
  children,
  className = "",
  htmlFor,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <label className={`field ${className}`} htmlFor={htmlFor}>
      {label ? <span className="field-label">{label}</span> : null}
      {children}
      {error ? (
        <span className="field-error">{error}</span>
      ) : hint ? (
        <span className="field-hint">{hint}</span>
      ) : null}
    </label>
  );
}

export function Input({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`input ${className}`} {...rest} />;
}

export function Textarea({ className = "", ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`textarea ${className}`} {...rest} />;
}

export function Select({
  className = "",
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`select ${className}`} {...rest}>
      {children}
    </select>
  );
}

export function Checkbox({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: ReactNode;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <label className={`checkbox-row ${disabled ? "is-disabled" : ""}`} htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  ariaLabel,
  disabled,
  title,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label?: ReactNode;
  ariaLabel?: string;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      className={`toggle ${checked ? "is-on" : ""}`}
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      title={title}
    >
      <span className="toggle-track">
        <span className="toggle-thumb" />
      </span>
      {label ? <span className="toggle-label">{label}</span> : null}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Layout / display
// ---------------------------------------------------------------------------
export function Card({
  children,
  className = "",
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <div id={id} className={`card ${className}`}>
      {children}
    </div>
  );
}

export function SectionTitle({
  title,
  subtitle,
  action,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="section-title">
      <div>
        <h2>{title}</h2>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {action ? <div className="section-action">{action}</div> : null}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      {icon ? <div className="empty-icon">{icon}</div> : null}
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
      {action ? <div className="empty-action">{action}</div> : null}
    </div>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="spinner-row">
      <Loader2 className="spin" size={18} />
      <span>{label}</span>
    </div>
  );
}

export function LoadingScreen({ label = "Opening the hall…" }: { label?: string }) {
  return (
    <div className="loading-screen">
      <div className="loading-mark">
        <img src="/rune.svg" alt="" />
      </div>
      <Spinner label={label} />
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-state">
      <h3>Something went wrong</h3>
      <p>{message}</p>
      {onRetry ? <Button onClick={onRetry}>Try again</Button> : null}
    </div>
  );
}

export function initialsForName(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?"
  );
}

export function Avatar({
  name,
  src,
  size = 40,
  className = "",
}: {
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={`avatar ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(11, size * 0.32) }}
      aria-hidden="true"
    >
      {src ? <img src={src} alt="" loading="lazy" decoding="async" /> : initialsForName(name)}
    </span>
  );
}

export function RichText({ html, className = "" }: { html: string; className?: string }) {
  if (!html) return <p className="muted">No description.</p>;
  return <div className={`rich-text ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");
const modalStack: symbol[] = [];

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  wide,
  extraWide,
  closeOnBackdrop = true,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  extraWide?: boolean;
  closeOnBackdrop?: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  if (open && !wasOpenRef.current) {
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }
  wasOpenRef.current = open;

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    const stackEntry = Symbol("modal");
    const previousFocus = previousFocusRef.current;
    const previousOverflow = document.body.style.overflow;
    modalStack.push(stackEntry);
    document.body.style.overflow = "hidden";

    const focusable = () =>
      dialog
        ? Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
            (element) => element.getClientRects().length > 0
          )
        : [];

    const frame = window.requestAnimationFrame(() => {
      // Keep a field's own autoFocus from being stolen by the close button.
      if (dialog?.contains(document.activeElement)) return;
      (focusable()[0] ?? dialog)?.focus();
    });

    const onKey = (event: KeyboardEvent) => {
      if (modalStack[modalStack.length - 1] !== stackEntry) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) {
        event.preventDefault();
        dialog?.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKey);
      const index = modalStack.indexOf(stackEntry);
      if (index >= 0) modalStack.splice(index, 1);
      document.body.style.overflow = previousOverflow;
      if (previousFocus && document.contains(previousFocus)) previousFocus.focus();
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className={`modal ${wide ? "modal-wide" : ""} ${extraWide ? "modal-extra-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : "Dialog"}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {(title || subtitle) && (
          <div className="modal-head">
            <div>
              {title ? <h2>{title}</h2> : null}
              {subtitle ? <p>{subtitle}</p> : null}
            </div>
            <IconButton label="Close" onClick={onClose}>
              <X size={18} />
            </IconButton>
          </div>
        )}
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>,
    document.body
  );
}

export function PageEyebrow({ children }: { children: ReactNode }) {
  return <span className="page-eyebrow">{children}</span>;
}

export function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "gold" | "red" | "blue" | "green";
}) {
  return (
    <div className={`stat ${tone ? `stat-${tone}` : ""}`}>
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      {hint ? <span className="stat-hint">{hint}</span> : null}
    </div>
  );
}

export function ProgressBar({
  value,
  max,
  label,
}: {
  value: number;
  max: number;
  label?: ReactNode;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="progress-wrap">
      {label ? <div className="progress-label">{label}</div> : null}
      <div className="progress">
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
