# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-08-05

A full audit before the repository goes public. This closes several ways a
malicious web page or another local account could reach the beans under
`GIT_ROOT`, bounds the work one request can queue against the server, and moves
the container onto a patched base image and toolchain. Read `### Upgrading` —
reaching the UI by anything other than `localhost` now needs configuration.

### Added

- A project page can create beans. Creation used to live only on a bean's own
  page, where every new bean is a child of the one you are looking at — so a
  top-level bean meant opening an unrelated bean and clearing its parent, and a
  project with no beans yet had no way in at all.
- The new-bean form can set **Blocks** and **Blocked by**, alongside the parent.
  All three now use the same searchable, filterable bean picker the bean detail
  page uses, in place of a plain dropdown that listed every candidate by title
  and nothing else. The relations are declared in the same request that creates
  the bean rather than as follow-up edits.
- The form opens as a dialog rather than expanding the page beneath the button.

### Security

- A page on an attacker's domain whose DNS resolved to this server could read
  and write every bean under `GIT_ROOT`. The origin check compared two values
  the attacker controlled together, so they always agreed. Requests are now
  matched against a server-side allowlist of hostnames, covering `GET` as well:
  under DNS rebinding the attacking page is same-origin as far as the browser is
  concerned, so it can read ordinary responses too.
- A project's `.beans.yml` could point its data directory outside `GIT_ROOT`
  with `beans.path: ../../elsewhere`, and the CLI honoured it. Discovery now
  resolves and contains that path, passes it explicitly on every call, and
  re-checks it immediately before spawning — so a directory swapped for a
  symlink after discovery is caught rather than followed.
- `docker compose up` published the UI on every interface; it now binds
  loopback. This UI has no authentication, so anything that can reach it can
  read and write every mounted project.
- The GraphQL query no longer appears in the process table. Its **variables**
  still do — `beans` offers no way to pass them otherwise — so search terms and
  bean titles remain readable via `/proc` by other local accounts on the host.
  `docs/SECURITY.md` describes what that exposes.
- Error responses no longer echo the command line. A failing `beans` call used
  to return the whole invocation, variables included, to the API client.
- The container moves to Node 24 and a patched Go toolchain, with `npm` removed
  from the runtime image, and `hono` is raised past the CORS ReDoS advisory. CI
  now fails on any fixable HIGH or CRITICAL image finding.

### Fixed

- A client that navigated away left its work running. Nothing cancelled a
  request already queued for a `beans` subprocess slot, so the backlog a burst
  of traffic built up was worked through in full long after every client had
  gone. Queued work is now abandoned on disconnect, and the queue is bounded —
  a saturated server sheds load with `503` and `Retry-After` instead of
  accepting work it will still be doing a minute later. Measured on a
  200-request burst: subprocess spawns after the last client disconnected fell
  from 8017 to 166, and the tail from 42 s to 1.2 s.
- The web UI never cancelled superseded requests, so the server was honouring
  disconnects the app never performed. Typing in the search box no longer leaves
  its earlier queries running.
- An event-stream connection dropped by an HTTP/1.1 client with pipelining
  enabled was never released, permanently consuming one of the 32 stream slots.
  After enough of them, live updates stopped working until the server restarted.
- Project discovery read an entire directory level at once, so a deep `GIT_ROOT`
  could push peak memory to +101 MiB where it now peaks at +29 MiB.
- A busy server briefly marked every project as broken, because a full work
  queue was reported as a per-project failure.
- Requests and the periodic re-scan could start two discovery passes at once,
  scanning every project twice for one cache generation.

### Changed

- The project is now `beans-web`; the workspace scope is `@beans-web/*`.
- Node 24 is required.

### Upgrading

- **Reaching the UI by anything other than `localhost` now requires
  `ALLOWED_HOSTS`.** A request with an unrecognized `Host` is rejected with
  `421`. Set it to the hostname you use. Behind a reverse proxy with
  `TRUST_PROXY=true`, list both the internal host the proxy dials and the public
  hostname it forwards.
- The published port in `docker-compose.yml` is now `127.0.0.1:4780:4780`. If
  you reached it from another machine, put an authenticating proxy in front and
  set `ALLOWED_HOSTS`.
- Node 24 is the new floor.

## [0.2.1] - 2026-08-03

Closes the five follow-up items 0.2.0 left open. Nothing to do to upgrade.

### Fixed

- A client that disconnects while queued for a `beans` subprocess slot now
  leaves the queue instead of reaching the front and spawning a child nobody is
  waiting for. Cancellation deliberately stops there: a `beans` process already
  running is never killed, because interrupting a mutation mid-write could
  truncate a bean file.
- Project discovery shares one in-flight pass. Every request arriving on a cold
  or just-expired cache used to start its own, each fanning out a child process
  per project, so simultaneous requests queued a multiple of that for a single
  answer.
- Requesting a subprocess slot from inside one now fails loudly instead of
  hanging forever. Once every slot is held by a caller waiting on a nested
  request, nothing can ever release.
- Closing an event stream no longer leaves its heartbeat timer and stream
  plumbing alive for up to 25 seconds. The connection's slot was already freed
  on disconnect, so repeated connect/drop cycles piled up dead closures at
  connection rate, unbounded by the 32-stream cap.

### Changed

- The `beans` CLI version has one source: `ARG BEANS_VERSION` in the
  `Dockerfile`. The compose build argument that silently overrode it is gone,
  CI reads the pin from the Dockerfile, and a build fails if a second literal
  pin reappears in any build input. Bumping the Dockerfile is now enough.

## [0.2.0] - 2026-08-03

Closes the seven actionable findings from the 2026-08-02 STRIDE/OWASP audit, and
repairs a lint gate that had never run. The version bump is for the container:
it no longer runs as root, so an existing deployment whose project files are
root-owned needs one change before it can write them again.

### Upgrading

The image now runs as `node` (uid 1000). If your bind-mounted projects are owned
by root, the UI will fail to write beans until you either `chown` the tree to the
uid you want, or set `user:` in `docker-compose.yml` to the uid that already owns
it (`id -u` prints yours). The `user:` line ships commented with that guidance.

### Security

- Every `beans` subprocess now takes one of `BEANS_CONCURRENCY` (8) process-wide
  slots. The cap read like a server-wide limit but `mapWithConcurrency` built a
  fresh pool per request, so it bounded one request and nothing else — the audit
  measured 120 concurrent requests producing 162 live child processes. Callers
  now queue rather than multiplying children.
- Absolute host paths are stripped from `beans` error messages before they reach
  a client. The CLI names the file it failed to load by full path, and the
  GraphQL route returned that verbatim, disclosing the OS username and the
  location of `GIT_ROOT`. Errors now carry the basename only, so they still
  identify the offending file.
- The cross-origin guard compares the content-type by MIME essence instead of
  substring. `multipart/form-data; boundary=application/json` satisfied the old
  check — and `multipart/form-data` is CORS-safelisted, so that request reached
  a state-changing handler with no preflight.
- `/api/events` refuses connections past 32 concurrent streams with a `503`.
  Each stream held a socket and a watcher listener for as long as it lived, and
  the route is a GET, so it was exempt from the cross-origin guard.
- `/api/*` requests are logged with method, path, status and duration, ahead of
  the guards so rejected requests are traced too. Bodies, headers and query
  strings are never written: the query is stripped before the line is emitted,
  because `/api/search?q=…` carries the user's own search text.
- The `beans` CLI version baked into the image is pinned rather than tracking
  `latest`, and the pin is kept in step with the one CI tests against.

### Changed

- **The container runs as an unprivileged user.** The runtime stage sets
  `USER node`, and the compose stack drops all capabilities, sets
  `no-new-privileges`, and mounts the root filesystem read-only with tmpfs for
  `/tmp` and `/home/node/.cache`. See **Upgrading** above — this is the only
  change in this release that can require action.

### Fixed

- `pnpm lint` had never linted a single TypeScript file. ESLint 10 resolves the
  nearest `eslint.config.js` per file, so three per-package re-export shims
  became the active config for everything under `apps/*` and `packages/*` — and
  flat-config `files` globs resolve relative to that config's own directory, so
  the root's `apps/server/**/*.ts` patterns matched nothing. `eslint .` matched
  10 files, none of them source. A file containing `const v: any = x[0]!;`
  passed the gate clean. It now matches every source file and that probe fails.
  Broken since the scaffold commit, not a dependency regression.
- The 465 violations the repaired gate surfaced, across 115 files. Two groups
  were real defects rather than style: seven `react-hooks/set-state-in-effect`
  cases, fixed by deriving during render, and six unhandled promise rejections.
- `docs/SECURITY.md` overstated the old content-type check, claiming it refused
  a no-preflight `text/plain` request. `README.md` claimed the container ran as
  root, which contradicted the image it described.

## [0.1.5] - 2026-08-02

Gives the search page the styling it never had. A scoped audit scored it 11/20
against 19/20 for the rest of the app, for one reason: `.search-page` and
`.bean-list` had no CSS rules, and the search input took its appearance from
`.filter-bar input` — a selector that only matches inside the filter bar.

### Fixed

- The search field rendered as a raw browser control: 185px wide at both 375px
  and 1280px, a `2px inset` border, Arial, white background, square corners. It
  is now styled by its own class, so it looks like every other control in the
  app and fills the column it sits in.
- Result rows had no separators and, on a phone, squeezed the title, project
  and status onto one line — breaking "e2e-project" across two lines as "e2e-"
  and "project". Rows now stack on narrow viewports and are ruled by hairlines.
- Results ran the full width of a desktop window. The page is capped at 46rem,
  so the list stays scannable.
- "Search failed." was a plain paragraph, so a failed search was silent to a
  screen reader. The 0.1.4 pass over this file replaced only the loading
  branch; the error branch is now a live region (WCAG 4.1.3).
- The search input used a 13.6px font on phones, which makes iOS Safari zoom
  the viewport on focus and never zoom back out. It is 16px below 768px.

### Added

- The search page states its result count, visibly and announced, as the header
  search dropdown already did.
- Regression tests that read resolved style out of a real browser at both
  viewports. The defect was a rule that silently failed to match, which no test
  of the rendered markup could have caught.

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

[0.3.0]: https://github.com/ThePrismSystem/beans-web/releases/tag/v0.3.0
[0.2.1]: https://github.com/ThePrismSystem/beans-web/releases/tag/v0.2.1
[0.2.0]: https://github.com/ThePrismSystem/beans-web/releases/tag/v0.2.0
[0.1.5]: https://github.com/ThePrismSystem/beans-web/releases/tag/v0.1.5
[0.1.4]: https://github.com/ThePrismSystem/beans-web/releases/tag/v0.1.4
[0.1.3]: https://github.com/ThePrismSystem/beans-web/releases/tag/v0.1.3
[0.1.2]: https://github.com/ThePrismSystem/beans-web/releases/tag/v0.1.2
[0.1.1]: https://github.com/ThePrismSystem/beans-web/releases/tag/v0.1.1
[0.1.0]: https://github.com/ThePrismSystem/beans-web/releases/tag/v0.1.0
