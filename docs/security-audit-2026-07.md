# Security Audit — PM Workload Tracker

Date: 2026-07-02
Scope: `index.html` (single-file app, ~16.6k lines), Supabase schema, CDN dependencies, docs.
Method: manual source review focused on XSS sinks, the Supabase auth/RLS model, secret handling, dependency integrity, and injection sinks (`eval`/`Function`/`javascript:`).

## Summary

The app is a single-user-per-account tool: Supabase Row Level Security scopes every
row to `auth.uid()`, so there is **no server-side data sharing between users**. "Team"
and "relay" data lives entirely inside one user's own record. That materially lowers the
impact of stored XSS (it is largely self-inflicted) — with one important exception: data
imported from external `.xlsx` files becomes app state, so a malicious spreadsheet is a
real, attacker-influenced input path.

The core defensive control — `escHtml()` — is applied consistently to task/session
names, notes, and "waiting on" text, but is **not** applied to project labels, billing
codes, project display names, sub-code codes/labels, or person/member names, which are
interpolated raw into `innerHTML` in ~40 places. Note also that `escHtml()`
(`index.html:16537`) escapes only `& < > "` — it does **not** escape single quote (`'`)
or backtick, so it is safe for HTML body and double-quoted attributes but not for
single-quoted attributes or as a JS-string escaper. Combined with the lack of Subresource
Integrity on CDN scripts and an API key that is synced to the cloud and written into
exported backups, the notable findings are below, most severe first.

---

## Findings

### 1. Stored XSS via unescaped project labels / billing codes / names — Medium

`escHtml()` protects task names and notes, but project metadata is rendered raw. Examples:

- `index.html:6268` — `<span class="task-category">${projLabel(task.project)}</span>`
- `index.html:6265`, `6286`, `6329`, `10572`, `10582`, `10683` — `title="${projLabel(...)}"`
- `index.html:5766`, `8519`, `8601`, `8618`, `14429`, `14439`, `14481`, `14509`, `16048` — `${proj.label}` / `${proj.billingCode}`
- `index.html:7458`, `7461`, `7506`, `7509`, `7582`, `7614` — `${proj.name}`
- `index.html:9199`, `9208`, `9217` — `${projLabel(item.project)}` in the team board
- `index.html:13982`, `13992` — project labels inlined into `onclick="..."` in the duplicate-merge UI

`projLabel()` / `projColor()` (`index.html:5709-5710`) return the stored value verbatim.

The same raw-render pattern extends to other metadata fields (escaping is applied
inconsistently — often escaped in one render path and raw in another):

- **Billing codes:** `index.html:11976` (Capacity), `14439` (Allocations).
- **Sub-code `code` / `label`:** `index.html:8107` (`sc.code` raw while `sc.label` is
  escaped on the same line), `12879` (`s.label` raw — contrast `13008`, which escapes it).
- **Person / member names:** `index.html:9980` (owner pills, `${m}`), `15387` (project
  member chip), `15182` (assign dropdown visible span — the `onclick` arg is quote-escaped
  but the displayed name is not).

**Why it's reachable from untrusted input:** the allocations Excel import auto-creates
projects with `label: jobLabel || billingCode` taken straight from spreadsheet cells
(`index.html:12577-12583`), with no sanitization of the stored label. A crafted `.xlsx`
whose job-name cell is `<img src=x onerror=…>` (or a label containing `">` to break out
of a `title="…"` attribute) is stored as a project label and executes on the next render.
Manual project entry (`index.html:16063-16071`) is the same sink but self-authored.

**Impact:** script runs in the app origin, where it can read the Supabase session token
and the Anthropic API key from `localStorage` (see Finding 3) and exfiltrate them.

**Fix:** wrap every project label / billing code / name interpolation in `escHtml()`, the
same way task names already are. For `style="background:${proj.color}"` and the
`onclick="...${label}..."` cases, escaping the label is still required; prefer building
those nodes with `textContent`/`dataset` + event listeners rather than inlining values
into an `onclick` string.

### 2. No Subresource Integrity (SRI) on third-party CDN scripts — Medium

`index.html:2732` and `2734` load `@supabase/supabase-js@2` and `xlsx@0.18.5` from
jsDelivr with no `integrity=` or `crossorigin=` attribute (grep for `integrity=` returns
0 matches). The `@2` tag also floats to whatever the CDN currently serves.

**Impact:** a CDN compromise or a malicious `@2` publish executes arbitrary JS with full
access to the Supabase session and the stored API key — full account takeover. This is the
highest-impact single point of failure because it needs no user action.

**Fix:** pin exact versions and add `integrity="sha384-…"` + `crossorigin="anonymous"` to
both `<script>` tags. Regenerate the hashes whenever the pinned version changes.

### 3. Anthropic API key synced to cloud and written into plaintext backups — Low/Medium

`wt_api_key` is stored in `localStorage`, is listed in `SYNC_KEYS`
(`index.html:4456`), so `save()` pushes it to the Supabase `user_data` table via
`cloudSave()`, and it is included verbatim in the JSON produced by `exportBackup()`
(`index.html:4257-4276`, which iterates `SYNC_KEYS`).

**Impact:** the secret leaves the device by two paths the user may not expect — anyone
handed a backup file, or with read access to that Supabase row, gets the key. RLS protects
the row from *other* users, but the export path has no such guard.

**Fix:** exclude `wt_api_key` from `SYNC_KEYS`/backup export (keep it device-local), or at
minimum warn in the backup UI that the file contains a secret. If cloud sync of the key is
intended, document it explicitly.

### 4. Minor unescaped self-authored sinks — Low

`_currentUser.user_metadata.display_name` is interpolated raw into `innerHTML` at
`index.html:16205`. The value is the user's own signup name, so this is self-XSS only, but
it should use `escHtml()` for consistency. The disabled Brain Dump review modal
(`renderReviewContent`, `index.html:16469+`) would render AI/spreadsheet-derived task
fields into `innerHTML`; it is currently unreachable (`submitBrainDump` early-returns at
`index.html:16322-16325`), but should be escaped before the feature is re-enabled.

### 5. Attribute-breakout / CSS injection via unescaped color in `style` — Informational

`style="background:${proj.color}"` (e.g. `index.html:6265`, `9200`, `11850`, `14439`),
`value="${proj.color}"` (`index.html:15987`), and `delegateTagsHtml` (`index.html:5742`)
inline color values without escaping. Because these are double-quoted attributes and the
color is not run through `escHtml`, a stored color value containing a `"` (e.g.
`red" onmouseover="alert(1)`) would break out of the attribute and inject a new event
handler — a stronger vector than pure CSS injection. Colors normally come from a
constrained color picker or a fixed palette on import, so exploitability is low, but the
value should be validated as `#rrggbb` (or emitted via `dataset` + CSS).

Similarly, date operands in single-quoted `onclick` JS-strings — e.g.
`openRescheduleModal('${task.id}','${item._occurrenceDate || task.due}')`
(`index.html:6267`, `6270`, `6291`, `6314`) — are unescaped. IDs are `uid()` (alphanumeric,
safe), but a crafted/imported date string could break out of the single-quoted JS string.
Low exploitability under normal UI, but worth constraining if dates ever become free-text.

---

## What was checked and looks correct

- **RLS model** (`index.html:4092-4132`): `user_data` and `profiles` enable RLS with
  per-user `auth.uid() = user_id` policies for select/insert/update/delete. Data is
  correctly isolated between accounts.
- **Anon key embedding** (`index.html:4135-4136`): the baked-in Supabase anon key is a
  public key and is safe to ship as long as RLS is enforced (it is). No `service_role`
  key or other high-privilege secret is present in the source.
- **Escaping of primary user text**: task/session/subtask names, `notes`, and `waiting`
  fields are consistently passed through `escHtml()`.
- **No dangerous eval sinks**: no `eval(`, `new Function(`, or `javascript:` usage. The
  two `.outerHTML` reads (`index.html:9269`, `9278`) are reads for string assembly, not
  sinks for untrusted markup beyond the label issue in Finding 1.
- **Passwords** are read from the auth form and passed to Supabase; they are never stored
  locally.

## Recommended priority

1. Add SRI + version pinning to the two CDN scripts (Finding 2) — highest impact, small change.
2. Escape project labels / billing codes / names everywhere they hit `innerHTML` (Finding 1).
3. Keep `wt_api_key` out of cloud sync and backup export, or warn about it (Finding 3).
4. Escape the remaining self-authored sinks and validate color values (Findings 4–5).
