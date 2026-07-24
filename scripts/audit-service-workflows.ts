#!/usr/bin/env tsx
import fs from 'node:fs';
import postgres from 'postgres';
import { auditServiceWorkflowRows, type ServiceWorkflowAuditRow } from '../src/lib/features/services/workflowAudit';

if (!process.env.DATABASE_URL && fs.existsSync('.env')) {
	const envText = fs.readFileSync('.env', 'utf8');
	for (const line of envText.split(/\r?\n/)) {
		const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
		if (!match || process.env[match[1]] !== undefined) continue;
		let value = match[2].trim();
		if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
			value = value.slice(1, -1);
		}
		process.env[match[1]] = value;
	}
}

const databaseUrl = process.env.DATABASE_URL;
const outputJson = process.argv.includes('--json');

if (!databaseUrl) {
	console.error('DATABASE_URL is required. Example: pnpm audit:service-workflows');
	process.exit(1);
}

const sql = postgres(databaseUrl, { max: 1, ssl: false });

try {
	const rows = await sql<{
		id: string;
		name: string;
		type: string | null;
		pricingMode: string | null;
		defaultSessionsIncluded: number | null;
		modules: Record<string, unknown> | null;
		active: boolean;
		serviceSessionCount: string | number;
		editionCount: string | number;
		editionSessionCount: string | number;
	}[]>`
		select
			s.id,
			s.name,
			s.type,
			s.pricing_mode as "pricingMode",
			s.default_sessions_included as "defaultSessionsIncluded",
			s.modules,
			s.active,
			count(distinct service_sessions.id) filter (where service_sessions.owner_type = 'service') as "serviceSessionCount",
			count(distinct editions.id) as "editionCount",
			count(distinct edition_sessions.id) filter (where edition_sessions.owner_type = 'edition') as "editionSessionCount"
		from services s
		left join sessions service_sessions
			on service_sessions.service_id = s.id
			and service_sessions.owner_type = 'service'
		left join service_editions editions
			on editions.service_id = s.id
			and editions.active = true
		left join sessions edition_sessions
			on edition_sessions.service_edition_id = editions.id
			and edition_sessions.owner_type = 'edition'
		group by s.id
		order by s.name
	`;

	const normalizedRows: ServiceWorkflowAuditRow[] = rows.map((row) => ({
		...row,
		serviceSessionCount: Number(row.serviceSessionCount),
		editionCount: Number(row.editionCount),
		editionSessionCount: Number(row.editionSessionCount)
	}));
	const findings = auditServiceWorkflowRows(normalizedRows);

	if (outputJson) {
		console.log(JSON.stringify({ scannedServices: normalizedRows.length, findings }, null, 2));
	} else {
		console.log(`Scanned services: ${normalizedRows.length}`);
		console.log(`Workflow findings: ${findings.length}`);
		if (findings.length) {
			console.table(findings.map(({ serviceName, severity, code, suggestedAction }) => ({
				service: serviceName,
				severity,
				code,
				suggestedAction
			})));
		} else {
			console.log('No legacy service workflow shapes detected.');
		}
	}
} finally {
	await sql.end({ timeout: 5 });
}
