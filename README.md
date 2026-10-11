# pi-leader

Vim-style leader key sequences for [pi](https://github.com/earendil-works/pi). While a sequence is pending, a which-key hint above the editor lists the keys that can come next.

## Requires

- `TUI.getFocusedComponent()` on the `TUI` interface. The `my` branch of the [msetsma/pi-my](https://github.com/msetsma/pi-my/tree/my) fork adds it. Stock pi already has the method on its TUI class, so the extension runs on stock pi too. Only `npm run check` needs the fork.
- Everything else is stock pi extension API: `ctx.ui.onTerminalInput`, `ctx.ui.setEditorComponent`, `CustomEditor`, `pi.getCommands()`.
- `p o` needs [pi-outline](https://github.com/msetsma/pi-outline). Without it, the binding shows a warning and does nothing else.

## Install

Add the package to `~/.pi/agent/settings.json`, either as a local checkout:

```json
{ "packages": ["~/dev/pi-fork/pi-leader"] }
```

or from git:

```json
{ "packages": ["git:github.com/msetsma/pi-leader"] }
```

`pi install git:github.com/msetsma/pi-leader` writes the same entry. Add `@<tag or commit>` to pin a version.

## Keys

- `space` works as a leader only when the editor is focused and empty, or when pi-vim reports normal mode through its `pi-vim:mode-change` event. Otherwise it types a space.
- `ctrl+space` works as a leader any time the editor is focused.

Both leaders bind every action:

| Keys | Action id | Does |
|---|---|---|
| `t` | `pi-leader.session.tree` | Session tree (`app.session.tree`) |
| `m` | `pi-leader.model.select` | Model selector (`app.model.select`) |
| `s` | `pi-leader.settings` | `/settings` |
| `r` | `pi-leader.reload` | `/reload` |
| `k` | `pi-leader.keys` | List leader keys (same as `/keys`) |
| `p o` | `pi-leader.outline` | `/outline` (from pi-outline) |

`/keys` lists the active sequences, the config path, the timeout and any config warnings.

Timing works like Vim's `timeoutlen` (default 1000 ms). A complete sequence fires immediately. A sequence that is also the prefix of a longer one fires when the timeout passes or when the next key does not continue it. In every other case, the longest complete sequence you typed fires, and the keys after it are replayed to the editor as text. If no sequence completed, all the typed keys are replayed. The cancel key (`tui.select.cancel`, escape by default) drops a pending sequence.

Built-in actions go through the editor's own handlers. Slash commands go through its submit handler, so they never reach the model. Any draft in the editor is kept.

## Configuration

`~/.pi/agent/pi-leader.json` is optional; the defaults apply without it. Each value is a key sequence (space-separated key ids) or a list of them. Set an action to `[]` to unbind it.

```json
{ "timeoutMs": 1500, "pi-leader.session.tree": ["space g t", "ctrl+space t"], "pi-leader.reload": [] }
```

Edits take effect on `/reload`.

## Editor ownership

pi-leader installs a `CustomEditor` so it can tell when the editor is focused and dispatch actions through it. If another extension has already set an editor, pi-leader keeps that editor and only records the instance. If an extension that loads later sets its own editor, that editor replaces pi-leader's and the leaders stay off.

Known limit: in fullscreen, the alt-screen listener sees keys before pi-leader does, so a leader bound to a `tui.altScreen.*` key never arrives. The defaults avoid those keys.

## Development

```sh
npm run check   # typecheck; expects the fork checked out at ../pi-my (on its my branch) with node_modules installed
npm test        # sequencer unit tests; no install needed
```

## License

MIT
