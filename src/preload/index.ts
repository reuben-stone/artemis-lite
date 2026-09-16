import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannel } from '../shared/channels'

// Type-only imports — stripped at compile time, no runtime zod dependency
import type {
  StartWorkflowInput,
  CancelWorkflowInput,
  ResolveApprovalInput,
  GetWorkflowInput,
  AddProjectInput,
  RemoveProjectInput,
  SetActiveProjectInput,
  RendererEvent
} from '../shared/ipc'

const api = {
  projects: {
    list: () =>
      ipcRenderer.invoke(IpcChannel.PROJECT_LIST),
    add: (input: AddProjectInput) =>
      ipcRenderer.invoke(IpcChannel.PROJECT_ADD, input),
    remove: (input: RemoveProjectInput) =>
      ipcRenderer.invoke(IpcChannel.PROJECT_REMOVE, input),
    setActive: (input: SetActiveProjectInput) =>
      ipcRenderer.invoke(IpcChannel.PROJECT_SET_ACTIVE, input),
    getActive: () =>
      ipcRenderer.invoke(IpcChannel.PROJECT_GET_ACTIVE)
  },
  workflows: {
    start: (input: StartWorkflowInput) =>
      ipcRenderer.invoke(IpcChannel.WORKFLOW_START, input),
    cancel: (input: CancelWorkflowInput) =>
      ipcRenderer.invoke(IpcChannel.WORKFLOW_CANCEL, input),
    list: () =>
      ipcRenderer.invoke(IpcChannel.WORKFLOW_LIST),
    get: (input: GetWorkflowInput) =>
      ipcRenderer.invoke(IpcChannel.WORKFLOW_GET, input),
    trace: (input: GetWorkflowInput) =>
      ipcRenderer.invoke(IpcChannel.WORKFLOW_TRACE, input),
    usage: (input: GetWorkflowInput) =>
      ipcRenderer.invoke(IpcChannel.WORKFLOW_USAGE, input),
    interrupted: () =>
      ipcRenderer.invoke(IpcChannel.WORKFLOW_INTERRUPTED),
    resume: (input: GetWorkflowInput) =>
      ipcRenderer.invoke(IpcChannel.WORKFLOW_RESUME, input)
  },
  approvals: {
    resolve: (input: ResolveApprovalInput) =>
      ipcRenderer.invoke(IpcChannel.APPROVAL_RESOLVE, input),
    list: () =>
      ipcRenderer.invoke(IpcChannel.APPROVAL_LIST)
  },
  faultLab: {
    arm: (fault: string) =>
      ipcRenderer.invoke(IpcChannel.FAULT_ARM, { fault }),
    list: () =>
      ipcRenderer.invoke(IpcChannel.FAULT_LIST)
  },
  events: {
    onWorkflowEvent: (callback: (event: RendererEvent) => void) => {
      const handler = (_: Electron.IpcRendererEvent, data: RendererEvent) => callback(data)
      ipcRenderer.on(IpcChannel.WORKFLOW_EVENT, handler)
      return () => { ipcRenderer.removeListener(IpcChannel.WORKFLOW_EVENT, handler) }
    }
  }
}

contextBridge.exposeInMainWorld('artemis', api)

export type ArtemisAPI = typeof api
