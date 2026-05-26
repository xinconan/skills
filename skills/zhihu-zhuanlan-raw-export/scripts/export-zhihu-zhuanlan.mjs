#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const DEFAULT_DOMAIN = "https://zhuanlan.zhihu.com";
const DEFAULT_BASENAME = "zhihu-zhuanlan-export";
const WINDOWS_RESERVED_NAMES = new Set([
  "CON",
  "PRN",
  "AUX",
  "NUL",
  "COM1",
  "COM2",
  "COM3",
  "COM4",
  "COM5",
  "COM6",
  "COM7",
  "COM8",
  "COM9",
  "LPT1",
  "LPT2",
  "LPT3",
  "LPT4",
  "LPT5",
  "LPT6",
  "LPT7",
  "LPT8",
  "LPT9",
]);
const require = createRequire(import.meta.url);

function fail(message) {
  console.error(message);
  process.exit(1);
}

function parseArgs(argv) {
  const args = {
    outputDir: process.cwd(),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input") {
      args.input = argv[++i];
    } else if (arg === "--base") {
      args.base = argv[++i];
    } else if (arg === "--output-dir") {
      args.outputDir = argv[++i];
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      fail(`Unknown argument: ${arg}`);
    }
  }

  if (!args.input) {
    fail("Missing required argument: --input <response-file>");
  }

  return args;
}

function printHelp() {
  console.log(
    [
      "Usage:",
      "  node export-zhihu-zhuanlan.mjs --input <response-file> [--base <name>] [--output-dir <dir>]",
      "",
      "Inputs:",
      "  --input       Path to a saved Zhihu response artifact. Supports either:",
      "                1. Raw HTML response body",
      "                2. JSON object with a top-level string field named `text`",
      "  --base        Optional output base name. If omitted, Post-Title is used.",
      "  --output-dir  Optional output directory. Defaults to the current directory.",
    ].join("\n"),
  );
}

function readResponseHtml(inputPath) {
  const raw = fs.readFileSync(inputPath, "utf8");
  const trimmed = raw.trim();

  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed.text === "string") {
        return parsed.text;
      }
    } catch {
      // Fall through and treat the file as raw HTML.
    }
  }

  return raw;
}

function getClassAttribute(tagText) {
  const match = /class="([^"]*)"/i.exec(tagText);
  return match ? match[1] : "";
}

function hasClassToken(tagText, token) {
  const classValue = getClassAttribute(tagText);
  return classValue.split(/\s+/).filter(Boolean).includes(token);
}

function findOpeningTag(html, tagName, classToken) {
  const pattern = new RegExp(`<${tagName}\\b[^>]*>`, "ig");
  let match;

  while ((match = pattern.exec(html)) !== null) {
    if (hasClassToken(match[0], classToken)) {
      return {
        index: match.index,
        tagText: match[0],
        contentStart: match.index + match[0].length,
      };
    }
  }

  return null;
}

function extractBalancedInnerHtml(html, openingTag, tagName) {
  const pattern = new RegExp(`</?${tagName}\\b[^>]*>`, "ig");
  pattern.lastIndex = openingTag.contentStart;

  let depth = 1;
  let match;

  while ((match = pattern.exec(html)) !== null) {
    if (match[0][1] === "/") {
      depth -= 1;
    } else {
      depth += 1;
    }

    if (depth === 0) {
      return html.slice(openingTag.contentStart, match.index);
    }
  }

  fail(`Could not find closing </${tagName}> for class token ${getClassAttribute(openingTag.tagText)}`);
}

function decodeHtmlEntities(text) {
  const named = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    "#39": "'",
  };

  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (full, entity) => {
    if (entity[0] === "#") {
      const isHex = entity[1]?.toLowerCase() === "x";
      const value = Number.parseInt(entity.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      return Number.isNaN(value) ? full : String.fromCodePoint(value);
    }

    return Object.prototype.hasOwnProperty.call(named, entity) ? named[entity] : full;
  });
}

function stripTags(html) {
  return html.replace(/<[^>]+>/g, " ");
}

function extractTitle(html) {
  const openingTag = findOpeningTag(html, "h1", "Post-Title");
  if (!openingTag) {
    fail("Could not find Post-Title in the response body.");
  }

  const closingIndex = html.indexOf("</h1>", openingTag.contentStart);
  if (closingIndex < 0) {
    fail("Could not find closing </h1> for Post-Title.");
  }

  const inner = html.slice(openingTag.contentStart, closingIndex);
  const title = decodeHtmlEntities(stripTags(inner)).replace(/\s+/g, " ").trim();

  if (!title) {
    fail("Post-Title was found, but it was empty after decoding.");
  }

  return title;
}

function ensureZhihuZhuanlanArticle(html) {
  const matched = /https:\/\/zhuanlan\.zhihu\.com\/p\/\d+/i.test(html);
  if (!matched) {
    fail("The response body does not look like a Zhihu Zhuanlan article page.");
  }
}

function sanitizeBaseName(name) {
  const cleaned = name
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/[<>:"/\\|?*]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[. ]+|[. ]+$/g, "");

  let result = cleaned || DEFAULT_BASENAME;

  if (WINDOWS_RESERVED_NAMES.has(result.toUpperCase())) {
    result = `${result}-article`;
  }

  if (result.length > 120) {
    result = result.slice(0, 120).replace(/[. ]+$/g, "").trim();
  }

  return result || DEFAULT_BASENAME;
}

function loadHtmlToMarkdown() {
  const { globalPaths } = require("node:module");
  const lookupPaths = [process.cwd(), ...globalPaths];
  let resolved;

  try {
    resolved = require.resolve("@siping/html-to-markdown-node/dist/index.js", {
      paths: lookupPaths,
    });
  } catch {
    fail(
      "Could not resolve @siping/html-to-markdown-node. Install the package first and verify Node can resolve it before running this script.",
    );
  }

  return import(pathToFileURL(resolved).href);
}

async function writeMarkdownFromHtml(html, mdPath) {
  const { convertString } = await loadHtmlToMarkdown();
  const markdown = convertString(html, { domain: DEFAULT_DOMAIN });
  fs.writeFileSync(mdPath, markdown, "utf8");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const responseHtml = readResponseHtml(args.input);

  ensureZhihuZhuanlanArticle(responseHtml);

  const richTextOpeningTag = findOpeningTag(responseHtml, "div", "Post-RichText");
  if (!richTextOpeningTag) {
    fail("Could not find Post-RichText in the response body.");
  }

  const title = extractTitle(responseHtml);
  const baseName = sanitizeBaseName(args.base || title);
  const richTextHtml = extractBalancedInnerHtml(responseHtml, richTextOpeningTag, "div");

  fs.mkdirSync(args.outputDir, { recursive: true });

  const htmlPath = path.resolve(args.outputDir, `${baseName}.html`);
  const mdPath = path.resolve(args.outputDir, `${baseName}.md`);

  fs.writeFileSync(htmlPath, richTextHtml, "utf8");
  await writeMarkdownFromHtml(richTextHtml, mdPath);

  console.log(
    JSON.stringify(
      {
        title,
        baseName,
        htmlPath,
        mdPath,
      },
      null,
      2,
    ),
  );
}

await main();
