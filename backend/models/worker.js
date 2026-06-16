
require("dotenv").config();

const mongoose = require("mongoose");
const finnhub = require("finnhub");

const Stock = require("./models/Stock");

mongoose.connect(process.env.MONGO_URI);

const api_key = finnhub.ApiClient.instance.authentications["api_key"];
api_key.apiKey = process.env.FINNHUB_API_KEY;

const finnhubClient = new finnhub.DefaultApi();

// =========================
// UPDATE STOCK
// =========================
async function updateStock(ticker) {
  try {
    console.log("Updating:", ticker);

    // PRICE
    const quote = await new Promise((resolve, reject) => {
      finnhubClient.quote(ticker, (error, data) => {
        if (error) reject(error);
        else resolve(data);
      });
    });

    // BASIC PROFILE
    const profile = await new Promise((resolve, reject) => {
      finnhubClient.companyProfile2(
        { symbol: ticker },
        (error, data) => {
          if (error) reject(error);
          else resolve(data);
        }
      );
    });

    await Stock.findOneAndUpdate(
      { ticker },
      {
        ticker,

        data: {
          name: profile.name,
          price: quote.c,
          change: quote.d,
          percentChange: quote.dp,
          marketCap: profile.marketCapitalization
        },

        status: "ready",

        updatedAt: new Date()
      },

      { upsert: true }
    );

    console.log("SUCCESS:", ticker);

  } catch (err) {
    console.log("FAILED:", ticker);
    console.log(err.message);
  }
}

// =========================
// WORKER LOOP
// =========================
async function run() {
  try {
    // FIND RECENTLY REQUESTED STOCKS
    const stocks = await Stock.find({}).limit(500);

    for (const stock of stocks) {
      await updateStock(stock.ticker);

      // IMPORTANT RATE LIMIT PROTECTION
      await new Promise(r => setTimeout(r, 1200));
    }

  } catch (err) {
    console.log(err.message);
  }
}

// RUN IMMEDIATELY
run();

// REPEAT EVERY 5 MINUTES
setInterval(run, 5 * 60 * 1000);

