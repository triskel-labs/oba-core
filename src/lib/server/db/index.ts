import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { env } from '$env/dynamic/private';

function missingDatabaseUrlError(): Error {
	return new Error(
		'DATABASE_URL is not set. Set it in .env before running the app, migrations, seeds, or DB-backed tests.'
	);
}

const missingDatabaseUrlDb = new Proxy(function missingDatabaseUrlDb() {}, {
	get(_target, prop) {
		// Prevent promise assimilation when tooling/import tests inspect the export.
		if (prop === 'then') return undefined;
		if (prop === Symbol.toStringTag) return 'MissingDatabaseUrlDb';
		return missingDatabaseUrlDb;
	},
	apply() {
		throw missingDatabaseUrlError();
	}
}) as unknown as ReturnType<typeof drizzle>;

const client = env.DATABASE_URL ? postgres(env.DATABASE_URL) : null;

export const db = client ? drizzle(client, { schema }) : missingDatabaseUrlDb;
