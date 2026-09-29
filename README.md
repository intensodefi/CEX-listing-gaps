# CMC listing dashboard

Compares listings built from every market pair CoinMarketCap tracks. Each side of a comparison is one listing: an exchange's spot, perpetual, or dated futures book, or the same market combined across a country's exchanges. Binance perpetual can be compared with Binance spot. South Korea spot can be compared with United States spot.

A coin counts as listed only when it is the base of at least one pair in that listing. A country listing is the union of its exchanges.

## Data

- Spot: CoinMarketCap exchange market pairs. This API plan does not enable `/v1/exchange/market-pairs/latest`.
- Perpetual and futures: [`/v5/exchange/derivatives/market-pairs/list/latest`](https://coinmarketcap.com/api/documentation/pro-api-reference/derivatives), with the key in `CMC_API_KEY`.
- Names: `/v1/cryptocurrency/map`.
- Tags and platform: `/v2/cryptocurrency/info`. A coin with no contract platform is shown as Native.

## Run

```bash
cp .env.example .env
# set CMC_API_KEY in .env
npm start
```

Open http://127.0.0.1:4173. Export CSV downloads the assets currently shown in the table.

The first load walks every exchange and market, then caches the result in `data/` for 30 minutes.

## Test

```bash
npm test
```
