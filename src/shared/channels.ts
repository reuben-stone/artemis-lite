/**
 * IPC channel names — no dependencies, safe for preload sandbox.
 */
export const IpcChannel = {
  // Invoke (renderer → main → response)
  WORKFLOW_START: 'workflow:start',
  WORKFLOW_CANCEL: 'workflow:cancel',
  WORKFLOW_DELETE: 'workflow:delete',
  WORKFLOW_LIST: 'workflow:list',
  WORKFLOW_GET: 'workflow:get',
  WORKFLOW_TRACE: 'workflow:trace',
  WORKFLOW_USAGE: 'workflow:usage',
  WORKFLOW_CONTEXT: 'workflow:context',
  APPROVAL_RESOLVE: 'approval:resolve',
  APPROVAL_LIST: 'approval:list',

  // Projects
  PROJECT_LIST: 'project:list',
  PROJECT_ADD: 'project:add',
  PROJECT_REMOVE: 'project:remove',
  PROJECT_SET_ACTIVE: 'project:setActive',
  PROJECT_GET_ACTIVE: 'project:getActive',
  PROJECT_PICK_FOLDER: 'project:pickFolder',

  // Recovery
  WORKFLOW_INTERRUPTED: 'workflow:interrupted',
  WORKFLOW_RESUME: 'workflow:resume',

  // Failure Lab
  FAULT_ARM: 'fault:arm',
  FAULT_LIST: 'fault:list',

  // Push (main → renderer)
  WORKFLOW_EVENT: 'workflow:event'
} as const
