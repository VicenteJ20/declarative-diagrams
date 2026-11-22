import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Diagram } from "@declarative-diagrams/react";
import type { FontMode, Mode } from "@declarative-diagrams/core/themes";
import { EXAMPLES, GROUPS, THEMES, type Example } from "./catalog";
import "./playground.css";

type Core = typeof import("@declarative-diagrams/core/browser");
type LookChoice = "yaml" | "default" | "official" | "azure";

interface Rendered {
  svg: string;
  narrow: string | null;
  nodes: number;
  edges: number;
  steps: number;
  warnings: string[];
  checks: string[];
}

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
const REPO = "https://github.com/VicenteJ20/declarative-diagrams";

const b64 = {
  enc: (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
  dec: (s: string) => decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/")))),
};

function download(name: string, data: Blob | string, type = "image/svg+xml") {
  const blob = typeof data === "string" ? new Blob([data], { type }) : data;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** Rasterise a (static) SVG string to a PNG blob. */
function svgToPng(svg: string, scale = 2, background = "#ffffff"): Promise<Blob> {
  const m = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  const w = m ? Number(m[1]) : 1200;
  const h = m ? Number(m[2]) : 800;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = Math.ceil(w * scale);
      c.height = Math.ceil(h * scale);
      const g = c.getContext("2d")!;
      g.fillStyle = background;
      g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG export failed"))), "image/png");
    };
    img.onerror = () => reject(new Error("could not rasterise the SVG"));
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  });
}

const siteMode = (): "light" | "dark" =>
  document.documentElement.dataset.theme === "dark" || (!document.documentElement.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";

export default function Playground() {
  const [core, setCore] = useState<Core | null>(null);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [id, setId] = useState("hello");
  const ex: Example = EXAMPLES.find((e) => e.id === id) ?? EXAMPLES[0];
  const [yaml, setYaml] = useState(ex.yaml);
  const [theme, setTheme] = useState(ex.theme);
  const [mode, setMode] = useState<Mode>("auto");
  const [font, setFont] = useState<FontMode | "yaml">("yaml");
  const [look, setLook] = useState<LookChoice>("yaml");
  const [phone, setPhone] = useState(false);
  const [tab, setTab] = useState<"edit" | "preview">("preview");
  const [focus, setFocus] = useState(false);
  const [ui, setUi] = useState<"light" | "dark">("light");
  const [errors, setErrors] = useState<string[]>([]);
  const [out, setOut] = useState<Rendered | null>(null);
  const [gallery, setGallery] = useState<{ svg: string; narrow: string | null } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const specRef = useRef<ReturnType<Core["validateSpec"]>["spec"]>(undefined);
  const modified = !ex.prerendered && yaml !== ex.yaml;

  const say = useCallback((m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2200);
  }, []);

  // ---- engine (loaded on demand: ELK + validation run in the page) ----
  useEffect(() => {
    import("@declarative-diagrams/core/browser").then(setCore, (e) => setEngineError(String(e?.message ?? e)));
  }, []);

  // ---- page theme + deep link (#ex=<id>&y=<yaml>) ----
  useEffect(() => {
    const saved = localStorage.getItem("dgm-ui");
    const initial = saved === "dark" || saved === "light" ? saved : matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    setUi(initial);
    document.documentElement.dataset.theme = initial;
    const h = new URLSearchParams(location.hash.slice(1));
    const want = EXAMPLES.find((e) => e.id === h.get("ex"));
    if (want) {
      setId(want.id);
      setTheme(want.theme);
      setYaml(want.yaml);
      const y = h.get("y");
      if (y && !want.prerendered) {
        try {
          setYaml(b64.dec(y));
        } catch {
          /* ignore a damaged link */
        }
      }
    }
  }, []);

  const toggleUi = () => {
    const next = ui === "dark" ? "light" : "dark";
    setUi(next);
    document.documentElement.dataset.theme = next;
    localStorage.setItem("dgm-ui", next);
  };

  const pick = (e: Example) => {
    setId(e.id);
    setYaml(e.yaml);
    setTheme(e.theme);
    setLook("yaml");
    setFont("yaml");
    setPhone(false);
    setErrors([]);
    history.replaceState(null, "", `#ex=${e.id}`);
    setTab("preview");
  };

  // ---- pre-rendered examples ----
  useEffect(() => {
    setGallery(null);
    if (!ex.prerendered) return;
    let live = true;
    (async () => {
      const get = async (name: string) => {
        const r = await fetch(`${BASE}/gallery/${name}.svg`).catch(() => null);
        return r?.ok ? r.text() : null;
      };
      const [svg, narrow] = await Promise.all([get(ex.id), ex.narrow ? get(`${ex.id}.narrow`) : Promise.resolve(null)]);
      if (live && svg) setGallery({ svg, narrow });
      else if (live) setEngineError("could not load the pre-rendered diagram (are you offline?)");
    })();
    return () => {
      live = false;
    };
  }, [ex.id, ex.prerendered, ex.narrow]);

  // ---- live render of editable examples ----
  useEffect(() => {
    if (!core || ex.prerendered) return;
    const t = setTimeout(async () => {
      try {
        const res = core.validateSpec(core.parseSpecText(yaml), { missingIcons: "warn" });
        if (!res.ok || !res.spec) {
          setErrors(res.errors);
          return;
        }
        let spec = res.spec;
        if (look !== "yaml") spec = { ...spec, look };
        specRef.current = spec;
        const report: { connections?: string[] } = {};
        const svg = await core.renderSvg(spec, { embedRuntime: false, report });
        const nv = core.applyVariant(spec, "narrow");
        const narrow = nv ? await core.renderSvg(nv, { embedRuntime: false }) : null;
        const count = (l: { children?: unknown[] }[]): number => l.reduce((n, x) => n + 1 + (x.children ? count(x.children as { children?: unknown[] }[]) : 0), 0);
        setOut({ svg, narrow, nodes: count(spec.nodes as { children?: unknown[] }[]), edges: spec.edges.length, steps: spec.steps.length, warnings: res.warnings, checks: report.connections ?? [] });
        setErrors([]);
      } catch (e) {
        setErrors([String((e as Error)?.message ?? e)]);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [core, yaml, look, ex.prerendered]);

  const shown = ex.prerendered ? gallery : out;
  const effMode = (): "light" | "dark" => (mode === "auto" ? siteMode() : mode);

  // ---- actions ----
  const copy = async (text: string, what: string) => {
    await navigator.clipboard.writeText(text);
    say(`${what} copied`);
  };
  const share = () => {
    const h = `#ex=${ex.id}${modified ? `&y=${b64.enc(yaml)}` : ""}`;
    history.replaceState(null, "", h);
    copy(location.href, "Link");
  };
  const staticSvg = async (): Promise<string | null> => {
    if (ex.prerendered) {
      const r = await fetch(`${BASE}/gallery/${ex.id}.static.svg`);
      return r.ok ? r.text() : null;
    }
    if (!core || !specRef.current) return null;
    return core.renderSvg(specRef.current, { static: true, theme: theme || undefined, mode: effMode(), font: font === "yaml" ? undefined : font });
  };
  const exportAs = async (kind: "svg" | "interactive" | "png") => {
    try {
      if (kind === "interactive") {
        if (!core || !specRef.current) return;
        download(`${ex.id}.interactive.svg`, await core.renderSvg(specRef.current, { theme: theme || undefined, mode: effMode(), font: font === "yaml" ? undefined : font }));
        return;
      }
      const svg = await staticSvg();
      if (!svg) return say("Nothing to export yet");
      if (kind === "svg") download(`${ex.id}.svg`, svg);
      else download(`${ex.id}.png`, await svgToPng(svg, 2, ui === "dark" && effMode() === "dark" ? "#16151c" : "#ffffff"), "image/png");
    } catch (e) {
      say(String((e as Error).message ?? e));
    }
  };

  const onTab = (ev: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (ev.key !== "Tab") return;
    ev.preventDefault();
    const t = ev.currentTarget;
    const { selectionStart: s, selectionEnd: e } = t;
    setYaml(yaml.slice(0, s) + "  " + yaml.slice(e));
    requestAnimationFrame(() => t.setSelectionRange(s + 2, s + 2));
  };

  const hasNarrow = !!shown?.narrow;
  const frame = useMemo(() => ({ maxWidth: phone ? 390 : undefined }), [phone]);
  const status = ex.prerendered ? null : errors.length ? "bad" : out?.checks.length ? "warn" : out ? "ok" : null;

  const [menu, setMenu] = useState(false);

  return (
    <div className="pg" data-tab={tab} data-focus={focus ? "on" : undefined}>
      <header className="bar">
        <a className="brand" href={`${BASE}/`}>
          <span className="mark" aria-hidden>◈</span> declarative-diagrams
        </a>
        <label className="pick">
          <span>Example</span>
          <select value={id} onChange={(e) => pick(EXAMPLES.find((x) => x.id === e.target.value)!)}>
            {GROUPS.map((g) => (
              <optgroup key={g} label={g}>
                {EXAMPLES.filter((x) => x.group === g).map((x) => (
                  <option key={x.id} value={x.id}>{x.title}{x.prerendered ? " ★" : ""}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <span className="grow" />
        <nav>
          <a href={`${BASE}/guide/`}>Embed</a>
          <a href={REPO} target="_blank" rel="noreferrer">GitHub</a>
          <button type="button" className="icon" onClick={toggleUi} aria-label="Toggle dark mode" title="Toggle dark mode">{ui === "dark" ? "☀" : "☾"}</button>
        </nav>
      </header>

      <p className="lead">
        <b>Write a little YAML, get an interactive diagram.</b> <span>{ex.blurb}</span>
      </p>

      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "edit"} onClick={() => setTab("edit")}>YAML</button>
        <button type="button" role="tab" aria-selected={tab === "preview"} onClick={() => setTab("preview")}>Diagram</button>
      </div>

      <main className="cols">
        <section className="editor" aria-label="YAML editor">
          <div className="paneBar">
            <span className="fname">{ex.id}.diagram.yaml</span>
            {ex.prerendered ? <span className="pill">read-only</span> : modified ? <span className="pill warn">edited</span> : null}
            <span className="grow" />
            {!ex.prerendered && modified && <button type="button" className="link" onClick={() => setYaml(ex.yaml)}>Reset</button>}
            <button type="button" className="link" onClick={() => copy(yaml, "YAML")}>Copy</button>
          </div>
          <textarea
            value={ex.prerendered ? ex.yaml : yaml}
            readOnly={!!ex.prerendered}
            onChange={(e) => setYaml(e.target.value)}
            onKeyDown={onTab}
            spellCheck={false}
            wrap="off"
            aria-label="Diagram YAML"
          />
          {ex.prerendered && (
            <p className="note">
              Uses the official {ex.group} icons, which cannot be bundled (licences), so this one is pre-rendered and read-only.{" "}
              <a href={`${REPO}#icons`} target="_blank" rel="noreferrer">Run it locally</a> to edit.
            </p>
          )}
          {!ex.prerendered && errors.length > 0 && (
            <ul className="issues bad" role="alert">{errors.map((e, i) => (<li key={i}>{e}</li>))}</ul>
          )}
          {!ex.prerendered && out && out.warnings.length > 0 && errors.length === 0 && (
            <ul className="issues warn">{out.warnings.map((e, i) => (<li key={i}>{e}</li>))}</ul>
          )}
          <details className="cheat">
            <summary>YAML cheat sheet</summary>
            <dl>
              <dt><code>nodes</code></dt><dd>Boxes; <code>children</code> makes a zone. <code>icon: lu-database</code> (<a href="https://lucide.dev/icons" target="_blank" rel="noreferrer">names</a>), <code>sublabel</code>, <code>kind</code>, <code>tone</code>.</dd>
              <dt><code>edges</code></dt><dd><code>{"{ from: a, to: b, label: HTTPS, flow: true }"}</code>; <code>style: dashed</code> for optional.</dd>
              <dt><code>notes</code>, <code>steps</code></dt><dd>Numbered notes; click-through scenarios (<code>show: [ids]</code>).</dd>
              <dt><code>direction</code></dt><dd><code>RIGHT</code> or <code>DOWN</code>. <code>stackWith</code> folds a branch; <code>placement: left | right | below</code> pins a node.</dd>
              <dt><code>look</code></dt><dd><code>default</code>, <code>official</code> (AWS) or <code>azure</code>.</dd>
              <dt><code>variants.narrow</code></dt><dd>The phone version: <code>hide: [ids]</code> plus per-node patches.</dd>
            </dl>
          </details>
        </section>

        <section className="preview" aria-label="Diagram preview">
          <div className="controls">
            <label>Theme
              <select value={theme} onChange={(e) => setTheme(e.target.value)}>
                <option value="">as written</option>
                {THEMES.map((t) => (<option key={t} value={t}>{t}</option>))}
              </select>
            </label>
            <label title={ex.prerendered ? "Fixed: this example was rendered with its own look" : "Changes the drawing style and redraws"}>Look
              <select value={look} disabled={!!ex.prerendered} onChange={(e) => setLook(e.target.value as LookChoice)}>
                <option value="yaml">as written</option>
                <option value="default">soft</option>
                <option value="official">AWS</option>
                <option value="azure">Azure</option>
              </select>
            </label>
            <label>Mode
              <select value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
                <option value="auto">auto</option>
                <option value="light">light</option>
                <option value="dark">dark</option>
              </select>
            </label>
            <button type="button" className={`toggle ${phone ? "on" : ""}`} disabled={!hasNarrow} onClick={() => setPhone(!phone)} title={hasNarrow ? "Preview the phone version" : "This diagram defines no variants.narrow"}>
              Phone
            </button>
            <span className="grow" />
            <details className="more">
              <summary>More</summary>
              <div className="pop">
                <label>Font
                  <select value={font} onChange={(e) => setFont(e.target.value as FontMode | "yaml")}>
                    <option value="yaml">as written</option>
                    <option value="sans">sans</option>
                    <option value="serif">serif</option>
                  </select>
                </label>
                <button type="button" className="toggle" onClick={() => setFocus(!focus)}>{focus ? "Show editor" : "Diagram only"}</button>
              </div>
            </details>
          </div>

          <div className={`stage ${phone ? "phone" : ""}`} style={frame}>
            {engineError && <p className="issues bad">The diagram engine failed to load: {engineError}</p>}
            {!shown && !engineError && !(ex.prerendered ? false : errors.length) && <p className="loading">{ex.prerendered ? "Loading diagram…" : core ? "Drawing…" : "Loading the diagram engine…"}</p>}
            {shown && (
              <Diagram
                svg={shown.svg}
                narrowSvg={shown.narrow}
                narrowBelow={phone ? 4000 : 560}
                theme={theme || undefined}
                mode={mode}
                font={font === "yaml" ? undefined : font}
                minWidth={phone ? 330 : 520}
                expand={true}
              />
            )}
            {!ex.prerendered && errors.length > 0 && !shown && <p className="issues bad">Fix the YAML on the left to see the diagram.</p>}
          </div>

          <div className="foot">
            {status && (
              <span className={`status ${status}`}>
                {status === "bad" ? `✗ ${errors.length} problem${errors.length > 1 ? "s" : ""}` : status === "warn" ? `! ${out!.checks.length} connector warning${out!.checks.length > 1 ? "s" : ""}` : "✓ valid"}
                {out && status !== "bad" && ` · ${out.nodes} nodes · ${out.edges} edges`}
              </span>
            )}
            <span className="grow" />
            <div className="menu">
              <button type="button" className="primary" onClick={() => setMenu(!menu)} aria-expanded={menu}>Export ▾</button>
              {menu && (
                <div className="pop up" onMouseLeave={() => setMenu(false)}>
                  <button type="button" onClick={() => { setMenu(false); exportAs("png"); }}>PNG image</button>
                  <button type="button" onClick={() => { setMenu(false); exportAs("svg"); }}>SVG (static)</button>
                  {!ex.prerendered && <button type="button" onClick={() => { setMenu(false); exportAs("interactive"); }}>SVG (interactive)</button>}
                  {!ex.prerendered && <button type="button" onClick={() => { setMenu(false); share(); }}>Copy share link</button>}
                </div>
              )}
            </div>
          </div>
          {!ex.prerendered && out && out.checks.length > 0 && (
            <ul className="issues warn" aria-label="Connection check">{out.checks.map((c, i) => (<li key={i}>{c}</li>))}</ul>
          )}
        </section>
      </main>

      <footer className="end">
        Runs entirely in your browser. MIT ·{" "}
        <a href={REPO} target="_blank" rel="noreferrer">source</a> ·{" "}
        <a href={`${REPO}/blob/main/ICONS-DISCLAIMER.md`} target="_blank" rel="noreferrer">★ = pre-rendered with official AWS / Azure icons (not affiliated)</a>
      </footer>
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
