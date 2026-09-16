import { useState } from 'react'
import { WorkflowList } from './components/WorkflowList'
import { WorkflowPanel } from './components/WorkflowPanel'
import { InspectorPanel } from './components/InspectorPanel'

type InspectorTab = 'trace' | 'context' | 'metrics'

export function App() {
  const [activeWorkflowId, setActiveWorkflowId] = useState<string | null>(null)
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('trace')

  return (
    <div className="app-root">
      <header className="titlebar">
        <span className="titlebar-title">Artemis Lite</span>
        <span className="titlebar-meta">prototype</span>
      </header>

      <div className="app-body">
        <aside className="panel panel-left">
          <WorkflowList
            activeId={activeWorkflowId}
            onSelect={setActiveWorkflowId}
          />
        </aside>

        <main className="panel panel-center">
          <WorkflowPanel workflowId={activeWorkflowId} />
        </main>

        <aside className="panel panel-right">
          <InspectorPanel
            workflowId={activeWorkflowId}
            tab={inspectorTab}
            onTabChange={setInspectorTab}
          />
        </aside>
      </div>
    </div>
  )
}
