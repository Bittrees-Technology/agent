import { createServer } from 'node:http';

import { createContributionRequestHandler } from './contributions/index.mjs';
import { createRequestHandler as createPortalRequestHandler } from './portal.mjs';

export function createRequestHandler(options = {}) {
  const contributionHandler = options.contributionHandler
    ?? createContributionRequestHandler(options.contributionOptions ?? options);
  const portalHandler = options.portalHandler ?? createPortalRequestHandler();

  return async function handleRequest(req, res) {
    const contributionHandled = await contributionHandler(req, res);
    if (contributionHandled) return true;
    return portalHandler(req, res);
  };
}

export function createAppServer(options = {}) {
  return createServer(createRequestHandler(options));
}
