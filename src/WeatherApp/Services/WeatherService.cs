using System.Globalization;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Caching.Memory;

namespace WeatherApp.Services;

/// <summary>
/// Calls the free Open-Meteo API (no API key required) and caches responses in memory.
/// </summary>
public class WeatherService(HttpClient http, IMemoryCache cache)
{
    private static readonly TimeSpan ForecastCacheDuration = TimeSpan.FromMinutes(10);
    private static readonly TimeSpan GeocodeCacheDuration = TimeSpan.FromHours(6);

    private const string ForecastFields =
        "current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code," +
        "pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,visibility,dew_point_2m" +
        "&hourly=temperature_2m,weather_code,precipitation_probability,is_day" +
        "&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max," +
        "precipitation_probability_max,precipitation_sum" +
        "&timezone=auto&forecast_days=10";

    public async Task<IReadOnlyList<CityResult>> SearchCitiesAsync(string query, CancellationToken ct)
    {
        var key = "geo:" + query.ToLowerInvariant();
        if (cache.TryGetValue(key, out IReadOnlyList<CityResult>? cached) && cached is not null)
            return cached;

        var url = "https://geocoding-api.open-meteo.com/v1/search" +
                  $"?name={Uri.EscapeDataString(query)}&count=6&language=en&format=json";
        var response = await http.GetFromJsonAsync<GeocodingResponse>(url, ct);

        IReadOnlyList<CityResult> results = response?.Results?
            .Select(r => new CityResult(r.Name, r.Admin1, r.Country, r.CountryCode, r.Latitude, r.Longitude))
            .ToList() ?? [];

        cache.Set(key, results, GeocodeCacheDuration);
        return results;
    }

    public async Task<string> GetForecastAsync(double lat, double lon, CancellationToken ct)
    {
        lat = Math.Round(lat, 2);
        lon = Math.Round(lon, 2);
        var latText = lat.ToString(CultureInfo.InvariantCulture);
        var lonText = lon.ToString(CultureInfo.InvariantCulture);

        var key = $"forecast:{latText}:{lonText}";
        if (cache.TryGetValue(key, out string? cached) && cached is not null)
            return cached;

        var url = $"https://api.open-meteo.com/v1/forecast?latitude={latText}&longitude={lonText}&{ForecastFields}";
        var json = await http.GetStringAsync(url, ct);

        cache.Set(key, json, ForecastCacheDuration);
        return json;
    }

    private record GeocodingResponse(List<GeocodingResult>? Results);

    private record GeocodingResult(
        string Name,
        string? Admin1,
        string? Country,
        [property: JsonPropertyName("country_code")] string? CountryCode,
        double Latitude,
        double Longitude);
}

public record CityResult(
    string Name, string? Region, string? Country, string? CountryCode, double Latitude, double Longitude);
