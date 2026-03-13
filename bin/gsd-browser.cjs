#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const minimist = require('minimist');

const { start } = require('../src/server.js');
const pkg = require('../package.json');

const USAGE = `Usage: gsd-browser [options] <directory>

Serve markdown artifacts from a directory at http://127.0.0.1:<port>

Arguments:
  <directory>       Directory to serve (required)

Options:
  -p, --port <n>    Port to listen on (default: 4242)
      --open        Open browser after starting
  -h, --help        Show this help message
  -v, --version     Print version and exit

Examples:
  gsd-browser .
  gsd-browser /path/to/repo --port 3000
  gsd-browser . --open
`;

const args = minimist(process.argv.slice(2), {
  string: ['port'],
  boolean: ['open', 'help', 'version'],
  alias: { p: 'port', h: 'help', v: 'version' }
});

if (args.version) {
  process.stdout.write(`gsd-browser v${pkg.version}\n`);
  process.exit(0);
}

if (args.help) {
  process.stdout.write(USAGE);
  process.exit(0);
}

if (args._.length === 0) {
  process.stderr.write(USAGE);
  process.exit(1);
}

const rootArg = args._[0];

// Validate that the argument is a directory
let rootPath;
try {
  const stat = fs.statSync(rootArg);
  if (!stat.isDirectory()) {
    process.stderr.write(`Error: "${rootArg}" is not a directory\n`);
    process.exit(1);
  }
  rootPath = path.resolve(rootArg);
} catch (err) {
  process.stderr.write(`Error: "${rootArg}" does not exist or is not accessible\n`);
  process.exit(1);
}

const port = parseInt(args.port, 10) || 4242;

start(port, rootPath, { open: args.open }).catch((err) => {
  if (err.code === 'EADDRINUSE') {
    process.stderr.write(`Port ${port} in use. Try --port ${port + 1}\n`);
    process.exit(1);
  }
  process.stderr.write(`Failed to start: ${err.message}\n`);
  process.exit(1);
});
