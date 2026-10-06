# Weather App

A responsive weather app inspired by iOS Weather. Search any city in the world and see current conditions, an hourly forecast, a 10-day forecast and detailed weather info. Save your favorite cities to switch between them quickly.

## Features

- Current temperature, conditions and daily high/low
- Background that changes with the weather and time of day (clear, cloudy, rain, storm, snow, fog, day and night)
- Hourly forecast for the next 24 hours, with sunrise and sunset shown between the hours
- 10-day forecast with color-coded temperature bars
- Detail tiles: UV index, sunrise/sunset, wind (compass), precipitation, feels like, humidity, visibility and pressure
- City search with autocomplete (keyboard friendly)
- "My Location" using the browser's geolocation
- Saved cities stored in a database, each shown as a card with its local time and temperature
- Works on phones, tablets and desktops

## Tech stack

- **Frontend:** HTML, Bootstrap 5, Bootstrap Icons, vanilla JavaScript
- **Backend:** C# / ASP.NET Core (.NET 10) Minimal API
- **Database:** SQLite with Entity Framework Core (saved cities)
- **Weather data:** [Open-Meteo](https://open-meteo.com/), free, no API key required

## Getting started

You need the [.NET 10 SDK](https://dotnet.microsoft.com/download).

```bash
cd src/WeatherApp
dotnet run
```

Then open http://localhost:5235. The SQLite database (`weather.db`) is created automatically on first run.

> **Note:** Open the app through `dotnet run`, not through a static server such as VS Code's Live Server. The page needs the C# backend for its `/api` endpoints.

## Project structure

```
src/WeatherApp/
├── Program.cs                  # API endpoints and app configuration
├── Data/AppDbContext.cs        # EF Core database context (SQLite)
├── Models/FavoriteCity.cs      # Saved city model
├── Services/WeatherService.cs  # Open-Meteo calls + in-memory caching
└── wwwroot/                    # Frontend
    ├── index.html
    ├── css/site.css
    └── js/
        ├── icons.js            # Weather codes and multicolor SVG icons
        └── app.js              # UI logic
```

## API

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/geocode?q=London` | Search for cities |
| GET | `/api/weather?lat=51.5&lon=-0.12` | Current weather + hourly and 10-day forecast (cached for 10 minutes) |
| GET | `/api/favorites` | List saved cities |
| POST | `/api/favorites` | Save a city (`name`, `region`, `country`, `latitude`, `longitude`) |
| DELETE | `/api/favorites/{id}` | Remove a saved city |
