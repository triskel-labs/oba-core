import { fail } from '@sveltejs/kit';
import { createBooking, countEnrolledClientsForService, recalcBookingAmounts } from '$lib/features/bookings/queries';
import { createSession } from '$lib/features/sessions/queries';
import { setEnrollmentParticipantCount, addParticipant as addEnrollmentParticipant } from '$lib/features/bookings/participants.queries';
import { calculateAmount } from '$lib/utils/pricing';
import { listServices, getService } from '$lib/features/services/queries';
import { listInstructors } from '$lib/features/instructors/queries';
import { listClients } from '$lib/features/clients/queries';
import { listEditionsForService, countEnrolledClientsForEdition, getServiceEdition } from '$lib/features/services/editions.queries';
import type { ServiceEdition } from '$lib/features/services/editions.types';
import type { Actions, PageServerLoad } from './$types';
import { requireRole } from '$lib/server/permissions';
import { getServiceWorkflowMetadataByServiceId } from '$lib/features/services/workflow';

export const load: PageServerLoad = async ({ url, locals }) => {
	requireRole(locals, 'admin', 'owner', 'manager');
	const [services, instructors, clients] = await Promise.all([
		listServices(),
		listInstructors(),
		listClients()
	]);
	const defaultDate = url.searchParams.get('date') ?? '';
	const defaultTime = url.searchParams.get('time') ?? '';
	const defaultServiceId = url.searchParams.get('serviceId') ?? '';
	const defaultEditionId = url.searchParams.get('editionId') ?? '';

	const editionsByService: Record<string, ServiceEdition[]> = {};
	await Promise.all(
		services
			.filter(s => 'editions' in (s.modules ?? {}))
			.map(async s => { editionsByService[s.id] = await listEditionsForService(s.id); })
	);

	const workflowByServiceId = getServiceWorkflowMetadataByServiceId(services);

	return { services, instructors, clients, defaultDate, defaultTime, defaultServiceId, defaultEditionId, editionsByService, workflowByServiceId };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		requireRole(locals, 'admin', 'owner', 'manager');
		const form = await request.formData();

		const serviceId = form.get('serviceId')?.toString() ?? '';
		if (!serviceId) return fail(400, { error: 'Service is required' });

		const service = await getService(serviceId);
		if (!service) return fail(400, { error: 'Service not found' });

		const clientIds = form.getAll('clientId').map(String).filter(Boolean);
		if (clientIds.length === 0) return fail(400, { error: 'At least one client is required' });

		const quantityRaw = form.get('quantity')?.toString();
		const quantity = Math.max(1, parseInt(quantityRaw ?? '1') || 1);

		const participantCounts = form.getAll('participantCount').map((v) => parseInt(v as string) || 1);
		const clientNames = form.getAll('clientName').map(String);
		const alsoParticipatesFlags = form.getAll('alsoParticipates').map((v) => v === 'true');

		// Calculate initial amountDue from pricingMode.
		// 1 participant assumed at creation — recalculated when participants are set from detail page.
		const _svc = service!;
		const isCreditsService = 'credits' in (_svc.modules ?? {});
		function initialAmountDue(days = 1): string {
			if (isCreditsService && quantity > 1)
				return (parseFloat(_svc.basePrice) * quantity).toFixed(2);
			const base = parseFloat(_svc.basePrice);
			const sessions = _svc.defaultSessionsIncluded ?? 1;
			return calculateAmount(base, _svc.pricingMode, { participants: 1, sessions, days }).toFixed(2);
		}

		const bookingClients = clientIds.map((clientId, i) => ({
			clientId,
			amountDue: initialAmountDue(),
			participantCount: participantCounts[i] ?? 1
		}));

		const spotNotes = form.get('spotNotes')?.toString().trim() || undefined;
		const notes     = form.get('notes')?.toString().trim() || undefined;

		const participantCountByClientId = Object.fromEntries(clientIds.map((id, i) => [id, participantCounts[i] ?? 1]));
		const clientNameByClientId = Object.fromEntries(clientIds.map((id, i) => [id, clientNames[i] ?? '']));
		const alsoParticipatesByClientId = Object.fromEntries(clientIds.map((id, i) => [id, alsoParticipatesFlags[i] ?? false]));

		async function autoCreateParticipants(booking: { clients: { id: string; clientId: string; clientFirstName: string }[] }) {
			await Promise.all(
				booking.clients.map(async (bc) => {
					const count = participantCountByClientId[bc.clientId] ?? 1;
					const alsoParticipates = alsoParticipatesByClientId[bc.clientId] ?? false;
					const fullName = clientNameByClientId[bc.clientId] || bc.clientFirstName || '';

					if (alsoParticipates) {
						if (fullName) await addEnrollmentParticipant(bc.id, fullName);
						if (count > 1) await setEnrollmentParticipantCount(bc.id, count, bc.clientFirstName ?? undefined);
					} else if (count > 1) {
						await setEnrollmentParticipantCount(bc.id, count, bc.clientFirstName ?? undefined);
					}
				})
			);
		}

		// ── Accommodation ──────────────────────────────────────────────────────
		if ('inventory' in (service.modules ?? {})) {
			const checkIn  = form.get('date')?.toString() ?? '';
			const checkOut = form.get('dateEnd')?.toString() || null;
			if (!checkIn) return fail(400, { error: 'Start date is required' });

			let days = 1;
			if (checkOut) {
				const d = Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86_400_000);
				days = Math.max(1, d);
			}
			const invClients = clientIds.map((clientId, i) => ({
				clientId,
				amountDue: initialAmountDue(days),
				participantCount: participantCounts[i] ?? 1
			}));

			const booking = await createBooking({
				serviceId,
				quantity,
				date: checkIn,
				dateEnd: checkOut ?? undefined,
				isFlexible: false,
				status: 'confirmed',
				clients: invClients
			});
			await autoCreateParticipants(booking);
			await recalcBookingAmounts(booking.id);
			return { bookingId: booking.id, message: 'Booking created — assign inventory from the booking detail' };
		}

		// ── Shared date resolution ─────────────────────────────────────────────
		const serviceEditionId = form.get('serviceEditionId')?.toString() || undefined;
		const sessionScheduleMode = form.get('sessionScheduleMode')?.toString() ?? 'later';
		const scheduledSessionDate = form.get('sessionDate')?.toString() ?? '';
		let date    = form.get('date')?.toString() ?? '';
		let dateEnd = form.get('dateEnd')?.toString() || undefined;
		if ('editions' in (service.modules ?? {}) && serviceEditionId) {
			const edition = await getServiceEdition(serviceEditionId);
			if (edition) { date = edition.startDate; dateEnd = edition.endDate; }
		}
		if ('sessions' in (service.modules ?? {}) && sessionScheduleMode === 'scheduled') {
			date = scheduledSessionDate;
		}
		if (!date) return fail(400, { error: 'Date is required' });

		// ── Capacity check ─────────────────────────────────────────────────────
		const totalParticipantsRequested = participantCounts.reduce((s, n) => s + n, 0);

		if ('roster' in (service.modules ?? {}) && serviceEditionId) {
			const edition = await getServiceEdition(serviceEditionId);
			if (edition?.maxCapacity) {
				const enrolled  = await countEnrolledClientsForEdition(serviceEditionId);
				const available = edition.maxCapacity - enrolled;
				if (totalParticipantsRequested > available)
					return fail(400, { error: `Solo quedan ${available} plaza${available !== 1 ? 's' : ''} en esta edición` });
			}
		} else if ('roster' in (service.modules ?? {}) && service.maxCapacity) {
			const enrolled  = await countEnrolledClientsForService(serviceId);
			const available = service.maxCapacity - enrolled;
			if (totalParticipantsRequested > available)
				return fail(400, { error: `Solo quedan ${available} plaza${available !== 1 ? 's' : ''} disponibles` });
		}

		// Require edition when service uses editions module and editions exist
		if ('editions' in (service.modules ?? {}) && !serviceEditionId)
			return fail(400, { error: 'Selecciona una edición para continuar' });

		// ── Lessons (sessions module) ──────────────────────────────────────────
		// Private lessons can be left unscheduled or scheduled from the create-booking modal.
		if ('sessions' in (service.modules ?? {})) {
			const sessionsIncluded = service.defaultSessionsIncluded ?? 1;
			const isScheduledNow = sessionScheduleMode === 'scheduled';
			const sessionTime = form.get('sessionTime')?.toString() || undefined;
			const durRaw = form.get('sessionDuration')?.toString();
			const durationMinutes = durRaw ? parseInt(durRaw) : undefined;
			const instructorIds = form.getAll('sessionInstructorId').map(String).filter(Boolean);

			const booking = await createBooking({
				serviceId, quantity, serviceEditionId, date,
				isFlexible: !isScheduledNow,
				status: 'confirmed',
				sessionsIncluded,
				spotNotes, notes,
				clients: bookingClients
			});

			if (isScheduledNow) {
				await createSession({
					ownerType: 'booking',
					bookingId: booking.id,
					date,
					time: sessionTime,
					durationMinutes,
					instructorIds,
					sortOrder: 0
				});
				if (sessionsIncluded > 1) {
					await Promise.all(
						Array.from({ length: sessionsIncluded - 1 }, (_, i) =>
							createSession({ ownerType: 'booking', bookingId: booking.id, date, sortOrder: i + 1 })
						)
					);
				}
			} else {
				await Promise.all(
					Array.from({ length: sessionsIncluded }, (_, i) =>
						createSession({ ownerType: 'booking', bookingId: booking.id, date, sortOrder: i })
					)
				);
			}
			await autoCreateParticipants(booking);
			await recalcBookingAmounts(booking.id);

			return {
				bookingId: booking.id,
				message: isScheduledNow
					? 'Booking created — session scheduled'
					: `Booking created — ${sessionsIncluded} session${sessionsIncluded !== 1 ? 's' : ''} to schedule`
			};
		}

		// ── Regular / camp ─────────────────────────────────────────────────────
		const instructorId = form.get('instructorId')?.toString() || undefined;
		const time         = form.get('time')?.toString() || undefined;
		const isFlexible   = form.get('isFlexible') === 'on';
		const status       = isFlexible ? 'pending' : 'confirmed';

		const booking = await createBooking({
			serviceId, quantity, instructorId, serviceEditionId, date, dateEnd, time,
			isFlexible, status, spotNotes, notes,
			clients: bookingClients
		});
		await autoCreateParticipants(booking);
		await recalcBookingAmounts(booking.id);
		return { bookingId: booking.id, message: 'Booking created' };
	}
};
