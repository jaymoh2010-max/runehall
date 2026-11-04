import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface HoverCardProps {
  title: ReactNode;
  subtitle?: ReactNode;
  body?: ReactNode;
  meta?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}

interface HoverPosition {
  left: number;
  top: number;
  width: number;
}

/**
 * Lightweight, portal-rendered hover/focus card for compendium entries, tokens,
 * and picker rows. The wrapper uses `display: contents`, so it does not change
 * the layout of the element it describes.
 */
export function HoverCard({
  title,
  subtitle,
  body,
  meta,
  footer,
  children,
  className = "",
  disabled = false,
}: HoverCardProps) {
  const [position, setPosition] = useState<HoverPosition | null>(null);
  const showTimer = useRef<number | null>(null);
  const hideTimer = useRef<number | null>(null);

  const clearTimers = () => {
    if (showTimer.current !== null) window.clearTimeout(showTimer.current);
    if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
    showTimer.current = null;
    hideTimer.current = null;
  };

  useEffect(() => clearTimers, []);

  useEffect(() => {
    if (!disabled) return;
    clearTimers();
    setPosition(null);
  }, [disabled]);

  useEffect(() => {
    if (!position) return;
    const hide = () => setPosition(null);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [position]);

  const show = (element: HTMLElement) => {
    if (disabled) return;
    if (hideTimer.current !== null) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    if (showTimer.current !== null) return;
    showTimer.current = window.setTimeout(() => {
      showTimer.current = null;
      const anchor = (element.firstElementChild as HTMLElement | null) ?? element;
      const rect = anchor.getBoundingClientRect();
      if (!rect.width && !rect.height) return;
      const width = Math.min(340, window.innerWidth - 24);
      let left = rect.right + 12;
      if (left + width > window.innerWidth - 12) left = rect.left - width - 12;
      left = Math.max(12, Math.min(left, window.innerWidth - width - 12));
      const top = Math.max(12, Math.min(rect.top, window.innerHeight - 220));
      setPosition({ left, top, width });
    }, 140);
  };

  const hide = () => {
    if (showTimer.current !== null) {
      window.clearTimeout(showTimer.current);
      showTimer.current = null;
    }
    hideTimer.current = window.setTimeout(() => {
      hideTimer.current = null;
      setPosition(null);
    }, 70);
  };

  return (
    <>
      <div
        className={`hover-card-trigger ${className}`}
        onMouseEnter={(event) => show(event.currentTarget)}
        onMouseLeave={hide}
        onFocus={(event) => show(event.currentTarget)}
        onBlur={hide}
      >
        {children}
      </div>
      {position
        ? createPortal(
            <div
              className="hover-card"
              role="tooltip"
              style={{ left: position.left, top: position.top, width: position.width }}
            >
              <div className="hover-card-title">{title}</div>
              {subtitle ? <div className="hover-card-subtitle">{subtitle}</div> : null}
              {meta ? <div className="hover-card-meta">{meta}</div> : null}
              {body ? <div className="hover-card-body">{body}</div> : null}
              {footer ? <div className="hover-card-footer">{footer}</div> : null}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
