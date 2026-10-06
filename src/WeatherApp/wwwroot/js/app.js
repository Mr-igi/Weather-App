"use strict";

// ===== Podešavanja =====
const DEFAULT_PLACE = { name: "Beograd", region: "Central Serbia", country: "Srbija", latitude: 44.804, longitude: 20.465 };
const STORAGE_KEY = "weather:lastPlace";

// WMO kodovi vremena (Open-Meteo) -> opis, ikonica (Bootstrap Icons) i tema pozadine.
const WEATHER_CODES = {
    0:  { text: "Vedro",                    day: "sun",                 night: "moon-stars", theme: "clear" },
    1:  { text: "Pretežno vedro",           day: "cloud-sun",           night: "cloud-moon", theme: "clear" },
    2:  { text: "Delimično oblačno",        day: "cloud-sun",           night: "cloud-moon", theme: "cloudy" },
    3:  { text: "Oblačno",                  day: "clouds",              theme: "cloudy" },
    45: { text: "Magla",                    day: "cloud-fog2",          theme: "fog" },
    48: { text: "Magla sa injem",           day: "cloud-fog2",          theme: "fog" },
    51: { text: "Slaba rosulja",            day: "cloud-drizzle",       theme: "rain" },
    53: { text: "Rosulja",                  day: "cloud-drizzle",       theme: "rain" },
    55: { text: "Jaka rosulja",             day: "cloud-drizzle",       theme: "rain" },
    56: { text: "Ledena rosulja",           day: "cloud-sleet",         theme: "rain" },
    57: { text: "Jaka ledena rosulja",      day: "cloud-sleet",         theme: "rain" },
    61: { text: "Slaba kiša",               day: "cloud-rain",          theme: "rain" },
    63: { text: "Kiša",                     day: "cloud-rain",          theme: "rain" },
    65: { text: "Jaka kiša",                day: "cloud-rain-heavy",    theme: "rain" },
    66: { text: "Ledena kiša",              day: "cloud-sleet",         theme: "rain" },
    67: { text: "Jaka ledena kiša",         day: "cloud-sleet",         theme: "rain" },
    71: { text: "Slab sneg",                day: "cloud-snow",          theme: "snow" },
    73: { text: "Sneg",                     day: "cloud-snow",          theme: "snow" },
    75: { text: "Jak sneg",                 day: "snow2",               theme: "snow" },
    77: { text: "Snežna zrna",              day: "cloud-snow",          theme: "snow" },
    80: { text: "Slabi pljuskovi",          day: "cloud-rain",          theme: "rain" },
    81: { text: "Pljuskovi",                day: "cloud-rain-heavy",    theme: "rain" },
    82: { text: "Jaki pljuskovi",           day: "cloud-rain-heavy",    theme: "storm" },
    85: { text: "Snežni pljuskovi",         day: "cloud-snow",          theme: "snow" },
    86: { text: "Jaki snežni pljuskovi",    day: "snow2",               theme: "snow" },
    95: { text: "Grmljavina",               day: "cloud-lightning-rain", theme: "storm" },
    96: { text: "Grmljavina sa gradom",     day: "cloud-hail",          theme: "storm" },
    99: { text: "Jaka grmljavina sa gradom", day: "cloud-hail",         theme: "storm" },
};

const WIND_DIRECTIONS = ["S", "SI", "I", "JI", "J", "JZ", "Z", "SZ"];

// ===== DOM =====
const $ = (id) => document.getElementById(id);
const el = {
    form: $("search-form"), input: $("search-input"), results: $("search-results"), locate: $("locate-btn"),
    status: $("status"), cityName: $("city-name"), cityMeta: $("city-meta"), favBtn: $("fav-btn"),
    icon: $("current-icon"), temp: $("current-temp"), desc: $("current-desc"), range: $("current-range"),
    hourly: $("hourly"), details: $("details"), daily: $("daily"),
    favorites: $("favorites"), favoritesEmpty: $("favorites-empty"),
};

const state = { place: null, favorites: [], searchResults: [], activeIndex: -1, requestId: 0 };

// ===== Pomoćne funkcije =====
function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (c) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

async function api(url, options = {}) {
    const response = await fetch(url, {
        headers: { "Content-Type": "application/json" },
        ...options,
    });
    if (response.status === 204) return null;
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error ?? `Greška (${response.status})`);
    return data;
}

function describe(code, isDay = true) {
    const info = WEATHER_CODES[code] ?? { text: "Nepoznato", day: "question-circle", theme: "cloudy" };
    const icon = !isDay && info.night ? info.night : info.day;
    return { text: info.text, icon: `bi-${icon}`, theme: info.theme };
}

function themeFor(code, isDay) {
    const { theme } = describe(code, isDay);
    if (theme === "clear") return isDay ? "theme-clear-day" : "theme-clear-night";
    return `theme-${theme}`;
}

const round = (n) => Math.round(n);
const timeOf = (iso) => iso.slice(11, 16);
const sameCoords = (a, b) =>
    Math.abs(a.latitude - b.latitude) < 0.01 && Math.abs(a.longitude - b.longitude) < 0.01;

function dayName(isoDate, index) {
    if (index === 0) return "Danas";
    const [y, m, d] = isoDate.split("-").map(Number);
    const name = new Intl.DateTimeFormat("sr-Latn", { weekday: "short", timeZone: "UTC" })
        .format(new Date(Date.UTC(y, m - 1, d)));
    return name.charAt(0).toUpperCase() + name.slice(1).replace(".", "");
}

function uvLevel(uv) {
    if (uv < 3) return "Nizak";
    if (uv < 6) return "Umeren";
    if (uv < 8) return "Visok";
    if (uv < 11) return "Vrlo visok";
    return "Ekstremno visok";
}

function showStatus(message, type = "info") {
    if (!message) { el.status.hidden = true; return; }
    const icon = type === "error" ? "exclamation-triangle" : "info-circle";
    el.status.innerHTML = `<i class="bi bi-${icon}" aria-hidden="true"></i><span>${escapeHtml(message)}</span>`;
    el.status.hidden = false;
}

// ===== Vreme =====
async function loadWeather(place) {
    const requestId = ++state.requestId;
    state.place = place;
    document.body.classList.add("loading");
    showStatus(null);
    renderPlace(place);

    try {
        const data = await api(`/api/weather?lat=${place.latitude}&lon=${place.longitude}`);
        if (requestId !== state.requestId) return; // stigao je noviji zahtev
        render(data);
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(place)); } catch { /* nije bitno */ }
    } catch (err) {
        if (requestId === state.requestId) showStatus(err.message, "error");
    } finally {
        if (requestId === state.requestId) document.body.classList.remove("loading");
    }
}

function renderPlace(place) {
    el.cityName.textContent = place.name;
    el.cityMeta.textContent = [place.region, place.country].filter(Boolean).join(", ");
    document.title = `${place.name} – Vreme`;
    updateFavButton();
    renderFavorites();
}

function render(data) {
    const { current, hourly, daily } = data;
    const isDay = current.is_day === 1;
    const info = describe(current.weather_code, isDay);

    document.body.className = themeFor(current.weather_code, isDay);
    el.icon.className = `bi ${info.icon} current-icon`;
    el.temp.textContent = round(current.temperature_2m);
    el.desc.textContent = info.text;
    el.range.textContent =
        `Maks. ${round(daily.temperature_2m_max[0])}° · Min. ${round(daily.temperature_2m_min[0])}°`;

    renderHourly(current, hourly);
    renderDetails(current, daily);
    renderDaily(daily);
}

function renderHourly(current, hourly) {
    const nowHour = current.time.slice(0, 13); // "YYYY-MM-DDTHH"
    let start = hourly.time.findIndex((t) => t.slice(0, 13) >= nowHour);
    if (start < 0) start = 0;

    el.hourly.innerHTML = hourly.time.slice(start, start + 24).map((time, i) => {
        const idx = start + i;
        const info = describe(hourly.weather_code[idx], hourly.is_day[idx] === 1);
        const rain = hourly.precipitation_probability[idx];
        return `
            <div class="hour${i === 0 ? " now" : ""}">
                <span class="time">${i === 0 ? "Sada" : timeOf(time)}</span>
                <i class="bi ${info.icon}" title="${escapeHtml(info.text)}" aria-hidden="true"></i>
                <span class="visually-hidden">${escapeHtml(info.text)},</span>
                <span class="t">${round(hourly.temperature_2m[idx])}°</span>
                <span class="rain">${rain >= 10 ? `<i class="bi bi-droplet-fill" aria-hidden="true"></i> ${rain}%` : ""}</span>
            </div>`;
    }).join("");
}

function renderDetails(current, daily) {
    const windDir = WIND_DIRECTIONS[Math.round(current.wind_direction_10m / 45) % 8];
    const uv = daily.uv_index_max[0] ?? 0;
    const items = [
        { icon: "thermometer-half", label: "Osećaj", value: `${round(current.apparent_temperature)}°`,
          hint: current.apparent_temperature < current.temperature_2m ? "Hladnije nego što jeste" : "Slično stvarnoj" },
        { icon: "droplet", label: "Vlažnost", value: `${current.relative_humidity_2m}%`,
          hint: `Padavine: ${current.precipitation} mm` },
        { icon: "wind", label: "Vetar", value: `${round(current.wind_speed_10m)} km/h`,
          hint: `<span class="wind-arrow" style="transform: rotate(${current.wind_direction_10m + 180}deg)">
                    <i class="bi bi-arrow-up" aria-hidden="true"></i></span> Smer: ${windDir}` },
        { icon: "sun", label: "UV indeks", value: uv.toFixed(1), hint: uvLevel(uv) },
        { icon: "speedometer2", label: "Pritisak", value: `${round(current.pressure_msl)}`, hint: "hPa" },
        { icon: "sunrise", label: "Izlazak / zalazak", value: timeOf(daily.sunrise[0]),
          hint: `Zalazak: ${timeOf(daily.sunset[0])}` },
    ];

    el.details.innerHTML = items.map((d) => `
        <div class="col">
            <div class="glass detail">
                <div class="label"><i class="bi bi-${d.icon}" aria-hidden="true"></i>${d.label}</div>
                <div class="value">${d.value}</div>
                <div class="hint">${d.hint}</div>
            </div>
        </div>`).join("");
}

function renderDaily(daily) {
    const weekMin = Math.min(...daily.temperature_2m_min);
    const weekMax = Math.max(...daily.temperature_2m_max);
    const span = Math.max(weekMax - weekMin, 1);

    el.daily.innerHTML = daily.time.map((date, i) => {
        const info = describe(daily.weather_code[i]);
        const min = daily.temperature_2m_min[i];
        const max = daily.temperature_2m_max[i];
        const rain = daily.precipitation_probability_max[i] ?? 0;
        const left = ((min - weekMin) / span) * 100;
        const width = ((max - min) / span) * 100;
        return `
            <li>
                <span class="day">${dayName(date, i)}</span>
                <i class="bi ${info.icon}" title="${escapeHtml(info.text)}" aria-hidden="true"></i>
                <span class="rain">${rain >= 10 ? `${rain}%` : ""}</span>
                <span class="range">
                    <span class="visually-hidden">${escapeHtml(info.text)}, od</span>
                    <span class="min">${round(min)}°</span>
                    <span class="range-bar" aria-hidden="true"><span style="left:${left}%;width:${width}%"></span></span>
                    <span class="visually-hidden">do</span>
                    <span class="max">${round(max)}°</span>
                </span>
            </li>`;
    }).join("");
}

// ===== Pretraga =====
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
        if (el.input.value.trim() !== query) return; // korisnik je u međuvremenu kucao dalje
        state.searchResults = results;
        state.activeIndex = results.length ? 0 : -1;
        renderResults();
    } catch (err) {
        showStatus(err.message, "error");
    }
}

function renderResults() {
    const results = state.searchResults;
    el.results.innerHTML = results.length
        ? results.map((r, i) => `
            <li id="result-${i}" role="option" data-index="${i}" aria-selected="${i === state.activeIndex}">
                <span>${escapeHtml(r.name)}</span>
                <span class="result-meta">${escapeHtml([r.region, r.country].filter(Boolean).join(", "))}</span>
            </li>`).join("")
        : `<li class="text-secondary-emphasis" aria-disabled="true">Nema rezultata</li>`;
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

// ===== Geolokacija =====
el.locate.addEventListener("click", () => {
    if (!navigator.geolocation) { showStatus("Vaš pregledač ne podržava lokaciju.", "error"); return; }
    showStatus("Tražim vašu lokaciju…");
    navigator.geolocation.getCurrentPosition(
        (pos) => loadWeather({
            name: "Moja lokacija",
            region: null,
            country: `${pos.coords.latitude.toFixed(2)}, ${pos.coords.longitude.toFixed(2)}`,
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
        }),
        () => showStatus("Nije moguće odrediti lokaciju. Proverite dozvole u pregledaču.", "error"),
        { timeout: 10000, maximumAge: 600000 },
    );
});

// ===== Omiljeni gradovi =====
async function loadFavorites() {
    try {
        state.favorites = await api("/api/favorites");
        renderFavorites();
        updateFavButton();
    } catch (err) {
        showStatus(err.message, "error");
    }
}

function currentFavorite() {
    return state.place && state.favorites.find((f) => sameCoords(f, state.place));
}

function updateFavButton() {
    const fav = currentFavorite();
    el.favBtn.hidden = !state.place;
    el.favBtn.setAttribute("aria-pressed", fav ? "true" : "false");
    el.favBtn.innerHTML = `<i class="bi bi-star${fav ? "-fill" : ""}" aria-hidden="true"></i>
        <span class="visually-hidden">${fav ? "Ukloni iz omiljenih" : "Dodaj u omiljene"}</span>`;
    el.favBtn.title = fav ? "Ukloni iz omiljenih" : "Dodaj u omiljene";
}

function renderFavorites() {
    el.favoritesEmpty.hidden = state.favorites.length > 0;
    el.favorites.innerHTML = state.favorites.map((f) => {
        const active = state.place && sameCoords(f, state.place);
        return `
            <li>
                <button class="btn fav-open${active ? " active" : ""}" type="button" data-id="${f.id}">
                    <span class="d-block fw-medium">${escapeHtml(f.name)}</span>
                    <span class="d-block small text-secondary-emphasis">${escapeHtml(f.country ?? "")}</span>
                </button>
                <button class="btn fav-remove" type="button" data-remove="${f.id}"
                        aria-label="Ukloni ${escapeHtml(f.name)} iz omiljenih" title="Ukloni">
                    <i class="bi bi-x-lg" aria-hidden="true"></i>
                </button>
            </li>`;
    }).join("");
}

el.favorites.addEventListener("click", async (e) => {
    const open = e.target.closest("[data-id]");
    const remove = e.target.closest("[data-remove]");
    if (open) {
        const fav = state.favorites.find((f) => f.id === Number(open.dataset.id));
        if (fav) loadWeather(fav);
    } else if (remove) {
        await removeFavorite(Number(remove.dataset.remove));
    }
});

async function removeFavorite(id) {
    try {
        await api(`/api/favorites/${id}`, { method: "DELETE" });
        state.favorites = state.favorites.filter((f) => f.id !== id);
        renderFavorites();
        updateFavButton();
    } catch (err) {
        showStatus(err.message, "error");
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
        renderFavorites();
        updateFavButton();
    } catch (err) {
        showStatus(err.message, "error");
    }
});

// ===== Start =====
function initialPlace() {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (saved && Number.isFinite(saved.latitude) && Number.isFinite(saved.longitude)) return saved;
    } catch { /* ignoriši */ }
    return DEFAULT_PLACE;
}

loadFavorites();
loadWeather(initialPlace());
