# AGENTS.md

## Repo shape
- Single plugin package; the only source entrypoint is `src/index.tsx`.
- OpenCode loads the plugin from `.opencode/opencode.json` during local development; the README's config snippet still points at `src/index.tsx`.

## Commands
- `npm run typecheck` runs the only declared verification step (`tsc --noEmit`).
- There is no repo-defined build, test, lint, or format script in `package.json`.

## TypeScript / runtime constraints
- The package is ESM: `"type": "module"` and `tsconfig.json` uses `module`/`moduleResolution: "NodeNext"`.
- JSX is compiled with `@opentui/solid` via `jsxImportSource`.
- `tsconfig.json` only includes `src/**/*.ts` and `src/**/*.tsx`; keep plugin code there unless you also update the config.
- `dist/` and `*.tsbuildinfo` are ignored; do not commit generated output.

## Plugin behavior that matters
- The plugin reads pinned message IDs from `api.kv` under keys derived from `opencode.message-pins` and the session ID.
- The pinned list is rendered through the native `sidebar_content` slot, following the same non-overlay sidebar approach used by `oh-my-opencode-slim`.
- The plugin registers one explicit slash entry, `/pin`, because the user requested a timeline-style pin picker. Do not add more command-palette commands, keybindings, routes, or slash commands unless the user asks.
- OpenCode 1.17.13 does not expose a public TUI hook for extending the built-in user message action menu or decorating individual message rows; do not fake this through palette/slash workarounds.

## Editing guidance
- Keep changes small and centered on `src/index.tsx` unless you are intentionally changing plugin wiring or config.
- If you change the plugin entry path, update both `.opencode/opencode.json` and the README install snippet.
