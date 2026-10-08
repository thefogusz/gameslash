# Console layout and draft notifications

The dark Console uses a 232px sidebar and a bounded content area. Main text is
16px, metadata 14px, and page titles 30px. Shared tokens and controls in
`src/components/console.css` cover the library, inbox, editor, layout controls,
sources, agent keys and imports. These styles are scoped to `.admin-app`.
The public game directory keeps its existing design.

The library combines independent status, type and text filters, sorts by latest
update, and paginates at 20 records. Archived items have their own view. Pending
items open the review queue; titles open the editor. On small screens the sidebar
becomes a labelled menu selector and rows become compact cards.

The editor keeps its title and save action visible. Closing a changed editor or
leaving a changed layout asks before discarding edits. Notification polling never
refreshes the catalog or remounts a form; existing optimistic revision checks remain.

## Notifications

- Authenticated, read-only `GET /api/notifications` returns the latest 50 draft or
  pending entries, only ID, title, kind, status and update time. Responses are not cached.
- While the Console tab is visible, the bell checks every 30 seconds. Returning
  to the tab checks immediately. A new or changed draft produces a badge, a
  temporary message and an accessible live announcement.
- Clicking a notification loads the latest catalog and selects that exact draft
  or pending item. If its status has changed, the current entry opens for editing.
- Read markers use ID, status and update time, bounded to 500 keys in browser
  local storage. They are local to that browser, not a cross-device inbox. When
  storage is unavailable, markers last only in memory for the current page.
- No OS/browser permission prompt, email service or background push subscription
  is installed. Alerts are available while using the Console.

## Verification

`npm test` covers feed visibility, metadata minimization, ordering, limits and
notification versions. `scripts/smoke-mcp.ts` checks anonymous rejection,
authenticated draft discovery, read-only revisions and removal after publishing.
Browser checks cover combined filters, exact-draft navigation, notification arrival,
unsaved-edit protection and responsive layouts.
