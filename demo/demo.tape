# Regenerate with `vhs demo/demo.tape` (or `demo-gif demo/demo.tape`) from the repo root.
# Needs: vhs, the pi-my fork at ../pi-my and pi-outline at ../pi-outline. Runs offline with a fake model.
Output demo/demo.gif

Set Shell bash
Set FontSize 22
Set Width 1200
Set Height 680
Set Padding 16
Set Theme "Catppuccin Mocha"
Set TypingSpeed 60ms
Set Framerate 20

# Hidden setup: throwaway HOME (pwd -P so paths show as ~/my-project; the relative
# agent dir keeps the temp path out of the space k listing), pi config
# with this package, pi-outline and the fake model, then two prompts so the
# outline has entries before the recording starts.
Hide
Type@1ms `REPO="$PWD"; export HOME="$(cd "$(mktemp -d)" && pwd -P)" PS1='$ ' PI_CODING_AGENT_DIR=../.pi/agent PI_SKIP_VERSION_CHECK=1; mkdir -p ~/.pi/agent ~/my-project && cd ~/my-project`
Enter
Type@1ms `printf '{"defaultProvider":"demo","defaultModel":"demo-model","defaultThinkingLevel":"medium","enabledModels":["demo/demo-model"],"packages":["%s","%s"],"extensions":["%s"],"tuiMode":"fullscreen","quietStartup":"header","theme":"dark","lastChangelogVersion":"99.0.0"}' "$REPO" "${OUTLINE_DIR:-$REPO/../pi-outline}" "$REPO/demo/faux.ts" > ~/.pi/agent/settings.json; echo '{"timeoutMs":3000}' > ~/.pi/agent/pi-leader.json`
Enter
Type@1ms `clear; "${PI_DIR:-$REPO/../pi-my}/pi-test.sh" --no-env`
Enter
Wait+Screen@30s /demo-model/
Type@1ms "How does the login handler work?"
Enter
Wait+Screen@15s /checks the session cookie/
Type@1ms "Add a test for expired sessions"
Enter
Wait+Screen@15s /12 tests pass/
Sleep 500ms
Show

# Space on an empty editor starts a sequence; the hint lists the next keys.
Sleep 500ms
Space
Sleep 2s
Type "k"
Sleep 3s

# space m: model selector
Space Sleep 800ms Type "m" Sleep 2s
Escape Sleep 600ms

# space p shows the nested o; o toggles the outline panel.
Space Sleep 800ms Type "p" Sleep 1.5s Type "o" Sleep 2.5s

# With text in the editor, space is just a space.
Type "now refactor the session cache"
Sleep 1s

# ctrl+space is a leader any time the editor is focused.
Ctrl+Space Sleep 1.5s Type "p" Sleep 1s Type "o" Sleep 2.5s
