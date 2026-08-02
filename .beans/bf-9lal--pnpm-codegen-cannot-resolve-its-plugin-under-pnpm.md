---
# bf-9lal
title: pnpm codegen cannot resolve its plugin under pnpm
status: completed
type: bug
priority: normal
created_at: 2026-08-02T15:59:41Z
updated_at: 2026-08-02T16:00:10Z
---

## Summary

`pnpm codegen` fails with "Unable to find template plugin matching
'typescript-operations'" even though the plugin is installed and imports fine from
`apps/web`. Nothing in CI runs codegen, so `apps/web/src/api/generated.ts` had been
drifting from the operations it documents without anyone noticing.

## Root cause

`makeDefaultLoader` in `@graphql-codegen/cli@7.2.0` (`esm/codegen.js`):

```js
return import(isESMModule ? mod : relativeRequire.resolve(mod));
```

Running as ESM it passes the bare specifier to `import()`, so Node resolves it
against the CLI's own file under `node_modules/.pnpm/@graphql-codegen+cli@7.2.0.../`.
The plugin is not a dependency of the CLI, and pnpm's strict linking means it is not
reachable from there, so resolution fails with `ERR_MODULE_NOT_FOUND`.

`getPluginByName` swallows exactly `MODULE_NOT_FOUND` and `ERR_MODULE_NOT_FOUND` while
walking its nine candidate names, so the real reason never surfaces and the message
claims the package is missing. Upstream already flags the branch:

> For ESM we currently have no "resolve path" solution as import.meta is unavailable
> in a CommonJS context

plus a `FIXME(pnpm-update)` on the line above.

This is why a fully-qualified plugin name in the config does not help: the name is not
the problem, the resolution base is.

## Fix

`codegen.ts` supplies `pluginLoader`, a documented config option
(`Types.PackageLoaderFn<CodegenPlugin>`), which resolves the plugin to an absolute path
from the project and imports that path instead of the bare name. This is what the CLI's
own CommonJS branch already does. `require.resolve` still throws `MODULE_NOT_FOUND` for
candidate names that do not exist, so the loader's fallback walk is unaffected.

## Acceptance criteria

- [x] `pnpm codegen` completes and rewrites `src/api/generated.ts`
- [x] Regenerated output matches the committed file
- [x] No new dependency, `.npmrc` hoisting, or generated-file hand-editing
- [x] All gates stay green

## Summary of Changes

Fixed in `apps/web/codegen.ts` with a `pluginLoader` that resolves through
`createRequire(process.cwd())` and imports the resulting absolute path as a file URL.
That covers CommonJS and ESM plugin builds alike; the entry resolved here is the
plugin's CJS build, whose namespace exposes `plugin` because Node's loader detects it.

Verified by regenerating: after prettier the output is byte-identical to the file that
was hand-edited while codegen could not run, which confirms both that the generator
works and that the hand edit was faithful.

No dependency change and no `.npmrc` hoisting. Both were options and both are heavier;
hoisting would relax resolution across the whole workspace to work around one upstream
bug in one package.

Still unguarded: nothing checks that `generated.ts` is current, which is why this went
unnoticed. A `codegen:check` CI step would have to run codegen, format the result and
diff it, since codegen emits unformatted output. Not added here.
