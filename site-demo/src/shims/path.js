// Browser stand-in for `node:path` (POSIX flavour): just what the core icon store imports.
const norm = (p) => {
  const abs = p.startsWith("/");
  const out = [];
  for (const s of p.split("/")) {
    if (!s || s === ".") continue;
    if (s === "..") out.pop();
    else out.push(s);
  }
  return (abs ? "/" : "") + out.join("/");
};
export const join = (...a) => norm(a.filter(Boolean).join("/")) || ".";
export const resolve = (...a) => {
  let r = "";
  for (const s of a) r = s.startsWith("/") ? s : r ? `${r}/${s}` : s;
  return norm(r.startsWith("/") ? r : `/${r}`);
};
export const dirname = (p) => {
  const i = p.replace(/\/+$/, "").lastIndexOf("/");
  return i <= 0 ? (p.startsWith("/") ? "/" : ".") : p.slice(0, i);
};
export const basename = (p, ext) => {
  const b = p.replace(/\/+$/, "").split("/").pop() ?? "";
  return ext && b.endsWith(ext) ? b.slice(0, -ext.length) : b;
};
export const extname = (p) => {
  const b = basename(p);
  const i = b.lastIndexOf(".");
  return i > 0 ? b.slice(i) : "";
};
export default { join, resolve, dirname, basename, extname };
