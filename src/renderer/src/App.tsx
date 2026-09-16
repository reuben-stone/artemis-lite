import { useState } from 'react'
import { TopBar } from './components/TopBar'
import { WorkflowRail } from './components/WorkflowRail'
import { WorkflowPanel } from './components/WorkflowPanel'
import { Inspector } from './components/Inspector'
import { BottomStrip } from './components/BottomStrip'
import { NewWorkflowDialog } from './components/NewWorkflowDialog'

export type InspectorTab = 'trace' | 'context' | 'state' | 'usage'

export interface WorkflowItem {
  id: string
  goal: string
  status: string
  createdAt: string
}

export function App() {
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('trace')
  const [showNewDialog, setShowNewDialog] = useState(false)
  const [lastEvent, setLastEvent] = useState<string | null>(null)

  const activeWorkflow = workflows.find(w => w.id === activeId) ?? null

  const handleCreate = async (goal: string) => {
    const result = await window.artemis.workflows.start({ goal })
    const item: WorkflowItem = {
      id: result.id,
      goal,
      status: result.status,
      createdAt: new Date().toISOString()
    }
    setWorkflows(prev => [item, ...prev])
    setActiveId(result.id)
    setShowNewDialog(false)
    setLastEvent(`Workflow created: ${goal.slice(0, 60)}`)
  }

  return (
    <div className="app-root">
      <TopBar workflow={activeWorkflow} />

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
          <WorkflowPanel workflow={activeWorkflow} />
        </main>

        <aside className="panel panel-right">
          <Inspector
            workflow={activeWorkflow}
            tab={inspectorTab}
            onTabChange={setInspectorTab}
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
