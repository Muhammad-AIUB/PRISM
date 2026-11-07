#!/usr/bin/env node
/**
 * Deploy webhook for the VPS. GitHub calls it on every push; a push to the
 * deploy branch runs deploy/deploy.sh. No dependencies: Node's standard library
 * only.
 *
 * Security: every request must carry a valid HMAC-SHA256 signature
 * (X-Hub-Signature-256) made with DEPLOY_WEBHOOK_SECRET, checked in constant
 * time before anything else is looked at. Listen on loopback and put a TLS
 * reverse proxy in front (docs/deployment.md#auto-deploy-on-push). This is a
 * different secret and a different endpoint from the review webhook the API
 * receives at /webhook/github.
 *
 * Environment:
 *   DEPLOY_WEBHOOK_SECRET  shared secret set on the GitHub webhook (required)
 *   APP_DIR                repository checkout, passed on to deploy.sh (required)
 *   DEPLOY_REPO            e.g. Muhammad-AIUB/PRISM; other repositories are ignored
 *   BRANCH                 default main
 *   PORT / HOST            default 9000 / 127.0.0.1
 *   DEPLOY_SCRIPT          default ./deploy.sh next to this file
 */
'use strict';

const crypto = require('node:crypto');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const SECRET = process.env.DEPLOY_WEBHOOK_SECRET;
const BRANCH = process.env.BRANCH || 'main';
const REPO = process.env.DEPLOY_REPO || '';
const PORT = Number(process.env.PORT || 9000);
const HOST = process.env.HOST || '127.0.0.1';
const SCRIPT = process.env.DEPLOY_SCRIPT || path.join(__dirname, 'deploy.sh');
const MAX_BODY = 1024 * 1024;

if (!SECRET || SECRET.length < 16) {
  console.error('DEPLOY_WEBHOOK_SECRET is required and must be at least 16 characters');
  process.exit(1);
}

if (!process.env.APP_DIR) {
  console.error('APP_DIR is required');
  process.exit(1);
}

let running = false;
let queued = false;

function validSignature(body, header) {
  if (typeof header !== 'string' || !header.startsWith('sha256=')) {
    return false;
  }

  const expected = crypto.createHmac('sha256', SECRET).update(body).digest();
  const received = Buffer.from(header.slice('sha256='.length), 'hex');

  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

/** One deploy at a time; a push that lands mid-deploy triggers one more run after it. */
function deploy() {
  if (running) {
    queued = true;
    return;
  }

  running = true;
  console.log('deploy started');

  const child = spawn('bash', [SCRIPT], { stdio: 'inherit', env: process.env });

  child.on('error', (error) => console.error('could not start deploy script:', error.message));
  child.on('exit', (code) => {
    console.log(`deploy finished with exit code ${code}`);
    running = false;

    if (queued) {
      queued = false;
      deploy();
    }
  });
}

const server = http.createServer((request, response) => {
  const reply = (status, text) => {
    response.writeHead(status, { 'Content-Type': 'text/plain' });
    response.end(`${text}\n`);
  };

  if (request.method !== 'POST') {
    return reply(405, 'method not allowed');
  }

  const chunks = [];
  let size = 0;
  let tooLarge = false;

  request.on('data', (chunk) => {
    size += chunk.length;

    if (size > MAX_BODY) {
      tooLarge = true;
      request.destroy();
      return;
    }

    chunks.push(chunk);
  });

  request.on('end', () => {
    if (tooLarge) {
      return;
    }

    const body = Buffer.concat(chunks);

    if (!validSignature(body, request.headers['x-hub-signature-256'])) {
      return reply(401, 'invalid signature');
    }

    const event = request.headers['x-github-event'];

    if (event === 'ping') {
      return reply(200, 'pong');
    }

    let payload;

    try {
      payload = JSON.parse(body.toString('utf8'));
    } catch {
      return reply(400, 'invalid json');
    }

    if (event !== 'push' || payload.ref !== `refs/heads/${BRANCH}`) {
      return reply(202, 'ignored');
    }

    if (REPO && payload.repository?.full_name !== REPO) {
      return reply(202, 'ignored');
    }

    deploy();

    return reply(202, 'deploy started');
  });
});

server.listen(PORT, HOST, () => {
  console.log(`deploy webhook listening on ${HOST}:${PORT}, branch ${BRANCH}`);
});
