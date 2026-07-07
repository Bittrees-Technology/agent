import { createRequestHandler } from '../src/portal.mjs';

const handleRequest = createRequestHandler();

export default function handler(req, res) {
  return handleRequest(req, res);
}
