namespace WeatherApp.Models;

public class FavoriteCity
{
    public const int MaxCount = 20;

    public int Id { get; set; }
    public required string Name { get; set; }
    public string? Region { get; set; }
    public string? Country { get; set; }
    public double Latitude { get; set; }
    public double Longitude { get; set; }
    public DateTime CreatedAt { get; set; }
}

public record FavoriteCityInput(string? Name, string? Region, string? Country, double Latitude, double Longitude);
