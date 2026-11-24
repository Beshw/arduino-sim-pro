/** Monaco-based sketch editor with Arduino completions and compiler diagnostics as markers. */
import React, { useEffect, useRef } from 'react';
import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
import { useStore, getState } from '../store';
import * as A from '../actions';

(self as any).MonacoEnvironment = { getWorker: () => new EditorWorker() };

const ARDUINO_FUNCS: [string, string, string][] = [
  ['pinMode', 'pinMode(${1:pin}, ${2|OUTPUT,INPUT,INPUT_PULLUP|})', 'Configure a pin as input or output'],
  ['digitalWrite', 'digitalWrite(${1:pin}, ${2|HIGH,LOW|})', 'Write HIGH/LOW to a digital pin'],
  ['digitalRead', 'digitalRead(${1:pin})', 'Read a digital pin'],
  ['analogRead', 'analogRead(${1:A0})', 'Read 10-bit ADC value (0-1023)'],
  ['analogWrite', 'analogWrite(${1:pin}, ${2:value})', 'PWM output 0-255 (pins 3,5,6,9,10,11)'],
  ['delay', 'delay(${1:ms})', 'Pause for milliseconds'],
  ['delayMicroseconds', 'delayMicroseconds(${1:us})', 'Pause for microseconds'],
  ['millis', 'millis()', 'Milliseconds since start'],
  ['micros', 'micros()', 'Microseconds since start'],
  ['map', 'map(${1:value}, ${2:fromLow}, ${3:fromHigh}, ${4:toLow}, ${5:toHigh})', 'Re-map a number'],
  ['constrain', 'constrain(${1:x}, ${2:a}, ${3:b})', 'Constrain a number to a range'],
  ['tone', 'tone(${1:pin}, ${2:frequency})', 'Generate a square wave'],
  ['noTone', 'noTone(${1:pin})', 'Stop tone()'],
  ['pulseIn', 'pulseIn(${1:pin}, ${2|HIGH,LOW|})', 'Measure a pulse length (µs)'],
  ['attachInterrupt', 'attachInterrupt(digitalPinToInterrupt(${1:2}), ${2:isr}, ${3|RISING,FALLING,CHANGE|})', 'External interrupt'],
  ['Serial.begin', 'Serial.begin(${1:9600})', 'Start serial'],
  ['Serial.println', 'Serial.println(${1})', 'Print with newline'],
  ['Serial.print', 'Serial.print(${1})', 'Print'],
  ['Serial.available', 'Serial.available()', 'Bytes waiting'],
  ['Serial.read', 'Serial.read()', 'Read one byte'],
  ['Serial.readStringUntil', "Serial.readStringUntil('${1:\\n}')", 'Read a string'],
  ['setup', 'void setup() {\n\t$0\n}', 'setup()'],
  ['loop', 'void loop() {\n\t$0\n}', 'loop()'],
];
const KEYWORDS = ['HIGH', 'LOW', 'INPUT', 'OUTPUT', 'INPUT_PULLUP', 'LED_BUILTIN', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'true', 'false', 'byte', 'boolean', 'String', 'uint8_t', 'uint16_t', 'uint32_t', 'unsigned long'];
let registered = false;
function register() {
  if (registered) return; registered = true;
  monaco.languages.registerCompletionItemProvider('cpp', {
    provideCompletionItems: (model, pos) => {
      const w = model.getWordUntilPosition(pos);
      const range = { startLineNumber: pos.lineNumber, endLineNumber: pos.lineNumber, startColumn: w.startColumn, endColumn: w.endColumn };
      return {
        suggestions: [
          ...ARDUINO_FUNCS.map(([label, insert, doc]) => ({ label, kind: monaco.languages.CompletionItemKind.Function, insertText: insert, insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: doc, range })),
          ...KEYWORDS.map((k) => ({ label: k, kind: monaco.languages.CompletionItemKind.Constant, insertText: k, range })),
        ],
      };
    },
  });
  monaco.languages.registerHoverProvider('cpp', {
    provideHover: (model, pos) => {
      const w = model.getWordAtPosition(pos);
      const f = w && ARDUINO_FUNCS.find(([l]) => l === w.word || l.endsWith('.' + w.word));
      return f ? { contents: [{ value: `**${f[0]}**` }, { value: f[2] }] } : null;
    },
  });
  monaco.editor.defineTheme('asp-dark', {
    base: 'vs-dark', inherit: true,
    rules: [{ token: 'comment', foreground: '6a8a7a', fontStyle: 'italic' }, { token: 'keyword', foreground: '5fb3ff' }, { token: 'number', foreground: 'ffb86b' }, { token: 'string', foreground: 'f6c177' }],
    colors: { 'editor.background': '#0c1424', 'editorLineNumber.foreground': '#3c4d6b', 'editorGutter.background': '#0c1424', 'editor.lineHighlightBackground': '#13203a' },
  });
  monaco.editor.defineTheme('asp-light', { base: 'vs', inherit: true, rules: [], colors: { 'editor.background': '#fbfcfe' } });
}

export default function CodeEditor() {
  const host = useRef<HTMLDivElement>(null);
  const ed = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const code = useStore((s) => s.project.code);
  const compile = useStore((s) => s.compile);
  const theme = useStore((s) => s.theme);

  useEffect(() => {
    register();
    const e = monaco.editor.create(host.current!, {
      value: getState().project.code, language: 'cpp', theme: getState().theme === 'light' ? 'asp-light' : 'asp-dark',
      fontSize: 13, fontFamily: "'JetBrains Mono', 'Cascadia Code', Consolas, monospace", fontLigatures: true, lineHeight: 21, minimap: { enabled: false }, automaticLayout: true,
      scrollBeyondLastLine: false, tabSize: 2, renderLineHighlight: 'all', smoothScrolling: true, padding: { top: 8 }, fixedOverflowWidgets: true,
      lineNumbersMinChars: 3, glyphMargin: true, wordWrap: 'off',
    });
    // the bundled font may finish loading after Monaco measured the fallback font
    document.fonts?.load("13px 'JetBrains Mono'").then(() => monaco.editor.remeasureFonts()).catch(() => undefined);
    e.onDidChangeModelContent(() => { const v = e.getValue(); if (v !== getState().project.code) A.setCode(v); });
    e.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => A.saveProject());
    e.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyR, () => A.runSimulation());
    e.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyB, () => A.build());
    ed.current = e;
    (window as any).__aspEditor = e;
    return () => e.dispose();
  }, []);
  useEffect(() => { const e = ed.current; if (e && e.getValue() !== code) e.setValue(code); }, [code]);
  useEffect(() => { monaco.editor.setTheme(theme === 'light' ? 'asp-light' : 'asp-dark'); }, [theme]);
  useEffect(() => {
    const m = ed.current?.getModel(); if (!m) return;
    const markers = (compile?.code === code ? compile.diagnostics : []).filter((d) => d.line > 0).map((d) => ({
      startLineNumber: d.line, endLineNumber: d.line, startColumn: Math.max(1, d.column), endColumn: Math.max(1, d.column) + 200,
      message: d.message, severity: d.severity === 'error' ? monaco.MarkerSeverity.Error : d.severity === 'warning' ? monaco.MarkerSeverity.Warning : monaco.MarkerSeverity.Info,
    }));
    monaco.editor.setModelMarkers(m, 'avr-gcc', markers);
  }, [compile, code]);
  return <div ref={host} className="monaco-host" data-testid="code-editor" />;
}

export function revealLine(line: number) { const e = (window as any).__aspEditor as monaco.editor.IStandaloneCodeEditor | undefined; if (e) { e.revealLineInCenter(line); e.setPosition({ lineNumber: line, column: 1 }); e.focus(); } }
