import { createServer } from 'node:http';

import { createRequestHandler } from './portal.mjs';

const port = Number(process.env.PORT ?? '3000');
const host = process.env.HOST ?? '0.0.0.0';

const server = createServer(createRequestHandler());

server.listen(port, host, () => {
  console.log(`agent.bittrees.org scaffold listening on http://${host}:${port}`);
});

function shutdown(signal) {
  server.close(() => {
    console.log(`received ${signal}, stopped cleanly`);
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
