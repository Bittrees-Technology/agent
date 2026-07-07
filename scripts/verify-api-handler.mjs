import { EventEmitter } from 'node:events';

import handler from '../api/index.js';

function mockRequest({ method, path, host = 'agent.bittrees.org' }) {
  const req = new EventEmitter();
  req.method = method;
  req.url = path;
  req.headers = { host };
  req.resume = () => req;
  return req;
}

function mockResponse() {
  const res = {
    statusCode: null,
    headers: {},
    body: '',
    writeHead(statusCode, headers) {
      res.statusCode = statusCode;
      Object.assign(res.headers, headers);
    },
    end(chunk) {
      if (chunk) res.body += chunk;
    },
  };
  return res;
}

const CHECKS = [
  { method: 'GET', path: '/' },
  { method: 'HEAD', path: '/' },
  { method: 'GET', path: '/llms.txt' },
  { method: 'GET', path: '/agents.json' },
  { method: 'GET', path: '/templates.json' },
  { method: 'GET', path: '/idacc/releases.json' },
  { method: 'GET', path: '/contribution-intents' },
  { method: 'POST', path: '/contribution-intents' },
  { method: 'GET', path: '/does-not-exist' },
];

let failed = 0;

for (const check of CHECKS) {
  const req = mockRequest(check);
  const res = mockResponse();
  handler(req, res);

  const bodyPreview = res.body.slice(0, 80).replace(/\n/g, ' ');
  console.log(`${check.method} ${check.path} -> ${res.statusCode} | ${bodyPreview}`);

  if (res.statusCode == null) {
    failed += 1;
    console.error(`  FAIL: no status code written for ${check.method} ${check.path}`);
  }
}

if (failed > 0) {
  console.error(`${failed} check(s) failed`);
  process.exit(1);
}

console.log('All api/index.js handler checks passed.');
