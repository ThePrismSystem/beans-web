# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.4] - 2026-08-02

Makes navigation and inline editing perceivable without sight. Three audits
reviewed what the app renders; these are the defects that only appear when you
operate it.

### Fixed

- Every route was titled "beans-frontend". A single-page app keeps whatever
  title the HTML shipped with, and a screen reader announces the document title
  on navigation — so nothing ever signaled that the view had changed. Each
  route now names itself, including the bean's own title on its detail page
  (WCAG 2.4.2).
- Navigating left focus on `<body>`, dropping keyboard and screen-reader users
  at the top of the document with the new view unannounced. Focus now moves
  into the main landmark, which both places them at the start of the content
  and prompts a reader to announce it (WCAG 2.4.3).
- Nine loading and error states rendered as plain text, so requesting a project
  and having it fail was completely silent. They are now live regions, errors
  announced assertively (WCAG 4.1.3).
- Editing a bean's type, status, priority or tags destroyed keyboard focus:
  clicking the pencil unmounted it and focus fell to `<body>`, so the user was
  thrown back to the top of the page on the view where most editing happens.
  Focus now follows the swap — into the editor on open, back to the pencil on
  save or cancel (WCAG 2.4.3).
- Bean bodies rendered their markdown headings verbatim, so a body opening with
  `#` put a second `<h1>` on the page and one opening with `###` skipped a
  level. Bodies are written by people and by coding agents, so this was live
  content. Headings are demoted one level to nest under the bean's title
  (WCAG 1.3.1).

### Changed

- External links in bean bodies open in a new tab, with the opener severed via
  `rel`, so following one no longer navigates away from a half-finished edit.
  They carry a hidden note that the tab will change (WCAG 3.2.5).
- The bean title's "click to edit" hint moved from a `title` tooltip — which
  keyboard and touch users never see — to a description that is announced
  without altering the heading's name.
- Clicking the dialog backdrop with a scrap reason typed now returns focus to
  the text rather than doing nothing at all, so the refusal reads as "your work
  is still here".

## [0.1.3] - 2026-08-02

A second design-quality pass, covering one Level A defect the previous audit
missed entirely and one regression the previous release introduced.

### Fixed

- The create-bean form reported a missing title with plain text that assistive
  technology never saw: no `role="alert"`, no association with the input, and
  focus left on the submit button. Submitting an empty form appeared to do
  nothing at all. The error is now announced and linked to the field, the field
  is marked required, and focus moves to it (WCAG 3.3.1, Level A).
- The bean detail `<h1>` announced as "Edit title: …" rather than the bean's
  title. A heading takes its accessible name from its contents, so the edit
  button's `aria-label` became the heading's name and heading-list navigation
  led with the action instead of the bean. Introduced in 0.1.2 while adding the
  missing `<h1>`.
- Clicking the dialog backdrop discarded a typed scrap reason without warning.
- Filter menus advertised `aria-haspopup="true"`, which promises a menu; they
  are a disclosure holding a group of checkboxes.
- Screen readers announced each chart's title twice — once from the heading and
  again from the table caption beneath it.

### Added

- Arrow-key, Home and End navigation between checkboxes in the filter menus.
- Tests pinning both sides of the drawer breakpoint. The 768px value is
  necessarily duplicated between the stylesheet and the code that decides when
  the closed drawer becomes `inert`, and CSS variables cannot be used in media
  queries — so the two drifting apart is now a test failure rather than a
  silent one-sided break.

### Changed

- Bean detail is code-split. It is the only consumer of the markdown renderer,
  so the entry chunk no longer carries `marked` and DOMPurify: **425.7 kB to
  330.7 kB** (gzip 132.9 kB to 103.8 kB), a 22% reduction for anyone landing on
  the overview or a project list.
- Bean rows are memoized, so an expand, a filter keystroke or a live-update
  flush no longer re-renders every row in the list.
- Spacing literals moved onto the token scale — 16 off-scale declarations down
  to 4, each of the survivors now documented as deliberate.

## [0.1.2] - 2026-08-02

A design-quality pass over the web UI: accessibility, theming, responsive
behavior, and live-update cost. No change to the interface's visual direction.

### Fixed

- Analytics charts ignored the color scheme entirely. Series colors were
  hard-coded to light-palette hexes, so in dark mode the grid drew at 10:1
  contrast while the bars fell to 1.9–2.8:1 — below the 3:1 minimum for a mark
  that carries meaning on its own. Chart color now comes from theme tokens
  applied through CSS, which the SVG `fill` attribute could not carry.
- Chart axis labels failed WCAG AA in **both** schemes (3.40:1 light, 4.00:1
  dark) and are now drawn in `--muted`. Automated scanning never caught this:
  axe's contrast rule skips SVG text.
- The inline-edit save button rendered white on green at 4.16:1 in light and
  2.64:1 in dark. It now uses a fill that inverts per scheme, clearing AA in
  both.
- "Some projects failed to load" banners used the in-progress status hue as
  text, at 2.27:1 on light paper. They now use the warning token.
- The navigation drawer is hidden off-screen by a transform, which left its
  links keyboard-focusable while invisible. The closed drawer is now `inert`,
  and while it is open the page behind it is, so focus stays where it shows.
- Plain buttons had no styling of their own and fell back to the browser's
  chrome — a cold grey against warm paper, and a surface the dark theme never
  accounted for.
- The bean detail page had no `<h1>`: its title was a bare button, so the
  document outline started at `<h2>`. Chart headings likewise skipped a level.
- The analytics totals could overflow a 320px-wide viewport.

### Added

- A "skip to content" link (WCAG 2.4.1) — the sidebar repeats on every route.
- Full combobox semantics on the header search: arrow-key, Home/End and Enter
  navigation, `aria-activedescendant`, and a live region announcing the result
  count. Previously the dropdown was unreachable and unannounced.
- A tabular equivalent of every chart for assistive technology (WCAG 1.1.1).
- Spacing, radius and type-size scales in `tokens.css`; radii previously mixed
  seven pixel values with two rem values.
- Accessibility scans now cover dialogs, the relation picker, open menus, and
  the mobile layout, and enforce heading order — none of which were scanned
  before. New tests assert chart contrast in a real browser in both schemes.

### Changed

- Scrapping a bean now asks for its reason in an in-app dialog rather than
  `window.prompt()`, which cannot be themed and blocks the main thread.
- Live-update invalidation is batched. One `.beans` write is one event, so a
  bulk edit previously refetched every project list and re-ran the
  cross-project analytics fan-out once per file.
- Overlay scrims are tinted with the palette's ink rather than pure black, and
  reduced-motion preferences are honored across the whole stylesheet rather
  than for the drawer alone.

## [0.1.1] - 2026-08-02

### Fixed

- The cross-origin guard rejected every state-changing request behind a
  TLS-terminating reverse proxy. Because the web app sends GraphQL queries as
  `POST`s, that broke reading too: the project list still loaded, but opening a
  project showed nothing. The new `TRUST_PROXY=true` makes the guard derive the
  expected origin from `X-Forwarded-Proto` and `X-Forwarded-Host`. It defaults to
  `false`, so a directly exposed server keeps ignoring those headers, and the
  `403` now names the setting.

## [0.1.0] - 2026-08-01

First public release: a web UI for [`beans`](https://github.com/hmans/beans), the
local-first, Markdown-backed issue tracker.

### Added

- Project discovery across one or more configured `GIT_ROOT` roots, each project
  read directly from its on-disk `.beans` files (no database).
- Per-project overview with type and status counts, plus hierarchy and flat bean
  lists.
- Bean detail view with inline editing and relationship management (parent,
  children, blocking, blocked-by).
- Cross-project search and simple analytics.
- Live updates over Server-Sent Events as `.beans` files change on disk.
- Docker image and `docker-compose.yml` for self-hosting; the bundled `beans` CLI
  is built from source in a multi-stage build.

### Security

- Argument-injection hardening on the `beans` CLI invocation, a cross-origin
  request guard, security headers with a self-only CSP, a request body cap, and a
  subprocess timeout. Host filesystem paths are no longer exposed by
  `GET /api/projects`. See [`docs/SECURITY.md`](docs/SECURITY.md).

[0.1.4]: https://github.com/ThePrismSystem/beans-frontend/releases/tag/v0.1.4
[0.1.3]: https://github.com/ThePrismSystem/beans-frontend/releases/tag/v0.1.3
[0.1.2]: https://github.com/ThePrismSystem/beans-frontend/releases/tag/v0.1.2
[0.1.1]: https://github.com/ThePrismSystem/beans-frontend/releases/tag/v0.1.1
[0.1.0]: https://github.com/ThePrismSystem/beans-frontend/releases/tag/v0.1.0
