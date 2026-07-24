import { eq, sum, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { bookingClients, bookings } from '$lib/server/db/schema';
import { isInstructorRole } from '$lib/server/permissions';
import { listSessionsForDate, listSessionsForDateRange } from '$lib/features/sessions/queries';
import { listEventsForDateRange } from '$lib/features/events/queries';
import { listBookingsForDateRange, listAllBookings } from '$lib/features/bookings/queries';
import { buildAttentionCards } from '$lib/features/attention/rules';
import { getTodayString, formatDate } from '$lib/features/calendar/utils';
import type { PageServerLoad } from './$types';

async function loadStats(today: string) {
	const [revenueRow] = await db
		.select({
			pendingRevenue: sum(
				sql`(${bookingClients.amountDue}::numeric - ${bookingClients.amountPaid}::numeric)`
			)
		})
		.from(bookingClients)
		.innerJoin(bookings, eq(bookingClients.bookingId, bookings.id))
		.where(
			sql`${bookingClients.status} = 'enrolled'
			AND ${bookings.status} != 'cancelled'
			AND ${bookingClients.paymentStatus} != 'paid'`
		);
	return { pendingRevenue: parseFloat(revenueRow?.pendingRevenue ?? '0') || 0 };
}

export const load: PageServerLoad = async ({ locals }) => {
	const today = getTodayString();

	const future = new Date();
	future.setDate(future.getDate() + 60);
	const futureDateStr = formatDate(future);

	let instructorId: string | undefined;
	if (isInstructorRole(locals)) {
		instructorId = locals.user!.id;
	}

	const [
		todaySessions,
		upcomingSessions,
		upcomingBookings,
		bookingsForAttention,
		upcomingEvents,
		stats
	] = await Promise.all([
		listSessionsForDate(today, instructorId),
		listSessionsForDateRange(today, futureDateStr, instructorId),
		listBookingsForDateRange(today, futureDateStr),
		isInstructorRole(locals)
			? Promise.resolve([])
			: listAllBookings({ from: today, to: futureDateStr }),
		listEventsForDateRange(today, futureDateStr),
		loadStats(today)
	]);

	// Active camps: roster bookings currently running (dateEnd >= today) and not cancelled
	const activeCamps = upcomingBookings.filter(
		(b) => b.serviceHasRoster && b.dateEnd && b.status !== 'cancelled' && b.dateEnd >= today
	);

	// Unscheduled upcoming sessions (exclude today's — shown separately)
	const unscheduledUpcoming = upcomingSessions.filter(
		(s) => s.status === 'unscheduled' && s.date > today
	);

	const scheduledToday = todaySessions.filter((s) => s.status === 'scheduled').length;
	const unscheduledToday = todaySessions.filter((s) => s.status === 'unscheduled').length;

	// Next 3 upcoming events
	const nextEvents = upcomingEvents.filter((e) => e.startDate >= today).slice(0, 3);
	const attentionCards = buildAttentionCards({ today, bookings: bookingsForAttention });

	return {
		today,
		todaySessions,
		scheduledToday,
		unscheduledToday,
		unscheduledUpcoming,
		activeCamps,
		attentionCards,
		nextEvents,
		stats: {
			pendingRevenue: stats.pendingRevenue,
			unscheduledCount: unscheduledUpcoming.length
		}
	};
};
