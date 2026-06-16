
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const axios = require("axios");
const cheerio = require("cheerio");
const mongoose = require("mongoose");
const yahooFinance = require("yahoo-finance2").default;

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const Stock = require("./models/Stock");
const User = require("./models/User");

const app = express();
const activeStockFetches = new Set();

// =========================
// BASIC SETUP
// =========================
app.use(cors({ origin: "*" }));
app.use(express.json());

app.use((req, res, next) => {
res.setHeader("Cache-Control", "no-store");
next();
});

// =========================
// DB CONNECTION
// =========================
mongoose
.connect(process.env.MONGO_URI)
.then(() => console.log("MongoDB connected"))
.catch(err => console.error(err));

// =========================
// AUTH MIDDLEWARE
// =========================
const authMiddleware = async (req, res, next) => {
try {
const token = req.headers.authorization?.split(" ")[1];
if (!token) return res.status(401).json({ error: "No token" });


const decoded = jwt.verify(token, process.env.JWT_SECRET);

req.user = await User.findById(decoded.id);
next();


} catch (err) {
return res.status(401).json({ error: "Invalid token" });
}
};


// =========================
// FETCH STOCK DATA HELPER
// =========================
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getFinnhub(url) {
  const res = await axios.get(`${url}&token=${process.env.FINNHUB_API_KEY}`);
  return res.data;
}

function findFinancialValue(items, concepts) {
  const row = items.find((item) => concepts.includes(item.concept));
  return row?.value ?? null;
}

const toNumberOrNull = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const toBillions = (value) => {
  const number = toNumberOrNull(value);
  return number === null ? null : number / 1000000000;
};

const unwrapFinancialValue = (value) => {
  if (value && typeof value === "object" && "raw" in value) {
    return toNumberOrNull(value.raw);
  }

  return toNumberOrNull(value);
};

const getStatementYear = (value) => {
  if (!value) return null;

  if (value instanceof Date) {
    return value.getFullYear();
  }

  if (value && typeof value === "object") {
    return getStatementYear(value.raw || value.fmt);
  }

  if (typeof value === "number") {
    const date = new Date(value * 1000);
    return Number.isNaN(date.getTime()) ? null : date.getFullYear();
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? Number(value) || null : date.getFullYear();
};

function mergeHistoricalFinancials(primary, fallback) {
  const rowsByYear = new Map();

  [...fallback, ...primary].forEach((row) => {
    if (!row?.year) return;

    const existing = rowsByYear.get(row.year) || { year: row.year };

    rowsByYear.set(row.year, {
      year: row.year,
      revenue: row.revenue ?? existing.revenue ?? null,
      earnings: row.earnings ?? existing.earnings ?? null,
      eps: row.eps ?? existing.eps ?? null,
      source: row.source || existing.source
    });
  });

  return [...rowsByYear.values()]
    .filter((row) =>
      row.revenue !== null ||
      row.earnings !== null ||
      row.eps !== null
    )
    .sort((a, b) => a.year - b.year)
    .slice(-6);
}

function fillEstimatedEps(rows, sharesOutstanding) {
  const shares = toNumberOrNull(sharesOutstanding);
  if (!shares) return rows;

  return rows.map((row) => ({
    ...row,
    eps:
      row.eps ??
      (row.earnings !== null && row.earnings !== undefined
        ? (row.earnings * 1000) / shares
        : null)
  }));
}

function hasRevenueHistory(stock) {
  return stock?.data?.revenueData?.some((row) => toNumberOrNull(row.revenue) !== null);
}

async function fetchYahooTimeSeriesFinancials(ticker) {
  try {
    const period1 = Math.floor(new Date("2016-01-01").getTime() / 1000);
    const period2 = Math.floor(Date.now() / 1000);
    const types = [
      "annualTotalRevenue",
      "annualOperatingRevenue",
      "annualNetInterestIncome",
      "annualNonInterestIncome",
      "annualTotalPremiumsEarned",
      "annualNetIncome",
      "annualNetIncomeCommonStockholders",
      "annualNetIncomeContinuousOperations",
      "annualDilutedEPS",
      "annualBasicEPS"
    ].join(",");

    const response = await axios.get(
      `https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${ticker}`,
      {
        params: {
          period1,
          period2,
          type: types
        },
        headers: {
          "User-Agent": "Mozilla/5.0"
        }
      }
    );

    const rowsByTime = new Map();
    const results = response.data?.timeseries?.result || [];

    results.forEach((result) => {
      const key = Object.keys(result).find((item) => item.startsWith("annual"));
      if (!key || !Array.isArray(result.timestamp)) return;

      result.timestamp.forEach((timestamp, index) => {
        const rawValue = result[key]?.[index]?.reportedValue?.raw;
        const value = toNumberOrNull(rawValue);
        if (value === null) return;

        const row = rowsByTime.get(timestamp) || {
          year: getStatementYear(timestamp),
          source: "Yahoo time series"
        };

        if (
          [
            "annualTotalRevenue",
            "annualOperatingRevenue",
            "annualNetInterestIncome",
            "annualNonInterestIncome",
            "annualTotalPremiumsEarned"
          ].includes(key)
        ) {
          row.revenue = row.revenue ?? toBillions(value);
        }

        if (
          [
            "annualNetIncome",
            "annualNetIncomeCommonStockholders",
            "annualNetIncomeContinuousOperations"
          ].includes(key)
        ) {
          row.earnings = row.earnings ?? toBillions(value);
        }

        if (["annualDilutedEPS", "annualBasicEPS"].includes(key)) {
          row.eps = row.eps ?? value;
        }

        rowsByTime.set(timestamp, row);
      });
    });

    return [...rowsByTime.values()]
      .filter((row) => row.year)
      .sort((a, b) => a.year - b.year);
  } catch (err) {
    console.log("Yahoo time-series financials skipped:", ticker, err.message);
    return [];
  }
}

async function fetchYahooFinancialHistory(ticker) {
  try {
    const summary = await yahooFinance.quoteSummary(ticker, {
      modules: ["incomeStatementHistory", "earnings"]
    });

    const incomeRows =
      summary?.incomeStatementHistory?.incomeStatementHistory || [];

    const incomeHistory = incomeRows
      .map((row) => ({
        year: getStatementYear(row.endDate),
        revenue: toBillions(unwrapFinancialValue(row.totalRevenue)),
        earnings: toBillions(unwrapFinancialValue(row.netIncome)),
        eps: toNumberOrNull(
          unwrapFinancialValue(row.dilutedEPS) ??
            unwrapFinancialValue(row.basicEPS)
        ),
        source: "Yahoo income statement"
      }))
      .filter((row) => row.year)
      .sort((a, b) => a.year - b.year);

    const earningsRows = summary?.earnings?.financialsChart?.yearly || [];

    const earningsHistory = earningsRows
      .map((row) => ({
        year: getStatementYear(row.date),
        revenue: toBillions(unwrapFinancialValue(row.revenue)),
        earnings: toBillions(unwrapFinancialValue(row.earnings)),
        eps: null,
        source: "Yahoo earnings"
      }))
      .filter((row) => row.year)
      .sort((a, b) => a.year - b.year);

    const timeSeriesHistory = await fetchYahooTimeSeriesFinancials(ticker);

    return mergeHistoricalFinancials(
      timeSeriesHistory,
      mergeHistoricalFinancials(incomeHistory, earningsHistory)
    );
  } catch (err) {
    console.log("Yahoo financial history skipped:", ticker, err.message);
    return fetchYahooTimeSeriesFinancials(ticker);
  }
}

async function fetchFmpIncomeStatementHistory(ticker) {
  if (!process.env.FMP_API_KEY) return [];

  const urls = [
    `https://financialmodelingprep.com/stable/income-statement?symbol=${ticker}&period=annual&limit=6&apikey=${process.env.FMP_API_KEY}`,
    `https://financialmodelingprep.com/api/v3/income-statement/${ticker}?period=annual&limit=6&apikey=${process.env.FMP_API_KEY}`
  ];

  for (const url of urls) {
    try {
      const incomeRes = await axios.get(url);
      const incomeRows = Array.isArray(incomeRes.data) ? incomeRes.data : [];

      const rows = incomeRows
        .map((row) => ({
          year: Number(row.calendarYear || String(row.date || "").slice(0, 4)),
          revenue: toBillions(row.revenue),
          earnings: toBillions(row.netIncome),
          eps: toNumberOrNull(row.epsDiluted ?? row.epsdiluted ?? row.eps),
          source: "FMP income statement"
        }))
        .filter((row) => row.year)
        .sort((a, b) => a.year - b.year);

      if (rows.length) return rows;
    } catch (err) {
      console.log("FMP income statement skipped:", ticker, err.message);
    }
  }

  return [];
}

async function fetchStockData(ticker) {
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
  const sharesOutstanding = profile.shareOutstanding || null;

  let finnhubReportedData = [];
  let finnhubMetricData = [];

  try {
    await wait(300);

    const financials = await getFinnhub(
      `https://finnhub.io/api/v1/stock/financials-reported?symbol=${ticker}&freq=annual`
    );

    const reports = financials?.data || [];

    finnhubReportedData = reports
      .slice(0, 5)
      .map((report) => {
        const ic = report.report?.ic || [];

        const revenue = findFinancialValue(ic, [
          "us-gaap_Revenues",
          "us-gaap_RevenueFromContractWithCustomerExcludingAssessedTax",
          "us-gaap_RevenueFromContractWithCustomerIncludingAssessedTax",
          "us-gaap_SalesRevenueNet",
          "us-gaap_SalesRevenueGoodsNet",
          "us-gaap_RevenuesNetOfInterestExpense",
          "us-gaap_TotalRevenuesAndOtherIncome",
          "us-gaap_InterestAndDividendIncomeOperating",
          "us-gaap_NoninterestIncome",
          "us-gaap_PremiumsEarnedNet",
          "us-gaap_RealEstateRevenueNet",
          "ifrs-full_Revenue"
        ]);

        const earnings = findFinancialValue(ic, [
          "us-gaap_NetIncomeLoss",
          "us-gaap_NetIncomeLossAvailableToCommonStockholdersBasic",
          "us-gaap_NetIncomeLossAvailableToCommonStockholdersDiluted",
          "us-gaap_ProfitLoss",
          "ifrs-full_ProfitLoss"
        ]);

        const eps = findFinancialValue(ic, [
          "us-gaap_EarningsPerShareDiluted",
          "us-gaap_EarningsPerShareBasic",
          "us-gaap_EarningsPerShareBasicAndDiluted"
        ]);

        return {
          year: report.year,
          revenue: revenue ? revenue / 1000000000 : null,
          earnings: earnings ? earnings / 1000000000 : null,
          eps: eps ?? null,
          source: "Finnhub filings"
        };
      })
      .filter((item) => item.year)
      .reverse();

  } catch (err) {
    console.log("Financials skipped:", ticker, err.message);
  }

  const annual = metricData?.series?.annual || {};
  const revenues = annual.revenue || [];
  const netIncome = annual.netIncome || [];
  const eps = annual.eps || [];

  finnhubMetricData = revenues
    .slice(0, 6)
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
        revenue: toBillions(item.v),
        earnings: toBillions(incomeItem?.v),
        eps: toNumberOrNull(epsItem?.v),
        source: "Finnhub metrics"
      };
    })
    .filter((item) => item.year)
    .sort((a, b) => a.year - b.year);

  let priceTarget = {};
  try {
    await wait(300);
    priceTarget = await getFinnhub(
      `https://finnhub.io/api/v1/stock/price-target?symbol=${ticker}`
    );
  } catch (err) {
    console.log("Price target skipped:", ticker, err.message);
  }

  let fmpCashFlow = [];
  let fmpPriceTarget = {};
  let fmpAnalystEstimates = [];
  const yahooFinancialData = await fetchYahooFinancialHistory(ticker);
  const fmpIncomeStatementData = await fetchFmpIncomeStatementHistory(ticker);

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

  const revenueData = fillEstimatedEps(
    mergeHistoricalFinancials(
      fmpIncomeStatementData,
      mergeHistoricalFinancials(
        yahooFinancialData,
        mergeHistoricalFinancials(finnhubReportedData, finnhubMetricData)
      )
    ),
    sharesOutstanding
  );

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
    console.log("Recommendation skipped:", ticker, err.message);
  }

  let epsEstimate = {};
  try {
    await wait(300);
    epsEstimate = await getFinnhub(
      `https://finnhub.io/api/v1/stock/eps-estimate?symbol=${ticker}&freq=annual`
    );
  } catch (err) {
    console.log("EPS estimate skipped:", ticker, err.message);
  }

  let revenueEstimate = {};
  try {
    await wait(300);
    revenueEstimate = await getFinnhub(
      `https://finnhub.io/api/v1/stock/revenue-estimate?symbol=${ticker}&freq=annual`
    );
  } catch (err) {
    console.log("Revenue estimate skipped:", ticker, err.message);
  }

  if (!quote || !quote.c || quote.c === 0) {
    throw new Error("No price returned");
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

  const data = {
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
    sharesOutstanding,
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
        revenue: fmpAnalystEstimates[0]?.revenueAvg ?? currentRevenue ?? null,
        earnings: fmpAnalystEstimates[0]?.netIncomeAvg ?? null,
        eps: currentEps ?? fmpAnalystEstimates[0]?.epsAvg ?? null
      },
      nextYear: {
        revenue: fmpAnalystEstimates[1]?.revenueAvg ?? nextRevenue ?? null,
        earnings: fmpAnalystEstimates[1]?.netIncomeAvg ?? null,
        eps: nextEps ?? fmpAnalystEstimates[1]?.epsAvg ?? null
      }
    },
    revenueData
  };

  await Stock.findOneAndUpdate(
    { ticker },
    {
      ticker,
      status: "ready",
      data,
      updatedAt: new Date()
    },
    { upsert: true }
  );

  return data;
}

async function markStockFetchFailed(ticker, error) {
  await Stock.findOneAndUpdate(
    { ticker },
    {
      ticker,
      status: "failed",
      error: error.message || "Stock data fetch failed",
      updatedAt: new Date()
    },
    { upsert: true }
  );
}

function startStockFetch(ticker) {
  if (activeStockFetches.has(ticker)) return;

  activeStockFetches.add(ticker);

  fetchStockData(ticker)
    .catch(async (err) => {
      console.error(`Stock fetch failed for ${ticker}:`, err.message);
      await markStockFetchFailed(ticker, err);
    })
    .finally(() => {
      activeStockFetches.delete(ticker);
    });
}

// =========================
// STOCK ROUTE - AUTO ONBOARD TICKERS
// =========================
app.get("/api/stock/:ticker", async (req, res) => {
  try {
    const ticker = req.params.ticker.trim().toUpperCase();

    if (!ticker || ticker.length > 10) {
      return res.status(400).json({
        error: "Invalid ticker"
      });
    }

    let stock = await Stock.findOne({ ticker });

    if (!stock) {
      stock = await Stock.findOneAndUpdate(
        { ticker },
        {
          ticker,
          status: "pending",
          data: {},
          updatedAt: new Date()
        },
        {
          upsert: true,
          new: true
        }
      );

      startStockFetch(ticker);

      return res.status(202).json({
        ticker,
        status: "pending",
        message: `${ticker} has been added. Data is being fetched. Refresh in 30-60 seconds.`
      });
    }

    if (stock.status === "pending") {
      const updatedAt = stock.updatedAt ? new Date(stock.updatedAt) : null;
      const isStale =
        !updatedAt || Date.now() - updatedAt.getTime() > 2 * 60 * 1000;

      if (isStale) {
        await Stock.findOneAndUpdate(
          { ticker },
          {
            status: "pending",
            error: null,
            updatedAt: new Date()
          }
        );

        startStockFetch(ticker);
      }

      return res.status(202).json({
        ticker: stock.ticker,
        status: "pending",
        message: `${ticker} is still updating. Refresh in 30-60 seconds.`,
        updatedAt: stock.updatedAt
      });
    }

    if (stock.status === "ready" && !hasRevenueHistory(stock)) {
      const updatedAt = stock.updatedAt ? new Date(stock.updatedAt) : null;
      const isStale =
        !updatedAt || Date.now() - updatedAt.getTime() > 10 * 60 * 1000;

      if (isStale) {
        await Stock.findOneAndUpdate(
          { ticker },
          {
            status: "pending",
            error: null,
            updatedAt: new Date()
          }
        );

        startStockFetch(ticker);

        return res.status(202).json({
          ticker,
          status: "pending",
          message: `${ticker} revenue history is being refreshed. Refresh in 30-60 seconds.`,
          updatedAt: new Date()
        });
      }
    }

    if (stock.status === "failed") {
      await Stock.findOneAndUpdate(
        { ticker },
        {
          status: "pending",
          error: null,
          updatedAt: new Date()
        }
      );

      startStockFetch(ticker);

      return res.status(202).json({
        ticker,
        status: "pending",
        message: `${ticker} is being retried. Refresh in 30-60 seconds.`,
        updatedAt: new Date()
      });
    }

    return res.json({
      ticker: stock.ticker,
      status: stock.status,
      ...stock.data,
      error: stock.error,
      updatedAt: stock.updatedAt
    });

  } catch (err) {
    console.error("Stock fetch failed:", err.message);
    res.status(500).json({ error: "Stock fetch failed" });
  }
});
// =========================
// AI ANALYSIS (DB ONLY)
// =========================
app.get("/api/ai-analysis/:ticker", async (req, res) => {
try {
const ticker = req.params.ticker.toUpperCase();


const stock = await Stock.findOne({ ticker });

if (!stock) {
  return res.status(404).json({ error: "No stock data found" });
}

const analysis = `


${stock.ticker}

Price: $${stock.data?.price}

Market Cap: ${stock.data?.marketCap}

PE: ${stock.data?.pe}

Forward PE: ${stock.data?.forwardPE}

Revenue Growth: ${stock.data?.revenueGrowth}

Earnings Growth: ${stock.data?.earningsGrowth}
`;


res.json({ analysis });


} catch (err) {
console.error(err);
res.status(500).json({ error: "AI analysis failed" });
}
});

// =========================
// EARNINGS CALENDAR
// =========================
app.get("/api/earnings", async (req, res) => {
try {
const response = await axios.get(
"https://www.investing.com/earnings-calendar/",
{
timeout: 10000,
headers: {
"User-Agent":
"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
"Accept-Language": "en-US,en;q=0.9"
}
}
);


const $ = cheerio.load(response.data);
const earnings = [];

$("tr").each((_, el) => {
  const tds = $(el).find("td");
  if (tds.length < 8) return;

  const date = $(tds[0]).text().trim();
  const symbol = $(tds[1]).text().trim();
  const company = $(tds[2]).text().trim();
  const estimate = $(tds[7]).text().trim();

  if (symbol && company && date) {
    earnings.push({
      symbol,
      company,
      earningsDate: date,
      estimate: estimate || "N/A"
    });
  }
});

res.json(earnings.slice(0, 50));


} catch (err) {
console.error("Earnings error:", err.message);
res.json([]);
}
});

// =========================
// AUTH ROUTES
// =========================

// SIGNUP
app.post("/api/signup", async (req, res) => {
try {
const { username, email, password } = req.body;


const exists = await User.findOne({ email });
if (exists) return res.status(400).json({ error: "User exists" });

const hashed = await bcrypt.hash(password, 10);

const user = new User({
  username,
  email,
  password: hashed
});

await user.save();

const token = jwt.sign(
  { id: user._id },
  process.env.JWT_SECRET,
  { expiresIn: "7d" }
);

res.json({
  success: true,
  token,
  user
});


} catch (err) {
console.error(err);
res.status(500).json({ error: "Signup failed" });
}
});

// LOGIN
app.post("/api/login", async (req, res) => {
try {
const { email, password } = req.body;


const user = await User.findOne({ email });
if (!user) return res.status(400).json({ error: "Invalid credentials" });

const valid = await bcrypt.compare(password, user.password);
if (!valid) return res.status(400).json({ error: "Invalid credentials" });

const token = jwt.sign(
  { id: user._id },
  process.env.JWT_SECRET,
  { expiresIn: "7d" }
);

res.json({
  success: true,
  token,
  user
});


} catch (err) {
console.error(err);
res.status(500).json({ error: "Login failed" });
}
});

// SAVE USER DATA
app.post("/api/save-data", authMiddleware, async (req, res) => {
try {
const { watchlist, portfolio } = req.body;

req.user.watchlist = watchlist;
req.user.portfolio = portfolio;

await req.user.save();

res.json({ success: true });


} catch (err) {
res.status(500).json({ error: "Save failed" });
}
});

// GET USER DATA
app.get("/api/user-data", authMiddleware, async (req, res) => {
res.json({
watchlist: req.user.watchlist || [],
portfolio: req.user.portfolio || []
});
});

// =========================
// HEALTH
// =========================
app.get("/health", (req, res) => {
res.json({ status: "ok" });
});

// =========================
// START SERVER
// =========================
const PORT = process.env.PORT || 5001;

app.listen(PORT, () => {
console.log(`Server running on port ${PORT}`);
});
