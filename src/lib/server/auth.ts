import { betterAuth } from 'better-auth/minimal';
import { admin } from 'better-auth/plugins';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { env } from '$env/dynamic/private';
import { building } from '$app/environment';
import { getRequestEvent } from '$app/server';
import { db } from '$lib/server/db';

const baseURL =
	env.ORIGIN ?? env.BETTER_AUTH_URL ?? (building ? 'http://localhost:5173' : undefined);
const secret =
	env.BETTER_AUTH_SECRET ??
	(building ? 'build-time-placeholder-secret-do-not-use-at-runtime' : undefined);

export const auth = betterAuth({
	baseURL,
	secret,
	database: drizzleAdapter(db, { provider: 'pg' }),
	emailAndPassword: { enabled: true },
	plugins: [admin({ defaultRole: 'instructor' }), sveltekitCookies(getRequestEvent)]
});
