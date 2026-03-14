#!/usr/bin/env node
'use strict';

const minimist = require('minimist');

const { start } = require('../src/server.js');
const {
  addSource,
  removeSource,
  listSources,
  loadConfig,
  enrichSourcesWithConventions,
} = require('../src/sources.js');
const pkg = require('../package.json');

const USAGE = `Usage: gsd-browser [command] [options]

Commands:
  add [path]         Register a source directory (default: current dir)
  remove <name|path> Remove a registered source
  list               Show all registered sources

Server options:
  -p, --port <n>     Port to listen on (default: 4242)
      --open         Open browser after starting

Add options:
  -n, --name <name>  Custom label for the source

General:
  -h, --help         Show this help message
  -v, --version      Print version and exit
`;

const args = minimist(process.argv.slice(2), {
  string: ['port', 'name'],
  boolean: ['open', 'help', 'version'],
  alias: { p: 'port', h: 'help', v: 'version', n: 'name' }
});

if (args.version) {
  process.stdout.write(`gsd-browser v${pkg.version}\n`);
  process.exit(0);
}

if (args.help) {
  process.stdout.write(USAGE);
  process.exit(0);
}

const subcommand = args._[0];

async function main() {
  if (subcommand === 'add') {
    const targetPath = args._[1] || '.';
    const result = await addSource(targetPath, { name: args.name });
    if (!result.ok) {
      process.stderr.write(`Error: ${result.message || result.reason}\n`);
      process.exit(1);
    }
    // Discover conventions for display
    const { enrichSourcesWithConventions: enrich } = require('../src/sources.js');
    const enriched = await enrich([result.source]);
    const conventions = enriched[0].conventions;
    const conventionDisplay = conventions.length > 0
      ? conventions.map(c => c.endsWith('.md') ? c : c + '/').join(', ')
      : 'No conventions found';
    process.stdout.write(`Added ${result.source.path}\n  Found: ${conventionDisplay}\n`);

  } else if (subcommand === 'remove') {
    const target = args._[1];
    if (!target) {
      process.stderr.write(`Error: remove requires a name or path argument\nUsage: gsd-browser remove <name|path>\n`);
      process.exit(1);
    }
    const result = await removeSource(target);
    if (!result.ok) {
      if (result.reason === 'ambiguous') {
        process.stderr.write(`Error: "${target}" matches multiple sources. Specify by path:\n`);
        for (const m of result.matches) {
          process.stderr.write(`  ${m.name}  ${m.path}\n`);
        }
        process.exit(1);
      }
      process.stderr.write(`Error: source "${target}" not found\n`);
      process.exit(1);
    }
    process.stdout.write(`Removed ${result.removed.name} (${result.removed.path})\n`);

  } else if (subcommand === 'list') {
    const sources = await listSources();
    if (sources.length === 0) {
      process.stdout.write('No sources registered. Use: gsd-browser add <path>\n');
      return;
    }

    // Compute column widths for aligned table (docker ps style)
    const headers = ['NAME', 'PATH', 'STATUS', 'CONVENTIONS'];
    const rows = sources.map(s => {
      const conventions = s.conventions && s.conventions.length > 0
        ? s.conventions.map(c => c.endsWith('.md') ? c : c + '/').join(', ')
        : '-';
      return [s.name, s.path, s.available ? 'available' : 'missing', conventions];
    });

    const colWidths = headers.map((h, i) =>
      Math.max(h.length, ...rows.map(r => r[i].length))
    );

    const formatRow = (cols) =>
      cols.map((c, i) => i < cols.length - 1 ? c.padEnd(colWidths[i]) : c).join('  ');

    process.stdout.write(formatRow(headers) + '\n');
    for (const row of rows) {
      process.stdout.write(formatRow(row) + '\n');
    }

  } else {
    // No subcommand — start the server with registered sources
    const config = await loadConfig();
    const allSources = await enrichSourcesWithConventions(config.sources);

    // Warn about missing sources
    for (const src of allSources) {
      if (!src.available) {
        process.stderr.write(`Warning: source "${src.name}" not found at ${src.path} — skipping\n`);
      }
    }

    const availableSources = allSources.filter(s => s.available);

    if (availableSources.length === 0) {
      process.stderr.write(
        'No available sources registered.\n' +
        'Register a source with: gsd-browser add <path>\n'
      );
      process.exit(1);
    }

    const port = parseInt(args.port, 10) || 4242;

    await start(port, availableSources, { open: args.open });
  }
}

main().catch((err) => {
  if (err.code === 'EADDRINUSE') {
    const port = parseInt(args.port, 10) || 4242;
    process.stderr.write(`Port ${port} in use. Try --port ${port + 1}\n`);
    process.exit(1);
  }
  process.stderr.write(`Failed to start: ${err.message}\n`);
  process.exit(1);
});
