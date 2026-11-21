import { Prisma } from '@prisma/client';

// Credentials and agent history are not business data and must not be sent to an LLM.
const blockedModels = new Set(['ai_agent_conversation', 'ai_agent_message', 'ai_agent_tool_log', 'vendor_registration_token']);
const blockedFields = /password|secret|token|private_key|api_key|credential/i;
export const dataCatalog = Object.fromEntries(Prisma.dmmf.datamodel.models
  .filter(model => !blockedModels.has(model.name))
  .map(model => [model.name, model.fields
    .filter(field => field.kind === 'scalar' && field.type !== 'Bytes' && !blockedFields.test(field.name))
    .map(field => ({ name: field.name, type: field.type, isId: field.isId }))]));
export const catalogKeys = Object.entries(dataCatalog).flatMap(([model, fields]) => fields.map(field => `db.${model}.${field.name}`));
