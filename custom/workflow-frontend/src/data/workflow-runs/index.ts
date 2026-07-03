import type { WorkflowRunRecord } from "../console-model"

/** Mock workflow run records removed — archived under repo root `mock-workflow-entities-archived/`. */
let records: WorkflowRunRecord[] = []

export function listWorkflowRunRecords() {
  return records.map((record) => ({ ...record, promptHistory: record.promptHistory.map((entry) => ({ ...entry })) }))
}

export function getWorkflowRunRecord(id: string) {
  return listWorkflowRunRecords().find((record) => record.id === id)
}

export function createWorkflowRunRecord(record: WorkflowRunRecord) {
  if (records.some((item) => item.id === record.id)) {
    throw new Error(`Workflow run already exists: ${record.id}`)
  }
  records = [...records, record]
  return getWorkflowRunRecord(record.id)!
}

export function updateWorkflowRunRecord(id: string, patch: Partial<Omit<WorkflowRunRecord, "id">>) {
  records = records.map((record) => record.id === id ? { ...record, ...patch } : record)
  return getWorkflowRunRecord(id)
}

export function deleteWorkflowRunRecord(id: string) {
  const before = records.length
  records = records.filter((record) => record.id !== id)
  return records.length !== before
}
