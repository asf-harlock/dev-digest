"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { safeUrl } from "./helpers";
import { s } from "./styles";

/** Markdown for untrusted repo text (UI-5): raw HTML is skipped, never
 *  rendered, and every link/image URL goes through `safeUrl`, which blanks
 *  `javascript:` and `data:` schemes. Links open in a new tab with
 *  `noopener noreferrer`. */
export function SafeMarkdown({ children }: { children: string }) {
  return (
    <div style={s.root}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={safeUrl}
        components={{
          p: ({ children }) => <p style={s.p}>{children}</p>,
          h1: ({ children }) => <h1 style={s.h1}>{children}</h1>,
          h2: ({ children }) => <h2 style={s.h2}>{children}</h2>,
          h3: ({ children }) => <h3 style={s.h3}>{children}</h3>,
          ul: ({ children }) => <ul style={s.ul}>{children}</ul>,
          ol: ({ children }) => <ol style={s.ol}>{children}</ol>,
          li: ({ children }) => <li style={s.li}>{children}</li>,
          blockquote: ({ children }) => <blockquote style={s.blockquote}>{children}</blockquote>,
          pre: ({ children }) => <pre style={s.pre}>{children}</pre>,
          code: ({ children }) => (
            <code className="mono" style={s.code}>
              {children}
            </code>
          ),
          a: ({ children, href }) => (
            <a href={href || undefined} target="_blank" rel="noopener noreferrer" style={s.a}>
              {children}
            </a>
          ),
          img: ({ src, alt }) => (src ? <img src={src} alt={alt ?? ""} style={s.img} /> : null),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
