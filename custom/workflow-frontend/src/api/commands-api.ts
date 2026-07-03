import { json, ndjson } from "./http-client"

export function runNode(config: unknown, bypassCache = false) {
  return ndjson("/nodes/run", { config, bypassCache })
}

export function runWorkflow(
  graph: unknown,
  bypassCache = false,
  budgetOverride = false,
  budgetBlocked = false,
  budgetBlockReason?: string,
) {
  return ndjson("/workflow/run", { graph, bypassCache, budgetOverride, budgetBlocked, budgetBlockReason })
}

export function runCommand(providerId: string, commandId: string, cwd?: string) {
  return ndjson("/commands/run", { providerId, commandId, cwd })
}

export async function runCommandSync(providerId: string, commandId: string, cwd?: string) {
  return json<{ result: unknown }>("/commands/run-sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ providerId, commandId, cwd }),
  }).then((x) => x.result)
}
