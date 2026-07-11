import { error, fail, redirect } from '@sveltejs/kit';
import { deleteClient, getClient, updateClient } from '$lib/features/clients/queries';
import { getBookingsForClient } from '$lib/features/bookings/queries';
import { listSessionsForClient } from '$lib/features/sessions/queries';
import type { SkillLevel } from '$lib/features/clients/types';
import type { Actions, PageServerLoad } from './$types';
import { requireRole } from '$lib/server/permissions';

export const load: PageServerLoad = async ({ params, locals }) => {
	requireRole(locals, 'admin', 'owner', 'manager');
	const client = await getClient(params.id);
	if (!client) error(404, 'Client not found');
	const [bookings, sessions] = await Promise.all([
		getBookingsForClient(params.id),
		listSessionsForClient(params.id)
	]);
	return { client, bookings, sessions };
};

export const actions: Actions = {
	update: async ({ request, params, locals }) => {
		requireRole(locals, 'admin', 'owner', 'manager');
		const form = await request.formData();
		const firstName = form.get('firstName')?.toString().trim() ?? '';
		const lastName = form.get('lastName')?.toString().trim() ?? '';
		if (!firstName || !lastName) return fail(400, { error: 'Name required' });

		await updateClient(params.id, {
			firstName,
			lastName,
			phone: form.get('phone')?.toString().trim() || undefined,
			email: form.get('email')?.toString().trim() || undefined,
			nationality: form.get('nationality')?.toString().trim() || undefined,
			skillLevel: (form.get('skillLevel')?.toString() || undefined) as SkillLevel | undefined,
			notes: form.get('notes')?.toString().trim() || undefined
		});
		return { error: null };
	},

	delete: async ({ params, locals }) => {
		requireRole(locals, 'admin', 'owner', 'manager');
		const result = await deleteClient(params.id);
		if (!result.deleted) {
			return fail(409, { error: 'This client has booking history and cannot be deleted. Remove them from all bookings first.' });
		}
		redirect(302, '/clients');
	}
};
