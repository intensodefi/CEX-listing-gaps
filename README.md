# CEX listing Gaps

Compares listings built from every market pair CoinMarketCap tracks. Each side of a comparison is one listing: an exchange's spot, perpetual, or dated futures book, or the same market combined across a country's exchanges. Binance perpetual can be compared with Binance spot. South Korea spot can be compared with United States spot.

A coin counts as listed only when it is the base of at least one pair in that listing. A country listing is the union of its exchanges.

## Use cases

By using this tool, you can discover promising projects that are already listed on major exchanges but not yet available on all of them, helping you identify potential investment opportunities and assess their growth potential.

- **Same exchange, two markets.** Compare Binance perpetual with Binance spot. The table lists assets that have a perpetual pair on Binance and no spot pair there. Swap the sides for assets on Binance spot with no Binance perpetual.
- **One exchange against another.** Compare Coinbase spot with Kraken spot to see which bases one book lists and the other does not.
- **One country against another.** Compare South Korea spot with United States spot. A coin is on a country when at least one of that country's exchanges lists it. With a country selected, the page lists the member exchanges: Coinbase, Kraken, Gemini, and Binance.US for the United States; Upbit, Bithumb, Coinone, Korbit, and GOPAX for South Korea; bitFlyer, Bitbank, and Coincheck for Japan; Bitstamp and Bitvavo for Europe; Binance, Bybit, OKX, KuCoin, Gate, Bitget, MEXC, HTX, and Crypto.com for Global.
- **A country against one exchange.** Compare Japan spot with Binance spot to see assets listed on a Japanese exchange and absent from Binance spot.
- **The same gap on other books.** Also missing from shows which other listings lack each asset. Check one exchange in that column to keep rows missing from that exchange.
- **A chain, a tag, or a handoff.** Check one platform, such as Ethereum, or one tag. The table keeps rows that match. Export CSV downloads the rows on screen, including tags, platform, and contract address. Stablecoins stay out of the table until Include stablecoins is checked.

## Data

- Spot: CoinMarketCap exchange market pairs. This API plan does not enable `/v1/exchange/market-pairs/latest`.
- Perpetual and futures: [`/v5/exchange/derivatives/market-pairs/list/latest`](https://coinmarketcap.com/api/documentation/pro-api-reference/derivatives), with the key in `CMC_API_KEY`.
- Names: `/v1/cryptocurrency/map`.
- Tags and platform: `/v2/cryptocurrency/info`. A coin with no contract platform is shown as Native. The platform column shows the chain name.

## Run

```bash
cp .env.example .env
# set CMC_API_KEY in .env
npm start
```

Open http://127.0.0.1:4173. Platform, tags, and also-missing each start with every value selected. Select all checks every value again, and deselect all clears the checks. With one value checked, only matching rows stay. Export CSV downloads the assets currently shown in the table, including the contract address.

Pair data is cached in `data/` for 7 days. Startup loads that cache and does not call CoinMarketCap again. Press Refresh to fetch new pairs.

## Test

```bash
npm test
```
