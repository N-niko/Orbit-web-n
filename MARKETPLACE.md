# Campus Marketplace

Marketplace is part of the existing Orbit workspace and is also available at `/marketplace`. A listing can be opened directly with `/marketplace?listing=<uuid>`. The Home feed's Marketplace composer opens the listing form; its Marketplace filter opens the marketplace browser. Historical feed posts remain intact.

## Access and deployment

Apply `supabase/migrations/20261024022544_campus_marketplace.sql` before deploying the app. It creates the listing, photo, save, inquiry, message, and report tables, private photo bucket, indexes, and access rules. No new environment variables, paid services, or service-role keys are needed. The hosted Orbit project has already had this migration applied.

Campus membership comes from the current `auth.users.email` and non-null `email_confirmed_at`, matched to an administrator-controlled campus domain. The initial supported domain is exactly `caldwell.edu`. Editable profile fields and user metadata do not grant access. The indicator means “confirmed university email”; it does not claim current enrollment or organizer approval. Personal-email accounts keep other Orbit features but cannot use the real Marketplace. They can explore the isolated demo or create and confirm a campus-email account.

Only a project administrator should add another institution to `orbit_private.market_campuses` after checking its official email domain. Do not expose campus-domain editing to students or turn off confirmation to bypass the access check. An account email change takes effect on marketplace authorization immediately, without relying on stale token metadata.

## Persistence and privacy

Sales and Wanted requests share `orbit_market_listings`, separated by `kind`. Sale statuses are available/reserved/sold; Wanted statuses are active/fulfilled. Sold and fulfilled entries remain in My Listings and Saved. Browse returns open listings only. Search matches title and description, with category, price/budget, condition, pickup, and availability filters. Pages contain 24 listings.

Photos use the private `orbit-market-photos` bucket: up to four JPEG/PNG/WebP/GIF images, 5 MB each. Their array order determines the cover. Upload reservations belong to the authenticated user, and publishing verifies actual Storage object size and MIME metadata before binding a photo. Published photos cannot be replaced or discarded through the draft-file endpoint. Editing removes their binding; deletion also unbinds photos. Abandoned or detached uploads older than 24 hours are removed through Storage's API on the owner's next photo reservation. Limits are 40 photo reservations per day and 100 MB per user. A removed listing is soft-deleted, so its private conversation history can remain accessible to its participants.

Inquiries are unique per listing and buyer/requester contact. Only the two participants with matching campus access can read or send messages. A new inquiry cannot start on a sold/fulfilled listing, but existing inquiries remain available. Messages load in pages of 50 and refresh while the page is visible. Retry IDs avoid duplicate messages. Listings and inquiries have daily creation limits; messages have a per-minute limit.

Seller projections include only id, name, color, and the listing's university. They do not include email, residence details, or workspace data. Seller links use the existing profile privacy controls. General pickup descriptions are public to the campus; the form asks for public meeting places, not addresses or GPS.

## Reports and moderation

The form requires agreement to the prohibited-item/public-pickup rules. The database also rejects common prohibited-item terms. This basic check is not a substitute for human review.

Reports are stored in `orbit_market_reports`; students cannot read that table. Project administrators review it in Supabase. To hide a prohibited or suspicious listing, set its `blocked` field to true in the listing table; this also denies access to its photos and inquiry content. There is no automatic report notification, staffed moderation service, or separate administrator dashboard in this version.

## Verification

- `npm test`: validation, demo persistence, API authentication/origin checks, photo types, forged owner/campus data, and message retry coverage, plus existing application tests.
- `npm run test:db`: all migrations and permission tests in disposable PostgreSQL, including confirmed email proof, cross-campus restrictions, ownership, actual photo binding, filters, saves, private messages, pagination, reporting, deletion, and email-change revocation. Storage's local schema is a shim, not a hosted upload test.
- `npm run typecheck` and `npm run build`: TypeScript and production routes.
- `supabase/tests/orbit_marketplace_live.sql`: optional rollback-only hosted smoke test using existing confirmed-campus and noncampus accounts. It creates no lasting sample listings and sends no emails or messages.

Browser checks cover demo publishing with two photos and a changed cover, Wanted requests, search, saving, status changes, deletion, profile links, private inquiry messages, responsive layouts, and dark mode. A real signed-in campus account should additionally perform a hosted Storage upload and a two-account message exchange; the developer browser was signed out of Orbit during implementation. No demo listings are inserted into the real database.
