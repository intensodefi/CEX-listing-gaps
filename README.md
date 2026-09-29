# CMC listing dashboard

Shows which top cryptocurrencies CoinMarketCap tracks on one major centralized exchange and not another.

A coin is treated as listed when [`/v1/exchange/map`](https://coinmarketcap.com/api/documentation/pro-api-reference/exchange) returns that exchange for the coin’s id. The dashboard uses the top 100 assets from [`/v1/cryptocurrency/listings/latest`](https://coinmarketcap.com/api/documentation/pro-api-reference/cryptocurrency). Market-pair detail is not required.

## Run

```bash
cp .env.example .env
# set CMC_API_KEY in .env
npm start
```

Open http://127.0.0.1:4173.

`UNIVERSE_SIZE` changes how many top assets are checked. Results are cached in `data/` for 20 minutes.

## Test

```bash
npm test
```
