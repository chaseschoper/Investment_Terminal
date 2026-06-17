
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
const FINANCIAL_HISTORY_VERSION = 7;
const REVENUE_KEY_PRIORITY = {
  annualTotalRevenue: 5,
  annualOperatingRevenue: 4,
  annualNetInterestIncome: 3,
  annualTotalPremiumsEarned: 3,
  annualNonInterestIncome: 2
};

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

const firstNumber = (...values) => {
  for (const value of values) {
    const number = toNumberOrNull(value);
    if (number !== null && number !== 0) return number;
  }

  return null;
};

const normalizePercent = (value) => {
  const number = toNumberOrNull(value);
  if (number === null) return null;
  return Math.abs(number) <= 1 ? number * 100 : number;
};

const toDollarsFromBillions = (value) => {
  const number = toNumberOrNull(value);
  return number === null ? null : number * 1000000000;
};

const toDollarsFromMillions = (value) => {
  const number = toNumberOrNull(value);
  return number === null ? null : number * 1000000;
};

const normalizeFinnhubMoney = (value) => {
  const number = toNumberOrNull(value);
  if (number === null) return null;
  return Math.abs(number) < 10000000 ? toDollarsFromMillions(number) : number;
};

const fmpEstimateField = (row, ...keys) =>
  firstNumber(
    ...keys.map((key) => row?.[key]),
    ...keys.map((key) => row?.[key.replace(/Avg$/, "Average")])
  );

const normalizeRating = (value) => {
  if (!value) return null;

  const rating = String(value).toLowerCase().replace(/\s+/g, "_");
  if (["strong_buy", "buy", "outperform", "overweight"].includes(rating)) {
    return "buy";
  }
  if (["hold", "neutral", "market_perform", "equal_weight"].includes(rating)) {
    return "hold";
  }
  if (["strong_sell", "sell", "underperform", "underweight"].includes(rating)) {
    return "sell";
  }

  return null;
};

const safeGrowthRate = (...values) => {
  for (const value of values) {
    const number = toNumberOrNull(value);
    if (number === null || number === 0) continue;

    const rate = Math.abs(number) > 1 ? number / 100 : number;
    if (rate > -0.8 && rate < 1.5) return rate;
  }

  return 0.05;
};

const estimateNextValue = (current, growthRate) => {
  const number = toNumberOrNull(current);
  if (number === null) return null;
  return number * (1 + growthRate);
};

const getAnalystRating = (recommendation, fallback) => {
  const latest = recommendation?.[0] || {};
  const strongBuy = toNumberOrNull(latest.strongBuy) || 0;
  const buy = toNumberOrNull(latest.buy) || 0;
  const hold = toNumberOrNull(latest.hold) || 0;
  const sell = toNumberOrNull(latest.sell) || 0;
  const strongSell = toNumberOrNull(latest.strongSell) || 0;
  const total = strongBuy + buy + hold + sell + strongSell;

  if (total) {
    const score =
      (strongBuy + buy * 2 + hold * 3 + sell * 4 + strongSell * 5) / total;

    if (score <= 2.5) return "buy";
    if (score >= 3.5) return "sell";
    return "hold";
  }

  return normalizeRating(fallback) || "N/A";
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
    earnings:
      row.earnings ??
      (row.eps !== null && row.eps !== undefined
        ? (row.eps * shares) / 1000
        : null),
    eps:
      row.eps ??
      (row.earnings !== null && row.earnings !== undefined
        ? (row.earnings * 1000) / shares
        : null)
  }));
}

function finalizeFinancialHistory(rows, sharesOutstanding) {
  return fillEstimatedEps(rows, sharesOutstanding).map((row) => ({
    year: row.year,
    revenue: toNumberOrNull(row.revenue),
    earnings: toNumberOrNull(row.earnings),
    eps: toNumberOrNull(row.eps),
    source: row.source
  }));
}

function finalizeRevenueHistory(rows) {
  const revenueRows = (rows || [])
    .map((row) => ({
      year: row.year,
      revenue: toNumberOrNull(row.revenue),
      source: row.source
    }))
    .filter((row) => row.year && row.revenue !== null)
    .sort((a, b) => a.year - b.year)
    .slice(-6);

  const positiveRevenues = revenueRows
    .map((row) => row.revenue)
    .filter((value) => value > 0)
    .sort((a, b) => a - b);

  if (positiveRevenues.length < 3) return revenueRows;

  const median =
    positiveRevenues[Math.floor(positiveRevenues.length / 2)];

  return revenueRows.filter(
    (row) => row.revenue <= 0 || row.revenue >= median * 0.1
  );
}

function hasChartHistory(stock, key) {
  return stock?.data?.revenueData?.some((row) => toNumberOrNull(row[key]) !== null);
}

function hasCompleteChartHistory(stock) {
  return (
    hasChartHistory(stock, "revenue") &&
    hasChartHistory(stock, "earnings") &&
    hasChartHistory(stock, "eps")
  );
}

function needsFinancialHistoryRefresh(stock) {
  return (
    stock?.data?.financialHistoryVersion !== FINANCIAL_HISTORY_VERSION ||
    !hasCompleteChartHistory(stock)
  );
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
      "annualGrossProfit",
      "annualOperatingIncome",
      "annualFreeCashFlow",
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

        if (REVENUE_KEY_PRIORITY[key]) {
          const priority = REVENUE_KEY_PRIORITY[key];

          if (!row.revenuePriority || priority > row.revenuePriority) {
            row.revenue = toBillions(value);
            row.revenuePriority = priority;
          }
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

        if (key === "annualGrossProfit") {
          row.grossProfit = row.grossProfit ?? toBillions(value);
        }

        if (key === "annualOperatingIncome") {
          row.operatingIncome = row.operatingIncome ?? toBillions(value);
        }

        if (key === "annualFreeCashFlow") {
          row.freeCashflow = row.freeCashflow ?? toBillions(value);
        }

        rowsByTime.set(timestamp, row);
      });
    });

    return [...rowsByTime.values()]
      .map(({ revenuePriority, ...row }) => row)
      .filter((row) => row.year)
      .sort((a, b) => a.year - b.year);
  } catch (err) {
    console.log("Yahoo time-series financials skipped:", ticker, err.message);
    return [];
  }
}

async function fetchYahooFinancialHistory(ticker) {
  const timeSeriesHistory = await fetchYahooTimeSeriesFinancials(ticker);

  try {
    if (hasCompleteChartHistory({ data: { revenueData: timeSeriesHistory } })) {
      return timeSeriesHistory;
    }

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

    return mergeHistoricalFinancials(
      timeSeriesHistory,
      mergeHistoricalFinancials(incomeHistory, earningsHistory)
    );
  } catch (err) {
    console.log("Yahoo financial history skipped:", ticker, err.message);
    return timeSeriesHistory;
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

async function fetchYahooSupplementalData(ticker) {
  try {
    const summary = await yahooFinance.quoteSummary(ticker, {
      modules: [
        "financialData",
        "defaultKeyStatistics",
        "summaryDetail",
        "earningsTrend"
      ]
    });

    const financialData = summary?.financialData || {};
    const keyStats = summary?.defaultKeyStatistics || {};
    const detail = summary?.summaryDetail || {};
    const trends = summary?.earningsTrend?.trend || [];

    const currentYear =
      trends.find((item) => item.period === "0y") || {};
    const nextYear =
      trends.find((item) => item.period === "+1y") || {};

    const estimateFromTrend = (trend) => ({
      revenue: firstNumber(trend?.revenueEstimate?.avg),
      earnings: null,
      eps: firstNumber(trend?.earningsEstimate?.avg)
    });

    return {
      marketCap: firstNumber(detail.marketCap, keyStats.marketCap),
      pe: firstNumber(detail.trailingPE, keyStats.trailingPE),
      forwardPE: firstNumber(keyStats.forwardPE, financialData.forwardPE),
      sharesOutstanding: firstNumber(keyStats.sharesOutstanding),
      revenueGrowth: normalizePercent(financialData.revenueGrowth),
      earningsGrowth: normalizePercent(financialData.earningsGrowth),
      grossMargins: normalizePercent(financialData.grossMargins),
      operatingMargins: normalizePercent(financialData.operatingMargins),
      profitMargins: normalizePercent(financialData.profitMargins),
      freeCashflow: firstNumber(financialData.freeCashflow),
      targetMean: firstNumber(financialData.targetMeanPrice),
      recommendationKey: financialData.recommendationKey || null,
      analystEstimates: {
        currentYear: estimateFromTrend(currentYear),
        nextYear: estimateFromTrend(nextYear)
      }
    };
  } catch (err) {
    console.log("Yahoo supplemental data skipped:", ticker, err.message);
    return {};
  }
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

  let metricData = {};
  try {
    metricData = await getFinnhub(
      `https://finnhub.io/api/v1/stock/metric?symbol=${ticker}&metric=all`
    );
  } catch (err) {
    console.log("Finnhub metrics skipped:", ticker, err.message);
  }

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
  const yahooSupplementalData = await fetchYahooSupplementalData(ticker);

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

  const revenueData = finalizeFinancialHistory(
    mergeHistoricalFinancials(
      yahooFinancialData,
      mergeHistoricalFinancials(
        fmpIncomeStatementData,
        mergeHistoricalFinancials(finnhubReportedData, finnhubMetricData)
      )
    ),
    sharesOutstanding
  );
  const revenueHistory = finalizeRevenueHistory(
    mergeHistoricalFinancials(
      yahooFinancialData,
      mergeHistoricalFinancials(fmpIncomeStatementData, finnhubReportedData)
    )
  );
  const annualRows = [...yahooFinancialData]
    .filter((row) => row.year)
    .sort((a, b) => a.year - b.year);
  const latestAnnual = annualRows[annualRows.length - 1] || {};
  const previousAnnual = annualRows[annualRows.length - 2] || {};

  const annualGrowth = (current, previous) => {
    const currentNumber = toNumberOrNull(current);
    const previousNumber = toNumberOrNull(previous);

    if (currentNumber === null || previousNumber === null || previousNumber === 0) {
      return null;
    }

    return ((currentNumber - previousNumber) / Math.abs(previousNumber)) * 100;
  };

  const annualMargin = (numerator, revenue) => {
    const numeratorNumber = toNumberOrNull(numerator);
    const revenueNumber = toNumberOrNull(revenue);

    if (numeratorNumber === null || revenueNumber === null || revenueNumber === 0) {
      return null;
    }

    return (numeratorNumber / revenueNumber) * 100;
  };

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

  const epsEstimates = epsEstimate?.data || [];
  const revenueEstimates = revenueEstimate?.data || [];
  const fmpCurrentEstimate = fmpAnalystEstimates[0] || {};
  const fmpNextEstimate = fmpAnalystEstimates[1] || {};
  const revenueGrowthRate = safeGrowthRate(
    metrics.revenueGrowthTTMYoy,
    yahooSupplementalData.revenueGrowth,
    annualGrowth(latestAnnual.revenue, previousAnnual.revenue)
  );
  const earningsGrowthRate = safeGrowthRate(
    metrics.epsGrowthTTMYoy,
    yahooSupplementalData.earningsGrowth,
    annualGrowth(latestAnnual.earnings, previousAnnual.earnings),
    revenueGrowthRate
  );
  const currentRevenueBase = toDollarsFromBillions(latestAnnual.revenue);
  const currentEarningsBase = toDollarsFromBillions(latestAnnual.earnings);
  const currentEpsBase = latestAnnual.eps ?? null;
  const rating = getAnalystRating(
    recommendation,
    yahooSupplementalData.recommendationKey
  );

  const currentEps =
    fmpEstimateField(fmpCurrentEstimate, "epsAvg", "estimatedEpsAvg") ??
    epsEstimates[0]?.epsAvg ??
    metrics.epsEstimateCurrentYear ??
    metrics.epsInclExtraItemsAnnual ??
    currentEpsBase ??
    null;

  const nextEps =
    fmpEstimateField(fmpNextEstimate, "epsAvg", "estimatedEpsAvg") ??
    epsEstimates[1]?.epsAvg ??
    metrics.epsEstimateNextYear ??
    estimateNextValue(currentEps, earningsGrowthRate) ??
    null;

  const currentRevenue =
    fmpEstimateField(
      fmpCurrentEstimate,
      "revenueAvg",
      "estimatedRevenueAvg"
    ) ??
    yahooSupplementalData.analystEstimates?.currentYear?.revenue ??
    normalizeFinnhubMoney(revenueEstimates[0]?.revenueAvg) ??
    currentRevenueBase;

  const nextRevenue =
    fmpEstimateField(
      fmpNextEstimate,
      "revenueAvg",
      "estimatedRevenueAvg"
    ) ??
    yahooSupplementalData.analystEstimates?.nextYear?.revenue ??
    normalizeFinnhubMoney(revenueEstimates[1]?.revenueAvg) ??
    estimateNextValue(currentRevenue, revenueGrowthRate);

  const currentEarnings =
    firstNumber(
      fmpEstimateField(
        fmpCurrentEstimate,
        "netIncomeAvg",
        "estimatedNetIncomeAvg"
      ),
      currentEarningsBase,
      currentEps && sharesOutstanding
        ? currentEps * sharesOutstanding * 1000000
        : null
    );

  const nextEarnings =
    firstNumber(
      fmpEstimateField(
        fmpNextEstimate,
        "netIncomeAvg",
        "estimatedNetIncomeAvg"
      ),
      nextEps && sharesOutstanding
        ? nextEps * sharesOutstanding * 1000000
        : null,
      estimateNextValue(currentEarnings, earningsGrowthRate)
    );

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
    marketCap: yahooSupplementalData.marketCap ??
      (profile.marketCapitalization
      ? profile.marketCapitalization * 1000000
      : null),
    sharesOutstanding:
      sharesOutstanding ??
      (yahooSupplementalData.sharesOutstanding
        ? yahooSupplementalData.sharesOutstanding / 1000000
        : null),
    pe: firstNumber(metrics.peNormalizedAnnual, metrics.peTTM, yahooSupplementalData.pe),
    forwardPE: firstNumber(metrics.forwardPE, yahooSupplementalData.forwardPE),
    revenueGrowth: firstNumber(
      metrics.revenueGrowthTTMYoy,
      yahooSupplementalData.revenueGrowth,
      annualGrowth(latestAnnual.revenue, previousAnnual.revenue)
    ),
    earningsGrowth: firstNumber(
      metrics.epsGrowthTTMYoy,
      yahooSupplementalData.earningsGrowth,
      annualGrowth(latestAnnual.earnings, previousAnnual.earnings)
    ),
    grossMargins: firstNumber(
      metrics.grossMarginTTM,
      yahooSupplementalData.grossMargins,
      annualMargin(latestAnnual.grossProfit, latestAnnual.revenue)
    ),
    operatingMargins: firstNumber(
      metrics.operatingMarginTTM,
      yahooSupplementalData.operatingMargins,
      annualMargin(latestAnnual.operatingIncome, latestAnnual.revenue)
    ),
    profitMargins: firstNumber(
      metrics.netProfitMarginTTM,
      yahooSupplementalData.profitMargins,
      annualMargin(latestAnnual.earnings, latestAnnual.revenue)
    ),
    freeCashflow:
      firstNumber(
        fmpCashFlow[0]?.freeCashFlow,
        fmpCashFlow[0]?.freeCashflow,
        yahooSupplementalData.freeCashflow,
        normalizeFinnhubMoney(metrics.freeCashFlowTTM),
        normalizeFinnhubMoney(metrics.fcfTTM),
        toDollarsFromBillions(latestAnnual.freeCashflow)
      ),
    targetMean:
      firstNumber(
        priceTarget?.targetMean,
        priceTarget?.targetMedian,
        metrics.ptMean,
        fmpPriceTarget?.targetConsensus,
        fmpPriceTarget?.targetMean,
        fmpPriceTarget?.targetMedian,
        fmpPriceTarget?.targetAverage,
        fmpPriceTarget?.priceTarget,
        fmpPriceTarget?.targetPrice,
        yahooSupplementalData.targetMean
      ),
    recommendationKey: rating,
    analystEstimates: {
      currentYear: {
        revenue: currentRevenue,
        earnings: currentEarnings,
        eps: currentEps
      },
      nextYear: {
        revenue: nextRevenue,
        earnings: nextEarnings,
        eps: nextEps
      }
    },
    financialHistoryVersion: FINANCIAL_HISTORY_VERSION,
    revenueHistory,
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

      if (stock.data && Object.keys(stock.data).length) {
        return res.json({
          ticker: stock.ticker,
          status: "ready",
          refreshing: true,
          ...stock.data,
          error: stock.error,
          updatedAt: stock.updatedAt
        });
      }

      return res.status(202).json({
        ticker: stock.ticker,
        status: "pending",
        message: `${ticker} is still updating. Refresh in 30-60 seconds.`,
        updatedAt: stock.updatedAt
      });
    }

    if (stock.status === "ready" && needsFinancialHistoryRefresh(stock)) {
      const updatedAt = stock.updatedAt ? new Date(stock.updatedAt) : null;
      const isOutdated =
        stock.data?.financialHistoryVersion !== FINANCIAL_HISTORY_VERSION;
      const isStale =
        isOutdated ||
        !updatedAt ||
        Date.now() - updatedAt.getTime() > 10 * 60 * 1000;

      if (isStale) {
        startStockFetch(ticker);

        return res.json({
          ticker: stock.ticker,
          status: "ready",
          refreshing: true,
          ...stock.data,
          error: stock.error,
          updatedAt: stock.updatedAt
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
