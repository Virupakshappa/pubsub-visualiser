# syntax=docker/dockerfile:1

# ---- build ----
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Restore first for better layer caching.
COPY PubSubVisualiser.Api.csproj ./
RUN dotnet restore PubSubVisualiser.Api.csproj

# Build + publish.
COPY . ./
RUN dotnet publish PubSubVisualiser.Api.csproj -c Release -o /app --no-restore

# ---- runtime ----
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app
COPY --from=build /app ./

# Kestrel listens on 8080 inside the container.
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080

ENTRYPOINT ["dotnet", "PubSubVisualiser.Api.dll"]
