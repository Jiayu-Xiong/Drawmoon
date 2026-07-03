import { isBinaryArtifactPath } from "../../binary-artifacts.js"
import type { ResolvedFile } from "../resolver.js"
import type { InputDescriptorKind, NodeContractInput } from "../types.js"

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg)$/i
const MARKDOWN_EXT = /\.(md|markdown)$/i
const TEXT_EXT = /\.(txt|tex|json|yaml|yml|csv|ts|tsx|js|jsx|py|rs|go|html|css|xml|toml)$/i

export interface InputDescriptorBase {
  key: string
  path: string
  mime: string
  kind: InputDescriptorKind
  exists: boolean
  mode: NodeContractInput["mode"]
  slice?: string
}

export class TextInput implements InputDescriptorBase {
  readonly kind = "text" as const
  constructor(
    readonly key: string,
    readonly path: string,
    readonly mime: string,
    readonly exists: boolean,
    readonly mode: NodeContractInput["mode"] = "reference",
    readonly slice?: string,
  ) {}
}

export class MarkdownInput implements InputDescriptorBase {
  readonly kind = "markdown" as const
  constructor(
    readonly key: string,
    readonly path: string,
    readonly mime: string,
    readonly exists: boolean,
    readonly mode: NodeContractInput["mode"] = "reference",
    readonly slice?: string,
  ) {}
}

export class ImageInput implements InputDescriptorBase {
  readonly kind = "image" as const
  constructor(
    readonly key: string,
    readonly path: string,
    readonly mime: string,
    readonly exists: boolean,
    readonly mode: NodeContractInput["mode"] = "reference",
    readonly slice?: string,
  ) {}
}

export class PdfInput implements InputDescriptorBase {
  readonly kind = "pdf" as const
  constructor(
    readonly key: string,
    readonly path: string,
    readonly mime: string,
    readonly exists: boolean,
    readonly mode: NodeContractInput["mode"] = "reference",
    readonly slice?: string,
  ) {}
}

export class BinaryInput implements InputDescriptorBase {
  readonly kind = "binary" as const
  constructor(
    readonly key: string,
    readonly path: string,
    readonly mime: string,
    readonly exists: boolean,
    readonly mode: NodeContractInput["mode"] = "reference",
    readonly slice?: string,
  ) {}
}

export type InputDescriptor = TextInput | MarkdownInput | ImageInput | PdfInput | BinaryInput

function inferMime(path: string): string {
  const lower = path.replace(/\\/g, "/").toLowerCase()
  if (lower.endsWith(".pdf")) return "application/pdf"
  if (/\.png$/i.test(lower)) return "image/png"
  if (/\.jpe?g$/i.test(lower)) return "image/jpeg"
  if (/\.gif$/i.test(lower)) return "image/gif"
  if (/\.webp$/i.test(lower)) return "image/webp"
  if (/\.svg$/i.test(lower)) return "image/svg+xml"
  if (MARKDOWN_EXT.test(lower)) return "text/markdown"
  if (TEXT_EXT.test(lower)) return "text/plain"
  return "application/octet-stream"
}

function classify(path: string, mime: string): InputDescriptorKind {
  const norm = path.replace(/\\/g, "/").toLowerCase()
  if (norm.endsWith(".pdf") || mime === "application/pdf") return "pdf"
  if (IMAGE_EXT.test(norm) || mime.startsWith("image/")) return "image"
  if (MARKDOWN_EXT.test(norm) || mime === "text/markdown") return "markdown"
  if (TEXT_EXT.test(norm) || mime.startsWith("text/")) return "text"
  if (isBinaryArtifactPath(path)) return "binary"
  return "binary"
}

export function createInputDescriptor(
  key: string,
  resolved: ResolvedFile,
  options?: { mode?: NodeContractInput["mode"]; slice?: string },
): InputDescriptor {
  const mime = inferMime(resolved.path)
  const kind = classify(resolved.path, mime)
  const mode = options?.mode ?? "reference"
  const slice = options?.slice
  const base = { key, path: resolved.path, mime, exists: resolved.exists, mode, slice }
  switch (kind) {
    case "pdf":
      return new PdfInput(base.key, base.path, base.mime, base.exists, base.mode, base.slice)
    case "image":
      return new ImageInput(base.key, base.path, base.mime, base.exists, base.mode, base.slice)
    case "markdown":
      return new MarkdownInput(base.key, base.path, base.mime, base.exists, base.mode, base.slice)
    case "text":
      return new TextInput(base.key, base.path, base.mime, base.exists, base.mode, base.slice)
    default:
      return new BinaryInput(base.key, base.path, base.mime, base.exists, base.mode, base.slice)
  }
}

/** Cheap manifest line — never reads binary file bodies. */
export function describeInputDescriptor(desc: InputDescriptor): string {
  if (desc.kind === "pdf") {
    return `Input [${desc.key}]: ${desc.path} — PDF (read via your file tools)`
  }
  if (desc.kind === "image") {
    return `Input [${desc.key}]: ${desc.path} — image/${desc.mime.split("/")[1] ?? "file"}`
  }
  if (desc.kind === "binary") {
    return `Input [${desc.key}]: ${desc.path} — binary (read via your file tools)`
  }
  if (!desc.exists) {
    return `Input [${desc.key}]: ${desc.path} — (missing)`
  }
  return `Input [${desc.key}]: ${desc.path} — text (read via workflow-io.read_file)`
}

export function isTextLikeDescriptor(desc: InputDescriptor): boolean {
  return desc.kind === "text" || desc.kind === "markdown"
}

export function isBinaryLikeDescriptor(desc: InputDescriptor): boolean {
  return desc.kind === "pdf" || desc.kind === "image" || desc.kind === "binary"
}
