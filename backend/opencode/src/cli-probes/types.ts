export interface CliProbe {
  id: string
  label: string
  command: string
  available: boolean
  exitCode: number | null
  stdout: string
  stderr: string
  durationMs: number
  note?: string
}

export interface CliProviderProbeResult {
  providerId: string
  cliTemplateId: string
  probes: CliProbe[]
}
