using Microsoft.EntityFrameworkCore;
using WeatherApp.Data;
using WeatherApp.Models;
using WeatherApp.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlite(builder.Configuration.GetConnectionString("Default")));
builder.Services.AddMemoryCache();
builder.Services.AddHttpClient<WeatherService>(client => client.Timeout = TimeSpan.FromSeconds(10));

var app = builder.Build();

// Kreira SQLite bazu (weather.db) pri prvom pokretanju.
using (var scope = app.Services.CreateScope())
{
    scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.EnsureCreated();
}

app.UseDefaultFiles();
app.UseStaticFiles();

var api = app.MapGroup("/api");

// ---------- Vremenska prognoza (proxy ka Open-Meteo, sa keširanjem) ----------

api.MapGet("/geocode", async (string? q, WeatherService weather, CancellationToken ct) =>
{
    var query = q?.Trim() ?? "";
    if (query.Length is < 2 or > 100)
        return Results.BadRequest(new { error = "Unesite između 2 i 100 karaktera." });

    return await Upstream(async () => Results.Ok(await weather.SearchCitiesAsync(query, ct)));
});

api.MapGet("/weather", async (double lat, double lon, WeatherService weather, CancellationToken ct) =>
{
    if (!IsValidCoordinate(lat, lon))
        return Results.BadRequest(new { error = "Neispravne koordinate." });

    return await Upstream(async () =>
        Results.Content(await weather.GetForecastAsync(lat, lon, ct), "application/json"));
});

// ---------- Omiljeni gradovi (SQLite) ----------

api.MapGet("/favorites", async (AppDbContext db) =>
    await db.FavoriteCities.OrderBy(c => c.CreatedAt).ToListAsync());

api.MapPost("/favorites", async (FavoriteCityInput input, AppDbContext db) =>
{
    var name = input.Name?.Trim() ?? "";
    if (name.Length is 0 or > 100 || !IsValidCoordinate(input.Latitude, input.Longitude))
        return Results.BadRequest(new { error = "Neispravni podaci o gradu." });

    var existing = await db.FavoriteCities.FirstOrDefaultAsync(c =>
        Math.Abs(c.Latitude - input.Latitude) < 0.01 && Math.Abs(c.Longitude - input.Longitude) < 0.01);
    if (existing is not null)
        return Results.Ok(existing);

    if (await db.FavoriteCities.CountAsync() >= FavoriteCity.MaxCount)
        return Results.BadRequest(new { error = $"Možete sačuvati najviše {FavoriteCity.MaxCount} gradova." });

    var city = new FavoriteCity
    {
        Name = name,
        Region = input.Region?.Trim(),
        Country = input.Country?.Trim(),
        Latitude = input.Latitude,
        Longitude = input.Longitude,
        CreatedAt = DateTime.UtcNow,
    };
    db.FavoriteCities.Add(city);
    await db.SaveChangesAsync();
    return Results.Created($"/api/favorites/{city.Id}", city);
});

api.MapDelete("/favorites/{id:int}", async (int id, AppDbContext db) =>
{
    var deleted = await db.FavoriteCities.Where(c => c.Id == id).ExecuteDeleteAsync();
    return deleted > 0 ? Results.NoContent() : Results.NotFound();
});

app.Run();

static bool IsValidCoordinate(double lat, double lon) =>
    lat is >= -90 and <= 90 && lon is >= -180 and <= 180;

// Greške spoljnog servisa vraćamo kao 502 umesto 500.
static async Task<IResult> Upstream(Func<Task<IResult>> action)
{
    try
    {
        return await action();
    }
    catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
    {
        return Results.Json(new { error = "Servis za vremensku prognozu trenutno nije dostupan." },
            statusCode: StatusCodes.Status502BadGateway);
    }
}
