# DEVELOPMENT ONLY: Studbot webcam harness

This folder is separate from `app/`. The API never imports it. The harness is a
temporary local client for camera/calibration checks, not the Studbot website,
study-time accounting, a reward system, or a completed accuracy evaluation.

Running it explicitly opens your webcam. A local preview stays visible; after
you press S, small unmirrored JPEGs go to your local FastAPI service at roughly
one frame per second, with only one request in flight. Images/video are not
saved. Calibration angles stay in memory; labels stay in memory by default.
Opt-in `--evaluate` saves only aggregate labels/counts and versions on exit.
The client disables
environment proxies and redirects and only connects to `127.0.0.1`.

## Run from the repository root in PowerShell

Install the environment if needed: `uv sync --project ml` (includes dev tools).
Fetch the models if needed: `uv run --directory ml python -m app.models.fetch`.

Both terminals must use the **same token**; a newly opened terminal does not
inherit environment variables set inside another terminal.

In terminal 1, create a token. Copy its displayed value locally for terminal 2:

```powershell
$env:ML_INTERNAL_TOKEN = uv run --directory ml python -c "import secrets; print(secrets.token_urlsafe(32))"
$env:ML_INTERNAL_TOKEN
uv run --directory ml uvicorn app.main:app --host 127.0.0.1 --port 8000
```

In terminal 2:

```powershell
uv run --directory ml python -m devtools.webcam
```

If `ML_INTERNAL_TOKEN` is not set in terminal 2, the harness prompts for it with
hidden input. Paste the token from terminal 1 and press Enter. It does not print
the token. If terminal 2 already has a different token, remove that stale value
first with `Remove-Item Env:ML_INTERNAL_TOKEN`, then run the harness again.

The readiness check happens before opening the camera. No frames are uploaded
until you start calibration. An incorrect token produces HTTP 401 on the first
upload and closes the camera; restart with the matching token.

## Controls (click the preview window first)

| Key | Action |
| --- | --- |
| S | Start/restart screen calibration. Face your screen steadily. |
| B | After screen calibration finishes, start book calibration in your normal reading/writing position. |
| R | Clear calibration and stop uploads until S is pressed again. Recalibrate after moving the camera. |
| Q / Esc / close window | Quit and release the camera. |

Each pose needs at least four usable samples spanning five seconds. Unusable
observations or gaps over three seconds restart the current pose's samples.
After both poses are calibrated, the preview shows compatible/away/unknown and
the reason. Missing fresh results show unknown. Model/rule changes or 24 hours
invalidate calibration. Old responses cannot revive a reset calibration.

The preview and transmitted pixels are both unmirrored. Preview text is drawn
on a separate copy and is never uploaded. To select another camera, add
`--camera 1`; for another local service port, use `--port 8001`.

## Checks and limitations

### Basic harness: console and optional audio feedback

The ordinary harness prints status changes to its terminal, including calibration
progress and compatible/away/unknown reasons. You can look away and review those
lines afterward; it does not write a log file. No serial hardware is needed.

For audible feedback on Windows, run the **basic** harness:

```powershell
uv run --directory ml python -m devtools.webcam --audio
```

The tone changes when the classification state changes: **high = compatible**,
**low = away**, **middle = unknown**. Repeated identical states do not beep each
second. Tones run separately from camera/network processing. Turn on your speakers
or headphones. Calibration progress remains in the preview/terminal.

These outputs apply to the basic harness only. Evaluation mode is unchanged and
cannot be combined with `--audio`. The classifier measures head orientation,
not where your eyes are looking. Eye movement alone is not a reliable test.

Try screen reading, downward book reading/writing, turning away, leaving the
chair, covering the camera, poor lighting, and multiple faces. These are manual
observations, not proof of learning or a claimed accuracy percentage. The
quality thresholds and orientation rules still need a declared evaluation set.
The five-second away grace/two-second resume belong to future application time
accounting; this harness displays individual frame results only.

Close other programs using the camera if opening fails. If samples remain
unusable, improve lighting and ensure a single face and shoulders are visible.
The HTTP worker keeps the preview responsive; quitting releases the camera and
waits for at most one outstanding request to finish or hit its network timeout.

Automated tests use synthetic frames, mock HTTP, and fake cameras. They never
open a physical camera. Run: `uv run --directory ml pytest`.

## DEVELOPMENT ONLY: optional labeled evaluation

Start the server normally. In the harness terminal, run:

```powershell
uv run --directory ml python -m devtools.webcam --evaluate
```

Use the same service token as before. Complete screen/book calibration with S
and B first. Evaluation starts **paused** and never scores calibration frames.
Click the preview, choose the scenario you will perform, and assume that
position during the two-second settling period. The extra green preview line
shows the selected scenario and its number of successful predictions.

| Key | Scenario to actually perform | Expected frame label |
| --- | --- | --- |
| 1 | Read your screen in the calibrated position | compatible |
| 2 | Read your book in the calibrated position | compatible |
| 3 | Write in the calibrated notebook area | compatible |
| 4 | Turn your head well outside both calibrated positions | away |
| 5 | Leave the chair and camera view | away |
| 6 | Face the turned-away position of a glance | away |
| 7 | Cover the camera or make the view genuinely unverifiable | unknown |
| 8 | Study facing the screen while wearing glasses | compatible |
| 9 | Have two people with clearly visible faces in the view | unknown |
| 0 | Pause scoring while moving/changing setup | no score |

Aim for at least **10 successful predictions per scenario** (roughly 10 seconds
plus settling, longer if some requests fail). Press 0 before changing posture,
then select the next scenario once ready. Samples captured during settling,
calibration, or paused scoring do not count. Changing the selected label drops
any still-pending result from the old label. Resetting/recalibrating pauses
scoring; choose a scenario again afterward. Model/rule changes stop scoring for
that run so versions are never mixed. Restart the harness for the new version.

For key 6, score only frames where you are actually turned away; press 0 before
looking back. This tests the glance's pose, not its duration. It does not test
the application's five-second grace rule. If you cannot perform a scenario
(for example no glasses or no second participant), skip it; the report will
correctly remain incomplete. Only include people who agree to participate.

Press Q/Esc to quit. In evaluation mode only, an aggregate JSON report is saved
to `ml/devtools/results/evaluation-<UTC time>-<random suffix>.json`. This folder
is ignored by Git. Reports contain expected/predicted label counts per scenario,
a confusion matrix, metrics, model/rule versions, a report timestamp, and stated
limitations. They contain **no images, video, raw landmarks, calibration angles,
credentials, personal identifiers, or individual frame records**. A pending
request at exit is not scored. An interrupted/failed run may save an incomplete
report; no valid scores are invented.

How to read the report:

- `confusion_matrix`: rows are operator-supplied expected labels; columns are
  predicted labels. Off-diagonal counts are errors. Unknown predictions on
  compatible/away scenarios count as misses, not excluded samples.
- `per_class_metrics`: precision describes correctness when predicting a class;
  recall describes how often an expected class was found; F1 combines the two.
- `balanced_accuracy_compatible_away`: average of compatible recall and away
  recall over successful, fresh responses. This gives both classes equal weight.
- `prediction_coverage` and `request_failures`: show how many labeled attempts
  received usable API responses. Transport/timeout failures are separate from
  classifier predictions. `balanced_operational_accuracy_compatible_away` also
  counts failures against the expected compatible/away class.
- `unknown_scenario_accuracy`: measures expected unknown views separately.
- `coverage_complete`: all nine scenarios have at least 10 successful predictions.
- `local_target_met`: complete local coverage and at least 90% compatible/away
  balanced accuracy with unchanged versions. This is **not** a formal pass.

Adjacent frames from one person/session are correlated. Operator labels can be
wrong, and reusing calibration positions does not test generalization. The
report always says `formal_evaluation_status: not_assessed`; it does not finish
T045 or prove population-level accuracy. Formal evaluation still needs a
declared controlled set across people/sessions and separately tested application
accounting. No camera images are retained to build that set automatically.
