#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ZHIHU_REDIRECT_HOST = "link.zhihu.com";
const ZHIHU_REDIRECT_PATTERN = /https:\/\/link\.zhihu\.com\/\?[^\s)\]]+/g;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function parseArgs(argv) {
  const args = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--input") {
      args.input = argv[++i];
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }

    fail(`Unknown argument: ${arg}`);
  }

  if (!args.input) {
    fail("Missing required argument: --input <markdown-file>");
  }

  return args;
}

function printHelp() {
  console.log(
    [
      "Usage:",
      "  node unwrap-zhihu-redirect-links.mjs --input <markdown-file>",
      "",
      "Inputs:",
      "  --input  Path to the Markdown file to update in place",
    ].join("\n"),
  );
}

function decodeRedirectTarget(urlText) {
  let redirectUrl;

  try {
    redirectUrl = new URL(urlText);
  } catch {
    return null;
  }

  if (redirectUrl.hostname !== ZHIHU_REDIRECT_HOST) {
    return null;
  }

  const target = redirectUrl.searchParams.get("target");
  if (!target) {
    return null;
  }

  try {
    const targetUrl = new URL(target);
    if (!["http:", "https:"].includes(targetUrl.protocol)) {
      return null;
    }
    return targetUrl.href;
  } catch {
    return null;
  }
}

export function unwrapZhihuRedirectLinksWithStats(markdown) {
  let replacements = 0;

  const content = markdown.replace(ZHIHU_REDIRECT_PATTERN, (matchedUrl) => {
    const decodedUrl = decodeRedirectTarget(matchedUrl);
    if (!decodedUrl) {
      return matchedUrl;
    }

    replacements += 1;
    return decodedUrl;
  });

  return { content, replacements };
}

export function unwrapZhihuRedirectLinks(markdown) {
  return unwrapZhihuRedirectLinksWithStats(markdown).content;
}

function rewriteMarkdownFile(inputPath) {
  const filePath = path.resolve(inputPath);
  const markdown = fs.readFileSync(filePath, "utf8");
  const { content, replacements } = unwrapZhihuRedirectLinksWithStats(markdown);

  fs.writeFileSync(filePath, content, "utf8");

  return { filePath, replacements };
}

function isEntrypoint() {
  return process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isEntrypoint()) {
  const args = parseArgs(process.argv.slice(2));
  const result = rewriteMarkdownFile(args.input);
  console.log(JSON.stringify(result, null, 2));
}
