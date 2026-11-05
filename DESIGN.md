---
name: Wind + Solar Site Viability Estimator
description: A location in, an honest site report out.
colors:
  grid-blue: "#0b2fbf"
  night-grid-blue: "#071f80"
  signal-green: "#5fd13a"
  wind-series: "#1f77b4"
  solar-series: "#f2a900"
  solar-ink: "#8a6100"
  load-series: "#444444"
  reference-grey: "#9aa3b5"
  good: "#2e7d32"
  good-wash: "#e4f3e5"
  good-ink: "#1d5520"
  warn: "#a35c00"
  warn-wash: "#fdf1df"
  warn-line: "#f0d2a6"
  warn-ink: "#6b3d00"
  bad: "#c62828"
  bad-wash: "#fde8e8"
  bad-line: "#f3c0c0"
  bad-ink: "#8e1b1b"
  info-wash: "#e6ecfb"
  paper: "#f3f5fa"
  surface: "#ffffff"
  hairline: "#dce1ec"
  hairline-strong: "#c3cadb"
  chart-grid: "#e6e9f2"
  ink: "#172033"
  muted-ink: "#556074"
typography:
  display:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 700
    lineHeight: 1.15
  figure:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 700
    lineHeight: 1.2
    fontFeature: "'tnum' 1"
  headline:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 700
    lineHeight: 1.25
  title:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.25
  stat:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 650
    lineHeight: 1.3
    fontFeature: "'tnum' 1"
  prose:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.45
  body:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.45
  group-heading:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 650
    lineHeight: 1.45
  label:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.45
  button:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 600
    lineHeight: 1.45
  caption:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.45
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  sm: "6px"
  md: "10px"
  pill: "99px"
spacing:
  s1: "4px"
  s2: "8px"
  s3: "12px"
  s4: "16px"
  s5: "24px"
  s6: "32px"
  s7: "48px"
components:
  app-bar:
    backgroundColor: "{colors.night-grid-blue}"
    textColor: "{colors.surface}"
    padding: "12px 24px"
  button-primary:
    backgroundColor: "{colors.grid-blue}"
    textColor: "{colors.surface}"
    typography: "{typography.button}"
    rounded: "{rounded.sm}"
    padding: "7px 14px"
  button-primary-hover:
    backgroundColor: "{colors.night-grid-blue}"
    textColor: "{colors.surface}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.grid-blue}"
    typography: "{typography.button}"
    rounded: "{rounded.sm}"
    padding: "7px 14px"
  button-on-dark:
    textColor: "{colors.surface}"
    typography: "{typography.button}"
    rounded: "{rounded.sm}"
    padding: "7px 14px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "7px 9px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "{spacing.s4}"
  summary:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "{spacing.s5}"
  tag-good:
    backgroundColor: "{colors.good-wash}"
    textColor: "{colors.good-ink}"
    rounded: "{rounded.pill}"
    padding: "6px 10px"
  tag-warn:
    backgroundColor: "{colors.warn-wash}"
    textColor: "{colors.warn-ink}"
    rounded: "{rounded.pill}"
    padding: "6px 10px"
  tag-bad:
    backgroundColor: "{colors.bad-wash}"
    textColor: "{colors.bad-ink}"
    rounded: "{rounded.pill}"
    padding: "6px 10px"
  note-warn:
    backgroundColor: "{colors.warn-wash}"
    textColor: "{colors.warn-ink}"
    rounded: "{rounded.sm}"
    padding: "12px 16px"
  note-bad:
    backgroundColor: "{colors.bad-wash}"
    textColor: "{colors.bad-ink}"
    rounded: "{rounded.sm}"
    padding: "12px 16px"
  status:
    backgroundColor: "{colors.info-wash}"
    textColor: "{colors.night-grid-blue}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
---

# Design System: Wind + Solar Site Viability Estimator

## Overview

**Creative North Star: "The Field Report"**

The interface reads like a trustworthy engineering site report that a salesperson can hand straight to a customer. It is calm, credible and plain-spoken: a white page on a cool paper ground, hairline rules, a single confident blue for action and identity, and colour otherwise spent only on meaning (wind, solar, good, caution, problem). Numbers are the heroes; they are set large, bold and in tabular figures, and every claim sits next to the caveat that qualifies it.

Density is that of a working document, not a dashboard. The sidebar holds the inputs as a quiet form; the report column leads with the verdict and four key figures, then shows only what wind adds through the year. Everything else (diagnostics, monthly table) waits behind a disclosure, and the assumptions close the report. Print is a first-class output: the same report has to stand on paper without the app around it.

The system explicitly rejects two neighbours: clean-tech marketing gloss (gradient heroes, glassy cards, stock turbine photography) and dense trading-terminal dashboards (dark mode, neon accents, tiny type).

**Key Characteristics:**
- White report surfaces on a cool, blue-tinted paper ground; flat, with hairline borders.
- One brand blue for action and identity; green appears only in the wordmark.
- Semantic colour is reserved: wind blue, solar amber, and good / caution / problem states.
- Big tabular numbers; plain sentence-case headings; no decorative imagery.
- Prints as a clean, single-colour-accented report.

## Colors

A restrained, cool palette: one saturated brand blue, a deep blue for the app bar, a sharp green used sparingly, and data and state colours that each mean exactly one thing.

### Primary
- **Grid Blue** (`grid-blue`): primary buttons, links, focus rings, checkbox and radio accents, the progress bar, and hover state on secondary controls. The colour of "do this".
- **Night Grid Blue** (`night-grid-blue`): the app bar (as the deep end of a slim horizontal blend into Grid Blue), primary hover, the empty-state headline and sidebar group headings.

### Secondary
- **Signal Green** (`signal-green`): the "Wind + Solar" wordmark on the app bar only. On print it becomes Grid Blue.

### Tertiary: data series
- **Wind Blue** (`wind-series`): everything that is wind energy in charts, and the wind energy key figure.
- **Solar Amber** (`solar-series`): solar energy in charts. On light backgrounds, solar-coloured text uses **Solar Ink** (`solar-ink`) for contrast.
- **Load Graphite** (`load-series`): electricity use lines.
- **Reference Grey** (`reference-grey`): comparison series ("without wind").
- **Problem Red** (`bad`) doubles as the physical (Betz) limit line in the power curve chart.

### State
Each state has a solid tone, a wash for backgrounds, a line for borders and an ink for text on the wash.
- **Good** (`good`, `good-wash`, `good-ink`): viable verdict tag.
- **Caution** (`warn`, `warn-wash`, `warn-line`, `warn-ink`): marginal verdicts, notes and stale-result status.
- **Problem** (`bad`, `bad-wash`, `bad-line`, `bad-ink`): not-viable or unverified verdicts, physics warnings, invalid fields, error status.
- **Info Wash** (`info-wash`): neutral progress status while weather downloads, and the note naming the station whose measured wind is in use.

### Neutral
- **Field Paper** (`paper`): page background and the panel's note strip; tinted toward the brand blue.
- **Surface White** (`surface`): sidebar panel, summary, cards, inputs.
- **Hairline** (`hairline`): card borders, section dividers, table rules. **Hairline Strong** (`hairline-strong`): input borders, table totals.
- **Chart Grid** (`chart-grid`): chart gridlines.
- **Report Ink** (`ink`): body text. **Muted Ink** (`muted-ink`): labels, hints, units, secondary lines and chart tick labels.

### Named Rules
**The Meaning-Only Colour Rule.** Outside Grid Blue for action, colour always encodes something: wind, solar, use, or a state. Never colour a surface or heading for decoration.

**The One Wind Blue Rule.** Wind is always `wind-series` and solar always `solar-series`, in every chart, figure and legend, so a reader learns the code once.

## Typography

**Display Font:** system-ui (with -apple-system, Segoe UI, Roboto, sans-serif)
**Body Font:** the same system stack
**Label/Mono Font:** ui-monospace (SFMono-Regular, Menlo) for power curve and profile text areas only

**Character:** the platform's own sans, so the tool feels native and fast on any machine and prints crisply; hierarchy comes from size and weight, not from a display face.

### Hierarchy
- **Display** (700, 1.75rem, 1.15): report title (site name) and the empty-state headline.
- **Figure** (700, 1.75rem, 1.2, tabular): the four key figures under the verdict. Units sit beside them at label size in Muted Ink.
- **Headline** (700, 1.375rem, 1.25): the verdict sentence, led by its status tag.
- **Title** (700, 1.25rem, 1.25): report section headings ("Through the year", "Behind the numbers").
- **Stat** (650, 1.125rem, tabular): secondary statistics in section stat rows.
- **Prose** (400, 1rem, 1.45): verdict explanation and empty-state copy; max 68–72ch.
- **Body** (400, 0.9375rem, 1.45): default text, inputs, tables, notes, card captions (captions at 600).
- **Group heading** (650, 0.9375rem): sidebar section headings in Night Grid Blue. Deliberately small; the sidebar is subordinate to the report.
- **Label** (400, 0.8125rem): field labels, hints, figure and stat terms, units; Muted Ink.
- **Button** (600, 0.8125rem).
- **Caption** (400, 0.75rem): footer, panel note, stat sub-lines, small buttons.

### Named Rules
**The Tabular Numbers Rule.** Every number a reader might compare (figures, stats, tables, inputs) uses tabular figures, so columns and changing values never jitter.

**The Plain Heading Rule.** Headings are sentence case, never uppercase or letter-spaced, and say what the reader will find ("Monthly figures", not "Data").

## Layout

A two-column working layout: a fixed-width input panel (300–360px) beside a fluid report column, with 24px gutters and page padding. On wide screens the panel is sticky and scrolls independently. At 960px and below it collapses to one column with 12px padding: the explanation leads before the first report, then the panel comes first and a finished analysis scrolls the report into view; at 600px the header actions span the width and the key figures drop to two columns.

Spacing follows a 4px base (`s1`–`s7`: 4, 8, 12, 16, 24, 32, 48). Inside the report, major sections are separated by 24px, items within a section by 12px, and cards and charts sit in an auto-fill grid with a 26rem minimum track and 16px gaps. Long text is capped at 68–72ch.

The report reads top-down in a fixed order: report header, summary (verdict + key figures; a supporting sentence only when the verdict needs one), notes, "What the result hinges on" (payback if the wind at the turbine is 30% weaker to 30% stronger than the data; payback for other turbine counts and hub heights; and, once compared, payback with each nearby station's wind), "Through the year" (monthly energy and grid purchases), then two closed disclosures, "Behind the numbers" (supporting stats and four diagnostic charts; opened automatically when the power curve fails the physics check) and "Monthly figures" (table + CSV), then "Assumptions and data". Nothing is repeated: a value shown in the summary or the assumptions doesn't reappear in the stats. For print the panel, header actions, intro and status disappear, every disclosure opens, the app bar becomes a blue rule, and charts sit two per row.

## Elevation & Depth

Flat by default. Depth comes from tone (white surfaces on Field Paper) and hairline borders, never from drop shadows at rest. The only glow is the focus ring. A soft shadow is allowed for things that genuinely float over content (menus, popovers, dropdown results), and nothing else.

### Shadow Vocabulary
- **Focus ring** (`box-shadow: 0 0 0 3px rgba(11, 47, 191, 0.35)`): keyboard focus on buttons and fields; on the app bar, a white ring (`0 0 0 3px rgba(255, 255, 255, 0.6)`).
- **Floating** (`box-shadow: 0 8px 24px rgba(23, 32, 51, 0.12)`): reserved for floating layers; not yet used in the current build.

### Named Rules
**The Flat Paper Rule.** Surfaces sit flat on the page. If something needs to stand out, give it position, size or a semantic wash, not a shadow.

## Shapes

Gently rounded, consistent corners: 10px for surfaces (panel, summary, cards, status) and 6px for controls (buttons, inputs, notes, map). Pills (fully round) are reserved for status tags and the "Prototype" badge. Borders are 1px hairlines; the only heavier rule is the 2px line above table totals (and the print header).

## Components

Quiet and exact: small radii, hairlines, colour reserved for meaning.

### Buttons
- **Shape:** gently rounded (6px), 600 weight at label size.
- **Primary:** Grid Blue fill, white text. Full-width and slightly taller in the sidebar form ("Analyse this site"). Hover deepens to Night Grid Blue. While working, it shows progress in its label ("Loading weather… 3 of 20") and a progress cursor.
- **Confirmation:** buttons whose result isn't otherwise visible briefly relabel themselves ("Link copied", "Cache cleared") for two seconds.
- **Secondary:** white with Grid Blue text and a strong hairline; hover turns the border Grid Blue on a faint blue tint. Used for Find, Download CSV, Clear cache.
- **On dark:** transparent with a translucent white outline on the app bar (Copy link, Print report); hover adds a faint white wash. Disabled until a report exists.
- **Link button:** inline underlined Grid Blue text for minor actions ("Restore default").
- **Focus:** the focus ring above; transitions 150ms ease-out on colour and border only.

### Chips
- **Status tag:** pill, bold label-size text, state wash with state ink (good / caution / problem). Leads the verdict headline, inline before the sentence: "Promising", "Marginal", "Weak", "Not viable", "Unverified".

### Cards / Containers
- **Corner Style:** 10px.
- **Background:** Surface White on Field Paper.
- **Shadow Strategy:** none (see Elevation).
- **Border:** 1px Hairline.
- **Internal Padding:** 16px for chart and table cards; 24px for the summary.
- Chart cards carry a 600-weight caption that states what the chart shows, above a 260px chart (210px in print).

### Inputs / Fields
- **Style:** white, 1px Hairline Strong border, 6px corners, body size, tabular numbers; labels sit above in Muted Ink. Text areas for curves and profiles use the mono face.
- **Hover:** border darkens slightly.
- **Focus:** border turns Grid Blue with the focus ring.
- **Error:** Problem Red border on the Problem Wash, marked `aria-invalid`. The message (label size, 600, Problem Ink) appears directly under the field or field row at fault, or under the Analyse button for non-field errors; on submit the field's group opens and the field takes focus.
- **Disabled:** 50% opacity, not-allowed cursor.

### Sensitivity (What the result hinges on)
A card under the notes that turns the wind-data caveat into its consequence. A sentence in prose size (which carries the point on paper) gives the payback with the wind 20% weaker and 20% stronger than the data; under it, a line chart of simple payback against wind from −30% to +30%, in Wind Blue, the "as the data" point larger. Behind the line, the verdict's bands as washes (good up to 10 years, caution to 20, problem beyond), each named in its ink at the right edge. It is worked out after a 300 ms pause, one extra run per task, so typing and dragging stay quick; while it is being worked out again the previous card stays, faded to 50%.

A second card, **other setups**, does the same for the choice being made: payback against hub height (8 to 30 m, plus the entered height) with one line per turbine count (1 to 4, plus the entered count), in Wind Blue getting lighter for each further turbine; the entered count's line is thicker and the entered setup's point larger. Its sentence names the setup that pays back soonest and says that every height is costed the same, so the taller options read as optimistic. Clicking a point tries that setup (the form, the header's draggable numbers and the share link follow); a screen-only hint says so. Points at the plot's left and right edges show whole.

### Station comparison
Which station's wind to trust can move the payback more than any other choice, so the tool can show it. Under the "Wind data" picker, once there is a report, a secondary small button offers to compare the nearby stations with records for the period, with a hint that records not kept yet are downloaded first. While it runs the button reads "Comparing the stations… 5 of 16". When it's done:
- **Map:** each station's payback sits beside its pin ("19 yr", "never") in a small white tag, its text in the ink of the verdict band it falls in.
- **Picker:** each option ends with "· pays back in about 19 years", the weather model's too.
- **Report:** a third card in "What the result hinges on", a horizontal bar per source (the weather model first, then stations by distance) over the verdict bands, named above the plot; the source in use in Wind Blue, the others in a pale blue. Its sentence gives the payback in use and the range across the other sources, and says that the station whose exposure matches the site matters more than the nearest. Stations listed twice under one name show their years. Clicking a bar uses that source.

Stations download one at a time, a station's years a few at a time, and are kept like any station's records; the paybacks are worked out again (one run per task, after the pause) whenever the inputs change.

### Draggable numbers
Assumptions that appear in the report are controls where they stand, so the reader changes the system without leaving the result: the report header's turbines, hub height, solar size, battery and grid price, and the per-turbine installed cost under the payback figure.
- **Look:** the number in Grid Blue (the action colour) with a dashed underline in the same colour, tabular figures, never wrapping; hover and drag add the Info Wash behind it. The cursor is a horizontal resize arrow, held across the page during a drag.
- **Behaviour:** drag sideways to step the value (each field has its own step, bounds and pixels per step); the report recomputes on every step, not after a pause, so figures, verdict and charts move with the pointer. The sidebar field follows, and so does the share link.
- **Keyboard:** each number is an ARIA slider and a tab stop with the focus ring; arrows step it (Shift or Page Up/Down: ten steps), Home and End go to its bounds. Focus stays on the number through the re-render.
- **Print:** plain text in the surrounding colour, no underline.

### Power curve editor
The power curve is edited where it can be seen: a 200px chart at the top of the Wind turbines group, above the curve's text area. It plots the curve in Wind Blue with draggable points (white-ringed, 4px, 6px when active) against the physical (Betz) limit for the capture area, a Problem Red dashed line with the region above it in Problem Wash and labelled "Beyond the physical limit" in Problem Ink. A point above the limit turns Problem Red.
- **Direct manipulation:** drag a point to change its output (snapped to about 1/400 of the axis); it moves sideways in 0.5 km/h steps only after a few pixels of sideways travel, so an up-or-down drag keeps its speed, and never past its neighbours. Double-click adds a point, or removes the one under the pointer. The axes hold still during a drag and refit when it ends.
- **Readout:** one line under the chart (label size, Muted Ink, tabular figures, height reserved so nothing jumps) names the point under the pointer: speed, output and its share of the physical limit, or how many times over it. At rest it says how to edit.
- **Keyboard:** the chart is a tab stop with the focus ring; Left and Right pick a point, Up and Down change its output (Shift for ten steps), Delete removes it.
- **One source of truth:** the editor writes the text area and the text area redraws the editor, as do the capture area and duct augmentation. While the text can't be read the chart fades to 40% and the readout says what's wrong.

### Navigation
- **App bar:** slim, Night Grid Blue blending to Grid Blue left to right; the wordmark in Signal Green (800 weight), the product title in white, a "Prototype" pill badge, and on-dark buttons pushed right. On small screens the buttons wrap below and share the width.
- **Sidebar groups:** each assumption group is a disclosure with a small chevron and a Night Grid Blue heading that turns Grid Blue on hover; groups are separated by hairlines. The Site group is always open and holds search, map, coordinates and the Wind data picker (weather model or a nearby measured station, with a one-line hint saying which is in use). Stations show on the map as small hollow circles; the one in use is filled Wind Blue. The picker is the keyboard route; the pins aren't tab stops. Disclosure rows are at least 44px tall.

### Summary (signature)
The report's first surface: the verdict headline with its status tag, one or two sentences of plain explanation (second in Muted Ink), then a hairline and four key figures in an auto-fit grid. Wind energy is set in Wind Blue; the others in Report Ink. Each figure has a term above and a short qualifier below.

### Notes
Caveats that change how to read the result, shown directly under the summary as a list of washed boxes (caution or problem), max 72ch, with the first phrase bolded. No side stripe. A neutral note (Info Wash, Night Grid Blue ink, Hairline Strong border) states where measured station wind came from; it still carries its caveat.

### Stat rows
Definition list of supporting statistics at the top of "Behind the numbers": Muted Ink term, Stat-size value, optional caption sub-line.

## Do's and Don'ts

### Do:
- **Do** keep Grid Blue (`#0b2fbf`) as the only action colour and Signal Green to the wordmark.
- **Do** use `wind-series` for wind and `solar-series` for solar everywhere, and Reference Grey for "without wind" comparisons.
- **Do** set comparable numbers in tabular figures, with units in Muted Ink at label size.
- **Do** put caveats next to the numbers they qualify, in caution or problem washes.
- **Do** check every new view in print: it must still read as a report on white paper.
- **Do** use the 4px spacing scale and the 6px / 10px / pill radii only.

### Don't:
- **Don't** use clean-tech marketing gloss: gradient heroes, glassy or blurred cards, stock turbine or solar photography.
- **Don't** drift toward trading-terminal dashboards: dark mode, neon accents, tiny dense type.
- **Don't** add drop shadows to cards or panels at rest; shadows are for floating layers only.
- **Don't** use colour for decoration, or a state colour for anything but its state.
- **Don't** use coloured side stripes on notes or cards; use the full wash.
- **Don't** uppercase or letter-space headings and labels.
