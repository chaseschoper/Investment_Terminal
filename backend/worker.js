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

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function getFinnhub(url) {
  const res = await axios.get(`${url}&token=${process.env.FINNHUB_API_KEY}`);
  return res.data;
}

function findFinancialValue(items, concepts) {
  const row = items.find((item) => concepts.includes(item.concept));
  return row?.value ?? null;
}

async function updateStock(ticker) {
  try {
    console.log("Updating:", ticker);

    const quote = await getFinnhub(
      `https://finnhub.io/api/v1/quote?symbol=${ticker}`
    );

    await wait(300);

    const profile = await getFinnhub(
      `https://finnhub.io/api/v1/stock/profile2?symbol=${ticker}`
    );

    await wait(300);

    const metricData = await getFinnhub(
      `https://finnhub.io/api/v1/stock/metric?symbol=${ticker}&metric=all`
    );

    const metrics = metricData?.metric || {};

    let revenueData = [];

    try {
      await wait(300);

      const financials = await getFinnhub(
        `https://finnhub.io/api/v1/stock/financials-reported?symbol=${ticker}&freq=annual`
      );

      const reports = financials?.data || [];

      revenueData = reports
        .slice(0, 5)
        .map((report) => {
          const ic = report.report?.ic || [];

          const revenue = findFinancialValue(ic, [
            "us-gaap_Revenues",
            "us-gaap_RevenueFromContractWithCustomerExcludingAssessedTax",
            "us-gaap_SalesRevenueNet",
            "us-gaap_SalesRevenueGoodsNet",
            "ifrs-full_Revenue"
          ]);

          const earnings = findFinancialValue(ic, [
            "us-gaap_NetIncomeLoss",
            "ifrs-full_ProfitLoss"
          ]);

          const eps = findFinancialValue(ic, [
            "us-gaap_EarningsPerShareDiluted",
            "us-gaap_EarningsPerShareBasic"
          ]);

          return {
            year: report.year,
            revenue: revenue ? revenue / 1000000000 : null,
            earnings: earnings ? earnings / 1000000000 : null,
            eps: eps ?? null
          };
        })
        .filter((item) => item.year)
        .reverse();
    } catch (err) {
      console.log("Financials reported skipped:", ticker, err.message);
    }

    if (!revenueData.length) {
      const annual = metricData?.series?.annual || {};

      const revenues = annual.revenue || [];
      const netIncome = annual.netIncome || [];
      const eps = annual.eps || [];

      revenueData = revenues
        .slice(0, 5)
        .map((item) => {
          const year = new Date(item.period).getFullYear();

          const incomeItem = netIncome.find(
            (x) => new Date(x.period).getFullYear() === year
          );

          const epsItem = eps.find(
            (x) => new Date(x.period).getFullYear() === year
          );

          return {
            year,
            revenue: item.v ? item.v / 1000000000 : null,
            earnings: incomeItem?.v ? incomeItem.v / 1000000000 : null,
            eps: epsItem?.v ?? null
          };
        })
        .filter((item) => item.year)
        .sort((a, b) => a.year - b.year);
    }

    let priceTarget = {};
    try {
      await wait(300);
      priceTarget = await getFinnhub(
        `https://finnhub.io/api/v1/stock/price-target?symbol=${ticker}`
      );
    } catch (err) {
      console.log("Price target skipped:", ticker);
    }
let fmpCashFlow = [];
let fmpPriceTarget = {};
let fmpAnalystEstimates = [];

try {
  if (process.env.FMP_API_KEY) {
    const cashFlowRes = await axios.get(
      `https://financialmodelingprep.com/stable/cash-flow-statement?symbol=${ticker}&limit=1&apikey=${process.env.FMP_API_KEY}`
    );

    fmpCashFlow = cashFlowRes.data || [];
  }
} catch (err) {
  console.log("FMP cash flow skipped:", ticker, err.message);
}

try {
  if (process.env.FMP_API_KEY) {
    const targetRes = await axios.get(
      `https://financialmodelingprep.com/stable/price-target-consensus?symbol=${ticker}&apikey=${process.env.FMP_API_KEY}`
    );

    fmpPriceTarget = Array.isArray(targetRes.data)
      ? targetRes.data[0] || {}
      : targetRes.data || {};
  }
} catch (err) {
  console.log("FMP price target skipped:", ticker, err.message);
}

try {
  if (process.env.FMP_API_KEY) {
    const estimatesRes = await axios.get(
      `https://financialmodelingprep.com/stable/analyst-estimates?symbol=${ticker}&period=annual&limit=2&apikey=${process.env.FMP_API_KEY}`
    );

    fmpAnalystEstimates = estimatesRes.data || [];
  }
} catch (err) {
  console.log("FMP analyst estimates skipped:", ticker, err.message);
}
    let recommendation = [];
    try {
      await wait(300);
      recommendation = await getFinnhub(
        `https://finnhub.io/api/v1/stock/recommendation?symbol=${ticker}`
      );
    } catch (err) {
      console.log("Recommendation skipped:", ticker);
    }

    let epsEstimate = {};
    try {
      await wait(300);
      epsEstimate = await getFinnhub(
        `https://finnhub.io/api/v1/stock/eps-estimate?symbol=${ticker}&freq=annual`
      );
    } catch (err) {
      console.log("EPS estimate skipped:", ticker);
    }

    let revenueEstimate = {};
    try {
      await wait(300);
      revenueEstimate = await getFinnhub(
        `https://finnhub.io/api/v1/stock/revenue-estimate?symbol=${ticker}&freq=annual`
      );
    } catch (err) {
      console.log("Revenue estimate skipped:", ticker);
    }

    if (!quote || !quote.c || quote.c === 0) {
      await Stock.findOneAndUpdate(
        { ticker },
        {
          ticker,
          status: "failed",
          error: "No price returned",
          updatedAt: new Date()
        },
        { upsert: true }
      );

      console.log("FAILED:", ticker, "No price returned");
      return;
    }

    const latestRecommendation = recommendation?.[0];

    const rating =
      latestRecommendation?.strongBuy || latestRecommendation?.buy
        ? "buy"
        : latestRecommendation?.sell || latestRecommendation?.strongSell
        ? "sell"
        : latestRecommendation?.hold
        ? "hold"
        : "N/A";

    const epsEstimates = epsEstimate?.data || [];
    const revenueEstimates = revenueEstimate?.data || [];

const currentEps =
  epsEstimates[0]?.epsAvg ??
  metrics.epsEstimateCurrentYear ??
  metrics.epsInclExtraItemsAnnual ??
  null;

const nextEps =
  epsEstimates[1]?.epsAvg ??
  metrics.epsEstimateNextYear ??
  null;

const currentRevenue =
  revenueEstimates[0]?.revenueAvg ??
  metrics.revenuePerShareTTM ??
  null;

const nextRevenue =
  revenueEstimates[1]?.revenueAvg ??
  null;

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

          marketCap: profile.marketCapitalization
            ? profile.marketCapitalization * 1000000
            : null,

          sharesOutstanding: profile.shareOutstanding || null,

          pe: metrics.peNormalizedAnnual ?? metrics.peTTM ?? null,
          forwardPE: metrics.forwardPE ?? null,

          revenueGrowth: metrics.revenueGrowthTTMYoy ?? null,
          earningsGrowth: metrics.epsGrowthTTMYoy ?? null,

          grossMargins: metrics.grossMarginTTM ?? null,
          operatingMargins: metrics.operatingMarginTTM ?? null,
          profitMargins: metrics.netProfitMarginTTM ?? null,

freeCashflow:
  metrics.freeCashFlowTTM ??
  metrics.fcfTTM ??
  fmpCashFlow[0]?.freeCashFlow ??
  null,

targetMean:
  priceTarget?.targetMean ??
  metrics.ptMean ??
  fmpPriceTarget?.targetConsensus ??
  fmpPriceTarget?.targetMean ??
  null,
          recommendationKey: rating,

analystEstimates: {
  currentYear: {
revenue:
  fmpAnalystEstimates[0]?.revenueAvg ??
  currentRevenue ??
  null,

    earnings:
      fmpAnalystEstimates[0]?.netIncomeAvg ??
      null,

    eps:
      currentEps ??
      fmpAnalystEstimates[0]?.epsAvg ??
      null,
  },

  nextYear: {
revenue:
  fmpAnalystEstimates[1]?.revenueAvg ??
  nextRevenue ??
  null,

    earnings:
      fmpAnalystEstimates[1]?.netIncomeAvg ??
      null,

    eps:
      nextEps ??
      fmpAnalystEstimates[1]?.epsAvg ??
      null,
  },
},

          revenueData
        },
        error: null,
        updatedAt: new Date()
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
        updatedAt: new Date()
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
      await wait(2000);
    }

    console.log("Worker cycle complete");
  } catch (err) {
    console.log("Worker run failed:", err.message);
  }
}

run();

setInterval(run, 5 * 60 * 1000);