# Regenerate with `vhs demo/demo.tape` from the repo root.
# Needs the pi-my fork at ../pi-my and pi-outline at ../pi-outline. Runs offline with a fake model.
Output demo/demo.gif

Set Shell bash
Set FontSize 15
Set Width 1200
Set Height 640
Set Padding 16
Set Theme "Catppuccin Mocha"
Set TypingSpeed 60ms
Set Framerate 20

Hide
Type `P=$(cd .. && pwd) D=/tmp/pi-leader-demo && rm -rf $D && mkdir -p $D/agent /tmp/my-project` Enter
Type `printf '{"defaultProvider":"demo","defaultModel":"demo-model","defaultThinkingLevel":"medium","packages":["%s","%s"],"extensions":["%s"],"tuiMode":"fullscreen","quietStartup":"header","theme":"dark","lastChangelogVersion":"99.0.0"}' "$PWD" "$P/pi-outline" "$PWD/demo/faux.ts" > $D/agent/settings.json` Enter
Type `echo '{"timeoutMs":3000}' > $D/agent/pi-leader.json && PI=$P/pi-my/pi-test.sh && cd /tmp/my-project && clear` Enter
Type `PI_CODING_AGENT_DIR=$D/agent PI_SKIP_VERSION_CHECK=1 $PI --no-env` Enter
Sleep 10s
Show

# Space on an empty editor starts a sequence; the hint lists the next keys.
Sleep 1s
Space
Sleep 2s
Type "k"
Sleep 3s

# space m: model selector
Space
Sleep 1s
Type "m"
Sleep 2s
Escape
Sleep 1s

# A couple of prompts so the outline has something to show.
Type "How does the login handler work?"
Enter
Sleep 2s
Type "Add a test for expired sessions"
Enter
Sleep 2s

# space p shows the nested o; o toggles the outline panel.
Space
Sleep 1.5s
Type "p"
Sleep 2s
Type "o"
Sleep 2.5s

# With text in the editor, space is just a space.
Type "now refactor the session cache"
Sleep 1.5s

# ctrl+space is a leader any time the editor is focused.
Ctrl+Space
Sleep 1.5s
Type "p"
Sleep 1s
Type "o"
Sleep 2.5s
