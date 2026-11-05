# Wind + Solar Site Viability Estimator (prototype)

A browser-only tool that estimates how small wind turbines would perform alongside
solar PV and a battery at any location. Enter coordinates (or search a place, or click
the map) and it:

1. downloads hourly 10 m and 100 m wind, temperature and sunlight on the panels for
   every hour of up to 40 years (ERA5 reanalysis via [Open-Meteo](https://open-meteo.com/)),
   and for sites in Canada, measured hourly wind from a nearby Environment Canada
   station;
2. simulates every hour: turbine output from the power curve (at hub height, corrected
   for air density), solar output, the site's electricity use, an optional inverter limit
   shared by wind and solar, and the battery, with and without the turbines;
3. reports wind energy, capacity factor, grid purchases, self-sufficiency, savings and
   simple payback, with charts, a monthly table, CSV export and a printable report.

All assumptions are editable and update the results instantly. The URL holds the
inputs, so a link reproduces a report.

## Physical sanity check

The tool compares the power curve with the most any device can physically extract from
the wind passing through its frontal capture area (the Betz limit, optionally with a duct
augmentation factor). The capture area is the device's whole outline as the wind sees it,
entered as a diameter or as width × height: for a scoop or duct that is the full front
opening, not the throat. Internal shapes such as spirals, vanes or torque-multiplying
coils can redirect energy but not add to it, so they aren't modelled; only the measured
power curve and the capture area matter. If a
curve claims more than that, the report is flagged as not credible and shows what the
site would produce with output capped at the limit, so an unverified curve can't quietly
inflate a quote.

The default curve is an illustrative generic 3.5 kW turbine with a 6 m rotor (output from
6 km/h, rated from 30 km/h, within the Betz limit at every speed), not any real product;
replace it with the measured curve of the turbine being sold. The other defaults describe a
small Alberta household system (11,800 kWh/yr; 3 kWp of solar; a 48 kWh battery kept above
50%, 82% round trip; a 6 kW inverter shared by wind and solar; $20,000 installed and $200/yr
maintenance per turbine) at Lethbridge, a windy Chinook city with a long, clean station
record. Share links carry a version, so links made with earlier defaults keep their values.

## Wind data accuracy

ERA5 averages over a ~28 km grid cell. It can understate or overstate wind at a
particular site, sometimes by a large margin: at Claresholm, Alberta (2022–2024) the
station measured a 22% higher mean wind than ERA5 and about 3× the wind energy (mean of
speed³), because ERA5 smooths away gusts.

For sites in Canada the tool therefore looks for Environment and Climate Change Canada
stations with hourly records within 100 km (the station archive behind the Canadian
Centre for Climate Services). By default it uses a station within 50 km with at least
five years of records in the period, preferring one that is both close and at a similar
height and with a record that spans the period: 100 m of elevation difference counts like
10 km of distance (site elevation from Open-Meteo's terrain model), and each year of the
period without records like 2 km. A hilltop station then doesn't stand in for a site on the
plain below, and of several stations in one town the one with the fullest record wins. If that station has wind readings for less than half of the period, the weather
model is used instead. (The station list ignores the archive's "has hourly data" flag,
which is wrong for some long hourly records, such as Stavely AAFC's.) Any station in the
list can be picked under *Wind data*, or on the map.

- **Measured hours** use the station's reading (10 m, a 2-minute mean at the top of the hour).
- **Missing hours** are filled from ERA5 at the site through a seasonal quantile mapping
  fitted on the hours both have, so filled hours follow the station's own spread of wind
  speeds rather than ERA5's smoother one.
- **Hub height** comes from the station's 10 m wind with ERA5's hour-by-hour 10–100 m
  shear exponent.

Three checks say how far a station can be trusted:

- **Station elevation:** a station 150 m or more above or below the site gets a note, since
  hilltop stations read stronger wind than lower ground nearby and valley stations weaker.

- **Station match:** if the station and ERA5 correlate below 0.5 hour by hour, the
  station follows its own local winds (valley or lake breezes) and may not represent
  the site either.
- **Station record:** the ratio of the station's annual mean to ERA5's over the same
  hours cancels windy and calm years, so a step or steady drift in it points to a change
  at the instrument (moved, raised, replaced, or sheltered by growing trees). A change of
  15% or more that stands clear of the year-to-year scatter (t ≥ 3) is flagged; for a
  step the report offers to use only the years after it. On real records this flags
  Claresholm (+63% in 2008) and Salmon Arm (−31% over 2006–2025), but not Calgary,
  Lethbridge, Revelstoke or Vernon.

Stations usually sit in open, flat places such as airports, so a farm with trees or
buildings may see less wind. Elsewhere, enter a measured long-term mean under *Site wind
calibration* where one exists, or compare with the
[Global Wind Atlas](https://globalwindatlas.info/) (250 m resolution).

## Running it

The site is TypeScript in `src/`, bundled by esbuild into a static `dist/` (no backend).
Node 24 or later:

```sh
npm ci
npm run build                  # dist/: index.html plus hashed JS and CSS
python3 -m http.server -d dist 8000   # then open http://localhost:8000
npm run dev                    # rebuild dist/ on every change
```

Checks, all run in CI before every deploy:

```sh
npm run check    # typecheck (tsc), lint (oxlint), format check (oxfmt), tests
npm run fmt      # format src/, tests/ and scripts/
```

Tests run the TypeScript sources directly on Node (`node --test`), no build needed.

## Deploying to GitHub Pages

`.github/workflows/pages.yml` checks, builds and deploys `dist/` on every push to `main`
(*Settings → Pages → Source: GitHub Actions*). Asset file names carry a content hash, so
browsers never mix cached files from different releases.

## Data and licences

- Weather: Open-Meteo historical weather API (ERA5, Copernicus Climate Change Service),
  CC BY 4.0. The free API is for **non-commercial use** and allows roughly 10,000 weighted
  calls a day per IP; 20 years for one site costs about 500. For commercial use, buy an
  Open-Meteo API key and enter it under *Weather data* (it stays in the browser and is
  never put in shared links).
- Station wind: Environment and Climate Change Canada climate archive via the
  [MSC GeoMet API](https://api.weather.gc.ca/), Open Government Licence – Canada. No key needed.
- Downloaded weather, station lists and station readings are cached in the browser
  (IndexedDB), so revisiting a site makes no requests.
- Map: Leaflet with OpenStreetMap tiles. Charts: Chart.js. Both load from CDNs.

## Layout

| Path | Contents |
| --- | --- |
| `index.html` | Page template; the build adds the hashed asset tags |
| `src/main.ts` | Entry point |
| `src/app/` | Defaults, shared state, formatting, DOM helpers, form and URL state, the analysis run |
| `src/ui/` | Map, place search and the station picker |
| `src/report/` | Report rendering: verdict, notes, figures, charts, tables, CSV |
| `src/model/` | Hourly simulation: physics, power curve, load shapes, battery (pure, no DOM) |
| `src/wind/` | Station + ERA5 combination, quantile mapping, record checks, station choice (pure) |
| `src/data/` | Downloads and caching: Open-Meteo weather and elevation, place search, Environment Canada stations |
| `src/styles/` | Styles, one file per concern, imported in order by `style.css` |
| `scripts/build.ts` | esbuild bundle into `dist/` |
| `tests/` | Tests mirroring `src/` (`npm test`) |

## Limitations

Indicative estimates, not a bankable energy assessment. Not modelled: turbulence and
obstacles at the specific site, wake effects between turbines, icing, snow on panels,
downtime, panel degradation, time-of-use tariffs, demand charges, financing, incentives
and inflation. Load profiles are typical shapes, not measured data.

## Licence

Code: [MIT](LICENSE). Weather data and map tiles keep their own licences (above).
