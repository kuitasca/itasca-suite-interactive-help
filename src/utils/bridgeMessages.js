export const TIMEOUT_MS = 5000;

export const MESSAGE_TYPES = {
  ASK_ROSIE: 'askRosie',
  CONTINUE_SESSION: 'continueSession',
  GET_ROSIE_SESSIONS: 'getRosieSessions',
  SUGGEST_COMMANDS: 'suggestCommands',
  INSERT_COMMAND: 'insertCommand',
  CONTEXT_UPDATE: 'contextUpdate',
  PEER_READY: 'peerReady',
  PEER_UNAVAILABLE: 'peerUnavailable',
  PROJECT_CHANGED: 'projectChanged',
  READY: 'ready',
  READ_FILE: 'readFile',
  WRITE_FILE: 'writeFile',
  CREATE_FILE: 'createFile',
  LIST_DIR: 'listDir',
  DELETE_FILE: 'deleteFile',
  RUN_CODE: 'runCode',
  GET_MODEL_DATA: 'getModelData',
  GET_PROJECT_INFO: 'getProjectInfo',
  GET_ZONE_LIST: 'getZoneList',
  GET_GROUP_LIST: 'getGroupList',
};

let counter = 0;

export function generateId() {
  counter = (counter + 1) % 0xFFFFFF;
  return Date.now().toString(36) + counter.toString(36);
}

export function createMessage(type, payload, from) {
  return {
    type,
    id: generateId(),
    from,
    payload: payload || {},
  };
}

export function createResponse(originalMsg, status, payload, error) {
  return {
    type: originalMsg.type + 'Response',
    id: originalMsg.id,
    from: originalMsg._respondAs || 'qt',
    status,
    payload: payload || {},
    error: error || null,
  };
}
