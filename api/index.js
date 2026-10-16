import { projectAdministrationNode } from '../shared/project-administration/portal.mjs';
const administration = projectAdministrationNode('agent');
import { createRequestHandler } from '../src/portal.mjs';

const handleRequest = createRequestHandler();

export default function handler(req, res) {
  if (/^\/(administration\/?|api\/(project-admin(?:\/.*)?|shared-roles-health))$/.test(new URL(req.url, 'https://agent.bittrees.org').pathname)) return administration(req,res);
  return handleRequest(req, res);
}
