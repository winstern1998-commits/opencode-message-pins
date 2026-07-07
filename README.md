# opencode-message-pins

An OpenCode TUI plugin for showing pinned user messages in the native OpenCode sidebar.

## What It Does

- Reads pinned message IDs per session from `api.kv`.
- Shows a compact pinned-message section through the TUI `sidebar_content` slot.
- Filters the visible list to user messages only.
- Registers a single `/pin` slash entry that opens a TUI picker for user messages.
- Moving through the picker attempts to scroll the session to the highlighted message.
- Pressing Enter toggles pin state for the highlighted user message.
- Does not register keybindings or custom routes.

## Install Locally

Add this TUI plugin to your OpenCode TUI config:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["./path/to/opencode-message-pins/src/index.tsx"]
}
```

Restart OpenCode after changing plugin config.

## Current Limitation

OpenCode 1.17.13 exposes native TUI slots such as `sidebar_content`, but it does not expose a public plugin hook for extending the built-in user message action menu or decorating individual message rows. The command, slash, route, and keyboard-entry workarounds have been removed.

OpenCode currently builds slash autocomplete from commands in the `palette` namespace. Because of that host behavior, exposing `/pin` also makes the backing command visible to the command palette.
