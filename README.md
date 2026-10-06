# Vreme – Weather App

Aplikacija za vremensku prognozu: trenutno vreme, prognoza za sledeća 24 sata i 7 dana, detalji (osećaj, vlažnost, vetar, UV, pritisak, izlazak/zalazak sunca) i omiljeni gradovi.

## Tehnologije

- **Frontend:** HTML, Bootstrap 5, Bootstrap Icons, JavaScript (bez framework-a)
- **Backend:** C# / ASP.NET Core (.NET 10) Minimal API
- **Baza:** SQLite preko Entity Framework Core (omiljeni gradovi)
- **Podaci o vremenu:** [Open-Meteo](https://open-meteo.com/) – besplatno, ne treba API ključ

## Pokretanje

Potreban je [.NET 10 SDK](https://dotnet.microsoft.com/download).

```bash
cd src/WeatherApp
dotnet run
```

Zatim otvori http://localhost:5235. Baza `weather.db` se automatski pravi pri prvom pokretanju.

## Struktura

```
src/WeatherApp/
├── Program.cs              # API rute i konfiguracija
├── Data/AppDbContext.cs    # EF Core kontekst (SQLite)
├── Models/FavoriteCity.cs  # model omiljenog grada
├── Services/WeatherService.cs  # pozivi ka Open-Meteo + keširanje
└── wwwroot/                # frontend (index.html, css/, js/)
```

## API

| Metoda | Ruta | Opis |
|--------|------|------|
| GET | `/api/geocode?q=Beograd` | Pretraga gradova |
| GET | `/api/weather?lat=44.8&lon=20.46` | Trenutno vreme + prognoza (keš 10 min) |
| GET | `/api/favorites` | Lista omiljenih gradova |
| POST | `/api/favorites` | Dodavanje grada (`name`, `region`, `country`, `latitude`, `longitude`) |
| DELETE | `/api/favorites/{id}` | Brisanje grada |
