import { useState } from "react";
import { Diagram } from "@declarative-diagrams/react";
import type { FontMode, Mode, ThemeDef } from "@declarative-diagrams/core/themes";

const NAMES = ["distill", "olive", "azure", "aws", "orange", "slate", "mono"];

export default function Playground({ svg, sage }: { svg: string; sage: ThemeDef }) {
  const [theme, setTheme] = useState<string>("olive");
  const [mode, setMode] = useState<Mode>("auto");
  const [font, setFont] = useState<FontMode>("mixed");
  const btn = (active: boolean) => ({
    font: "13px system-ui", padding: "3px 10px", marginRight: 6, borderRadius: 6, cursor: "pointer",
    border: "1px solid #8884", background: active ? "#8885" : "transparent", color: "inherit",
  });
  return (
    <div>
      <div style={{ margin: "1rem 0" }}>
        {[...NAMES, "sage"].map((n) => (
          <button key={n} style={btn(theme === n)} onClick={() => setTheme(n)}>{n}</button>
        ))}
      </div>
      <div style={{ margin: "1rem 0" }}>
        {(["auto", "light", "dark"] as Mode[]).map((m) => (
          <button key={m} style={btn(mode === m)} onClick={() => setMode(m)}>{m}</button>
        ))}
      </div>
      <div style={{ margin: "1rem 0" }}>
        {(["mixed", "sans", "serif"] as FontMode[]).map((f) => (
          <button key={f} style={btn(font === f)} onClick={() => setFont(f)}>{f}</button>
        ))}
      </div>
      <Diagram svg={svg} theme={theme === "sage" ? sage : theme} mode={mode} font={font} caption={`theme="${theme}" mode="${mode}" font="${font}"`} minWidth={420} />
    </div>
  );
}
