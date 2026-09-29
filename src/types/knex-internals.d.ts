/**
 * Type shim for knex's internal Postgres client (deep import, no published
 * types; knex has no package.json "exports" map).
 */
declare module 'knex/lib/dialects/postgres/index.js' {
  const ClientPG: any;
  export default ClientPG;
}
