import { createRequestHandler } from '../src/app.mjs';

const handleRequest = createRequestHandler();

export default function handler(req, res) {
  return handleRequest(req, res);
}
