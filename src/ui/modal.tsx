"use client";

import * as React from "react";
import { createPortal } from "react-dom";

import { X } from "./icons";

/** A simple centred dialog: closes on Esc or a click on the backdrop. */
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  /* Portalled into the panel root: escapes any transformed ancestor (drag-and-drop rows) yet keeps the theme variables. */
  const host = typeof document === "undefined" ? null : (document.querySelector(".zs-root") ?? document.body);
  if (!host) return null;
  return createPortal(
    <div className="zs-modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="zs-modal" role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <b>{title}</b>
          <button type="button" aria-label="Close" onClick={onClose}>
            <X />
          </button>
        </header>
        <div className="zs-modal-body">{children}</div>
      </div>
    </div>,
    host,
  );
}
