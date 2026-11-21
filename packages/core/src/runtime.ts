/**
 * Interactivity for a rendered diagram. MUST stay self-contained (no imports, no outer references):
 * it is serialised with `toString()` and embedded inside the exported SVG.
 */
export function attach(svg: SVGSVGElement): void {
  const w = svg as any;
  if (w.__dgm) return;
  w.__dgm = 1;

  const els = Array.from(svg.querySelectorAll<SVGGElement>(".el"));
  const byId = new Map<string, SVGGElement>();
  els.forEach((e) => byId.set(e.dataset.id!, e));
  const edges = els.filter((e) => e.classList.contains("edge"));
  const parent = (id: string) => byId.get(id)?.dataset.parent || "";

  const ancestors = (id: string) => {
    const out: string[] = [];
    for (let p = parent(id); p; p = parent(p)) out.push(p);
    return out;
  };
  const inSubtree = (id: string, root: string) => id === root || ancestors(id).includes(root);

  const apply = (hl: Set<string>) => {
    const ctx = new Set<string>();
    hl.forEach((id) => ancestors(id).forEach((a) => ctx.add(a)));
    svg.classList.add("dim");
    els.forEach((e) => {
      const id = e.dataset.id!;
      e.classList.toggle("hl", hl.has(id));
      e.classList.toggle("ctx", !hl.has(id) && ctx.has(id));
    });
  };
  const clear = () => {
    svg.classList.remove("dim");
    els.forEach((e) => e.classList.remove("hl", "ctx"));
  };

  const related = (id: string): Set<string> => {
    const hl = new Set<string>([id]);
    const el = byId.get(id);
    if (!el) return hl;
    if (el.classList.contains("edge")) {
      hl.add(el.dataset.from!);
      hl.add(el.dataset.to!);
      return hl;
    }
    els.forEach((e) => {
      if (!e.classList.contains("edge") && inSubtree(e.dataset.id!, id)) hl.add(e.dataset.id!);
    });
    const sub = new Set(hl); // compare against the original subtree only, not growing neighbours
    edges.forEach((e) => {
      const f = e.dataset.from!;
      const t = e.dataset.to!;
      if (sub.has(f) || sub.has(t)) {
        hl.add(e.dataset.id!);
        hl.add(f);
        hl.add(t);
      }
    });
    return hl;
  };

  // ---- steps ----
  let steps: { title: string; text?: string; seq?: string[][] }[] = [];
  try {
    steps = JSON.parse(svg.getAttribute("data-steps") || "[]");
  } catch {
    steps = [];
  }
  let step = -1;
  let pinned = "";
  const label = svg.querySelector<SVGTextElement>(".step-label");
  const prev = svg.querySelector<SVGGElement>('.btn[data-act="prev"]');
  const next = svg.querySelector<SVGGElement>('.btn[data-act="next"]');

  // staggered playback: the step's elements switch on group by group (see sequence.ts); timers are cancelled by any new call
  let timers: number[] = [];
  const cancel = () => {
    timers.forEach((t) => clearTimeout(t));
    timers = [];
    svg.querySelectorAll(".now").forEach((e) => e.classList.remove("now"));
  };
  const showStep = (k: number, opts?: { stagger?: number; onGroup?: (ids: string[], i: number, n: number) => void }) => {
    cancel();
    step = Math.max(-1, Math.min(steps.length - 1, k));
    pinned = "";
    if (step < 0) clear();
    else {
      const hl = new Set<string>();
      els.forEach((e) => {
        const s = (e.dataset.steps || "").split(",");
        if (s.includes(String(step))) hl.add(e.dataset.id!);
      });
      const seq = steps[step].seq;
      const gap = (opts?.stagger ?? 0) * 1000;
      if (gap > 0 && seq && seq.length > 1) {
        const lit = new Set<string>();
        apply(lit); // everything dimmed, then the groups light up in order and stay lit
        seq.forEach((group, i) => {
          const reveal = () => {
            svg.querySelectorAll(".now").forEach((e) => e.classList.remove("now"));
            group.forEach((id) => lit.add(id));
            apply(lit);
            group.forEach((id) => byId.get(id)?.classList.add("now"));
            opts?.onGroup?.(group, i, seq.length);
          };
          if (i === 0) reveal();
          else timers.push(window.setTimeout(reveal, i * gap));
        });
      } else apply(hl);
    }
    if (label) label.textContent = step < 0 ? `Overview · ${steps.length} steps` : `${step + 1}/${steps.length} · ${steps[step].title}`;
    prev?.classList.toggle("off", step < 0);
    next?.classList.toggle("off", step >= steps.length - 1);
  };
  if (steps.length) showStep(-1);
  // small public API so a host page can drive the steps with its own controls: svg.dgm.show(k, { stagger?: seconds, onGroup? }) (-1 = overview)
  w.dgm = { show: showStep, steps: () => steps, current: () => step, cancel };

  // ---- tooltip ----
  const NS = "http://www.w3.org/2000/svg";
  const tip = document.createElementNS(NS, "g");
  tip.setAttribute("class", "tip");
  tip.setAttribute("pointer-events", "none");
  tip.style.display = "none";
  svg.appendChild(tip);
  const showTip = (el: SVGGElement) => {
    const d = el.dataset.desc;
    if (!d) return;
    const lines: string[] = [];
    let cur = "";
    d.split(/\s+/).forEach((word) => {
      if ((cur + " " + word).length > 38) {
        lines.push(cur);
        cur = word;
      } else cur = cur ? cur + " " + word : word;
    });
    if (cur) lines.push(cur);
    const b = el.getBBox();
    const tw = Math.max(...lines.map((l) => l.length)) * 5.9 + 16;
    const th = lines.length * 14 + 10;
    const vb = svg.viewBox.baseVal;
    const x = Math.max(4, Math.min(b.x, vb.width - tw - 4));
    const y = b.y + b.height + 8 + th > vb.height ? b.y - th - 8 : b.y + b.height + 8;
    tip.innerHTML = "";
    const r = document.createElementNS(NS, "rect");
    r.setAttribute("x", String(x));
    r.setAttribute("y", String(y));
    r.setAttribute("width", String(tw));
    r.setAttribute("height", String(th));
    r.setAttribute("rx", "4");
    tip.appendChild(r);
    lines.forEach((l, i) => {
      const t = document.createElementNS(NS, "text");
      t.setAttribute("x", String(x + 8));
      t.setAttribute("y", String(y + 16 + i * 14));
      t.textContent = l;
      tip.appendChild(t);
    });
    tip.style.display = "";
  };

  // ---- events ----
  let hover = "";
  const elOf = (t: EventTarget | null) => (t as Element | null)?.closest?.(".el") as SVGGElement | null;
  svg.addEventListener("pointermove", (ev) => {
    const el = elOf(ev.target);
    const id = el?.dataset.id || "";
    if (id === hover) return;
    hover = id;
    tip.style.display = "none";
    if (step >= 0 || pinned) return;
    if (id) {
      apply(related(id));
      showTip(el!);
    } else clear();
  });
  svg.addEventListener("pointerleave", () => {
    hover = "";
    tip.style.display = "none";
    if (step < 0 && !pinned) clear();
  });
  svg.addEventListener("click", (ev) => {
    const btn = (ev.target as Element).closest?.(".btn") as SVGGElement | null;
    if (btn) {
      showStep(step + (btn.dataset.act === "next" ? 1 : -1));
      return;
    }
    if (step >= 0) return;
    const el = elOf(ev.target);
    const id = el?.dataset.id || "";
    if (id && id !== pinned) {
      pinned = id;
      apply(related(id));
    } else {
      pinned = "";
      clear();
    }
  });
  svg.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") {
      pinned = "";
      showStep(-1);
    } else if (steps.length && ev.key === "ArrowRight") showStep(step + 1);
    else if (steps.length && ev.key === "ArrowLeft") showStep(step - 1);
    else if ((ev.key === "Enter" || ev.key === " ") && elOf(ev.target)) {
      ev.preventDefault();
      (elOf(ev.target) as any).dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }
  });
}

export const RUNTIME_SOURCE = `(${attach.toString()})(document.currentScript?.ownerSVGElement||document.documentElement)`;
