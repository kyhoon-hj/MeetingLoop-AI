"use client";

import { useEffect, useRef } from "react";

export interface FeedbackDialogProps {
  open: boolean;
  title: string;
  message: string;
  onClose: () => void;
  onConfirm?: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "error" | "warning" | "info";
}

export default function FeedbackDialog({
  open,
  title,
  message,
  onClose,
  onConfirm,
  confirmLabel = "확인",
  cancelLabel = "취소",
  tone = "error"
}: FeedbackDialogProps) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="feedback-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section
        className={`feedback-dialog ${tone}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="feedback-dialog-title"
        aria-describedby="feedback-dialog-message"
      >
        <div className="feedback-dialog-icon" aria-hidden="true">!</div>
        <div className="feedback-dialog-content">
          <h2 id="feedback-dialog-title">{title}</h2>
          <p id="feedback-dialog-message">{message}</p>
        </div>
        <div className="feedback-dialog-actions">
          {onConfirm ? <button className="button secondary" type="button" onClick={onClose}>{cancelLabel}</button> : null}
          <button ref={closeButtonRef} className="button" type="button" onClick={onConfirm ?? onClose}>{confirmLabel}</button>
        </div>
      </section>
    </div>
  );
}
