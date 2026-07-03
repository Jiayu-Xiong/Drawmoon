import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import type { Artifact, WorkflowNode } from "../schema/types.js"
import type { WorkflowRunArtifactRef } from "./types.js"
import { WorkflowOutputPaths } from "./output-paths.js"
import { workflowArtifactHref } from "./workspace-paths.js"
import { isBinaryArtifactPath, stdoutPersistFileName } from "./binary-artifacts.js"

export interface WorkflowOutputContext {
  dataDir: string
  runId: string
  workspaceKey: string
  workspaceDir: string
}

export { WorkflowOutputPaths, projectRootFromDataDir, DEFAULT_WORKFLOW_OUTPUT_CWD } from "./output-paths.js"

export function workflowOutputRoot(dataDir: string) {
  return new WorkflowOutputPaths(dataDir).outputRoot
}

export function runOutputDir(dataDir: string, runId: string) {
  return new WorkflowOutputPaths(dataDir).runDir(runId)
}

export function ensureRunOutputDir(dataDir: string, runId: string) {
  const dir = runOutputDir(dataDir, runId)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function outputFileName(node: WorkflowNode) {
  const meta = node.metadata as { outputFile?: string } | undefined
  const declared = meta?.outputFile ?? `${node.id}.md`
  return stdoutPersistFileName(node.id, declared)
}

export function declaredArtifactPath(node: WorkflowNode): string | undefined {
  const meta = node.metadata as { outputFile?: string } | undefined
  const declared = meta?.outputFile
  if (!declared || !isBinaryArtifactPath(declared)) return undefined
  return declared
}

function chapterMarkdownAliases(fileName: string): string[] {
  const match = fileName.match(/^chapter-(\d+)\.md$/i)
  if (!match) return [fileName]
  const n = Number(match[1])
  return [...new Set([fileName, `chapter-${n}.md`, `chapter-${String(n).padStart(2, "0")}.md`])]
}

function longestMarkdownInDir(dir: string, aliases: string[], fallback: string): string {
  let best = fallback
  for (const name of aliases) {
    const path = join(dir, name)
    if (!existsSync(path)) continue
    const content = stripProviderNoise(readFileSync(path, "utf-8"))
    if (content.length > best.length) best = content
  }
  return best
}

/** Read upstream markdown for final-review, resolving chapter-1 vs chapter-01 aliases. */
export function readRunMarkdownForReview(runDir: string, fileName: string): string {
  return longestMarkdownInDir(runDir, chapterMarkdownAliases(fileName), "")
}

const KIRO_NOISE_LINE = /^(Reading directory:|Reading file:|Batch fs_read|↱ Operation|⋮|- Summary:|✓ Successfully|✗ |- Completed in| - Completed in|Searching for files:|Let me |I need to |I'll |> 我|^> 好的|^> 我需要|^> 我已经|^> 注意到)/i

function unwrapKiroNumberedDiffLine(line: string) {
  const match = line.match(/^\+\s+\d+:\s?(.*)$/)
  return match ? match[1] ?? "" : line
}

export function stripProviderNoise(text: string) {
  const lines = text.split("\n")
  const cleaned: string[] = []
  let skippingToolBlock = false
  for (const line of lines) {
    const trimmed = line.trim()
    if (/^>\s*(Searching for files|Let me |I need to |I'll )/i.test(trimmed)) {
      skippingToolBlock = true
      continue
    }
    if (skippingToolBlock && trimmed === "") {
      skippingToolBlock = false
      continue
    }
    if (KIRO_NOISE_LINE.test(trimmed)) continue
    if (/^>\s*$/.test(line)) continue
    if (/^我准备开始撰写|^完成后将提供/.test(trimmed)) continue
    if (trimmed.startsWith(">")) {
      const body = trimmed.slice(1).trim()
      if (body) cleaned.push(body)
      continue
    }
    cleaned.push(unwrapKiroNumberedDiffLine(line))
  }
  let output = cleaned.join("\n").replace(/\n{3,}/g, "\n\n").trim()
  if (/^\+\s+\d+:/m.test(output)) {
    output = cleaned.map((line) => unwrapKiroNumberedDiffLine(line)).join("\n").replace(/\n{3,}/g, "\n\n").trim()
  }
  return output
}

export function buildFinalNovelFromChapters(
  ctx: WorkflowOutputContext,
  chapterFiles = ["chapter-1.md", "chapter-2.md", "chapter-3.md", "chapter-4.md"],
) {
  const dir = ctx.workspaceDir
  const planPath = join(dir, "master-plan.md")
  let title = "玄幻小说"
  let blurb = ""
  if (existsSync(planPath)) {
    const plan = stripProviderNoise(readFileSync(planPath, "utf-8"))
    const titleMatch = plan.match(/书名[：:]\s*《?([^》\n]+)》?/) ?? plan.match(/^《([^》]+)》/m)
    if (titleMatch?.[1]) title = titleMatch[1].trim()
    const blurbMatch = plan.match(/梗概[：:]\s*(.+)/) ?? plan.match(/一句话梗概[：:]\s*(.+)/)
    if (blurbMatch?.[1]) blurb = blurbMatch[1].trim()
  }

  const chapters = chapterFiles
    .map((name) => {
      const filePath = join(dir, name)
      if (!existsSync(filePath)) return null
      return stripProviderNoise(readFileSync(filePath, "utf-8"))
    })
    .filter((item): item is string => Boolean(item))

  const toc = chapters
    .map((chapter) => {
      const head = chapter.split("\n").map((line) => line.trim()).find((line) => line.startsWith("【第"))
      return head ?? ""
    })
    .filter(Boolean)

  const body = [
    title,
    blurb,
    "目录",
    ...toc,
    "",
    ...chapters,
  ].filter((line, index) => !(index === 1 && !blurb)).join("\n\n")

  const filePath = join(dir, "final-novel.md")
  writeFileSync(filePath, body, "utf-8")
  writeFinalHtml(ctx, body)
  writeFinalPdf(ctx, body)
  return { filePath, body, charCount: body.replace(/\s/g, "").length }
}

export function persistNodeMarkdown(
  ctx: WorkflowOutputContext,
  node: WorkflowNode,
  rawText: string,
): { artifact: Artifact; ref: WorkflowRunArtifactRef } {
  const fileName = outputFileName(node)
  const filePath = join(ctx.workspaceDir, fileName)
  mkdirSync(dirname(filePath), { recursive: true })
  const rawClean = stripProviderNoise(rawText)
  const aliases = chapterMarkdownAliases(fileName)
  const text = longestMarkdownInDir(ctx.workspaceDir, aliases, rawClean)
  writeFileSync(filePath, text, "utf-8")

  const href = workflowArtifactHref(ctx.workspaceKey, fileName)
  const artifact: Artifact = {
    name: fileName,
    mime: "text/markdown",
    content: href,
    isReference: true,
  }
  const ref: WorkflowRunArtifactRef = {
    nodeId: node.id,
    label: node.label,
    kind: "markdown",
    path: fileName,
    href,
  }
  return { artifact, ref }
}

export function writeFinalHtml(ctx: WorkflowOutputContext, markdown: string) {
  const dir = ctx.workspaceDir
  const escaped = markdown
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Novel Output</title>
<style>body{font-family:Georgia,serif;max-width:720px;margin:2rem auto;padding:0 1rem;line-height:1.7;color:#222}
pre{white-space:pre-wrap;background:#f6f6f6;padding:1rem;border-radius:8px}</style></head>
<body><pre>${escaped}</pre></body></html>`
  const filePath = join(dir, "final-novel.html")
  writeFileSync(filePath, html, "utf-8")
  return filePath
}

function pdfEscape(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)")
}

function encodePdfString(value: string) {
  return Buffer.from(value, "utf16le").swap16()
}

function pdfTextObject(lines: string[]) {
  const chunks = ["BT", "/F1 11 Tf", "50 792 Td", "14 TL"]
  for (const line of lines) {
    chunks.push(`<FEFF${encodePdfString(pdfEscape(line)).toString("hex").toUpperCase()}> Tj`, "T*")
  }
  chunks.push("ET")
  return chunks.join("\n")
}

export function writeFinalPdf(ctx: WorkflowOutputContext, markdown: string) {
  const dir = ctx.workspaceDir
  const rawLines = markdown
    .replace(/\r/g, "")
    .split("\n")
    .flatMap((line) => {
      const trimmed = line.trim()
      if (!trimmed) return [""]
      const parts: string[] = []
      for (let index = 0; index < trimmed.length; index += 48) parts.push(trimmed.slice(index, index + 48))
      return parts
    })
  const pages = Math.max(1, Math.ceil(rawLines.length / 48))
  const objects: string[] = []
  objects.push("<< /Type /Catalog /Pages 2 0 R >>")
  const pageObjectIds = Array.from({ length: pages }, (_, index) => 3 + index * 2)
  objects.push(`<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages} >>`)
  for (let page = 0; page < pages; page += 1) {
    const pageId = 3 + page * 2
    const contentId = pageId + 1
    const pageLines = rawLines.slice(page * 48, (page + 1) * 48)
    const content = pdfTextObject(pageLines)
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 << /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /UniGB-UCS2-H /DescendantFonts [<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 2 >> >>] >> >> >> >> /Contents ${contentId} 0 R >>`)
    objects.push(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`)
  }
  const buffers: Buffer[] = [Buffer.from("%PDF-1.4\n", "ascii")]
  const offsets: number[] = [0]
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.concat(buffers).length)
    buffers.push(Buffer.from(`${index + 1} 0 obj\n${objects[index]}\nendobj\n`, "utf-8"))
  }
  const body = Buffer.concat(buffers)
  const xrefOffset = body.length
  const xref = [
    "xref",
    `0 ${objects.length + 1}`,
    "0000000000 65535 f ",
    ...offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `),
    "trailer",
    `<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    "startxref",
    String(xrefOffset),
    "%%EOF",
  ].join("\n")
  const filePath = join(dir, "final-novel.pdf")
  writeFileSync(filePath, Buffer.concat([body, Buffer.from(xref, "ascii")]))
  return filePath
}

export function readRunMarkdownFiles(dataDir: string, runId: string, names: string[]) {
  const dir = runOutputDir(dataDir, runId)
  return names
    .map((name) => {
      const filePath = join(dir, name)
      if (!existsSync(filePath)) return null
      return { name, text: readFileSync(filePath, "utf-8") }
    })
    .filter((item): item is { name: string; text: string } => Boolean(item))
}

export function listRunArtifacts(ctx: WorkflowOutputContext): WorkflowRunArtifactRef[] {
  const dir = ctx.workspaceDir
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => name.endsWith(".md") || name.endsWith(".html") || name.endsWith(".pdf") || /\.(png|jpe?g|webp|gif)$/i.test(name))
    .map((name) => ({
      nodeId: name.replace(/\.[^.]+$/, ""),
      label: name,
      kind: name.endsWith(".pdf") ? "pdf" as const : name.endsWith(".html") ? "other" as const : /\.(png|jpe?g|webp|gif)$/i.test(name) ? "image" as const : "markdown" as const,
      path: name,
      href: workflowArtifactHref(ctx.workspaceKey, name),
    }))
}
