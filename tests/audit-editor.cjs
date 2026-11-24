const fs = require("node:fs");
const html = fs.readFileSync("index.html", "utf8");
const script = fs.readFileSync("script.js", "utf8");
const css = fs.readFileSync("styles.css", "utf8");
const readme = fs.readFileSync("README.md", "utf8");
function assert(condition, message) { if (!condition) throw new Error(message); }
assert(!/monaco-editor@[^"]+loader\\.js/.test(html), "Monaco loader must not block the initial Project Hub load.");
assert(!/jszip@[^"]+dist\\/jszip\\.min\\.js/.test(html), "JSZip must be loaded only when an archive action needs it.");
for (const id of ["editorLoading", "editorLoadingTitle", "editorLoadingDetail", "editorEngineFallback", "retryEditorButton"]) {
  assert(html.includes('id="' + id + '"'), "Missing editor loading UI: " + id);
}
assert(script.includes("function loadExternalScript("), "Shared lazy script loader is missing.");
assert(script.includes("function loadMonacoEngine("), "Recoverable Monaco loader is missing.");
assert(script.includes("function loadJSZip("), "Lazy JSZip loader is missing.");
assert(script.includes("monacoLoad=null"), "Failed Monaco downloads must be retryable.");
assert(script.includes("formatOnPaste:true") && script.includes('autoIndent:"full"'), "Editor typing ergonomics are incomplete.");
assert(script.includes("setModelMarkers(model"), "Inline structural diagnostics are not registered.");
assert(script.includes('if(language==="json")') && script.includes("JSON.parse(source)"), "JSON syntax diagnostics are missing.");
assert(script.includes('editorText("count"'), "Diagnostic summaries must follow the selected UI language.");
assert(!/Object\\.keys\\(state\\.project\\.files\\)\\.forEach\\(ensureModel\\)/.test(script), "Opening a project must not eagerly instantiate every source model.");
assert(css.includes(".editor-loading-spinner") && css.includes(".editor-engine-fallback"), "Editor loading and fallback states need dedicated styles.");
assert(readme.includes("not a C/C++ compiler or a semantic language server"), "The limits of live diagnostics must be documented accurately.");
console.log("Editor audit passed: lazy dependencies, lazy models, loading/retry states, JSON validation and bounded diagnostics.");
