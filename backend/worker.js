require("dotenv").config();

const mongoose = require("mongoose");
const axios = require("axios");

const Stock = require("./models/Stock");

mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("MongoDB connected"))
.catch(err => console.error(err));

const WATCHLIST = [
"AAPL",
"NVDA",
"MSFT",
"TSLA",
"AMD"
];

async function updateStock(ticker) {
try {

console.log("Updating:", ticker);

const quoteRes = await axios.get(
  `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${process.env.FINNHUB_API_KEY}`
);

const metricRes = await axios.get(
  `https://finnhub.io/api/v1/stock/metric?symbol=${ticker}&metric=all&token=${process.env.FINNHUB_API_KEY}`
);

const profileRes = await axios.get(
  `https://finnhub.io/api/v1/stock/profile2?symbol=${ticker}&token=${process.env.FINNHUB_API_KEY}`
);

const quote = quoteRes.data;
const metrics = metricRes.data.metric || {};
const profile = profileRes.data || {};

await Stock.findOneAndUpdate(
  { ticker },

  {
    ticker,

    data: {
      name: profile.name,
      ticker,

      price: quote.c,

      marketCap: profile.marketCapitalization,

      pe: metrics.peTTM,

      forwardPE: metrics.forwardPE,

      revenueGrowth: metrics.revenueGrowthTTMYoy,

      earningsGrowth: metrics.netIncomeGrowth5Y,

      sharesOutstanding: profile.shareOutstanding
    },

    updatedAt: new Date()
  },

  { upsert: true }
);

console.log("SUCCESS:", ticker);


} catch (err) {

console.log("FAILED:", ticker);

if (err.response) {
  console.log(err.response.data);
} else {
  console.log(err.message);
}


}
}

async function run() {

for (const ticker of WATCHLIST) {


await updateStock(ticker);

await new Promise(r => setTimeout(r, 1500));


}
}

run();

setInterval(run, 1000 * 60 * 10);
