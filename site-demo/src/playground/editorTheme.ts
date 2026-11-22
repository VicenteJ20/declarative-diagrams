import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";

/** Styling is expressed through CSS variables, so a theme change does not recreate the editor. */
export const editorTheme = EditorView.theme(
  {
    "&": {
      height: "100%",
      color: "var(--text)",
      backgroundColor: "transparent",
      fontSize: "13px",
    },
    "&.cm-focused": { outline: "none" },
    ".cm-scroller": {
      fontFamily: "var(--mono)",
      lineHeight: "1.65",
      overflow: "auto",
    },
    ".cm-content": {
      padding: "10px 0 28px",
      caretColor: "var(--accent)",
    },
    ".cm-line": { padding: "0 18px 0 8px" },
    ".cm-gutters": {
      backgroundColor: "transparent",
      border: "none",
      color: "var(--text-subtle)",
      paddingLeft: "8px",
    },
    ".cm-lineNumbers .cm-gutterElement": {
      minWidth: "34px",
      padding: "0 8px 0 2px",
    },
    ".cm-foldGutter .cm-gutterElement": {
      padding: "0 4px",
      color: "var(--text-subtle)",
    },
    ".cm-activeLine": { backgroundColor: "var(--editor-active)" },
    ".cm-activeLineGutter": {
      backgroundColor: "var(--editor-active)",
      color: "var(--text)",
    },
    ".cm-selectionBackground, &:focus .cm-selectionBackground, ::selection": {
      backgroundColor: "var(--editor-selection) !important",
    },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--accent)" },
    ".cm-matchingBracket, &.cm-focused .cm-matchingBracket": {
      backgroundColor: "var(--accent-soft)",
      outline: "1px solid var(--accent)",
    },
    ".cm-foldPlaceholder": {
      backgroundColor: "var(--surface-2)",
      border: "1px solid var(--border)",
      color: "var(--text-muted)",
      borderRadius: "4px",
      padding: "0 4px",
    },
    ".cm-tooltip": {
      backgroundColor: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: "10px",
      boxShadow: "var(--shadow-pop)",
      color: "var(--text)",
      overflow: "hidden",
    },
    ".cm-tooltip-autocomplete > ul": {
      fontFamily: "var(--mono)",
      fontSize: "12.5px",
      maxHeight: "260px",
    },
    ".cm-tooltip-autocomplete > ul > li": { padding: "3px 8px" },
    ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
      backgroundColor: "var(--accent-soft)",
      color: "var(--text)",
    },
    ".cm-completionDetail": { color: "var(--text-muted)", fontStyle: "normal" },
    ".cm-searchMatch": {
      backgroundColor: "var(--accent-soft-strong)",
      outline: "1px solid var(--border-strong)",
    },
    ".cm-searchMatch.cm-searchMatch-selected": {
      backgroundColor: "var(--accent)",
      color: "var(--on-accent)",
    },
    ".cm-panels": {
      backgroundColor: "var(--surface)",
      color: "var(--text)",
      borderColor: "var(--border)",
    },
    ".cm-panels.cm-panels-top": { borderBottom: "1px solid var(--border)" },
    ".cm-panel.cm-search": { padding: "8px 10px", fontFamily: "var(--sans)" },
    ".cm-textfield": {
      backgroundColor: "var(--bg)",
      color: "var(--text)",
      border: "1px solid var(--border)",
      borderRadius: "6px",
      padding: "3px 6px",
    },
    ".cm-button": {
      backgroundImage: "none",
      backgroundColor: "var(--surface-2)",
      color: "var(--text)",
      border: "1px solid var(--border)",
      borderRadius: "6px",
      padding: "3px 8px",
    },
    ".cm-lintRange-error": { textDecorationColor: "var(--danger)" },
    ".cm-lintRange-warning": { textDecorationColor: "var(--warning)" },
  },
  { dark: false },
);

/** Colours map YAML tokens (keys, strings, numbers, comments) onto the site palette. */
export const editorHighlight = syntaxHighlighting(
  HighlightStyle.define([
    { tag: t.propertyName, color: "var(--cm-key)", fontWeight: "600" },
    { tag: t.string, color: "var(--cm-string)" },
    { tag: [t.number, t.integer, t.float], color: "var(--cm-number)" },
    { tag: [t.bool, t.null], color: "var(--cm-bool)", fontWeight: "600" },
    { tag: [t.comment, t.lineComment], color: "var(--cm-comment)", fontStyle: "italic" },
    { tag: [t.punctuation, t.separator], color: "var(--cm-punct)" },
    { tag: t.meta, color: "var(--cm-meta)" },
    { tag: t.tagName, color: "var(--cm-meta)" },
    { tag: t.labelName, color: "var(--cm-anchor)" },
    { tag: t.keyword, color: "var(--cm-bool)" },
  ]),
);
