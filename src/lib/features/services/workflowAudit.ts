import type { PricingMode } from './types';
import type { ServiceModules } from './modules';

export type ServiceWorkflowAuditRow = {
	id: string;
	name: string;
	type: string | null;
	pricingMode: PricingMode | string | null;
	defaultSessionsIncluded: number | null;
	modules: ServiceModules | Record<string, unknown> | null;
	active: boolean;
	serviceSessionCount: number;
	editionCount: number;
	editionSessionCount: number;
};

export type ServiceWorkflowAuditFinding = {
	serviceId: string;
	serviceName: string;
	severity: 'fix' | 'review';
	code:
		| 'lesson_session_pricing_missing_sessions_module'
		| 'roster_lesson_session_pricing_missing_sessions_module'
		| 'service_sessions_exist_missing_sessions_module'
		| 'editions_exist_missing_editions_module'
		| 'edition_sessions_exist_missing_editions_module';
	message: string;
	suggestedAction: string;
};

const SESSION_PRICING_MODES = new Set(['per_session', 'per_person_per_session']);

function hasModule(row: ServiceWorkflowAuditRow, moduleName: keyof ServiceModules): boolean {
	return Boolean(row.modules && typeof row.modules === 'object' && moduleName in row.modules);
}

export function auditServiceWorkflowRows(
	rows: ServiceWorkflowAuditRow[]
): ServiceWorkflowAuditFinding[] {
	const findings: ServiceWorkflowAuditFinding[] = [];

	for (const row of rows) {
		if (!row.active) continue;

		const hasSessions = hasModule(row, 'sessions');
		const hasRoster = hasModule(row, 'roster');
		const hasEditions = hasModule(row, 'editions');
		const type = row.type?.toLowerCase() ?? '';
		const pricingMode = row.pricingMode ?? '';

		if (row.serviceSessionCount > 0 && !hasSessions) {
			findings.push({
				serviceId: row.id,
				serviceName: row.name,
				severity: 'fix',
				code: 'service_sessions_exist_missing_sessions_module',
				message: 'Service-owned sessions exist, but modules.sessions is missing.',
				suggestedAction: 'Add modules.sessions; keep modules.roster if this is a shared group class.'
			});
		}

		if (row.editionCount > 0 && !hasEditions) {
			findings.push({
				serviceId: row.id,
				serviceName: row.name,
				severity: 'fix',
				code: 'editions_exist_missing_editions_module',
				message: 'Service editions exist, but modules.editions is missing.',
				suggestedAction: 'Add modules.editions; keep modules.roster for enrollments/runs.'
			});
		}

		if (row.editionSessionCount > 0 && !hasEditions) {
			findings.push({
				serviceId: row.id,
				serviceName: row.name,
				severity: 'fix',
				code: 'edition_sessions_exist_missing_editions_module',
				message: 'Edition-owned sessions exist, but modules.editions is missing.',
				suggestedAction: 'Add modules.editions before relying on edition/session capacity logic.'
			});
		}

		if (type === 'lesson' && SESSION_PRICING_MODES.has(String(pricingMode)) && !hasSessions) {
			findings.push({
				serviceId: row.id,
				serviceName: row.name,
				severity: hasRoster ? 'review' : 'fix',
				code: hasRoster
					? 'roster_lesson_session_pricing_missing_sessions_module'
					: 'lesson_session_pricing_missing_sessions_module',
				message: hasRoster
					? 'Lesson has session pricing and roster metadata, but modules.sessions is missing.'
					: 'Lesson has session pricing, but modules.sessions is missing.',
				suggestedAction: hasRoster
					? 'Review whether this is a group class; if yes add modules.sessions and keep modules.roster.'
					: 'Add modules.sessions so private lesson scheduling is canonical, not fallback-only.'
			});
		}
	}

	return findings;
}
