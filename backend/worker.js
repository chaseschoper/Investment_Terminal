require("dotenv").config();

const mongoose = require("mongoose");
const axios = require("axios");

const Stock = require("./models/Stock");

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB error:", err));

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

    const quoteRes = await axios.get(
      `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${process.env.FINNHUB_API_KEY}`
    );

    const profileRes = await axios.get(
      `https://finnhub.io/api/v1/stock/profile2?symbol=${ticker}&token=${process.env.FINNHUB_API_KEY}`
    );

    const quote = quoteRes.data;
    const profile = profileRes.data;
const metricRes = await axios.get(
  `https://finnhub.io/api/v1/stock/metric?symbol=${ticker}&metric=all&token=${process.env.FINNHUB_API_KEY}`
);

const metrics = metricRes.data?.metric || {};
    let revenueData = [];

    try {
      const financialsRes = await axios.get(
        `https://finnhub.io/api/v1/stock/financials-reported?symbol=${ticker}&freq=annual&token=${process.env.FINNHUB_API_KEY}`
      );

      const reports = financialsRes.data?.data || [];

      revenueData = reports
        .slice(0, 5)
        .map((report) => {
          const ic = report.report?.ic || [];

          const findValue = (concepts) => {
            const row = ic.find((item) => concepts.includes(item.concept));
            return row?.value || null;
          };

const revenue = findValue([
  "us-gaap_Revenues",
  "us-gaap_RevenueFromContractWithCustomerExcludingAssessedTax",
  "us-gaap_SalesRevenueNet",
  "us-gaap_SalesRevenueGoodsNet",
  "ifrs-full_Revenue"
]);

          const earnings = findValue([
            "us-gaap_NetIncomeLoss",
            "ifrs-full_ProfitLoss"
          ]);

          const eps = findValue([
            "us-gaap_EarningsPerShareDiluted",
            "us-gaap_EarningsPerShareBasic"
          ]);

          return {
            year: report.year,
            revenue: revenue ? revenue / 1000000000 : null,
            earnings: earnings ? earnings / 1000000000 : null,
            eps: eps || null
          };
        })
        .filter((item) => item.year)
        .reverse();

    } catch (err) {
      console.log("Financials skipped:", ticker, err.message);
    }

    if (!quote || !quote.c || quote.c === 0) {
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
  sharesOutstanding: profile.shareOutstanding || null,

  pe: metrics.peNormalizedAnnual || metrics.peTTM || null,
  forwardPE: metrics.forwardPE || null,

  revenueGrowth: metrics.revenueGrowthTTMYoy || null,
  earningsGrowth: metrics.epsGrowthTTMYoy || null,

  grossMargins: metrics.grossMarginTTM || null,
  operatingMargins: metrics.operatingMarginTTM || null,
  profitMargins: metrics.netProfitMarginTTM || null,

  freeCashflow: metrics.freeCashFlowPerShareTTM || null,

  targetMean: metrics.ptMean || null,
  recommendationKey: metrics.recommendationMean
    ? String(metrics.recommendationMean)
    : "N/A",

  analystEstimates: {
    currentYear: {
      revenue: null,
      earnings: null,
      eps: metrics.epsInclExtraItemsAnnual || null,
    },
    nextYear: {
      revenue: null,
      earnings: null,
      eps: metrics.epsEstimateNextYear || null,
    },
  },

  revenueData: revenueData,
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
    const dbStocks = await Stock.find({}).limit(1000);

    const dbTickers = dbStocks
      .map((stock) => stock.ticker)
      .filter(Boolean);

    const allTickers = [
      ...new Set([
        ...STARTER_STOCKS,
        ...dbTickers
      ])
    ];

    console.log("Tickers to update:", allTickers);

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