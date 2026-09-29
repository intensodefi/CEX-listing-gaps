# CMC listing dashboard

Compares major centralized exchanges using every market pair CoinMarketCap tracks. Spot, perpetual, and dated futures are separate. A coin counts as listed only when it is the base of at least one pair in the selected market.

Regions group exchanges by home market: United States, South Korea, Japan, Europe, and global venues.

## Data

- Spot: CoinMarketCap exchange market pairs. This API plan does not enable `/v1/exchange/market-pairs/latest`.
- Perpetual and futures: [`/v5/exchange/derivatives/market-pairs/list/latest`](https://coinmarketcap.com/api/documentation/pro-api-reference/derivatives), with the key in `CMC_API_KEY`.
- Names: `/v1/cryptocurrency/map`.

## Run

```bash
cp .env.example .env
# set CMC_API_KEY in .env
npm start
```

Open http://127.0.0.1:4173.

The first load walks every exchange and market, then caches the result in `data/` for 30 minutes.

## Test

```bash
npm test
```
