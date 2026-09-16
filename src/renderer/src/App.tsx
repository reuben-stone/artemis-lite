import { useState, useEffect, useCallback, useRef } from 'react'
import { TopBar } from './components/TopBar'
import { WorkflowRail } from './components/WorkflowRail'
import { WorkflowPanel } from './components/WorkflowPanel'
import { Inspector } from './components/Inspector'
import { BottomStrip } from './components/BottomStrip'
import { NewWorkflowDialog } from './components/NewWorkflowDialog'

export type InspectorTab = 'trace' | 'context' | 'state' | 'usage' | 'faults'

export interface WorkflowItem {
  id: string
  goal: string
  status: string
  createdAt: string
}

export interface TraceEvent {
  id: string
  workflowId: string
  stepId: string | null
  timestamp: string
  type: string
  status: string | null
  durationMs: number | null
  model: string | null
  inputTokens: number | null
  outputTokens: number | null
  toolName: string | null
  retry: number | null
  errorCode: string | null
  metadata: string | null
}

export interface WorkflowStep {
  id: string
  workflowId: string
  type: string
  status: string
  attempt: number
  toolName: string | null
  outputData: string | null
  startedAt: string | null
  completedAt: string | null
}

export interface UsageData {
  modelCalls: number
  inputTokens: number
  outputTokens: number
  estimatedCost: number
  toolCalls: number
  retries: number
  durationMs: number
}

export interface ApprovalData {
  id: string
  workflowId: string
  stepId: string
  action: string
  summary: string
  risk: string
  payloadPreview: unknown
  status: string
}

export function App() {
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('trace')
  const [showNewDialog, setShowNewDialog] = useState(false)
  const [lastEvent, setLastEvent] = useState<string | null>(null)
  const [traceEvents, setTraceEvents] = useState<TraceEvent[]>([])
  const [steps, setSteps] = useState<WorkflowStep[]>([])
  const [usage, setUsage] = useState<UsageData | null>(null)
  const [pendingApproval, setPendingApproval] = useState<ApprovalData | null>(null)
  const [busy, setBusy] = useState(false)

  const activeIdRef = useRef(activeId)
  activeIdRef.current = activeId

  const activeWorkflow = workflows.find(w => w.id === activeId) ?? null

  // Load persisted workflows on mount + discover interrupted
  useEffect(() => {
    async function init() {
      const list = await window.artemis.workflows.list()
      setWorkflows(list)

      // Check for interrupted workflows
      const interrupted = await window.artemis.workflows.interrupted()
      if (interrupted.length > 0) {
        const wf = interrupted[0] // Resume the most recent
        setActiveId(wf.id)
        setLastEvent(`Recovered workflow from checkpoint — ${wf.goal.slice(0, 50)}`)
        setBusy(true)

        try {
          const result = await window.artemis.workflows.resume({ workflowId: wf.id })
          setWorkflows(prev => prev.map(w =>
            w.id === wf.id ? { ...w, status: result.status } : w
          ))
          refreshWorkflowData(wf.id)
        } catch (err: any) {
          setLastEvent(`Recovery failed: ${err.message ?? String(err)}`)
        } finally {
          setBusy(false)
        }
      }
    }
    init()
  }, [])

  // Subscribe to workflow events
  useEffect(() => {
    const unsub = window.artemis.events.onWorkflowEvent((event: any) => {
      if (event.type === 'workflow.status') {
        setWorkflows(prev => prev.map(w =>
          w.id === event.workflowId ? { ...w, status: event.status } : w
        ))
        setLastEvent(`${event.status.replace(/_/g, ' ')}`)
        if (event.status === 'completed' || event.status === 'failed' || event.status === 'cancelled') {
          setBusy(false)
        }
      }

      if (event.type === 'workflow.completed') {
        setUsage(event.usage)
      }

      if (event.type === 'workflow.failed') {
        setLastEvent(`Failed: ${event.error}`)
      }

      if (event.type === 'approval.requested') {
        setPendingApproval(event.approval)
      }

      if (event.type === 'model.text') {
        setLastEvent(event.text.slice(0, 80))
      }

      // Refresh trace and steps for active workflow
      if (event.workflowId && event.workflowId === activeIdRef.current) {
        refreshWorkflowData(event.workflowId)
      }
    })

    return unsub
  }, [])

  const refreshWorkflowData = useCallback(async (wfId: string) => {
    const [traceResult, detailResult, usageResult] = await Promise.all([
      window.artemis.workflows.trace({ workflowId: wfId }),
      window.artemis.workflows.get({ workflowId: wfId }),
      window.artemis.workflows.usage({ workflowId: wfId })
    ])
    setTraceEvents(traceResult.events)
    setSteps(detailResult.steps ?? [])
    setUsage(usageResult.usage)
  }, [])

  // Refresh when selecting a workflow
  useEffect(() => {
    if (activeId) {
      refreshWorkflowData(activeId)
    } else {
      setTraceEvents([])
      setSteps([])
      setUsage(null)
    }
  }, [activeId, refreshWorkflowData])

  const handleCreate = async (goal: string) => {
    setShowNewDialog(false)
    setBusy(true)
    setPendingApproval(null)
    setTraceEvents([])
    setSteps([])
    setUsage(null)

    // Optimistic add
    const tempId = crypto.randomUUID()
    const tempItem: WorkflowItem = {
      id: tempId,
      goal,
      status: 'queued',
      createdAt: new Date().toISOString()
    }
    setWorkflows(prev => [tempItem, ...prev])
    setActiveId(tempId)
    setLastEvent('Starting workflow...')

    try {
      const result = await window.artemis.workflows.start({ goal })
      // Replace temp with real
      setWorkflows(prev => prev.map(w =>
        w.id === tempId ? { ...w, id: result.id, status: result.status } : w
      ))
      setActiveId(result.id)
      refreshWorkflowData(result.id)
    } catch (err: any) {
      setWorkflows(prev => prev.map(w =>
        w.id === tempId ? { ...w, status: 'failed' } : w
      ))
      setLastEvent(`Error: ${err.message ?? String(err)}`)
      setBusy(false)
    }
  }

  const handleApproval = async (approvalId: string, decision: 'approved' | 'rejected') => {
    setPendingApproval(null)
    await window.artemis.approvals.resolve({ approvalId, decision })
  }

  return (
    <div className="app-root">
      <TopBar workflow={activeWorkflow} usage={usage} busy={busy} />

      <div className="app-body">
        <aside className="panel panel-left">
          <WorkflowRail
            workflows={workflows}
            activeId={activeId}
            onSelect={setActiveId}
            onNew={() => setShowNewDialog(true)}
          />
        </aside>

        <main className="panel panel-center">
          <WorkflowPanel
            workflow={activeWorkflow}
            steps={steps}
            pendingApproval={pendingApproval}
            onApproval={handleApproval}
          />
        </main>

        <aside className="panel panel-right">
          <Inspector
            workflow={activeWorkflow}
            tab={inspectorTab}
            onTabChange={setInspectorTab}
            traceEvents={traceEvents}
            steps={steps}
            usage={usage}
          />
        </aside>
      </div>

      <BottomStrip message={lastEvent} />

      {showNewDialog && (
        <NewWorkflowDialog
          onSubmit={handleCreate}
          onClose={() => setShowNewDialog(false)}
        />
      )}
    </div>
  )
}
