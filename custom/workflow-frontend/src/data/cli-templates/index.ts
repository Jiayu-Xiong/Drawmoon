import { PlainCliProviderTemplate, registerCliTemplate, getCliTemplate, listCliTemplates } from "../template-registry"
import { claudeCodeCliTemplate } from "./claude-code-cli"
import { codexCliTemplate } from "./codex-cli"
import { copilotCliTemplate } from "./copilot-cli"
import { directApiCliTemplate } from "./direct-api-cli"
import { kiroCliTemplate } from "./kiro-cli"
import { opencodeCliTemplate } from "./opencode-cli"

const builtinCliTemplates = [
  directApiCliTemplate,
  opencodeCliTemplate,
  codexCliTemplate,
  copilotCliTemplate,
  kiroCliTemplate,
  claudeCodeCliTemplate,
]

let initialized = false

export function ensureCliTemplatesRegistered() {
  if (initialized) return
  for (const template of builtinCliTemplates) {
    registerCliTemplate(template instanceof PlainCliProviderTemplate ? template : new PlainCliProviderTemplate(template))
  }
  initialized = true
}

ensureCliTemplatesRegistered()

export {
  cliTemplateByProvider,
  getCliTemplate,
  listCliTemplates,
  registerCliTemplate,
  importCliTemplateFromJson,
  renameCliTemplateId,
} from "../template-registry"

export const cliTemplates = listCliTemplates()
export { codexCliTemplate, copilotCliTemplate, directApiCliTemplate, kiroCliTemplate, opencodeCliTemplate, claudeCodeCliTemplate }
export { DIRECT_API_CLI_ID } from "./direct-api-cli"
