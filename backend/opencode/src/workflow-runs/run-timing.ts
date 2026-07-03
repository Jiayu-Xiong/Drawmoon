import type { WorkflowRunRecord } from "./types.js"

type TimingFields = Pick<WorkflowRunRecord, "activeDurationMs" | "activeSegmentStartedAt" | "status">

export function accumulateActiveDurationMs(
  record: TimingFields,
  nowMs = Date.now(),
): number {
  const base = record.activeDurationMs ?? 0
  const segmentStart = record.activeSegmentStartedAt
  if (!segmentStart) return base
  const segMs = Math.max(0, nowMs - new Date(segmentStart).getTime())
  return base + segMs
}

export function resolveActiveDurationMs(record: TimingFields, nowMs = Date.now()): number {
  if (record.status === "running") {
    return accumulateActiveDurationMs(record, nowMs)
  }
  return record.activeDurationMs ?? 0
}

export function beginActiveSegment(record: TimingFields, atIso: string): void {
  record.activeDurationMs = record.activeDurationMs ?? 0
  record.activeSegmentStartedAt = atIso
}

export function pauseActiveSegment(record: TimingFields, atIso: string): void {
  record.activeDurationMs = accumulateActiveDurationMs(record, new Date(atIso).getTime())
  record.activeSegmentStartedAt = null
}
