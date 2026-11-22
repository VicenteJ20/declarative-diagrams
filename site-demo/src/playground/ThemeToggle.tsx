import { Monitor, Moon, Sun } from "lucide-react";
import { useThemePref, type ThemePref } from "./theme";

const OPTIONS: { value: ThemePref; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "system", label: "System", Icon: Monitor },
  { value: "dark", label: "Dark", Icon: Moon },
];

export default function ThemeToggle() {
  const [pref, setPref] = useThemePref();

  return (
    <div className="themeToggle" role="group" aria-label="Colour theme">
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          aria-pressed={pref === value}
          aria-label={`${label} theme`}
          title={`${label} theme`}
          onClick={() => setPref(value)}
        >
          <Icon size={15} strokeWidth={1.8} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
