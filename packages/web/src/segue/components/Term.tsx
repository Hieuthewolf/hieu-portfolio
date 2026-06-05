import { useState, type ReactNode } from "react";
import { theme } from "../theme";

export function Term({ children, def }: { children: ReactNode; def: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      style={{ position: "relative", display: "inline-block" }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onClick={() => setOpen((o) => !o)}
    >
      <span style={{ borderBottom: "1px dotted currentColor", cursor: "help" }}>{children}</span>
      {open && (
        <span
          style={{
            position: "absolute",
            bottom: "135%",
            left: 0,
            zIndex: 30,
            width: 210,
            background: theme.ink,
            color: theme.surface,
            fontFamily: theme.sans,
            fontSize: 12,
            fontWeight: 400,
            letterSpacing: 0,
            lineHeight: 1.45,
            padding: "8px 10px",
            borderRadius: 8,
            boxShadow: "0 6px 22px rgba(0,0,0,.22)",
          }}
        >
          {def}
        </span>
      )}
    </span>
  );
}
