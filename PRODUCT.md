# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two audiences, served by one tool:

- **Public, vendor-neutral users:** anyone weighing small wind turbines alongside solar and a battery for a specific site. They enter coordinates and want to know whether wind is worth adding there.
- **First real user: a small-turbine startup's sales team.** The company is pre-seed, building its first units in Alberta for deployment by spring 2027. Its first targets are commercial greenhouses and sites that already have solar. Salespeople need a quick, defensible site analysis from nothing more than a location, replacing a slow manual Python workflow. The company is deliberately not named anywhere in this project.

## Product Purpose

Turn a pair of coordinates into a site-specific estimate of what small wind turbines would add to a solar + battery system: energy, grid purchases avoided, savings and payback, with the hourly weather evidence behind them. Success means a salesperson or site owner gets a credible, honest first answer in a minute or two instead of days of analysis, and knows how far to trust it.

## Positioning

_Inferred from the current build; confirm or correct._

- Simulates every hour of up to ~20 years of reanalysis weather for any location on Earth, entirely in the browser, with no account or install.
- Judges wind by its increment over solar + battery alone, not in isolation.
- Checks any entered power curve against the physical (Betz) limit for its rotor or intake and says plainly when a curve claims more than the wind can deliver, so an unverified curve can't pass as a result.
- Vendor-neutral: any turbine can be modelled from its power curve.

## Operating Context

- **Both solo and in the room.** A salesperson prepares an analysis alone before a meeting and sends or prints the report, and also runs it live in front of a customer on a laptop or shared screen.
- Reports travel as a shareable link (all assumptions encoded in the URL), a printed or PDF report, and a CSV of monthly figures.
- Weather comes from Open-Meteo's historical API (ERA5 reanalysis, roughly 28 km grid cells). In Canada, wind comes from the nearest Environment Canada station with hourly records when one is close enough, with gaps filled from ERA5. First analysis of a site downloads data for a minute or two; it's cached in the browser afterwards.
- Typical inputs a salesperson changes: location, number of turbines, hub height, power curve, the customer's annual electricity use and profile, battery size, and local prices.

## Capabilities and Constraints

- **Today:** static single-page app, browser-only, no build step and no backend, hosted on GitHub Pages. MIT licensed, public repository.
- **Later:** a backend or paid data sources are acceptable if they earn their place. Not decided yet.
- Open-Meteo's free tier is for non-commercial use; commercial use needs an API key, which the tool accepts and keeps in the browser only (never in shared links).
- Results are indicative, not a bankable energy assessment. Reanalysis wind is uncalibrated unless the user enters a measured site mean or a station is used; station wind is measured at an open site, not at the customer's.
- Terminology in use: power curve, hub height, capacity factor, self-sufficiency, grid purchases, export credit, simple payback, site wind calibration, physical (Betz) limit.

## Brand Commitments

- Product name in use: "Wind + Solar Site Viability Estimator" (short form "Wind + Solar").
- No turbine company or product names in the app, docs or metadata, to avoid trading on or diluting anyone's brand.

## Evidence on Hand

- No independently measured power curve exists yet. The default curve is illustrative (3.5 kW, 6 m rotor, within the Betz limit) and is labelled as such.
- No customers, testimonials, case studies, field measurements or benchmarks. Future work must not invent any.
- `deck.pdf` is the startup's private pitch deck: gitignored, confidential, never to be quoted, published or used as a source of claims.

## Product Principles

1. **Honest before flattering.** A sales tool that tells the truth is the one customers trust; physics checks, calibration warnings and "not viable" verdicts are features, not friction.
2. **Wind is judged by what it adds** to solar and a battery at that site, in energy, grid purchases and money.
3. **A location to a verdict, fast; detail on demand.** The answer comes first, the evidence behind it follows.
4. **The report stands on its own.** A customer reading a shared link or printout without the salesperson should understand the result and its caveats.
5. **Vendor-neutral by construction.** Any turbine, any site, no brand in the way.
