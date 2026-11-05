# Wind + Solar Site Viability Estimator (prototype)

A browser-only tool that estimates how small wind turbines would perform alongside
solar PV and a battery at any location. Enter coordinates (or search a place, or click
the map) and it:

1. downloads hourly 10 m and 100 m wind, temperature and sunlight on the panels for
   every hour of up to 40 years (ERA5 reanalysis via [Open-Meteo](https://open-meteo.com/)),
   and for sites in Canada, measured hourly wind from the nearest Environment Canada
   station;
2. simulates every hour: turbine output from the power curve (at hub height, corrected
   for air density), solar output, the site's electricity use and the battery, with and
   without the turbines;
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

The default curve is an illustrative generic 3.5 kW turbine with a 4 m rotor, not any
real product; replace it with the measured curve of the turbine being sold.

## Wind data accuracy

ERA5 averages over a ~28 km grid cell. It can understate or overstate wind at a
particular site, sometimes by a large margin: at Claresholm, Alberta (2022–2024) the
station measured a 22% higher mean wind than ERA5 and about 3× the wind energy (mean of
speed³), because ERA5 smooths away gusts.

For sites in Canada the tool therefore looks for Environment and Climate Change Canada
stations with hourly records within 100 km (the station archive behind the Canadian
Centre for Climate Services) and, by default, uses the nearest one within 50 km that has
wind readings for at least half of the period. Any station in the list can be picked
under *Wind data*, or on the map.

- **Measured hours** use the station's reading (10 m, a 2-minute mean at the top of the hour).
- **Missing hours** are filled from ERA5 at the site through a seasonal quantile mapping
  fitted on the hours both have, so filled hours follow the station's own spread of wind
  speeds rather than ERA5's smoother one.
- **Hub height** comes from the station's 10 m wind with ERA5's hour-by-hour 10–100 m
  shear exponent.

Stations usually sit in open, flat places such as airports, so a farm with trees or
buildings may see less wind. Elsewhere, enter a measured long-term mean under *Site wind
calibration* where one exists, or compare with the
[Global Wind Atlas](https://globalwindatlas.info/) (250 m resolution).

## Running it

It is a static site with no build step. Serve the folder with any web server:

```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

Opening `index.html` directly from disk does not work (browsers block ES modules on `file://`).

Tests for the simulation model (Node 18+):

```sh
npm test
```

## Deploying to GitHub Pages

Push to GitHub, then *Settings → Pages → Deploy from a branch → `main` / root*. The
`.nojekyll` file makes Pages serve the files as they are.

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
| `index.html`, `css/style.css` | Page and styles |
| `js/app.js` | Form, URL state, map, rendering |
| `js/weather.js` | Open-Meteo downloads, retries and caching; place search |
| `js/stations.js` | Environment Canada station search and hourly wind downloads |
| `js/blend.js` | Station + ERA5 combination: alignment, quantile-mapped gap filling (pure) |
| `js/cache.js` | Shared IndexedDB cache |
| `js/model.js` | Hourly simulation (pure functions, no DOM) |
| `tests/*.test.mjs` | Model, blending and station-parsing tests (`npm test`) |

## Limitations

Indicative estimates, not a bankable energy assessment. Not modelled: turbulence and
obstacles at the specific site, wake effects between turbines, icing, snow on panels,
downtime, panel degradation, time-of-use tariffs, demand charges, financing, incentives
and inflation. Load profiles are typical shapes, not measured data.

## Licence

Code: [MIT](LICENSE). Weather data and map tiles keep their own licences (above).
