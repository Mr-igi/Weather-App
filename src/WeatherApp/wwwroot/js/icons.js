"use strict";

// Multicolor weather icons in the style of iOS Weather, composed from Bootstrap Icons (MIT) shapes.
const WeatherIcons = (() => {
    const PATHS = {
        sun: "M8 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M8 0a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 0m0 13a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 13m8-5a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2a.5.5 0 0 1 .5.5M3 8a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2A.5.5 0 0 1 3 8m10.657-5.657a.5.5 0 0 1 0 .707l-1.414 1.415a.5.5 0 1 1-.707-.708l1.414-1.414a.5.5 0 0 1 .707 0m-9.193 9.193a.5.5 0 0 1 0 .707L3.05 13.657a.5.5 0 0 1-.707-.707l1.414-1.414a.5.5 0 0 1 .707 0m9.193 2.121a.5.5 0 0 1-.707 0l-1.414-1.414a.5.5 0 0 1 .707-.707l1.414 1.414a.5.5 0 0 1 0 .707M4.464 4.465a.5.5 0 0 1-.707 0L2.343 3.05a.5.5 0 1 1 .707-.707l1.414 1.414a.5.5 0 0 1 0 .708",
        moon: "M6 .278a.77.77 0 0 1 .08.858 7.2 7.2 0 0 0-.878 3.46c0 4.021 3.278 7.277 7.318 7.277q.792-.001 1.533-.16a.79.79 0 0 1 .81.316.73.73 0 0 1-.031.893A8.35 8.35 0 0 1 8.344 16C3.734 16 0 12.286 0 7.71 0 4.266 2.114 1.312 5.124.06A.75.75 0 0 1 6 .278",
        cloud: "M4.406 3.342A5.53 5.53 0 0 1 8 2c2.69 0 4.923 2 5.166 4.579C14.758 6.804 16 8.137 16 9.773 16 11.569 14.502 13 12.687 13H3.781C1.708 13 0 11.366 0 9.318c0-1.763 1.266-3.223 2.942-3.593.143-.863.698-1.723 1.464-2.383",
        bolt: "M5.52.359A.5.5 0 0 1 6 0h4a.5.5 0 0 1 .474.658L8.694 6H12.5a.5.5 0 0 1 .395.807l-7 9a.5.5 0 0 1-.873-.454L6.823 9.5H3.5a.5.5 0 0 1-.48-.641z",
    };

    const COLORS = { sun: "#ffd60a", moon: "#f5f5f7", cloud: "#ffffff", cloudBack: "#b8c4d1", rain: "#64d2ff", snow: "#ffffff", bolt: "#ffd60a", fog: "#d1d9e2" };

    const shape = (name, color, x, y, scale) =>
        `<path d="${PATHS[name]}" fill="${color}" transform="translate(${x} ${y}) scale(${scale})"/>`;

    // Cloud raised to the top half, leaving room for precipitation below it.
    const topCloud = shape("cloud", COLORS.cloud, 2, -1.5, 1.25);

    const drops = (xs, length, width = 1.7) => xs.map((x) =>
        `<line x1="${x}" y1="17" x2="${x - length * 0.35}" y2="${17 + length}" stroke="${COLORS.rain}" stroke-width="${width}" stroke-linecap="round"/>`).join("");

    const flakes = (points, r = 1.25) => points.map(([x, y]) =>
        `<circle cx="${x}" cy="${y}" r="${r}" fill="${COLORS.snow}"/>`).join("");

    const ICONS = {
        clearDay: shape("sun", COLORS.sun, 2, 2, 1.25),
        clearNight: shape("moon", COLORS.moon, 3.5, 3.5, 1.05),
        partlyDay: shape("sun", COLORS.sun, 8.5, 0.5, 0.88) + shape("cloud", COLORS.cloud, 0.5, 5.5, 1.15),
        partlyNight: shape("moon", COLORS.moon, 11, 1.5, 0.68) + shape("cloud", COLORS.cloud, 0.5, 5.5, 1.15),
        overcast: shape("cloud", COLORS.cloudBack, 6.5, 1, 1.0) + shape("cloud", COLORS.cloud, 0.5, 6, 1.1),
        fog: shape("cloud", COLORS.cloud, 2, -1.5, 1.25) +
            `<path d="M4 18.5h16M6.5 22h11" stroke="${COLORS.fog}" stroke-width="1.8" stroke-linecap="round"/>`,
        drizzle: topCloud + drops([8, 13, 18], 3, 1.4),
        rain: topCloud + drops([7.5, 12.5, 17.5], 4.5),
        heavyRain: topCloud + drops([5.5, 9.5, 13.5, 17.5, 21], 5.5),
        sleet: topCloud + drops([7.5, 17.5], 4.5) + flakes([[12.5, 19], [11, 22.5]]),
        snow: topCloud + flakes([[7, 18.5], [12, 18.5], [17, 18.5], [9.5, 22], [14.5, 22]]),
        thunder: topCloud + shape("bolt", COLORS.bolt, 7.5, 12, 0.72) + drops([5.5, 18.5], 4),
        hail: topCloud + flakes([[7, 19], [12, 21], [17, 19], [9.5, 23], [14.5, 23]], 1.5),
    };

    // WMO weather codes used by Open-Meteo.
    const CODES = {
        0:  { text: "Clear",                   day: "clearDay",  night: "clearNight",  theme: "clear" },
        1:  { text: "Mostly Clear",            day: "partlyDay", night: "partlyNight", theme: "clear" },
        2:  { text: "Partly Cloudy",           day: "partlyDay", night: "partlyNight", theme: "cloudy" },
        3:  { text: "Cloudy",                  day: "overcast",  theme: "cloudy" },
        45: { text: "Fog",                     day: "fog",       theme: "fog" },
        48: { text: "Freezing Fog",            day: "fog",       theme: "fog" },
        51: { text: "Light Drizzle",           day: "drizzle",   theme: "rain" },
        53: { text: "Drizzle",                 day: "drizzle",   theme: "rain" },
        55: { text: "Heavy Drizzle",           day: "drizzle",   theme: "rain" },
        56: { text: "Freezing Drizzle",        day: "sleet",     theme: "rain" },
        57: { text: "Heavy Freezing Drizzle",  day: "sleet",     theme: "rain" },
        61: { text: "Light Rain",              day: "rain",      theme: "rain" },
        63: { text: "Rain",                    day: "rain",      theme: "rain" },
        65: { text: "Heavy Rain",              day: "heavyRain", theme: "rain" },
        66: { text: "Freezing Rain",           day: "sleet",     theme: "rain" },
        67: { text: "Heavy Freezing Rain",     day: "sleet",     theme: "rain" },
        71: { text: "Light Snow",              day: "snow",      theme: "snow" },
        73: { text: "Snow",                    day: "snow",      theme: "snow" },
        75: { text: "Heavy Snow",              day: "snow",      theme: "snow" },
        77: { text: "Snow Grains",             day: "snow",      theme: "snow" },
        80: { text: "Light Showers",           day: "rain",      theme: "rain" },
        81: { text: "Showers",                 day: "heavyRain", theme: "rain" },
        82: { text: "Heavy Showers",           day: "heavyRain", theme: "storm" },
        85: { text: "Snow Showers",            day: "snow",      theme: "snow" },
        86: { text: "Heavy Snow Showers",      day: "snow",      theme: "snow" },
        95: { text: "Thunderstorms",           day: "thunder",   theme: "storm" },
        96: { text: "Thunderstorms with Hail", day: "hail",      theme: "storm" },
        99: { text: "Severe Thunderstorms",    day: "hail",      theme: "storm" },
    };

    const UNKNOWN = { text: "Unknown", day: "overcast", theme: "cloudy" };

    function describe(code, isDay = true) {
        const info = CODES[code] ?? UNKNOWN;
        return { text: info.text, icon: !isDay && info.night ? info.night : info.day, theme: info.theme };
    }

    function svg(code, isDay = true, className = "wx-icon") {
        const { icon } = describe(code, isDay);
        return `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[icon]}</svg>`;
    }

    // Background theme class for <body> and the location cards.
    function theme(code, isDay) {
        const { theme } = describe(code, isDay);
        if (theme === "clear") return isDay ? "theme-clear-day" : "theme-clear-night";
        return `theme-${theme}${isDay ? "" : " night"}`;
    }

    const isPrecipitation = (code) => code >= 51;

    return { describe, svg, theme, isPrecipitation };
})();
