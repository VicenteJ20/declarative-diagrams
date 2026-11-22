import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  type ForwardedRef,
} from "react";
import { Compartment, EditorState } from "@codemirror/state";
import {
  EditorView,
  crosshairCursor,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentOnInput,
  indentUnit,
} from "@codemirror/language";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from "@codemirror/autocomplete";
import { lintGutter, lintKeymap, setDiagnostics } from "@codemirror/lint";
import { yaml } from "@codemirror/lang-yaml";
import { editorHighlight, editorTheme } from "./editorTheme";
import { makeYamlCompletions, type EditorVocab } from "./completions";
import { buildDiagnostics, type EditorIssue, type IssueLocation } from "./diagnostics";

export interface YamlEditorHandle {
  /** Move the cursor to the diagnostic at `index` (the issue list uses the same order). */
  jumpTo(index: number): void;
  focus(): void;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  issues?: EditorIssue[];
  vocab: EditorVocab;
  readOnly?: boolean;
  wrap?: boolean;
  ariaLabel?: string;
}

function YamlEditorInner(
  { value, onChange, issues = [], vocab, readOnly = false, wrap = true, ariaLabel = "Diagram YAML" }: Props,
  ref: ForwardedRef<YamlEditorHandle>,
) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const locations = useRef<IssueLocation[]>([]);
  const onChangeRef = useRef(onChange);
  const valueRef = useRef(value);
  const vocabRef = useRef(vocab);
  onChangeRef.current = onChange;
  valueRef.current = value;
  vocabRef.current = vocab;

  const readOnlyComp = useMemo(() => new Compartment(), []);
  const wrapComp = useMemo(() => new Compartment(), []);
  const completionComp = useMemo(() => new Compartment(), []);

  useEffect(() => {
    if (!host.current) return;

    const state = EditorState.create({
      doc: valueRef.current,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        EditorState.tabSize.of(2),
        indentUnit.of("  "),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        completionComp.of(
          autocompletion({
            override: [makeYamlCompletions(vocabRef.current)],
            activateOnTyping: true,
            closeOnBlur: true,
            maxRenderedOptions: 80,
          }),
        ),
        foldGutter(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        rectangularSelection(),
        crosshairCursor(),
        lintGutter(),
        yaml(),
        editorTheme,
        editorHighlight,
        EditorView.contentAttributes.of({
          "aria-label": ariaLabel,
          "aria-multiline": "true",
          spellcheck: "false",
          autocapitalize: "off",
          autocomplete: "off",
        }),
        wrapComp.of(wrap ? EditorView.lineWrapping : []),
        readOnlyComp.of([EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)]),
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...foldKeymap,
          ...completionKeymap,
          ...lintKeymap,
          indentWithTab,
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString());
        }),
      ],
    });

    const instance = new EditorView({ state, parent: host.current });
    view.current = instance;
    (window as unknown as { __cm?: EditorView }).__cm = instance;
    return () => {
      instance.destroy();
      view.current = null;
    };
    // The editor is created once; props are synced through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // External changes: example switch, reset, format.
  useEffect(() => {
    const instance = view.current;
    if (!instance) return;
    if (instance.state.doc.toString() === value) return;
    instance.dispatch({
      changes: { from: 0, to: instance.state.doc.length, insert: value },
      selection: { anchor: 0 },
      scrollIntoView: true,
    });
  }, [value]);

  // Diagnostics come from the engine (debounced in the Playground), not from a linter loop.
  useEffect(() => {
    const instance = view.current;
    if (!instance) return;
    const built = buildDiagnostics(value, issues);
    locations.current = built.locations;
    instance.dispatch(setDiagnostics(instance.state, built.diagnostics));
  }, [value, issues]);

  useEffect(() => {
    view.current?.dispatch({
      effects: readOnlyComp.reconfigure([EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)]),
    });
  }, [readOnly, readOnlyComp]);

  useEffect(() => {
    view.current?.dispatch({ effects: wrapComp.reconfigure(wrap ? EditorView.lineWrapping : []) });
  }, [wrap, wrapComp]);

  useEffect(() => {
    view.current?.dispatch({
      effects: completionComp.reconfigure(
        autocompletion({
          override: [makeYamlCompletions(vocab)],
          activateOnTyping: true,
          closeOnBlur: true,
          maxRenderedOptions: 80,
        }),
      ),
    });
  }, [vocab, completionComp]);

  useImperativeHandle(
    ref,
    () => ({
      jumpTo(index: number) {
        const instance = view.current;
        const location = locations.current[index];
        if (!instance || !location) return;
        instance.dispatch({
          selection: { anchor: location.from },
          effects: EditorView.scrollIntoView(location.from, { y: "center" }),
        });
        instance.focus();
      },
      focus() {
        view.current?.focus();
      },
    }),
    [],
  );

  return <div className="yamlEditor" ref={host} />;
}

const YamlEditor = forwardRef<YamlEditorHandle, Props>(YamlEditorInner);
export default YamlEditor;
