# Zhihu Link Unwrapper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a standalone post-processing script that rewrites Zhihu redirect links in exported Markdown to their decoded target URLs, and document that step in the export skill workflow.

**Architecture:** Keep the existing export script focused on raw-response extraction and HTML-to-Markdown conversion. Add a separate CLI script that rewrites Markdown files in place by decoding `https://link.zhihu.com/?target=...` URLs, then invoke that script as a documented follow-up step in the skill workflow.

**Tech Stack:** Node.js, built-in `node:test`, ECMAScript modules, existing skill docs

---

### Task 1: Define Regression Tests for Link Unwrapping

**Files:**
- Create: `skills/zhihu-zhuanlan-export/scripts/unwrap-zhihu-redirect-links.test.mjs`
- Test: `skills/zhihu-zhuanlan-export/scripts/unwrap-zhihu-redirect-links.test.mjs`

- [ ] **Step 1: Write the failing test**

Add tests for:
- decoding Markdown links whose URL is `https://link.zhihu.com/?target=<encoded>`
- preserving non-Zhihu URLs
- preserving Zhihu redirect URLs when `target` is missing or invalid

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test .\skills\zhihu-zhuanlan-export\scripts\unwrap-zhihu-redirect-links.test.mjs`
Expected: FAIL because the script module does not exist yet.

### Task 2: Implement Standalone CLI Script

**Files:**
- Create: `skills/zhihu-zhuanlan-export/scripts/unwrap-zhihu-redirect-links.mjs`
- Modify: `skills/zhihu-zhuanlan-export/scripts/unwrap-zhihu-redirect-links.test.mjs`
- Test: `skills/zhihu-zhuanlan-export/scripts/unwrap-zhihu-redirect-links.test.mjs`

- [ ] **Step 1: Write minimal implementation**

Implement:
- a pure function that rewrites matching URLs in Markdown text
- a CLI entrypoint that accepts `--input <markdown-file>`
- in-place UTF-8 read/write of the Markdown file

- [ ] **Step 2: Run test to verify it passes**

Run: `node --test .\skills\zhihu-zhuanlan-export\scripts\unwrap-zhihu-redirect-links.test.mjs`
Expected: PASS

### Task 3: Update Skill Workflow

**Files:**
- Modify: `skills/zhihu-zhuanlan-export\SKILL.md`

- [ ] **Step 1: Document the post-processing step**

Update the workflow and command examples so the skill instructs users to run the new script after Markdown export.

- [ ] **Step 2: Verify the doc references the new script correctly**

Run: `rg -n "unwrap-zhihu-redirect-links|target=" .\skills\zhihu-zhuanlan-export\SKILL.md`
Expected: output includes the new script invocation and validation guidance.

### Task 4: Verify End-to-End Behavior

**Files:**
- Modify: exported sample Markdown file in workspace if needed for verification only

- [ ] **Step 1: Run the standalone script on the exported Markdown**

Run: `node .\skills\zhihu-zhuanlan-export\scripts\unwrap-zhihu-redirect-links.mjs --input ".\CSS 技巧：如何在 clamp() 中使用 auto 值.md"`
Expected: file is updated in place and script reports replacement count.

- [ ] **Step 2: Verify decoded links exist in the sample file**

Run: `rg -n "https://juejin\.cn|https://codepen\.io|https://link\.zhihu\.com/\?target=" ".\CSS 技巧：如何在 clamp() 中使用 auto 值.md"`
Expected: decoded target URLs exist, and the Zhihu redirect form no longer appears for rewritten links.
