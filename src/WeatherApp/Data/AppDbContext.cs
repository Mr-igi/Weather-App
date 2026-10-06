using Microsoft.EntityFrameworkCore;
using WeatherApp.Models;

namespace WeatherApp.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<FavoriteCity> FavoriteCities => Set<FavoriteCity>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<FavoriteCity>(city =>
        {
            city.Property(c => c.Name).HasMaxLength(100);
            city.Property(c => c.Region).HasMaxLength(100);
            city.Property(c => c.Country).HasMaxLength(100);
        });
    }
}
