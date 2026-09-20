"use client";

/* MarkdownBodyEditor — mono textarea + line-number gutter with scroll sync.
   Promoted out of skills' ConfigTab so it can also back the Conventions
   create-skill flow (including N-at-once drafts). No token-count/"unsaved"
   badge logic lives here — callers pass those into their own FormField's
   `right` slot, since what a badge shows differs by caller. */
import React from "react";
import { s } from "./styles";

export function MarkdownBodyEditor({
  value,
  onChange,
  minRows = 10,
}: {
  value: string;
  onChange: (v: string) => void;
  minRows?: number;
}) {
  const taRef = React.useRef<HTMLTextAreaElement>(null);
  const gutterRef = React.useRef<HTMLDivElement>(null);
  const lines = value.split("\n");

  const syncScroll = () => {
    if (gutterRef.current && taRef.current) gutterRef.current.scrollTop = taRef.current.scrollTop;
  };

  return (
    <div style={s.editorRow}>
      <div ref={gutterRef} style={s.gutter}>
        {lines.map((_, i) => (
          <div key={i} style={s.lineNo}>
            {i + 1}
          </div>
        ))}
      </div>
      <textarea
        ref={taRef}
        className="mono"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={syncScroll}
        spellCheck={false}
        rows={Math.max(lines.length, minRows)}
        style={s.textarea}
      />
    </div>
  );
}
