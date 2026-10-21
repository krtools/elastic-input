# Device testing

Phone checks for this component: how to set up a test device, what an emulator can and cannot show, the phone UI principles the component follows, the lessons that shaped it, and a log. **After every emulator or phone session, add what was learned** — small, dated entries. Local details (SDK paths, AVD names, ports) do not belong here; keep those in your own notes or CLAUDE.md.

## 1. Setting up a test device

### Android emulator

- Install Android Studio's SDK and create a phone AVD with a recent Android image (any Pixel-class profile; Chrome comes with the Play images).
- Run it headless from a terminal so screenshots and input work without a window: `emulator -avd <name> -no-window -no-audio -no-boot-anim -no-snapshot -gpu swiftshader_indirect`. Boot takes about a minute; `adb shell getprop sys.boot_completed` prints `1` when ready. Stop it with `adb emu kill`.
- Complete Chrome's first run once (skip the account, decline usage reporting); the profile persists across runs.

### Reaching the dev server

- From the emulator, `10.0.2.2` is the host machine. The server must listen on all interfaces (`npm run dev:host`); a Vite server without `--host` may bind only the IPv6 loopback, and the page never loads.
- Anything that needs a **secure context** (the async clipboard API, permission-gated features) will not work over a plain `http://10.0.2.2` origin: `navigator.clipboard` is simply undefined. Tunnel instead with `adb reverse tcp:<port> tcp:<port>` and open `http://localhost:<port>/` on the device; `localhost` counts as secure. `adb reverse --remove-all` undoes it.
- Open a page with `adb shell am start -a android.intent.action.VIEW -d "<url>" com.android.chrome`. Each call opens a new tab; change the URL hash to force a fresh load of the same page, and close tabs now and then.
- The demo has hash presets for device checks: `#placement=middle|bottom` moves the input down the page, `#presentation=sheet|floating` and `#barPlacement=inline` preset those options.

### A real phone

- Run `npm run dev:host` and open the LAN URL it prints. The same secure-context rule applies: clipboard features need https or a tunnel.
- Keep the phone for what the emulator cannot reproduce (section 2).

## 2. Driving and reading an emulator

| Want | `adb shell` command (device pixels) |
|---|---|
| Tap | `input tap X Y` |
| Type | `input text "status:active"` (`%s` for a space; the on-screen keyboard appears after a tap into the editor) |
| Swipe / pan | `input swipe X1 Y X2 Y 300` |
| Long press | `input swipe X Y X Y 900` (same start and end) |
| Press and hold (pressed state) | `input motionevent DOWN X Y`, screenshot, `input motionevent UP X Y` |
| Double tap | `input tap X Y; input tap X Y` in one shell call (usually inside the 300ms window) |
| Hide the keyboard | `input keyevent KEYCODE_BACK` (a second BACK navigates back or leaves Chrome) |
| Rotate | `wm user-rotation lock 1` (landscape) / `lock 0` (portrait) — reliable; the `settings put system user_rotation` route was not |
| Caret to end | `input keyevent KEYCODE_MOVE_END` |

- Screenshot: `adb exec-out screencap -p > shot.png`. Device pixels ÷ `devicePixelRatio` = CSS pixels. The status bar and Chrome's URL bar take the top of the image; with the keyboard open the lower half is keyboard.
- `uiautomator dump` shows native UI only (keyboard, Chrome's bars), never page content.
- There is no JavaScript access to the page unless Chrome's remote debugging socket is forwarded (`adb forward tcp:9222 localabstract:chrome_devtools_remote`). Measure DOM sizes in a desktop browser at phone width instead; use the emulator for behaviour and visuals.

## 3. What the emulator reproduces, and what it cannot

Faithful, so test these here first:

- Layout and sizes at phone width, portrait and landscape, rotation.
- Chrome's keyboard behaviour: the visual viewport shrinking, the focused editable being scrolled into view (Chrome **centres** it, so a bar under the editor stays visible even with the input at the bottom of the page), `enterkeyhint` showing a Search key.
- Android's caret handle (the teardrop under the caret after a tap into text), and that a touch starting on it is consumed by Chrome before the page sees it.
- Pressed states, long-press word selection with native handles, double-tap word selection, `touch-action`, a cancelled `touchstart`, pointer events, the clipboard permission modal, Chrome's "Touch to Search" (a plain tap on page text selects a word and shows a search panel — a missed tap can trigger it).
- Pointer-event gesture code (pan, tap, swipe-down) end to end.

Not reproducible — these need a real phone:

- Anything about **finger contact area or timing**. Injected touches are exact points with no hesitation, so Android's touch adjustment (attributing a lingering press near editable text to the text — the caret magnifier on a chip) never fires. It was only ever seen on a real phone.
- Fling momentum and scroll feel; haptics.
- Whether the native Cut/Copy/Paste toolbar appears after a long press (it did not show in screenshots; unverified whether a screenshot captures it).

## 4. Phone UI principles the component follows

- **Target sizes.** Material asks 48dp, Apple 44pt, WCAG 2.5.8 (AA) 24px. Rows in the sheet and menu are 48px; the sheet's close button 44px; chips and bar buttons are 36px inside a 44px+ row that acts as the hit zone; the date picker and the floating dropdown grow to finger size when `(pointer: coarse)` matches, and stay compact for the mouse.
- **Own a gesture completely or not at all.** Cancelling `touchstart` is the only way to keep Android's long-press machinery (touch adjustment, caret drag, text selection) off a control; it also removes native scrolling, `:active` and the tap highlight, so the control must rebuild pan, tap and a pressed state from pointer events, and a page scroll can no longer start there. Scope it to the smallest element that needs it.
- **Visible pressed feedback** on every touch control, cleared the moment a pan starts, so swipes never flash.
- **Keep the caret handle in mind.** It reaches roughly 13 CSS px below the text line and wins any touch that starts on it; controls directly under editable text need clearance or a tolerant hit zone.
- **Keyboard-aware positioning.** Measure against `window.visualViewport`, not `window.innerHeight`; follow its resize and scroll events. Chrome scrolls the focused editable to the centre when the keyboard opens, so content just below it stays visible.
- **Phones in both orientations.** Width alone misses landscape phones (wider than 640 CSS px); detect them by a coarse pointer and a short viewport. With the keyboard open a landscape phone leaves about 70 CSS px of page — too little for any in-page UI; the native answer is a full-screen surface that dismisses the keyboard.
- **Bottom sheets** follow the native pattern: `role="dialog"` with `aria-modal` and a label, a drag handle, a short entrance that respects `prefers-reduced-motion`, swipe-down to dismiss, content-sized when the list is short.
- **Keyboard attributes.** `autocapitalize="off"`, `autocorrect="off"`, `enterkeyhint="search"`; a 16px font so iOS does not zoom into the field.
- **Clipboard.** Writing needs a secure context; reading additionally shows a permission modal on Android Chrome that blurs the page. Offer Cut/Copy/Select all and let the keyboard paste — Gboard shows the last copy as a chip in its suggestion strip.
- **Overflow needs an affordance.** A horizontally scrolling strip fades the edge that hides more items.
- **Edge-of-reach actions get a menu.** Triggers behind a symbol layer (`#`, `!`) and editing commands that have no shortcut on a phone go in a ⋯ menu as finger-sized rows.

## 5. Lessons that shaped this component

- A press on a chip just under the text line became a caret drag on a real phone (touch adjustment). Padding only trimmed it; owning the gesture removed it, at the cost of painting a pressed state and losing page scroll from the bar.
- 12px of top padding on coarse pointers clears most of the caret handle's reach; the handle hides on typing anyway.
- Landscape with the keyboard open is a known limit: the bar sits below the fold and the sheet gets what is left.
- Paste was dropped from the menu because of the permission modal and the focus loss it causes; Cut replaced it.
- Keyboard overlap of the bar is not a problem on Android Chrome, thanks to the centring scroll.

## 6. Session log

- **2026-10-18** — Emulator set up (headless, Chrome first run). Verified the bar's layout and the top gap; could not reproduce the caret-magnifier press (point touches). Verified the pointer-event pan, tap and the ⋯ menu with injected swipes and taps.
- **2026-10-19** — Measured target sizes; a held chip showed no pressed feedback (led to the pressed state); long press and double tap select words natively; landscape at 914 CSS px wide showed the floating dropdown under a keyboard leaving ~70px (led to the height clause in `'auto'`); `#placement=bottom` showed Chrome centring the editor on focus; a clipboard read showed the permission modal and the focus loss (led to dropping Paste); the touch-sized date picker and the pressed state verified on screen.
