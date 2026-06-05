import { theme } from "../theme";

interface SelectProps {
  label: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (value: string) => void;
}

export function Select({ label, value, options, onChange }: SelectProps) {
  return (
    <label style={{ display: "grid", gap: 5 }}>
      <span
        style={{
          fontFamily: theme.mono,
          fontSize: 10.5,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: theme.muted,
        }}
      >
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          fontFamily: theme.sans,
          fontSize: 14,
          color: theme.ink,
          background: theme.surface,
          border: `1px solid ${theme.line}`,
          borderRadius: 9,
          padding: "8px 10px",
          cursor: "pointer",
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
