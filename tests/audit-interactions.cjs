"use strict";
const fs = require("node:fs");

const html = fs.readFileSync("index.html", "utf8");
const script = fs.readFileSync("script.js", "utf8");
const ids = [...html.matchAll(/\\bid="([^"]+)"/g)].map(match => match[1]);
const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
if (duplicateIds.length) throw new Error("Duplicate IDs: " + duplicateIds.join(", "));
const idSet = new Set(ids);

const buttons = [...html.matchAll(/<button\\b([^>]*)>([\\s\\S]*?)<\\/button>/g)];
if (!buttons.length) throw new Error("No buttons found in index.html.");
const failures = [];
for (let index = 0; index < buttons.length; index++) {
  const attrs = buttons[index][1];
  const body = buttons[index][2];
  const id = (attrs.match(/\\bid="([^"]+)"/) || [])[1] || null;
  const attrMap = Object.fromEntries([...attrs.matchAll(/\\b(data-[\\w-]+)="([^"]+)"/g)].map(m => [m[1], m[2]]));
  if (!/\\btype="button"/.test(attrs)) failures.push("Button " + (id || index + 1) + " is missing type=button.");
  if (/\\bonclick\\s*=/i.test(attrs)) failures.push("Inline onclick is not allowed on " + (id || "button " + (index + 1)) + ".");
  const visibleText = body.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
  if (!visibleText && !/\\b(?:aria-label|title)="[^"]+"/.test(attrs)) failures.push("Button " + (id || index + 1) + " has no accessible name.");

  if (id) {
    const escaped = id.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&");
    const direct = new RegExp('\\\\$\\\\([\\\\"\\\\']#' + escaped + '[\\\\"\\\\']\\\\)\\\\.(?:onclick|onchange|oninput|onkeyup|onkeydown|addEventListener)\\\\s*=').test(script);
    const modalAlias = id === "modalConfirmButton" && script.includes('const modal=$("#kernoModal"),input=$("#modalInput"),confirmButton=$("#modalConfirmButton")') && script.includes("confirmButton.onclick=");
    const classDelegation =
      (attrs.includes("settings-nav-item") && script.includes('$$(".settings-nav-item")')) ||
      (attrs.includes("workspace-nav-item") && script.includes('$$(".workspace-nav-item")'));
    if (!direct && !modalAlias && !classDelegation) failures.push("No event binding found for button #" + id + ".");
  } else {
    const delegated =
      (attrMap["data-complete-step"] !== undefined && script.includes('closest("[data-complete-step]")')) ||
      (attrMap["data-tutorial-action"] !== undefined && script.includes('closest("[data-tutorial-action]")')) ||
      (attrMap["data-category"] !== undefined && script.includes('$$(".settings-nav-item")')) ||
      (attrMap["data-workspace"] !== undefined && script.includes('$$(".workspace-nav-item")')) ||
      (attrMap["data-kernel-stage"] !== undefined && script.includes('closest("[data-kernel-stage]")'));
    if (!delegated) failures.push("No delegated click handler found for button " + (JSON.stringify(attrMap) || (index + 1)) + ".");
  }
}

for (const [, href] of html.matchAll(/\\bhref="#([^"]+)"/g)) {
  if (!idSet.has(href)) failures.push("Broken in-page link: #" + href);
}
for (const [, attrs] of html.matchAll(/<a\\b([^>]*)>/g)) {
  if (/\\btarget="_blank"/.test(attrs) && !/\\brel="[^"]*noopener/.test(attrs)) {
    failures.push("External target=_blank link is missing rel=noopener.");
  }
}
for (const stage of [3, 5, 8]) {
  if (!html.includes('data-kernel-stage="' + stage + '"')) failures.push("Missing kernel topic action for tutorial stage " + stage + ".");
  if (!html.includes('id="tutorial-stage-' + stage + '"')) failures.push("Missing tutorial target " + stage + ".");
}
if (!script.includes('$("#kernelMapGrid").addEventListener("click"') || !script.includes("function openTutorialStage(index)")) {
  failures.push("Kernel topic cards are not wired to tutorial navigation.");
}
if (!script.includes("function landingScrollBehavior()") || !script.includes("prefers-reduced-motion: reduce")) {
  failures.push("Landing navigation must respect reduced-motion preferences.");
}

if (failures.length) {
  console.error(failures.map((failure, index) => (index + 1) + ". " + failure).join("\\n"));
  process.exit(1);
}
console.log("Interaction audit passed: " + buttons.length + " buttons checked, all actions wired, all internal links resolve, and accessible labels/types are present.");
