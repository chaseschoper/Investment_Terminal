require("dotenv").config();

const mongoose = require("mongoose");
const finnhub = require("finnhub");

const Stock = require("./models/Stock");

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB error:", err));

const api_key = finnhub.ApiClient.instance.authentications["api_key"];
api_key.apiKey = process.env.FINNHUB_API_KEY;

const finnhubClient = new finnhub.DefaultApi();

const STARTER_STOCKS = [
  "AAPL",
  "NVDA",
  "MSFT",
  "TSLA",
  "AMD",
  "AMZN",
  "META",
  "GOOGL",
  "NFLX",
  "SOFI",
  "PLTR"
];

async function updateStock(ticker) {
  try {
    console.log("Updating:", ticker);

    const quote = await new Promise((resolve, reject) => {
      finnhubClient.quote(ticker, (error, data) => {
        if (error) reject(error);
        else resolve(data);
      });
    });

    const profile = await new Promise((resolve, reject) => {
      finnhubClient.companyProfile2(
        { symbol: ticker },
        (error, data) => {
          if (error) reject(error);
          else resolve(data);
        }
      );
    });

    if (!quote || quote.c === 0) {
      await Stock.findOneAndUpdate(
        { ticker },
        {
          ticker,
          status: "failed",
          error: "No price returned",
          updatedAt: new Date(),
        },
        { upsert: true }
      );

      console.log("FAILED:", ticker, "No price returned");
      return;
    }

    await Stock.findOneAndUpdate(
      { ticker },
      {
        ticker,
        status: "ready",
        data: {
          name: profile.name || ticker,
          symbol: ticker,
          price: quote.c,
          change: quote.d,
          percentChange: quote.dp,
          previousClose: quote.pc,
          high: quote.h,
          low: quote.l,
          open: quote.o,
          marketCap: profile.marketCapitalization || null,
        },
        updatedAt: new Date(),
      },
      { upsert: true }
    );

    console.log("SUCCESS:", ticker);

  } catch (err) {
    console.log("FAILED:", ticker);
    console.log(err.message);

    await Stock.findOneAndUpdate(
      { ticker },
      {
        ticker,
        status: "failed",
        error: err.message,
        updatedAt: new Date(),
      },
      { upsert: true }
    );
  }
}

async function run() {
  try {
    const dbStocks = await Stock.find({}).limit(500);

    const dbTickers = dbStocks
      .map((stock) => stock.ticker)
      .filter(Boolean);

    const allTickers = [
      ...new Set([
        ...STARTER_STOCKS,
        ...dbTickers,
      ]),
    ];

    for (const ticker of allTickers) {
      await updateStock(ticker);
      await new Promise((r) => setTimeout(r, 1500));
    }

    console.log("Worker cycle complete");

  } catch (err) {
    console.log("Worker run failed:", err.message);
  }
}

run();

setInterval(run, 5 * 60 * 1000);