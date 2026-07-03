import { DerivedAgentModeTemplateClass, PlainAgentModeTemplate, registerAgentModeTemplate, listAgentModeTemplates } from "../template-registry"
import { claudeCodeBuildTemplate } from "./claude-code-build"
import { codexCliBuildTemplate } from "./codex-cli-build"
import { copilotCliChatTemplate } from "./copilot-cli-chat"
import { kiroCliAgentTemplate } from "./kiro-cli-agent"
import { kiroCliChatTemplate } from "./kiro-cli-chat"
import { kiroCliMetadataTemplate } from "./kiro-cli-metadata"
import { kiroCliPlanTemplate } from "./kiro-cli-plan"
import { kiroCliReviewTemplate } from "./kiro-cli-review"
import { opencodeDefaultAgentTemplate } from "./opencode-default-agent"
import { opencodeBuildTemplate, opencodeChatTemplate, opencodePlanTemplate } from "./opencode-native-modes"
import { opencodeLayoutAuditorTemplate } from "./opencode-layout-auditor"
import { opencodeObjectiveReviewerTemplate } from "./opencode-objective-reviewer"
import {
  opencodePaperCompileTemplate,
  opencodePaperPlannerTemplate,
  opencodePaperReviewerTemplate,
  opencodePaperSectionTemplate,
} from "./opencode-paper-modes"
import { opencodePaperWriterTemplate } from "./opencode-paper-writer"
import { customIoPlannerTemplate } from "./custom-io-planner"
import { opencodeChatKuaipaoTemplate } from "./opencode-chat-kuaipao"
import { opencodeChatIsolationAlphaTemplate, opencodeChatIsolationBetaTemplate } from "./opencode-isolation-modes"
import { directApiTemplate } from "./direct-llm-modes"
import { isolatedAgentModeTemplates } from "../templates/agent-mode-template"

const builtinAgentModeTemplates = [
  directApiTemplate,
  kiroCliMetadataTemplate,
  kiroCliPlanTemplate,
  kiroCliAgentTemplate,
  kiroCliChatTemplate,
  kiroCliReviewTemplate,
  opencodeChatTemplate,
  opencodePlanTemplate,
  opencodeBuildTemplate,
  opencodeDefaultAgentTemplate,
  customIoPlannerTemplate,
  opencodeChatKuaipaoTemplate,
  opencodePaperWriterTemplate,
  opencodePaperPlannerTemplate,
  opencodePaperSectionTemplate,
  opencodePaperCompileTemplate,
  opencodePaperReviewerTemplate,
  opencodeObjectiveReviewerTemplate,
  opencodeLayoutAuditorTemplate,
  opencodeChatIsolationAlphaTemplate,
  opencodeChatIsolationBetaTemplate,
  codexCliBuildTemplate,
  copilotCliChatTemplate,
  claudeCodeBuildTemplate,
  ...isolatedAgentModeTemplates.map((mode) => {
    if (mode.origin === "agent-mode-bound") return new DerivedAgentModeTemplateClass(mode)
    return new PlainAgentModeTemplate(mode)
  }),
]

let initialized = false

export function ensureAgentModeTemplatesRegistered() {
  if (initialized) return
  for (const template of builtinAgentModeTemplates) {
    registerAgentModeTemplate(template)
  }
  initialized = true
}

ensureAgentModeTemplatesRegistered()

export {
  DIRECT_API_MODE_ID,
  DIRECT_LLM_AUDIO_MODE_ID,
  DIRECT_LLM_CHAT_MODE_ID,
  DIRECT_LLM_IMAGE_MODE_ID,
  LEGACY_DIRECT_MODE_IDS,
  directApiTemplate,
  directLlmChatTemplate,
  directLlmImageTemplate,
} from "./direct-llm-modes"
export {
  claudeCodeBuildTemplate,
  codexCliBuildTemplate,
  copilotCliChatTemplate,
  kiroCliMetadataTemplate,
  opencodeDefaultAgentTemplate,
  customIoPlannerTemplate,
  opencodeChatTemplate,
  opencodePlanTemplate,
  opencodeBuildTemplate,
  opencodeLayoutAuditorTemplate,
  opencodeObjectiveReviewerTemplate,
  opencodePaperWriterTemplate,
  opencodePaperPlannerTemplate,
  opencodePaperSectionTemplate,
  opencodePaperCompileTemplate,
  opencodePaperReviewerTemplate,
}
export { listAgentModeTemplates, registerAgentModeTemplate, importAgentModeTemplateFromJson, renameAgentModeTemplateId, resolveAgentModeInheritance } from "../template-registry"
export { resolveMergedAgentModeTemplate, opencodeCustomTemplate } from "./opencode-custom-template"
export const agentModeTemplates = listAgentModeTemplates()
