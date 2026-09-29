# StudyForge design system: chalkboard and highlighter

StudyForge is for university students revising from their own lecture notes. The look borrows from
the two things every student revises with: a dark chalkboard and a yellow highlighter. The chalkboard
is the calm background everything sits on; the highlighter only appears where something is being
*pointed at*, exactly as it would in a paper notebook.

Tokens live in `src/styles/tokens.css`. Nothing else in the CSS should hard-code a colour, size or radius
(the few exceptions are commented where they appear).

## Colour

| Token | Value | Use |
|---|---|---|
| `--slate` | `#1A2320` | Page background. Green-black like a chalkboard, not neutral grey. |
| `--slate-raised` | `#24302B` | Panels and surfaces that hold work (Studio panels, the notes page, the drawer). |
| `--slate-high` | `#2E3B35` | Hover states and input fields. |
| `--slate-deep` | `#141B18` | Recessed areas: code, the drop zone, margin notes. |
| `--line` / `--line-strong` | chalk at 10% / 20% | Hairline borders and dividers. |
| `--chalk` | `#ECE9DF` | Primary text. |
| `--chalk-dim` | `#9DA69D` | Secondary text. Contrast: 6.4:1 on slate, 5.5:1 on slate-raised, 4.7:1 on slate-high (all pass WCAG AA). |
| `--highlighter` | `#F4D35E` | Highlight meaning only (see below). |
| `--violet` / `--violet-deep` | `#9B8AFB` / `#8E7CF6` | Primary actions and the active nav item. Dark text on violet: 5.7:1 (4.9:1 on hover). |
| `--paper` / `--ink` / `--ink-dim` | `#F1ECDD` / `#1A2320` / `#4E5852` | The page of an exercise book. Used where the student's own notes are shown: the landing notes page, the "how it works" band, the citation margin note. `--paper-rule` is the red margin line, `--paper-lines` the faint ruling. |
| `--goal-understand` / `--goal-practise` / `--goal-revise` / `--goal-listen` | sky `#8DB7E0` / coral `#F09B7C` / rose `#E39BB6` / mint `#7FD1A1` | One colour per study goal, wherever the four format groups appear (landing demo and Studio): a dot beside the group name, a rule down the group's list, and the top edge of the panel showing the result. Colour here carries one meaning: which goal a format serves. |
| `--success` | `#7FD1A1` | Correct answers, finished processing steps, "server online". |
| `--danger` | `#F08A7E` | Errors, wrong answers, delete on hover. |
| `--warning` | = highlighter | "AI key missing". |

### The highlighter rule

Yellow is never decoration. It is used for exactly these things:

- citation marks in chat answers (`S1`), as a small solid mark with dark text;
- the cited passage in the source reader, marked line by line with dark text;
- the format that is currently selected (a marker stroke behind its name);
- the one sentence swiped on the landing page, and the passage in the landing margin note;
- text selection (`::selection`) and keyboard focus inside reading content.

It is drawn like a real marker: either a stroke across the lower part of the text
(`--swipe`, a hard-stop gradient) or a solid block with `--ink` text. It is never a button colour, a
border, or a divider.

### The violet rule

Violet means "this does something": primary buttons, the active nav tab. Secondary actions are outlined
(`.btn-secondary`) or quiet text buttons (`.btn-quiet`) so each screen has one obvious next step.

## Typography

- **Bricolage Grotesque** (variable: `opsz` 12–96, `wdth` 75–100, weights 400–800) for the interface and
  all headings. The hero headline uses the top of the optical-size axis and a slightly condensed width.
- **Literata** (variable: 400–600 with italics) for everything the student *reads*: generated outputs,
  chat answers, source passages, the landing notes paragraph. Any element inside `.reading` gets it.
- Monospace only for code and the Mermaid source.

Type scale (ratio 1.25): 13 / 15 / 17 / 21 / 26 / 33 / 41 / 52 / 65 px, as `--text-xs` … `--text-5xl`.
UI body text is 15 px at line-height 1.55; reading text is 17 px at 1.65, with lines capped at 72ch.
Headings use sentence case and tight tracking. The hero headline is
`clamp(2.6rem, 6vw, 4.6rem)`, left-aligned.

## Shape and depth

Radii follow hierarchy instead of one value everywhere:

- 4 px: small controls (buttons, inputs, tags, quiz options, index cards);
- 10 px: panels (Studio panels, drawer, modal, demo output);
- notebook covers: square on the spine edge, 10 px on the free edge, like a bound exercise book.

Only floating things (modal, drawer, toast) get a shadow. The workspace side columns sit flat on the
slate, separated by hairlines; the Studio's panels are raised because that's where the work happens.
Generated output reads directly on the page. No glass, no blur, no gradient washes.

## The landing page: bands

The landing page is a sequence of full-width bands, each on its own surface, so the eye can tell
sections apart without dividers or cards:

1. chalkboard hero, with the notes page laid on it as cream paper (tilted one degree, like a page on a desk);
2. chalkboard "sixteen ways to study", where the four goal colours appear;
3. paper "how it works" (dark ink on cream, ruled lines);
4. raised slate "answers that show their page", with the margin note on paper;
5. chalkboard call to action;
6. deep slate footer with three link columns.

The header is sticky with links to the public pages; the same links repeat in the footer, so on phones the
header links can be hidden.

## Public pages: no dead ends

Every link in the header and footer goes to a real page, all framed by the same header and footer
(`src/landing/PublicPage.jsx`):

| Page | What it is for |
|---|---|
| `/formats` | all sixteen formats by goal, each with a description, how it reads the notes, and a live sample |
| `/how-it-works` | the pipeline from upload to cited answer, numbered because it is a sequence |
| `/about` | how it is built, what each technology does here, the measured search results, history, author |
| `/api` | the endpoints in plain words, with a button to the server's interactive reference |
| `/privacy` | where notes are stored, what is sent to Google, what is never done |
| anything else | a "no page here" page with links onward |

Prose pages use a 68ch measure; the formats and API pages are wide. Section headings carry
`scroll-margin-top` so `#anchors` land below the sticky header.

## Signature pieces

- **Exercise-book covers** (notebooks page): coloured spine from a muted palette
  (`SPINE_COLORS` in `src/lib/format.js`), picked by hashing the notebook id so it never changes, with
  a dashed stitch line.
- **Index cards** (flashcards): chalk-coloured paper with dark Literata text; the back is ruled.
- **Margin notes**: a left rule on a recessed background, for "Check yourself" and citation previews.
- **Notes page** (landing): an exercise-book page with a ruled margin that holds the page label.

## Motion

One orchestrated moment: on the landing page the highlighter swipes across one sentence (700 ms after
a 400 ms pause), then the format demo shows its first sample. `box-decoration-break: slice` makes the
stroke travel line by line.

Everything else moves only in response to the user: the flashcard flip, the drawer sliding in, a
toast appearing. `prefers-reduced-motion` turns all of it off (the highlight is simply drawn).

## Interaction and writing rules

- Visible keyboard focus everywhere (`:focus-visible`, violet; highlighter inside reading content).
- Responsive down to 360 px wide with no horizontal scroll; the workspace turns into tabs below 1100 px.
- Sentence case everywhere. No all-caps labels above headings, no "A · B · C" meta strings, no arrows
  appended to button text, no single accented word in a headline.
- Buttons say exactly what they do: "Upload files", "Generate quiz", "Ask", "Retry the ones I missed".
- Errors say what happened and how to fix it. Empty states invite the next action.
- Right and wrong answers are shown with words ("Correct answer", "Your answer") as well as colour.

## Files

| File | What |
|---|---|
| `src/styles/tokens.css` | all tokens |
| `src/styles/base.css` | reset, type, focus, buttons, inputs, disclosure |
| `src/styles/app.css` | top bar, notebooks shelf, auth, modal, toasts |
| `src/styles/workspace.css` | Sources / Studio / Chat, source reader drawer, debugger |
| `src/styles/outputs.css` | the 16 output renderers |
| `src/styles/landing.css` | landing page and the highlighter swipe |
