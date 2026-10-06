"use strict";

// ===== Settings =====
const DEFAULT_PLACE = { name: "Belgrade", region: "Central Serbia", country: "Serbia", latitude: 44.804, longitude: 20.465 };
const STORAGE_KEY = "weather:lastPlace";
const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const { describe, svg, theme } = WeatherIcons;

// ===== DOM =====
const $ = (id) => document.getElementById(id);
const el = {
    main: $("main"), sidebar: $("sidebar"),
    form: $("search-form"), input: $("search-input"), results: $("search-results"),
    locations: $("locations"), locationsEmpty: $("locations-empty"),
    locate: $("locate-btn"), locateMobile: $("locate-btn-mobile"), favBtn: $("fav-btn"),
    heroLabel: $("hero-label"), cityName: $("city-name"), temp: $("current-temp"),
    desc: $("current-desc"), range: $("current-range"), status: $("status"),
    hourlySummary: $("hourly-summary"), hourly: $("hourly"), daily: $("daily"), details: $("details"),
};

const state = {
    place: null,
    favorites: [],
    weatherByFavorite: new Map(), // favorite id -> forecast, for the location cards
    searchResults: [],
    activeIndex: -1,
    requestId: 0,
};

// ===== Helpers =====
function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (c) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

async function api(url, options = {}) {
    const response = await fetch(url, { headers: { "Content-Type": "application/json" }, ...options });
    if (response.status === 204) return null;
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error ?? `Request failed (${response.status})`);
    return data;
}

const round = (n) => Math.round(n);
const clamp = (n, min, max) => Math.min(Math.max(n, min), max);
const sameCoords = (a, b) =>
    Math.abs(a.latitude - b.latitude) < 0.01 && Math.abs(a.longitude - b.longitude) < 0.01;

// Open-Meteo returns local times like "2026-10-06T21:45" (already in the city's time zone).
const hoursOf = (iso) => Number(iso.slice(11, 13)) + Number(iso.slice(14, 16)) / 60;

function clock(h, m, withMinutes = true) {
    const suffix = h < 12 ? "AM" : "PM";
    const hour = h % 12 || 12;
    return withMinutes ? `${hour}:${String(m).padStart(2, "0")} ${suffix}` : `${hour} ${suffix}`;
}

const timeLabel = (iso) => clock(Number(iso.slice(11, 13)), Number(iso.slice(14, 16)));
const hourLabel = (iso) => clock(Number(iso.slice(11, 13)), 0, false);

// Current local time in a city, from its UTC offset.
function cityClock(utcOffsetSeconds) {
    const local = new Date(Date.now() + utcOffsetSeconds * 1000);
    return clock(local.getUTCHours(), local.getUTCMinutes());
}

function dayName(isoDate, index) {
    if (index === 0) return "Today";
    const [y, m, d] = isoDate.split("-").map(Number);
    return new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}

// Temperature -> color, like the bars in iOS Weather (blue = cold, red = hot).
const TEMP_STOPS = [[-15, "#5e5ce6"], [0, "#64d2ff"], [10, "#30d1a0"], [18, "#c7e04a"], [24, "#ffd60a"], [30, "#ff9f0a"], [38, "#ff453a"]];

function tempColor(t) {
    if (t <= TEMP_STOPS[0][0]) return TEMP_STOPS[0][1];
    for (let i = 1; i < TEMP_STOPS.length; i++) {
        if (t <= TEMP_STOPS[i][0]) return TEMP_STOPS[t - TEMP_STOPS[i - 1][0] < TEMP_STOPS[i][0] - t ? i - 1 : i][1];
    }
    return TEMP_STOPS[TEMP_STOPS.length - 1][1];
}

function tempGradient(min, max) {
    const inner = TEMP_STOPS.filter(([t]) => t > min && t < max)
        .map(([t, c]) => `${c} ${((t - min) / Math.max(max - min, 1)) * 100}%`);
    return `linear-gradient(90deg, ${[tempColor(min), ...inner, tempColor(max)].join(", ")})`;
}

function showStatus(message, isError = false) {
    el.status.textContent = message ?? "";
    el.status.classList.toggle("error", isError);
    el.status.hidden = !message;
}

function closeSidebarOnPhone() {
    if (el.sidebar.classList.contains("show")) bootstrap.Offcanvas.getOrCreateInstance(el.sidebar).hide();
}

// ===== Loading weather =====
async function loadWeather(place) {
    const requestId = ++state.requestId;
    state.place = place;
    state.weather = null;
    el.main.classList.add("loading");
    showStatus(null);
    renderPlace(place);
    closeSidebarOnPhone();

    try {
        const data = await api(`/api/weather?lat=${place.latitude}&lon=${place.longitude}`);
        if (requestId !== state.requestId) return; // a newer request has started
        state.weather = data;
        const fav = currentFavorite();
        if (fav) state.weatherByFavorite.set(fav.id, data);
        render(data);
        renderLocations();
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(place)); } catch { /* storage unavailable */ }
    } catch (err) {
        if (requestId === state.requestId) showStatus(err.message, true);
    } finally {
        if (requestId === state.requestId) el.main.classList.remove("loading");
    }
}

function renderPlace(place) {
    el.cityName.textContent = place.name;
    el.heroLabel.textContent = "My Location";
    el.heroLabel.hidden = !place.isCurrentLocation;
    document.title = `${place.name} – Weather`;
    updateFavButton();
    renderLocations();
}

function render(data) {
    const { current, daily } = data;
    const isDay = current.is_day === 1;

    document.body.className = theme(current.weather_code, isDay);
    document.querySelector('meta[name="theme-color"]')
        .setAttribute("content", getComputedStyle(document.body).getPropertyValue("--bg-top").trim());

    el.temp.textContent = round(current.temperature_2m);
    el.desc.textContent = describe(current.weather_code, isDay).text;
    el.range.textContent = `H:${round(daily.temperature_2m_max[0])}°  L:${round(daily.temperature_2m_min[0])}°`;

    renderHourly(data);
    renderDaily(data);
    renderDetails(data);
}

// ===== Hourly =====
function renderHourly({ current, hourly, daily }) {
    const nowHour = current.time.slice(0, 13);
    let start = hourly.time.findIndex((t) => t.slice(0, 13) >= nowHour);
    if (start < 0) start = 0;
    const end = Math.min(start + 25, hourly.time.length);

    const items = [];
    for (let i = start; i < end; i++) {
        const isDay = hourly.is_day[i] === 1;
        const chance = hourly.precipitation_probability[i];
        items.push({
            time: hourly.time[i],
            html: `
                <div class="hour">
                    <span class="time">${i === start ? "Now" : hourLabel(hourly.time[i])}</span>
                    <span class="icon-wrap">
                        ${svg(hourly.weather_code[i], isDay)}
                        ${chance >= 20 ? `<span class="chance">${chance}%</span>` : ""}
                    </span>
                    <span class="visually-hidden">${describe(hourly.weather_code[i], isDay).text}</span>
                    <span class="t">${round(hourly.temperature_2m[i])}°</span>
                </div>`,
        });
    }

    // Sunrise and sunset appear between the hours, like in iOS Weather.
    const from = hourly.time[start], to = hourly.time[end - 1];
    const events = [...daily.sunrise.map((t) => [t, "Sunrise"]), ...daily.sunset.map((t) => [t, "Sunset"])];
    for (const [time, label] of events) {
        if (time > from && time < to) {
            items.push({
                time,
                html: `
                    <div class="hour">
                        <span class="time">${timeLabel(time)}</span>
                        <span class="icon-wrap"><i class="bi bi-${label.toLowerCase()}-fill" aria-hidden="true"></i></span>
                        <span class="t">${label}</span>
                    </div>`,
            });
        }
    }

    items.sort((a, b) => a.time.localeCompare(b.time));
    el.hourly.innerHTML = items.map((item) => item.html).join("");
    el.hourly.scrollLeft = 0;
    el.hourlySummary.textContent = hourlySummary(current, hourly, start, end);
}

function hourlySummary(current, hourly, start, end) {
    const isDay = current.is_day === 1;
    let text;

    const wetHour = hourly.time.slice(start + 1, end).findIndex((_, i) => hourly.precipitation_probability[start + 1 + i] >= 50);
    if (WeatherIcons.isPrecipitation(current.weather_code)) {
        text = `${describe(current.weather_code, isDay).text} right now.`;
    } else if (wetHour >= 0) {
        const idx = start + 1 + wetHour;
        const code = hourly.weather_code[idx];
        const kind = code >= 71 && code <= 86 ? "Snow" : "Rain";
        text = `${kind} likely around ${hourLabel(hourly.time[idx])}.`;
    } else {
        text = `${describe(current.weather_code, isDay).text} conditions will continue for the rest of the day.`;
    }

    return `${text} Wind gusts are up to ${round(current.wind_gusts_10m)} km/h.`;
}

// ===== 10-day =====
function renderDaily({ current, daily }) {
    const weekMin = Math.min(...daily.temperature_2m_min);
    const weekMax = Math.max(...daily.temperature_2m_max);
    const span = Math.max(weekMax - weekMin, 1);
    const pos = (t) => clamp(((t - weekMin) / span) * 100, 0, 100);

    el.daily.innerHTML = daily.time.map((date, i) => {
        const min = daily.temperature_2m_min[i];
        const max = daily.temperature_2m_max[i];
        const chance = daily.precipitation_probability_max[i] ?? 0;
        const info = describe(daily.weather_code[i]);
        const nowDot = i === 0
            ? `<span class="now-dot" style="left:${pos(current.temperature_2m)}%" title="Now"></span>` : "";
        return `
            <li>
                <span class="day">${dayName(date, i)}</span>
                <span class="icon-wrap">
                    ${svg(daily.weather_code[i])}
                    ${chance >= 20 ? `<span class="chance">${chance}%</span>` : ""}
                </span>
                <span class="range">
                    <span class="visually-hidden">${info.text}. Low</span>
                    <span class="min">${round(min)}°</span>
                    <span class="temp-bar" aria-hidden="true">
                        <span class="fill" style="left:${pos(min)}%;right:${100 - pos(max)}%;background:${tempGradient(min, max)}"></span>
                        ${nowDot}
                    </span>
                    <span class="visually-hidden">High</span>
                    <span class="max">${round(max)}°</span>
                </span>
            </li>`;
    }).join("");
}

// ===== Detail tiles =====
function tile(icon, title, body, extraClass = "") {
    return `
        <div class="card-ios tile ${extraClass}">
            <h4 class="card-title"><i class="bi bi-${icon}" aria-hidden="true"></i> ${title}</h4>
            ${body}
        </div>`;
}

function uvText(uv) {
    if (uv < 3) return "Low";
    if (uv < 6) return "Moderate";
    if (uv < 8) return "High";
    if (uv < 11) return "Very High";
    return "Extreme";
}

function feelsLikeNote(c) {
    const diff = c.apparent_temperature - c.temperature_2m;
    if (Math.abs(diff) < 2) return "Similar to the actual temperature.";
    if (diff < 0) return c.wind_speed_10m > 15 ? "Wind is making it feel colder." : "Feels colder than the actual temperature.";
    return c.relative_humidity_2m > 60 ? "Humidity is making it feel warmer." : "Feels warmer than the actual temperature.";
}

function visibilityNote(km) {
    if (km >= 30) return "Perfectly clear view.";
    if (km >= 10) return "Clear view.";
    if (km >= 4) return "Haze is slightly reducing visibility.";
    return "Low visibility. Drive carefully.";
}

function pressureNote(hpa) {
    if (hpa < 1000) return "Low pressure. Unsettled weather is likely.";
    if (hpa > 1020) return "High pressure. Usually calm, settled weather.";
    return "Normal pressure.";
}

function compassSvg(direction, speed) {
    const ticks = Array.from({ length: 36 }, (_, i) => {
        const long = i % 9 === 0;
        return `<line x1="50" y1="4" x2="50" y2="${long ? 11 : 8}" stroke="rgba(255,255,255,${long ? 0.9 : 0.4})"
                      stroke-width="${long ? 1.6 : 1}" transform="rotate(${i * 10} 50 50)"/>`;
    }).join("");
    const letters = [["N", 50, 21], ["E", 81, 54], ["S", 50, 86], ["W", 19, 54]]
        .map(([t, x, y]) => `<text x="${x}" y="${y}" text-anchor="middle" font-size="10" font-weight="600" fill="rgba(255,255,255,.7)">${t}</text>`).join("");
    // The arrow points where the wind is blowing to (opposite of where it comes from).
    return `
        <svg class="compass" viewBox="0 0 100 100" aria-hidden="true">
            ${ticks}${letters}
            <g transform="rotate(${direction + 180} 50 50)">
                <line x1="50" y1="88" x2="50" y2="68" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>
                <circle cx="50" cy="88" r="3" fill="#fff"/>
                <line x1="50" y1="32" x2="50" y2="14" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>
                <path d="M50 9 L56 19 L44 19 Z" fill="#fff"/>
            </g>
            <text x="50" y="52" text-anchor="middle" font-size="15" font-weight="600" fill="#fff">${speed}</text>
            <text x="50" y="63" text-anchor="middle" font-size="8" fill="rgba(255,255,255,.7)">km/h</text>
        </svg>`;
}

// Approximate path of the sun over 24 hours, with the horizon at sunrise/sunset level.
function sunPathSvg(nowH, sunriseH, sunsetH) {
    const noon = (sunriseH + sunsetH) / 2;
    const height = (h) => Math.cos((2 * Math.PI * (h - noon)) / 24);
    const y = (h) => 30 - height(h) * 22;
    const horizon = y(sunriseH);
    const points = Array.from({ length: 49 }, (_, i) => `${(i / 48) * 100},${y(i / 2).toFixed(2)}`).join(" ");
    return `
        <svg class="sun-path" viewBox="0 -2 100 58" aria-hidden="true">
            <polyline points="${points}" fill="none" stroke="rgba(255,255,255,.45)" stroke-width="1.6"/>
            <line x1="0" y1="${horizon}" x2="100" y2="${horizon}" stroke="rgba(255,255,255,.35)" stroke-width="1"/>
            <circle cx="${(nowH / 24) * 100}" cy="${y(nowH)}" r="3.6" fill="#fff"/>
        </svg>`;
}

function sunTile({ current, daily }) {
    const now = current.time;
    let title, main, note;
    if (now < daily.sunrise[0]) {
        [title, main, note] = ["Sunrise", daily.sunrise[0], `Sunset: ${timeLabel(daily.sunset[0])}`];
    } else if (now < daily.sunset[0]) {
        [title, main, note] = ["Sunset", daily.sunset[0], `Sunrise: ${timeLabel(daily.sunrise[1])}`];
    } else {
        [title, main, note] = ["Sunrise", daily.sunrise[1], `Sunset: ${timeLabel(daily.sunset[1])}`];
    }
    return tile(title.toLowerCase() + "-fill", title, `
        <div class="value">${timeLabel(main)}</div>
        ${sunPathSvg(hoursOf(now), hoursOf(daily.sunrise[0]), hoursOf(daily.sunset[0]))}
        <div class="note">${note}</div>`);
}

function renderDetails(data) {
    const { current: c, daily } = data;
    const uv = daily.uv_index_max[0] ?? 0;
    const visibilityKm = c.visibility / 1000;
    const windDir = COMPASS[Math.round(c.wind_direction_10m / 45) % 8];
    const rainToday = daily.precipitation_sum[0] ?? 0;
    const rainTomorrow = daily.precipitation_sum[1] ?? 0;

    el.details.innerHTML = [
        tile("sun-fill", "UV Index", `
            <div class="value">${round(uv)}</div>
            <div class="sub">${uvText(uv)}</div>
            <div class="uv-bar" aria-hidden="true"><span class="now-dot" style="left:${clamp((uv / 11) * 100, 0, 100)}%"></span></div>
            <div class="note">${uv >= 3 ? "Use sun protection around midday." : "Low for the rest of the day."}</div>`),

        sunTile(data),

        tile("wind", "Wind", `
            ${compassSvg(c.wind_direction_10m, round(c.wind_speed_10m))}
            <div class="note">Gusts ${round(c.wind_gusts_10m)} km/h · From ${windDir} (${round(c.wind_direction_10m)}°)</div>`),

        tile("droplet-fill", "Precipitation", `
            <div class="value">${rainToday.toFixed(1)}<span class="unit">mm</span></div>
            <div class="sub">Today</div>
            <div class="note">${rainTomorrow > 0 ? `${rainTomorrow.toFixed(1)} mm expected tomorrow.` : "None expected tomorrow."}</div>`),

        tile("thermometer-half", "Feels Like", `
            <div class="value">${round(c.apparent_temperature)}°</div>
            <div class="note">${feelsLikeNote(c)}</div>`),

        tile("moisture", "Humidity", `
            <div class="value">${c.relative_humidity_2m}%</div>
            <div class="note">The dew point is ${round(c.dew_point_2m)}° right now.</div>`),

        tile("eye-fill", "Visibility", `
            <div class="value">${visibilityKm >= 10 ? round(visibilityKm) : visibilityKm.toFixed(1)}<span class="unit">km</span></div>
            <div class="note">${visibilityNote(visibilityKm)}</div>`),

        tile("speedometer", "Pressure", `
            <div class="value">${round(c.pressure_msl)}<span class="unit">hPa</span></div>
            <div class="note">${pressureNote(c.pressure_msl)}</div>`),
    ].join("");
}

// ===== Search =====
let searchTimer;

el.input.addEventListener("input", () => {
    clearTimeout(searchTimer);
    const query = el.input.value.trim();
    if (query.length < 2) { closeResults(); return; }
    searchTimer = setTimeout(() => searchCities(query), 300);
});

async function searchCities(query) {
    try {
        const results = await api(`/api/geocode?q=${encodeURIComponent(query)}`);
        if (el.input.value.trim() !== query) return; // the user kept typing
        state.searchResults = results;
        state.activeIndex = results.length ? 0 : -1;
        renderResults();
    } catch (err) {
        showStatus(err.message, true);
    }
}

function renderResults() {
    const results = state.searchResults;
    el.results.innerHTML = results.length
        ? results.map((r, i) => `
            <li id="result-${i}" role="option" data-index="${i}" aria-selected="${i === state.activeIndex}">
                ${escapeHtml(r.name)}
                <span class="result-meta">${escapeHtml([r.region, r.country].filter(Boolean).join(", "))}</span>
            </li>`).join("")
        : `<li class="empty" aria-disabled="true">No results</li>`;
    el.results.hidden = false;
    el.input.setAttribute("aria-expanded", "true");
    el.input.setAttribute("aria-activedescendant", state.activeIndex >= 0 ? `result-${state.activeIndex}` : "");
}

function closeResults() {
    el.results.hidden = true;
    el.input.setAttribute("aria-expanded", "false");
    el.input.removeAttribute("aria-activedescendant");
    state.searchResults = [];
    state.activeIndex = -1;
}

function chooseResult(index) {
    const place = state.searchResults[index];
    if (!place) return;
    el.input.value = "";
    closeResults();
    loadWeather(place);
}

el.results.addEventListener("mousedown", (e) => {
    const item = e.target.closest("li[data-index]");
    if (!item) return;
    e.preventDefault();
    chooseResult(Number(item.dataset.index));
});

el.input.addEventListener("keydown", (e) => {
    const count = state.searchResults.length;
    if (e.key === "ArrowDown" && count) {
        e.preventDefault();
        state.activeIndex = (state.activeIndex + 1) % count;
        renderResults();
    } else if (e.key === "ArrowUp" && count) {
        e.preventDefault();
        state.activeIndex = (state.activeIndex - 1 + count) % count;
        renderResults();
    } else if (e.key === "Escape") {
        closeResults();
    }
});

el.form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (state.activeIndex >= 0) { chooseResult(state.activeIndex); return; }
    const query = el.input.value.trim();
    if (query.length >= 2) {
        clearTimeout(searchTimer);
        await searchCities(query);
        if (state.searchResults.length) chooseResult(0);
    }
});

el.input.addEventListener("blur", () => setTimeout(closeResults, 150));

// ===== Geolocation =====
function useMyLocation() {
    if (!navigator.geolocation) { showStatus("Your browser doesn't support location.", true); return; }
    showStatus("Finding your location…");
    navigator.geolocation.getCurrentPosition(
        (pos) => loadWeather({
            name: "My Location",
            isCurrentLocation: true,
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
        }),
        () => showStatus("Couldn't get your location. Check your browser's location permission.", true),
        { timeout: 10000, maximumAge: 600000 },
    );
}

el.locate.addEventListener("click", useMyLocation);
el.locateMobile.addEventListener("click", useMyLocation);

// ===== Saved locations =====
async function loadFavorites() {
    try {
        state.favorites = await api("/api/favorites");
        renderLocations();
        updateFavButton();
        await Promise.all(state.favorites.map(loadFavoriteWeather));
    } catch (err) {
        showStatus(err.message, true);
    }
}

async function loadFavoriteWeather(fav) {
    try {
        state.weatherByFavorite.set(fav.id, await api(`/api/weather?lat=${fav.latitude}&lon=${fav.longitude}`));
        renderLocations();
    } catch { /* the card simply shows no temperature */ }
}

function currentFavorite() {
    return state.place && state.favorites.find((f) => sameCoords(f, state.place));
}

function updateFavButton() {
    const fav = currentFavorite();
    el.favBtn.hidden = !state.place;
    el.favBtn.setAttribute("aria-pressed", fav ? "true" : "false");
    el.favBtn.innerHTML = fav
        ? `<i class="bi bi-check-lg" aria-hidden="true"></i> Saved`
        : `<i class="bi bi-plus-lg" aria-hidden="true"></i> Add`;
    el.favBtn.title = fav ? "Remove from saved cities" : "Save this city";
}

function locationCard(place, data, { id = null, active = false } = {}) {
    const c = data?.current;
    const d = data?.daily;
    const themeClass = c ? theme(c.weather_code, c.is_day === 1) : "theme-cloudy";
    const subtitle = place.isCurrentLocation ? "My Location" : data ? cityClock(data.utc_offset_seconds) : "";
    return `
        <li class="location ${themeClass}${active ? " active" : ""}">
            <button class="location-open" type="button" ${id !== null ? `data-id="${id}"` : "data-current"}
                    ${active ? 'aria-current="true"' : ""}>
                <span class="location-name">${escapeHtml(place.name)}</span>
                <span class="location-temp">${c ? `${round(c.temperature_2m)}°` : "--"}</span>
                <span class="location-time">${escapeHtml(subtitle)}</span>
                <span class="location-desc">${c ? describe(c.weather_code, c.is_day === 1).text : ""}</span>
                <span class="location-range">${d ? `H:${round(d.temperature_2m_max[0])}° L:${round(d.temperature_2m_min[0])}°` : ""}</span>
            </button>
            ${id !== null ? `
                <button class="location-remove" type="button" data-remove="${id}" aria-label="Remove ${escapeHtml(place.name)}">
                    <i class="bi bi-dash-lg" aria-hidden="true"></i>
                </button>` : ""}
        </li>`;
}

function renderLocations() {
    const cards = [];
    // The city being viewed is listed on top until it's saved, like a preview in iOS Weather.
    if (state.place && !currentFavorite()) cards.push(locationCard(state.place, state.weather, { active: true }));
    for (const fav of state.favorites) {
        const active = state.place && sameCoords(fav, state.place);
        cards.push(locationCard(fav, state.weatherByFavorite.get(fav.id), { id: fav.id, active }));
    }
    el.locations.innerHTML = cards.join("");
    el.locationsEmpty.hidden = state.favorites.length > 0;
}

el.locations.addEventListener("click", async (e) => {
    const remove = e.target.closest("[data-remove]");
    const open = e.target.closest("[data-id]");
    if (remove) {
        await removeFavorite(Number(remove.dataset.remove));
    } else if (open) {
        const fav = state.favorites.find((f) => f.id === Number(open.dataset.id));
        if (fav) loadWeather(fav);
    } else if (e.target.closest("[data-current]")) {
        closeSidebarOnPhone();
    }
});

async function removeFavorite(id) {
    try {
        await api(`/api/favorites/${id}`, { method: "DELETE" });
        state.favorites = state.favorites.filter((f) => f.id !== id);
        state.weatherByFavorite.delete(id);
        renderLocations();
        updateFavButton();
    } catch (err) {
        showStatus(err.message, true);
    }
}

el.favBtn.addEventListener("click", async () => {
    const fav = currentFavorite();
    if (fav) { await removeFavorite(fav.id); return; }

    const { name, region, country, latitude, longitude } = state.place;
    try {
        const saved = await api("/api/favorites", {
            method: "POST",
            body: JSON.stringify({ name, region, country, latitude, longitude }),
        });
        if (!state.favorites.some((f) => f.id === saved.id)) state.favorites.push(saved);
        if (state.weather) state.weatherByFavorite.set(saved.id, state.weather);
        renderLocations();
        updateFavButton();
    } catch (err) {
        showStatus(err.message, true);
    }
});

// ===== Start =====
function initialPlace() {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (saved && Number.isFinite(saved.latitude) && Number.isFinite(saved.longitude)) return saved;
    } catch { /* ignore */ }
    return DEFAULT_PLACE;
}

loadFavorites();
loadWeather(initialPlace());
