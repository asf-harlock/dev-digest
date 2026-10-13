"use client";

import React from "react";
import { Button } from "@devdigest/ui";
import { s } from "./styles";

/** An inline confirmation inside the dialog, shown where the footer is (EC-12 regenerating over an
 *  edit, EC-13 closing with one). It is not a second modal: that would need its own trap and Esc. */
export function ConfirmBar({
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  // Focus lands on the safe choice (cancel), the first button, as the bar appears.
  React.useEffect(() => {
    ref.current?.querySelector("button")?.focus();
  }, []);
  return (
    <div ref={ref} role="alertdialog" aria-label={title} style={s.bar}>
      <p style={s.title}>{title}</p>
      <p style={s.text}>{body}</p>
      <div style={s.actions}>
        <Button type="button" kind="ghost" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button type="button" kind="primary" onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}
