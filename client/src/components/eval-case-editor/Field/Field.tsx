"use client";

import React from "react";
import { s } from "../styles";
import { errorId } from "./helpers";

/** A labelled form control with its inline error. The label is a real `<label for>`;
 *  the error is `role="alert"` and the control points at it with `aria-describedby`
 *  (see `controlProps`). Both are escaped React text. */
export function Field({
  id,
  label,
  required = false,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string | null;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={s.field}>
      <span style={s.labelRow}>
        <label htmlFor={id} style={s.label}>
          {label}
        </label>
        {required && (
          <span aria-hidden="true" style={s.required}>
            *
          </span>
        )}
      </span>
      {children}
      {hint && <span style={s.hint}>{hint}</span>}
      {error && (
        <span id={errorId(id)} role="alert" style={s.fieldError}>
          {error}
        </span>
      )}
    </div>
  );
}
