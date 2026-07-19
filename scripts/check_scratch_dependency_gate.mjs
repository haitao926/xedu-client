import { access, readFile, stat, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function parseAudit(text) {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    if (start < 0) return null;
    try {
      return JSON.parse(text.slice(start));
    } catch {
      return null;
    }
  }
}

function isoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : null;
}

function quotePattern(value) {
  return new RegExp(`(?:["'])${String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:["'])`, 'g');
}

async function collectBuildEvidence(buildRoot, packageNames) {
  const indexPath = path.join(buildRoot, 'index.html');
  const indexHtml = await readFile(indexPath, 'utf8');
  const scriptSources = [...indexHtml.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map((match) => match[1]);
  if (scriptSources.length === 0) throw new Error('Scratch build index.html has no script entry point');
  const scriptFiles = [];
  const packageLiteralMatches = {};
  for (const source of scriptSources) {
    const relativeSource = source.split('?')[0].replace(/^\.\//, '');
    const scriptPath = path.join(buildRoot, relativeSource);
    const scriptStat = await stat(scriptPath);
    if (!scriptStat.isFile()) throw new Error(`Scratch build entry point is not a file: ${relativeSource}`);
    const text = await readFile(scriptPath, 'utf8');
    scriptFiles.push({ path: relativeSource, bytes: scriptStat.size });
    for (const packageName of packageNames) {
      const matches = text.match(quotePattern(packageName));
      if (matches?.length) packageLiteralMatches[packageName] = (packageLiteralMatches[packageName] || 0) + matches.length;
    }
  }
  return {
    buildRoot: path.relative(process.cwd(), buildRoot) || '.',
    entryHtml: 'index.html',
    scriptFiles,
    packageLiteralMatches,
    statement: 'Only the script files referenced by build/index.html are packaged as the Scratch runtime entry.',
  };
}

export function evaluateDependencyGate(audit, exceptions, { today = new Date().toISOString().slice(0, 10) } = {}) {
  const errors = [];
  const vulnerabilities = audit?.vulnerabilities;
  if (!vulnerabilities || typeof vulnerabilities !== 'object') {
    errors.push('npm audit output has no vulnerabilities object');
    return { ok: false, errors, report: null };
  }

  const entries = Array.isArray(exceptions?.exceptions) ? exceptions.exceptions : [];
  const byPackage = new Map(entries.map((entry) => [entry.package, entry]));
  const findings = Object.entries(vulnerabilities).map(([packageName, vulnerability]) => {
    const entry = byPackage.get(packageName);
    if (!entry) {
      errors.push(`missing Scratch dependency exception for ${packageName}`);
      return { package: packageName, severity: vulnerability.severity, status: 'missing' };
    }
    const reviewBy = isoDate(entry.reviewBy);
    if (!entry.owner || !String(entry.owner).trim()) errors.push(`${packageName}: owner is required`);
    if (!reviewBy) errors.push(`${packageName}: reviewBy must be YYYY-MM-DD`);
    else if (reviewBy < today) errors.push(`${packageName}: exception reviewBy ${reviewBy} has expired`);
    if (!['build-chain', 'localization', 'test-chain', 'safe-override'].includes(entry.scope)) {
      errors.push(`${packageName}: unsupported scope ${entry.scope || '(empty)'}`);
    }
    if (!entry.mitigation || !String(entry.mitigation).trim()) errors.push(`${packageName}: mitigation is required`);
    if (!entry.evidence || !String(entry.evidence).includes('scratch-editor/build')) {
      errors.push(`${packageName}: evidence must reference scratch-editor/build`);
    }
    const declaredSeverity = Array.isArray(entry.severities) ? entry.severities : [];
    if (!declaredSeverity.includes(vulnerability.severity)) {
      errors.push(`${packageName}: exception does not cover severity ${vulnerability.severity}`);
    }
    return {
      package: packageName,
      severity: vulnerability.severity,
      scope: entry.scope,
      owner: entry.owner,
      reviewBy,
      status: errors.some((error) => error.startsWith(`${packageName}:`)) ? 'invalid' : 'accepted-exception',
      via: (vulnerability.via || []).map((item) => typeof item === 'string' ? item : item.title || item.source || 'advisory'),
    };
  });

  for (const entry of entries) {
    if (!vulnerabilities[entry.package]) errors.push(`exception has no matching npm audit finding: ${entry.package}`);
  }

  return {
    ok: errors.length === 0,
    errors,
    report: {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      auditSource: 'npm audit --prefix scratch-editor --audit-level=high --package-lock-only --json',
      policy: exceptions.policy || {},
      vulnerabilities: audit.metadata?.vulnerabilities || null,
      findings,
      result: errors.length === 0 ? 'accepted-with-expiring-exceptions' : 'failed',
    },
  };
}

async function main(argv) {
  const args = Object.fromEntries(argv.reduce((pairs, value, index) => {
    if (value.startsWith('--')) pairs.push([value.slice(2), argv[index + 1]]);
    return pairs;
  }, []));
  if (!args.audit || !args.exceptions || !args.build || !args.report) {
    throw new Error('Usage: node scripts/check_scratch_dependency_gate.mjs --audit <json> --exceptions <json> --build <dir> --report <json>');
  }
  await access(args.build, constants.R_OK);
  const [auditText, exceptionsText] = await Promise.all([
    readFile(args.audit, 'utf8'),
    readFile(args.exceptions, 'utf8'),
  ]);
  const audit = parseAudit(auditText);
  const exceptions = JSON.parse(exceptionsText);
  const result = evaluateDependencyGate(audit, exceptions);
  const packageNames = Object.keys(audit?.vulnerabilities || {});
  result.report.reachability = await collectBuildEvidence(path.resolve(args.build), packageNames);
  await writeFile(args.report, `${JSON.stringify(result.report, null, 2)}\n`, 'utf8');
  if (!result.ok) {
    for (const error of result.errors) console.error(`[scratch-dependency-gate] ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`[scratch-dependency-gate] accepted ${result.report.findings.length} expiring exception(s)`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    console.error(`[scratch-dependency-gate] ${error.message}`);
    process.exitCode = 1;
  }
}
