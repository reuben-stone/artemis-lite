/**
 * IPC channel names — no dependencies, safe for preload sandbox.
 */
export const IpcChannel = {
  // Invoke (renderer → main → response)
  WORKFLOW_START: 'workflow:start',
  WORKFLOW_CANCEL: 'workflow:cancel',
  WORKFLOW_LIST: 'workflow:list',
  WORKFLOW_GET: 'workflow:get',
  WORKFLOW_TRACE: 'workflow:trace',
  WORKFLOW_USAGE: 'workflow:usage',
  APPROVAL_RESOLVE: 'approval:resolve',
  APPROVAL_LIST: 'approval:list',

  // Recovery
  WORKFLOW_INTERRUPTED: 'workflow:interrupted',
  WORKFLOW_RESUME: 'workflow:resume',

  // Failure Lab
  FAULT_ARM: 'fault:arm',
  FAULT_LIST: 'fault:list',

  // Push (main → renderer)
  WORKFLOW_EVENT: 'workflow:event'
} as const
