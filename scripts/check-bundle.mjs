#!/usr/bin/env node
/**
 * Lightweight production bundle budget. Run after `npm run build`.
 *
 * The Vite entry files are the assets referenced by dist/client/index.html;
 * lazy route chunks are not counted because they do not block first paint.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const root = path.resolve(import.meta.dirname, "..");
const indexPath = path.join(root, "dist", "client", "index.html");
const budgets = { js: 180 * 1024, css: 45 * 1024 };

if (!fs.existsSync(indexPath)) {
  console.error("No production build found. Run `npm run build` first.");
  process.exit(1);
}

const html = fs.readFileSync(indexPath, "utf8");
const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/gi)].map((match) => match[1]);
const styles = [...html.matchAll(/<link\b[^>]*\bhref="([^"]+\.css)"/gi)].map((match) => match[1]);
const entryScript = scripts.find((src) => /\/assets\/index-.*\.js$/.test(src)) ?? scripts[0];
const entryStyle = styles[0];

function gzipSize(assetPath) {
  const filename = path.join(root, "dist", "client", assetPath.replace(/^\//, ""));
  if (!fs.existsSync(filename)) return null;
  return zlib.gzipSync(fs.readFileSync(filename)).length;
}

function report(label, bytes, budget) {
  if (bytes === null) {
    console.error(`${label}: missing from the build`);
    return false;
  }
  const kb = (bytes / 1024).toFixed(1);
  const budgetKb = (budget / 1024).toFixed(0);
  const ok = bytes <= budget;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}: ${kb} KB gzip (budget ${budgetKb} KB)`);
  return ok;
}

let ok = true;
ok = report("entry JavaScript", entryScript ? gzipSize(entryScript) : null, budgets.js) && ok;
ok = report("entry CSS", entryStyle ? gzipSize(entryStyle) : null, budgets.css) && ok;

if (!ok) {
  console.error("\nBundle budget exceeded.");
  process.exit(1);
}
console.log("\nBundle budget passed.");
