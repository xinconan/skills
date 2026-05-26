---
name: zhihu-zhuanlan-raw-export
description: Use when exporting a Zhihu Zhuanlan article (`https://zhuanlan.zhihu.com/p/...`) to HTML and Markdown while preserving original image and GIF URLs. Use for requests to save article正文, convert a Zhihu专栏 article to Markdown, or avoid DOM-rendered preview images by extracting data strictly from the original page response body.
---

# Zhihu Zhuanlan Raw Export

## Overview

Export a Zhihu Zhuanlan article from the original HTML response body, not from the rendered DOM. This preserves original image and GIF URLs such as `*_1440w.gif` and avoids rendered preview replacements such as `*_b.jpg`.

## Workflow

Only use this skill for Zhihu Zhuanlan article URLs in the form `https://zhuanlan.zhihu.com/p/<id>`.

Before doing anything else, verify that Node can resolve `@siping/html-to-markdown-node`:

```powershell
@'
const Module = require('node:module');
const require2 = Module.createRequire(process.cwd() + '/noop.js');
try {
  console.log(require2.resolve('@siping/html-to-markdown-node/dist/index.js', {
    paths: [process.cwd(), ...Module.globalPaths],
  }));
} catch (err) {
  console.error('Missing @siping/html-to-markdown-node');
  process.exit(1);
}
'@ | node -
```

If that check fails, install the package before continuing. Prefer one of:

```powershell
npm install @siping/html-to-markdown-node
```

or

```powershell
npm install -g @siping/html-to-markdown-node
```

Never extract with DOM code such as:

- `document.querySelector('.Post-RichText').innerHTML`
- `article.outerHTML`

Those can reflect rendered preview state rather than the original response body.

Use this sequence instead:

1. Open the article URL with Playwright.
2. Fetch the current page URL again from the page context and save the result as a local JSON artifact with a top-level `text` field containing the raw response body.
3. Run the bundled script:

```powershell
$outputDir = (Get-Location).Path
node .\skills\zhihu-zhuanlan-raw-export\scripts\export-zhihu-zhuanlan.mjs `
  --input .\tmp-zhihu-response.json `
  --output-dir $outputDir `
  --base "optional-output-name"
```
4. Delete the temporary response artifact after a successful export:

```powershell
Remove-Item -LiteralPath .\tmp-zhihu-response.json -ErrorAction SilentlyContinue
```

If the user did not provide a base name, omit `--base`. The script will derive the base name from `Post-Title` in the response body and sanitize it for Windows-safe filenames.

## Playwright Fetch Step

Use Playwright to save the original response body, not DOM content:

```js
async () => {
  const res = await fetch(location.href, { credentials: 'include' });
  const text = await res.text();
  return { status: res.status, text };
}
```

Save that result to a local file such as `tmp-zhihu-response.json`, then pass it to the bundled script.

## Script Contract

`export-zhihu-zhuanlan.mjs` accepts:

- `--input <path>`: Required. Either:
  - Raw HTML response body, or
  - JSON with a top-level `text` field containing the response body
- `--base <name>`: Optional output base name
- `--output-dir <dir>`: Optional output directory. Prefer an absolute path from the current workspace.

The script always produces:

- `<base>.html`
- `<base>.md`

## Filename Rules

When `--base` is omitted:

1. Extract `Post-Title` from the original response body.
2. Sanitize the value for Windows filenames.
3. Use the sanitized value as the output base name.

Sanitization removes invalid Windows filename characters, trims trailing dots and spaces, collapses repeated whitespace, and rewrites reserved device names.

## Validation

After running the script, verify that:

1. The generated `.html` file contains GIF URLs such as `*_1440w.gif` when the article uses GIFs.
2. The generated `.md` file also points to `.gif` URLs instead of preview JPG URLs such as `*_b.jpg`.

Quick checks:

```powershell
rg "_1440w\.gif|_b\.jpg" .\output-name.html
rg "_1440w\.gif|_b\.jpg" .\output-name.md
```

If `_b.jpg` appears where a GIF should exist, the workflow likely fell back to DOM-rendered content and should be redone from the original response body.
