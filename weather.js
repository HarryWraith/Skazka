import { pickWeighted, rollBetween, ucfirst } from "./utils.js";

export const WEATHER_PATH = "/data/weather.json";
let WEATHER_DATA = null,
  WEATHER_READY = null;

export async function loadWeatherData() {
  if (WEATHER_READY) return WEATHER_READY;
  WEATHER_READY = (async () => {
    try {
      const res = await fetch(WEATHER_PATH, { cache: "no-store" });
      if (!res.ok) throw new Error(`Fetch ${WEATHER_PATH} → ${res.status}`);
      WEATHER_DATA = await res.json();
    } catch (err) {
      console.error("Failed to load weather.json:", err);
      WEATHER_DATA = {
        zones: ["centre"],
        seasons: ["autumn"],
        temperature: { centre: { autumn: { min: 5, max: 12 } } },
        conditions: { centre: { autumn: [{ v: "overcast", w: 1 }] } },
      };
    }
  })();
  return WEATHER_READY;
}
loadWeatherData();

export function rollWeather(zone, season) {
  if (!WEATHER_DATA) return "Weather loading…";
  const z = WEATHER_DATA.temperature[zone] ? zone : WEATHER_DATA.zones[0];
  const s = WEATHER_DATA.temperature[z][season]
    ? season
    : WEATHER_DATA.seasons[0];
  const tband = WEATHER_DATA.temperature[z][s];
  const temp = rollBetween(tband.min, tband.max);
  const condition = pickWeighted(WEATHER_DATA.conditions[z][s]);
  return `${ucfirst(condition)}. High around ${temp}°C.`;
}
