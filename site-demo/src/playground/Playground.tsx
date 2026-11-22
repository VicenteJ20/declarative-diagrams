import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Diagram } from "@declarative-diagrams/react";
import type { FontMode, Mode } from "@declarative-diagrams/core/themes";
import {
  AlertTriangle,
  BookOpen,
  Braces,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  CircleX,
  Copy,
  Download,
  FileCode2,
  Info,
  Image as ImageIcon,
  Link2,
  RotateCcw,
  SlidersHorizontal,
  Smartphone,
} from "lucide-react";
import { parseDocument } from "yaml";
import Brand from "../components/Brand";
import GithubIcon from "../components/GithubIcon";
import ThemeToggle from "./ThemeToggle";
import Select, { type SelectOption } from "./Select";
import YamlEditor, { type YamlEditorHandle } from "./YamlEditor";
import type { EditorVocab } from "./completions";
import type { EditorIssue } from "./diagnostics";
import { DEFAULT_ID, EXAMPLES, GROUPS, THEMES, type Example } from "./catalog";
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
  ms: number;
}

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
const REPO = "https://github.com/VicenteJ20/declarative-diagrams";

const b64 = {
  enc: (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
  dec: (s: string) => decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/")))),
};

const draftKey = (id: string) => `dgm-draft:${id}`;

function readDraft(id: string): string | null {
  try {
    return localStorage.getItem(draftKey(id));
  } catch {
    return null;
  }
}

function removeDraft(id: string) {
  try {
    localStorage.removeItem(draftKey(id));
  } catch {
    /* private mode */
  }
}

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
  const m = /viewBox="0 0 (\d[\d.]*) ([\d.]+)"/.exec(svg);
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

const LOOKS: SelectOption<LookChoice>[] = [
  { value: "yaml", label: "As written" },
  { value: "default", label: "Soft" },
  { value: "official", label: "AWS" },
  { value: "azure", label: "Azure" },
];
const FONTS: SelectOption<FontMode | "yaml">[] = [
  { value: "yaml", label: "As written" },
  { value: "sans", label: "Sans" },
  { value: "serif", label: "Serif" },
];
const themeOptions: SelectOption[] = [{ value: "", label: "As written" }, ...THEMES.map((t) => ({ value: t, label: t }))];
const exampleOptions: SelectOption[] = GROUPS.flatMap((g) =>
  EXAMPLES.filter((x) => x.group === g).map((x) => ({ value: x.id, label: x.title, group: g, hint: x.prerendered ? "★ pre-rendered" : undefined })),
);

const siteMode = (): "light" | "dark" => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");

export default function Playground() {
  const [core, setCore] = useState<Core | null>(null);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [id, setId] = useState(DEFAULT_ID);
  const ex: Example = EXAMPLES.find((e) => e.id === id) ?? EXAMPLES[0];
  const [yaml, setYaml] = useState(ex.yaml);
  const [theme, setTheme] = useState(ex.theme);
  const [mode, setMode] = useState<Mode>("auto");
  const [font, setFont] = useState<FontMode | "yaml">("yaml");
  const [look, setLook] = useState<LookChoice>("yaml");
  const [phone, setPhone] = useState(false);
  const [tab, setTab] = useState<"edit" | "preview">("preview");
  const [focus, setFocus] = useState(false);
  const [wrap, setWrap] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);
  const [out, setOut] = useState<Rendered | null>(null);
  const [gallery, setGallery] = useState<{ svg: string; narrow: string | null } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [editorW, setEditorW] = useState(430);
  const [menu, setMenu] = useState(false);
  const specRef = useRef<ReturnType<Core["validateSpec"]>["spec"]>(undefined);
  const editorRef = useRef<YamlEditorHandle>(null);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);
  const modified = !ex.prerendered && yaml !== ex.yaml;

  const say = useCallback((m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2200);
  }, []);

  // ---- engine (loaded on demand: ELK + validation run in the page) ----
  useEffect(() => {
    import("@declarative-diagrams/core/browser").then(setCore, (e) => setEngineError(String(e?.message ?? e)));
  }, []);

  // ---- initial state: deep link (#ex=<id>&y=<yaml>) or a saved draft ----
  useEffect(() => {
    const h = new URLSearchParams(location.hash.slice(1));
    const want = EXAMPLES.find((e) => e.id === h.get("ex"));
    if (want) {
      setId(want.id);
      setTheme(want.theme);
      const encoded = h.get("y");
      let next = want.yaml;
      if (encoded && !want.prerendered) {
        try {
          next = b64.dec(encoded);
        } catch {
          /* ignore a damaged link */
        }
      } else if (!want.prerendered) {
        next = readDraft(want.id) ?? want.yaml;
      }
      setYaml(next);
      return;
    }
    const draft = readDraft(DEFAULT_ID);
    if (draft) setYaml(draft);
  }, []);

  // ---- remember a draft per example ----
  useEffect(() => {
    if (ex.prerendered) return;
    const t = setTimeout(() => {
      try {
        if (yaml === ex.yaml) localStorage.removeItem(draftKey(ex.id));
        else localStorage.setItem(draftKey(ex.id), yaml);
      } catch {
        /* private mode */
      }
    }, 350);
    return () => clearTimeout(t);
  }, [yaml, ex.id, ex.yaml, ex.prerendered]);

  // ---- remember the split width ----
  useEffect(() => {
    const saved = Number(localStorage.getItem("dgm-editor-w"));
    if (Number.isFinite(saved) && saved >= 320) setEditorW(saved);
  }, []);

  // ---- close the export menu on Escape or a click outside ----
  useEffect(() => {
    if (!menu) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(false);
    };
    const onDown = (event: MouseEvent) => {
      if (!(event.target as Element | null)?.closest(".menu")) setMenu(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [menu]);

  const pick = (next: Example) => {
    const draft = next.prerendered ? null : readDraft(next.id);
    setId(next.id);
    setYaml(draft ?? next.yaml);
    setTheme(next.theme);
    setLook("yaml");
    setFont("yaml");
    setPhone(false);
    setErrors([]);
    setOut(null);
    history.replaceState(null, "", `#ex=${next.id}`);
    setTab("preview");
  };

  const reset = () => {
    removeDraft(ex.id);
    setYaml(ex.yaml);
    setErrors([]);
    say("Reset to the original example");
  };

  const format = () => {
    const doc = parseDocument(yaml);
    if (doc.errors.length) {
      say("Fix the syntax before formatting");
      return;
    }
    const next = doc.toString({ lineWidth: 0, indent: 2 });
    setYaml(next.endsWith("\n") ? next : `${next}\n`);
    say("YAML formatted");
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
      const started = performance.now();
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
        const count = (l: { children?: unknown[] }[]): number =>
          l.reduce((n, x) => n + 1 + (x.children ? count(x.children as { children?: unknown[] }[]) : 0), 0);
        setOut({
          svg,
          narrow,
          nodes: count(spec.nodes as { children?: unknown[] }[]),
          edges: spec.edges.length,
          steps: spec.steps.length,
          warnings: res.warnings,
          checks: report.connections ?? [],
          ms: Math.round(performance.now() - started),
        });
        setErrors([]);
      } catch (e) {
        setErrors([String((e as Error)?.message ?? e)]);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [core, yaml, look, ex.prerendered]);

  const shown = ex.prerendered ? gallery : out;
  const effMode = (): "light" | "dark" => (mode === "auto" ? siteMode() : mode);

  const vocab = useMemo<EditorVocab>(
    () => ({
      icons: core ? core.listIcons("lu").map((icon) => icon.ref) : [],
      kinds: core ? Object.keys(core.KINDS) : [],
      tones: core ? [...core.TONES] : [],
      themes: THEMES,
    }),
    [core],
  );

  const issues = useMemo<EditorIssue[]>(
    () =>
      ex.prerendered
        ? []
        : errors.length
          ? errors.map((message) => ({ message, severity: "error" }))
          : (out?.warnings ?? []).map((message) => ({ message, severity: "warning" })),
    [errors, ex.prerendered, out?.warnings],
  );

  // ---- actions ----
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      say(`${what} copied`);
    } catch {
      say("Could not access the clipboard");
    }
  };

  const share = () => {
    const h = `#ex=${ex.id}${modified ? `&y=${b64.enc(yaml)}` : ""}`;
    history.replaceState(null, "", h);
    copy(location.href, "Link");
  };

  const staticSvg = async (): Promise<string | null> => {
    if (ex.prerendered) {
      const r = await fetch(`${BASE}/gallery/${ex.id}.static${effMode() === "dark" ? ".dark" : ""}.svg`);
      return r.ok ? r.text() : null;
    }
    if (!core || !specRef.current) return null;
    return core.renderSvg(specRef.current, { static: true, theme: theme || undefined, mode: effMode(), font: font === "yaml" ? undefined : font });
  };

  const exportAs = async (kind: "svg" | "interactive" | "png") => {
    try {
      if (kind === "interactive") {
        if (!core || !specRef.current) return;
        download(
          `${ex.id}.interactive.svg`,
          await core.renderSvg(specRef.current, { theme: theme || undefined, mode: effMode(), font: font === "yaml" ? undefined : font }),
        );
        return;
      }
      const svg = await staticSvg();
      if (!svg) return say("Nothing to export yet");
      if (kind === "svg") download(`${ex.id}.svg`, svg);
      else download(`${ex.id}.png`, await svgToPng(svg, 2, "#ffffff"), "image/png");
    } catch (e) {
      say(String((e as Error).message ?? e));
    }
  };

  const hasNarrow = !!shown?.narrow;
  const frame = useMemo(() => ({ maxWidth: phone ? 390 : undefined }), [phone]);
  const status = ex.prerendered ? null : errors.length ? "bad" : out?.checks.length ? "warn" : out ? "ok" : null;

  // ---- splitter ----
  const clampEditor = (width: number) => Math.max(320, Math.min(width, Math.max(360, window.innerWidth * 0.62)));
  const onSplitDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = { startX: event.clientX, startW: editorW };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onSplitMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    setEditorW(clampEditor(dragRef.current.startW + event.clientX - dragRef.current.startX));
  };
  const onSplitUp = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    try {
      localStorage.setItem("dgm-editor-w", String(editorW));
    } catch {
      /* private mode */
    }
  };
  const resetSplit = () => {
    setEditorW(430);
    try {
      localStorage.removeItem("dgm-editor-w");
    } catch {
      /* private mode */
    }
  };
  const onSplitKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    setEditorW((width) => clampEditor(width + (event.key === "ArrowRight" ? 24 : -24)));
  };

  return (
    <div className="pg" id="main" data-tab={tab} data-focus={focus ? "on" : undefined}>
      <header className="bar">
        <Brand />
        <div className="pick">
          <span className="pickLabel">Example</span>
          <Select
            className="sel-wide"
            label="Example diagram"
            icon={<FileCode2 size={15} aria-hidden="true" />}
            value={id}
            options={exampleOptions}
            searchable
            minPopWidth={320}
            onChange={(v) => pick(EXAMPLES.find((x) => x.id === v)!)}
          />
        </div>
        <span className="grow" />
        <nav aria-label="Links">
          <a href={`${BASE}/guide/`} aria-label="Guide">
            <BookOpen size={15} aria-hidden="true" />
            <span className="navLabel">Guide</span>
          </a>
          <a href={REPO} target="_blank" rel="noreferrer" aria-label="GitHub repository">
            <GithubIcon />
            <span className="navLabel">GitHub</span>
          </a>
          <ThemeToggle />
        </nav>
      </header>

      <p className="lead">
        <b>Write a little YAML, get an interactive diagram.</b> <span>{ex.blurb}</span>
      </p>

      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "edit"} onClick={() => setTab("edit")}>
          YAML
        </button>
        <button type="button" role="tab" aria-selected={tab === "preview"} onClick={() => setTab("preview")}>
          Diagram
        </button>
      </div>

      <main className="cols" style={{ "--editor-w": `${editorW}px` } as CSSProperties}>
        <section className="editor" aria-label="YAML editor">
          <div className="paneBar">
            <FileCode2 size={14} aria-hidden="true" />
            <span className="fname">{ex.id}.diagram.yaml</span>
            {ex.prerendered ? <span className="pill">read-only</span> : modified ? <span className="pill warn">edited</span> : null}
            <span className="grow" />
            {!ex.prerendered && (
              <button type="button" className="link" onClick={format} title="Re-indent and normalise the YAML">
                <Braces size={14} aria-hidden="true" />
                <span className="actionLabel">Format</span>
              </button>
            )}
            {!ex.prerendered && modified && (
              <button type="button" className="link" onClick={reset} title="Restore the original example">
                <RotateCcw size={14} aria-hidden="true" />
                <span className="actionLabel">Reset</span>
              </button>
            )}
            <button type="button" className="link" onClick={() => copy(yaml, "YAML")}>
              <Copy size={14} aria-hidden="true" />
              <span className="actionLabel">Copy</span>
            </button>
          </div>

          <div className="editorBody">
            <YamlEditor
              ref={editorRef}
              value={ex.prerendered ? ex.yaml : yaml}
              onChange={setYaml}
              issues={issues}
              vocab={vocab}
              readOnly={!!ex.prerendered}
              wrap={wrap}
            />
          </div>

          {ex.prerendered && (
            <p className="note" role="note">
              <Info size={13} aria-hidden="true" />
              <span>
                Read-only. This diagram uses the official {ex.group} icons, whose licence does not allow redistributing them, so it is
                pre-rendered. To edit it,{" "}
                <a href={`${REPO}#icons`} target="_blank" rel="noreferrer">
                  clone the project from GitHub
                </a>{" "}
                and add the icons yourself.
              </span>
            </p>
          )}

          {!ex.prerendered && errors.length > 0 && (
            <ul className="issues bad" aria-live="polite" aria-label="Validation errors">
              {errors.map((message, i) => (
                <li key={i}>
                  <button type="button" className="issueLink" onClick={() => editorRef.current?.jumpTo(i)}>
                    <CircleAlert size={13} aria-hidden="true" />
                    <span>{message}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {!ex.prerendered && out && out.warnings.length > 0 && errors.length === 0 && (
            <ul className="issues warn" aria-label="Validation warnings">
              {out.warnings.map((message, i) => (
                <li key={i}>
                  <button type="button" className="issueLink" onClick={() => editorRef.current?.jumpTo(i)}>
                    <AlertTriangle size={13} aria-hidden="true" />
                    <span>{message}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <details className="cheat">
            <summary>
              <BookOpen size={13} aria-hidden="true" /> YAML cheat sheet
            </summary>
            <dl>
              <dt>
                <code>nodes</code>
              </dt>
              <dd>
                Boxes; <code>children</code> makes a zone. <code>icon: lu-database</code> (
                <a href="https://lucide.dev/icons" target="_blank" rel="noreferrer">
                  names
                </a>
                ), <code>sublabel</code>, <code>kind</code>, <code>tone</code>.
              </dd>
              <dt>
                <code>edges</code>
              </dt>
              <dd>
                <code>{`{ from: a, to: b, label: HTTPS, flow: true }`}</code>; <code>style: dashed</code> for optional.
              </dd>
              <dt>
                <code>notes</code>, <code>steps</code>
              </dt>
              <dd>
                Numbered notes; click-through scenarios (<code>show: [ids]</code>).
              </dd>
              <dt>
                <code>direction</code>
              </dt>
              <dd>
                <code>RIGHT</code> or <code>DOWN</code>. <code>stackWith</code> folds a branch;{" "}
                <code>placement: left | right | below</code> pins a node.
              </dd>
              <dt>
                <code>look</code>
              </dt>
              <dd>
                <code>default</code>, <code>official</code> (AWS) or <code>azure</code>.
              </dd>
              <dt>
                <code>variants.narrow</code>
              </dt>
              <dd>
                The phone version: <code>hide: [ids]</code> plus per-node patches.
              </dd>
              <dt>
                <code>Ctrl/⌘ + Space</code>
              </dt>
              <dd>Key, value and icon suggestions. Errors are underlined: click one to jump to its line.</dd>
            </dl>
          </details>
        </section>

        <div
          className="splitter"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the editor"
          aria-valuenow={Math.round(editorW)}
          aria-valuemin={320}
          aria-valuemax={1600}
          tabIndex={0}
          onPointerDown={onSplitDown}
          onPointerMove={onSplitMove}
          onPointerUp={onSplitUp}
          onPointerCancel={onSplitUp}
          onDoubleClick={resetSplit}
          onKeyDown={onSplitKey}
          title="Drag to resize · double-click to reset"
        >
          <span aria-hidden="true" />
        </div>

        <section className="preview" aria-label="Diagram preview">
          <div className="controls">
            <span className="ctl">
              <span className="ctlLabel">Theme</span>
              <Select size="sm" label="Theme" value={theme} options={themeOptions} onChange={setTheme} />
            </span>
            <span className="ctl" title={ex.prerendered ? "Fixed: this example was rendered with its own look" : "Changes the drawing style and redraws"}>
              <span className="ctlLabel">Look</span>
              <Select<LookChoice> size="sm" label="Look" value={look} options={LOOKS} disabled={!!ex.prerendered} onChange={setLook} />
            </span>
            <div className="segmented" role="group" aria-label="Preview colour mode">
              {(["auto", "light", "dark"] as Mode[]).map((m) => (
                <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>
                  {m}
                </button>
              ))}
            </div>
            <button
              type="button"
              className={`toggle ${phone ? "on" : ""}`}
              disabled={!hasNarrow}
              onClick={() => setPhone(!phone)}
              title={hasNarrow ? "Preview the phone version" : "This diagram defines no variants.narrow"}
            >
              <Smartphone size={14} aria-hidden="true" />
              Phone
            </button>
            <span className="grow" />
            <details className="more">
              <summary>
                <SlidersHorizontal size={14} aria-hidden="true" /> More
              </summary>
              <div className="pop">
                <span className="ctl">
                  <span className="ctlLabel">Font</span>
                  <Select<FontMode | "yaml"> size="sm" label="Font" value={font} options={FONTS} onChange={setFont} />
                </span>
                <label className="check">
                  <input type="checkbox" checked={wrap} onChange={(e) => setWrap(e.target.checked)} />
                  Wrap long lines
                </label>
                <button type="button" className="toggle" onClick={() => setFocus(!focus)}>
                  {focus ? "Show editor" : "Diagram only"}
                </button>
              </div>
            </details>
          </div>

          <div className={`stage ${phone ? "phone" : ""}`} style={frame}>
            {engineError && <p className="issues bad">The diagram engine failed to load: {engineError}</p>}
            {!shown && !engineError && !(ex.prerendered ? false : errors.length) && (
              <p className="loading">{ex.prerendered ? "Loading diagram…" : core ? "Drawing…" : "Loading the diagram engine…"}</p>
            )}
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
            {!ex.prerendered && errors.length > 0 && shown && (
              <p className="stale" role="status">
                Showing the last valid render. Fix the YAML on the left to update it.
              </p>
            )}
          </div>

          <div className="foot">
            {status && (
              <span className={`status ${status}`} aria-live="polite">
                {status === "bad" ? (
                  <CircleX size={14} aria-hidden="true" />
                ) : status === "warn" ? (
                  <AlertTriangle size={14} aria-hidden="true" />
                ) : (
                  <CheckCircle2 size={14} aria-hidden="true" />
                )}
                <span>
                  {status === "bad"
                    ? `${errors.length} problem${errors.length > 1 ? "s" : ""}`
                    : status === "warn"
                      ? `${out!.checks.length} connector warning${out!.checks.length > 1 ? "s" : ""}`
                      : "valid"}
                  {out && status !== "bad" && ` · ${out.nodes} nodes · ${out.edges} edges · ${out.ms} ms`}
                </span>
              </span>
            )}
            <span className="grow" />
            <div className="menu">
              <button type="button" className="primary" onClick={() => setMenu(!menu)} aria-expanded={menu} aria-haspopup="menu">
                <Download size={15} aria-hidden="true" />
                Export
                <ChevronDown size={14} aria-hidden="true" />
              </button>
              {menu && (
                <div className="pop up" role="menu" onMouseLeave={() => setMenu(false)}>
                  <button
                    type="button"
                    role="menuitem"
                    autoFocus
                    onClick={() => {
                      setMenu(false);
                      exportAs("png");
                    }}
                  >
                    <ImageIcon size={14} aria-hidden="true" /> PNG image
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenu(false);
                      exportAs("svg");
                    }}
                  >
                    <FileCode2 size={14} aria-hidden="true" /> SVG (static)
                  </button>
                  {!ex.prerendered && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenu(false);
                        exportAs("interactive");
                      }}
                    >
                      <Braces size={14} aria-hidden="true" /> SVG (interactive)
                    </button>
                  )}
                  {!ex.prerendered && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenu(false);
                        share();
                      }}
                    >
                      <Link2 size={14} aria-hidden="true" /> Copy share link
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {!ex.prerendered && out && out.checks.length > 0 && (
            <ul className="issues warn" aria-label="Connection check">
              {out.checks.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <footer className="end">
        Runs entirely in your browser. MIT ·{" "}
        <a href={REPO} target="_blank" rel="noreferrer">
          source
        </a>{" "}
        ·{" "}
        <a href={`${REPO}/blob/main/ICONS-DISCLAIMER.md`} target="_blank" rel="noreferrer">
          ★ = pre-rendered with official AWS / Azure icons (not affiliated)
        </a>
      </footer>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={14} aria-hidden="true" /> {toast}
        </div>
      )}
    </div>
  );
}
