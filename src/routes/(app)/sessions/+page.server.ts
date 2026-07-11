import { fail } from '@sveltejs/kit';
import { listSessionsForDateRange, cancelSession, updateSession } from '$lib/features/sessions/queries';
import { getTodayString } from '$lib/features/calendar/utils';
import { requireRole } from '$lib/server/permissions';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	requireRole(locals, 'admin', 'owner', 'manager');

	const today = getTodayString();
	const fromParam = url.searchParams.get('from');
	const toParam = url.searchParams.get('to');
	const serviceFilter = url.searchParams.get('service') ?? '';

	const from = fromParam ?? today;
	const toDefault = new Date(today + 'T00:00:00');
	toDefault.setDate(toDefault.getDate() + 29);
	const to = toParam ?? toDefault.toISOString().slice(0, 10);

	const sessions = await listSessionsForDateRange(from, to);

	const filtered = serviceFilter
		? sessions.filter(s => s.serviceName?.toLowerCase().includes(serviceFilter.toLowerCase()))
		: sessions;

	const byDate: Record<string, typeof filtered> = {};
	for (const s of filtered) (byDate[s.date] ??= []).push(s);

	const uniqueServices = [...new Set(sessions.map(s => s.serviceName).filter(Boolean))].sort();

	return { byDate, from, to, serviceFilter, uniqueServices };
};

export const actions: Actions = {
	cancelSession: async ({ request, locals }) => {
		requireRole(locals, 'admin', 'owner', 'manager');
		const form = await request.formData();
		const sessionId = form.get('sessionId')?.toString() ?? '';
		if (!sessionId) return fail(400, { error: 'Missing sessionId' });
		await cancelSession(sessionId);
		return { message: 'Sesión cancelada' };
	},

	updateSession: async ({ request, locals }) => {
		requireRole(locals, 'admin', 'owner', 'manager');
		const form = await request.formData();
		const sessionId = form.get('sessionId')?.toString() ?? '';
		if (!sessionId) return fail(400, { error: 'Missing sessionId' });
		const time = form.get('sessionTime')?.toString() || undefined;
		const durationMinutes = form.get('sessionDuration')
			? parseInt(form.get('sessionDuration') as string) || undefined
			: undefined;
		await updateSession(sessionId, { time: time ?? null, durationMinutes: durationMinutes ?? null });
		return { message: 'Sesión actualizada' };
	}
};
