import { useState } from "react";
import { Diagram } from "@dgm/react";
import type { Mode, ThemeDef } from "@dgm/core/themes";

const NAMES = ["distill", "olive", "azure", "aws", "orange", "slate", "mono"];

export default function Playground({ svg, sage }: { svg: string; sage: ThemeDef }) {
  const [theme, setTheme] = useState<string>("olive");
  const [mode, setMode] = useState<Mode>("auto");
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
      <Diagram svg={svg} theme={theme === "sage" ? sage : theme} mode={mode} caption={`theme="${theme}" mode="${mode}"`} minWidth={420} />
    </div>
  );
}
