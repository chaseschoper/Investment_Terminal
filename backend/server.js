
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
const EarningsCall = require("./models/EarningsCall");

const app = express();
const activeStockFetches = new Set();
const yahooSupplementalFetches = new Map();
const earningsCallCache = new Map();
const earningsCalendarCache = new Map();
const marketIndexCache = new Map();
const priceHistoryCache = new Map();
const FINANCIAL_HISTORY_VERSION = 95;
const EARNINGS_CALL_VERSION = 5;
const secMarginCache = new Map();
const yearEndPriceCache = new Map();
const livePriceCache = new Map();
let secTickerMapPromise;
let secTickerMapRetryAfter = 0;
const TICKER_ALIASES = {
  ZILLOW: "Z",
  SALESFORCE: "CRM",
  NIKE: "NKE"
};
const KNOWN_FINANCIAL_INSTITUTIONS = new Set([
  "BAC",
  "C",
  "GS",
  "JPM",
  "KB",
  "MS",
  "WFC"
]);

const MARKET_INDICES = [
  { key: "sp500", label: "S&P 500", yahooSymbol: "^GSPC", investingPath: "us-spx-500" },
  { key: "dow", label: "Dow Jones", yahooSymbol: "^DJI", investingPath: "us-30" },
  { key: "nasdaq", label: "Nasdaq", yahooSymbol: "^IXIC", investingPath: "nasdaq-composite" }
];

const PRICE_HISTORY_RANGES = {
  "1D": { range: "1d", interval: "5m", ttl: 20 * 1000 },
  "1W": { range: "5d", interval: "15m", ttl: 60 * 1000 },
  "1M": { range: "1mo", interval: "1d", ttl: 5 * 60 * 1000 },
  "1Y": { range: "1y", interval: "1d", ttl: 5 * 60 * 1000 },
  YTD: { range: null, interval: "1d", ttl: 5 * 60 * 1000 },
  "5Y": { range: "5y", interval: "1wk", ttl: 30 * 60 * 1000 },
  "10Y": { range: "10y", interval: "1mo", ttl: 60 * 60 * 1000 },
  MAX: { range: "max", interval: "1mo", ttl: 6 * 60 * 60 * 1000 }
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

const isRateLimitError = (err) => err?.response?.status === 429;

async function getFinnhub(url) {
  const requestUrl = `${url}&token=${process.env.FINNHUB_API_KEY}`;
  try {
    const res = await axios.get(requestUrl, { timeout: 8000 });
    return res.data;
  } catch (err) {
    if (isRateLimitError(err)) {
      await wait(750);
      const retry = await axios.get(requestUrl, { timeout: 8000 });
      return retry.data;
    }
    throw err;
  }
}

function getFinnhubLogoUrl(ticker) {
  const symbol = String(ticker || "").trim().toUpperCase();
  return symbol
    ? `https://static2.finnhub.io/file/publicdatany/finnhubimage/stock_logo/${encodeURIComponent(symbol)}.png`
    : null;
}

async function getFmpData(ticker, label, endpoints) {
  if (!process.env.FMP_API_KEY) return null;

  for (const endpoint of endpoints) {
    const path = endpoint.replace("{ticker}", ticker);
    const separator = path.includes("?") ? "&" : "?";
    const url = `https://financialmodelingprep.com${path}${separator}apikey=${process.env.FMP_API_KEY}`;

    try {
      const res = await axios.get(url, { timeout: 8000 });
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
    const headers = {
      "User-Agent": "Mozilla/5.0 AppleWebKit/537.36 Chrome/124 Safari/537.36"
    };
    const [forecastResponse, statisticsResponse] = await Promise.all([
      axios.get(`https://stockanalysis.com/stocks/${ticker.toLowerCase()}/forecast/`, {
        headers,
        timeout: 10000
      }),
      axios.get(`https://stockanalysis.com/stocks/${ticker.toLowerCase()}/statistics/`, {
        headers,
        timeout: 10000
      }).catch(() => ({ data: "" }))
    ]);
    const $ = cheerio.load(forecastResponse.data);
    const statistics = cheerio.load(statisticsResponse.data);
    const readStatistic = (label) => {
      const cells = statistics("tr").filter((_, row) =>
        statistics(row).find("th,td").first().text().trim() === label
      ).first().find("th,td");
      return parseNasdaqNumber(cells.eq(1).text());
    };
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
        value: parseAbbreviatedNumber(average[1]),
        nextYear: Number(headers[2]) || null,
        nextValue: parseAbbreviatedNumber(average[2])
      };
    };
    const revenue = readForecast("Revenue Forecast");
    const eps = readForecast("EPS Forecast");
    const readEmbeddedAnnualEstimate = (key) => {
      const match = forecastResponse.data.match(
        new RegExp(`${key}:\\{last:[^,}]+,this:([^,}]+)`)
      );
      return match ? parseNasdaqNumber(match[1]) : null;
    };
    const embeddedRevenueThis = readEmbeddedAnnualEstimate("revenueThis");
    const embeddedRevenueNext = readEmbeddedAnnualEstimate("revenueNext");
    const embeddedEpsThis = readEmbeddedAnnualEstimate("epsThis");
    const embeddedEpsNext = readEmbeddedAnnualEstimate("epsNext");
    const readEmbeddedTarget = (key) => {
      const match = forecastResponse.data.match(
        new RegExp(`priceTargets:\\{[^}]*${key}:([^,}]+)`)
      );
      return match ? parseNasdaqNumber(match[1]) : null;
    };
    const ratingConsensus = forecastResponse.data.match(
      /currentRatings:\{[^}]*consensus:"([^"]+)"/
    )?.[1];
    const ratingScore = parseNasdaqNumber(
      forecastResponse.data.match(/currentRatings:\{[^}]*score:([^,}]+)/)?.[1]
    );
    const ratingCount = parseNasdaqNumber(
      forecastResponse.data.match(/currentRatings:\{[^}]*count:([^,}]+)/)?.[1]
    );

    return {
      fiscalYear: eps.year || revenue.year,
      currentYearRevenue: firstNumber(embeddedRevenueThis, revenue.value),
      currentYearEps: firstNumber(embeddedEpsThis, eps.value),
      nextYearRevenue: firstNumber(embeddedRevenueNext, revenue.nextValue),
      nextYearEps: firstNumber(embeddedEpsNext, eps.nextValue),
      pe: readStatistic("PE Ratio"),
      forwardPE: readStatistic("Forward PE"),
      targetMean: readEmbeddedTarget("avg"),
      targetMedian: readEmbeddedTarget("median"),
      analystRatingText: firstText(ratingConsensus),
      ratingConsensus,
      ratingScore,
      ratingCount
    };
  } catch (err) {
    console.log("StockAnalysis forecast skipped:", ticker, err.message);
    return {};
  }
}

async function getSecTickerMap() {
  if (!secTickerMapPromise && Date.now() < secTickerMapRetryAfter) {
    throw new Error("SEC ticker map is temporarily unavailable");
  }

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
      secTickerMapRetryAfter = Date.now() + 5 * 60 * 1000;
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

function secAnnualFactEntries(companyFacts, concept) {
  const entries = companyFacts?.facts?.["us-gaap"]?.[concept]?.units?.USD || [];
  const latestByEndDate = new Map();

  for (const entry of entries) {
    if (!["10-K", "10-K/A"].includes(entry.form) || entry.fp !== "FY" || !entry.end) {
      continue;
    }
    if (entry.start) {
      const duration = new Date(entry.end) - new Date(entry.start);
      if (duration < 300 * 24 * 60 * 60 * 1000) continue;
    }
    const existing = latestByEndDate.get(entry.end);
    if (!existing || String(entry.filed) > String(existing.filed)) {
      latestByEndDate.set(entry.end, entry);
    }
  }

  return [...latestByEndDate.values()].sort((a, b) =>
    String(a.end).localeCompare(String(b.end))
  );
}

function secInterimFactEntries(companyFacts, concept, afterEndDate) {
  const entries = companyFacts?.facts?.["us-gaap"]?.[concept]?.units?.USD || [];
  const latestByPeriod = new Map();

  for (const entry of entries) {
    if (!["10-Q", "10-Q/A"].includes(entry.form) || !entry.end) continue;
    if (afterEndDate && String(entry.end) <= String(afterEndDate)) continue;
    let durationDays = null;
    if (entry.start) {
      const duration = new Date(entry.end) - new Date(entry.start);
      durationDays = duration / 86400000;
      if (duration < 50 * 24 * 60 * 60 * 1000 || duration > 300 * 24 * 60 * 60 * 1000) {
        continue;
      }
    }
    const key = `${entry.fp || ""}:${entry.end}`;
    const existing = latestByPeriod.get(key);
    if (!existing || String(entry.filed) > String(existing.filed)) {
      latestByPeriod.set(key, { ...entry, durationDays });
    }
  }

  return [...latestByPeriod.values()].sort((a, b) =>
    String(a.end).localeCompare(String(b.end)) ||
    String(a.filed).localeCompare(String(b.filed))
  );
}

function latestSecInterimFact(companyFacts, concepts, endDate, referenceEntry = null) {
  let latestFact = null;

  for (const concept of concepts) {
    let candidates = secInterimFactEntries(companyFacts, concept, null)
      .filter((entry) => !endDate || entry.end === endDate);
    if (referenceEntry) {
      const matchingDuration = candidates.filter((entry) =>
        (!referenceEntry.fp || entry.fp === referenceEntry.fp) &&
        (
          !referenceEntry.durationDays ||
          !entry.durationDays ||
          Math.abs(entry.durationDays - referenceEntry.durationDays) <= 20
        )
      );
      if (matchingDuration.length) candidates = matchingDuration;
    }
    const candidate = candidates.at(-1);
    if (candidate && (!latestFact || String(candidate.end) > String(latestFact.end))) {
      latestFact = candidate;
    }
  }

  return latestFact;
}

function calculateSecTrailingEps(companyFacts) {
  const concepts = ["EarningsPerShareDiluted", "EarningsPerShareBasicAndDiluted"];

  for (const concept of concepts) {
    const entries = companyFacts?.facts?.["us-gaap"]?.[concept]?.units?.["USD/shares"] || [];
    const latestByPeriod = new Map();

    entries.forEach((entry) => {
      if (!entry.start || !entry.end || !["10-K", "10-K/A", "10-Q", "10-Q/A"].includes(entry.form)) {
        return;
      }
      const durationDays = (new Date(entry.end) - new Date(entry.start)) / 86400000;
      if (durationDays < 60 || durationDays > 400) return;
      const key = `${entry.start}:${entry.end}`;
      const existing = latestByPeriod.get(key);
      if (!existing || String(entry.filed) > String(existing.filed)) {
        latestByPeriod.set(key, { ...entry, durationDays });
      }
    });

    const deduplicated = [...latestByPeriod.values()];
    const annual = deduplicated
      .filter((entry) => ["10-K", "10-K/A"].includes(entry.form) && entry.durationDays >= 300)
      .sort((a, b) => String(a.end).localeCompare(String(b.end)))
      .at(-1);
    if (!annual) continue;

    const laterInterims = deduplicated
      .filter((entry) =>
        ["10-Q", "10-Q/A"].includes(entry.form) && String(entry.end) > String(annual.end)
      )
      .sort((a, b) =>
        String(a.end).localeCompare(String(b.end)) || a.durationDays - b.durationDays
      );
    const latestInterim = laterInterims.at(-1);
    if (!latestInterim) return toNumberOrNull(annual.val);

    const priorInterim = deduplicated
      .filter((entry) =>
        ["10-Q", "10-Q/A"].includes(entry.form) &&
        String(entry.end) < String(annual.end) &&
        entry.fp === latestInterim.fp &&
        Math.abs(entry.durationDays - latestInterim.durationDays) <= 20
      )
      .sort((a, b) => String(a.end).localeCompare(String(b.end)))
      .at(-1);
    if (!priorInterim) continue;

    const annualEps = toNumberOrNull(annual.val);
    const priorInterimEps = toNumberOrNull(priorInterim.val);
    const latestInterimEps = toNumberOrNull(latestInterim.val);
    if (annualEps === null || priorInterimEps === null || latestInterimEps === null) {
      continue;
    }
    const trailingEps = annualEps - priorInterimEps + latestInterimEps;
    if (Number.isFinite(trailingEps)) return trailingEps;
  }

  return null;
}

async function fetchSecAnnualMargins(ticker) {
  const cached = secMarginCache.get(ticker);
  if (
    cached &&
    cached.version === FINANCIAL_HISTORY_VERSION &&
    Date.now() - cached.fetchedAt < 6 * 60 * 60 * 1000
  ) {
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
    const trailingEps = calculateSecTrailingEps(facts);
    const hasDedicatedBankRevenue =
      secAnnualFactEntries(facts, "RevenuesNetOfInterestExpense").length > 0 ||
      secAnnualFactEntries(facts, "RevenueOtherFinancialServices").length > 0;
    const hasGenericRevenue = secAnnualFactEntries(facts, "Revenues").length > 0;
    const hasIndustrialPresentation =
      secAnnualFactEntries(facts, "GrossProfit").length > 0 &&
      (
        secAnnualFactEntries(facts, "RevenueFromContractWithCustomerExcludingAssessedTax").length > 0 ||
        secAnnualFactEntries(facts, "SalesRevenueNet").length > 0 ||
        secAnnualFactEntries(facts, "CostOfGoodsAndServicesSold").length > 0 ||
        secAnnualFactEntries(facts, "CostOfRevenue").length > 0
      );
    const hasBankPresentation =
      secAnnualFactEntries(facts, "InterestIncomeExpenseNet").length > 0 &&
      (
        secAnnualFactEntries(facts, "NoninterestIncome").length > 0 ||
        secAnnualFactEntries(facts, "NoninterestIncomeOtherOperatingIncome").length > 0 ||
        secAnnualFactEntries(facts, "NoninterestIncomeOther").length > 0 ||
        secAnnualFactEntries(facts, "NoninterestExpense").length > 0
      );
    const hasFinancialPresentation =
      hasBankPresentation ||
      secAnnualFactEntries(facts, "NoninterestIncome").length > 0 ||
      secAnnualFactEntries(facts, "NoninterestExpense").length > 0;
    const isFinancialCompany =
      !hasIndustrialPresentation &&
      (
        KNOWN_FINANCIAL_INSTITUTIONS.has(ticker) ||
        hasDedicatedBankRevenue ||
        (hasGenericRevenue && hasFinancialPresentation)
      );
    const revenueConcepts = isFinancialCompany
      ? [
          "RevenuesNetOfInterestExpense",
          "RevenueOtherFinancialServices",
          "OperatingRevenues",
          "Revenues",
          "RevenueFromContractWithCustomerExcludingAssessedTax",
          "SalesRevenueNet"
        ]
      : [
          "RevenueFromContractWithCustomerExcludingAssessedTax",
          "OperatingRevenues",
          "Revenues",
          "SalesRevenueNet",
          "RevenuesNetOfInterestExpense"
        ];
    let revenue = null;
    let revenueConcept = null;
    for (const concept of revenueConcepts) {
      const candidate = secAnnualFactEntries(facts, concept).at(-1);
      if (candidate && (!revenue || String(candidate.end) > String(revenue.end))) {
        revenue = candidate;
        revenueConcept = concept;
      }
    }
    if (!revenue?.val) return {};
    const endDate = revenue.end;
    const revenueEntries = secAnnualFactEntries(facts, revenueConcept);
    const previousRevenue = revenueEntries.at(-2) || null;
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
    const operatingCashFlow = latestSecAnnualFact(facts, [
      "NetCashProvidedByUsedInOperatingActivities",
      "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations"
    ], endDate);
    const capitalExpenditures = latestSecAnnualFact(facts, [
      "PaymentsToAcquirePropertyPlantAndEquipment",
      "PaymentsToAcquireProductiveAssets",
      "PaymentsForAdditionsToPropertyPlantAndEquipment",
      "PaymentsToAcquirePropertyPlantAndEquipmentAndIntangibleAssets"
    ], endDate);
    const netInterestIncome = latestSecAnnualFact(facts, [
      "InterestIncomeExpenseNet"
    ], endDate);
    const preTaxIncome = latestSecAnnualFact(facts, [
      "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
      "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments",
      "IncomeLossFromContinuingOperationsBeforeIncomeTaxesDomestic"
    ], endDate);
    const annualCashChange = latestSecAnnualFact(facts, [
      "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsPeriodIncreaseDecreaseIncludingExchangeRateEffect",
      "CashAndCashEquivalentsPeriodIncreaseDecrease"
    ], endDate);
    const previousNetIncome = previousRevenue
      ? latestSecAnnualFact(facts, [
          "NetIncomeLoss",
          "ProfitLoss",
          "NetIncomeLossAvailableToCommonStockholdersBasic"
        ], previousRevenue.end)
      : null;
    const interimRevenueEntries = secInterimFactEntries(facts, revenueConcept, endDate);
    const latestInterimRevenue = interimRevenueEntries.at(-1) || null;
    const buildInterimFacts = (interimRevenueEntry) => {
      const interimEnd = interimRevenueEntry?.end || null;
      if (!interimEnd) return null;
      const interimNetIncome = latestSecInterimFact(facts, [
        "NetIncomeLoss",
        "ProfitLoss",
        "NetIncomeLossAvailableToCommonStockholdersBasic"
      ], interimEnd, interimRevenueEntry);
      const interimGrossProfit = latestSecInterimFact(
        facts,
        ["GrossProfit"],
        interimEnd,
        interimRevenueEntry
      );
      const interimCostOfRevenue = latestSecInterimFact(facts, [
        "CostOfGoodsAndServicesSold",
        "CostOfRevenue"
      ], interimEnd, interimRevenueEntry);
      const interimOperatingIncome = latestSecInterimFact(
        facts,
        ["OperatingIncomeLoss"],
        interimEnd,
        interimRevenueEntry
      );
      const interimNetInterestIncome = latestSecInterimFact(
        facts,
        ["InterestIncomeExpenseNet"],
        interimEnd,
        interimRevenueEntry
      );
      const interimPreTaxIncome = latestSecInterimFact(facts, [
        "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
        "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments",
        "IncomeLossFromContinuingOperationsBeforeIncomeTaxesDomestic"
      ], interimEnd, interimRevenueEntry);
      const interimOperatingCashFlow = latestSecInterimFact(facts, [
        "NetCashProvidedByUsedInOperatingActivities",
        "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations"
      ], interimEnd, interimRevenueEntry);
      const interimCapitalExpenditures = latestSecInterimFact(facts, [
        "PaymentsToAcquirePropertyPlantAndEquipment",
        "PaymentsToAcquireProductiveAssets",
        "PaymentsForAdditionsToPropertyPlantAndEquipment",
        "PaymentsToAcquirePropertyPlantAndEquipmentAndIntangibleAssets"
      ], interimEnd, interimRevenueEntry);
      const interimEps = latestSecInterimFact(facts, [
        "EarningsPerShareDiluted",
        "EarningsPerShareBasicAndDiluted"
      ], interimEnd, interimRevenueEntry);

      return {
        end: interimEnd,
        netIncome: interimNetIncome,
        grossProfit: interimGrossProfit,
        costOfRevenue: interimCostOfRevenue,
        operatingIncome: interimOperatingIncome,
        netInterestIncome: interimNetInterestIncome,
        preTaxIncome: interimPreTaxIncome,
        operatingCashFlow: interimOperatingCashFlow,
        capitalExpenditures: interimCapitalExpenditures,
        eps: interimEps
      };
    };
    const interimPeriodLabel = (interimRevenueEntry) =>
      `${interimRevenueEntry.fy || interimRevenueEntry.end.slice(0, 4)} ${interimRevenueEntry.fp || "Interim"} YTD`;
    const annualGrowth = (current, previous) =>
      current?.val !== undefined && previous?.val !== undefined && previous.val !== 0
        ? ((current.val - previous.val) / Math.abs(previous.val)) * 100
        : null;
    const marginHistory = [
      ...revenueEntries.slice(-6).map((revenueEntry) => {
      const yearEnd = revenueEntry.end;
      const annualGrossProfit = latestSecAnnualFact(facts, ["GrossProfit"], yearEnd);
      const annualCostOfRevenue = latestSecAnnualFact(facts, [
        "CostOfGoodsAndServicesSold",
        "CostOfRevenue"
      ], yearEnd);
      const annualOperatingIncome = latestSecAnnualFact(
        facts,
        ["OperatingIncomeLoss"],
        yearEnd
      );
      const annualNetIncome = latestSecAnnualFact(facts, [
        "NetIncomeLoss",
        "ProfitLoss",
        "NetIncomeLossAvailableToCommonStockholdersBasic"
      ], yearEnd);
      const annualNetInterestIncome = latestSecAnnualFact(
        facts,
        ["InterestIncomeExpenseNet"],
        yearEnd
      );
      const annualPreTaxIncome = latestSecAnnualFact(facts, [
        "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
        "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments",
        "IncomeLossFromContinuingOperationsBeforeIncomeTaxesDomestic"
      ], yearEnd);
      const annualGrossProfitValue = annualGrossProfit?.val ?? (
        annualCostOfRevenue?.val !== undefined
          ? revenueEntry.val - annualCostOfRevenue.val
          : null
      );
      const percentageOfRevenue = (value) =>
        value !== null && value !== undefined && revenueEntry.val !== 0
          ? (value / revenueEntry.val) * 100
          : null;

      return {
        year: Number(yearEnd.slice(0, 4)),
        period: String(yearEnd.slice(0, 4)),
        isInterim: false,
        grossMargin: percentageOfRevenue(
          isFinancialCompany ? annualNetInterestIncome?.val : annualGrossProfitValue
        ),
        operatingMargin: percentageOfRevenue(
          isFinancialCompany ? annualPreTaxIncome?.val : annualOperatingIncome?.val
        ),
        profitMargin: percentageOfRevenue(annualNetIncome?.val),
        source: "SEC annual filing"
      };
      }),
      ...interimRevenueEntries.map((interimRevenueEntry) => {
        const interimFacts = buildInterimFacts(interimRevenueEntry);
        const interimGrossProfitValue = interimFacts?.grossProfit?.val ?? (
          interimFacts?.costOfRevenue?.val !== undefined
            ? interimRevenueEntry.val - interimFacts.costOfRevenue.val
            : null
        );
        const percentageOfInterimRevenue = (value) =>
          value !== null && value !== undefined && interimRevenueEntry.val !== 0
            ? (value / interimRevenueEntry.val) * 100
            : null;

        return {
          year: Number(interimRevenueEntry.fy || interimRevenueEntry.end.slice(0, 4)),
          period: interimPeriodLabel(interimRevenueEntry),
          isInterim: true,
          grossMargin: percentageOfInterimRevenue(
            isFinancialCompany ? interimFacts?.netInterestIncome?.val : interimGrossProfitValue
          ),
          operatingMargin: percentageOfInterimRevenue(
            isFinancialCompany ? interimFacts?.preTaxIncome?.val : interimFacts?.operatingIncome?.val
          ),
          profitMargin: percentageOfInterimRevenue(interimFacts?.netIncome?.val),
          source: "SEC interim filing"
        };
      })
    ].filter(Boolean);
    const grossProfitValue = isFinancialCompany
      ? null
      : grossProfit?.val ?? (
          costOfRevenue?.val !== undefined ? revenue.val - costOfRevenue.val : null
        );
    const data = {
      fiscalYear: Number(revenue.fy || endDate.slice(0, 4)),
      isFinancialCompany,
      revenueConcept,
      revenueGrowth: annualGrowth(revenue, previousRevenue),
      earningsGrowth: annualGrowth(netIncome, previousNetIncome),
      trailingEps,
      marginHistory,
      bankMetrics: isFinancialCompany
        ? {
            netInterestRevenueMix: netInterestIncome?.val !== undefined
              ? (netInterestIncome.val / revenue.val) * 100
              : null,
            preTaxMargin: preTaxIncome?.val !== undefined
              ? (preTaxIncome.val / revenue.val) * 100
              : null,
            annualCashChange: annualCashChange?.val ?? null
          }
        : null,
      history: [
        previousRevenue
          ? {
              year: Number(previousRevenue.end.slice(0, 4)),
              revenue: previousRevenue.val / 1000000000,
              earnings: previousNetIncome?.val !== undefined
                ? previousNetIncome.val / 1000000000
                : null,
              operatingCashflow: latestSecAnnualFact(facts, [
                "NetCashProvidedByUsedInOperatingActivities",
                "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations"
              ], previousRevenue.end)?.val / 1000000000,
              eps: null,
              source: "SEC annual filing"
            }
          : null,
        {
          year: Number(endDate.slice(0, 4)),
          revenue: revenue.val / 1000000000,
          earnings: netIncome?.val !== undefined ? netIncome.val / 1000000000 : null,
          operatingCashflow: operatingCashFlow?.val !== undefined
            ? operatingCashFlow.val / 1000000000
            : null,
          eps: null,
          source: "SEC annual filing"
        },
        ...interimRevenueEntries.map((interimRevenueEntry) => {
          const interimFacts = buildInterimFacts(interimRevenueEntry);
          const interimGrossProfitValue = interimFacts?.grossProfit?.val ?? (
            interimFacts?.costOfRevenue?.val !== undefined
              ? interimRevenueEntry.val - interimFacts.costOfRevenue.val
              : null
          );

          return {
            year: Number(interimRevenueEntry.fy || interimRevenueEntry.end.slice(0, 4)),
            period: interimPeriodLabel(interimRevenueEntry),
            isInterim: true,
            revenue: interimRevenueEntry.val / 1000000000,
            earnings: interimFacts?.netIncome?.val !== undefined
              ? interimFacts.netIncome.val / 1000000000
              : null,
            grossProfit:
              interimGrossProfitValue !== null && interimGrossProfitValue !== undefined
                ? interimGrossProfitValue / 1000000000
                : null,
            operatingIncome: interimFacts?.operatingIncome?.val !== undefined
              ? interimFacts.operatingIncome.val / 1000000000
              : null,
            operatingCashflow: interimFacts?.operatingCashFlow?.val !== undefined
              ? interimFacts.operatingCashFlow.val / 1000000000
              : null,
            freeCashflow:
              interimFacts?.operatingCashFlow?.val !== undefined &&
              interimFacts?.capitalExpenditures?.val !== undefined
                ? (interimFacts.operatingCashFlow.val - Math.abs(interimFacts.capitalExpenditures.val)) / 1000000000
                : null,
            eps: interimFacts?.eps?.val ?? null,
            source: "SEC interim filing"
          };
        })
      ].filter(Boolean),
      grossMargins: grossProfitValue !== null
        ? (grossProfitValue / revenue.val) * 100
        : null,
      operatingMargins: !isFinancialCompany && operatingIncome?.val !== undefined
        ? (operatingIncome.val / revenue.val) * 100
        : null,
      profitMargins: netIncome?.val !== undefined
        ? (netIncome.val / revenue.val) * 100
        : null,
      freeCashflow:
        !isFinancialCompany &&
        operatingCashFlow?.val !== undefined && capitalExpenditures?.val !== undefined
          ? operatingCashFlow.val - Math.abs(capitalExpenditures.val)
          : null
    };
    secMarginCache.set(ticker, {
      data,
      fetchedAt: Date.now(),
      version: FINANCIAL_HISTORY_VERSION
    });
    return data;
  } catch (err) {
    console.log("SEC annual margins skipped:", ticker, err.message);
    return { secFetchFailed: true };
  }
}

function findFinancialValue(items, concepts) {
  const row = items.find((item) => concepts.includes(item.concept));
  return row?.value ?? null;
}

const toNumberOrNull = (value) => {
  if (value === null || value === undefined || value === "") return null;
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

const firstText = (...values) => {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text) return text;
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

const normalizeQuotePayload = (quote = {}, fallback = {}) => ({
  c: firstNumber(quote.c, fallback.price),
  d: firstFiniteNumber(quote.d, fallback.change),
  dp: firstFiniteNumber(quote.dp, fallback.percentChange),
  pc: firstNumber(quote.pc, fallback.previousClose),
  h: firstNumber(quote.h, fallback.high),
  l: firstNumber(quote.l, fallback.low),
  o: firstNumber(quote.o, fallback.open)
});

async function getPrimaryQuote(ticker) {
  try {
    return normalizeQuotePayload(
      await getFinnhub(`https://finnhub.io/api/v1/quote?symbol=${ticker}`)
    );
  } catch (err) {
    console.log("Finnhub quote skipped:", ticker, err.response?.status || err.message);
    const yahooData = await getYahooSupplementalData(ticker);
    return normalizeQuotePayload({}, yahooData);
  }
}

const sanitizeForwardEps = (candidate, historicalFallback) => {
  const estimate = toNumberOrNull(candidate);
  const fallback = toNumberOrNull(historicalFallback);
  if (estimate === null) return fallback;
  if (fallback === null || fallback === 0) return estimate;

  const ratio = Math.abs(estimate / fallback);
  return ratio < 0.125 || ratio > 8 ? fallback : estimate;
};

const sanitizeRevenueEstimate = (candidate, historicalRevenue) => {
  const estimate = toNumberOrNull(candidate);
  const baseline = toNumberOrNull(historicalRevenue);
  if (estimate === null) return null;
  if (baseline === null || baseline <= 0) return estimate;

  const ratio = estimate / baseline;
  const maxRatio = baseline < 1000000000 ? 10 : baseline < 5000000000 ? 6 : 2.5;
  const minRatio = baseline < 1000000000 ? 0.2 : 0.4;
  return ratio >= minRatio && ratio <= maxRatio ? estimate : null;
};

const sanitizeNearTermRevenueEstimate = (candidate, baselineRevenue) => {
  const estimate = toNumberOrNull(candidate);
  const baseline = toNumberOrNull(baselineRevenue);
  if (estimate === null) return null;
  if (baseline === null || baseline <= 0) return estimate;

  const ratio = estimate / baseline;
  const maxRatio = baseline < 1000000000 ? 10 : baseline < 5000000000 ? 6 : 2.2;
  const minRatio = baseline < 1000000000 ? 0.2 : 0.85;
  return ratio >= minRatio && ratio <= maxRatio ? estimate : null;
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

const estimateDecayedForwardValue = (
  currentEstimate,
  previousActual,
  maxGrowth = 0.6,
  decay = 0.5
) => {
  const current = toNumberOrNull(currentEstimate);
  const previous = toNumberOrNull(previousActual);
  if (current === null || previous === null || previous === 0) return null;

  const growth = (current - previous) / Math.abs(previous);
  return current * (1 + clamp(growth * decay, -0.2, maxGrowth));
};

const conservativeProjectionRate = (growthRate, maxGrowth = 0.12) => {
  const rate = toNumberOrNull(growthRate);
  if (rate === null || rate === 0) return 0.05;
  const normalized = Math.abs(rate) > 1 ? rate / 100 : rate;
  return clamp(normalized, -0.15, maxGrowth);
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

const reconcilePriceToBook = (reportedPriceToBook, price, bookValuePerShare) => {
  const reported = toNumberOrNull(reportedPriceToBook);
  const priceNumber = toNumberOrNull(price);
  const bookValue = toNumberOrNull(bookValuePerShare);
  const computed =
    priceNumber !== null && bookValue !== null && bookValue > 0
      ? priceNumber / bookValue
      : null;

  if (reported === null) return computed;
  if (computed === null) return reported;

  const ratio = computed / reported;
  return ratio > 1.25 || ratio < 0.8 ? computed : reported;
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
  const rowsByPeriod = new Map();

  [...fallback, ...primary].forEach((row) => {
    if (!row?.year) return;

    const period = row.period || String(row.year);
    const rowKey = row.isInterim ? `${row.year}:${period}` : `${row.year}:annual`;
    const existing = rowsByPeriod.get(rowKey) || { year: row.year };

    rowsByPeriod.set(rowKey, {
      year: row.year,
      period: period ?? existing.period ?? null,
      isInterim: row.isInterim ?? existing.isInterim ?? false,
      revenue: row.revenue ?? existing.revenue ?? null,
      earnings: row.earnings ?? existing.earnings ?? null,
      eps: row.eps ?? existing.eps ?? null,
      grossProfit: row.grossProfit ?? existing.grossProfit ?? null,
      operatingIncome: row.operatingIncome ?? existing.operatingIncome ?? null,
      operatingCashflow: row.operatingCashflow ?? existing.operatingCashflow ?? null,
      freeCashflow: row.freeCashflow ?? existing.freeCashflow ?? null,
      sharesOutstanding: row.sharesOutstanding ?? existing.sharesOutstanding ?? null,
      source: row.source || existing.source
    });
  });

  const mergedRows = [...rowsByPeriod.values()]
    .filter((row) =>
      row.revenue !== null ||
      row.earnings !== null ||
      row.eps !== null ||
      row.grossProfit !== null ||
      row.operatingIncome !== null ||
      row.operatingCashflow !== null ||
      row.freeCashflow !== null ||
      row.sharesOutstanding !== null
    )
    .sort((a, b) => {
      const yearDiff = a.year - b.year;
      if (yearDiff !== 0) return yearDiff;
      if (a.isInterim !== b.isInterim) return a.isInterim ? 1 : -1;
      return String(a.period || "").localeCompare(String(b.period || ""));
    });

  return removeDuplicateInterimAnnualRows(mergedRows).slice(-7);
}

function removeDuplicateInterimAnnualRows(rows) {
  const annualYears = new Set(
    (rows || [])
      .filter((row) => row?.year && !row?.isInterim)
      .map((row) => Number(row.year))
  );
  const duplicateInterimYears = new Set(
    (rows || [])
      .filter((row) => row?.isInterim)
      .map((row) => Number(row.year))
      .filter((year) => annualYears.has(year))
  );

  if (!duplicateInterimYears.size) return rows;

  return (rows || []).filter(
    (row) =>
      !row?.isInterim ||
      !duplicateInterimYears.has(Number(row.year))
  );
}

function getRecentEarningsReleaseAnnualRows(ticker) {
  if (ticker !== "FDX") return [];

  return [{
    year: 2026,
    period: "2026",
    isInterim: false,
    revenue: 94.7,
    earnings: 4.43,
    eps: 18.55,
    operatingIncome: 5.46,
    sharesOutstanding: 238.81401617250673,
    source: "FedEx FY2026 earnings release"
  }];
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

const normalizeHistoricalShares = (candidate, currentShares) => {
  let shares = toNumberOrNull(candidate);
  const baseline = toNumberOrNull(currentShares);
  if (shares === null || baseline === null || baseline <= 0) return shares;

  while (shares > 0 && shares < baseline * 0.4) shares *= 10;
  while (shares > baseline * 2.5) shares /= 10;
  return shares;
};

function finalizeFinancialHistory(rows, sharesOutstanding) {
  return fillEstimatedEps(rows, sharesOutstanding).map((row) => ({
    year: row.year,
    period: row.period || String(row.year),
    isInterim: Boolean(row.isInterim),
    revenue: toNumberOrNull(row.revenue),
    earnings: toNumberOrNull(row.earnings),
    eps: toNumberOrNull(row.eps),
    grossProfit: toNumberOrNull(row.grossProfit),
    operatingIncome: toNumberOrNull(row.operatingIncome),
    operatingCashflow: toNumberOrNull(row.operatingCashflow),
    freeCashflow: toNumberOrNull(row.freeCashflow),
    sharesOutstanding: normalizeHistoricalShares(
      firstFiniteNumber(
        row.sharesOutstanding,
        row.earnings !== null &&
          row.earnings !== undefined &&
          row.eps !== null &&
          row.eps !== undefined &&
          row.eps !== 0
          ? (row.earnings * 1000) / row.eps
          : null,
        sharesOutstanding
      ),
      sharesOutstanding
    ),
    source: row.source
  }));
}

function finalizeRevenueHistory(rows) {
  const revenueRows = (rows || [])
    .map((row) => ({
      year: row.year,
      period: row.period || String(row.year),
      isInterim: Boolean(row.isInterim),
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

function historicalGrowth(rows, field, currentYear = 2025, previousYear = 2024) {
  const sortedRows = [...(rows || [])]
    .filter((row) => row?.year)
    .sort((a, b) => a.year - b.year);
  const currentRow = sortedRows.find((row) => Number(row.year) === currentYear);
  const previousRow = sortedRows.find((row) => Number(row.year) === previousYear);
  const fallbackCurrent = sortedRows.at(-1);
  const fallbackPrevious = sortedRows.at(-2);
  const current = toNumberOrNull((currentRow || fallbackCurrent)?.[field]);
  const previous = toNumberOrNull((previousRow || fallbackPrevious)?.[field]);

  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function hasChartHistory(stock, key) {
  return stock?.data?.revenueData?.some((row) => toNumberOrNull(row[key]) !== null);
}

function hasCompleteChartHistory(stock) {
  const data = stock?.data || {};
  const latestHistoryYear = Math.max(
    ...((data.revenueData || [])
      .map((row) => Number(row.year))
      .filter((year) => Number.isFinite(year)))
  );
  const needsInterimCheck =
    Number.isFinite(latestHistoryYear) &&
    latestHistoryYear >= new Date().getFullYear() - 1;

  return (
    hasChartHistory(stock, "revenue") &&
    hasChartHistory(stock, "earnings") &&
    hasChartHistory(stock, "eps") &&
    (!needsInterimCheck || Boolean(data.interimHistoryCheckedAt))
  );
}

function hasCompleteSupplementalData(stock) {
  const data = stock?.data || {};
  const requiresIndustrialMetrics = !data.isFinancialCompany;
  const currentYear = data.analystEstimates?.currentYear || {};
  const nextYear = data.analystEstimates?.nextYear || {};
  const followingYear = data.analystEstimates?.followingYear || {};

  return (
    (!requiresIndustrialMetrics || toNumberOrNull(data.freeCashflow) !== null) &&
    toNumberOrNull(data.targetMean) !== null &&
    toNumberOrNull(data.priceToSales) !== null &&
    toNumberOrNull(data.priceToBook) !== null &&
    toNumberOrNull(data.pe) !== null &&
    toNumberOrNull(data.forwardPE) !== null &&
    (!requiresIndustrialMetrics || toNumberOrNull(data.grossMargins) !== null) &&
    (!requiresIndustrialMetrics || toNumberOrNull(data.operatingMargins) !== null) &&
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

function shouldPreserveBankMargins(data, previousData) {
  if (!previousData?.isFinancialCompany || !previousData?.bankMetrics) return false;
  if (data?.isFinancialCompany) return false;

  const hasPreviousBankMarginHistory = (previousData.marginHistory || []).some((row) =>
    toNumberOrNull(row?.grossMargin) !== null ||
    toNumberOrNull(row?.operatingMargin) !== null
  );
  if (!hasPreviousBankMarginHistory) return false;

  const latestGross = [...(data.marginHistory || [])]
    .filter((row) => row?.year)
    .sort((a, b) => a.year - b.year)
    .at(-1)?.grossMargin;

  return data?.marginSource === "Market data fallback" || toNumberOrNull(latestGross) === 0;
}

function preserveBankMargins(data, previousData) {
  if (!shouldPreserveBankMargins(data, previousData)) return data;

  return {
    ...data,
    isFinancialCompany: true,
    bankMetrics: previousData.bankMetrics,
    marginHistory: previousData.marginHistory,
    grossMargins: previousData.grossMargins,
    operatingMargins: previousData.operatingMargins,
    profitMargins: previousData.profitMargins,
    marginSource: previousData.marginSource || "SEC annual filing (banking presentation)",
    freeCashflow: null,
    freeCashflowSource: "Not meaningful for banking businesses"
  };
}

function withGuaranteedAnalystSection(data = {}) {
  const hasSuppliedAnalystEstimates =
    toNumberOrNull(data.analystEstimates?.currentYear?.revenue) !== null &&
    toNumberOrNull(data.analystEstimates?.currentYear?.eps) !== null &&
    toNumberOrNull(data.analystEstimates?.nextYear?.revenue) !== null &&
    toNumberOrNull(data.analystEstimates?.nextYear?.eps) !== null;
  const yahooLockedEstimates =
    data.analystEstimatesSource === "Yahoo Finance" &&
    (
      toNumberOrNull(data.analystEstimates?.currentYear?.revenue) !== null ||
      toNumberOrNull(data.analystEstimates?.currentYear?.eps) !== null ||
      toNumberOrNull(data.analystEstimates?.nextYear?.revenue) !== null ||
      toNumberOrNull(data.analystEstimates?.nextYear?.eps) !== null
    );
  const isFinancialCompany = data.isFinancialCompany === true;
  const price = toNumberOrNull(data.price);
  const revenueRows = Array.isArray(data.revenueData) ? data.revenueData : [];
  const sortedRevenueRows = [...revenueRows]
    .filter((row) => row?.year)
    .sort((a, b) => a.year - b.year);
  const latestRevenueRow =
    sortedRevenueRows.filter((row) => !row.isInterim).at(-1) ||
    sortedRevenueRows.at(-1) ||
    {};
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
  const revenueGrowth = firstFiniteNumber(
    historicalGrowth(revenueRows, "revenue"),
    data.revenueGrowth,
    5
  );
  const earningsGrowth = firstFiniteNumber(
    historicalGrowth(revenueRows, "earnings"),
    data.earningsGrowth,
    revenueGrowth,
    5
  );
  const currentYear = data.analystEstimates?.currentYear || {};
  const nextYear = data.analystEstimates?.nextYear || {};
  const followingYear = data.analystEstimates?.followingYear || {};
  const latestReportedRevenue = toDollarsFromBillions(latestRevenueRow.revenue);
  const latestInterimRevenueRow = sortedRevenueRows
    .filter((row) => row?.isInterim && toNumberOrNull(row.revenue) !== null)
    .at(-1);
  const latestInterimRevenue = toDollarsFromBillions(latestInterimRevenueRow?.revenue);
  const latestInterimQuarter = Number(
    String(latestInterimRevenueRow?.period || "").match(/Q([1-3])/i)?.[1]
  );
  const latestInterimAnnualizedRevenue =
    latestInterimRevenue && latestInterimQuarter
      ? latestInterimRevenue * (4 / latestInterimQuarter)
      : null;
  const safeCurrentRevenue = sanitizeNearTermRevenueEstimate(
    currentYear.revenue,
    latestReportedRevenue
  );
  const usableCurrentRevenue =
    latestInterimRevenue && safeCurrentRevenue < latestInterimRevenue * 1.01
      ? null
      : safeCurrentRevenue;
  const currentRevenue = estimateRevenueFallback(
    firstNumber(
      usableCurrentRevenue,
      latestInterimAnnualizedRevenue,
      estimateNextValue(latestReportedRevenue, safeGrowthRate(revenueGrowth)),
      latestReportedRevenue
    ),
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
  const operatingMargins = isFinancialCompany
    ? toNumberOrNull(data.operatingMargins)
    : firstNumber(data.operatingMargins, profitMargins);
  const grossMargins = isFinancialCompany
    ? toNumberOrNull(data.grossMargins)
    : firstNumber(data.grossMargins, operatingMargins, profitMargins);
  const priceToSales = firstNumber(
    data.priceToSales,
    marketCap !== null && currentRevenue > 0 ? marketCap / currentRevenue : null
  );
  const bookValuePerShare = firstNumber(data.bookValuePerShare);
  const priceToBook = reconcilePriceToBook(data.priceToBook, price, bookValuePerShare);
  const safeNextRevenue = sanitizeNearTermRevenueEstimate(
    nextYear.revenue,
    currentRevenue
  );
  const usableNextRevenue =
    currentRevenue && safeNextRevenue < currentRevenue * 1.03
      ? null
      : safeNextRevenue;
  const nextRevenue = estimateRevenueFallback(
    firstNumber(
      usableNextRevenue,
      estimateNextValue(currentRevenue, safeGrowthRate(revenueGrowth))
    ),
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
  const safeFollowingRevenue = sanitizeNearTermRevenueEstimate(
    followingYear.revenue,
    nextRevenue
  );
  const followingRevenue = firstNumber(safeFollowingRevenue);
  const provisionalFollowingEarnings = estimateEarningsFallback(
    firstNumber(followingYear.earnings),
    followingRevenue,
    profitMargins
  );
  const consensusCurrentYearEps = toNumberOrNull(data.consensusCurrentYearEps);
  const currentEps = estimateEpsFallback(
    firstNumber(consensusCurrentYearEps, currentYear.eps, data.trailingEps),
    provisionalCurrentEarnings,
    sharesOutstanding
  );
  const nextEps = estimateEpsFallback(
    firstNumber(nextYear.eps, data.consensusNextYearEps, data.forwardEps),
    provisionalNextEarnings,
    sharesOutstanding
  );
  const followingEps = estimateEpsFallback(
    firstNumber(data.consensusNextYearEps, followingYear.eps),
    provisionalFollowingEarnings,
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
  const followingEarnings = reconcileEarningsEstimate({
    earnings: provisionalFollowingEarnings,
    eps: followingEps,
    shares: sharesOutstanding,
    revenue: followingRevenue,
    profitMargin: profitMargins
  });
  const trailingEps = toNumberOrNull(data.trailingEps);
  const consensusNextYearEps = toNumberOrNull(data.consensusNextYearEps);
  const suppliedForwardEps = toNumberOrNull(data.forwardEps);
  const pe = firstNumber(
    price !== null && trailingEps > 0 ? price / trailingEps : null,
    data.pe,
    price !== null && currentEps > 0 ? price / currentEps : null
  );
  const forwardPE = firstNumber(
    data.forwardPE,
    price !== null && suppliedForwardEps > 0 ? price / suppliedForwardEps : null,
    price !== null && consensusNextYearEps > 0 ? price / consensusNextYearEps : null,
    price !== null && nextEps > 0 ? price / nextEps : null
  );
  const fiftyTwoWeekHigh = firstNumber(data.fiftyTwoWeekHigh, data.high, price);
  const fiftyTwoWeekLow = firstNumber(data.fiftyTwoWeekLow, data.low, price);
  const freeCashflow = isFinancialCompany
    ? null
    : estimateFreeCashFlowFallback({
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
  const analystRatingText = firstText(data.analystRatingText, recommendationKey);
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
  const fallbackAnalystEstimates = {
    currentYear: {
      revenue: currentRevenue,
      earnings: currentEarnings,
      eps: currentEps
    },
    nextYear: {
      revenue: nextRevenue,
      earnings: nextEarnings,
      eps: nextEps
    },
    followingYear: {
      revenue: followingRevenue,
      earnings: followingEarnings,
      eps: followingEps
    }
  };
  const suppliedCurrentEps = toNumberOrNull(data.analystEstimates?.currentYear?.eps);
  const suppliedNextEps = toNumberOrNull(data.analystEstimates?.nextYear?.eps);
  const currentEpsNeedsRepair =
    consensusCurrentYearEps !== null &&
    suppliedCurrentEps !== null &&
    (
      suppliedCurrentEps > consensusCurrentYearEps * 1.25 ||
      suppliedCurrentEps < consensusCurrentYearEps * 0.75 ||
      (suppliedNextEps !== null && suppliedCurrentEps > suppliedNextEps * 1.25)
    );
  const suppliedAnalystEstimates = currentEpsNeedsRepair
    ? {
        ...(data.analystEstimates || {}),
        currentYear: {
          ...(data.analystEstimates?.currentYear || {}),
          earnings: currentEarnings,
          eps: currentEps
        }
      }
    : data.analystEstimates;

  return {
    ...data,
    marketCap,
    sharesOutstanding,
    pe,
    priceToSales,
    priceToBook,
    bookValuePerShare,
    forwardPE,
    revenueGrowth,
    earningsGrowth,
    grossMargins,
    operatingMargins,
    profitMargins,
    fiftyTwoWeekHigh,
    fiftyTwoWeekLow,
    freeCashflow,
    targetMean,
    recommendationKey,
    analystRatingText,
    analystEstimates: yahooLockedEstimates || hasSuppliedAnalystEstimates
      ? suppliedAnalystEstimates
      : fallbackAnalystEstimates,
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
      "annualOperatingCashFlow",
      "annualNetCashProvidedByUsedInOperatingActivities",
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

        if (
          [
            "annualOperatingCashFlow",
            "annualNetCashProvidedByUsedInOperatingActivities"
          ].includes(key)
        ) {
          row.operatingCashflow = row.operatingCashflow ?? toBillions(value);
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
        grossProfit: toBillions(unwrapFinancialValue(row.grossProfit)),
        operatingIncome: toBillions(unwrapFinancialValue(row.operatingIncome)),
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

async function fetchYahooYearEndPrices(ticker) {
  const cached = yearEndPriceCache.get(ticker);
  if (cached && Date.now() - cached.fetchedAt < 6 * 60 * 60 * 1000) {
    return cached.data;
  }

  try {
    const response = await axios.get(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}`,
      {
        params: {
          range: "6y",
          interval: "1mo",
          events: "history",
          includeAdjustedClose: true
        },
        headers: { "User-Agent": "Mozilla/5.0" },
        timeout: 12000
      }
    );
    const result = response.data?.chart?.result?.[0] || {};
    const timestamps = result.timestamp || [];
    const adjustedCloses = result.indicators?.adjclose?.[0]?.adjclose || [];
    const closes = result.indicators?.quote?.[0]?.close || [];
    const pricesByYear = new Map();

    timestamps.forEach((timestamp, index) => {
      const date = new Date(timestamp * 1000);
      const close = firstYahooNumber(adjustedCloses[index], closes[index]);
      if (Number.isNaN(date.getTime()) || close === null) return;
      const year = date.getUTCFullYear();
      const existing = pricesByYear.get(year);
      if (!existing || timestamp > existing.timestamp) {
        pricesByYear.set(year, { year, timestamp, close });
      }
    });

    const data = [...pricesByYear.values()]
      .map(({ year, close }) => ({ year, close }))
      .sort((a, b) => a.year - b.year);
    yearEndPriceCache.set(ticker, { data, fetchedAt: Date.now() });
    return data;
  } catch (err) {
    console.log("Yahoo year-end prices skipped:", ticker, err.message);
    return [];
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
          sharesOutstanding: toNumberOrNull(
            row.weightedAverageShsOutDil ??
            row.weightedAverageShsOutDiluted ??
            row.weightedAverageShsOut
          )
            ? toNumberOrNull(
                row.weightedAverageShsOutDil ??
                row.weightedAverageShsOutDiluted ??
                row.weightedAverageShsOut
              ) / 1000000
            : null,
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
    const chartQuotes = chartData?.quotes || [];
    const recentCutoff = Date.now() - 365 * 24 * 60 * 60 * 1000;
    const recentChartQuotes = chartQuotes.filter((row) => {
      const date = new Date(row.date);
      return !Number.isNaN(date.getTime()) && date.getTime() >= recentCutoff;
    });
    const chartHighs = recentChartQuotes
      .map((row) => toNumberOrNull(row.high))
      .filter((value) => value !== null);
    const chartLows = recentChartQuotes
      .map((row) => toNumberOrNull(row.low))
      .filter((value) => value !== null);
    const chartHigh = chartHighs.length ? Math.max(...chartHighs) : null;
    const chartLow = chartLows.length ? Math.min(...chartLows) : null;
    const yearEndPriceMap = new Map();
    chartQuotes.forEach((row) => {
      const date = new Date(row.date);
      const close = firstYahooNumber(row.adjclose, row.close);
      if (Number.isNaN(date.getTime()) || close === null) return;
      const year = date.getFullYear();
      const existing = yearEndPriceMap.get(year);
      if (!existing || date > existing.date) {
        yearEndPriceMap.set(year, { year, date, close });
      }
    });
    const yearEndPrices = [...yearEndPriceMap.values()]
      .map(({ year, close }) => ({ year, close }))
      .sort((a, b) => a.year - b.year);

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
      priceToBook: firstYahooNumber(
        keyStats.priceToBook,
        quoteData.priceToBook,
        financialData.priceToBook
      ),
      bookValuePerShare: firstYahooNumber(keyStats.bookValue, quoteData.bookValue),
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
      yearEndPrices,
      revenueGrowth: normalizePercent(unwrapFinancialValue(financialData.revenueGrowth)),
      earningsGrowth: normalizePercent(unwrapFinancialValue(financialData.earningsGrowth)),
      grossMargins: normalizePercent(unwrapFinancialValue(financialData.grossMargins)),
      operatingMargins: normalizePercent(unwrapFinancialValue(financialData.operatingMargins)),
      profitMargins: normalizePercent(unwrapFinancialValue(financialData.profitMargins)),
      freeCashflow: firstYahooNumber(financialData.freeCashflow),
      targetMean: firstYahooNumber(financialData.targetMeanPrice),
      targetMedian: firstYahooNumber(financialData.targetMedianPrice),
      recommendationKey:
        normalizeRating(financialData.recommendationKey) ||
        normalizeRating(quoteData.averageAnalystRating),
      analystRatingText: firstText(
        quoteData.averageAnalystRating,
        financialData.recommendationMean?.fmt && financialData.recommendationKey
          ? `${financialData.recommendationMean.fmt} - ${financialData.recommendationKey}`
          : null,
        financialData.recommendationKey
      ),
      recommendationMean: firstYahooNumber(financialData.recommendationMean),
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

const resolveWithin = (promise, ms, fallback = null) =>
  new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    Promise.resolve(promise)
      .then((value) => resolve(value))
      .catch(() => resolve(fallback))
      .finally(() => clearTimeout(timer));
  });

async function fetchYahooQuickQuote(ticker) {
  try {
    const quoteData = await yahooFinance.quote(ticker);
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
      marketCap: firstYahooNumber(quoteData.marketCap),
      pe: firstYahooNumber(quoteData.trailingPE),
      forwardPE: firstYahooNumber(quoteData.forwardPE),
      trailingEps: firstYahooNumber(
        quoteData.epsTrailingTwelveMonths,
        quoteData.trailingEps
      ),
      forwardEps: firstYahooNumber(
        quoteData.epsForward,
        quoteData.forwardEps
      ),
      priceToSales: firstYahooNumber(quoteData.priceToSalesTrailing12Months),
      priceToBook: firstYahooNumber(quoteData.priceToBook),
      bookValuePerShare: firstYahooNumber(quoteData.bookValue),
      dividendYield: normalizeDividendYield(
        firstYahooNumber(
          unwrapFinancialValue(quoteData.dividendYield),
          unwrapFinancialValue(quoteData.trailingAnnualDividendYield)
        )
      ),
      fiftyTwoWeekHigh: firstYahooNumber(
        quoteData.fiftyTwoWeekHigh,
        quoteData.fiftyTwoWeekRange?.high
      ),
      fiftyTwoWeekLow: firstYahooNumber(
        quoteData.fiftyTwoWeekLow,
        quoteData.fiftyTwoWeekRange?.low
      ),
      recommendationKey: normalizeRating(quoteData.averageAnalystRating),
      analystRatingText: firstText(quoteData.averageAnalystRating)
    };
  } catch (err) {
    console.log("Yahoo quick quote skipped:", ticker, err.message);
    return {};
  }
}

async function publishFastStockSnapshot(ticker) {
  const stock = await Stock.findOne({ ticker }).lean();
  const quickData = await buildFastStockSnapshot(ticker, stock?.data || {});
  if (!quickData) return;

  await Stock.findOneAndUpdate(
    { ticker, ...(stock?.updatedAt ? { updatedAt: stock.updatedAt } : {}) },
    {
      ticker,
      status: "pending",
      data: quickData,
      updatedAt: new Date()
    },
    { upsert: true }
  );
}

async function buildFastStockSnapshot(ticker, previousData = {}) {
  const yahooData = await fetchYahooQuickQuote(ticker);
  if (!yahooData?.price) return null;

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
  return withGuaranteedAnalystSection({
    ...previousData,
    ...definedValues(yahooData),
    forwardPE: firstNumber(
      yahooData.forwardPE,
      nextEps > 0 ? yahooData.price / nextEps : null,
      previousData.forwardPE
    ),
    analystEstimates
  });
}

function buildMinimalStockSnapshot(ticker, previousData = {}) {
  return withGuaranteedAnalystSection({
    ...previousData,
    name: previousData.name || ticker,
    symbol: ticker,
    logo: previousData.logo || getFinnhubLogoUrl(ticker),
    revenueData: previousData.revenueData || [],
    revenueHistory: previousData.revenueHistory || []
  });
}

const getImmediateStockSnapshot = async (ticker, previousData = {}) =>
  (await resolveWithin(buildFastStockSnapshot(ticker, previousData), 1200, null)) ||
  buildMinimalStockSnapshot(ticker, previousData);

async function publishChartHistorySnapshot(ticker, previousData = {}, secAnnualMargins = {}, sharesOutstanding = null) {
  if (!Array.isArray(secAnnualMargins.history) || !secAnnualMargins.history.length) return;

  const revenueData = removeDuplicateInterimAnnualRows(finalizeFinancialHistory(
    mergeHistoricalFinancials(secAnnualMargins.history, previousData.revenueData || []),
    sharesOutstanding
  ));

  if (!hasCompleteChartHistory({ data: { ...previousData, revenueData, interimHistoryCheckedAt: new Date().toISOString() } })) {
    return;
  }

  const revenueHistory = removeDuplicateInterimAnnualRows(finalizeRevenueHistory(revenueData));
  const annualMargin = (numerator, revenue) => {
    const numeratorNumber = toNumberOrNull(numerator);
    const revenueNumber = toNumberOrNull(revenue);
    return numeratorNumber !== null && revenueNumber ? (numeratorNumber / revenueNumber) * 100 : null;
  };
  const fallbackMarginHistory = revenueData.map((row) => ({
    year: row.year,
    period: row.period || String(row.year),
    isInterim: Boolean(row.isInterim),
    grossMargin: annualMargin(row.grossProfit, row.revenue),
    operatingMargin: annualMargin(row.operatingIncome, row.revenue),
    profitMargin: annualMargin(row.earnings, row.revenue),
    source: row.source
  }));
  const marginRowsByPeriod = new Map();

  [...fallbackMarginHistory, ...(secAnnualMargins.marginHistory || [])].forEach((row) => {
    if (!row?.year) return;
    const period = row.period || String(row.year);
    const rowKey = row.isInterim ? `${row.year}:${period}` : `${row.year}:annual`;
    const existing = marginRowsByPeriod.get(rowKey) || {};
    marginRowsByPeriod.set(rowKey, {
      year: row.year,
      period,
      isInterim: row.isInterim ?? existing.isInterim ?? false,
      grossMargin: row.grossMargin ?? existing.grossMargin ?? null,
      operatingMargin: row.operatingMargin ?? existing.operatingMargin ?? null,
      profitMargin: row.profitMargin ?? existing.profitMargin ?? null,
      source: row.source || existing.source
    });
  });

  const marginHistory = removeDuplicateInterimAnnualRows([...marginRowsByPeriod.values()]
    .filter((row) =>
      row.grossMargin !== null ||
      row.operatingMargin !== null ||
      row.profitMargin !== null
    )
    .sort((a, b) => {
      const yearDiff = a.year - b.year;
      if (yearDiff !== 0) return yearDiff;
      if (a.isInterim !== b.isInterim) return a.isInterim ? 1 : -1;
      return String(a.period || "").localeCompare(String(b.period || ""));
    })
    .slice(-7));
  const nextData = withGuaranteedAnalystSection({
    ...previousData,
    interimHistoryCheckedAt: new Date().toISOString(),
    hasInterimHistory: revenueData.some((row) => row.isInterim),
    latestInterimPeriod: revenueData.findLast((row) => row.isInterim)?.period || null,
    revenueHistory,
    revenueData,
    marginHistory: marginHistory.length ? marginHistory : previousData.marginHistory
  });

  await Stock.findOneAndUpdate(
    { ticker },
    {
      ticker,
      status: "pending",
      data: nextData,
      updatedAt: new Date()
    },
    { upsert: true }
  );
}

async function fetchStockData(ticker) {
  const previousStock = await Stock.findOne({ ticker }).lean().catch(() => null);
  const previousData = previousStock?.data || null;
  const quotePromise = getPrimaryQuote(ticker);
  const profilePromise = getFinnhub(`https://finnhub.io/api/v1/stock/profile2?symbol=${ticker}`).catch((err) => {
    console.log("Profile skipped:", ticker, err.message);
    return {};
  });
  const metricDataPromise = getFinnhub(`https://finnhub.io/api/v1/stock/metric?symbol=${ticker}&metric=all`).catch((err) => {
    console.log("Finnhub metrics skipped:", ticker, err.message);
    return {};
  });
  const financialsPromise = getFinnhub(`https://finnhub.io/api/v1/stock/financials-reported?symbol=${ticker}&freq=annual`).catch((err) => {
    console.log("Financials skipped:", ticker, err.message);
    return {};
  });
  const priceTargetPromise = getFinnhub(`https://finnhub.io/api/v1/stock/price-target?symbol=${ticker}`).catch((err) => {
    console.log("Price target skipped:", ticker, err.message);
    return {};
  });
  const secAnnualMarginsPromise = resolveWithin(fetchSecAnnualMargins(ticker), 14000, {});

  const quote = await quotePromise;
  const [profile, metricData, financials, priceTarget] = await Promise.all([
    profilePromise,
    metricDataPromise,
    financialsPromise,
    priceTargetPromise
  ]);

  const metrics = metricData?.metric || {};
  const sharesOutstanding = profile.shareOutstanding || null;
  const earlySecAnnualMargins = await secAnnualMarginsPromise;
  await publishChartHistorySnapshot(
    ticker,
    previousData || {},
    earlySecAnnualMargins,
    sharesOutstanding
  ).catch((err) => {
    console.log("Early chart history snapshot skipped:", ticker, err.message);
  });

  let finnhubReportedData = [];
  let finnhubMetricData = [];

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

  let fmpCashFlow = [];
  let fmpPriceTarget = {};
  let fmpAnalystEstimates = [];
  let fmpRating = {};
  const [
    yahooFinancialData,
    fmpIncomeStatementData,
    yahooSupplementalData,
    yahooYearEndPrices,
    nasdaqData,
    stockAnalysisForecast,
    secAnnualMargins,
    fmpCashFlowData,
    fmpPriceTargetData,
    fmpAnalystEstimateData,
    fmpRatingData,
    recommendation,
    epsEstimate,
    revenueEstimate
  ] = await Promise.all([
    resolveWithin(fetchYahooFinancialHistory(ticker), 8000, []),
    resolveWithin(fetchFmpIncomeStatementHistory(ticker), 8000, []),
    resolveWithin(getYahooSupplementalData(ticker), 6500, {}),
    resolveWithin(fetchYahooYearEndPrices(ticker), 6500, []),
    resolveWithin(fetchNasdaqData(ticker), 6500, {}),
    resolveWithin(fetchStockAnalysisForecast(ticker), 6500, {}),
    earlySecAnnualMargins,
    resolveWithin(getFmpData(ticker, "cash flow", [
      "/stable/cash-flow-statement?symbol={ticker}&period=annual&limit=6",
      "/api/v3/cash-flow-statement/{ticker}?period=annual&limit=6"
    ]), 6500, null),
    resolveWithin(getFmpData(ticker, "price target", [
      "/stable/price-target-consensus?symbol={ticker}",
      "/api/v4/price-target-consensus?symbol={ticker}"
    ]), 6500, null),
    resolveWithin(getFmpData(ticker, "analyst estimates", [
      "/stable/analyst-estimates?symbol={ticker}&period=annual&limit=3",
      "/api/v3/analyst-estimates/{ticker}?period=annual&limit=3"
    ]), 6500, null),
    resolveWithin(getFmpData(ticker, "rating", [
      "/stable/ratings-snapshot?symbol={ticker}",
      "/api/v3/rating/{ticker}"
    ]), 6500, null),
    resolveWithin(getFinnhub(`https://finnhub.io/api/v1/stock/recommendation?symbol=${ticker}`).catch((err) => {
      console.log("Recommendation skipped:", ticker, err.message);
      return [];
    }), 6500, []),
    resolveWithin(getFinnhub(`https://finnhub.io/api/v1/stock/eps-estimate?symbol=${ticker}&freq=annual`).catch((err) => {
      console.log("EPS estimate skipped:", ticker, err.message);
      return {};
    }), 6500, {}),
    resolveWithin(getFinnhub(`https://finnhub.io/api/v1/stock/revenue-estimate?symbol=${ticker}&freq=annual`).catch((err) => {
      console.log("Revenue estimate skipped:", ticker, err.message);
      return {};
    }), 6500, {})
  ]);
  fmpCashFlow = Array.isArray(fmpCashFlowData)
    ? fmpCashFlowData
    : fmpCashFlowData
      ? [fmpCashFlowData]
      : [];
  fmpPriceTarget = Array.isArray(fmpPriceTargetData)
    ? fmpPriceTargetData[0] || {}
    : fmpPriceTargetData || {};
  fmpAnalystEstimates = Array.isArray(fmpAnalystEstimateData)
    ? fmpAnalystEstimateData
    : fmpAnalystEstimateData
      ? [fmpAnalystEstimateData]
      : [];
  fmpRating = Array.isArray(fmpRatingData)
    ? fmpRatingData[0] || {}
    : fmpRatingData || {};
  const fmpCashFlowHistory = fmpCashFlow
    .map((row) => ({
      year: Number(row.calendarYear || String(row.date || "").slice(0, 4)),
      operatingCashflow: toBillions(
        row.operatingCashFlow ??
        row.operatingCashflow ??
        row.netCashProvidedByOperatingActivities
      ),
      freeCashflow: toBillions(row.freeCashFlow ?? row.freeCashflow),
      source: "FMP cash flow statement"
    }))
    .filter((row) => row.year)
    .sort((a, b) => a.year - b.year);

  const authoritativeAnnualData = mergeHistoricalFinancials(
    mergeHistoricalFinancials(
      secAnnualMargins.history || [],
      getRecentEarningsReleaseAnnualRows(ticker)
    ),
    yahooFinancialData
  );
  const revenueData = removeDuplicateInterimAnnualRows(finalizeFinancialHistory(
    mergeHistoricalFinancials(
      authoritativeAnnualData,
      mergeHistoricalFinancials(
        fmpCashFlowHistory,
        mergeHistoricalFinancials(
          fmpIncomeStatementData,
          mergeHistoricalFinancials(finnhubReportedData, finnhubMetricData)
        )
      )
    ),
    sharesOutstanding
  ));
  const revenueHistory = removeDuplicateInterimAnnualRows(finalizeRevenueHistory(
    mergeHistoricalFinancials(
      authoritativeAnnualData,
      mergeHistoricalFinancials(fmpIncomeStatementData, finnhubReportedData)
    )
  ));
  const annualRows = [...revenueData]
    .filter((row) => row.year && !row.isInterim)
    .sort((a, b) => a.year - b.year);
  const latestAnnual = annualRows[annualRows.length - 1] || {};
  const previousAnnual = annualRows[annualRows.length - 2] || {};
  const chartRevenueGrowth = historicalGrowth(revenueData, "revenue");
  const chartEarningsGrowth = historicalGrowth(revenueData, "earnings");

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

  const fallbackMarginHistory = revenueData.map((row) => ({
    year: row.year,
    period: row.period || String(row.year),
    isInterim: Boolean(row.isInterim),
    grossMargin: annualMargin(row.grossProfit, row.revenue),
    operatingMargin: annualMargin(row.operatingIncome, row.revenue),
    profitMargin: annualMargin(row.earnings, row.revenue),
    source: row.source
  }));
  const marginRowsByPeriod = new Map();
  [...fallbackMarginHistory, ...(secAnnualMargins.marginHistory || [])].forEach((row) => {
    if (!row?.year) return;
    const period = row.period || String(row.year);
    const rowKey = row.isInterim ? `${row.year}:${period}` : `${row.year}:annual`;
    const existing = marginRowsByPeriod.get(rowKey) || {};
    marginRowsByPeriod.set(rowKey, {
      year: row.year,
      period,
      isInterim: row.isInterim ?? existing.isInterim ?? false,
      grossMargin: row.grossMargin ?? existing.grossMargin ?? null,
      operatingMargin: row.operatingMargin ?? existing.operatingMargin ?? null,
      profitMargin: row.profitMargin ?? existing.profitMargin ?? null,
      source: row.source || existing.source
    });
  });
  let marginHistory = removeDuplicateInterimAnnualRows([...marginRowsByPeriod.values()]
    .filter((row) =>
      row.grossMargin !== null ||
      row.operatingMargin !== null ||
      row.profitMargin !== null
    )
    .sort((a, b) => {
      const yearDiff = a.year - b.year;
      if (yearDiff !== 0) return yearDiff;
      if (a.isInterim !== b.isInterim) return a.isInterim ? 1 : -1;
      return String(a.period || "").localeCompare(String(b.period || ""));
    })
    .slice(-7));
  const knownFinancialInstitution = KNOWN_FINANCIAL_INSTITUTIONS.has(ticker);
  const latestRawMarginRow =
    marginHistory.filter((row) => Number(row.year) <= 2025).at(-1) ||
    marginHistory.at(-1) ||
    {};
  const needsFinancialMarginFallback =
    knownFinancialInstitution &&
    secAnnualMargins.isFinancialCompany !== true &&
    (toNumberOrNull(latestRawMarginRow.grossMargin) === null ||
      toNumberOrNull(latestRawMarginRow.grossMargin) === 0 ||
      toNumberOrNull(latestRawMarginRow.operatingMargin) === null ||
      toNumberOrNull(latestRawMarginRow.operatingMargin) === 0);
  if (needsFinancialMarginFallback) {
    const fallbackGrossMargin = firstNumber(
      yahooSupplementalData.grossMargins,
      metrics.grossMarginTTM,
      metrics.netProfitMarginTTM
    );
    const fallbackOperatingMargin = firstNumber(
      yahooSupplementalData.operatingMargins,
      metrics.operatingMarginTTM,
      metrics.netProfitMarginTTM
    );
    marginHistory = marginHistory.map((row) =>
      row.year === latestRawMarginRow.year
        ? {
            ...row,
            grossMargin: firstNumber(row.grossMargin, fallbackGrossMargin),
            operatingMargin: firstNumber(row.operatingMargin, fallbackOperatingMargin),
            source: "Market data fallback (banking presentation)"
          }
        : row
    );
  }
  const latestVisibleMarginRow =
    marginHistory.filter((row) => Number(row.year) <= 2025).at(-1) ||
    marginHistory.at(-1) ||
    {};
  const yearEndPrices = new Map(
    (yahooYearEndPrices.length
      ? yahooYearEndPrices
      : yahooSupplementalData.yearEndPrices || []
    ).map((row) => [Number(row.year), row.close])
  );
  let historicalPe = revenueData
    .filter((row) => !row.isInterim)
    .map((row) => {
      const price = toNumberOrNull(yearEndPrices.get(Number(row.year)));
      const annualEps = toNumberOrNull(row.eps);
      return {
        year: row.year,
        period: row.period || String(row.year),
        isInterim: Boolean(row.isInterim),
        pe: price !== null && annualEps !== null && annualEps !== 0
          ? price / annualEps
          : null,
        price,
        eps: annualEps
      };
    })
    .filter((row) => row.pe !== null && Math.abs(row.pe) < 1000)
    .slice(-6);

  if (!quote || !quote.c || quote.c === 0) {
    throw new Error("No price returned");
  }

  const epsEstimates = epsEstimate?.data || [];
  const revenueEstimates = revenueEstimate?.data || [];
  const fmpCurrentEstimate = fmpAnalystEstimates[0] || {};
  const fmpNextEstimate = fmpAnalystEstimates[1] || {};
  const fmpFollowingEstimate = fmpAnalystEstimates[2] || {};
  const isFinancialCompany =
    secAnnualMargins.isFinancialCompany === true ||
    (knownFinancialInstitution && needsFinancialMarginFallback);
  const revenueGrowthRate = chartRevenueGrowth !== null
    ? chartRevenueGrowth / 100
    : isFinancialCompany
    ? safeGrowthRate(
        chartRevenueGrowth,
        secAnnualMargins.revenueGrowth,
        annualGrowth(latestAnnual.revenue, previousAnnual.revenue),
        yahooSupplementalData.revenueGrowth,
        metrics.revenueGrowthTTMYoy
      )
    : safeGrowthRate(
        chartRevenueGrowth,
        metrics.revenueGrowthTTMYoy,
        yahooSupplementalData.revenueGrowth,
        annualGrowth(latestAnnual.revenue, previousAnnual.revenue),
        secAnnualMargins.revenueGrowth
      );
  const earningsGrowthRate = chartEarningsGrowth !== null
    ? chartEarningsGrowth / 100
    : isFinancialCompany
    ? safeGrowthRate(
        chartEarningsGrowth,
        secAnnualMargins.earningsGrowth,
        annualGrowth(latestAnnual.earnings, previousAnnual.earnings),
        yahooSupplementalData.earningsGrowth,
        metrics.epsGrowthTTMYoy,
        revenueGrowthRate
      )
    : safeGrowthRate(
        chartEarningsGrowth,
        metrics.epsGrowthTTMYoy,
        yahooSupplementalData.earningsGrowth,
        annualGrowth(latestAnnual.earnings, previousAnnual.earnings),
        secAnnualMargins.earningsGrowth,
        revenueGrowthRate
      );
  const currentRevenueBase = firstNumber(
    toDollarsFromBillions(latestAnnual.revenue),
    toDollarsFromPerShare(metrics.revenuePerShareTTM, sharesOutstanding),
    toDollarsFromPerShare(metrics.revenuePerShareAnnual, sharesOutstanding)
  );
  const latestInterimRevenueRow = [...revenueData]
    .filter((row) => row?.isInterim && toNumberOrNull(row.revenue) !== null)
    .sort((a, b) => a.year - b.year)
    .at(-1);
  const latestInterimRevenue = toDollarsFromBillions(latestInterimRevenueRow?.revenue);
  const latestInterimQuarter = Number(
    String(latestInterimRevenueRow?.period || "").match(/Q([1-3])/i)?.[1]
  );
  const latestInterimAnnualizedRevenue =
    latestInterimRevenue && latestInterimQuarter
      ? latestInterimRevenue * (4 / latestInterimQuarter)
      : null;
  const interimRevenueFloor = firstNumber(latestInterimRevenue, currentRevenueBase);
  const fastGrowthRevenueRate =
    latestInterimAnnualizedRevenue && currentRevenueBase
      ? clamp(latestInterimAnnualizedRevenue / currentRevenueBase - 1, 0, 0.75)
      : null;
  const currentRevenueEstimateFallback = firstNumber(
    latestInterimAnnualizedRevenue,
    estimateNextValue(currentRevenueBase, revenueGrowthRate),
    currentRevenueBase
  );
  const sanitizeCurrentRevenueEstimate = (candidate) => {
    const estimate = sanitizeNearTermRevenueEstimate(candidate, currentRevenueBase);
    if (estimate === null) return null;
    if (interimRevenueFloor && estimate < interimRevenueFloor * 1.01) return null;
    if (
      latestInterimAnnualizedRevenue &&
      estimate < latestInterimAnnualizedRevenue * 0.85
    ) {
      return null;
    }
    return estimate;
  };
  const sanitizeNextRevenueEstimate = (candidate, baselineRevenue) => {
    const estimate = sanitizeNearTermRevenueEstimate(candidate, baselineRevenue);
    if (estimate === null) return null;
    if (baselineRevenue && estimate < baselineRevenue * 1.03) return null;
    return estimate;
  };
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
    yahooSupplementalData.analystRatingText,
    yahooSupplementalData.recommendationKey,
    stockAnalysisForecast.analystRatingText,
    stockAnalysisForecast.ratingConsensus,
    recommendation,
    yahooSupplementalData.recommendationTrend,
    fmpRating.ratingRecommendation,
    fmpRating.rating,
    fmpRating.recommendation
  );

  const historicalForwardEps = estimateForwardEpsFromHistory(revenueData);
  const yahooCurrentEstimate = yahooSupplementalData.analystEstimates?.currentYear || {};
  const yahooNextEstimate = yahooSupplementalData.analystEstimates?.nextYear || {};
  const currentEps =
    yahooCurrentEstimate.eps ??
    fmpEstimateField(fmpCurrentEstimate, "epsAvg", "estimatedEpsAvg") ??
    epsEstimates[0]?.epsAvg ??
    metrics.epsEstimateCurrentYear ??
    stockAnalysisForecast.currentYearEps ??
    nasdaqData.currentYearEps ??
    estimateNextValue(currentEpsBase, conservativeProjectionRate(earningsGrowthRate, 0.15)) ??
    currentEpsBase ??
    null;

  const projectedNextEps = estimateNextValue(
    currentEps,
    conservativeProjectionRate(earningsGrowthRate, 0.22)
  );
  const trustedNextEpsCandidate = firstNumber(
    yahooNextEstimate.eps,
    stockAnalysisForecast.nextYearEps,
    fmpEstimateField(fmpNextEstimate, "epsAvg", "estimatedEpsAvg"),
    epsEstimates[1]?.epsAvg,
    metrics.epsEstimateNextYear
  );
  const nextEpsCandidate =
    trustedNextEpsCandidate ??
    yahooSupplementalData.forwardEps ??
    nasdaqData.nextYearEps ??
    projectedNextEps ??
    historicalForwardEps ??
    epsFromForwardPE(quote.c, metrics.forwardPE ?? yahooSupplementalData.forwardPE) ??
    null;
  const nextEps = trustedNextEpsCandidate !== null
    ? trustedNextEpsCandidate
    : sanitizeForwardEps(nextEpsCandidate, historicalForwardEps);

  const yahooCurrentRevenueRaw = normalizeStatementDollars(yahooCurrentEstimate.revenue);
  const yahooNextRevenueRaw = normalizeStatementDollars(yahooNextEstimate.revenue);
  const yahooCurrentEpsRaw = toNumberOrNull(yahooCurrentEstimate.eps);
  const yahooNextEpsRaw = toNumberOrNull(yahooNextEstimate.eps);
  const stockAnalysisRevenueEstimate = sanitizeCurrentRevenueEstimate(
    stockAnalysisForecast.currentYearRevenue
  );
  const fmpCurrentRevenueEstimate = sanitizeCurrentRevenueEstimate(
    fmpEstimateField(fmpCurrentEstimate, "revenueAvg", "estimatedRevenueAvg")
  );
  const yahooCurrentRevenueEstimate = yahooCurrentRevenueRaw;
  const finnhubCurrentRevenueEstimate = sanitizeCurrentRevenueEstimate(
    normalizeFinnhubMoney(revenueEstimates[0]?.revenueAvg)
  );
  const currentRevenue =
    yahooCurrentRevenueEstimate ??
    stockAnalysisRevenueEstimate ??
    fmpCurrentRevenueEstimate ??
    finnhubCurrentRevenueEstimate ??
    currentRevenueEstimateFallback;

  const stockAnalysisNextRevenueEstimate = sanitizeNextRevenueEstimate(
    stockAnalysisForecast.nextYearRevenue,
    currentRevenue
  );
  const yahooNextRevenueEstimate = yahooNextRevenueRaw;
  const fmpNextRevenueEstimate = sanitizeNextRevenueEstimate(
    fmpEstimateField(fmpNextEstimate, "revenueAvg", "estimatedRevenueAvg"),
    currentRevenue
  );
  const finnhubNextRevenueEstimate = sanitizeNextRevenueEstimate(
    normalizeFinnhubMoney(revenueEstimates[1]?.revenueAvg),
    currentRevenue
  );
  const nextRevenue =
    yahooNextRevenueEstimate ??
    stockAnalysisNextRevenueEstimate ??
    fmpNextRevenueEstimate ??
    finnhubNextRevenueEstimate ??
    estimateNextValue(currentRevenue, firstNumber(fastGrowthRevenueRate, revenueGrowthRate));

  const fmpFollowingRevenueEstimate = sanitizeRevenueEstimate(
    fmpEstimateField(fmpFollowingEstimate, "revenueAvg", "estimatedRevenueAvg"),
    nextRevenue
  );
  const followingRevenue =
    fmpFollowingRevenueEstimate ??
    estimateDecayedForwardValue(nextRevenue, currentRevenueBase);

  const currentEarnings =
    firstNumber(
      currentEps && sharesOutstanding
        ? currentEps * sharesOutstanding * 1000000
        : null,
      fmpEstimateField(
        fmpCurrentEstimate,
        "netIncomeAvg",
        "estimatedNetIncomeAvg"
      ),
      currentEarningsBase,
      estimateNextValue(currentEarningsBase, earningsGrowthRate)
    );

  const nextEarnings =
    firstNumber(
      nextEps && sharesOutstanding
        ? nextEps * sharesOutstanding * 1000000
        : null,
      fmpEstimateField(
        fmpNextEstimate,
        "netIncomeAvg",
        "estimatedNetIncomeAvg"
      ),
      estimateNextValue(currentEarnings, earningsGrowthRate)
    );

  const latestHistoricalEps = [...revenueData]
    .filter((row) => row?.year && toNumberOrNull(row?.eps) !== null)
    .sort((a, b) => a.year - b.year)
    .at(-1)?.eps;
  const latestForecastBaselineEps = firstNumber(
    latestHistoricalEps,
    latestAnnual.eps,
    currentEps
  );
  const providerFollowingEps = firstNumber(
    fmpEstimateField(fmpFollowingEstimate, "epsAvg", "estimatedEpsAvg"),
    epsEstimates[2]?.epsAvg
  );
  const stockAnalysisFollowingEps = null;
  const followingRevenueGrowthRate = nextRevenue && followingRevenue
    ? followingRevenue / nextRevenue - 1
    : null;
  const revenueGuidedFollowingEps = followingRevenueGrowthRate !== null
    ? estimateNextValue(
        nextEps,
        clamp(followingRevenueGrowthRate * 1.03, -0.2, 0.55)
      )
    : null;
  const providerFollowingEpsGrowth = providerFollowingEps && nextEps
    ? providerFollowingEps / nextEps - 1
    : null;
  const useRevenueGuidedFollowingEps =
    nextEps > 0 &&
    revenueGuidedFollowingEps !== null &&
    (providerFollowingEps === null ||
      (followingRevenueGrowthRate !== null &&
        providerFollowingEpsGrowth !== null &&
        followingRevenueGrowthRate - providerFollowingEpsGrowth > 0.08 &&
        revenueGuidedFollowingEps / providerFollowingEps <= 1.25));
  const followingEpsCandidate =
    (useRevenueGuidedFollowingEps ? revenueGuidedFollowingEps : providerFollowingEps) ??
    revenueGuidedFollowingEps ??
    estimateDecayedForwardValue(nextEps, latestForecastBaselineEps, 0.55, 0.515) ??
    estimateNextValue(nextEps, conservativeProjectionRate(earningsGrowthRate, 0.15)) ??
    null;
  const followingEps =
    stockAnalysisFollowingEps ??
    sanitizeForwardEps(followingEpsCandidate, nextEps);
  const followingEarnings =
    firstNumber(
      followingEps && sharesOutstanding
        ? followingEps * sharesOutstanding * 1000000
        : null
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
  const trailingEpsValue = firstNumber(
    secAnnualMargins.trailingEps,
    yahooSupplementalData.trailingEps,
    metrics.epsTTM,
    metrics.epsInclExtraItemsTTM
  );
  const forwardEpsValue = firstNumber(
    stockAnalysisForecast.forwardPE > 0
      ? quote.c / stockAnalysisForecast.forwardPE
      : null,
    metrics.forwardPE > 0 ? quote.c / metrics.forwardPE : null,
    yahooSupplementalData.forwardEps,
    nasdaqData.currentYearEps,
    metrics.epsEstimateCurrentYear,
    nasdaqData.nextYearEps,
    metrics.epsEstimateNextYear
  );
  const reportedPE = firstNumber(
    trailingEpsValue > 0 ? quote.c / trailingEpsValue : null,
    metrics.peTTM,
    stockAnalysisForecast.pe,
    yahooSupplementalData.pe,
    metrics.peNormalizedAnnual
  );
  if (reportedPE !== null && Number.isFinite(reportedPE) && Math.abs(reportedPE) < 1000) {
    historicalPe = [
      ...historicalPe,
      {
        year: new Date().getFullYear(),
        period: "Current",
        isCurrent: true,
        pe: reportedPE,
        price: quote.c,
        eps: trailingEpsValue
      }
    ].slice(-7);
  }
  const reportedForwardPE = firstNumber(
    stockAnalysisForecast.forwardPE,
    metrics.forwardPE,
    yahooSupplementalData.forwardPE,
    forwardEpsValue > 0 ? quote.c / forwardEpsValue : null
  );
  const revenueGrowth = firstFiniteNumber(
    chartRevenueGrowth,
    secAnnualMargins.revenueGrowth,
    annualGrowth(latestAnnual.revenue, previousAnnual.revenue),
    yahooSupplementalData.revenueGrowth,
    metrics.revenueGrowthTTMYoy
  );
  const earningsGrowth = firstFiniteNumber(
    chartEarningsGrowth,
    secAnnualMargins.earningsGrowth,
    annualGrowth(latestAnnual.earnings, previousAnnual.earnings),
    yahooSupplementalData.earningsGrowth,
    metrics.epsGrowthTTMYoy
  );
  const grossMargins = isFinancialCompany
    ? firstNumber(
        latestVisibleMarginRow.grossMargin,
        secAnnualMargins.grossMargins,
        yahooSupplementalData.grossMargins
      )
    : firstNumber(
        latestVisibleMarginRow.grossMargin,
        secAnnualMargins.grossMargins,
        metrics.grossMarginTTM,
        yahooSupplementalData.grossMargins,
        annualMargin(latestAnnual.grossProfit, latestAnnual.revenue)
      );
  const operatingMargins = isFinancialCompany
    ? firstNumber(
        latestVisibleMarginRow.operatingMargin,
        secAnnualMargins.operatingMargins,
        yahooSupplementalData.operatingMargins
      )
    : firstNumber(
        latestVisibleMarginRow.operatingMargin,
        secAnnualMargins.operatingMargins,
        metrics.operatingMarginTTM,
        yahooSupplementalData.operatingMargins,
        annualMargin(latestAnnual.operatingIncome, latestAnnual.revenue)
      );
  const profitMargins = firstNumber(
    latestVisibleMarginRow.profitMargin,
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
  const followingRevenueValue = normalizeStatementDollars(followingRevenue);
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
  const provisionalFollowingEarningsValue = estimateEarningsFallback(
    followingEarnings,
    followingRevenueValue,
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
  const followingEpsValue = estimateEpsFallback(
    followingEps,
    provisionalFollowingEarningsValue,
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
  const followingEarningsValue = reconcileEarningsEstimate({
    earnings: provisionalFollowingEarningsValue,
    eps: followingEpsValue,
    shares: modeledSharesOutstanding,
    revenue: followingRevenueValue,
    profitMargin: profitMargins
  });
  const displayedFollowingEpsValue =
    stockAnalysisFollowingEps ??
    sanitizeForwardEps(
      (useRevenueGuidedFollowingEps ? revenueGuidedFollowingEps : providerFollowingEps) ??
        revenueGuidedFollowingEps ??
        estimateDecayedForwardValue(nextEpsValue, latestForecastBaselineEps, 0.55, 0.515) ??
        followingEpsValue ??
        (followingEarningsValue && sharesOutstandingValue
          ? followingEarningsValue / (sharesOutstandingValue * 1000000)
          : null),
      nextEpsValue
    );
  const yahooCurrentEarningsValue =
    yahooCurrentEpsRaw !== null && modeledSharesOutstanding
      ? yahooCurrentEpsRaw * modeledSharesOutstanding * 1000000
      : null;
  const yahooNextEarningsValue =
    yahooNextEpsRaw !== null && modeledSharesOutstanding
      ? yahooNextEpsRaw * modeledSharesOutstanding * 1000000
      : null;
  const pe = firstNumber(
    reportedPE,
    currentEpsValue ? quote.c / currentEpsValue : null
  );
  const forwardPE = firstNumber(
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
  const bookValuePerShare = firstNumber(
    metrics.bookValuePerShareAnnual,
    metrics.bookValuePerShareQuarterly,
    yahooSupplementalData.bookValuePerShare
  );
  const priceToBook = firstNumber(
    reconcilePriceToBook(yahooSupplementalData.priceToBook, quote.c, bookValuePerShare),
    metrics.pbAnnual,
    metrics.pbQuarterly,
    metrics.ptbvAnnual,
    metrics.ptbvQuarterly,
    metrics.priceToBookAnnual,
    metrics.priceToBookQuarterly
  );
  const operatingCashflow = isFinancialCompany
    ? null
    : firstNumber(
        secAnnualMargins.history?.at(-1)?.operatingCashflow !== null &&
          secAnnualMargins.history?.at(-1)?.operatingCashflow !== undefined
          ? toDollarsFromBillions(secAnnualMargins.history.at(-1).operatingCashflow)
          : null,
        fmpCashFlow[0]?.operatingCashFlow,
        fmpCashFlow[0]?.operatingCashflow,
        fmpCashFlow[0]?.netCashProvidedByOperatingActivities,
        toDollarsFromPerShare(metrics.cashFlowPerShareTTM, sharesOutstanding),
        toDollarsFromPerShare(metrics.cashFlowPerShareAnnual, sharesOutstanding),
        toDollarsFromBillions(latestAnnual.operatingCashflow)
      );
  const freeCashflow = isFinancialCompany
    ? null
    : estimateFreeCashFlowFallback({
        freeCashflow: firstNumber(
          secAnnualMargins.freeCashflow,
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
      yahooSupplementalData.targetMean,
      yahooSupplementalData.targetMedian,
      stockAnalysisForecast.targetMean,
      stockAnalysisForecast.targetMedian,
      nasdaqData.targetMean,
      priceTarget?.targetMean,
      priceTarget?.targetMedian,
      metrics.ptMean,
      fmpPriceTarget?.targetConsensus,
      fmpPriceTarget?.targetMean,
      fmpPriceTarget?.targetMedian,
      fmpPriceTarget?.targetAverage,
      fmpPriceTarget?.priceTarget,
      fmpPriceTarget?.targetPrice
    ),
    price: quote.c,
    revenueGrowth,
    earningsGrowth,
    forwardPE,
    pe
  });
  const recommendationKey = estimateRatingFallback(rating, targetMean, quote.c);
  const analystRatingText = firstText(
    yahooSupplementalData.analystRatingText,
    stockAnalysisForecast.analystRatingText,
    stockAnalysisForecast.ratingConsensus,
    rating,
    recommendationKey
  );
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

  const displayedBankMetrics = isFinancialCompany
    ? {
        ...(secAnnualMargins.bankMetrics || {}),
        netInterestRevenueMix: firstNumber(
          latestVisibleMarginRow.grossMargin,
          secAnnualMargins.bankMetrics?.netInterestRevenueMix
        ),
        preTaxMargin: firstNumber(
          latestVisibleMarginRow.operatingMargin,
          secAnnualMargins.bankMetrics?.preTaxMargin
        )
      }
    : null;

  const hasYahooEstimateValues =
    yahooCurrentRevenueRaw !== null ||
    yahooCurrentEpsRaw !== null ||
    yahooNextRevenueRaw !== null ||
    yahooNextEpsRaw !== null;
  const previousYahooEstimates =
    previousData?.analystEstimatesSource === "Yahoo Finance"
      ? previousData.analystEstimates
      : null;
  const preservePreviousYahooEstimates =
    !hasYahooEstimateValues &&
    (
      toNumberOrNull(previousYahooEstimates?.currentYear?.revenue) !== null ||
      toNumberOrNull(previousYahooEstimates?.currentYear?.eps) !== null ||
      toNumberOrNull(previousYahooEstimates?.nextYear?.revenue) !== null ||
      toNumberOrNull(previousYahooEstimates?.nextYear?.eps) !== null
    );
  const displayedCurrentRevenueValue = preservePreviousYahooEstimates
    ? previousYahooEstimates.currentYear?.revenue ?? null
    : yahooCurrentRevenueRaw ?? currentRevenueValue;
  const displayedCurrentEpsValue = firstNumber(
    preservePreviousYahooEstimates ? previousYahooEstimates.currentYear?.eps : null,
    yahooCurrentEpsRaw,
    currentEpsValue
  );
  const displayedCurrentEarningsValue =
    preservePreviousYahooEstimates && previousYahooEstimates.currentYear?.earnings !== undefined
      ? previousYahooEstimates.currentYear.earnings
      : displayedCurrentEpsValue !== null && modeledSharesOutstanding
      ? displayedCurrentEpsValue * modeledSharesOutstanding * 1000000
      : yahooCurrentEarningsValue ?? currentEarningsValue;
  const displayedNextRevenueValue = preservePreviousYahooEstimates
    ? previousYahooEstimates.nextYear?.revenue ?? null
    : yahooNextRevenueRaw ?? nextRevenueValue;
  const projectedDisplayedNextEpsValue = estimateNextValue(
    displayedCurrentEpsValue,
    conservativeProjectionRate(earningsGrowthRate, 0.15)
  );
  const displayedNextEpsFallback =
    nextEpsValue !== null &&
    (
      yahooNextEpsRaw !== null ||
      displayedCurrentEpsValue === null ||
      nextEpsValue >= displayedCurrentEpsValue * 0.55
    )
      ? nextEpsValue
      : null;
  const displayedNextEpsValue = firstNumber(
    preservePreviousYahooEstimates ? previousYahooEstimates.nextYear?.eps : null,
    yahooNextEpsRaw,
    stockAnalysisForecast.nextYearEps,
    displayedNextEpsFallback,
    projectedDisplayedNextEpsValue,
    displayedFollowingEpsValue,
    followingEpsValue,
  );
  const displayedNextEarningsValue =
    preservePreviousYahooEstimates && previousYahooEstimates.nextYear?.earnings !== undefined
      ? previousYahooEstimates.nextYear.earnings
      : displayedNextEpsValue !== null && modeledSharesOutstanding
      ? displayedNextEpsValue * modeledSharesOutstanding * 1000000
      : yahooNextEarningsValue ?? nextEarningsValue;

  const data = preserveBankMargins(withGuaranteedAnalystSection({
    isFinancialCompany,
    bankMetrics: displayedBankMetrics,
    marginHistory,
    historicalPe,
    name: profile.name || ticker,
    symbol: ticker,
    logo: profile.logo || getFinnhubLogoUrl(ticker),
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
    priceToBook,
    bookValuePerShare,
    sharesOutstanding: sharesOutstandingValue,
    pe,
    forwardPE,
    trailingEps: trailingEpsValue,
    forwardEps: forwardEpsValue,
    operatingCashflow,
    consensusCurrentYearEps:
      stockAnalysisForecast.currentYearEps ?? nasdaqData.currentYearEps,
    consensusNextYearEps: displayedNextEpsValue,
    consensusCurrentYearRevenue: stockAnalysisRevenueEstimate,
    analystEstimateSource: stockAnalysisForecast.currentYearEps && stockAnalysisRevenueEstimate
      ? "S&P Global consensus via StockAnalysis"
      : stockAnalysisForecast.currentYearEps
        ? "EPS consensus; revenue modeled fallback"
      : nasdaqData.currentYearEps
        ? "Nasdaq consensus"
        : "Modeled fallback",
    marginSource: isFinancialCompany
      ? secAnnualMargins.isFinancialCompany === true
        ? `SEC annual filing ${secAnnualMargins.fiscalYear} (banking presentation)`
        : "Market data fallback (banking presentation)"
      : secAnnualMargins.operatingMargins !== null &&
          secAnnualMargins.operatingMargins !== undefined
        ? `SEC annual filing ${secAnnualMargins.fiscalYear}`
        : "Market data fallback",
    freeCashflowSource: isFinancialCompany
      ? "Not meaningful for banking businesses"
      : secAnnualMargins.freeCashflow !== null &&
          secAnnualMargins.freeCashflow !== undefined
        ? `SEC annual filing ${secAnnualMargins.fiscalYear}`
        : "Market data fallback",
    growthSource: chartRevenueGrowth !== null || chartEarningsGrowth !== null
      ? "2025 vs 2024 chart values"
      : isFinancialCompany
        ? `SEC annual filings ${secAnnualMargins.fiscalYear}`
        : "Annual financial statements",
    revenueGrowth,
    earningsGrowth,
    grossMargins,
    operatingMargins,
    profitMargins,
    freeCashflow,
    targetMean,
    recommendationKey,
    analystRatingText,
    analystEstimatesSource: hasYahooEstimateValues || preservePreviousYahooEstimates
      ? "Yahoo Finance"
      : "Fallback estimate",
    analystEstimates: {
      currentYear: {
        revenue: displayedCurrentRevenueValue,
        earnings: displayedCurrentEarningsValue,
        eps: displayedCurrentEpsValue
      },
      nextYear: {
        revenue: displayedNextRevenueValue,
        earnings: displayedNextEarningsValue,
        eps: displayedNextEpsValue
      },
      followingYear: {
        revenue: followingRevenueValue,
        earnings: followingEarningsValue,
        eps: displayedFollowingEpsValue
      }
    },
    financialHistoryVersion: FINANCIAL_HISTORY_VERSION,
    interimHistoryCheckedAt: new Date().toISOString(),
    hasInterimHistory: revenueData.some((row) => row.isInterim),
    latestInterimPeriod: revenueData.findLast((row) => row.isInterim)?.period || null,
    revenueHistory,
    revenueData
  }), previousData);

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
app.get("/api/prices", async (req, res) => {
  const symbols = [...new Set(String(req.query.symbols || "")
    .split(",")
    .map((symbol) => symbol.trim().toUpperCase())
    .filter((symbol) => /^[A-Z0-9.-]{1,10}$/.test(symbol)))]
    .slice(0, 30);

  if (!symbols.length) return res.json({ prices: {}, details: {} });

  const prices = {};
  const details = {};
  const savedStocks = await Stock.find({ ticker: { $in: symbols } })
    .select("ticker data.price data.change data.percentChange data.previousClose data.logo data.name")
    .lean();
  const savedBySymbol = new Map(savedStocks.map((stock) => [stock.ticker, stock.data || {}]));

  await Promise.all(symbols.map(async (symbol) => {
    const savedData = savedBySymbol.get(symbol) || {};
    const savedPrice = toNumberOrNull(savedData.price);
    const savedPreviousClose = toNumberOrNull(savedData.previousClose);
    const savedPercentChange = toNumberOrNull(savedData.percentChange);
    details[symbol] = {
      name: savedData.name || symbol,
      logo: savedData.logo || getFinnhubLogoUrl(symbol),
      change: toNumberOrNull(savedData.change),
      percentChange: savedPercentChange !== null
        ? savedPercentChange
        : savedPrice !== null && savedPreviousClose > 0
          ? ((savedPrice - savedPreviousClose) / savedPreviousClose) * 100
          : null
    };

    const cached = livePriceCache.get(symbol);
    if (cached && Date.now() - cached.fetchedAt < 30 * 1000) {
      prices[symbol] = cached.price;
      details[symbol] = {
        ...details[symbol],
        change: toNumberOrNull(cached.change) ?? details[symbol].change,
        percentChange: toNumberOrNull(cached.percentChange) ?? details[symbol].percentChange
      };
    } else {
      try {
        const quote = await getFinnhub(`https://finnhub.io/api/v1/quote?symbol=${symbol}`);
        const price = toNumberOrNull(quote?.c);
        const previousClose = toNumberOrNull(quote?.pc);
        const change = toNumberOrNull(quote?.d);
        const providerPercentChange = toNumberOrNull(quote?.dp);
        const percentChange = providerPercentChange !== null
          ? providerPercentChange
          : price !== null && previousClose > 0
            ? ((price - previousClose) / previousClose) * 100
            : null;
        if (price !== null && price > 0) {
          prices[symbol] = price;
          livePriceCache.set(symbol, {
            price,
            change,
            percentChange,
            fetchedAt: Date.now()
          });
        }
        details[symbol] = {
          ...details[symbol],
          change: change ?? details[symbol].change,
          percentChange: percentChange ?? details[symbol].percentChange
        };
      } catch (err) {
        console.log("Saved-symbol price skipped:", symbol, err.response?.status || err.message);
      }
    }

    if (!prices[symbol] && savedPrice !== null && savedPrice > 0) prices[symbol] = savedPrice;

  }));

  res.json({ prices, details });
});

app.get("/api/market-indices", async (req, res) => {
  const cached = marketIndexCache.get("latest");
  if (cached && Date.now() - cached.fetchedAt < 5 * 60 * 1000) {
    return res.json(cached.data);
  }

  const buildIndexQuote = (index, symbol, price, change, percentChange, source) => {
    const priceValue = toNumberOrNull(price);
    const changeValue = toNumberOrNull(change);
    const percentValue = toNumberOrNull(percentChange);
    if (priceValue === null) return null;
    return {
      key: index.key,
      label: index.label,
      symbol,
      price: priceValue,
      change: changeValue,
      percentChange: percentValue,
      source
    };
  };

  const parseIndexNumber = (value) => {
    if (value === null || value === undefined) return null;
    const normalized = String(value)
      .replace(/,/g, "")
      .replace(/[()%+]/g, "")
      .trim();
    const number = Number(normalized);
    if (!Number.isFinite(number)) return null;
    return String(value).includes("-") ? -Math.abs(number) : number;
  };

  const fetchInvestingIndex = async (index) => {
    const response = await axios.get(
      `https://www.investing.com/indices/${index.investingPath}`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 AppleWebKit/537.36 Chrome/124 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        },
        timeout: 8000
      }
    );
    const $ = cheerio.load(response.data || "");
    const price = parseIndexNumber($('[data-test="instrument-price-last"]').first().text());
    const change = parseIndexNumber($('[data-test="instrument-price-change"]').first().text());
    const percentChange = parseIndexNumber($('[data-test="instrument-price-change-percent"]').first().text());
    const indexQuote = buildIndexQuote(
      index,
      index.yahooSymbol,
      price,
      change,
      percentChange,
      "Investing.com"
    );
    if (!indexQuote) throw new Error(`Missing ${index.label} Investing.com price`);
    return indexQuote;
  };

  const fetchYahooChartIndex = async (index) => {
    const response = await axios.get(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(index.yahooSymbol)}`,
      {
        params: {
          interval: "1d",
          range: "5d"
        },
        headers: {
          "User-Agent": "Mozilla/5.0 AppleWebKit/537.36 Chrome/124 Safari/537.36",
          Accept: "application/json,text/plain,*/*"
        },
        timeout: 8000
      }
    );
    const result = response.data?.chart?.result?.[0];
    const meta = result?.meta || {};
    const closes = result?.indicators?.quote?.[0]?.close || [];
    const currentPrice = firstFiniteNumber(
      meta.regularMarketPrice,
      [...closes].reverse().find((value) => toNumberOrNull(value) !== null)
    );
    const previousClose = firstFiniteNumber(
      meta.chartPreviousClose,
      closes.length > 1 ? closes[closes.length - 2] : null
    );
    const change = currentPrice !== null && previousClose !== null
      ? currentPrice - previousClose
      : null;
    const percentChange = change !== null && previousClose
      ? (change / previousClose) * 100
      : null;
    const indexQuote = buildIndexQuote(
      index,
      index.yahooSymbol,
      currentPrice,
      change,
      percentChange,
      "Yahoo Chart"
    );
    if (!indexQuote) throw new Error(`Missing ${index.label} chart price`);
    return indexQuote;
  };

  const fetchYahooIndex = async (index) => {
    const quote = await yahooFinance.quote(index.yahooSymbol);
    const indexQuote = buildIndexQuote(
      index,
      index.yahooSymbol,
      firstYahooNumber(quote.regularMarketPrice),
      firstFiniteNumber(quote.regularMarketChange),
      firstFiniteNumber(quote.regularMarketChangePercent),
      "Yahoo"
    );
    if (!indexQuote) throw new Error(`Missing ${index.label} price`);
    return indexQuote;
  };

  const indices = await Promise.all(MARKET_INDICES.map(async (index) => {
    const sources = [
      ["Investing.com", fetchInvestingIndex],
      ["Yahoo chart", fetchYahooChartIndex],
      ["Yahoo quote", fetchYahooIndex]
    ];

    for (const [label, fetchIndex] of sources) {
      try {
        const indexQuote = await fetchIndex(index);
        if (indexQuote) return indexQuote;
      } catch (err) {
        console.log(`Market index ${label} skipped:`, index.label, err.response?.status || err.message);
      }
    }

    return null;
  }));

  const data = {
    indices: indices.filter(Boolean),
    updatedAt: new Date().toISOString()
  };

  if (data.indices.length) {
    marketIndexCache.set("latest", {
      fetchedAt: Date.now(),
      data
    });
  }

  return res.json(data);
});

app.get("/api/price-history/:ticker", async (req, res) => {
  try {
    const requestedTicker = req.params.ticker.trim().toUpperCase();
    const ticker = TICKER_ALIASES[requestedTicker] || requestedTicker;
    const requestedRange = String(req.query.range || "1D").trim().toUpperCase();
    const rangeConfig = PRICE_HISTORY_RANGES[requestedRange] || PRICE_HISTORY_RANGES["1D"];

    if (!/^[A-Z0-9.-]{1,12}$/.test(ticker)) {
      return res.status(400).json({ error: "Invalid ticker" });
    }

    const cacheKey = `${ticker}:${requestedRange}`;
    const cached = priceHistoryCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < rangeConfig.ttl) {
      return res.json(cached.data);
    }

    const params = {
      interval: rangeConfig.interval
    };

    if (requestedRange === "YTD") {
      const now = new Date();
      const startOfYear = Date.UTC(now.getUTCFullYear(), 0, 1, 0, 0, 0);
      params.period1 = Math.floor(startOfYear / 1000);
      params.period2 = Math.floor(Date.now() / 1000);
    } else {
      params.range = rangeConfig.range;
    }

    const response = await axios.get(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}`,
      {
        params,
        timeout: 10000
      }
    );

    const result = response.data?.chart?.result?.[0];
    if (!result) {
      return res.status(404).json({ error: "Price history unavailable" });
    }

    const timestamps = result.timestamp || [];
    const quote = result.indicators?.quote?.[0] || {};
    const adjustedCloses = result.indicators?.adjclose?.[0]?.adjclose || [];
    const meta = result.meta || {};

    const points = timestamps
      .map((timestamp, index) => {
        const price = firstYahooNumber(quote.close?.[index], adjustedCloses[index]);
        if (price === null) return null;
        const date = new Date(timestamp * 1000);
        if (Number.isNaN(date.getTime())) return null;
        return {
          time: timestamp * 1000,
          date: date.toISOString(),
          price,
          volume: firstYahooNumber(quote.volume?.[index])
        };
      })
      .filter(Boolean);

    if (!points.length) {
      return res.status(404).json({ error: "Price history unavailable" });
    }

    const latestPoint = points[points.length - 1];
    const latestPrice = firstYahooNumber(meta.regularMarketPrice, latestPoint.price);
    const rangeStartPrice = points[0]?.price;
    const previousClose = firstYahooNumber(
      meta.chartPreviousClose,
      meta.previousClose,
      requestedRange === "1D" && points.length > 1 ? points[points.length - 2].price : null,
      rangeStartPrice
    );
    const changeBase = requestedRange === "1D" ? previousClose : rangeStartPrice;
    const change = latestPrice !== null && changeBase
      ? latestPrice - changeBase
      : null;
    const percentChange = change !== null && changeBase
      ? (change / changeBase) * 100
      : null;

    const data = {
      symbol: requestedTicker,
      sourceSymbol: ticker,
      range: requestedRange,
      interval: rangeConfig.interval,
      points,
      latest: {
        price: latestPrice,
        change,
        percentChange,
        previousClose
      },
      updatedAt: new Date().toISOString()
    };

    priceHistoryCache.set(cacheKey, {
      fetchedAt: Date.now(),
      data
    });

    return res.json(data);
  } catch (err) {
    console.log("Price history failed:", req.params.ticker, err.response?.status || err.message);
    return res.status(502).json({ error: "Price history unavailable" });
  }
});

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
      const quickData = await getImmediateStockSnapshot(ticker);
      stock = await Stock.findOneAndUpdate(
        { ticker },
        {
          ticker,
          status: "pending",
          data: quickData || {},
          updatedAt: new Date()
        },
        {
          upsert: true,
          new: true
        }
      );

      startStockFetch(ticker);

      return res.json({
        ticker,
        status: "ready",
        refreshing: true,
        ...quickData,
        updatedAt: stock.updatedAt
      });
    }

    if (stock.status === "pending") {
      const updatedAt = stock.updatedAt ? new Date(stock.updatedAt) : null;
      const isStale =
        !updatedAt || Date.now() - updatedAt.getTime() > 2 * 60 * 1000;
      const fetchIsMissing = !activeStockFetches.has(ticker);

      if (isStale || fetchIsMissing) {
        if (isStale) {
          await Stock.findOneAndUpdate(
            { ticker },
            {
              status: "pending",
              error: null,
              updatedAt: new Date()
            }
          );
        }

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

      const quickData = await getImmediateStockSnapshot(ticker, stock.data || {});
      await Stock.findOneAndUpdate(
        { ticker },
        {
          status: "pending",
          data: quickData,
          error: null,
          updatedAt: new Date()
        }
      );

      return res.json({
        ticker: stock.ticker,
        status: "ready",
        refreshing: true,
        ...quickData,
        updatedAt: new Date()
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

      const quickData = await getImmediateStockSnapshot(ticker, stock.data || {});
      await Stock.findOneAndUpdate(
        { ticker },
        {
          status: "pending",
          data: quickData,
          error: null,
          updatedAt: new Date()
        }
      );

      return res.json({
        ticker,
        status: "ready",
        refreshing: true,
        ...quickData,
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
const round = (value, digits = 1) => {
  const number = toNumberOrNull(value);
  return number === null ? null : Number(number.toFixed(digits));
};

const percentChange = (current, previous) => {
  const currentNumber = toNumberOrNull(current);
  const previousNumber = toNumberOrNull(previous);
  if (currentNumber === null || previousNumber === null || previousNumber === 0) return null;
  return ((currentNumber - previousNumber) / Math.abs(previousNumber)) * 100;
};

const analysisMoney = (value) => {
  const number = toNumberOrNull(value);
  if (number === null) return "N/A";
  const absolute = Math.abs(number);
  const sign = number < 0 ? "-" : "";
  if (absolute >= 1e12) return `${sign}$${(absolute / 1e12).toFixed(1)}T`;
  if (absolute >= 1e9) return `${sign}$${(absolute / 1e9).toFixed(1)}B`;
  if (absolute >= 1e6) return `${sign}$${(absolute / 1e6).toFixed(0)}M`;
  return `${sign}$${absolute.toFixed(0)}`;
};

function buildResearchAnalysis(stock) {
  const data = withGuaranteedAnalystSection(stock.data || {});
  const history = [...(data.revenueData || [])]
    .filter((row) => row?.year)
    .sort((a, b) => a.year - b.year);
  const annualHistory = history.filter((row) => !row?.isInterim && !row?.isCurrent);
  const latest = annualHistory.at(-1) || history.at(-1) || {};
  const previous = annualHistory.at(-2) || history.at(-2) || {};
  const price = toNumberOrNull(data.price);
  const target = toNumberOrNull(data.targetMean);
  const marketCap = toNumberOrNull(data.marketCap);
  const freeCashflow = toNumberOrNull(data.freeCashflow);
  const pe = toNumberOrNull(data.pe);
  const forwardPE = toNumberOrNull(data.forwardPE);
  const priceToSales = toNumberOrNull(data.priceToSales);
  const revenueGrowth = firstFiniteNumber(
    percentChange(latest.revenue, previous.revenue),
    data.revenueGrowth
  );
  const incomeGrowth = firstFiniteNumber(
    percentChange(latest.earnings, previous.earnings),
    data.earningsGrowth
  );
  const epsGrowth = percentChange(latest.eps, previous.eps);
  const targetUpside = price && target ? ((target - price) / price) * 100 : null;
  const fcfYield = marketCap && freeCashflow ? (freeCashflow / marketCap) * 100 : null;
  const forecast = data.analystEstimates?.currentYear || {};
  const nextForecast = data.analystEstimates?.nextYear || {};
  const forecastRevenueGrowth = percentChange(forecast.revenue, toDollarsFromBillions(latest.revenue));
  const forecastIncomeGrowth = percentChange(forecast.earnings, toDollarsFromBillions(latest.earnings));
  const forecastEpsGrowth = percentChange(forecast.eps, latest.eps);
  const nextForecastRevenueGrowth = percentChange(nextForecast.revenue, forecast.revenue);
  const nextForecastIncomeGrowth = percentChange(nextForecast.earnings, forecast.earnings);

  let score = 50;
  score += clamp((revenueGrowth || 0) / 3, -12, 15);
  score += clamp((incomeGrowth || 0) / 5, -12, 12);
  score += clamp((data.profitMargins || 0) / 4, -8, 10);
  score += clamp((fcfYield || 0) * 1.5, -8, 12);
  score += clamp((targetUpside || 0) / 3, -10, 12);
  if (pe && forwardPE) score += clamp(((pe - forwardPE) / pe) * 20, -8, 8);
  if (forwardPE && forwardPE > 60) score -= 8;
  if (priceToSales && priceToSales > 15) score -= 6;
  score = Math.round(clamp(score, 10, 90));

  const stance = score >= 68 ? "Bullish" : score <= 42 ? "Cautious" : "Balanced";
  const catalysts = [];
  const risks = [];
  if (revenueGrowth !== null && revenueGrowth > 10) catalysts.push(`Revenue expanded ${round(revenueGrowth)}% in the latest reported year.`);
  if (incomeGrowth !== null && incomeGrowth > revenueGrowth) catalysts.push(`Net income grew faster than revenue at ${round(incomeGrowth)}%, indicating operating leverage.`);
  if (forwardPE && pe && forwardPE < pe * 0.9) catalysts.push(`Forward P/E of ${round(forwardPE)}x is below the current ${round(pe)}x multiple.`);
  if (targetUpside !== null && targetUpside > 8) catalysts.push(`The consensus target implies ${round(targetUpside)}% upside from the current price.`);
  if (fcfYield !== null && fcfYield > 2) catalysts.push(`Free cash flow yield is ${round(fcfYield)}%, supporting reinvestment or capital returns.`);
  if (forecastRevenueGrowth !== null && forecastRevenueGrowth > 5) catalysts.push(`Consensus revenue implies approximately ${round(forecastRevenueGrowth)}% growth from the latest completed fiscal year.`);
  if (forecastIncomeGrowth !== null && forecastIncomeGrowth > 5) catalysts.push(`Consensus net income implies approximately ${round(forecastIncomeGrowth)}% growth from the latest completed fiscal year.`);

  if (revenueGrowth !== null && revenueGrowth < 3) risks.push(`Revenue growth slowed to ${round(revenueGrowth)}%, leaving less room for execution misses.`);
  if (incomeGrowth !== null && incomeGrowth < 0) risks.push(`Net income declined ${round(Math.abs(incomeGrowth))}% in the latest reported year.`);
  if (forwardPE && forwardPE > 45) risks.push(`A ${round(forwardPE)}x forward P/E embeds high expectations.`);
  if (priceToSales && priceToSales > 10) risks.push(`Price-to-sales of ${round(priceToSales)}x leaves the valuation sensitive to slower growth.`);
  if (targetUpside !== null && targetUpside < 0) risks.push(`The consensus target is ${round(Math.abs(targetUpside))}% below the current price.`);
  if (fcfYield !== null && fcfYield < 1) risks.push(`Free cash flow yield is only ${round(fcfYield)}%, offering limited valuation support.`);
  if (data.operatingMargins < 5) risks.push(`Operating margin is thin at ${round(data.operatingMargins)}%.`);

  if (!catalysts.length) catalysts.push("Consensus estimates point to stable operations, but a stronger growth acceleration would improve the setup.");
  if (!risks.length) risks.push("The main risk is execution falling short of the growth and margin assumptions reflected in the valuation.");

  const baseTarget = target || price;
  const growthRate = clamp((forecastRevenueGrowth || revenueGrowth || 5) / 100, -0.2, 0.35);
  const bullPremium = Math.max(0.12, growthRate, targetUpside !== null ? targetUpside / 200 : 0);
  const bullPrice = baseTarget !== null
    ? baseTarget * (1 + bullPremium)
    : price !== null
      ? price * (1 + bullPremium)
      : null;
  const bearDiscount = clamp(0.15 + Math.max(0, (forwardPE || 0) - 35) / 300, 0.15, 0.35);
  const bearPrice = baseTarget !== null
    ? baseTarget * (1 - bearDiscount)
    : price !== null
      ? price * (1 - bearDiscount)
      : null;

  const highlights = [];
  if (latest.revenue !== null) highlights.push(`${latest.year} revenue was ${analysisMoney(toDollarsFromBillions(latest.revenue))}, ${revenueGrowth >= 0 ? "up" : "down"} ${round(Math.abs(revenueGrowth || 0))}% year over year.`);
  if (latest.earnings !== null) highlights.push(`Net income was ${analysisMoney(toDollarsFromBillions(latest.earnings))}, with a ${round(data.profitMargins)}% profit margin.`);
  if (latest.eps !== null) highlights.push(`Diluted EPS was $${round(latest.eps, 2)}${epsGrowth !== null ? `, a ${round(epsGrowth)}% year-over-year change` : ""}.`);
  highlights.push(`Annual free cash flow was ${analysisMoney(freeCashflow)}${fcfYield !== null ? `, equal to a ${round(fcfYield)}% yield` : ""}.`);

  const earningsPositives = catalysts.slice(0, 4);
  const earningsRisks = risks.slice(0, 4);
  const confidence = Math.round(clamp(50 + (revenueGrowth || 0) / 2 + (incomeGrowth || 0) / 4 + (forecastIncomeGrowth || forecastEpsGrowth || 0) / 4, 15, 90));
  const caution = 100 - confidence;

  return {
    generatedAt: new Date().toISOString(),
    symbol: data.symbol || stock.ticker,
    verdict: {
      stance,
      score,
      summary: `${data.name || stock.ticker} combines ${revenueGrowth >= 10 ? "strong" : revenueGrowth >= 3 ? "moderate" : "limited"} revenue momentum with a ${round(data.profitMargins)}% profit margin. The valuation is ${forwardPE && forwardPE > 40 ? "demanding" : forwardPE && forwardPE < 20 ? "relatively modest" : "middle-of-the-range"} at ${forwardPE ? `${round(forwardPE)}x forward earnings` : "an unavailable forward multiple"}.`
    },
    stockAnalysis: {
      valuation: [
        `Current P/E: ${pe ? `${round(pe)}x` : "N/A"}; forward P/E: ${forwardPE ? `${round(forwardPE)}x` : "N/A"}.`,
        `Price-to-sales: ${priceToSales ? `${round(priceToSales)}x` : "N/A"}.`,
        `Consensus target: ${analysisMoney(target)}${targetUpside !== null ? ` (${round(targetUpside)}% potential return)` : ""}.`,
        `Free cash flow yield: ${fcfYield !== null ? `${round(fcfYield)}%` : "N/A"}.`
      ],
      financialQuality: [
        `Gross margin ${round(data.grossMargins)}%, operating margin ${round(data.operatingMargins)}%, profit margin ${round(data.profitMargins)}%.`,
        `Latest revenue growth ${round(revenueGrowth)}%; net income growth ${round(incomeGrowth)}%.`,
        `Annual free cash flow ${analysisMoney(freeCashflow)} from ${data.freeCashflowSource || "available financial data"}.`,
        `Current-year consensus revenue ${analysisMoney(forecast.revenue)} and EPS ${forecast.eps !== null && forecast.eps !== undefined ? `$${round(forecast.eps, 2)}` : "N/A"}.`
      ],
      catalysts: catalysts.slice(0, 5),
      risks: risks.slice(0, 5),
      scenarios: [
        { label: "Bull", price: round(bullPrice, 2), detail: "Growth meets or exceeds consensus and the valuation multiple holds." },
        { label: "Base", price: round(baseTarget, 2), detail: target ? "Uses the current consensus analyst target." : "Assumes the current valuation is maintained." },
        { label: "Bear", price: round(bearPrice, 2), detail: "Models slower growth and valuation compression." }
      ]
    },
    earningsAnalysis: {
      period: latest.year ? `Latest reported fiscal year: ${latest.year}` : "Latest reported period",
      summary: `${data.name || stock.ticker} reported ${analysisMoney(toDollarsFromBillions(latest.revenue))} of revenue and ${analysisMoney(toDollarsFromBillions(latest.earnings))} of net income. Consensus now points to ${analysisMoney(forecast.revenue)} of current-year revenue and $${round(forecast.eps, 2)} of EPS.`,
      highlights,
      positives: earningsPositives,
      risks: earningsRisks,
      confidence,
      caution,
      outlook: `Consensus implies ${forecastRevenueGrowth !== null ? `${round(forecastRevenueGrowth)}% revenue growth` : "an unavailable revenue growth rate"} and ${forecastIncomeGrowth !== null ? `${round(forecastIncomeGrowth)}% net income growth` : "an unavailable net income growth rate"} from the latest completed fiscal year${nextForecastRevenueGrowth !== null || nextForecastIncomeGrowth !== null ? `, with next-year estimates implying ${nextForecastRevenueGrowth !== null ? `${round(nextForecastRevenueGrowth)}% revenue growth` : "unavailable revenue growth"} and ${nextForecastIncomeGrowth !== null ? `${round(nextForecastIncomeGrowth)}% net income growth` : "unavailable net income growth"}` : ""}. Watch whether operating margin can hold near ${round(data.operatingMargins)}% while the company works toward those estimates.`,
      questions: [
        `What assumptions have changed most in the outlook for revenue and demand?`,
        `Can operating margin remain near ${round(data.operatingMargins)}% while investment continues?`,
        `What are the largest uses of the ${analysisMoney(freeCashflow)} in annual free cash flow?`,
        `Which risk could cause results to miss the current consensus EPS estimate of $${round(forecast.eps, 2)}?`
      ]
    }
  };
}

app.get("/api/ai-analysis/:ticker", async (req, res) => {
try {
const ticker = req.params.ticker.toUpperCase();


const stock = await Stock.findOne({ ticker });

if (!stock) {
  return res.status(404).json({ error: "No stock data found" });
}

res.json(buildResearchAnalysis(stock));


} catch (err) {
console.error(err);
res.status(500).json({ error: "AI analysis failed" });
}
});

async function fetchQuartrEarningsCall(ticker) {
  if (!process.env.QUARTR_API_KEY) return null;
  const config = {
    headers: { "x-api-key": process.env.QUARTR_API_KEY },
    timeout: 15000
  };
  const audioResponse = await axios.get(
    "https://api.quartr.com/public/v3/audio",
    {
      ...config,
      params: { tickers: ticker, expand: "event", direction: "desc", limit: 20 }
    }
  );
  const audioItems = audioResponse.data?.data || [];
  const earningsAudio = audioItems
    .filter((item) => item.fileUrl || item.streamUrl)
    .sort((a, b) => new Date(b.event?.date || b.createdAt) - new Date(a.event?.date || a.createdAt))
    .find((item) =>
      item.event?.typeId === 26 || /earnings|results/i.test(item.event?.title || "")
    );
  if (!earningsAudio) return null;

  const transcriptResponse = await axios.get(
    "https://api.quartr.com/public/v3/documents/transcripts",
    {
      ...config,
      params: {
        eventIds: String(earningsAudio.eventId),
        expand: "event",
        direction: "desc",
        limit: 10
      }
    }
  );
  const transcript = (transcriptResponse.data?.data || [])[0] || {};

  return {
    available: true,
    provider: "Quartr",
    title: earningsAudio.event?.title || `${ticker} earnings call`,
    date: earningsAudio.event?.date || earningsAudio.createdAt,
    fiscalYear: earningsAudio.event?.fiscalYear,
    fiscalPeriod: earningsAudio.event?.fiscalPeriod,
    audioUrl: earningsAudio.fileUrl || earningsAudio.streamUrl,
    transcriptUrl: transcript.fileUrl || null,
    transcript: []
  };
}

async function fetchFinnhubEarningsCall(ticker) {
  if (!process.env.FINNHUB_API_KEY) return null;
  const listResponse = await axios.get(
    "https://finnhub.io/api/v1/stock/transcripts/list",
    {
      params: { symbol: ticker, token: process.env.FINNHUB_API_KEY },
      timeout: 15000
    }
  );
  const items = listResponse.data?.transcripts || listResponse.data || [];
  if (!Array.isArray(items) || !items.length) return null;
  const latest = [...items].sort((a, b) =>
    new Date(b.time || `${b.year}-${b.quarter || 1}`) -
    new Date(a.time || `${a.year}-${a.quarter || 1}`)
  )[0];
  const detailResponse = await axios.get(
    "https://finnhub.io/api/v1/stock/transcripts",
    {
      params: { id: latest.id, token: process.env.FINNHUB_API_KEY },
      timeout: 20000
    }
  );
  const detail = detailResponse.data || {};
  if (!detail.audio) return null;

  return {
    available: true,
    provider: "Finnhub",
    title: detail.title || latest.title || `${ticker} earnings call`,
    date: detail.time || latest.time,
    fiscalYear: detail.year || latest.year,
    fiscalPeriod: detail.quarter ? `Q${detail.quarter}` : null,
    audioUrl: detail.audio,
    transcriptUrl: null,
    transcript: (detail.transcript || []).map((section, index) => ({
      id: `${index}-${section.name || "speaker"}`,
      speaker: section.name || "Speaker",
      session: section.session || null,
      text: Array.isArray(section.speech)
        ? section.speech.join(" ")
        : String(section.speech || "")
    })).filter((section) => section.text)
  };
}

async function getLatestSecFiscalPeriod(ticker) {
  try {
    const tickerMap = await getSecTickerMap();
    const cik = tickerMap.get(ticker);
    if (!cik) return null;
    const response = await axios.get(
      `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`,
      {
        headers: { "User-Agent": "InvestmentTerminal/1.0 contact@investmentterminal.app" },
        timeout: 12000
      }
    );
    const concepts = [
      "RevenueFromContractWithCustomerExcludingAssessedTax",
      "OperatingRevenues",
      "Revenues",
      "SalesRevenueNet",
      "NetIncomeLoss"
    ];
    const filings = concepts.flatMap((concept) =>
      Object.values(response.data?.facts?.["us-gaap"]?.[concept]?.units || {}).flat()
    ).filter((entry) =>
      ["10-Q", "10-Q/A", "10-K", "10-K/A"].includes(entry.form) &&
      entry.end &&
      entry.fy &&
      entry.fp
    ).sort((a, b) =>
      String(b.end).localeCompare(String(a.end)) ||
      String(b.filed).localeCompare(String(a.filed))
    );
    const latest = filings[0];
    if (!latest) return null;
    const quarter = latest.fp === "FY"
      ? 4
      : Number(String(latest.fp).replace("Q", ""));
    return [1, 2, 3, 4].includes(quarter)
      ? { year: Number(latest.fy), quarter, date: latest.end }
      : null;
  } catch (err) {
    console.log("SEC fiscal period skipped:", ticker, err.response?.status || err.message);
    return null;
  }
}

function getAlphaVantageApiKey() {
  return String(process.env.ALPHA_VANTAGE_API_KEY || "")
    .trim()
    .replace(/^ALPHA_VANTAGE_API_KEY\s*=\s*/i, "")
    .replace(/^['"]|['"]$/g, "")
    .trim();
}

function getRoicApiKey() {
  return String(process.env.ROIC_API_KEY || "")
    .trim()
    .replace(/^ROIC_API_KEY\s*=\s*/i, "")
    .replace(/^['"]|['"]$/g, "")
    .trim();
}

function splitPlainTranscript(content) {
  const normalized = String(content || "")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!normalized) return [];

  const blocks = normalized
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  if (blocks.length <= 1) {
    return [{
      id: "0-transcript",
      speaker: "Transcript",
      session: null,
      text: normalized
    }];
  }

  return blocks.map((block, index) => {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    const firstLine = lines[0] || "";
    const looksLikeSpeaker =
      firstLine.length <= 80 &&
      !/[.!?]$/.test(firstLine) &&
      /^[A-Za-z][A-Za-z .,'-]+$/.test(firstLine);

    return {
      id: `${index}-${looksLikeSpeaker ? firstLine : "transcript"}`,
      speaker: looksLikeSpeaker ? firstLine : "Transcript",
      session: null,
      text: looksLikeSpeaker
        ? lines.slice(1).join(" ").trim()
        : lines.join(" ").trim()
    };
  }).filter((section) => section.text);
}

async function fetchRoicEarningsCall(ticker) {
  const apiKey = getRoicApiKey();
  if (!apiKey) return null;

  const response = await axios.get(
    `https://api.roic.ai/v2/company/earnings-calls/latest/${encodeURIComponent(ticker)}`,
    {
      params: { apikey: apiKey },
      timeout: 20000
    }
  );

  const content = response.data?.content;
  const transcript = splitPlainTranscript(content);
  if (!transcript.length) return null;

  return {
    available: true,
    provider: "ROIC.ai",
    title: `${ticker} earnings call transcript`,
    date: response.data?.date || null,
    fiscalYear: response.data?.year || null,
    fiscalPeriod: response.data?.quarter ? `Q${response.data.quarter}` : null,
    audioUrl: null,
    transcriptUrl: null,
    computerReadAudio: true,
    transcript
  };
}

const IR_AUDIO_EXTENSIONS = [".mp3", ".m4a", ".aac", ".wav", ".ogg", ".mp4"];
const IR_AUDIO_EXCLUDED_HOSTS = [
  "youtube.com",
  "youtu.be",
  "vimeo.com",
  "facebook.com",
  "twitter.com",
  "x.com",
  "linkedin.com"
];

function isExcludedIrAudioHost(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    return IR_AUDIO_EXCLUDED_HOSTS.some((excluded) =>
      host === excluded || host.endsWith(`.${excluded}`)
    );
  } catch {
    return true;
  }
}

function isLikelyAudioUrl(url) {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.toLowerCase();
    return !isExcludedIrAudioHost(url) &&
      IR_AUDIO_EXTENSIONS.some((extension) => path.endsWith(extension));
  } catch {
    return false;
  }
}

function resolvePublicUrl(href, baseUrl) {
  try {
    if (!href || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) {
      return null;
    }
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

function getIrCandidateRoots(companyUrl) {
  try {
    const parsed = new URL(companyUrl);
    const hostParts = parsed.hostname.replace(/^www\./, "").split(".");
    const rootDomain = hostParts.slice(-2).join(".");
    return [
      `https://investor.${rootDomain}`,
      `https://investors.${rootDomain}`,
      `https://ir.${rootDomain}`,
      parsed.origin
    ];
  } catch {
    return [];
  }
}

function buildIrCandidatePages(companyUrl) {
  const paths = [
    "",
    "/financial-information/earnings-annual-reports",
    "/financial-information/quarterly-results",
    "/financials/quarterly-results",
    "/quarterly-results",
    "/investors",
    "/investor-relations",
    "/investor",
    "/ir",
    "/news-events/events-presentations",
    "/events-and-presentations",
    "/events-presentations",
    "/events",
    "/financials",
    "/financial-information"
  ];
  const pages = new Set();
  getIrCandidateRoots(companyUrl).forEach((root) => {
    paths.forEach((path) => {
      try {
        pages.add(new URL(path, root).toString());
      } catch {
        // Ignore malformed candidate pages.
      }
    });
  });
  return [...pages].slice(0, 24);
}

async function fetchHtmlPage(url) {
  const response = await axios.get(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    },
    timeout: 6000,
    maxRedirects: 4,
    validateStatus: (status) => status >= 200 && status < 400
  });
  const contentType = response.headers["content-type"] || "";
  if (!/html|text/i.test(contentType)) return null;
  return response.data;
}

function extractIrAudioLinks(html, pageUrl, ticker) {
  const $ = cheerio.load(html || "");
  const links = [];
  const seen = new Set();
  const escapedTicker = String(ticker).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tickerPattern = new RegExp(`\\b${escapedTicker}\\b`, "i");

  $("a[href], audio[src], source[src], video[src]").each((_, element) => {
    const href = $(element).attr("href") || $(element).attr("src");
    const resolved = resolvePublicUrl(href, pageUrl);
    const label = [
      $(element).text(),
      $(element).attr("title"),
      $(element).attr("aria-label"),
      resolved
    ].filter(Boolean).join(" ");
    const labelledAudio = /mp3|m4a|audio|listen/i.test(label);
    if (
      !resolved ||
      seen.has(resolved) ||
      isExcludedIrAudioHost(resolved) ||
      (!isLikelyAudioUrl(resolved) && !labelledAudio)
    ) return;
    seen.add(resolved);
    const score =
      (/earnings|quarter|results|conference|webcast|call|replay/i.test(label) ? 6 : 0) +
      (/audio|mp3|listen|download/i.test(label) ? 4 : 0) +
      (tickerPattern.test(label) ? 2 : 0);
    links.push({
      audioUrl: resolved,
      title: $(element).text().trim() || `${ticker} investor relations audio`,
      score,
      pageUrl
    });
  });

  const directMediaPattern = /https?:\\?\/\\?\/[^"'<>\\\s]+?\.(?:mp3|m4a|aac|wav|ogg|mp4)(?:\?[^"'<>\\\s]*)?/gi;
  const directMatches = String(html || "").match(directMediaPattern) || [];
  directMatches.forEach((match) => {
    const normalized = match.replace(/\\\//g, "/");
    if (seen.has(normalized) || !isLikelyAudioUrl(normalized)) return;
    seen.add(normalized);
    const score =
      (/earnings|quarter|results|conference|webcast|call|replay/i.test(normalized) ? 6 : 0) +
      (/audio|mp3|listen|download/i.test(normalized) ? 4 : 0) +
      (tickerPattern.test(normalized) ? 2 : 0);
    links.push({
      audioUrl: normalized,
      title: `${ticker} investor relations audio`,
      score,
      pageUrl
    });
  });

  return links;
}

async function getCompanyInvestorRelationsUrl(ticker) {
  try {
    const profile = await getFinnhub(`https://finnhub.io/api/v1/stock/profile2?symbol=${ticker}`);
    return profile.weburl || null;
  } catch (err) {
    console.log("IR website lookup skipped:", ticker, err.response?.status || err.message);
    return null;
  }
}

function isOfficialInvestorRelationsUrl(url, companyUrl) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    const roots = getIrCandidateRoots(companyUrl)
      .map((root) => new URL(root).hostname.replace(/^www\./, "").toLowerCase());
    return roots.some((rootHost) =>
      host === rootHost || host.endsWith(`.${rootHost}`)
    );
  } catch {
    return false;
  }
}

function buildEarningsAudioProxyUrl(apiBaseUrl, ticker, audioUrl) {
  const params = new URLSearchParams({ url: audioUrl });
  return `${apiBaseUrl}/api/earnings-call/${encodeURIComponent(ticker)}/ir-audio?${params}`;
}

async function fetchInvestorRelationsAudio(ticker, apiBaseUrl = "") {
  const companyUrl = await getCompanyInvestorRelationsUrl(ticker);
  if (!companyUrl) return null;

  const candidatePages = buildIrCandidatePages(companyUrl);
  const discoveredPages = new Set(candidatePages);
  const audioLinks = [];

  for (const pageUrl of candidatePages) {
    try {
      const html = await fetchHtmlPage(pageUrl);
      if (!html) continue;
      audioLinks.push(...extractIrAudioLinks(html, pageUrl, ticker));

      const $ = cheerio.load(html);
      $("a[href]").each((_, element) => {
        if (discoveredPages.size >= 28) return;
        const label = `${$(element).text()} ${$(element).attr("href") || ""}`;
        if (!/earnings|quarter|results|webcast|events|presentations|financial/i.test(label)) return;
        const resolved = resolvePublicUrl($(element).attr("href"), pageUrl);
        if (resolved && !isExcludedIrAudioHost(resolved)) {
          discoveredPages.add(resolved);
        }
      });
    } catch (err) {
      // Many IR sites block generic scraping. Keep trying other official candidates.
    }
  }

  for (const pageUrl of [...discoveredPages].slice(candidatePages.length, 28)) {
    try {
      const html = await fetchHtmlPage(pageUrl);
      if (!html) continue;
      audioLinks.push(...extractIrAudioLinks(html, pageUrl, ticker));
    } catch {
      // Keep the IR finder best-effort.
    }
  }

  const best = audioLinks
    .filter((link) => link.score > 0)
    .sort((a, b) => b.score - a.score)[0];

  if (!best) return null;

  return {
    available: true,
    provider: "Investor Relations",
    title: best.title || `${ticker} investor relations audio`,
    date: null,
    fiscalYear: null,
    fiscalPeriod: null,
    audioUrl: apiBaseUrl
      ? buildEarningsAudioProxyUrl(apiBaseUrl, ticker, best.audioUrl)
      : best.audioUrl,
    rawAudioUrl: best.audioUrl,
    transcriptUrl: null,
    transcript: [],
    sourceUrl: best.pageUrl
  };
}

async function fetchAlphaVantageEarningsCall(ticker, knownFiscalPeriod = null) {
  const apiKey = getAlphaVantageApiKey();
  if (!apiKey) return null;
  const fiscalPeriod = knownFiscalPeriod || await getLatestSecFiscalPeriod(ticker);
  const now = new Date();
  const currentQuarter = Math.floor(now.getUTCMonth() / 3) + 1;
  const fallbackQuarter = currentQuarter === 1 ? 4 : currentQuarter - 1;
  const fallbackYear = currentQuarter === 1 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
  const startingYear = fiscalPeriod?.year || fallbackYear;
  const startingQuarter = fiscalPeriod?.quarter || fallbackQuarter;
  const periods = Array.from({ length: 2 }, (_, index) => {
    const zeroBasedQuarter = startingQuarter - 1 - index;
    return {
      year: startingYear + Math.floor(zeroBasedQuarter / 4),
      quarter: ((zeroBasedQuarter % 4) + 4) % 4 + 1
    };
  });

  for (const { year, quarter } of periods) {
    const period = `${year}Q${quarter}`;
    const response = await axios.get("https://www.alphavantage.co/query", {
      params: {
        function: "EARNINGS_CALL_TRANSCRIPT",
        symbol: ticker,
        quarter: period,
        apikey: apiKey
      },
      timeout: 25000
    });
    const sections = Array.isArray(response.data?.transcript)
      ? response.data.transcript
      : [];
    if (sections.length) {
      return {
        available: true,
        provider: "Alpha Vantage",
        title: `${ticker} earnings call transcript`,
        date: null,
        fiscalYear: year,
        fiscalPeriod: `Q${quarter}`,
        audioUrl: null,
        transcriptUrl: null,
        computerReadAudio: true,
        transcript: sections.map((section, index) => ({
          id: `${index}-${section.speaker || "speaker"}`,
          speaker: section.speaker || "Speaker",
          session: section.title || null,
          text: String(section.content || "")
        })).filter((section) => section.text)
      };
    }

    const message = response.data?.Information || response.data?.Note || response.data?.["Error Message"];
    if (message) console.log("Alpha Vantage transcript unavailable:", ticker, period, message);
    if (/frequency|limit|requests per day|rate/i.test(message || "")) {
      const providerError = new Error("Alpha Vantage daily limit reached");
      providerError.providerCode = "alpha_daily_limit";
      throw providerError;
    }
    if (/invalid or missing.*api\s*key|api\s*key.*invalid|parameter apikey/i.test(message || "")) {
      const providerError = new Error("Alpha Vantage API key rejected");
      providerError.providerCode = "alpha_key_invalid";
      throw providerError;
    }
    if (/premium endpoint|premium membership/i.test(message || "")) {
      const providerError = new Error("Alpha Vantage plan does not include transcripts");
      providerError.providerCode = "alpha_plan_restricted";
      throw providerError;
    }
  }

  const providerError = new Error("Alpha Vantage transcript unavailable");
  providerError.providerCode = "alpha_quarter_unavailable";
  providerError.fiscalPeriod = periods.map(({ year, quarter }) => `${year}Q${quarter}`).join(" through ");
  throw providerError;
}

const EARNINGS_CALL_EXCHANGES = [
  "NASDAQ", "NYSE", "AMEX", "TSX", "TSXV", "OTC", "LSE", "CBOE", "STO", "ASX"
];

function normalizeEarningsCallExchange(exchange) {
  const exchangeMap = {
    NMS: "NASDAQ",
    NGM: "NASDAQ",
    NCM: "NASDAQ",
    NASDAQ: "NASDAQ",
    NYQ: "NYSE",
    NYSE: "NYSE",
    ASE: "AMEX",
    AMEX: "AMEX",
    TOR: "TSX",
    TSX: "TSX",
    VAN: "TSXV",
    TSXV: "TSXV",
    PNK: "OTC",
    OTC: "OTC",
    LSE: "LSE",
    BTS: "CBOE",
    CBOE: "CBOE",
    STO: "STO",
    ASX: "ASX"
  };
  const normalized = String(exchange || "").toUpperCase();
  if (exchangeMap[normalized]) return exchangeMap[normalized];
  if (normalized.includes("NASDAQ")) return "NASDAQ";
  if (normalized.includes("NEW YORK") || normalized.includes("NYSE")) return "NYSE";
  if (normalized.includes("TORONTO") || normalized.includes("TSX")) return "TSX";
  return null;
}

async function getEarningsCallEmbedUrl(ticker) {
  let exchange = null;
  try {
    const quote = await yahooFinance.quote(ticker);
    exchange = normalizeEarningsCallExchange(quote.exchange);
  } catch (err) {
    console.log("EarningsCall embed exchange lookup skipped:", ticker, err.message);
  }

  if (!exchange) {
    try {
      const profile = await getFinnhub(
        `https://finnhub.io/api/v1/stock/profile2?symbol=${ticker}`
      );
      exchange = normalizeEarningsCallExchange(profile.exchange);
    } catch (err) {
      console.log("EarningsCall embed profile skipped:", ticker, err.message);
    }
  }

  return exchange
    ? `https://earningscall.biz/e/${exchange.toLowerCase()}/s/${ticker.toLowerCase()}`
    : "https://earningscall.biz/";
}

async function fetchEarningsCallBiz(ticker, apiBaseUrl) {
  if (!process.env.EARNINGSCALL_API_KEY) return null;

  const quote = await yahooFinance.quote(ticker).catch(() => ({}));
  const preferredExchange = normalizeEarningsCallExchange(quote.exchange);
  const exchanges = preferredExchange
    ? [preferredExchange, ...EARNINGS_CALL_EXCHANGES.filter((item) => item !== preferredExchange)]
    : EARNINGS_CALL_EXCHANGES;
  let eventData = null;
  let exchange = null;

  for (const candidate of exchanges) {
    try {
      const response = await axios.get("https://v2.api.earningscall.biz/events", {
        params: {
          apikey: process.env.EARNINGSCALL_API_KEY,
          exchange: candidate.toLowerCase(),
          symbol: ticker.toLowerCase()
        },
        timeout: 15000
      });
      const events = Array.isArray(response.data?.events) ? response.data.events : [];
      const latest = events
        .filter((event) => event.is_published !== false)
        .sort((a, b) =>
          new Date(b.conference_date || `${b.year}-${b.quarter}`) -
          new Date(a.conference_date || `${a.year}-${a.quarter}`)
        )[0];
      if (latest) {
        eventData = { ...latest, companyName: response.data?.company_name };
        exchange = candidate;
        break;
      }
    } catch (err) {
      if (![401, 403, 404].includes(err.response?.status)) throw err;
      if ([401, 403].includes(err.response?.status)) throw err;
    }
  }

  if (!eventData || !exchange) return null;

  const transcriptResponse = await axios.get(
    "https://v2.api.earningscall.biz/transcript",
    {
      params: {
        apikey: process.env.EARNINGSCALL_API_KEY,
        exchange: exchange.toLowerCase(),
        symbol: ticker.toLowerCase(),
        year: eventData.year,
        quarter: eventData.quarter,
        level: 2
      },
      timeout: 25000
    }
  );
  const speakers = Array.isArray(transcriptResponse.data?.speakers)
    ? transcriptResponse.data.speakers
    : [];
  const speakerNames = transcriptResponse.data?.speaker_name_map_v2 || {};
  const audioParams = new URLSearchParams({
    exchange,
    year: String(eventData.year),
    quarter: String(eventData.quarter)
  });

  return {
    available: true,
    provider: "EarningsCall",
    title: `${eventData.companyName || ticker} earnings call`,
    date: eventData.conference_date,
    fiscalYear: eventData.year,
    fiscalPeriod: `Q${eventData.quarter}`,
    audioUrl: `${apiBaseUrl}/api/earnings-call/${encodeURIComponent(ticker)}/audio?${audioParams}`,
    transcriptUrl: null,
    transcript: speakers.map((section, index) => {
      const speakerDetails = speakerNames[section.speaker] || {};
      return {
        id: `${index}-${section.speaker || "speaker"}`,
        speaker:
          speakerDetails.name ||
          section.speaker_name ||
          section.name ||
          section.speaker ||
          "Speaker",
        session: speakerDetails.title || section.session || null,
        text: String(section.text || "")
      };
    }).filter((section) => section.text)
  };
}

app.get("/api/earnings-call/:ticker/audio", async (req, res) => {
  const ticker = req.params.ticker.trim().toUpperCase();
  const exchange = String(req.query.exchange || "").toUpperCase();
  const year = Number(req.query.year);
  const quarter = Number(req.query.quarter);
  if (
    !process.env.EARNINGSCALL_API_KEY ||
    !/^[A-Z0-9.-]{1,15}$/.test(ticker) ||
    !EARNINGS_CALL_EXCHANGES.includes(exchange) ||
    !Number.isInteger(year) ||
    year < 1990 ||
    year > new Date().getFullYear() + 1 ||
    ![1, 2, 3, 4].includes(quarter)
  ) {
    return res.status(400).json({ error: "Invalid earnings call audio request" });
  }

  try {
    const upstream = await axios.get("https://v2.api.earningscall.biz/audio", {
      params: {
        apikey: process.env.EARNINGSCALL_API_KEY,
        exchange: exchange.toLowerCase(),
        symbol: ticker.toLowerCase(),
        year,
        quarter
      },
      headers: req.headers.range ? { Range: req.headers.range } : {},
      responseType: "stream",
      timeout: 30000,
      validateStatus: (status) => status === 200 || status === 206
    });
    res.status(upstream.status);
    for (const header of ["content-type", "content-length", "content-range", "accept-ranges"]) {
      if (upstream.headers[header]) res.setHeader(header, upstream.headers[header]);
    }
    res.setHeader("Cache-Control", "public, max-age=86400");
    return upstream.data.pipe(res);
  } catch (err) {
    console.error("EarningsCall audio failed:", ticker, err.response?.status || err.message);
    return res.status(502).json({ error: "Earnings call audio unavailable" });
  }
});

app.get("/api/earnings-call/:ticker/ir-audio", async (req, res) => {
  const ticker = req.params.ticker.trim().toUpperCase();
  const audioUrl = String(req.query.url || "");

  if (!/^[A-Z0-9.-]{1,15}$/.test(ticker) || !audioUrl) {
    return res.status(400).json({ error: "Invalid investor relations audio request" });
  }

  try {
    const companyUrl = await getCompanyInvestorRelationsUrl(ticker);
    if (!companyUrl || !isOfficialInvestorRelationsUrl(audioUrl, companyUrl)) {
      return res.status(403).json({ error: "Audio URL is not from the company's official investor relations site" });
    }

    const upstream = await axios.get(audioUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        ...(req.headers.range ? { Range: req.headers.range } : {})
      },
      responseType: "stream",
      timeout: 30000,
      maxRedirects: 4,
      validateStatus: (status) => status === 200 || status === 206
    });

    res.status(upstream.status);
    for (const header of ["content-type", "content-length", "content-range", "accept-ranges"]) {
      if (upstream.headers[header]) res.setHeader(header, upstream.headers[header]);
    }
    res.setHeader("Cache-Control", "public, max-age=86400");
    return upstream.data.pipe(res);
  } catch (err) {
    console.error("Investor relations audio proxy failed:", ticker, err.response?.status || err.message);
    return res.status(502).json({ error: "Investor relations audio unavailable" });
  }
});

app.get("/api/earnings-call/:ticker", async (req, res) => {
  const ticker = req.params.ticker.trim().toUpperCase();

  try {
    const cached = await EarningsCall.findOne({ ticker });
    if (
      cached?.data?.version === EARNINGS_CALL_VERSION &&
      Date.now() - new Date(cached.updatedAt).getTime() < 12 * 60 * 60 * 1000
    ) {
      return res.json(cached.data);
    }

    const apiBaseUrl =
      process.env.PUBLIC_API_URL ||
      `${req.protocol}://${req.get("host")}`;
    const providerErrors = [];
    const transcriptProviders = [
      ["ROIC.ai", () => fetchRoicEarningsCall(ticker)],
      ["Alpha Vantage", () => fetchAlphaVantageEarningsCall(ticker)],
      ["Finnhub", () => fetchFinnhubEarningsCall(ticker)],
      ["EarningsCall", () => fetchEarningsCallBiz(ticker, apiBaseUrl)]
    ];
    const audioProviders = [
      ["Finnhub", () => fetchFinnhubEarningsCall(ticker)],
      ["Quartr", () => fetchQuartrEarningsCall(ticker)],
      ["EarningsCall", () => fetchEarningsCallBiz(ticker, apiBaseUrl)],
      ["Investor Relations", () => resolveWithin(fetchInvestorRelationsAudio(ticker, apiBaseUrl), 12000, null)]
    ];
    let transcriptData = null;
    let audioData = null;

    for (const [providerName, fetchProvider] of transcriptProviders) {
      try {
        const providerData = await fetchProvider();
        if (providerData?.available && providerData.transcript?.length) {
          transcriptData = providerData;
          break;
        }
      } catch (err) {
        providerErrors.push({
          provider: providerName,
          code: err.providerCode || err.response?.status || "unavailable"
        });
        console.log(`${providerName} earnings call skipped:`, ticker, err.providerCode || err.response?.status || err.message);
      }
    }

    for (const [providerName, fetchProvider] of audioProviders) {
      try {
        const providerData = await fetchProvider();
        if (providerData?.available && providerData.audioUrl) {
          audioData = providerData;
          break;
        }
        if (providerName === "Investor Relations") {
          providerErrors.push({
            provider: "Investor Relations audio",
            code: "not_found"
          });
        }
      } catch (err) {
        providerErrors.push({
          provider: `${providerName} audio`,
          code: err.providerCode || err.response?.status || "unavailable"
        });
        console.log(`${providerName} earnings audio skipped:`, ticker, err.providerCode || err.response?.status || err.message);
      }
    }

    if (transcriptData?.transcript?.length || audioData?.audioUrl) {
      const data = {
        ...(transcriptData || audioData),
        provider: audioData?.audioUrl && transcriptData
          ? `${transcriptData.provider} transcript + ${audioData.provider} audio`
          : (transcriptData || audioData).provider,
        symbol: ticker,
        audioUrl: audioData?.audioUrl || transcriptData?.audioUrl || null,
        transcript: transcriptData?.transcript || audioData?.transcript || [],
        computerReadAudio: false,
        hasOriginalAudio: Boolean(audioData?.audioUrl || transcriptData?.audioUrl),
        version: EARNINGS_CALL_VERSION,
        errors: providerErrors,
        fetchedAt: new Date().toISOString()
      };
      await EarningsCall.findOneAndUpdate(
        { ticker },
        { ticker, data, updatedAt: new Date() },
        { upsert: true, new: true }
      );
      return res.json(data);
    }

    const finnhubBlocked = providerErrors.some((error) =>
      /^Finnhub/i.test(error.provider) && Number(error.code) === 403
    );
    const investorRelationsChecked = providerErrors.some((error) =>
      /^Investor Relations/i.test(error.provider)
    );

    return res.json({
      available: false,
      symbol: ticker,
      provider: null,
      transcript: [],
      audioUrl: null,
      computerReadAudio: false,
      hasOriginalAudio: false,
      version: EARNINGS_CALL_VERSION,
      errors: providerErrors,
      message: investorRelationsChecked && finnhubBlocked
        ? "Finnhub audio is blocked on this API key, and no public original audio was found on the company's investor relations pages."
        : finnhubBlocked
          ? "Finnhub was tried, but this API key does not include earnings call transcript/audio access."
          : investorRelationsChecked
            ? "No public original audio was found on the company's investor relations pages."
            : "No free native earnings call transcript or original audio is available for this ticker yet."
    });
  } catch (err) {
    console.error("EarningsCall native fetch failed:", ticker, err.message);
    return res.status(500).json({
      available: false,
      symbol: ticker,
      transcript: [],
      audioUrl: null,
      error: "Earnings call transcript unavailable"
    });
  }
});

// =========================
// EARNINGS CALENDAR
// =========================
app.get("/api/earnings", async (req, res) => {
  const parseIsoDate = (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return null;
    const date = new Date(`${value}T12:00:00Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  };
  const toIsoDate = (date) => date.toISOString().slice(0, 10);
  const requestedStart = parseIsoDate(req.query.start);
  const weekStart = requestedStart || (() => {
    const date = new Date();
    date.setUTCHours(12, 0, 0, 0);
    const daysFromMonday = (date.getUTCDay() + 6) % 7;
    date.setUTCDate(date.getUTCDate() - daysFromMonday);
    return date;
  })();
  const dates = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setUTCDate(date.getUTCDate() + index);
    return toIsoDate(date);
  });
  const paddedStart = new Date(weekStart);
  paddedStart.setUTCDate(paddedStart.getUTCDate() - 45);
  const cacheKey = dates[0];
  const cached = earningsCalendarCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < 15 * 60 * 1000) {
    return res.json(cached.data);
  }

  try {
    const nasdaqHeaders = {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36",
      Accept: "application/json, text/plain, */*",
      Origin: "https://www.nasdaq.com",
      Referer: "https://www.nasdaq.com/"
    };
    const [finnhubResponse, ...nasdaqResponses] = await Promise.all([
      process.env.FINNHUB_API_KEY
        ? axios.get("https://finnhub.io/api/v1/calendar/earnings", {
            params: {
              from: toIsoDate(paddedStart),
              to: dates[6],
              token: process.env.FINNHUB_API_KEY
            },
            timeout: 15000
          }).catch((err) => {
            console.log("Finnhub earnings calendar skipped:", err.response?.status || err.message);
            return { data: { earningsCalendar: [] } };
          })
        : Promise.resolve({ data: { earningsCalendar: [] } }),
      ...dates.map((date) =>
        axios.get("https://api.nasdaq.com/api/calendar/earnings", {
          params: { date },
          headers: nasdaqHeaders,
          timeout: 15000
        }).catch((err) => {
          console.log("Nasdaq earnings calendar skipped:", date, err.response?.status || err.message);
          return { data: { data: { rows: [] } } };
        })
      )
    ]);
    const finnhubRows = finnhubResponse.data?.earningsCalendar || [];
    const finnhubByDateAndSymbol = new Map(
      finnhubRows.map((row) => [`${row.date}:${row.symbol}`, row])
    );
    const finnhubBySymbol = finnhubRows.reduce((map, row) => {
      const rows = map.get(row.symbol) || [];
      rows.push(row);
      map.set(row.symbol, rows);
      return map;
    }, new Map());
    const parseMarketCap = (value) => {
      const number = Number(String(value || "").replace(/[$,]/g, ""));
      return Number.isFinite(number) ? number : null;
    };
    const parseEstimate = (value) => {
      const text = String(value || "").trim();
      if (!text || text === "N/A") return null;
      const negative = text.startsWith("(") && text.endsWith(")");
      const number = Number(text.replace(/[$,()]/g, ""));
      return Number.isFinite(number) ? (negative ? -number : number) : null;
    };
    const parseApiNumber = (value) => {
      if (value === null || value === undefined || value === "") return null;
      const number = Number(value);
      return Number.isFinite(number) ? number : null;
    };
    const timeLabels = {
      bmo: "Before open",
      amc: "After close",
      dmh: "During market",
      "time-pre-market": "Before open",
      "time-after-hours": "After close"
    };
    const days = dates.map((date, index) => {
      const nasdaqRows = nasdaqResponses[index]?.data?.data?.rows || [];
      const events = nasdaqRows.map((row) => {
        const exactFinnhub = finnhubByDateAndSymbol.get(`${date}:${row.symbol}`);
        const nasdaqEps = parseEstimate(row.epsForecast);
        const nearbyFinnhub = (finnhubBySymbol.get(row.symbol) || [])
          .map((candidate) => ({
            candidate,
            distance: Math.abs(
              new Date(`${candidate.date}T12:00:00Z`) - new Date(`${date}T12:00:00Z`)
            ) / (24 * 60 * 60 * 1000)
          }))
          .filter(({ candidate, distance }) => {
            if (distance > 45) return false;
            const candidateEps = parseApiNumber(candidate.epsEstimate);
            if (nasdaqEps === null || candidateEps === null) return true;
            return Math.abs(nasdaqEps - candidateEps) <= Math.max(0.25, Math.abs(nasdaqEps) * 0.5);
          })
          .sort((a, b) => a.distance - b.distance)[0]?.candidate;
        const finnhub = exactFinnhub || nearbyFinnhub || {};
        return {
          date,
          symbol: row.symbol,
          company: row.name || row.symbol,
          logo: getFinnhubLogoUrl(row.symbol),
          marketCap: parseMarketCap(row.marketCap),
          reportTime: timeLabels[exactFinnhub?.hour || row.time] || "Time not supplied",
          fiscalQuarter: exactFinnhub?.quarter && exactFinnhub?.year
            ? `Q${finnhub.quarter} ${finnhub.year}`
            : row.fiscalQuarterEnding || null,
          epsEstimate: parseApiNumber(finnhub.epsEstimate) ?? parseEstimate(row.epsForecast),
          revenueEstimate: parseApiNumber(finnhub.revenueEstimate),
          epsActual: parseApiNumber(finnhub.epsActual),
          revenueActual: parseApiNumber(finnhub.revenueActual)
        };
      }).filter((event) => event.symbol)
        .sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0))
        .slice(0, 8);
      return { date, events };
    });
    const responseData = {
      weekStart: dates[0],
      weekEnd: dates[6],
      days
    };
    earningsCalendarCache.set(cacheKey, { data: responseData, cachedAt: Date.now() });
    return res.json(responseData);
  } catch (err) {
    console.error("Earnings calendar error:", err.message);
    return res.status(500).json({ weekStart: dates[0], weekEnd: dates[6], days: [] });
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
const { watchlist, portfolio, portfolios, activePortfolioId, namedWatchlists, projections } = req.body;
const cleanSymbols = (symbols, limit = 100) => [...new Set((Array.isArray(symbols) ? symbols : [])
  .map((symbol) => String(symbol).trim().toUpperCase())
  .filter((symbol) => /^[A-Z0-9.-]{1,10}$/.test(symbol)))]
  .slice(0, limit);
const cleanProjectionNumberMap = (values) => {
  if (!values || typeof values !== "object" || Array.isArray(values)) return {};

  return Object.fromEntries(
    Object.entries(values)
      .filter(([year, value]) =>
        /^\d{4}$/.test(String(year)) &&
        /^-?\d{0,6}(\.\d{0,4})?$/.test(String(value ?? ""))
      )
      .slice(0, 10)
      .map(([year, value]) => [String(year), String(value ?? "").slice(0, 20)])
  );
};
const cleanProjectionCase = (settings = {}) => ({
  revenueGrowth: cleanProjectionNumberMap(settings.revenueGrowth),
  netIncomeGrowth: cleanProjectionNumberMap(settings.netIncomeGrowth),
  sharesGrowth: cleanProjectionNumberMap(settings.sharesGrowth),
  lowPe: cleanProjectionNumberMap(settings.lowPe),
  highPe: cleanProjectionNumberMap(settings.highPe)
});
const cleanProjections = (items) => {
  if (!items || typeof items !== "object" || Array.isArray(items)) return {};

  return Object.fromEntries(
    Object.entries(items)
      .filter(([symbol]) => /^[A-Z0-9.-]{1,10}$/.test(String(symbol).toUpperCase()))
      .slice(0, 300)
      .map(([symbol, cases]) => [
        String(symbol).toUpperCase(),
        {
          bull: cleanProjectionCase(cases?.bull),
          base: cleanProjectionCase(cases?.base),
          bear: cleanProjectionCase(cases?.bear)
        }
      ])
  );
};
const cleanPositions = (positions) => (Array.isArray(positions) ? positions : [])
  .map((position) => ({
    symbol: String(position?.symbol || "").trim().toUpperCase(),
    shares: Number(position?.shares),
    avgCost: Number(position?.avgCost)
  }))
  .filter((position) =>
    /^[A-Z0-9.-]{1,10}$/.test(position.symbol) &&
    Number.isFinite(position.shares) && position.shares > 0 &&
    Number.isFinite(position.avgCost) && position.avgCost >= 0
  )
  .slice(0, 500);
const cleanLegacyPortfolio = cleanPositions(portfolio);
const cleanPortfolios = Array.isArray(portfolios)
  ? portfolios.slice(0, 20).map((item, index) => ({
      id: String(item?.id || `portfolio-${index}`).slice(0, 80),
      name: String(item?.name || `Portfolio ${index + 1}`).trim().slice(0, 60),
      positions: cleanPositions(item?.positions)
    }))
  : [];
const savedPortfolios = cleanPortfolios.length
  ? cleanPortfolios
  : [{ id: "portfolio-default", name: "My Portfolio", positions: cleanLegacyPortfolio }];
const savedActivePortfolioId = savedPortfolios.some(
  (item) => item.id === String(activePortfolioId || "")
)
  ? String(activePortfolioId)
  : savedPortfolios[0].id;
const cleanNamedWatchlists = Array.isArray(namedWatchlists)
  ? namedWatchlists.slice(0, 20).map((list, index) => ({
      id: String(list?.id || `watchlist-${index}`).slice(0, 80),
      name: String(list?.name || `Watchlist ${index + 1}`).trim().slice(0, 60),
      symbols: cleanSymbols(list?.symbols)
    }))
  : [];
const cleanSavedProjections = cleanProjections(projections);
const hasIncomingData =
  cleanSymbols(watchlist).length > 0 ||
  savedPortfolios.some((item) => item.positions.length > 0) ||
  cleanNamedWatchlists.some((list) => list.symbols.length > 0) ||
  Object.keys(cleanSavedProjections).length > 0;
const hasExistingData =
  (req.user.watchlist || []).length > 0 ||
  (req.user.portfolios || []).some((item) => (item.positions || []).length > 0) ||
  (req.user.namedWatchlists || []).some((list) => (list.symbols || []).length > 0) ||
  Object.keys(req.user.projections || {}).length > 0;

if (!hasIncomingData && hasExistingData) {
  return res.json({
    success: true,
    skippedEmptyOverwrite: true
  });
}

req.user.watchlist = cleanSymbols(watchlist);
req.user.portfolios = savedPortfolios;
req.user.activePortfolioId = savedActivePortfolioId;
req.user.portfolio = savedPortfolios.find(
  (item) => item.id === savedActivePortfolioId
)?.positions || [];
req.user.namedWatchlists = cleanNamedWatchlists;
req.user.projections = cleanSavedProjections;

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
portfolio: req.user.portfolio || [],
portfolios: req.user.portfolios || [],
activePortfolioId: req.user.activePortfolioId || "",
namedWatchlists: req.user.namedWatchlists || [],
projections: req.user.projections || {}
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
