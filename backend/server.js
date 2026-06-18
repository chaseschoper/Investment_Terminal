
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
const yahooSupplementalFetches = new Map();
const FINANCIAL_HISTORY_VERSION = 23;
const secMarginCache = new Map();
let secTickerMapPromise;
const TICKER_ALIASES = {
  ZILLOW: "Z",
  SALESFORCE: "CRM",
  NIKE: "NKE"
};
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

async function getFmpData(ticker, label, endpoints) {
  if (!process.env.FMP_API_KEY) return null;

  for (const endpoint of endpoints) {
    const path = endpoint.replace("{ticker}", ticker);
    const separator = path.includes("?") ? "&" : "?";
    const url = `https://financialmodelingprep.com${path}${separator}apikey=${process.env.FMP_API_KEY}`;

    try {
      const res = await axios.get(url);
      const data = res.data;
      if (data?.["Error Message"] || data?.error) continue;
      if (Array.isArray(data) && !data.length) continue;
      if (data && typeof data === "object") return data;
    } catch (err) {
      console.log(`FMP ${label} endpoint skipped:`, ticker, err.response?.status || err.message);
    }
  }

  return null;
}

const parseNasdaqNumber = (value) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (!value || value === "N/A") return null;
  const number = Number(String(value).replace(/[$,%\s,]/g, ""));
  return Number.isFinite(number) ? number : null;
};

async function fetchNasdaqData(ticker) {
  const headers = {
    "User-Agent": "Mozilla/5.0 AppleWebKit/537.36 Chrome/124 Safari/537.36",
    Accept: "application/json, text/plain, */*",
    Origin: "https://www.nasdaq.com",
    Referer: `https://www.nasdaq.com/market-activity/stocks/${ticker.toLowerCase()}`
  };

  try {
    const [forecastResponse, summaryResponse] = await Promise.all([
      axios.get(`https://api.nasdaq.com/api/analyst/${ticker}/earnings-forecast`, {
        headers,
        timeout: 10000
      }).catch(() => ({ data: {} })),
      axios.get(`https://api.nasdaq.com/api/quote/${ticker}/summary?assetclass=stocks`, {
        headers,
        timeout: 10000
      }).catch(() => ({ data: {} }))
    ]);
    const forecasts = forecastResponse.data?.data?.yearlyForecast?.rows || [];
    const summary = summaryResponse.data?.data?.summaryData || {};
    const rangeValues = String(summary.FiftTwoWeekHighLow?.value || "")
      .split("/")
      .map(parseNasdaqNumber);

    return {
      currentYearEps: parseNasdaqNumber(forecasts[0]?.consensusEPSForecast),
      nextYearEps: parseNasdaqNumber(forecasts[1]?.consensusEPSForecast),
      marketCap: parseNasdaqNumber(summary.MarketCap?.value),
      targetMean: parseNasdaqNumber(summary.OneYrTarget?.value),
      fiftyTwoWeekHigh: rangeValues[0] || null,
      fiftyTwoWeekLow: rangeValues[1] || null,
      dividendYield: summary.Yield?.value
        ? parseNasdaqNumber(summary.Yield.value) / 100
        : null
    };
  } catch (err) {
    console.log("Nasdaq data skipped:", ticker, err.message);
    return {};
  }
}

const parseAbbreviatedNumber = (value) => {
  if (!value) return null;
  const match = String(value).trim().match(/^([\d.]+)\s*([KMBT])?$/i);
  if (!match) return parseNasdaqNumber(value);
  const multipliers = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 };
  return Number(match[1]) * (multipliers[match[2]?.toUpperCase()] || 1);
};

async function fetchStockAnalysisForecast(ticker) {
  try {
    const response = await axios.get(
      `https://stockanalysis.com/stocks/${ticker.toLowerCase()}/forecast/`,
      {
        headers: { "User-Agent": "Mozilla/5.0 AppleWebKit/537.36 Chrome/124 Safari/537.36" },
        timeout: 10000
      }
    );
    const $ = cheerio.load(response.data);
    const readForecast = (heading) => {
      const section = $("h2")
        .filter((_, element) => $(element).text().trim() === heading)
        .first()
        .next();
      const headers = section.find("tr").first().find("th,td")
        .map((_, element) => $(element).text().trim()).get();
      const average = section.find("tr").filter((_, row) =>
        $(row).find("th,td").first().text().trim() === "Avg"
      ).first().find("th,td")
        .map((_, element) => $(element).text().trim()).get();
      return {
        year: Number(headers[1]) || null,
        value: parseAbbreviatedNumber(average[1])
      };
    };
    const revenue = readForecast("Revenue Forecast");
    const eps = readForecast("EPS Forecast");

    return {
      fiscalYear: eps.year || revenue.year,
      currentYearRevenue: revenue.value,
      currentYearEps: eps.value
    };
  } catch (err) {
    console.log("StockAnalysis forecast skipped:", ticker, err.message);
    return {};
  }
}

async function getSecTickerMap() {
  if (!secTickerMapPromise) {
    secTickerMapPromise = axios.get(
      "https://www.sec.gov/files/company_tickers.json",
      {
        headers: { "User-Agent": "InvestmentTerminal/1.0 contact@investmentterminal.app" },
        timeout: 10000
      }
    ).then((response) => new Map(
      Object.values(response.data).map((company) => [
        company.ticker.toUpperCase(),
        String(company.cik_str).padStart(10, "0")
      ])
    )).catch((err) => {
      secTickerMapPromise = null;
      throw err;
    });
  }
  return secTickerMapPromise;
}

function latestSecAnnualFact(companyFacts, concepts, endDate) {
  let latestFact = null;
  for (const concept of concepts) {
    const entries = companyFacts?.facts?.["us-gaap"]?.[concept]?.units?.USD || [];
    const annualEntries = entries.filter((entry) => {
      if (!["10-K", "10-K/A"].includes(entry.form) || entry.fp !== "FY") return false;
      if (endDate && entry.end !== endDate) return false;
      if (!entry.start) return true;
      const duration = new Date(entry.end) - new Date(entry.start);
      return duration >= 300 * 24 * 60 * 60 * 1000;
    }).sort((a, b) =>
      String(a.end).localeCompare(String(b.end)) ||
      String(a.filed).localeCompare(String(b.filed))
    );
    if (annualEntries.length) {
      const candidate = annualEntries.at(-1);
      if (endDate) return candidate;
      if (!latestFact || String(candidate.end) > String(latestFact.end)) {
        latestFact = candidate;
      }
    }
  }
  return latestFact;
}

async function fetchSecAnnualMargins(ticker) {
  const cached = secMarginCache.get(ticker);
  if (cached && Date.now() - cached.fetchedAt < 6 * 60 * 60 * 1000) {
    return cached.data;
  }

  try {
    const tickerMap = await getSecTickerMap();
    const cik = tickerMap.get(ticker);
    if (!cik) return {};
    const response = await axios.get(
      `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`,
      {
        headers: { "User-Agent": "InvestmentTerminal/1.0 contact@investmentterminal.app" },
        timeout: 12000
      }
    );
    const facts = response.data;
    const revenue = latestSecAnnualFact(facts, [
      "RevenueFromContractWithCustomerExcludingAssessedTax",
      "OperatingRevenues",
      "Revenues",
      "SalesRevenueNet",
      "RevenuesNetOfInterestExpense"
    ]);
    if (!revenue?.val) return {};
    const endDate = revenue.end;
    const grossProfit = latestSecAnnualFact(facts, ["GrossProfit"], endDate);
    const costOfRevenue = latestSecAnnualFact(facts, [
      "CostOfGoodsAndServicesSold",
      "CostOfRevenue"
    ], endDate);
    const operatingIncome = latestSecAnnualFact(facts, ["OperatingIncomeLoss"], endDate);
    const netIncome = latestSecAnnualFact(facts, [
      "NetIncomeLoss",
      "ProfitLoss",
      "NetIncomeLossAvailableToCommonStockholdersBasic"
    ], endDate);
    const grossProfitValue = grossProfit?.val ?? (
      costOfRevenue?.val !== undefined ? revenue.val - costOfRevenue.val : null
    );
    const data = {
      fiscalYear: Number(endDate.slice(0, 4)),
      grossMargins: grossProfitValue !== null
        ? (grossProfitValue / revenue.val) * 100
        : null,
      operatingMargins: operatingIncome?.val !== undefined
        ? (operatingIncome.val / revenue.val) * 100
        : null,
      profitMargins: netIncome?.val !== undefined
        ? (netIncome.val / revenue.val) * 100
        : null
    };
    secMarginCache.set(ticker, { data, fetchedAt: Date.now() });
    return data;
  } catch (err) {
    console.log("SEC annual margins skipped:", ticker, err.message);
    return {};
  }
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

const firstFiniteNumber = (...values) => {
  for (const value of values) {
    const number = toNumberOrNull(value);
    if (number !== null) return number;
  }

  return null;
};

const normalizePercent = (value) => {
  const number = toNumberOrNull(value);
  if (number === null) return null;
  return Math.abs(number) <= 1 ? number * 100 : number;
};

const normalizeDividendYield = (value) => {
  const number = toNumberOrNull(value);
  if (number === null) return null;
  return Math.abs(number) > 1 ? number / 100 : number;
};

const toDollarsFromBillions = (value) => {
  const number = toNumberOrNull(value);
  return number === null ? null : number * 1000000000;
};

const toDollarsFromMillions = (value) => {
  const number = toNumberOrNull(value);
  return number === null ? null : number * 1000000;
};

const toDollarsFromPerShare = (value, sharesOutstandingMillions) => {
  const perShare = toNumberOrNull(value);
  const shares = toNumberOrNull(sharesOutstandingMillions);
  if (perShare === null || shares === null || shares === 0) return null;
  return perShare * shares * 1000000;
};

const epsFromForwardPE = (price, forwardPE) => {
  const priceNumber = toNumberOrNull(price);
  const peNumber = toNumberOrNull(forwardPE);
  if (priceNumber === null || peNumber === null || peNumber <= 0) return null;
  return priceNumber / peNumber;
};

const estimateForwardEpsFromHistory = (rows = []) => {
  const values = [...rows]
    .filter((row) => row?.year)
    .sort((a, b) => a.year - b.year)
    .map((row) => toNumberOrNull(row.eps))
    .filter((value) => value !== null && value > 0)
    .slice(-4);

  if (!values.length) return null;
  const latest = values.at(-1);
  const recent = values.slice(-3).sort((a, b) => a - b);
  const median = recent[Math.floor(recent.length / 2)];

  if (latest < median * 0.5) return median;

  const growthRates = values.slice(1).map((value, index) =>
    (value - values[index]) / values[index]
  ).sort((a, b) => a - b);
  const medianGrowth = growthRates.length
    ? growthRates[Math.floor(growthRates.length / 2)]
    : 0.05;

  return latest * (1 + clamp(medianGrowth, -0.3, 0.4));
};

const sanitizeForwardEps = (candidate, historicalFallback) => {
  const estimate = toNumberOrNull(candidate);
  const fallback = toNumberOrNull(historicalFallback);
  if (estimate === null) return fallback;
  if (fallback === null || fallback === 0) return estimate;

  const ratio = Math.abs(estimate / fallback);
  return ratio < 0.125 || ratio > 8 ? fallback : estimate;
};

const normalizeStatementDollars = (value) => {
  const number = toNumberOrNull(value);
  if (number === null || number === 0) return null;
  return Math.abs(number) < 1000000 ? number * 1000000000 : number;
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

  const rating = String(value).toLowerCase().replace(/[_-]+/g, " ");
  if (
    rating.includes("strong sell") ||
    rating.includes("sell") ||
    rating.includes("underperform") ||
    rating.includes("underweight")
  ) {
    return "sell";
  }
  if (
    rating.includes("hold") ||
    rating.includes("neutral") ||
    rating.includes("market perform") ||
    rating.includes("equal weight")
  ) {
    return "hold";
  }
  if (
    rating.includes("strong buy") ||
    rating.includes("buy") ||
    rating.includes("outperform") ||
    rating.includes("overweight")
  ) {
    return "buy";
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

const FALLBACK_SHARES_OUTSTANDING_MILLIONS = 100;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const estimateRevenueFallback = (revenue, marketCap) =>
  firstNumber(normalizeStatementDollars(revenue), toNumberOrNull(marketCap) ? marketCap / 4 : null);

const estimateEarningsFallback = (earnings, revenue, profitMargin) => {
  const existing = normalizeStatementDollars(earnings);
  if (existing !== null) return existing;

  const revenueNumber = toNumberOrNull(revenue);
  if (revenueNumber === null) return null;

  const margin = normalizePercent(profitMargin);
  const marginRate = margin !== null && margin > -50 && margin < 80
    ? margin / 100
    : 0.08;

  return revenueNumber * marginRate;
};

const reconcileEarningsEstimate = ({ earnings, eps, shares, revenue, profitMargin }) => {
  const fallback = estimateEarningsFallback(earnings, revenue, profitMargin);
  const epsNumber = toNumberOrNull(eps);
  const sharesNumber = toNumberOrNull(shares);
  const epsImplied = epsNumber !== null && sharesNumber
    ? epsNumber * sharesNumber * 1000000
    : null;

  if (epsImplied === null) return fallback;
  if (fallback === null) return epsImplied;

  const ratio = fallback / epsImplied;
  return ratio >= 0.9 && ratio <= 1.1 ? fallback : epsImplied;
};

const estimateEpsFallback = (eps, earnings, sharesOutstandingMillions) => {
  const existing = firstNumber(eps);
  if (existing !== null) return existing;

  const earningsNumber = toNumberOrNull(earnings);
  const sharesNumber = toNumberOrNull(sharesOutstandingMillions);
  if (earningsNumber === null || sharesNumber === null || sharesNumber === 0) {
    return null;
  }

  return earningsNumber / (sharesNumber * 1000000);
};

const estimateFreeCashFlowFallback = ({
  freeCashflow,
  revenue,
  earnings,
  profitMargin,
  marketCap
}) => {
  const existing = normalizeStatementDollars(freeCashflow);
  if (existing !== null) return existing;

  const revenueNumber = toNumberOrNull(revenue);
  const earningsNumber = toNumberOrNull(earnings);
  const marketCapNumber = toNumberOrNull(marketCap);
  const margin = normalizePercent(profitMargin);
  const marginRate = margin !== null && margin > -50 && margin < 80
    ? margin / 100
    : 0.08;

  return firstNumber(
    revenueNumber !== null ? revenueNumber * marginRate * 0.8 : null,
    earningsNumber !== null ? earningsNumber * 0.9 : null,
    marketCapNumber !== null ? marketCapNumber * 0.03 : null
  );
};

const estimateTargetFallback = ({
  targetMean,
  price,
  revenueGrowth,
  earningsGrowth,
  forwardPE,
  pe
}) => {
  const existing = firstNumber(targetMean);
  if (existing !== null) return existing;

  const priceNumber = toNumberOrNull(price);
  if (priceNumber === null) return null;

  const growth = safeGrowthRate(revenueGrowth, earningsGrowth);
  const forwardPeNumber = toNumberOrNull(forwardPE);
  const peNumber = toNumberOrNull(pe);
  const valuationAdjustment =
    forwardPeNumber !== null && peNumber !== null && peNumber > 0
      ? clamp((peNumber - forwardPeNumber) / peNumber, -0.15, 0.15)
      : 0;

  return priceNumber * (1 + clamp(growth + valuationAdjustment, -0.2, 0.35));
};

const estimateRatingFallback = (rating, targetMean, price) => {
  const normalized = normalizeRating(rating);
  if (normalized) return normalized;

  const targetNumber = toNumberOrNull(targetMean);
  const priceNumber = toNumberOrNull(price);
  if (targetNumber !== null && priceNumber !== null && priceNumber > 0) {
    const upside = (targetNumber - priceNumber) / priceNumber;
    if (upside >= 0.08) return "buy";
    if (upside <= -0.08) return "sell";
  }

  return "hold";
};

const ratingFromRecommendation = (recommendation) => {
  const latest = Array.isArray(recommendation)
    ? recommendation[0] || {}
    : recommendation || {};
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

  return null;
};

const getAnalystRating = (...sources) => {
  for (const source of sources) {
    const rating = ratingFromRecommendation(source) || normalizeRating(source);
    if (rating) return rating;
  }

  return "N/A";
};

const unwrapFinancialValue = (value) => {
  if (value && typeof value === "object" && "raw" in value) {
    return toNumberOrNull(value.raw);
  }

  return toNumberOrNull(value);
};

const firstYahooNumber = (...values) =>
  firstNumber(...values.map((value) => unwrapFinancialValue(value)));

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

function hasCompleteSupplementalData(stock) {
  const data = stock?.data || {};
  const currentYear = data.analystEstimates?.currentYear || {};
  const nextYear = data.analystEstimates?.nextYear || {};

  return (
    toNumberOrNull(data.freeCashflow) !== null &&
    toNumberOrNull(data.targetMean) !== null &&
    toNumberOrNull(data.priceToSales) !== null &&
    toNumberOrNull(data.pe) !== null &&
    toNumberOrNull(data.forwardPE) !== null &&
    toNumberOrNull(data.grossMargins) !== null &&
    toNumberOrNull(data.operatingMargins) !== null &&
    toNumberOrNull(data.profitMargins) !== null &&
    toNumberOrNull(data.fiftyTwoWeekHigh) !== null &&
    toNumberOrNull(data.fiftyTwoWeekLow) !== null &&
    ["buy", "hold", "sell"].includes(data.recommendationKey) &&
    toNumberOrNull(currentYear.revenue) !== null &&
    toNumberOrNull(currentYear.eps) !== null &&
    toNumberOrNull(nextYear.revenue) !== null &&
    toNumberOrNull(nextYear.eps) !== null
  );
}

function needsFinancialHistoryRefresh(stock) {
  return (
    stock?.data?.financialHistoryVersion !== FINANCIAL_HISTORY_VERSION ||
    !hasCompleteChartHistory(stock) ||
    !hasCompleteSupplementalData(stock)
  );
}

function withGuaranteedAnalystSection(data = {}) {
  const price = toNumberOrNull(data.price);
  const revenueRows = Array.isArray(data.revenueData) ? data.revenueData : [];
  const latestRevenueRow = [...revenueRows]
    .filter((row) => row?.year)
    .sort((a, b) => a.year - b.year)
    .at(-1) || {};
  const previousRevenueRow = [...revenueRows]
    .filter((row) => row?.year)
    .sort((a, b) => a.year - b.year)
    .at(-2) || {};
  const marketCap = firstNumber(
    data.marketCap,
    price !== null ? price * FALLBACK_SHARES_OUTSTANDING_MILLIONS * 1000000 : null
  );
  const latestReportedEarnings = toNumberOrNull(latestRevenueRow.earnings);
  const latestReportedEps = toNumberOrNull(latestRevenueRow.eps);
  const impliedSharesMillions =
    latestReportedEarnings !== null && latestReportedEps
      ? (latestReportedEarnings * 1000) / latestReportedEps
      : null;
  const suppliedSharesMillions = firstNumber(
    data.sharesOutstanding,
    marketCap !== null && price ? marketCap / price / 1000000 : null
  );
  const suppliedToImpliedRatio =
    suppliedSharesMillions && impliedSharesMillions
      ? suppliedSharesMillions / impliedSharesMillions
      : null;
  const sharesOutstanding = firstNumber(
    suppliedToImpliedRatio !== null &&
      (suppliedToImpliedRatio > 1.5 || suppliedToImpliedRatio < 0.67)
      ? impliedSharesMillions
      : suppliedSharesMillions,
    impliedSharesMillions,
    FALLBACK_SHARES_OUTSTANDING_MILLIONS
  );
  const revenueGrowth = firstNumber(
    data.revenueGrowth,
    (() => {
      const current = toNumberOrNull(latestRevenueRow.revenue);
      const previous = toNumberOrNull(previousRevenueRow.revenue);
      if (current === null || previous === null || previous === 0) return null;
      return ((current - previous) / Math.abs(previous)) * 100;
    })(),
    5
  );
  const earningsGrowth = firstNumber(data.earningsGrowth, revenueGrowth, 5);
  const currentYear = data.analystEstimates?.currentYear || {};
  const nextYear = data.analystEstimates?.nextYear || {};
  const currentRevenue = estimateRevenueFallback(
    firstNumber(currentYear.revenue, toDollarsFromBillions(latestRevenueRow.revenue)),
    marketCap
  );
  const historicalEarnings = toDollarsFromBillions(latestRevenueRow.earnings);
  const profitMargins = firstNumber(
    data.profitMargins,
    currentRevenue && historicalEarnings !== null
      ? (historicalEarnings / currentRevenue) * 100
      : null,
    8
  );
  const operatingMargins = firstNumber(
    data.operatingMargins,
    profitMargins
  );
  const grossMargins = firstNumber(
    data.grossMargins,
    operatingMargins,
    profitMargins
  );
  const priceToSales = firstNumber(
    data.priceToSales,
    marketCap !== null && currentRevenue > 0 ? marketCap / currentRevenue : null
  );
  const nextRevenue = estimateRevenueFallback(
    firstNumber(nextYear.revenue, estimateNextValue(currentRevenue, safeGrowthRate(revenueGrowth))),
    marketCap !== null ? marketCap * (1 + safeGrowthRate(revenueGrowth)) : null
  );
  const provisionalCurrentEarnings = estimateEarningsFallback(
    firstNumber(currentYear.earnings, toDollarsFromBillions(latestRevenueRow.earnings)),
    currentRevenue,
    profitMargins
  );
  const provisionalNextEarnings = estimateEarningsFallback(
    firstNumber(nextYear.earnings, estimateNextValue(provisionalCurrentEarnings, safeGrowthRate(earningsGrowth))),
    nextRevenue,
    profitMargins
  );
  const currentEps = estimateEpsFallback(
    firstNumber(data.trailingEps, currentYear.eps),
    provisionalCurrentEarnings,
    sharesOutstanding
  );
  const nextEps = estimateEpsFallback(
    firstNumber(data.consensusCurrentYearEps, data.forwardEps, nextYear.eps),
    provisionalNextEarnings,
    sharesOutstanding
  );
  const currentEarnings = reconcileEarningsEstimate({
    earnings: provisionalCurrentEarnings,
    eps: currentEps,
    shares: sharesOutstanding,
    revenue: currentRevenue,
    profitMargin: profitMargins
  });
  const nextEarnings = reconcileEarningsEstimate({
    earnings: provisionalNextEarnings,
    eps: nextEps,
    shares: sharesOutstanding,
    revenue: nextRevenue,
    profitMargin: profitMargins
  });
  const pe = firstNumber(
    data.pe,
    price !== null && currentEps ? price / currentEps : null
  );
  const forwardPE = firstNumber(
    data.forwardPE,
    price !== null && nextEps ? price / nextEps : null
  );
  const fiftyTwoWeekHigh = firstNumber(data.fiftyTwoWeekHigh, data.high, price);
  const fiftyTwoWeekLow = firstNumber(data.fiftyTwoWeekLow, data.low, price);
  const freeCashflow = estimateFreeCashFlowFallback({
    freeCashflow: data.freeCashflow,
    revenue: currentRevenue,
    earnings: currentEarnings,
    profitMargin: profitMargins,
    marketCap
  });
  const targetMean = estimateTargetFallback({
    targetMean: data.targetMean,
    price,
    revenueGrowth,
    earningsGrowth,
    forwardPE,
    pe
  });
  const recommendationKey = estimateRatingFallback(
    data.recommendationKey,
    targetMean,
    price
  );
  const latestYear =
    toNumberOrNull(latestRevenueRow.year) || new Date().getFullYear();
  const modeledGrowthRate = safeGrowthRate(revenueGrowth);
  const modeledRevenueData = Array.from({ length: 5 }, (_, index) => {
    const yearsBack = 4 - index;
    const growthFactor = Math.pow(1 + modeledGrowthRate, yearsBack);
    const revenue = currentRevenue !== null
      ? currentRevenue / growthFactor / 1000000000
      : null;
    const earnings = currentEarnings !== null
      ? currentEarnings / growthFactor / 1000000000
      : null;
    const eps = currentEps !== null
      ? currentEps / growthFactor
      : null;

    return {
      year: latestYear - yearsBack,
      revenue,
      earnings,
      eps,
      source: "Modeled fallback"
    };
  });
  const guaranteedRevenueData = mergeHistoricalFinancials(
    revenueRows,
    modeledRevenueData
  );
  const guaranteedRevenueHistory = (data.revenueHistory || []).some(
    (row) => toNumberOrNull(row.revenue) !== null
  )
    ? data.revenueHistory
    : guaranteedRevenueData.map((row) => ({
        year: row.year,
        revenue: row.revenue,
        source: row.source
      }));
  return {
    ...data,
    marketCap,
    sharesOutstanding,
    pe,
    priceToSales,
    forwardPE,
    grossMargins,
    operatingMargins,
    profitMargins,
    fiftyTwoWeekHigh,
    fiftyTwoWeekLow,
    freeCashflow,
    targetMean,
    recommendationKey,
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
    revenueHistory: guaranteedRevenueHistory,
    revenueData: guaranteedRevenueData
  };
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
    const [summary, quoteData, chartData] = await Promise.all([
      yahooFinance
        .quoteSummary(ticker, {
          modules: [
            "financialData",
            "defaultKeyStatistics",
            "summaryDetail",
            "earningsTrend",
            "recommendationTrend"
          ]
        })
        .catch((err) => {
          console.log("Yahoo quote summary skipped:", ticker, err.message);
          return {};
        }),
      yahooFinance.quote(ticker).catch((err) => {
        console.log("Yahoo quote skipped:", ticker, err.message);
        return {};
      }),
      yahooFinance.chart(ticker, {
        period1: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
        interval: "1d",
        return: "array"
      }).catch((err) => {
        console.log("Yahoo chart range skipped:", ticker, err.message);
        return { quotes: [] };
      })
    ]);

    const financialData = summary?.financialData || {};
    const keyStats = summary?.defaultKeyStatistics || {};
    const detail = summary?.summaryDetail || {};
    const trends = summary?.earningsTrend?.trend || [];
    const recommendationTrend = summary?.recommendationTrend?.trend || [];
    const chartHighs = (chartData?.quotes || [])
      .map((row) => toNumberOrNull(row.high))
      .filter((value) => value !== null);
    const chartLows = (chartData?.quotes || [])
      .map((row) => toNumberOrNull(row.low))
      .filter((value) => value !== null);
    const chartHigh = chartHighs.length ? Math.max(...chartHighs) : null;
    const chartLow = chartLows.length ? Math.min(...chartLows) : null;

    const currentYear =
      trends.find((item) => item.period === "0y") || {};
    const nextYear =
      trends.find((item) => item.period === "+1y") || {};

    const estimateFromTrend = (trend) => ({
      revenue: firstYahooNumber(trend?.revenueEstimate?.avg),
      earnings: null,
      eps: firstYahooNumber(trend?.earningsEstimate?.avg)
    });

    return {
      name: quoteData.longName || quoteData.shortName || ticker,
      symbol: quoteData.symbol || ticker,
      price: firstYahooNumber(quoteData.regularMarketPrice),
      change: firstFiniteNumber(quoteData.regularMarketChange),
      percentChange: firstFiniteNumber(quoteData.regularMarketChangePercent),
      previousClose: firstYahooNumber(quoteData.regularMarketPreviousClose),
      high: firstYahooNumber(quoteData.regularMarketDayHigh),
      low: firstYahooNumber(quoteData.regularMarketDayLow),
      open: firstYahooNumber(quoteData.regularMarketOpen),
      marketCap: firstYahooNumber(detail.marketCap, keyStats.marketCap, quoteData.marketCap),
      pe: firstYahooNumber(detail.trailingPE, keyStats.trailingPE, quoteData.trailingPE),
      forwardPE: firstYahooNumber(keyStats.forwardPE, financialData.forwardPE, quoteData.forwardPE),
      trailingEps: firstYahooNumber(
        keyStats.trailingEps,
        quoteData.epsTrailingTwelveMonths,
        quoteData.trailingEps
      ),
      forwardEps: firstYahooNumber(
        keyStats.forwardEps,
        financialData.forwardEps,
        quoteData.epsForward,
        quoteData.forwardEps
      ),
      priceToSales: firstYahooNumber(
        detail.priceToSalesTrailing12Months,
        quoteData.priceToSalesTrailing12Months
      ),
      sharesOutstanding: firstYahooNumber(keyStats.sharesOutstanding, quoteData.sharesOutstanding),
      dividendYield: normalizeDividendYield(
        firstFiniteNumber(
          unwrapFinancialValue(detail.dividendYield),
          unwrapFinancialValue(detail.trailingAnnualDividendYield),
          unwrapFinancialValue(quoteData.dividendYield),
          unwrapFinancialValue(quoteData.trailingAnnualDividendYield)
        )
      ),
      fiftyTwoWeekHigh: firstYahooNumber(
        detail.fiftyTwoWeekHigh,
        quoteData.fiftyTwoWeekHigh,
        quoteData.fiftyTwoWeekRange?.high,
        chartHigh
      ),
      fiftyTwoWeekLow: firstYahooNumber(
        detail.fiftyTwoWeekLow,
        quoteData.fiftyTwoWeekLow,
        quoteData.fiftyTwoWeekRange?.low,
        chartLow
      ),
      revenueGrowth: normalizePercent(unwrapFinancialValue(financialData.revenueGrowth)),
      earningsGrowth: normalizePercent(unwrapFinancialValue(financialData.earningsGrowth)),
      grossMargins: normalizePercent(unwrapFinancialValue(financialData.grossMargins)),
      operatingMargins: normalizePercent(unwrapFinancialValue(financialData.operatingMargins)),
      profitMargins: normalizePercent(unwrapFinancialValue(financialData.profitMargins)),
      freeCashflow: firstYahooNumber(financialData.freeCashflow),
      targetMean: firstYahooNumber(financialData.targetMeanPrice),
      recommendationKey:
        normalizeRating(financialData.recommendationKey) ||
        normalizeRating(quoteData.averageAnalystRating),
      recommendationTrend,
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

function getYahooSupplementalData(ticker) {
  if (yahooSupplementalFetches.has(ticker)) {
    return yahooSupplementalFetches.get(ticker);
  }

  const request = fetchYahooSupplementalData(ticker);
  yahooSupplementalFetches.set(ticker, request);
  request.finally(() => {
    setTimeout(() => yahooSupplementalFetches.delete(ticker), 15000);
  });
  return request;
}

async function publishFastStockSnapshot(ticker) {
  const yahooData = await getYahooSupplementalData(ticker);
  if (!yahooData?.price) return;

  const stock = await Stock.findOne({ ticker }).lean();
  const previousData = stock?.data || {};
  const definedValues = (data = {}) => Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== null && value !== undefined)
  );
  const analystEstimates = {
    currentYear: {
      ...(previousData.analystEstimates?.currentYear || {}),
      ...definedValues(yahooData.analystEstimates?.currentYear)
    },
    nextYear: {
      ...(previousData.analystEstimates?.nextYear || {}),
      ...definedValues(yahooData.analystEstimates?.nextYear)
    }
  };
  const nextEps = toNumberOrNull(analystEstimates.nextYear.eps);
  const quickData = withGuaranteedAnalystSection({
    ...previousData,
    ...definedValues(yahooData),
    forwardPE: firstNumber(
      yahooData.forwardPE,
      nextEps > 0 ? yahooData.price / nextEps : null,
      previousData.forwardPE
    ),
    analystEstimates
  });

  await Stock.findOneAndUpdate(
    { ticker, updatedAt: stock.updatedAt },
    {
      ticker,
      status: "pending",
      data: quickData,
      updatedAt: new Date()
    }
  );
}

async function fetchStockData(ticker) {
  const quote = await getFinnhub(
    `https://finnhub.io/api/v1/quote?symbol=${ticker}`
  );

  await wait(300);

  let profile = {};
  try {
    profile = await getFinnhub(
      `https://finnhub.io/api/v1/stock/profile2?symbol=${ticker}`
    );
  } catch (err) {
    console.log("Profile skipped:", ticker, err.message);
  }

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
  let fmpRating = {};
  const [
    yahooFinancialData,
    fmpIncomeStatementData,
    yahooSupplementalData,
    nasdaqData,
    stockAnalysisForecast,
    secAnnualMargins
  ] = await Promise.all([
    fetchYahooFinancialHistory(ticker),
    fetchFmpIncomeStatementHistory(ticker),
    getYahooSupplementalData(ticker),
    fetchNasdaqData(ticker),
    fetchStockAnalysisForecast(ticker),
    fetchSecAnnualMargins(ticker)
  ]);

  const fmpCashFlowData = await getFmpData(ticker, "cash flow", [
    "/stable/cash-flow-statement?symbol={ticker}&limit=1",
    "/api/v3/cash-flow-statement/{ticker}?period=annual&limit=1"
  ]);
  fmpCashFlow = Array.isArray(fmpCashFlowData)
    ? fmpCashFlowData
    : fmpCashFlowData
      ? [fmpCashFlowData]
      : [];

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

  const fmpPriceTargetData = await getFmpData(ticker, "price target", [
    "/stable/price-target-consensus?symbol={ticker}",
    "/api/v4/price-target-consensus?symbol={ticker}"
  ]);
  fmpPriceTarget = Array.isArray(fmpPriceTargetData)
    ? fmpPriceTargetData[0] || {}
    : fmpPriceTargetData || {};

  const fmpAnalystEstimateData = await getFmpData(ticker, "analyst estimates", [
    "/stable/analyst-estimates?symbol={ticker}&period=annual&limit=2",
    "/api/v3/analyst-estimates/{ticker}?period=annual&limit=2"
  ]);
  fmpAnalystEstimates = Array.isArray(fmpAnalystEstimateData)
    ? fmpAnalystEstimateData
    : fmpAnalystEstimateData
      ? [fmpAnalystEstimateData]
      : [];

  const fmpRatingData = await getFmpData(ticker, "rating", [
    "/stable/ratings-snapshot?symbol={ticker}",
    "/api/v3/rating/{ticker}"
  ]);
  fmpRating = Array.isArray(fmpRatingData)
    ? fmpRatingData[0] || {}
    : fmpRatingData || {};

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
  const currentRevenueBase = firstNumber(
    toDollarsFromBillions(latestAnnual.revenue),
    toDollarsFromPerShare(metrics.revenuePerShareTTM, sharesOutstanding),
    toDollarsFromPerShare(metrics.revenuePerShareAnnual, sharesOutstanding)
  );
  const currentEarningsBase = firstNumber(
    toDollarsFromBillions(latestAnnual.earnings),
    toDollarsFromPerShare(metrics.epsTTM, sharesOutstanding),
    toDollarsFromPerShare(metrics.epsAnnual, sharesOutstanding)
  );
  const currentEpsBase = firstNumber(
    latestAnnual.eps,
    metrics.epsTTM,
    metrics.epsAnnual,
    metrics.epsInclExtraItemsTTM,
    metrics.epsInclExtraItemsAnnual
  );
  const rating = getAnalystRating(
    recommendation,
    yahooSupplementalData.recommendationTrend,
    yahooSupplementalData.recommendationKey,
    fmpRating.ratingRecommendation,
    fmpRating.rating,
    fmpRating.recommendation
  );

  const currentEps =
    fmpEstimateField(fmpCurrentEstimate, "epsAvg", "estimatedEpsAvg") ??
    epsEstimates[0]?.epsAvg ??
    metrics.epsEstimateCurrentYear ??
    yahooSupplementalData.trailingEps ??
    metrics.epsInclExtraItemsAnnual ??
    currentEpsBase ??
    null;

  const historicalForwardEps = estimateForwardEpsFromHistory(revenueData);
  const nextEpsCandidate =
    stockAnalysisForecast.currentYearEps ??
    nasdaqData.currentYearEps ??
    yahooSupplementalData.forwardEps ??
    fmpEstimateField(fmpNextEstimate, "epsAvg", "estimatedEpsAvg") ??
    epsEstimates[1]?.epsAvg ??
    metrics.epsEstimateNextYear ??
    epsFromForwardPE(quote.c, metrics.forwardPE ?? yahooSupplementalData.forwardPE) ??
    historicalForwardEps ??
    estimateNextValue(currentEps, earningsGrowthRate) ??
    null;
  const nextEps = sanitizeForwardEps(nextEpsCandidate, historicalForwardEps);

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
    stockAnalysisForecast.currentYearRevenue ??
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

  const marketCap =
    nasdaqData.marketCap ??
    yahooSupplementalData.marketCap ??
    (profile.marketCapitalization
      ? profile.marketCapitalization * 1000000
      : sharesOutstanding && quote.c
        ? sharesOutstanding * 1000000 * quote.c
      : null);
  const sharesOutstandingValue =
    sharesOutstanding ??
    (yahooSupplementalData.sharesOutstanding
      ? yahooSupplementalData.sharesOutstanding / 1000000
      : marketCap && quote.c
        ? marketCap / quote.c / 1000000
      : null);
  const modeledMarketCap =
    marketCap ??
    (quote.c ? quote.c * FALLBACK_SHARES_OUTSTANDING_MILLIONS * 1000000 : null);
  const latestAnnualEarnings = toNumberOrNull(latestAnnual.earnings);
  const latestAnnualEps = toNumberOrNull(latestAnnual.eps);
  const impliedAnnualShares = latestAnnualEarnings !== null && latestAnnualEps
    ? (latestAnnualEarnings * 1000) / latestAnnualEps
    : null;
  const shareRatio = sharesOutstandingValue && impliedAnnualShares
    ? sharesOutstandingValue / impliedAnnualShares
    : null;
  const modeledSharesOutstanding = firstNumber(
    shareRatio !== null && (shareRatio > 1.5 || shareRatio < 0.67)
      ? impliedAnnualShares
      : sharesOutstandingValue,
    impliedAnnualShares,
    FALLBACK_SHARES_OUTSTANDING_MILLIONS
  );
  const reportedPE = firstNumber(metrics.peNormalizedAnnual, metrics.peTTM, yahooSupplementalData.pe);
  const reportedForwardPE = firstNumber(metrics.forwardPE, yahooSupplementalData.forwardPE);
  const revenueGrowth = firstNumber(
    metrics.revenueGrowthTTMYoy,
    yahooSupplementalData.revenueGrowth,
    annualGrowth(latestAnnual.revenue, previousAnnual.revenue)
  );
  const earningsGrowth = firstNumber(
    metrics.epsGrowthTTMYoy,
    yahooSupplementalData.earningsGrowth,
    annualGrowth(latestAnnual.earnings, previousAnnual.earnings)
  );
  const grossMargins = firstNumber(
    secAnnualMargins.grossMargins,
    metrics.grossMarginTTM,
    yahooSupplementalData.grossMargins,
    annualMargin(latestAnnual.grossProfit, latestAnnual.revenue)
  );
  const operatingMargins = firstNumber(
    secAnnualMargins.operatingMargins,
    metrics.operatingMarginTTM,
    yahooSupplementalData.operatingMargins,
    annualMargin(latestAnnual.operatingIncome, latestAnnual.revenue)
  );
  const profitMargins = firstNumber(
    secAnnualMargins.profitMargins,
    metrics.netProfitMarginTTM,
    yahooSupplementalData.profitMargins,
    annualMargin(latestAnnual.earnings, latestAnnual.revenue)
  );
  const currentRevenueValue = estimateRevenueFallback(currentRevenue, modeledMarketCap);
  const nextRevenueValue = estimateRevenueFallback(
    nextRevenue,
    modeledMarketCap ? modeledMarketCap * (1 + revenueGrowthRate) : null
  );
  const provisionalCurrentEarningsValue = estimateEarningsFallback(
    currentEarnings,
    currentRevenueValue,
    profitMargins
  );
  const provisionalNextEarningsValue = estimateEarningsFallback(
    nextEarnings,
    nextRevenueValue,
    profitMargins
  );
  const currentEpsValue = estimateEpsFallback(
    currentEps,
    provisionalCurrentEarningsValue,
    modeledSharesOutstanding
  );
  const nextEpsValue = estimateEpsFallback(
    nextEps,
    provisionalNextEarningsValue,
    modeledSharesOutstanding
  );
  const currentEarningsValue = reconcileEarningsEstimate({
    earnings: provisionalCurrentEarningsValue,
    eps: currentEpsValue,
    shares: modeledSharesOutstanding,
    revenue: currentRevenueValue,
    profitMargin: profitMargins
  });
  const nextEarningsValue = reconcileEarningsEstimate({
    earnings: provisionalNextEarningsValue,
    eps: nextEpsValue,
    shares: modeledSharesOutstanding,
    revenue: nextRevenueValue,
    profitMargin: profitMargins
  });
  const pe = firstNumber(
    reportedPE,
    currentEpsValue ? quote.c / currentEpsValue : null
  );
  const forwardPE = firstNumber(
    stockAnalysisForecast.currentYearEps
      ? quote.c / stockAnalysisForecast.currentYearEps
      : null,
    nasdaqData.currentYearEps ? quote.c / nasdaqData.currentYearEps : null,
    reportedForwardPE,
    nextEpsValue ? quote.c / nextEpsValue : null
  );
  const priceToSales = firstNumber(
    yahooSupplementalData.priceToSales,
    metrics.psTTM,
    metrics.psAnnual,
    modeledMarketCap && currentRevenueValue > 0
      ? modeledMarketCap / currentRevenueValue
      : null
  );
  const freeCashflow = estimateFreeCashFlowFallback({
    freeCashflow: firstNumber(
      fmpCashFlow[0]?.freeCashFlow,
      fmpCashFlow[0]?.freeCashflow,
      yahooSupplementalData.freeCashflow,
      toDollarsFromPerShare(metrics.cashFlowPerShareTTM, sharesOutstanding),
      toDollarsFromPerShare(metrics.cashFlowPerShareAnnual, sharesOutstanding),
      normalizeFinnhubMoney(metrics.freeCashFlowTTM),
      normalizeFinnhubMoney(metrics.fcfTTM),
      toDollarsFromBillions(latestAnnual.freeCashflow)
    ),
    revenue: currentRevenueValue,
    earnings: currentEarningsValue,
    profitMargin: profitMargins,
    marketCap: modeledMarketCap
  });
  const targetMean = estimateTargetFallback({
    targetMean: firstNumber(
      nasdaqData.targetMean,
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
    price: quote.c,
    revenueGrowth,
    earningsGrowth,
    forwardPE,
    pe
  });
  const recommendationKey = estimateRatingFallback(rating, targetMean, quote.c);
  const finnhubDividendYield = firstFiniteNumber(
    metrics.dividendYieldIndicatedAnnual,
    metrics.currentDividendYieldTTM,
    metrics.dividendYieldTTM
  );
  const dividendYield = normalizeDividendYield(
    nasdaqData.dividendYield ?? (finnhubDividendYield !== null
      ? finnhubDividendYield / 100
      : yahooSupplementalData.dividendYield)
  );
  const fiftyTwoWeekHigh = firstNumber(
    nasdaqData.fiftyTwoWeekHigh,
    yahooSupplementalData.fiftyTwoWeekHigh,
    metrics["52WeekHigh"],
    metrics["52WeekHighPrice"]
  );
  const fiftyTwoWeekLow = firstNumber(
    nasdaqData.fiftyTwoWeekLow,
    yahooSupplementalData.fiftyTwoWeekLow,
    metrics["52WeekLow"],
    metrics["52WeekLowPrice"]
  );

  const data = withGuaranteedAnalystSection({
    name: profile.name || ticker,
    symbol: ticker,
    price: quote.c,
    change: quote.d,
    percentChange: quote.dp,
    previousClose: quote.pc,
    high: quote.h,
    low: quote.l,
    open: quote.o,
    dividendYield,
    fiftyTwoWeekHigh,
    fiftyTwoWeekLow,
    marketCap,
    priceToSales,
    sharesOutstanding: sharesOutstandingValue,
    pe,
    forwardPE,
    trailingEps: yahooSupplementalData.trailingEps,
    forwardEps: yahooSupplementalData.forwardEps,
    consensusCurrentYearEps:
      stockAnalysisForecast.currentYearEps ?? nasdaqData.currentYearEps,
    consensusNextYearEps: nasdaqData.nextYearEps,
    consensusCurrentYearRevenue: stockAnalysisForecast.currentYearRevenue,
    analystEstimateSource: stockAnalysisForecast.currentYearEps
      ? "S&P Global consensus via StockAnalysis"
      : nasdaqData.currentYearEps
        ? "Nasdaq consensus"
        : "Modeled fallback",
    marginSource: secAnnualMargins.operatingMargins !== null &&
      secAnnualMargins.operatingMargins !== undefined
      ? `SEC annual filing ${secAnnualMargins.fiscalYear}`
      : "Market data fallback",
    revenueGrowth,
    earningsGrowth,
    grossMargins,
    operatingMargins,
    profitMargins,
    freeCashflow,
    targetMean,
    recommendationKey,
    analystEstimates: {
      currentYear: {
        revenue: currentRevenueValue,
        earnings: currentEarningsValue,
        eps: currentEpsValue
      },
      nextYear: {
        revenue: nextRevenueValue,
        earnings: nextEarningsValue,
        eps: nextEpsValue
      }
    },
    financialHistoryVersion: FINANCIAL_HISTORY_VERSION,
    revenueHistory,
    revenueData
  });

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

  publishFastStockSnapshot(ticker).catch((err) => {
    console.log("Fast stock snapshot skipped:", ticker, err.message);
  });

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
    const requestedTicker = req.params.ticker.trim().toUpperCase();
    const ticker = TICKER_ALIASES[requestedTicker] || requestedTicker;

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
        const responseData = withGuaranteedAnalystSection(stock.data);

        return res.json({
          ticker: stock.ticker,
          status: "ready",
          refreshing: true,
          ...responseData,
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

    if (stock.status === "ready") {
      const updatedAt = stock.updatedAt ? new Date(stock.updatedAt) : null;
      const isOutdated =
        stock.data?.financialHistoryVersion !== FINANCIAL_HISTORY_VERSION;
      const isIncomplete =
        !hasCompleteChartHistory(stock) || !hasCompleteSupplementalData(stock);
      const isStale =
        isOutdated ||
        isIncomplete ||
        !updatedAt ||
        Date.now() - updatedAt.getTime() > 5 * 60 * 1000;

      if (isStale) {
        startStockFetch(ticker);
        const responseData = withGuaranteedAnalystSection(stock.data);

        return res.json({
          ticker: stock.ticker,
          status: "ready",
          refreshing: true,
          ...responseData,
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

    const responseData = withGuaranteedAnalystSection(stock.data);

    return res.json({
      ticker: stock.ticker,
      status: stock.status,
      ...responseData,
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
