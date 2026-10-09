# Game likes

Likes are stored in the existing catalog as `gameLikes`, keyed by a SHA-256 hash
of a random, HttpOnly browser cookie. Public responses contain only that browser's
liked IDs; the authenticated management API exposes aggregate counts. Mutations
use the existing storage lock/CAS and do not change the editorial revision.

Deploy the Cloudflare D1 worker from this branch **before** deploying the Next.js
app when using D1. Its bundled catalog schema must understand `gameLikes`; an
older worker strips this field. The app rejects likes writes until the worker
advertises support. The updated worker preserves likes when an older app omits
the field. Keep this worker version on rollback: an older worker strips likes.

Existing local favorites import once when that browser returns. Failed imports
keep the original local data for retry. Clearing browser cookies, changing devices
or using a private window creates a new voter; counts measure browsers, not
verified people. The write limit reduces casual spam, not determined bots.

This intentionally reuses snapshot storage. Move likes to a dedicated table before
sustained traffic or when D1's state row approaches its 1.8 MB application limit.
