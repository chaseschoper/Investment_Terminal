
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const axios = require("axios");
const cheerio = require("cheerio");
const https = require("https");
const dns = require("dns");
const zlib = require("zlib");
const mongoose = require("mongoose");
const yahooFinance = require("yahoo-finance2").default;
const OpenAI = require("openai");
const { PDFParse } = require("pdf-parse");
const crypto = require("crypto");

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");

const Stock = require("./models/Stock");
const User = require("./models/User");
const EarningsCall = require("./models/EarningsCall");

dns.setDefaultResultOrder("ipv4first");

const app = express();
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;
const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || "";
const groqApiKey = process.env.GROQ_API_KEY || "";
const activeStockFetches = new Set();
const activeFullStockFetches = new Set();
const activeStockFastHydrations = new Map();
const marketActivityQueue = [];
const queuedMarketActivityFetches = new Set();
let marketActivityWorkerRunning = false;
const yahooSupplementalFetches = new Map();
const earningsCallCache = new Map();
const earningsCalendarCache = new Map();
const earningsEstimateCalendarCache = new Map();
const nasdaqEarningsDateCache = new Map();
const marketIndexCache = new Map();
const marketHeatmapCache = new Map();
const broadMarketMoversCache = new Map();
const priceHistoryCache = new Map();
const companyDocumentsCache = new Map();
const companyDocumentsInFlight = new Map();
const stockSearchCache = new Map();
const stockScreenerCache = new Map();
const stockScreenerOptionsCache = new Map();
const fmpCalendarCache = new Map();
const treasuryRatesCache = new Map();
const fmpNewsCache = new Map();
const earningsCallPeriodsCache = new Map();
const earningsCallTranscriptCache = new Map();
const similarCompanyMetricCache = new Map();
const fmpDataCache = new Map();
const fmpDataInFlight = new Map();
const FMP_DATA_CACHE_TTL_MS = 10 * 60 * 1000;
const fmpMarketActivityCache = new Map();
const marketBeatAnalystCache = new Map();
const secInsiderTransactionCache = new Map();
const epsSurpriseCache = new Map();
const stockAnalysisValuationCache = new Map();
const stockAnalysisHistoricalPeCache = new Map();
let stockAnalysisEarningsCalendarPageCache = null;
const sp500ConstituentsCache = new Map();
const etfDataCache = new Map();
const mrRallyExternalMetricCache = new Map();
const mrRallyStatementCache = new Map();
const mrRallyWebContextCache = new Map();
const fxRateCache = new Map();
const alphaVantageFundamentalCache = new Map();
const FINANCIAL_HISTORY_VERSION = 154;
const STOCK_ESTIMATE_VERSION = 23;
const INTERIM_HISTORY_VERSION = 6;
const MIN_USABLE_INTERIM_HISTORY_ROWS = 8;
const BALANCE_SHEET_METRICS_VERSION = 14;
const VALUATION_METRICS_VERSION = 23;
const FOREIGN_CURRENCY_CONVERSION_VERSION = 2;
const EARNINGS_CALL_VERSION = 18;
const FMP_VALUATION_METRIC_FIELDS = [
  "pe",
  "forwardPE",
  "forwardPS",
  "priceToSales",
  "priceToBook",
  "bookValuePerShare",
  "priceToTangibleBook",
  "priceToFreeCashflow",
  "priceToOperatingCashflow",
  "pegRatio",
  "forwardPegRatio",
  "priceToFairValue",
  "enterpriseValue",
  "evToSales",
  "evToEbitda",
  "evToOperatingCashflow",
  "evToFreeCashflow",
  "netDebtToEbitda",
  "fcfYield",
  "earningsYield",
  "grahamNumber",
  "grahamNetNet",
  "currentRatio",
  "quickRatio",
  "cashRatio",
  "debtToEquity",
  "debtToAssets",
  "debtToCapital",
  "debtToMarketCap",
  "longTermDebtToCapital",
  "financialLeverage",
  "interestCoverage",
  "debtServiceCoverage",
  "operatingCashflowCoverage",
  "shortTermOperatingCashflowCoverage",
  "operatingCashflowRatio",
  "solvencyRatio",
  "interestDebtPerShare",
  "dividendYieldTtm",
  "dividendPayoutRatio",
  "dividendPerShare",
  "incomeQuality",
  "assetTurnover",
  "fixedAssetTurnover",
  "inventoryTurnover",
  "receivablesTurnover",
  "payablesTurnover",
  "workingCapitalTurnover",
  "cashConversionCycle",
  "daysSalesOutstanding",
  "daysPayablesOutstanding",
  "daysInventoryOutstanding",
  "operatingCycle",
  "averageInventory",
  "averagePayables",
  "averageReceivables",
  "rdToRevenue",
  "sgaToRevenue",
  "stockBasedCompToRevenue",
  "capexToRevenue",
  "capexToOperatingCashflow",
  "capexToDepreciation",
  "capexPerShare",
  "capitalExpenditureCoverage",
  "dividendPaidAndCapexCoverage",
  "effectiveTaxRate",
  "taxBurden",
  "interestBurden",
  "ebtPerEbit",
  "netIncomePerEbt",
  "revenueGrowth",
  "earningsGrowth",
  "freeCashflowGrowth",
  "operatingCashflowGrowth",
  "ebitdaGrowth",
  "debtGrowth",
  "threeYearRevenueGrowthPerShare",
  "fiveYearRevenueGrowthPerShare",
  "threeYearNetIncomeGrowthPerShare",
  "fiveYearNetIncomeGrowthPerShare",
  "grossMargins",
  "operatingMargins",
  "profitMargins",
  "pretaxMargin",
  "ebitdaMargin",
  "ebitMargin",
  "fcfMargin",
  "bottomLineProfitMargin",
  "continuousOperationsProfitMargin",
  "operatingCashflowSalesRatio",
  "freeCashflowOperatingCashflowRatio",
  "returnOnEquity",
  "returnOnAssets",
  "operatingReturnOnAssets",
  "returnOnInvestedCapital",
  "returnOnCapitalEmployed",
  "returnOnTangibleAssets",
  "revenuePerEmployee",
  "profitsPerEmployee",
  "employeeCount",
  "revenuePerShare",
  "netIncomePerShare",
  "cashPerShare",
  "freeCashflowPerShare",
  "operatingCashflowPerShare",
  "tangibleBookValuePerShare",
  "targetMean",
  "freeCashflow",
  "operatingCashflow",
  "freeCashflowToEquity",
  "freeCashflowToFirm",
  "investedCapital",
  "tangibleAssetValue",
  "netCurrentAssetValue",
  "intangiblesToTotalAssets"
];
const FMP_BALANCE_SHEET_METRIC_FIELDS = [
  "totalCash",
  "totalDebt",
  "cashAndCashEquivalents",
  "netCash",
  "netCashPerShare",
  "equityBookValue",
  "bookValuePerShare",
  "workingCapital"
];
const FMP_MARKET_METRIC_FIELDS = [
  "marketCap",
  "sharesOutstanding",
  "fiftyTwoWeekHigh",
  "fiftyTwoWeekLow",
  "priceAvg50",
  "priceAvg200"
];
const FMP_METRIC_CARD_FIELDS = [
  ...FMP_VALUATION_METRIC_FIELDS,
  ...FMP_BALANCE_SHEET_METRIC_FIELDS,
  ...FMP_MARKET_METRIC_FIELDS
];
const STOCK_ANALYSIS_VALUATION_FIELDS = FMP_VALUATION_METRIC_FIELDS;
const FMP_TEXT_METRIC_FIELDS = [
  "recommendationKey",
  "analystRatingText"
];
const FINANCIAL_STATEMENT_ENDPOINTS = {
  income: {
    label: "Income Statement",
    path: "income-statement",
    fields: [
      "revenue",
      "costOfRevenue",
      "grossProfit",
      "grossProfitRatio",
      "researchAndDevelopmentExpenses",
      "generalAndAdministrativeExpenses",
      "sellingAndMarketingExpenses",
      "sellingGeneralAndAdministrativeExpenses",
      "operatingExpenses",
      "operatingIncome",
      "operatingIncomeRatio",
      "interestIncome",
      "interestExpense",
      "incomeBeforeTax",
      "incomeBeforeTaxRatio",
      "incomeTaxExpense",
      "netIncome",
      "netIncomeRatio",
      "eps",
      "epsDiluted",
      "weightedAverageShsOut",
      "weightedAverageShsOutDil",
      "ebitda",
      "ebitdaratio"
    ]
  },
  balance: {
    label: "Balance Sheet",
    path: "balance-sheet-statement",
    fields: [
      "cashAndCashEquivalents",
      "shortTermInvestments",
      "cashAndShortTermInvestments",
      "netReceivables",
      "inventory",
      "otherCurrentAssets",
      "totalCurrentAssets",
      "propertyPlantEquipmentNet",
      "goodwill",
      "intangibleAssets",
      "longTermInvestments",
      "taxAssets",
      "otherNonCurrentAssets",
      "totalNonCurrentAssets",
      "totalAssets",
      "accountPayables",
      "shortTermDebt",
      "taxPayables",
      "deferredRevenue",
      "otherCurrentLiabilities",
      "totalCurrentLiabilities",
      "longTermDebt",
      "deferredRevenueNonCurrent",
      "deferredTaxLiabilitiesNonCurrent",
      "otherNonCurrentLiabilities",
      "totalNonCurrentLiabilities",
      "totalLiabilities",
      "preferredStock",
      "commonStock",
      "retainedEarnings",
      "accumulatedOtherComprehensiveIncomeLoss",
      "othertotalStockholdersEquity",
      "totalStockholdersEquity",
      "totalEquity",
      "totalLiabilitiesAndStockholdersEquity",
      "minorityInterest",
      "totalLiabilitiesAndTotalEquity",
      "totalInvestments",
      "totalDebt",
      "netDebt"
    ]
  },
  cashflow: {
    label: "Cash Flow Statement",
    path: "cash-flow-statement",
    fields: [
      "netIncome",
      "depreciationAndAmortization",
      "deferredIncomeTax",
      "stockBasedCompensation",
      "changeInWorkingCapital",
      "accountsReceivables",
      "inventory",
      "accountsPayables",
      "otherWorkingCapital",
      "otherNonCashItems",
      "netCashProvidedByOperatingActivities",
      "operatingCashFlow",
      "investmentsInPropertyPlantAndEquipment",
      "acquisitionsNet",
      "purchasesOfInvestments",
      "salesMaturitiesOfInvestments",
      "otherInvestingActivites",
      "netCashUsedForInvestingActivites",
      "debtRepayment",
      "commonStockIssued",
      "commonStockRepurchased",
      "dividendsPaid",
      "otherFinancingActivites",
      "netCashUsedProvidedByFinancingActivities",
      "effectOfForexChangesOnCash",
      "netChangeInCash",
      "cashAtEndOfPeriod",
      "cashAtBeginningOfPeriod",
      "capitalExpenditure",
      "freeCashFlow"
    ]
  }
};
const FINANCIAL_STATEMENT_META_FIELDS = new Set([
  "date",
  "symbol",
  "reportedCurrency",
  "cik",
  "fillingDate",
  "filingDate",
  "acceptedDate",
  "calendarYear",
  "fiscalYear",
  "period",
  "link",
  "finalLink"
]);
const STOCK_FULL_REFRESH_MS = 30 * 60 * 1000;
const STOCK_FAILED_RETRY_MS = 30 * 1000;
const MR_RALLY_AI_TIMEOUT_MS = 12000;
const MR_RALLY_FAST_CONTEXT_TIMEOUT_MS = 3000;
const MR_RALLY_WEB_CONTEXT_TIMEOUT_MS = 6000;
const MR_RALLY_COMPANY_LOOKUP_TIMEOUT_MS = 2500;
const STOCK_PROVIDER_TIMEOUT_MS = 8000;
const STOCK_SLOW_PROVIDER_TIMEOUT_MS = 10000;
const STOCK_FAST_CHART_HYDRATION_WAIT_MS = 2400;
const STOCK_INITIAL_SEC_TIMEOUT_MS = 9000;
const secMarginCache = new Map();
const yearEndPriceCache = new Map();
const livePriceCache = new Map();
const activePriceRefreshes = new Set();
let marketIndexRefreshPromise = null;
let marketHeatmapRefreshPromise = null;
let yahooCooldownUntil = 0;
let yahooQuoteSummaryCooldownUntil = 0;
let yahooEarningsTrendCooldownUntil = 0;
let yahooAnalysisPageCooldownUntil = 0;
let fmpCooldownUntil = 0;
let stockAnalysisCooldownUntil = 0;
let secTickerMapPromise;
let secTickerMapRetryAfter = 0;
const COMMON_SEC_CIKS = new Map(Object.entries({
  AAPL: "0000320193",
  MSFT: "0000789019",
  NVDA: "0001045810",
  AMD: "0000002488",
  AMZN: "0001018724",
  GOOGL: "0001652044",
  GOOG: "0001652044",
  META: "0001326801",
  TSLA: "0001318605",
  TSM: "0001046179",
  BRK_B: "0001067983",
  "BRK-B": "0001067983",
  "BRK.B": "0001067983",
  BRK_A: "0001067983",
  "BRK-A": "0001067983",
  "BRK.A": "0001067983",
  CRM: "0001108524",
  ORCL: "0001341439",
  NFLX: "0001065280",
  COST: "0000909832",
  HD: "0000354950",
  NKE: "0000320187",
  FDX: "0001048911",
  CAKE: "0000887596",
  ELF: "0001600033",
  CELH: "0001341766",
  CCL: "0000815097"
}));
const TICKER_ALIASES = {
  ADVANCEDMICRODEVICES: "AMD",
  ALPHABET: "GOOGL",
  AMAZON: "AMZN",
  APPLE: "AAPL",
  CARNIVAL: "CCL",
  CELSIUS: "CELH",
  CHEESECAKEFACTORY: "CAKE",
  COSTCO: "COST",
  FEDEX: "FDX",
  GOOGLE: "GOOGL",
  HOMEDEPOT: "HD",
  MCDONALDS: "MCD",
  META: "META",
  MICROSOFT: "MSFT",
  NVIDIA: "NVDA",
  "BRK.B": "BRK-B",
  BRK_B: "BRK-B",
  BRKB: "BRK-B",
  ZILLOW: "Z",
  SALESFORCE: "CRM",
  NIKE: "NKE",
  TESLA: "TSLA",
  WALMART: "WMT"
};

const FALLBACK_SIMILAR_COMPANIES = {
  AAPL: ["MSFT", "GOOGL", "META", "AMZN", "DELL", "HPQ"],
  AMD: ["NVDA", "INTC", "QCOM", "AVGO", "MU", "TSM"],
  AMZN: ["WMT", "COST", "TGT", "EBAY", "SHOP", "MELI"],
  AZO: ["ORLY", "AAP", "GPC", "LKQ", "KMX"],
  BRK_B: ["JPM", "BAC", "AXP", "CB", "AIG", "BLK"],
  CAKE: ["DRI", "TXRH", "EAT", "BJRI", "BLMN"],
  CCL: ["RCL", "NCLH", "MAR", "HLT", "EXPE"],
  CELH: ["MNST", "PEP", "KO", "KDP", "STZ"],
  CRM: ["MSFT", "ORCL", "NOW", "ADBE", "SAP"],
  ELF: ["ULTA", "COTY", "EL", "PG", "CL"],
  HD: ["LOW", "WMT", "TGT", "COST", "TSCO"],
  MSFT: ["GOOGL", "AMZN", "ORCL", "CRM", "ADBE", "IBM"],
  NKE: ["LULU", "DECK", "ONON", "UAA", "ADDYY"],
  NVDA: ["AMD", "AVGO", "INTC", "QCOM", "MU", "TSM"],
  SNOW: ["DDOG", "MDB", "PLTR", "NET", "CRM"],
  TMO: ["DHR", "A", "MTD", "WAT", "ILMN"],
  TSLA: ["RIVN", "GM", "F", "LCID", "NIO"],
  WMT: ["COST", "TGT", "AMZN", "DG", "DLTR"]
};

const FALLBACK_COMPANY_NAMES = {
  A: "Agilent Technologies",
  AAP: "Advance Auto Parts",
  AAPL: "Apple",
  ADBE: "Adobe",
  ADDYY: "Adidas",
  AIG: "AIG",
  AMD: "Advanced Micro Devices",
  AMZN: "Amazon",
  AVGO: "Broadcom",
  AXP: "American Express",
  AZO: "AutoZone",
  BAC: "Bank of America",
  BJRI: "BJ's Restaurants",
  BLK: "BlackRock",
  BLMN: "Bloomin' Brands",
  CB: "Chubb",
  CL: "Colgate-Palmolive",
  COST: "Costco",
  COTY: "Coty",
  CRM: "Salesforce",
  DDOG: "Datadog",
  DECK: "Deckers Outdoor",
  DELL: "Dell Technologies",
  DG: "Dollar General",
  DHR: "Danaher",
  DLTR: "Dollar Tree",
  DRI: "Darden Restaurants",
  EAT: "Brinker International",
  EBAY: "eBay",
  EL: "Estee Lauder",
  EXPE: "Expedia",
  F: "Ford",
  GM: "General Motors",
  GOOGL: "Alphabet",
  GPC: "Genuine Parts",
  HD: "Home Depot",
  HLT: "Hilton",
  HPQ: "HP",
  IBM: "IBM",
  ILMN: "Illumina",
  INTC: "Intel",
  JPM: "JPMorgan Chase",
  KDP: "Keurig Dr Pepper",
  KMX: "CarMax",
  KO: "Coca-Cola",
  LCID: "Lucid",
  LKQ: "LKQ",
  LOW: "Lowe's",
  LULU: "Lululemon",
  MAR: "Marriott",
  MDB: "MongoDB",
  MELI: "MercadoLibre",
  META: "Meta Platforms",
  MNST: "Monster Beverage",
  MSFT: "Microsoft",
  MTD: "Mettler-Toledo",
  MU: "Micron Technology",
  NCLH: "Norwegian Cruise Line",
  NET: "Cloudflare",
  NIO: "NIO",
  NOW: "ServiceNow",
  NVDA: "Nvidia",
  ONON: "On Holding",
  ORCL: "Oracle",
  ORLY: "O'Reilly Automotive",
  PEP: "PepsiCo",
  PG: "Procter & Gamble",
  PLTR: "Palantir",
  QCOM: "Qualcomm",
  RCL: "Royal Caribbean",
  RIVN: "Rivian",
  SAP: "SAP",
  SHOP: "Shopify",
  STZ: "Constellation Brands",
  TGT: "Target",
  TMO: "Thermo Fisher Scientific",
  TSCO: "Tractor Supply",
  TSM: "Taiwan Semiconductor",
  TXRH: "Texas Roadhouse",
  UAA: "Under Armour",
  ULTA: "Ulta Beauty",
  WAT: "Waters",
  WMT: "Walmart"
};

const FOREIGN_ADR_CONFIG = {
  TSM: {
    sourceCurrency: "TWD",
    displayCurrency: "USD",
    adrRatio: 5,
    stockAnalysisPath: "quote/tpe/2330",
    localSymbols: ["2330.TW"],
    fallbackUsdRate: 0.031
  },
  TM: {
    sourceCurrency: "JPY",
    displayCurrency: "USD",
    adrRatio: 10,
    stockAnalysisPath: "quote/tyo/7203",
    localSymbols: ["7203.T"],
    fallbackUsdRate: 0.0068
  },
  SKHYV: {
    sourceCurrency: "KRW",
    displayCurrency: "USD",
    adrRatio: 1,
    stockAnalysisPath: "quote/krx/000660",
    localSymbols: ["000660.KS"],
    fallbackUsdRate: 0.00069,
    marketCapMultiplier: 1000,
    recomputeEpsFromConvertedEarnings: true
  },
  SKHY: {
    sourceCurrency: "KRW",
    displayCurrency: "USD",
    adrRatio: 1,
    stockAnalysisPath: "quote/krx/000660",
    localSymbols: ["000660.KS"],
    fallbackUsdRate: 0.00069,
    marketCapMultiplier: 1000,
    recomputeEpsFromConvertedEarnings: true
  }
};

const EARNINGS_DATE_OVERRIDES = {
  NVDA: {
    "2027:2": "2026-08-26"
  }
};

const COMPANY_NAME_ALIASES = {
  "advanced micro devices": "AMD",
  "alphabet": "GOOGL",
  "amazon": "AMZN",
  "apple": "AAPL",
  "carnival": "CCL",
  "celsius": "CELH",
  "celsius holdings": "CELH",
  "cheesecake factory": "CAKE",
  "the cheesecake factory": "CAKE",
  "costco": "COST",
  "fedex": "FDX",
  "google": "GOOGL",
  "home depot": "HD",
  "mcdonalds": "MCD",
  "mcdonald's": "MCD",
  "meta": "META",
  "microsoft": "MSFT",
  "nike": "NKE",
  "nvidia": "NVDA",
  "salesforce": "CRM",
  "snowflake": "SNOW",
  "tesla": "TSLA",
  "walmart": "WMT"
};

function parseRequestedEarningsPeriod(query = {}) {
  const rawYear = Number(query.year);
  const rawQuarter = String(query.quarter || "").toUpperCase().replace(/^Q/, "");
  const quarter = Number(rawQuarter);
  if (!Number.isInteger(rawYear) || rawYear < 1990 || rawYear > 2100) return null;
  if (!Number.isInteger(quarter) || quarter < 1 || quarter > 4) return null;
  return { year: rawYear, quarter };
}
const KNOWN_COMPANY_WEBSITES = {
  NVDA: "https://nvidianews.nvidia.com/",
  TXN: "https://www.ti.com"
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
  { key: "sp500", label: "S&P 500", yahooSymbol: "^GSPC", fmpSymbol: "^GSPC", futuresSymbol: "ES=F", fmpFuturesSymbol: "ESUSD", investingPath: "us-spx-500", stockAnalysisLabel: "S&P500" },
  { key: "dow", label: "Dow Jones", yahooSymbol: "^DJI", fmpSymbol: "^DJI", futuresSymbol: "YM=F", fmpFuturesSymbol: "YMUSD", investingPath: "us-30", stockAnalysisLabel: "Dow Jones" },
  { key: "nasdaq", label: "Nasdaq", yahooSymbol: "^NDX", fmpSymbol: "^IXIC", futuresSymbol: "NQ=F", fmpFuturesSymbol: "NQUSD", investingPath: "nq-100", stockAnalysisLabel: "Nasdaq" },
  { key: "russell2000", label: "Russell 2000", yahooSymbol: "^RUT", fmpSymbol: "^RUT", futuresSymbol: "RTY=F", fmpFuturesSymbol: "RTYUSD", investingPath: "smallcap-2000", stockAnalysisLabel: "Russell 2000" }
];

const SP500_HEATMAP_COMPANIES = [
  { symbol: "AAPL", name: "Apple", sector: "Technology", weight: 7.1 },
  { symbol: "MSFT", name: "Microsoft", sector: "Technology", weight: 6.8 },
  { symbol: "NVDA", name: "NVIDIA", sector: "Technology", weight: 6.4 },
  { symbol: "AVGO", name: "Broadcom", sector: "Technology", weight: 2.2 },
  { symbol: "ORCL", name: "Oracle", sector: "Technology", weight: 1.2 },
  { symbol: "CRM", name: "Salesforce", sector: "Technology", weight: 0.8 },
  { symbol: "AMD", name: "AMD", sector: "Technology", weight: 0.8 },
  { symbol: "ADBE", name: "Adobe", sector: "Technology", weight: 0.6 },
  { symbol: "GOOGL", name: "Alphabet", sector: "Communication", weight: 3.7 },
  { symbol: "META", name: "Meta", sector: "Communication", weight: 2.6 },
  { symbol: "NFLX", name: "Netflix", sector: "Communication", weight: 0.8 },
  { symbol: "DIS", name: "Disney", sector: "Communication", weight: 0.5 },
  { symbol: "AMZN", name: "Amazon", sector: "Consumer Cyclical", weight: 3.8 },
  { symbol: "TSLA", name: "Tesla", sector: "Consumer Cyclical", weight: 1.5 },
  { symbol: "HD", name: "Home Depot", sector: "Consumer Cyclical", weight: 0.9 },
  { symbol: "MCD", name: "McDonald's", sector: "Consumer Cyclical", weight: 0.6 },
  { symbol: "NKE", name: "Nike", sector: "Consumer Cyclical", weight: 0.3 },
  { symbol: "WMT", name: "Walmart", sector: "Consumer Defensive", weight: 0.9 },
  { symbol: "COST", name: "Costco", sector: "Consumer Defensive", weight: 0.8 },
  { symbol: "PG", name: "Procter & Gamble", sector: "Consumer Defensive", weight: 0.7 },
  { symbol: "KO", name: "Coca-Cola", sector: "Consumer Defensive", weight: 0.6 },
  { symbol: "PEP", name: "PepsiCo", sector: "Consumer Defensive", weight: 0.5 },
  { symbol: "JPM", name: "JPMorgan Chase", sector: "Financials", weight: 1.4 },
  { symbol: "V", name: "Visa", sector: "Financials", weight: 1.0 },
  { symbol: "MA", name: "Mastercard", sector: "Financials", weight: 0.9 },
  { symbol: "BAC", name: "Bank of America", sector: "Financials", weight: 0.5 },
  { symbol: "WFC", name: "Wells Fargo", sector: "Financials", weight: 0.4 },
  { symbol: "BRK-B", name: "Berkshire Hathaway", sector: "Financials", weight: 1.7 },
  { symbol: "LLY", name: "Eli Lilly", sector: "Healthcare", weight: 1.8 },
  { symbol: "UNH", name: "UnitedHealth", sector: "Healthcare", weight: 1.0 },
  { symbol: "JNJ", name: "Johnson & Johnson", sector: "Healthcare", weight: 0.7 },
  { symbol: "ABBV", name: "AbbVie", sector: "Healthcare", weight: 0.7 },
  { symbol: "MRK", name: "Merck", sector: "Healthcare", weight: 0.5 },
  { symbol: "TMO", name: "Thermo Fisher", sector: "Healthcare", weight: 0.4 },
  { symbol: "GE", name: "GE Aerospace", sector: "Industrials", weight: 0.8 },
  { symbol: "CAT", name: "Caterpillar", sector: "Industrials", weight: 0.5 },
  { symbol: "RTX", name: "RTX", sector: "Industrials", weight: 0.4 },
  { symbol: "HON", name: "Honeywell", sector: "Industrials", weight: 0.4 },
  { symbol: "BA", name: "Boeing", sector: "Industrials", weight: 0.3 },
  { symbol: "LIN", name: "Linde", sector: "Materials", weight: 0.7 },
  { symbol: "SHW", name: "Sherwin-Williams", sector: "Materials", weight: 0.3 },
  { symbol: "FCX", name: "Freeport-McMoRan", sector: "Materials", weight: 0.2 },
  { symbol: "XOM", name: "Exxon Mobil", sector: "Energy", weight: 1.0 },
  { symbol: "CVX", name: "Chevron", sector: "Energy", weight: 0.6 },
  { symbol: "COP", name: "ConocoPhillips", sector: "Energy", weight: 0.3 },
  { symbol: "NEE", name: "NextEra Energy", sector: "Utilities", weight: 0.3 },
  { symbol: "SO", name: "Southern", sector: "Utilities", weight: 0.2 },
  { symbol: "AMT", name: "American Tower", sector: "Real Estate", weight: 0.3 },
  { symbol: "PLD", name: "Prologis", sector: "Real Estate", weight: 0.3 }
];

const normalizeSp500Symbol = (symbol) =>
  String(symbol || "").trim().toUpperCase().replace(/\./g, "-");

async function fetchSp500Constituents() {
  const cached = sp500ConstituentsCache.get("current");
  if (
    cached &&
    Array.isArray(cached.companies) &&
    cached.companies.length >= 450 &&
    Date.now() - cached.fetchedAt < 24 * 60 * 60 * 1000
  ) {
    return cached.companies;
  }

  const normalizeConstituentRows = (rows = []) => {
    const companies = rows
      .map((row) => ({
        symbol: normalizeSp500Symbol(row.symbol),
        name: String(row.name || "").trim(),
        sector: String(row.sector || "").trim() || "Other",
        industry: String(row.industry || "").trim(),
        weight: 1
      }))
      .filter((company) => company.symbol && company.name);
    const bySymbol = new Map(companies.map((company) => [company.symbol, company]));
    return [...bySymbol.values()];
  };

  const parseCsvLine = (line = "") => {
    const values = [];
    let current = "";
    let inQuotes = false;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      const next = line[index + 1];
      if (char === "\"" && inQuotes && next === "\"") {
        current += "\"";
        index += 1;
      } else if (char === "\"") {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        values.push(current);
        current = "";
      } else {
        current += char;
      }
    }
    values.push(current);
    return values.map((value) => value.trim());
  };

  try {
    const { data } = await axios.get("https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv", {
      headers: {
        "User-Agent": "Mozilla/5.0 AppleWebKit/537.36 Chrome/124 Safari/537.36",
        Accept: "text/csv,*/*;q=0.8"
      },
      timeout: 1200
    });
    const lines = String(data || "").split(/\r?\n/).filter(Boolean);
    const headers = parseCsvLine(lines.shift() || "").map((header) => header.toLowerCase());
    const rows = lines.map((line) => {
      const values = parseCsvLine(line);
      const valueFor = (name) => values[headers.indexOf(name)] || "";
      return {
        symbol: valueFor("symbol"),
        name: valueFor("name"),
        sector: valueFor("sector"),
        industry: valueFor("sub-industry")
      };
    });
    const companies = normalizeConstituentRows(rows);
    if (companies.length >= 450) {
      sp500ConstituentsCache.set("current", { companies, fetchedAt: Date.now() });
      return companies;
    }
  } catch (err) {
    console.log("S&P 500 CSV constituents skipped:", err.response?.status || err.message);
  }

  try {
    const { data } = await axios.get("https://en.wikipedia.org/wiki/List_of_S%26P_500_companies", {
      headers: {
        "User-Agent": "Mozilla/5.0 AppleWebKit/537.36 Chrome/124 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      },
      timeout: 1200
    });
    const $ = cheerio.load(data || "");
    const rows = [];

    $("#constituents tbody tr").each((_, row) => {
      const cells = $(row).find("td");
      const symbol = normalizeSp500Symbol(cells.eq(0).text());
      const name = cells.eq(1).text().trim();
      const sector = cells.eq(2).text().trim() || "Other";
      const industry = cells.eq(3).text().trim() || "";
      rows.push({ symbol, name, sector, industry });
    });

    const companies = normalizeConstituentRows(rows);
    if (companies.length >= 450) {
      sp500ConstituentsCache.set("current", { companies, fetchedAt: Date.now() });
      return companies;
    }
  } catch (err) {
    console.log("S&P 500 constituents skipped:", err.response?.status || err.message);
  }

  return SP500_HEATMAP_COMPANIES;
}

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

const YAHOO_CHART_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "application/json,text/plain,*/*",
  "Accept-Language": "en-US,en;q=0.9"
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

const toSafeUser = (user) => {
  const plainUser = user?.toObject ? user.toObject() : { ...(user || {}) };
  delete plainUser.password;
  delete plainUser.passwordResetToken;
  delete plainUser.passwordResetExpires;
  return plainUser;
};

const createAuthResponse = (user) => ({
  success: true,
  token: jwt.sign(
    { id: user._id },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  ),
  user: toSafeUser(user)
});

const hashPasswordResetToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

const getFrontendUrl = (req) =>
  process.env.FRONTEND_URL ||
  process.env.CLIENT_URL ||
  req.get("origin") ||
  "http://localhost:5173";

const buildPasswordResetEmail = (resetUrl) => ({
  subject: "Reset your MrktRally password",
  text: `Use this link to reset your MrktRally password. It expires in 1 hour:\n\n${resetUrl}`,
  html: `<p>Use this link to reset your MrktRally password. It expires in 1 hour.</p><p><a href="${resetUrl}">Reset password</a></p>`
});

const sendPasswordResetEmail = async ({ to, resetUrl }) => {
  const email = buildPasswordResetEmail(resetUrl);

  if (process.env.RESEND_API_KEY) {
    await axios.post(
      "https://api.resend.com/emails",
      {
        from: process.env.RESEND_FROM || process.env.SMTP_FROM || "MrktRally <onboarding@resend.dev>",
        to: [to],
        subject: email.subject,
        text: email.text,
        html: email.html
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
          "User-Agent": "MrktRally/1.0"
        },
        timeout: 12000
      }
    );
    return true;
  }

  if (!process.env.SMTP_HOST) return false;

  const port = Number(process.env.SMTP_PORT || 587);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    family: 4,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    auth: process.env.SMTP_USER
      ? {
          user: process.env.SMTP_USER,
          pass: String(process.env.SMTP_PASS || "").replace(/\s/g, "")
        }
      : undefined
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER || "no-reply@mrktrally.com",
    to,
    subject: email.subject,
    text: email.text,
    html: email.html
  });

  return true;
};


// =========================
// FETCH STOCK DATA HELPER
// =========================
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isRateLimitError = (err) => err?.response?.status === 429;
const isTooManyRequestsError = (err) =>
  err?.response?.status === 429 ||
  /too many requests|rate limit/i.test(String(err?.message || "")) ||
  /too many requests|rate limit/i.test(String(err?.response?.data || ""));

function setYahooCooldown(err, label, ticker) {
  if (!isTooManyRequestsError(err)) return;
  yahooCooldownUntil = Math.max(yahooCooldownUntil, Date.now() + 2 * 60 * 1000);
  console.log(`Yahoo cooldown active after ${label}:`, ticker, err.response?.status || err.message);
}

function setYahooQuoteSummaryCooldown(err, label, ticker) {
  if (!isTooManyRequestsError(err)) return;
  yahooQuoteSummaryCooldownUntil = Math.max(yahooQuoteSummaryCooldownUntil, Date.now() + 2 * 60 * 1000);
  console.log(`Yahoo quote summary cooldown active after ${label}:`, ticker, err.response?.status || err.message);
}

function setYahooEarningsTrendCooldown(err, label, ticker) {
  if (!isTooManyRequestsError(err)) return;
  yahooEarningsTrendCooldownUntil = Math.max(yahooEarningsTrendCooldownUntil, Date.now() + 2 * 60 * 1000);
  console.log(`Yahoo earnings trend cooldown active after ${label}:`, ticker, err.response?.status || err.message);
}

function setYahooAnalysisPageCooldown(err, label, ticker) {
  if (!isTooManyRequestsError(err)) return;
  yahooAnalysisPageCooldownUntil = Math.max(yahooAnalysisPageCooldownUntil, Date.now() + 2 * 60 * 1000);
  console.log(`Yahoo analysis page cooldown active after ${label}:`, ticker, err.response?.status || err.message);
}

function setFmpCooldown(err, label, ticker) {
  if (!isTooManyRequestsError(err)) return;
  fmpCooldownUntil = Math.max(fmpCooldownUntil, Date.now() + 10 * 1000);
  console.log(`FMP cooldown active after ${label}:`, ticker, err.response?.status || err.message);
}

function setStockAnalysisCooldown(err, label, ticker) {
  if (!isTooManyRequestsError(err)) return;
  stockAnalysisCooldownUntil = Math.max(stockAnalysisCooldownUntil, Date.now() + 2 * 60 * 1000);
  console.log(`StockAnalysis cooldown active after ${label}:`, ticker, err.response?.status || err.message);
}

const canUseYahoo = () => Date.now() >= yahooCooldownUntil;
const canUseYahooQuoteSummary = () => Date.now() >= yahooQuoteSummaryCooldownUntil;
const canUseYahooEarningsTrend = () => Date.now() >= yahooEarningsTrendCooldownUntil;
const canUseYahooAnalysisPage = () => Date.now() >= yahooAnalysisPageCooldownUntil;
const canUseFmp = () => Date.now() >= fmpCooldownUntil;
const canUseStockAnalysis = () => Date.now() >= stockAnalysisCooldownUntil;

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
  if (!canUseFmp()) return null;

  for (const endpoint of endpoints) {
    const path = endpoint.replace("{ticker}", ticker);
    const separator = path.includes("?") ? "&" : "?";
    const url = `https://financialmodelingprep.com${path}${separator}apikey=${process.env.FMP_API_KEY}`;
    const cacheKey = `${label}:${path}`;
    const cached = fmpDataCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.data;
    if (fmpDataInFlight.has(cacheKey)) {
      const inFlightData = await fmpDataInFlight.get(cacheKey);
      if (inFlightData) return inFlightData;
      continue;
    }

    try {
      const request = axios.get(url, { timeout: 8000 });
      fmpDataInFlight.set(cacheKey, request.then((res) => res.data).catch(() => null));
      const res = await request;
      const data = res.data;
      if (data?.["Error Message"] || data?.error) continue;
      if (Array.isArray(data) && !data.length) continue;
      if (data && typeof data === "object") {
        fmpDataCache.set(cacheKey, {
          data,
          expiresAt: Date.now() + FMP_DATA_CACHE_TTL_MS
        });
        return data;
      }
    } catch (err) {
      setFmpCooldown(err, label, ticker);
      console.log(`FMP ${label} endpoint skipped:`, ticker, err.response?.status || err.message);
      if (!canUseFmp()) return null;
    } finally {
      fmpDataInFlight.delete(cacheKey);
    }
  }

  return null;
}

async function fetchFmpStableQuoteProfile(ticker) {
  const symbol = String(ticker || "").trim().toUpperCase();
  if (!symbol || !process.env.FMP_API_KEY || !canUseFmp()) return {};

  try {
    const [quoteData, profileData] = await Promise.all([
      getFmpData(symbol, "stable quote", [
        "/stable/quote?symbol={ticker}"
      ]),
      getFmpData(symbol, "stable profile", [
        "/stable/profile?symbol={ticker}"
      ])
    ]);
    const quote = Array.isArray(quoteData) ? quoteData[0] || {} : quoteData || {};
    const profile = Array.isArray(profileData) ? profileData[0] || {} : profileData || {};
    const rangeText = firstText(profile.range);
    const rangeMatch = rangeText?.match(/([0-9.,]+)\s*-\s*([0-9.,]+)/);

    return {
      name: firstText(profile.companyName, quote.name, symbol),
      symbol,
      currency: firstText(profile.currency),
      financialCurrency: firstText(profile.currency),
      sector: firstText(profile.sector),
      industry: firstText(profile.industry),
      ceo: firstText(profile.ceo),
      country: firstText(profile.country),
      exchange: firstText(profile.exchange),
      exchangeFullName: firstText(profile.exchangeFullName),
      description: firstText(profile.description),
      website: firstText(profile.website),
      logo: getFinnhubLogoUrl(symbol),
      price: firstFiniteNumber(quote.price, profile.price),
      change: firstFiniteNumber(quote.change, profile.change),
      percentChange: firstFiniteNumber(quote.changePercentage, profile.changePercentage),
      previousClose: firstFiniteNumber(quote.previousClose),
      high: firstFiniteNumber(quote.dayHigh),
      low: firstFiniteNumber(quote.dayLow),
      open: firstFiniteNumber(quote.open),
      volume: firstFiniteNumber(quote.volume, profile.volume),
      marketCap: firstFiniteNumber(quote.marketCap, profile.marketCap),
      fiftyTwoWeekHigh: firstFiniteNumber(quote.yearHigh, rangeMatch ? parseApiNumber(rangeMatch[2]) : null),
      fiftyTwoWeekLow: firstFiniteNumber(quote.yearLow, rangeMatch ? parseApiNumber(rangeMatch[1]) : null),
      priceAvg50: firstFiniteNumber(quote.priceAvg50, profile.priceAvg50),
      priceAvg200: firstFiniteNumber(quote.priceAvg200, profile.priceAvg200),
      beta: firstFiniteNumber(profile.beta),
      lastDividend: firstFiniteNumber(profile.lastDividend),
      employeeCount: firstFiniteNumber(profile.fullTimeEmployees),
      isAdr: profile.isAdr === true || String(profile.isAdr || "").toLowerCase() === "true",
      dividendYield: normalizeDividendYield(profile.lastDividend && quote.price ? profile.lastDividend / quote.price : null),
      fmpProfileSource: "FMP stable quote/profile"
    };
  } catch (err) {
    setFmpCooldown(err, "stable quote/profile", symbol);
    console.log("FMP stable quote/profile skipped:", symbol, err.response?.status || err.message);
    return {};
  }
}

async function fetchFmpSharesFloat(ticker) {
  const symbol = String(ticker || "").trim().toUpperCase();
  if (!symbol || !process.env.FMP_API_KEY || !canUseFmp()) return {};

  try {
    const data = await getFmpData(symbol, "shares float", [
      "/stable/shares-float?symbol={ticker}"
    ]);
    const row = Array.isArray(data) ? data[0] || {} : data || {};
    const floatShares = firstFiniteNumber(row.floatShares);
    const freeFloatPercent = firstFiniteNumber(row.freeFloat);
    return {
      floatShares,
      freeFloatPercent,
      freeFloatShares: floatShares !== null && freeFloatPercent !== null
        ? floatShares * (freeFloatPercent / 100)
        : null,
      floatSharesUpdatedAt: firstText(row.date),
      sharesFloatSource: firstText(row.source) || "FMP shares float"
    };
  } catch (err) {
    setFmpCooldown(err, "shares float", symbol);
    console.log("FMP shares float skipped:", symbol, err.response?.status || err.message);
    return {};
  }
}

async function fetchFmpKeyExecutives(ticker) {
  const symbol = String(ticker || "").trim().toUpperCase();
  if (!symbol || !process.env.FMP_API_KEY || !canUseFmp()) return [];

  try {
    const data = await getFmpData(symbol, "key executives", [
      "/stable/key-executives?symbol={ticker}"
    ]);
    return (Array.isArray(data) ? data : [])
      .filter((row) => row && firstText(row.name))
      .map((row) => ({
        name: firstText(row.name),
        title: firstText(row.title),
        pay: firstFiniteNumber(row.pay),
        currencyPay: firstText(row.currencyPay),
        yearBorn: firstFiniteNumber(row.yearBorn),
        titleSince: firstText(row.titleSince),
        active: row.active === true || String(row.active || "").toLowerCase() === "true"
      }))
      .slice(0, 10);
  } catch (err) {
    setFmpCooldown(err, "key executives", symbol);
    console.log("FMP key executives skipped:", symbol, err.response?.status || err.message);
    return [];
  }
}

async function fetchFmpStableValuationMetrics(ticker) {
  const symbol = String(ticker || "").trim().toUpperCase();
  if (!symbol || !process.env.FMP_API_KEY || !canUseFmp()) return {};

  try {
    const [
      metricsData,
      ratiosData,
      estimatesData,
      growthData,
      cashflowGrowthData,
      cashflowData,
      incomeQuarterData,
      quoteData,
      profileData,
      ratingData,
      priceTargetData
    ] = await Promise.all([
      getFmpData(symbol, "stable key metrics", [
        "/stable/key-metrics-ttm?symbol={ticker}"
      ]),
      getFmpData(symbol, "stable ratios", [
        "/stable/ratios-ttm?symbol={ticker}"
      ]),
      getFmpData(symbol, "stable estimates for valuation", [
        "/stable/analyst-estimates?symbol={ticker}&period=annual&limit=8"
      ]),
      getFmpData(symbol, "stable financial growth", [
        "/stable/financial-growth?symbol={ticker}&period=annual&limit=2"
      ]),
      getFmpData(symbol, "stable cash flow growth", [
        "/stable/cash-flow-statement-growth?symbol={ticker}&period=annual&limit=2"
      ]),
      getFmpData(symbol, "stable cash flow statement for metrics", [
        "/stable/cash-flow-statement?symbol={ticker}&period=quarter&limit=4"
      ]),
      getFmpData(symbol, "stable income statement for metrics", [
        "/stable/income-statement?symbol={ticker}&period=quarter&limit=4"
      ]),
      getFmpData(symbol, "stable quote for valuation metrics", [
        "/stable/quote?symbol={ticker}"
      ]),
      getFmpData(symbol, "stable profile for valuation metrics", [
        "/stable/profile?symbol={ticker}"
      ]),
      getFmpData(symbol, "stable rating snapshot", [
        "/stable/ratings-snapshot?symbol={ticker}"
      ]),
      getFmpData(symbol, "stable price target summary", [
        "/stable/price-target-summary?symbol={ticker}"
      ])
    ]);
    const metrics = Array.isArray(metricsData) ? metricsData[0] || {} : metricsData || {};
    const ratios = Array.isArray(ratiosData) ? ratiosData[0] || {} : ratiosData || {};
    const growth = Array.isArray(growthData) ? growthData[0] || {} : growthData || {};
    const cashflowGrowth = Array.isArray(cashflowGrowthData) ? cashflowGrowthData[0] || {} : cashflowGrowthData || {};
    const cashflowRows = Array.isArray(cashflowData) ? cashflowData : cashflowData ? [cashflowData] : [];
    const incomeQuarterRows = Array.isArray(incomeQuarterData) ? incomeQuarterData : incomeQuarterData ? [incomeQuarterData] : [];
    const cashflow = cashflowRows[0] || {};
    const incomeQuarter = incomeQuarterRows[0] || {};
    const quote = Array.isArray(quoteData) ? quoteData[0] || {} : quoteData || {};
    const profile = Array.isArray(profileData) ? profileData[0] || {} : profileData || {};
    const rating = Array.isArray(ratingData) ? ratingData[0] || {} : ratingData || {};
    const priceTarget = Array.isArray(priceTargetData) ? priceTargetData[0] || {} : priceTargetData || {};
    const estimates = normalizeFmpAnnualEstimateRows(estimatesData, { symbol, maxFutureYears: 6 });
    const annualEstimateRows = normalizeFmpAnnualEstimateBlocks(estimates);
    const currentYearEstimate = estimates[0] || {};
    const nextYearEstimate =
      estimates.find((row) => row !== currentYearEstimate && row.estimateDate > currentYearEstimate.estimateDate) ||
      estimates[1] ||
      {};
    const nextYearEps = toNumberOrNull(nextYearEstimate.epsAvg ?? nextYearEstimate.estimatedEpsAvg);
    const nextRevenue = toNumberOrNull(nextYearEstimate.revenueAvg ?? nextYearEstimate.estimatedRevenueAvg);
    const marketCap = firstFiniteNumber(metrics.marketCap);
    const currentPrice = firstFiniteNumber(
      metrics.stockPrice,
      metrics.price,
      quote.price,
      marketCap && metrics.weightedAverageShsOut
        ? marketCap / metrics.weightedAverageShsOut
        : null
    );
    const percent = (value) => {
      const number = toNumberOrNull(value);
      return number === null ? null : number * 100;
    };
    const tangibleBookValuePerShare = firstFiniteNumber(ratios.tangibleBookValuePerShareTTM);
    const freeCashFlowPerShare = firstFiniteNumber(ratios.freeCashFlowPerShareTTM);
    const revenuePerShare = firstFiniteNumber(ratios.revenuePerShareTTM);
    const netIncomePerShare = firstFiniteNumber(ratios.netIncomePerShareTTM);
    const employeeCount = firstFiniteNumber(profile.fullTimeEmployees, profile.employeeCount, quote.fullTimeEmployees, metrics.fullTimeEmployees);
    const impliedShares =
      marketCap && currentPrice ? marketCap / currentPrice : null;
    const ttmRevenue = revenuePerShare !== null && impliedShares ? revenuePerShare * impliedShares : null;
    const ttmNetIncome = netIncomePerShare !== null && impliedShares ? netIncomePerShare * impliedShares : null;
    const sumFmpRows = (rows, ...fields) =>
      rows.reduce((total, row) => {
        const value = firstFiniteNumber(...fields.map((field) => row?.[field]));
        return value === null ? total : total + value;
      }, 0);
    const ttmStatementRevenue = incomeQuarterRows.length
      ? sumFmpRows(incomeQuarterRows, "revenue")
      : null;
    const ttmStatementFreeCashFlow = cashflowRows.length
      ? sumFmpRows(cashflowRows, "freeCashFlow", "freeCashflow")
      : null;
    const isAdr = profile.isAdr === true || String(profile.isAdr || "").toLowerCase() === "true";

    return {
      isAdr,
      pe: firstFiniteNumber(ratios.priceToEarningsRatioTTM),
      forwardPE: isAdr
        ? null
        : firstFiniteNumber(
          currentPrice && toNumberOrNull(currentYearEstimate.epsAvg ?? currentYearEstimate.estimatedEpsAvg)
          ? currentPrice / toNumberOrNull(currentYearEstimate.epsAvg ?? currentYearEstimate.estimatedEpsAvg)
          : null
        ),
      forwardPS: isAdr
        ? null
        : firstFiniteNumber(
          marketCap && toNumberOrNull(currentYearEstimate.revenueAvg ?? currentYearEstimate.estimatedRevenueAvg)
          ? marketCap / toNumberOrNull(currentYearEstimate.revenueAvg ?? currentYearEstimate.estimatedRevenueAvg)
          : null
        ),
      priceToSales: firstFiniteNumber(ratios.priceToSalesRatioTTM),
      priceToBook: firstFiniteNumber(ratios.priceToBookRatioTTM),
      priceToTangibleBook: isAdr
        ? firstFiniteNumber(ratios.priceToTangibleBookRatioTTM)
        : firstFiniteNumber(
          currentPrice && tangibleBookValuePerShare ? currentPrice / tangibleBookValuePerShare : null,
          ratios.priceToTangibleBookRatioTTM
        ),
      priceToFreeCashflow: firstFiniteNumber(ratios.priceToFreeCashFlowRatioTTM),
      priceToOperatingCashflow: firstFiniteNumber(ratios.priceToOperatingCashFlowRatioTTM),
      pegRatio: firstFiniteNumber(
        ratios.priceToEarningsGrowthRatioTTM
      ),
      enterpriseValue: firstFiniteNumber(metrics.enterpriseValueTTM, ratios.enterpriseValueTTM),
      evToSales: firstFiniteNumber(metrics.evToSalesTTM),
      evToEbitda: firstFiniteNumber(metrics.evToEBITDATTM, ratios.enterpriseValueMultipleTTM),
      evToOperatingCashflow: firstFiniteNumber(metrics.evToOperatingCashFlowTTM),
      evToFreeCashflow: firstFiniteNumber(metrics.evToFreeCashFlowTTM),
      netDebtToEbitda: firstFiniteNumber(metrics.netDebtToEBITDATTM),
      fcfYield: percent(metrics.freeCashFlowYieldTTM),
      earningsYield: percent(metrics.earningsYieldTTM),
      currentRatio: firstFiniteNumber(metrics.currentRatioTTM, ratios.currentRatioTTM),
      quickRatio: firstFiniteNumber(ratios.quickRatioTTM),
      cashRatio: firstFiniteNumber(ratios.cashRatioTTM),
      debtToEquity: firstFiniteNumber(ratios.debtToEquityRatioTTM),
      debtToAssets: firstFiniteNumber(ratios.debtToAssetsRatioTTM),
      debtToCapital: firstFiniteNumber(ratios.debtToCapitalRatioTTM),
      financialLeverage: firstFiniteNumber(ratios.financialLeverageRatioTTM),
      interestCoverage: firstFiniteNumber(ratios.interestCoverageRatioTTM),
      dividendYieldTtm: percent(ratios.dividendYieldTTM),
      dividendPayoutRatio: percent(ratios.dividendPayoutRatioTTM),
      incomeQuality: firstFiniteNumber(metrics.incomeQualityTTM),
      assetTurnover: firstFiniteNumber(ratios.assetTurnoverTTM),
      inventoryTurnover: firstFiniteNumber(ratios.inventoryTurnoverTTM),
      receivablesTurnover: firstFiniteNumber(ratios.receivablesTurnoverTTM),
      payablesTurnover: firstFiniteNumber(ratios.payablesTurnoverTTM),
      cashConversionCycle: firstFiniteNumber(metrics.cashConversionCycleTTM),
      daysSalesOutstanding: firstFiniteNumber(metrics.daysOfSalesOutstandingTTM),
      daysPayablesOutstanding: firstFiniteNumber(metrics.daysOfPayablesOutstandingTTM),
      daysInventoryOutstanding: firstFiniteNumber(metrics.daysOfInventoryOutstandingTTM),
      operatingCycle: firstFiniteNumber(metrics.operatingCycleTTM),
      rdToRevenue: percent(metrics.researchAndDevelopementToRevenueTTM),
      sgaToRevenue: percent(metrics.salesGeneralAndAdministrativeToRevenueTTM),
      stockBasedCompToRevenue: percent(metrics.stockBasedCompensationToRevenueTTM),
      capexToRevenue: percent(metrics.capexToRevenueTTM),
      capexToOperatingCashflow: percent(metrics.capexToOperatingCashFlowTTM),
      capexToDepreciation: percent(metrics.capexToDepreciationTTM),
      effectiveTaxRate: percent(ratios.effectiveTaxRateTTM),
      pretaxMargin: percent(ratios.pretaxProfitMarginTTM),
      ebitdaMargin: percent(ratios.ebitdaMarginTTM),
      ebitMargin: percent(ratios.ebitMarginTTM),
      fcfMargin: firstFiniteNumber(
        freeCashFlowPerShare !== null && revenuePerShare
          ? (freeCashFlowPerShare / revenuePerShare) * 100
          : null,
        ttmStatementRevenue ? (ttmStatementFreeCashFlow / ttmStatementRevenue) * 100 : null
      ),
      returnOnEquity: percent(metrics.returnOnEquityTTM),
      returnOnAssets: percent(metrics.returnOnAssetsTTM),
      returnOnInvestedCapital: percent(metrics.returnOnInvestedCapitalTTM),
      returnOnCapitalEmployed: percent(metrics.returnOnCapitalEmployedTTM),
      grossMargins: percent(ratios.grossProfitMarginTTM),
      operatingMargins: percent(ratios.operatingProfitMarginTTM),
      profitMargins: percent(ratios.netProfitMarginTTM),
      revenueGrowth: percent(growth.revenueGrowth),
      earningsGrowth: percent(
        firstFiniteNumber(growth.netIncomeGrowth, growth.epsgrowth, cashflowGrowth.growthNetIncome)
      ),
      freeCashflowGrowth: percent(firstFiniteNumber(growth.freeCashFlowGrowth, cashflowGrowth.growthFreeCashFlow)),
      operatingCashflowGrowth: percent(firstFiniteNumber(growth.operatingCashFlowGrowth, cashflowGrowth.growthOperatingCashFlow)),
      ebitdaGrowth: percent(growth.ebitdaGrowth),
      debtGrowth: percent(growth.debtGrowth),
      threeYearRevenueGrowthPerShare: percent(growth.threeYRevenueGrowthPerShare),
      fiveYearRevenueGrowthPerShare: percent(growth.fiveYRevenueGrowthPerShare),
      threeYearNetIncomeGrowthPerShare: percent(firstFiniteNumber(growth.threeYNetIncomeGrowthPerShare, growth.threeYBottomLineNetIncomeGrowthPerShare)),
      fiveYearNetIncomeGrowthPerShare: percent(firstFiniteNumber(growth.fiveYNetIncomeGrowthPerShare, growth.fiveYBottomLineNetIncomeGrowthPerShare)),
      freeCashflow: isAdr ? null : firstFiniteNumber(cashflow.freeCashFlow, cashflow.freeCashflow),
      operatingCashflow: isAdr ? null : firstFiniteNumber(
        cashflow.operatingCashFlow,
        cashflow.operatingCashflow,
        cashflow.netCashProvidedByOperatingActivities
      ),
      revenuePerEmployee: isAdr ? null : firstFiniteNumber(
        employeeCount && ttmRevenue !== null ? ttmRevenue / employeeCount : null
      ),
      profitsPerEmployee: isAdr ? null : firstFiniteNumber(
        employeeCount && ttmNetIncome !== null ? ttmNetIncome / employeeCount : null
      ),
      employeeCount,
      bookValuePerShare: isAdr ? null : firstFiniteNumber(ratios.bookValuePerShareTTM),
      workingCapital: isAdr ? null : firstFiniteNumber(metrics.workingCapitalTTM),
      marketCap,
      targetMean: firstFiniteNumber(
        priceTarget.lastMonthAvgPriceTarget,
        priceTarget.lastQuarterAvgPriceTarget,
        priceTarget.lastYearAvgPriceTarget,
        priceTarget.allTimeAvgPriceTarget
      ),
      recommendationKey: normalizeRating(rating.rating),
      analystRatingText: firstText(rating.rating),
      currentYearRevenue: toNumberOrNull(currentYearEstimate.revenueAvg ?? currentYearEstimate.estimatedRevenueAvg),
      currentYearEps: toNumberOrNull(currentYearEstimate.epsAvg ?? currentYearEstimate.estimatedEpsAvg),
      currentYearNetIncome: toNumberOrNull(currentYearEstimate.netIncomeAvg ?? currentYearEstimate.estimatedNetIncomeAvg),
      nextYearRevenue: toNumberOrNull(nextYearEstimate.revenueAvg ?? nextYearEstimate.estimatedRevenueAvg),
      nextYearEps,
      nextYearNetIncome: toNumberOrNull(nextYearEstimate.netIncomeAvg ?? nextYearEstimate.estimatedNetIncomeAvg),
      annualEstimateRows,
      valuationMetricsSource: "FMP stable ratios/key metrics"
    };
  } catch (err) {
    setFmpCooldown(err, "stable valuation metrics", symbol);
    console.log("FMP stable valuation metrics skipped:", symbol, err.response?.status || err.message);
    return {};
  }
}

async function fetchFmpHistoricalPe(ticker) {
  const symbol = String(ticker || "").trim().toUpperCase();
  if (!symbol || !process.env.FMP_API_KEY || !canUseFmp()) return [];

  try {
    const rows = await getFmpData(symbol, "historical PE", [
      "/stable/ratios?symbol={ticker}&period=annual&limit=8"
    ]);
    return (Array.isArray(rows) ? rows : [])
      .map((row) => ({
        year: Number(row.fiscalYear || String(row.date || "").slice(0, 4)),
        period: String(row.fiscalYear || String(row.date || "").slice(0, 4)),
        isInterim: false,
        pe: toNumberOrNull(row.priceToEarningsRatio),
        price: null,
        eps: null,
        source: "FMP annual ratios"
      }))
      .filter((row) => row.year && row.pe !== null && Number.isFinite(row.pe) && Math.abs(row.pe) < 1000)
      .sort((a, b) => a.year - b.year)
      .slice(-7);
  } catch (err) {
    setFmpCooldown(err, "historical PE", symbol);
    console.log("FMP historical PE skipped:", symbol, err.response?.status || err.message);
    return [];
  }
}

async function fetchFmpStableBalanceSheetMetrics(ticker) {
  const symbol = String(ticker || "").trim().toUpperCase();
  if (!symbol || !process.env.FMP_API_KEY || !canUseFmp()) return {};

  try {
    const rows = await getFmpData(symbol, "stable balance sheet", [
      "/stable/balance-sheet-statement?symbol={ticker}&period=quarter&limit=1"
    ]);
    const row = Array.isArray(rows) ? rows[0] || {} : rows || {};
    if (!Object.keys(row).length) return {};
    const shortTermDebt = toNumberOrNull(row.shortTermDebt);
    const longTermDebt = toNumberOrNull(row.longTermDebt);
    const combinedDebt =
      shortTermDebt !== null || longTermDebt !== null
        ? (shortTermDebt || 0) + (longTermDebt || 0)
        : null;
    const totalCash = firstFiniteNumber(
      row.cashAndShortTermInvestments,
      row.cashAndCashEquivalents,
      row.cash
    );
    const totalDebt = firstFiniteNumber(
      row.totalDebt,
      combinedDebt,
      row.longTermDebt
    );
    const shares = firstFiniteNumber(row.commonStockSharesOutstanding, row.weightedAverageShsOutDil);

    return {
      totalCash,
      totalDebt,
      cashAndCashEquivalents: totalCash,
      netCash: totalCash !== null || totalDebt !== null ? (totalCash || 0) - (totalDebt || 0) : null,
      netCashPerShare: shares && (totalCash !== null || totalDebt !== null)
        ? ((totalCash || 0) - (totalDebt || 0)) / shares
        : null,
      equityBookValue: firstFiniteNumber(row.totalStockholdersEquity, row.totalEquity),
      bookValuePerShare: shares && firstFiniteNumber(row.totalStockholdersEquity, row.totalEquity) !== null
        ? firstFiniteNumber(row.totalStockholdersEquity, row.totalEquity) / shares
        : null,
      workingCapital: firstFiniteNumber(row.totalCurrentAssets) !== null || firstFiniteNumber(row.totalCurrentLiabilities) !== null
        ? (firstFiniteNumber(row.totalCurrentAssets) || 0) - (firstFiniteNumber(row.totalCurrentLiabilities) || 0)
        : null,
      balanceSheetAsOf: row.date || row.filingDate || null,
      balanceSheetSource: "FMP stable latest balance sheet"
    };
  } catch (err) {
    setFmpCooldown(err, "stable balance sheet", symbol);
    console.log("FMP stable balance sheet skipped:", symbol, err.response?.status || err.message);
    return {};
  }
}

const firstFmpMetricNumber = (...values) => {
  for (const value of values) {
    const number = toNumberOrNull(value);
    if (number !== null && Number.isFinite(number)) return number;
  }
  return null;
};

const percentFromFmpRatio = (...values) => {
  const value = firstFmpMetricNumber(...values);
  return value === null ? null : value * 100;
};

const firstPositiveFmpMetricNumber = (...values) => {
  for (const value of values) {
    const number = toNumberOrNull(value);
    if (number !== null && Number.isFinite(number) && number > 0) return number;
  }
  return null;
};

const emptyFmpMetricCardFields = () => ({
  ...Object.fromEntries(FMP_METRIC_CARD_FIELDS.map((field) => [field, null])),
  ...Object.fromEntries(FMP_TEXT_METRIC_FIELDS.map((field) => [field, null])),
  balanceSheetAsOf: null,
  balanceSheetSource: null,
  valuationMetricsSource: null,
  metricCardsSource: null
});

function hasFmpMetricCardPayload(metricCards = {}) {
  if (!metricCards || typeof metricCards !== "object" || !Object.keys(metricCards).length) return false;
  return (
    FMP_METRIC_CARD_FIELDS.some((field) => toNumberOrNull(metricCards[field]) !== null) ||
    FMP_TEXT_METRIC_FIELDS.some((field) => firstText(metricCards[field])) ||
    firstText(metricCards.balanceSheetAsOf)
  );
}

function buildFmpMetricCardUpdate(metricCards = {}) {
  const clean = emptyFmpMetricCardFields();
  FMP_VALUATION_METRIC_FIELDS.forEach((field) => {
    clean[field] = toNumberOrNull(metricCards[field]);
  });
  FMP_BALANCE_SHEET_METRIC_FIELDS.forEach((field) => {
    clean[field] = toNumberOrNull(metricCards[field]);
  });
  FMP_MARKET_METRIC_FIELDS.forEach((field) => {
    clean[field] = toNumberOrNull(metricCards[field]);
  });
  FMP_TEXT_METRIC_FIELDS.forEach((field) => {
    clean[field] = firstText(metricCards[field]) || null;
  });

  clean.isAdr = metricCards.isAdr === true;
  clean.balanceSheetAsOf = firstText(metricCards.balanceSheetAsOf) || null;
  clean.balanceSheetSource = firstText(metricCards.balanceSheetSource) || null;
  clean.valuationMetricsSource = "FMP metrics with StockAnalysis PEG";
  clean.metricCardsSource = "FMP metric cards v22";
  clean.valuationMetricsCheckedAt = new Date().toISOString();
  clean.balanceSheetCheckedAt = new Date().toISOString();
  clean.valuationMetricsVersion = VALUATION_METRICS_VERSION;
  clean.balanceSheetMetricsVersion = BALANCE_SHEET_METRICS_VERSION;
  return clean;
}

function applyFmpMetricCards(data = {}, metricCards = {}) {
  if (!hasFmpMetricCardPayload(metricCards)) return data;
  return {
    ...data,
    ...buildFmpMetricCardUpdate(metricCards)
  };
}

function persistFmpMetricCards(ticker, metricCards = {}) {
  const symbol = String(ticker || "").trim().toUpperCase();
  if (!symbol || !hasFmpMetricCardPayload(metricCards)) return;
  const update = buildFmpMetricCardUpdate(metricCards);
  Stock.findOneAndUpdate(
    { ticker: symbol },
    {
      $set: Object.fromEntries(
        Object.entries(update).map(([key, value]) => [`data.${key}`, value])
      )
    }
  ).catch((err) => {
    console.log("FMP-only metric card cache skipped:", symbol, err.message);
  });
}

async function fetchFmpMetricCards(ticker) {
  const symbol = String(ticker || "").trim().toUpperCase();
  if (!symbol || !process.env.FMP_API_KEY || !canUseFmp()) return {};

  try {
    const [
      quoteData,
      profileData,
      ratiosData,
      metricsData,
      balanceData,
      cashflowData,
      incomeData,
      growthData,
      estimatesData,
      ratingData,
      priceTargetData,
      stockAnalysisValuationData
    ] = await Promise.all([
      getFmpData(symbol, "metric cards quote", ["/stable/quote?symbol={ticker}"]),
      getFmpData(symbol, "metric cards profile", ["/stable/profile?symbol={ticker}"]),
      getFmpData(symbol, "metric cards ratios ttm", ["/stable/ratios-ttm?symbol={ticker}"]),
      getFmpData(symbol, "metric cards key metrics ttm", ["/stable/key-metrics-ttm?symbol={ticker}"]),
      getFmpData(symbol, "metric cards balance sheet quarter", ["/stable/balance-sheet-statement?symbol={ticker}&period=quarter&limit=1"]),
      getFmpData(symbol, "metric cards cash flow quarter", ["/stable/cash-flow-statement?symbol={ticker}&period=quarter&limit=4"]),
      getFmpData(symbol, "metric cards income quarter", ["/stable/income-statement?symbol={ticker}&period=quarter&limit=4"]),
      getFmpData(symbol, "metric cards annual growth", ["/stable/financial-growth?symbol={ticker}&period=annual&limit=2"]),
      getFmpData(symbol, "metric cards analyst estimates", ["/stable/analyst-estimates?symbol={ticker}&period=annual&limit=10"]),
      getFmpData(symbol, "metric cards rating snapshot", ["/stable/ratings-snapshot?symbol={ticker}"]),
      getFmpData(symbol, "metric cards price target summary", ["/stable/price-target-summary?symbol={ticker}"]),
      resolveWithin(fetchStockAnalysisValuationMetrics(symbol), 2200, {})
    ]);

    const quote = Array.isArray(quoteData) ? quoteData[0] || {} : quoteData || {};
    const profile = Array.isArray(profileData) ? profileData[0] || {} : profileData || {};
    const ratios = Array.isArray(ratiosData) ? ratiosData[0] || {} : ratiosData || {};
    const metrics = Array.isArray(metricsData) ? metricsData[0] || {} : metricsData || {};
    const balance = Array.isArray(balanceData) ? balanceData[0] || {} : balanceData || {};
    const cashflowRows = Array.isArray(cashflowData) ? cashflowData : cashflowData ? [cashflowData] : [];
    const incomeRows = Array.isArray(incomeData) ? incomeData : incomeData ? [incomeData] : [];
    const cashflow = cashflowRows[0] || {};
    const income = incomeRows[0] || {};
    const growth = Array.isArray(growthData) ? growthData[0] || {} : growthData || {};
    const rating = Array.isArray(ratingData) ? ratingData[0] || {} : ratingData || {};
    const priceTarget = Array.isArray(priceTargetData) ? priceTargetData[0] || {} : priceTargetData || {};
    const stockAnalysisValuation = stockAnalysisValuationData || {};
    const estimates = normalizeFmpAnnualEstimateRows(estimatesData, { symbol, maxFutureYears: 6 });
    const currentYearEstimate = estimates[0] || {};

    const price = firstFmpMetricNumber(quote.price, metrics.stockPrice, metrics.price);
    const marketCap = firstFmpMetricNumber(quote.marketCap, profile.marketCap, metrics.marketCap);
    const impliedShares = marketCap !== null && price ? marketCap / price : null;
    const statementShares = firstFmpMetricNumber(
      balance.commonStockSharesOutstanding,
      balance.weightedAverageShsOut,
      balance.weightedAverageShsOutDil
    );
    const rawShares = firstFmpMetricNumber(statementShares, impliedShares);
    const sharesOutstanding = rawShares !== null ? rawShares / 1000000 : null;
    const isAdr = profile.isAdr === true || String(profile.isAdr || "").toLowerCase() === "true";
    const employeeCount = firstFmpMetricNumber(profile.fullTimeEmployees, profile.employeeCount);

    const shortTermDebt = toNumberOrNull(balance.shortTermDebt);
    const longTermDebt = toNumberOrNull(balance.longTermDebt);
    const combinedDebt =
      shortTermDebt !== null || longTermDebt !== null
        ? (shortTermDebt || 0) + (longTermDebt || 0)
        : null;
    const cashAndEquivalents = firstFmpMetricNumber(
      balance.cashAndShortTermInvestments,
      balance.cashAndCashEquivalents,
      balance.cash
    );
    const totalDebt = firstFmpMetricNumber(balance.totalDebt, combinedDebt, balance.longTermDebt);
    const netCash =
      cashAndEquivalents !== null || totalDebt !== null
        ? (cashAndEquivalents || 0) - (totalDebt || 0)
        : null;
    const equityBookValue = firstFmpMetricNumber(balance.totalStockholdersEquity, balance.totalEquity);
    const totalCurrentAssets = firstFmpMetricNumber(balance.totalCurrentAssets);
    const totalCurrentLiabilities = firstFmpMetricNumber(balance.totalCurrentLiabilities);
    const workingCapital =
      totalCurrentAssets !== null || totalCurrentLiabilities !== null
        ? (totalCurrentAssets || 0) - (totalCurrentLiabilities || 0)
        : firstFmpMetricNumber(metrics.workingCapitalTTM);

    const sumFmpRows = (rows, ...fields) =>
      rows.reduce((total, row) => {
        const value = firstFmpMetricNumber(...fields.map((field) => row?.[field]));
        return value === null ? total : total + value;
      }, 0);
    const revenue = firstFmpMetricNumber(income.revenue);
    const ttmStatementRevenue = incomeRows.length ? sumFmpRows(incomeRows, "revenue") : null;
    const ttmStatementFreeCashflow = cashflowRows.length
      ? sumFmpRows(cashflowRows, "freeCashFlow", "freeCashflow")
      : null;
    const grossProfit = firstFmpMetricNumber(income.grossProfit);
    const operatingIncome = firstFmpMetricNumber(income.operatingIncome);
    const incomeBeforeTax = firstFmpMetricNumber(income.incomeBeforeTax);
    const netIncome = firstFmpMetricNumber(income.netIncome);
    const ebitda = firstFmpMetricNumber(income.ebitda);
    const ebit = firstFmpMetricNumber(income.ebit);
    const freeCashflow = firstFmpMetricNumber(cashflow.freeCashFlow, cashflow.freeCashflow);
    const operatingCashflow = firstFmpMetricNumber(
      cashflow.operatingCashFlow,
      cashflow.operatingCashflow,
      cashflow.netCashProvidedByOperatingActivities
    );
    const margin = (numerator) =>
      revenue && numerator !== null ? (numerator / revenue) * 100 : null;
    const forwardEps = toNumberOrNull(currentYearEstimate.epsAvg ?? currentYearEstimate.estimatedEpsAvg);
    const forwardRevenue = toNumberOrNull(currentYearEstimate.revenueAvg ?? currentYearEstimate.estimatedRevenueAvg);

    const nonAdrStatementMetrics = isAdr
      ? {
          forwardPE: null,
          forwardPS: null,
          totalCash: null,
          totalDebt: null,
          cashAndCashEquivalents: null,
          netCash: null,
          netCashPerShare: null,
          equityBookValue: null,
          bookValuePerShare: null,
          workingCapital: null,
          priceToTangibleBook: firstFmpMetricNumber(ratios.priceToTangibleBookRatioTTM),
          freeCashflow: null,
          operatingCashflow: null,
          revenuePerEmployee: null,
          profitsPerEmployee: null
        }
      : {
          forwardPE: price && forwardEps ? price / forwardEps : null,
          forwardPS: marketCap && forwardRevenue ? marketCap / forwardRevenue : null,
          totalCash: cashAndEquivalents,
          totalDebt,
          cashAndCashEquivalents: cashAndEquivalents,
          netCash,
          netCashPerShare: rawShares && netCash !== null ? netCash / rawShares : null,
          equityBookValue,
          bookValuePerShare: firstFmpMetricNumber(
            ratios.bookValuePerShareTTM,
            rawShares && equityBookValue !== null ? equityBookValue / rawShares : null
          ),
          workingCapital,
          priceToTangibleBook: firstFmpMetricNumber(
            ratios.priceToTangibleBookRatioTTM,
            price && firstFmpMetricNumber(ratios.tangibleBookValuePerShareTTM)
              ? price / firstFmpMetricNumber(ratios.tangibleBookValuePerShareTTM)
              : null
          ),
          freeCashflow,
          operatingCashflow,
          revenuePerEmployee:
            employeeCount && firstFmpMetricNumber(ratios.revenuePerShareTTM) !== null && rawShares
              ? (firstFmpMetricNumber(ratios.revenuePerShareTTM) * rawShares) / employeeCount
              : null,
          profitsPerEmployee:
            employeeCount && firstFmpMetricNumber(ratios.netIncomePerShareTTM) !== null && rawShares
              ? (firstFmpMetricNumber(ratios.netIncomePerShareTTM) * rawShares) / employeeCount
              : null
        };

    return {
      isAdr,
      marketCap,
      sharesOutstanding,
      fiftyTwoWeekHigh: firstFmpMetricNumber(quote.yearHigh),
      fiftyTwoWeekLow: firstFmpMetricNumber(quote.yearLow),
      priceAvg50: firstFmpMetricNumber(quote.priceAvg50, profile.priceAvg50),
      priceAvg200: firstFmpMetricNumber(quote.priceAvg200, profile.priceAvg200),
      pe: firstFmpMetricNumber(ratios.priceToEarningsRatioTTM),
      priceToSales: firstFmpMetricNumber(ratios.priceToSalesRatioTTM),
      priceToBook: firstFmpMetricNumber(ratios.priceToBookRatioTTM),
      priceToFairValue: firstFmpMetricNumber(ratios.priceToFairValueTTM),
      priceToFreeCashflow: firstFmpMetricNumber(ratios.priceToFreeCashFlowRatioTTM),
      priceToOperatingCashflow: firstFmpMetricNumber(ratios.priceToOperatingCashFlowRatioTTM),
      pegRatio: firstFmpMetricNumber(
        stockAnalysisValuation.pegRatio,
        ratios.priceToEarningsGrowthRatioTTM,
        ratios.priceEarningsToGrowthRatioTTM
      ),
      forwardPegRatio: firstFmpMetricNumber(ratios.forwardPriceToEarningsGrowthRatioTTM),
      enterpriseValue: firstFmpMetricNumber(metrics.enterpriseValueTTM, ratios.enterpriseValueTTM),
      evToSales: firstFmpMetricNumber(metrics.evToSalesTTM),
      evToEbitda: firstFmpMetricNumber(metrics.evToEBITDATTM, ratios.enterpriseValueMultipleTTM),
      evToOperatingCashflow: firstFmpMetricNumber(metrics.evToOperatingCashFlowTTM),
      evToFreeCashflow: firstFmpMetricNumber(metrics.evToFreeCashFlowTTM),
      netDebtToEbitda: firstFmpMetricNumber(metrics.netDebtToEBITDATTM),
      fcfYield: percentFromFmpRatio(metrics.freeCashFlowYieldTTM),
      earningsYield: percentFromFmpRatio(metrics.earningsYieldTTM),
      grahamNumber: firstFmpMetricNumber(metrics.grahamNumberTTM),
      grahamNetNet: firstFmpMetricNumber(metrics.grahamNetNetTTM),
      currentRatio: firstFmpMetricNumber(metrics.currentRatioTTM, ratios.currentRatioTTM),
      quickRatio: firstFmpMetricNumber(ratios.quickRatioTTM),
      cashRatio: firstFmpMetricNumber(ratios.cashRatioTTM),
      debtToEquity: firstFmpMetricNumber(ratios.debtToEquityRatioTTM),
      debtToAssets: percentFromFmpRatio(ratios.debtToAssetsRatioTTM),
      debtToCapital: percentFromFmpRatio(ratios.debtToCapitalRatioTTM),
      debtToMarketCap: percentFromFmpRatio(ratios.debtToMarketCapTTM),
      longTermDebtToCapital: percentFromFmpRatio(ratios.longTermDebtToCapitalRatioTTM),
      financialLeverage: firstFmpMetricNumber(ratios.financialLeverageRatioTTM),
      interestCoverage: firstFmpMetricNumber(ratios.interestCoverageRatioTTM),
      debtServiceCoverage: firstFmpMetricNumber(ratios.debtServiceCoverageRatioTTM),
      operatingCashflowCoverage: firstFmpMetricNumber(ratios.operatingCashFlowCoverageRatioTTM),
      shortTermOperatingCashflowCoverage: firstFmpMetricNumber(ratios.shortTermOperatingCashFlowCoverageRatioTTM),
      operatingCashflowRatio: firstFmpMetricNumber(ratios.operatingCashFlowRatioTTM),
      solvencyRatio: firstFmpMetricNumber(ratios.solvencyRatioTTM),
      interestDebtPerShare: firstFmpMetricNumber(ratios.interestDebtPerShareTTM),
      dividendYieldTtm: percentFromFmpRatio(ratios.dividendYieldTTM),
      dividendPayoutRatio: percentFromFmpRatio(ratios.dividendPayoutRatioTTM),
      dividendPerShare: firstFmpMetricNumber(ratios.dividendPerShareTTM),
      incomeQuality: firstFmpMetricNumber(metrics.incomeQualityTTM),
      assetTurnover: firstFmpMetricNumber(ratios.assetTurnoverTTM),
      fixedAssetTurnover: firstFmpMetricNumber(ratios.fixedAssetTurnoverTTM),
      inventoryTurnover: firstFmpMetricNumber(ratios.inventoryTurnoverTTM),
      receivablesTurnover: firstFmpMetricNumber(ratios.receivablesTurnoverTTM),
      payablesTurnover: firstFmpMetricNumber(ratios.payablesTurnoverTTM),
      workingCapitalTurnover: firstFmpMetricNumber(ratios.workingCapitalTurnoverRatioTTM),
      cashConversionCycle: firstFmpMetricNumber(metrics.cashConversionCycleTTM),
      daysSalesOutstanding: firstFmpMetricNumber(metrics.daysOfSalesOutstandingTTM),
      daysPayablesOutstanding: firstFmpMetricNumber(metrics.daysOfPayablesOutstandingTTM),
      daysInventoryOutstanding: firstFmpMetricNumber(metrics.daysOfInventoryOutstandingTTM),
      operatingCycle: firstFmpMetricNumber(metrics.operatingCycleTTM),
      averageInventory: firstFmpMetricNumber(metrics.averageInventoryTTM),
      averagePayables: firstFmpMetricNumber(metrics.averagePayablesTTM),
      averageReceivables: firstFmpMetricNumber(metrics.averageReceivablesTTM),
      rdToRevenue: percentFromFmpRatio(metrics.researchAndDevelopementToRevenueTTM),
      sgaToRevenue: percentFromFmpRatio(metrics.salesGeneralAndAdministrativeToRevenueTTM),
      stockBasedCompToRevenue: percentFromFmpRatio(metrics.stockBasedCompensationToRevenueTTM),
      capexToRevenue: percentFromFmpRatio(metrics.capexToRevenueTTM),
      capexToOperatingCashflow: percentFromFmpRatio(metrics.capexToOperatingCashFlowTTM),
      capexToDepreciation: percentFromFmpRatio(metrics.capexToDepreciationTTM),
      capexPerShare: firstFmpMetricNumber(ratios.capexPerShareTTM),
      capitalExpenditureCoverage: firstFmpMetricNumber(ratios.capitalExpenditureCoverageRatioTTM),
      dividendPaidAndCapexCoverage: firstFmpMetricNumber(ratios.dividendPaidAndCapexCoverageRatioTTM),
      effectiveTaxRate: percentFromFmpRatio(ratios.effectiveTaxRateTTM),
      taxBurden: firstFmpMetricNumber(metrics.taxBurdenTTM),
      interestBurden: firstFmpMetricNumber(metrics.interestBurdenTTM),
      ebtPerEbit: firstFmpMetricNumber(ratios.ebtPerEbitTTM),
      netIncomePerEbt: firstFmpMetricNumber(ratios.netIncomePerEBTTTM),
      revenueGrowth: percentFromFmpRatio(growth.revenueGrowth),
      earningsGrowth: percentFromFmpRatio(growth.netIncomeGrowth, growth.epsgrowth),
      freeCashflowGrowth: percentFromFmpRatio(growth.freeCashFlowGrowth),
      operatingCashflowGrowth: percentFromFmpRatio(growth.operatingCashFlowGrowth),
      ebitdaGrowth: percentFromFmpRatio(growth.ebitdaGrowth),
      debtGrowth: percentFromFmpRatio(growth.debtGrowth),
      threeYearRevenueGrowthPerShare: percentFromFmpRatio(growth.threeYRevenueGrowthPerShare),
      fiveYearRevenueGrowthPerShare: percentFromFmpRatio(growth.fiveYRevenueGrowthPerShare),
      threeYearNetIncomeGrowthPerShare: percentFromFmpRatio(growth.threeYNetIncomeGrowthPerShare, growth.threeYBottomLineNetIncomeGrowthPerShare),
      fiveYearNetIncomeGrowthPerShare: percentFromFmpRatio(growth.fiveYNetIncomeGrowthPerShare, growth.fiveYBottomLineNetIncomeGrowthPerShare),
      grossMargins: firstFmpMetricNumber(margin(grossProfit), percentFromFmpRatio(ratios.grossProfitMarginTTM)),
      operatingMargins: firstFmpMetricNumber(margin(operatingIncome), percentFromFmpRatio(ratios.operatingProfitMarginTTM)),
      profitMargins: firstFmpMetricNumber(margin(netIncome), percentFromFmpRatio(ratios.netProfitMarginTTM)),
      pretaxMargin: percentFromFmpRatio(ratios.pretaxProfitMarginTTM),
      ebitdaMargin: percentFromFmpRatio(ratios.ebitdaMarginTTM),
      ebitMargin: percentFromFmpRatio(ratios.ebitMarginTTM),
      bottomLineProfitMargin: percentFromFmpRatio(ratios.bottomLineProfitMarginTTM),
      continuousOperationsProfitMargin: percentFromFmpRatio(ratios.continuousOperationsProfitMarginTTM),
      operatingCashflowSalesRatio: percentFromFmpRatio(ratios.operatingCashFlowSalesRatioTTM),
      freeCashflowOperatingCashflowRatio: percentFromFmpRatio(ratios.freeCashFlowOperatingCashFlowRatioTTM),
      fcfMargin: firstFmpMetricNumber(
        firstFmpMetricNumber(ratios.freeCashFlowPerShareTTM) !== null && firstFmpMetricNumber(ratios.revenuePerShareTTM)
          ? (firstFmpMetricNumber(ratios.freeCashFlowPerShareTTM) / firstFmpMetricNumber(ratios.revenuePerShareTTM)) * 100
          : null,
        ttmStatementRevenue ? (ttmStatementFreeCashflow / ttmStatementRevenue) * 100 : null
      ),
      returnOnEquity: percentFromFmpRatio(metrics.returnOnEquityTTM),
      returnOnAssets: percentFromFmpRatio(metrics.returnOnAssetsTTM),
      operatingReturnOnAssets: percentFromFmpRatio(metrics.operatingReturnOnAssetsTTM),
      returnOnInvestedCapital: percentFromFmpRatio(metrics.returnOnInvestedCapitalTTM),
      returnOnCapitalEmployed: percentFromFmpRatio(metrics.returnOnCapitalEmployedTTM),
      returnOnTangibleAssets: percentFromFmpRatio(metrics.returnOnTangibleAssetsTTM),
      employeeCount,
      revenuePerShare: firstFmpMetricNumber(ratios.revenuePerShareTTM),
      netIncomePerShare: firstFmpMetricNumber(ratios.netIncomePerShareTTM),
      cashPerShare: firstFmpMetricNumber(ratios.cashPerShareTTM),
      freeCashflowPerShare: firstFmpMetricNumber(ratios.freeCashFlowPerShareTTM),
      operatingCashflowPerShare: firstFmpMetricNumber(ratios.operatingCashFlowPerShareTTM),
      tangibleBookValuePerShare: firstFmpMetricNumber(ratios.tangibleBookValuePerShareTTM),
      freeCashflowToEquity: firstFmpMetricNumber(metrics.freeCashFlowToEquityTTM),
      freeCashflowToFirm: firstFmpMetricNumber(metrics.freeCashFlowToFirmTTM),
      investedCapital: firstFmpMetricNumber(metrics.investedCapitalTTM),
      tangibleAssetValue: firstFmpMetricNumber(metrics.tangibleAssetValueTTM),
      netCurrentAssetValue: firstFmpMetricNumber(metrics.netCurrentAssetValueTTM),
      intangiblesToTotalAssets: percentFromFmpRatio(metrics.intangiblesToTotalAssetsTTM),
      targetMean: firstPositiveFmpMetricNumber(
        priceTarget.lastMonthAvgPriceTarget,
        priceTarget.lastQuarterAvgPriceTarget,
        priceTarget.lastYearAvgPriceTarget,
        priceTarget.allTimeAvgPriceTarget
      ),
      recommendationKey: normalizeRating(rating.rating),
      analystRatingText: firstText(rating.rating),
      balanceSheetAsOf: balance.date || balance.filingDate || null,
      balanceSheetSource: isAdr ? null : "FMP latest quarterly balance sheet",
      ...nonAdrStatementMetrics
    };
  } catch (err) {
    setFmpCooldown(err, "metric cards", symbol);
    console.log("FMP-only metric cards skipped:", symbol, err.response?.status || err.message);
    return {};
  }
}

async function fetchFmpBatchQuotes(symbols = []) {
  if (!process.env.FMP_API_KEY || !canUseFmp() || !symbols.length) return [];

  try {
    const stableResponse = await axios.get(
      "https://financialmodelingprep.com/stable/batch-quote",
      {
        params: {
          symbols: symbols.join(","),
          apikey: process.env.FMP_API_KEY
        },
        timeout: 5500
      }
    );
    if (Array.isArray(stableResponse.data) && stableResponse.data.length) return stableResponse.data;
  } catch (err) {
    if (![402, 403, 404].includes(Number(err.response?.status))) {
      setFmpCooldown(err, "stable batch quote", symbols.slice(0, 3).join(","));
      console.log("FMP stable batch quote skipped:", err.response?.status || err.message);
    }
  }

  try {
    const legacyResponse = await axios.get(
      `https://financialmodelingprep.com/api/v3/quote/${symbols.map(encodeURIComponent).join(",")}`,
      {
        params: { apikey: process.env.FMP_API_KEY },
        timeout: 5500
      }
    );
    return Array.isArray(legacyResponse.data) ? legacyResponse.data : [];
  } catch (err) {
    setFmpCooldown(err, "batch quote", symbols.slice(0, 3).join(","));
    console.log("FMP batch quote skipped:", err.response?.status || err.message);
    return [];
  }
}

function getFmpPriceHistoryDateRange(requestedRange) {
  const end = new Date();
  end.setUTCHours(23, 59, 59, 999);
  const start = new Date(end);

  if (requestedRange === "1M") start.setUTCMonth(start.getUTCMonth() - 1);
  else if (requestedRange === "1Y") start.setUTCFullYear(start.getUTCFullYear() - 1);
  else if (requestedRange === "YTD") {
    start.setUTCMonth(0, 1);
    start.setUTCHours(0, 0, 0, 0);
  } else if (requestedRange === "5Y") start.setUTCFullYear(start.getUTCFullYear() - 5);
  else if (requestedRange === "10Y") start.setUTCFullYear(start.getUTCFullYear() - 10);
  else if (requestedRange === "MAX") start.setUTCFullYear(start.getUTCFullYear() - 25);
  else return null;

  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10)
  };
}

async function fetchFmpPriceHistory(ticker, requestedRange) {
  const symbol = String(ticker || "").trim().toUpperCase();
  if (!symbol || !process.env.FMP_API_KEY || !canUseFmp()) return null;
  if (requestedRange === "1D" || requestedRange === "1W") return null;
  const range = getFmpPriceHistoryDateRange(requestedRange);
  if (!range) return null;

  try {
    const response = await axios.get("https://financialmodelingprep.com/stable/historical-price-eod/light", {
      params: {
        symbol,
        from: range.from,
        to: range.to,
        apikey: process.env.FMP_API_KEY
      },
      timeout: 3500
    });
    const rows = Array.isArray(response.data) ? response.data : [];
    const points = rows
      .map((row) => {
        const price = firstFiniteNumber(row.price, row.close, row.adjClose);
        const date = new Date(`${row.date}T16:00:00Z`);
        if (price === null || Number.isNaN(date.getTime())) return null;
        return {
          time: date.getTime(),
          date: date.toISOString(),
          price,
          volume: firstFiniteNumber(row.volume)
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.time - b.time);

    if (points.length < 2) return null;

    const latestPoint = points.at(-1);
    const firstPoint = points[0];
    const previousPoint = points.at(-2);
    const latestPrice = latestPoint.price;
    const changeBase = requestedRange === "1M" ? previousPoint?.price : firstPoint?.price;
    const change = latestPrice !== null && changeBase
      ? latestPrice - changeBase
      : null;

    return {
      symbol,
      sourceSymbol: symbol,
      range: requestedRange,
      interval: "1d",
      source: "FMP historical price",
      points,
      latest: {
        price: latestPrice,
        change,
        percentChange: change !== null && changeBase ? (change / changeBase) * 100 : null,
        previousClose: previousPoint?.price ?? null
      },
      updatedAt: new Date().toISOString()
    };
  } catch (err) {
    setFmpCooldown(err, "price history", symbol);
    console.log("FMP price history skipped:", symbol, requestedRange, err.response?.status || err.message);
    return null;
  }
}

async function fetchFmpFiftyTwoWeekRange(ticker) {
  const history = await resolveWithin(fetchFmpPriceHistory(ticker, "1Y"), 1800, null);
  const prices = (history?.points || [])
    .map((point) => toNumberOrNull(point.price))
    .filter((value) => value !== null && value > 0);
  if (!prices.length) return {};
  return {
    fiftyTwoWeekHigh: Math.max(...prices),
    fiftyTwoWeekLow: Math.min(...prices),
    source: "FMP 1Y price history"
  };
}

async function fetchYahooSparkQuotes(symbols = []) {
  const uniqueSymbols = [...new Set((symbols || [])
    .map((symbol) => String(symbol || "").trim().toUpperCase())
    .filter(Boolean))];
  if (!uniqueSymbols.length) return [];

  const chunks = [];
  for (let index = 0; index < uniqueSymbols.length; index += 20) {
    chunks.push(uniqueSymbols.slice(index, index + 20));
  }

  const results = [];
  const queue = [...chunks];
  const workerCount = Math.min(1, queue.length);
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const normalizeV8SparkRows = (payload = {}) =>
    Object.entries(payload || {})
      .filter(([symbol, row]) => symbol && row && typeof row === "object" && Array.isArray(row.close))
      .map(([symbol, row]) => ({
        symbol,
        response: [{
          meta: {
            symbol,
            regularMarketPrice: row.close[row.close.length - 1],
            chartPreviousClose: row.chartPreviousClose ?? null,
            marketCap: row.marketCap ?? null
          },
          indicators: {
            quote: [{ close: row.close }]
          }
        }]
      }));
  const fetchSparkChunk = async (chunk, attempt = 0) => {
    for (const host of ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]) {
      try {
        const response = await axios.get(`https://${host}/v8/finance/spark`, {
          params: {
            symbols: chunk.join(","),
            range: "5d",
            interval: "1d"
          },
          headers: {
            "User-Agent": "Mozilla/5.0",
            Accept: "application/json,text/plain,*/*"
          },
          timeout: 4500
        });
        const rows = normalizeV8SparkRows(response.data);
        if (rows.length) return rows;
      } catch (err) {
        if (err.response?.status === 429 && attempt < 1 && host === "query2.finance.yahoo.com") {
          await sleep(1200);
          return fetchSparkChunk(chunk, attempt + 1);
        }
      }
    }

    try {
      const fallbackResponse = await axios.get("https://query1.finance.yahoo.com/v7/finance/spark", {
        params: {
          symbols: chunk.join(","),
          range: "5d",
          interval: "1d"
        },
        headers: {
          "User-Agent": "Mozilla/5.0",
          Accept: "application/json,text/plain,*/*"
        },
        timeout: 4500
      });
      return fallbackResponse.data?.spark?.result || [];
    } catch (err) {
      if (err.response?.status === 429 && attempt < 1) {
        await sleep(1200);
        return fetchSparkChunk(chunk, attempt + 1);
      }
      console.log("Yahoo spark heatmap chunk skipped:", chunk.slice(0, 3).join(","), err.response?.status || err.message);
      return [];
    }
  };

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (queue.length) {
      const chunk = queue.shift();
      const rows = await fetchSparkChunk(chunk);
      if (!Array.isArray(rows)) continue;
      rows.forEach((row) => {
        const meta = row?.response?.[0]?.meta || {};
        const close = row?.response?.[0]?.indicators?.quote?.[0]?.close || row?.close || [];
        const price = firstFiniteNumber(meta.regularMarketPrice, close[close.length - 1]);
        const previousClose = firstFiniteNumber(meta.chartPreviousClose, close.length > 1 ? close[close.length - 2] : null);
        const change = price !== null && previousClose > 0 ? price - previousClose : null;
        results.push({
          symbol: normalizeSp500Symbol(row.symbol || meta.symbol),
          price,
          marketCap: firstFiniteNumber(meta.marketCap),
          change,
          percentChange: change !== null && previousClose > 0 ? (change / previousClose) * 100 : null,
          previousClose
        });
      });
    }
  }));

  return results;
}

async function fetchYahooSparkQuote(ticker) {
  const rows = await fetchYahooSparkQuotes([ticker]);
  const row = rows.find((item) =>
    normalizeSp500Symbol(item.symbol) === normalizeSp500Symbol(ticker)
  ) || rows[0];
  const meta = row?.response?.[0]?.meta || {};
  const closes = row?.response?.[0]?.indicators?.quote?.[0]?.close || [];
  const price = firstFiniteNumber(meta.regularMarketPrice, closes[closes.length - 1]);
  const previousClose = firstFiniteNumber(meta.chartPreviousClose, closes.length > 1 ? closes[closes.length - 2] : null);
  const change = price !== null && previousClose > 0 ? price - previousClose : null;
  return {
    symbol: normalizeSp500Symbol(meta.symbol || row?.symbol || ticker),
    price,
    previousClose,
    change,
    percentChange: change !== null && previousClose > 0 ? (change / previousClose) * 100 : null
  };
}

async function fetchFmpMarketMoverList(type) {
  if (!process.env.FMP_API_KEY || !canUseFmp()) return [];
  const endpoint = type === "losers" ? "losers" : "gainers";

  try {
    const response = await axios.get(
      `https://financialmodelingprep.com/api/v3/stock_market/${endpoint}`,
      {
        params: { apikey: process.env.FMP_API_KEY },
        timeout: 6000
      }
    );
    return Array.isArray(response.data) ? response.data : [];
  } catch (err) {
    setFmpCooldown(err, `market ${endpoint}`, endpoint);
    console.log(`FMP market ${endpoint} skipped:`, err.response?.status || err.message);
    return [];
  }
}

async function fetchYahooMarketMoverList(type) {
  if (!canUseYahoo()) return [];
  const scrId = type === "losers" ? "day_losers" : "day_gainers";

  try {
    const response = await axios.get(
      "https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved",
      {
        params: {
          formatted: "false",
          lang: "en-US",
          region: "US",
          scrIds: scrId,
          count: 20
        },
        headers: {
          "User-Agent": "Mozilla/5.0 AppleWebKit/537.36 Chrome/124 Safari/537.36",
          Accept: "application/json,text/plain,*/*"
        },
        timeout: 6500
      }
    );
    return response.data?.finance?.result?.[0]?.quotes || [];
  } catch (err) {
    setYahooCooldown(err, `market ${scrId}`, scrId);
    console.log(`Yahoo market ${scrId} skipped:`, err.response?.status || err.message);
    return [];
  }
}

async function fetchStockAnalysisMarketMoverList(type) {
  if (!canUseStockAnalysis()) return [];
  const path = type === "losers" ? "losers" : "gainers";

  try {
    const response = await axios.get(`https://stockanalysis.com/markets/${path}/`, {
      headers: {
        "User-Agent": "Mozilla/5.0 AppleWebKit/537.36 Chrome/124 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      },
      timeout: 7000
    });
    const $ = cheerio.load(response.data || "");
    return $("table tbody tr").map((_, row) => {
      const cells = $(row).find("td").map((__, cell) => $(cell).text().trim()).get();
      return {
        symbol: cells[1],
        name: cells[2],
        percentChange: cells[3],
        price: cells[4]
      };
    }).get();
  } catch (err) {
    setStockAnalysisCooldown(err, `market ${path}`, path);
    console.log(`StockAnalysis market ${path} skipped:`, err.response?.status || err.message);
    return [];
  }
}

async function getAlphaVantageFundamentalData(ticker, fn) {
  const apiKey = getAlphaVantageApiKey();
  const symbol = String(ticker || "").trim().toUpperCase();
  const functionName = String(fn || "").trim().toUpperCase();
  if (!apiKey || !symbol || !functionName) return null;

  const cacheKey = `${functionName}:${symbol}`;
  const cached = alphaVantageFundamentalCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < 6 * 60 * 60 * 1000) {
    return cached.data;
  }

  try {
    const response = await axios.get("https://www.alphavantage.co/query", {
      params: {
        function: functionName,
        symbol,
        apikey: apiKey
      },
      timeout: 12000
    });
    const data = response.data || {};
    if (data.Note || data.Information || data["Error Message"]) return null;
    alphaVantageFundamentalCache.set(cacheKey, { data, fetchedAt: Date.now() });
    return data;
  } catch (err) {
    console.log("Alpha Vantage fundamentals skipped:", symbol, functionName, err.response?.status || err.message);
    return null;
  }
}

const parseNasdaqNumber = (value) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (!value || value === "N/A") return null;
  const number = Number(String(value).replace(/[$,%\s,x,]/gi, ""));
  return Number.isFinite(number) ? number : null;
};

const parseApiNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "object") {
    if (value.raw !== undefined) return parseApiNumber(value.raw);
    if (value.fmt !== undefined) return parseApiNumber(value.fmt);
  }
  const number = Number(String(value).replace(/[$,%\s,]/g, ""));
  return Number.isFinite(number) ? number : null;
};

const formatIsoDate = (date) => date.toISOString().slice(0, 10);

function fiscalQuarterKey(fiscalQuarter, fiscalYear) {
  const quarter = toNumberOrNull(fiscalQuarter);
  const year = toNumberOrNull(fiscalYear);
  if (quarter !== null && year !== null) return `${year}:${quarter}`;
  const parsed = parseEpsBeatMissFiscalLabel(`Q${fiscalQuarter || ""} ${fiscalYear || ""}`);
  return parsed.fiscalYear && parsed.fiscalQuarter
    ? `${parsed.fiscalYear}:${parsed.fiscalQuarter}`
    : null;
}

function calendarEstimateFiscalKey(estimate = {}) {
  const parsed = parseEpsBeatMissFiscalLabel(estimate.fiscalQuarter);
  const fiscalQuarterNumber = toNumberOrNull(estimate.fiscalQuarter);
  const fiscalYearNumber = toNumberOrNull(estimate.fiscalYear);
  return fiscalQuarterKey(
    estimate.quarter ?? fiscalQuarterNumber ?? parsed.fiscalQuarter,
    estimate.year ?? fiscalYearNumber ?? parsed.fiscalYear
  );
}

function applyEarningsDateOverride(ticker, estimate = {}) {
  const symbol = String(ticker || "").trim().toUpperCase();
  const key = calendarEstimateFiscalKey(estimate);
  const overrideDate = key ? EARNINGS_DATE_OVERRIDES[symbol]?.[key] : null;
  return overrideDate ? { ...estimate, date: overrideDate } : estimate;
}

function hasCompleteNextQuarterEstimate(estimate = {}) {
  return (
    toNumberOrNull(estimate?.revenue) !== null &&
    toNumberOrNull(estimate?.eps) !== null &&
    Boolean(firstText(estimate?.date, estimate?.fiscalQuarter))
  );
}

function applyStockEarningsDateOverrides(ticker, data = {}) {
  const nextQuarter = data.analystEstimates?.nextQuarter;
  const correctedNextQuarter = applyEarningsDateOverride(ticker, nextQuarter);
  if (correctedNextQuarter === nextQuarter) return data;

  const correctedKey = calendarEstimateFiscalKey(correctedNextQuarter);
  const epsBeatMiss = Array.isArray(data.epsBeatMiss)
    ? data.epsBeatMiss.map((row) => {
        const rowKey = calendarEstimateFiscalKey(row);
        const isUpcoming = toNumberOrNull(row.actual) === null && toNumberOrNull(row.gaapActual) === null;
        return isUpcoming && rowKey && rowKey === correctedKey
          ? { ...row, period: correctedNextQuarter.date }
          : row;
      })
    : data.epsBeatMiss;

  return {
    ...data,
    analystEstimates: {
      ...(data.analystEstimates || {}),
      nextQuarter: correctedNextQuarter
    },
    epsBeatMiss
  };
}

async function fetchNasdaqEarningsDate(ticker, referenceDate) {
  const symbol = String(ticker || "").trim().toUpperCase();
  if (!symbol || !referenceDate) return null;

  const cacheKey = `${symbol}:${referenceDate}`;
  const cached = nasdaqEarningsDateCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < 6 * 60 * 60 * 1000) {
    return cached.date;
  }

  const centerDate = new Date(`${referenceDate}T12:00:00Z`);
  if (Number.isNaN(centerDate.getTime())) return null;

  const nasdaqHeaders = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36",
    Accept: "application/json, text/plain, */*",
    Origin: "https://www.nasdaq.com",
    Referer: "https://www.nasdaq.com/"
  };
  const dates = [-2, -1, 0, 1, 2].map((offset) => {
    const date = new Date(centerDate);
    date.setUTCDate(date.getUTCDate() + offset);
    return formatIsoDate(date);
  });

  try {
    const responses = await Promise.all(dates.map((date) =>
      axios.get("https://api.nasdaq.com/api/calendar/earnings", {
        params: { date },
        headers: nasdaqHeaders,
        timeout: 3500
      }).then((response) => ({
        date,
        rows: response.data?.data?.rows || []
      })).catch(() => ({ date, rows: [] }))
    ));

    const matches = responses.flatMap((day) =>
      day.rows
        .filter((row) => String(row.symbol || "").trim().toUpperCase() === symbol)
        .map(() => ({
          date: day.date,
          distance: Math.abs(new Date(`${day.date}T12:00:00Z`) - centerDate)
        }))
    );
    const bestMatch = matches.sort((a, b) => a.distance - b.distance)[0] || null;
    const date =
      bestMatch?.date && bestMatch.date < referenceDate
        ? referenceDate
        : bestMatch?.date || null;
    nasdaqEarningsDateCache.set(cacheKey, { date, fetchedAt: Date.now() });
    return date;
  } catch (err) {
    return null;
  }
}

async function fetchCalendarQuarterEstimate(ticker, options = {}) {
  const symbol = String(ticker || "").trim().toUpperCase();
  if (!symbol) return {};
  const calendarSymbols = new Set([
    symbol,
    ...(FOREIGN_ADR_CONFIG[symbol]?.localSymbols || [])
  ].map((value) => String(value || "").trim().toUpperCase()).filter(Boolean));

  const cached = earningsEstimateCalendarCache.get(symbol);
  const cachedHasEstimate =
    toNumberOrNull(cached?.data?.revenue) !== null ||
    toNumberOrNull(cached?.data?.eps) !== null ||
    Boolean(cached?.data?.date);
  const cachedTtlMs = cachedHasEstimate ? 6 * 60 * 60 * 1000 : 30 * 1000;
  if (cached && Date.now() - cached.fetchedAt < cachedTtlMs && (cachedHasEstimate || !options.fast)) {
    return cached.data;
  }

  const emptyResult = {
    revenue: null,
    earnings: null,
    eps: null,
    date: null,
    fiscalQuarter: null,
    source: "FMP earnings calendar"
  };

  const today = new Date();
  const todayNoon = new Date(today);
  todayNoon.setUTCHours(12, 0, 0, 0);

  if (process.env.FMP_API_KEY && canUseFmp()) {
    try {
      const perSymbolRows = await resolveWithin(
        getFmpData(symbol, "earnings history", [
          `/stable/earnings?symbol=${encodeURIComponent(symbol)}&limit=12`
        ]),
        options.fast ? 1100 : 2200,
        []
      );
      const bestSymbolRow = (Array.isArray(perSymbolRows) ? perSymbolRows : perSymbolRows ? [perSymbolRows] : [])
        .map((row) => ({
          ...row,
          reportDate: new Date(`${String(row.date || row.reportDate || "").slice(0, 10)}T12:00:00Z`),
          epsEstimate: parseApiNumber(row.epsEstimated ?? row.epsEstimate),
          revenueEstimate: parseApiNumber(row.revenueEstimated ?? row.revenueEstimate)
        }))
        .filter((row) =>
          !Number.isNaN(row.reportDate.getTime()) &&
          row.reportDate >= todayNoon &&
          (row.epsEstimate !== null || row.revenueEstimate !== null)
        )
        .sort((a, b) => a.reportDate - b.reportDate)[0] || null;

      if (bestSymbolRow) {
        const result = applyEarningsDateOverride(symbol, {
          revenue: bestSymbolRow.revenueEstimate,
          earnings: null,
          eps: bestSymbolRow.epsEstimate,
          date: String(bestSymbolRow.date || bestSymbolRow.reportDate || "").slice(0, 10) || null,
          fiscalQuarter: bestSymbolRow.fiscalDateEnding
            ? String(bestSymbolRow.fiscalDateEnding).slice(0, 10)
            : null,
          source: "FMP earnings history"
        });
        earningsEstimateCalendarCache.set(symbol, { data: result, fetchedAt: Date.now() });
        return result;
      }

      const windowCount = options.fast ? 4 : 8;
      const windowSizeDays = 45;
      const fmpRows = (await Promise.all(Array.from({ length: windowCount }, (_, index) => {
        const from = new Date(todayNoon);
        from.setUTCDate(from.getUTCDate() + index * windowSizeDays);
        const to = new Date(todayNoon);
        to.setUTCDate(to.getUTCDate() + ((index + 1) * windowSizeDays) - 1);
        return resolveWithin(
          getFmpData(symbol, "earnings calendar", [
            `/stable/earnings-calendar?from=${from.toISOString().slice(0, 10)}&to=${to.toISOString().slice(0, 10)}`
          ]),
          options.fast ? 900 : 1400,
          []
        );
      }))).flatMap((rows) => Array.isArray(rows) ? rows : rows ? [rows] : []);
      const bestFmpRow = (Array.isArray(fmpRows) ? fmpRows : fmpRows ? [fmpRows] : [])
        .filter((row) => calendarSymbols.has(String(row.symbol || "").trim().toUpperCase()))
        .map((row) => ({
          ...row,
          reportDate: new Date(`${row.date}T12:00:00Z`),
          epsEstimate: parseApiNumber(row.epsEstimated ?? row.epsEstimate),
          revenueEstimate: parseApiNumber(row.revenueEstimated ?? row.revenueEstimate)
        }))
        .filter((row) =>
          !Number.isNaN(row.reportDate.getTime()) &&
          row.reportDate >= todayNoon &&
          (row.epsEstimate !== null || row.revenueEstimate !== null)
        )
        .sort((a, b) => a.reportDate - b.reportDate)[0] || null;

      if (bestFmpRow) {
        const result = applyEarningsDateOverride(symbol, {
          revenue: bestFmpRow.revenueEstimate,
          earnings: null,
          eps: bestFmpRow.epsEstimate,
          date: bestFmpRow.date || null,
          fiscalQuarter: bestFmpRow.fiscalDateEnding
            ? String(bestFmpRow.fiscalDateEnding).slice(0, 10)
            : null,
          source: "FMP earnings calendar"
        });
        earningsEstimateCalendarCache.set(symbol, { data: result, fetchedAt: Date.now() });
        return result;
      }
    } catch (err) {
      setFmpCooldown(err, "earnings calendar", symbol);
      console.log("FMP ticker earnings calendar skipped:", symbol, err.response?.status || err.message);
    }
  }

  earningsEstimateCalendarCache.set(symbol, { data: emptyResult, fetchedAt: Date.now() });
  return emptyResult;
}

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
  const match = String(value).trim().replace(/[$,%\s,x,]/gi, "").match(/^(-?[\d.]+)\s*([KMBT])?$/i);
  if (!match) return parseNasdaqNumber(value);
  const multipliers = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 };
  return Number(match[1]) * (multipliers[match[2]?.toUpperCase()] || 1);
};

const estimatePegRatio = (forwardPE, epsGrowthPercent) => {
  const forwardPeNumber = toNumberOrNull(forwardPE);
  const epsGrowthNumber = toNumberOrNull(epsGrowthPercent);
  if (forwardPeNumber === null || epsGrowthNumber === null || epsGrowthNumber <= 0) return null;
  return forwardPeNumber / epsGrowthNumber;
};

async function fetchStockAnalysisValuationMetrics(ticker) {
  const symbol = getStockAnalysisPath(ticker);
  const cached = stockAnalysisValuationCache.get(symbol);
  if (cached && Date.now() - cached.fetchedAt < 15 * 60 * 1000) {
    return cached.data;
  }

  try {
    const { data } = await axios.get(buildStockAnalysisUrl(ticker, "statistics/"), {
      headers: {
        "User-Agent": "Mozilla/5.0 AppleWebKit/537.36 Chrome/124 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      },
      timeout: 5500
    });
    const $ = cheerio.load(data || "");
    const normalizeStatisticLabel = (value = "") => String(value).replace(/\s+/g, " ").trim().toLowerCase();
    const readStatistic = (label) => {
      const expected = normalizeStatisticLabel(label);
      let rawValue = "";
      $("tr").each((_, row) => {
        if (rawValue) return;
        const cells = $(row).find("th,td").map((__, cell) =>
          $(cell).text().replace(/\s+/g, " ").trim()
        ).get();
        if (cells.length < 2) return;
        if (normalizeStatisticLabel(cells[0]) === expected) rawValue = cells[1];
      });
      return parseAbbreviatedNumber(rawValue);
    };
    const forwardPE = readStatistic("Forward PE");
    const epsGrowthForecast = readStatistic("EPS Growth Forecast (3Y)");
    const valuation = {
      pe: readStatistic("PE Ratio"),
      forwardPE,
      forwardPS: readStatistic("Forward PS"),
      priceToBook: firstNumber(
        readStatistic("PB Ratio"),
        readStatistic("Price-to-Book Ratio"),
        readStatistic("Price / Book Ratio")
      ),
      priceToTangibleBook: readStatistic("P/TBV Ratio"),
      priceToFreeCashflow: readStatistic("P/FCF Ratio"),
      priceToOperatingCashflow: readStatistic("P/OCF Ratio"),
      pretaxMargin: readStatistic("Pretax Margin"),
      ebitdaMargin: readStatistic("EBITDA Margin"),
      ebitMargin: readStatistic("EBIT Margin"),
      fcfMargin: readStatistic("FCF Margin"),
      returnOnEquity: readStatistic("Return on Equity (ROE)"),
      returnOnAssets: readStatistic("Return on Assets (ROA)"),
      returnOnInvestedCapital: readStatistic("Return on Invested Capital (ROIC)"),
      returnOnCapitalEmployed: readStatistic("Return on Capital Employed (ROCE)"),
      weightedAverageCostOfCapital: readStatistic("Weighted Average Cost of Capital (WACC)"),
      revenuePerEmployee: firstNumber(
        readStatistic("Revenue Per Employee"),
        readStatistic("Revenue / Employee"),
        readStatistic("Revenue per Employee")
      ),
      profitsPerEmployee: firstNumber(
        readStatistic("Profits Per Employee"),
        readStatistic("Profit Per Employee"),
        readStatistic("Profits / Employee"),
        readStatistic("Profit / Employee"),
        readStatistic("Net Income Per Employee")
      ),
      employeeCount: firstNumber(
        readStatistic("Employees"),
        readStatistic("Employee Count"),
        readStatistic("Number of Employees")
      ),
      pegRatio: firstNumber(
        readStatistic("PEG Ratio"),
        estimatePegRatio(forwardPE, epsGrowthForecast)
      ),
      epsGrowthForecast
    };
    const hasAnyValuationMetric = Object.entries(valuation)
      .some(([key, value]) => key !== "epsGrowthForecast" && toNumberOrNull(value) !== null);
    if (hasAnyValuationMetric) {
      stockAnalysisValuationCache.set(symbol, { data: valuation, fetchedAt: Date.now() });
    }
    return valuation;
  } catch (err) {
    setStockAnalysisCooldown(err, "valuation metrics", ticker);
    console.log("StockAnalysis valuation metrics skipped:", ticker, err.response?.status || err.message);
    return {};
  }
}

async function fetchStockAnalysisForecast(ticker) {
  try {
    const headers = {
      "User-Agent": "Mozilla/5.0 AppleWebKit/537.36 Chrome/124 Safari/537.36"
    };
    const [forecastResponse, statisticsResponse] = await Promise.all([
      axios.get(buildStockAnalysisUrl(ticker, "forecast/"), {
        headers,
        timeout: 10000
      }),
      axios.get(buildStockAnalysisUrl(ticker, "statistics/"), {
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
    const forecastForwardPE = readStatistic("Forward PE");
    const epsGrowthForecast = readStatistic("EPS Growth Forecast (3Y)");

    return {
      fiscalYear: eps.year || revenue.year,
      currentYearRevenue: firstNumber(embeddedRevenueThis, revenue.value),
      currentYearEps: firstNumber(embeddedEpsThis, eps.value),
      nextYearRevenue: firstNumber(embeddedRevenueNext, revenue.nextValue),
      nextYearEps: firstNumber(embeddedEpsNext, eps.nextValue),
      pe: readStatistic("PE Ratio"),
      forwardPE: forecastForwardPE,
      pegRatio: firstNumber(
        readStatistic("PEG Ratio"),
        estimatePegRatio(forecastForwardPE, epsGrowthForecast)
      ),
      epsGrowthForecast,
      targetMean: readEmbeddedTarget("avg"),
      targetMedian: readEmbeddedTarget("median"),
      analystRatingText: firstText(ratingConsensus),
      ratingConsensus,
      ratingScore,
      ratingCount
    };
  } catch (err) {
    setStockAnalysisCooldown(err, "forecast", ticker);
    console.log("StockAnalysis forecast skipped:", ticker, err.response?.status || err.message);
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

async function resolveSecCikForTicker(symbol) {
  const normalized = String(symbol || "").trim().toUpperCase();
  const aliasKey = normalized.replace(/[.]/g, "-");
  const compactKey = normalized.replace(/[-.]/g, "_");

  try {
    const tickerMap = await getSecTickerMap();
    const cik = tickerMap.get(normalized) || tickerMap.get(aliasKey);
    if (cik) return cik;
  } catch (err) {
    console.log("SEC ticker map lookup skipped:", normalized, err.response?.status || err.message);
  }

  const commonCik = COMMON_SEC_CIKS.get(normalized) || COMMON_SEC_CIKS.get(aliasKey) || COMMON_SEC_CIKS.get(compactKey);
  if (commonCik) return commonCik;

  try {
    const response = await axios.get("https://www.sec.gov/cgi-bin/browse-edgar", {
      params: {
        CIK: normalized,
        owner: "exclude",
        action: "getcompany",
        output: "atom"
      },
      headers: { "User-Agent": "InvestmentTerminal/1.0 contact@investmentterminal.app" },
      timeout: 10000,
      responseType: "text",
      transformResponse: [(data) => data],
      validateStatus: (status) => status >= 200 && status < 500
    });
    const cikMatch = String(response.data || "").match(/CIK=(\d{1,10})/i) ||
      String(response.data || "").match(/<cik>(\d{1,10})<\/cik>/i);
    if (cikMatch?.[1]) return String(cikMatch[1]).padStart(10, "0");
  } catch (err) {
    console.log("SEC ticker browse lookup skipped:", normalized, err.response?.status || err.message);
  }

  return null;
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

const secArchivesDocumentUrl = (cik, accessionNumber, documentName = "") => {
  if (!cik || !accessionNumber || !documentName) return null;
  return `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${String(accessionNumber).replace(/-/g, "")}/${documentName}`;
};

const secFilingIndexUrl = (cik, accessionNumber) => {
  if (!cik || !accessionNumber) return null;
  return `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${String(accessionNumber).replace(/-/g, "")}/`;
};

const normalizeSecRecentFilings = (recent = {}) => {
  const forms = recent.form || [];
  return forms.map((form, index) => ({
    form,
    accessionNumber: recent.accessionNumber?.[index] || null,
    filingDate: recent.filingDate?.[index] || null,
    reportDate: recent.reportDate?.[index] || null,
    primaryDocument: recent.primaryDocument?.[index] || null,
    primaryDocDescription: recent.primaryDocDescription?.[index] || null,
    items: recent.items?.[index] || null
  })).filter((filing) => filing.form && filing.accessionNumber);
};

const buildSecDocumentItem = (filing, cik, fallbackTitle = null) => ({
  form: filing?.form || null,
  title:
    fallbackTitle ||
    filing?.primaryDocDescription ||
    filing?.form ||
    "SEC filing",
  filingDate: filing?.filingDate || null,
  reportDate: filing?.reportDate || null,
  items: filing?.items || null,
  url: secArchivesDocumentUrl(cik, filing?.accessionNumber, filing?.primaryDocument),
  indexUrl: secFilingIndexUrl(cik, filing?.accessionNumber),
  accessionNumber: filing?.accessionNumber || null
});

const getSecFilingCategory = (form = "") => {
  const normalized = String(form || "").toUpperCase();
  if (/^10-K/.test(normalized) || /^20-F/.test(normalized) || /^40-F/.test(normalized)) return "annual";
  if (/^10-Q/.test(normalized) || /^6-K/.test(normalized)) return "quarterly";
  if (/^8-K/.test(normalized)) return "current";
  if (/^(DEF 14A|DEFA14A|PRE 14A|PREC14A|DEFM14A|PREM14A)/.test(normalized)) return "proxy";
  if (/^(3|4|5|SC 13|SC 13D|SC 13G|13F|NPORT|N-PORT)/.test(normalized)) return "ownership";
  if (/^(S-|F-|424|FWP|POS|EFFECT|CORRESP|UPLOAD)/.test(normalized)) return "registration";
  return "other";
};

const getSecFilingCategoryLabel = (category = "other") => ({
  annual: "Annual reports",
  quarterly: "Quarterly reports",
  current: "8-K and current reports",
  proxy: "Proxy statements",
  ownership: "Ownership and holders",
  registration: "Registration and prospectus",
  other: "Other SEC filings"
}[category] || "SEC filings");

const buildSecFilingList = (filings, cik, limit = 90) =>
  filings
    .slice(0, limit)
    .map((filing) => {
      const category = getSecFilingCategory(filing.form);
      return {
        ...buildSecDocumentItem(filing, cik),
        title: filing.primaryDocDescription || `${filing.form} filing`,
        type: "SEC",
        source: "SEC EDGAR",
        category,
        categoryLabel: getSecFilingCategoryLabel(category)
      };
    })
    .filter((document) => document.url || document.indexUrl);

const buildFmpFilingDocumentItem = (filing, fallbackTitle = null) => {
  const form = filing?.formType || filing?.form || null;
  return {
    form,
    title: fallbackTitle || `${form || "Filing"} filing`,
    filingDate: String(filing?.filingDate || filing?.date || "").slice(0, 10) || null,
    reportDate: String(filing?.acceptedDate || filing?.filingDate || "").slice(0, 10) || null,
    items: filing?.items || null,
    url: filing?.finalLink || filing?.link || null,
    indexUrl: filing?.link || filing?.finalLink || null,
    accessionNumber: filing?.accessionNumber || null,
    type: "SEC",
    source: "FMP SEC filings"
  };
};

async function fetchFmpCompanyFilings(symbol) {
  if (!process.env.FMP_API_KEY || !canUseFmp()) return [];
  const now = new Date();
  const from = new Date(now);
  from.setUTCFullYear(from.getUTCFullYear() - 5);
  const rows = await getFmpData(symbol, "SEC filings", [
    `/stable/sec-filings-search/symbol?symbol={ticker}&from=${from.toISOString().slice(0, 10)}&to=${now.toISOString().slice(0, 10)}&page=0&limit=250`
  ]);
  return (Array.isArray(rows) ? rows : rows ? [rows] : [])
    .filter((row) => String(row?.symbol || "").trim().toUpperCase() === symbol)
    .sort((a, b) => String(b.filingDate || b.acceptedDate || "").localeCompare(String(a.filingDate || a.acceptedDate || "")));
}

const findLatestSecFact = (companyFacts, concepts, {
  units = ["USD"],
  formTypes = ["10-Q", "10-Q/A", "10-K", "10-K/A"],
  endDate = null,
  maxEndDate = null,
  instantOnly = false
} = {}) => {
  let candidates = [];
  for (const concept of concepts) {
    const conceptUnits = companyFacts?.facts?.["us-gaap"]?.[concept]?.units || {};
    for (const unit of units) {
      const entries = conceptUnits[unit] || [];
      candidates.push(...entries.map((entry) => ({ ...entry, concept, unit })));
    }
  }

  candidates = candidates.filter((entry) => {
    if (!entry.end || !formTypes.includes(entry.form)) return false;
    if (endDate && entry.end !== endDate) return false;
    if (maxEndDate && String(entry.end) > String(maxEndDate)) return false;
    if (instantOnly && entry.start) return false;
    if (!instantOnly && entry.start) {
      const durationDays = (new Date(entry.end) - new Date(entry.start)) / 86400000;
      if (durationDays < 50 || durationDays > 400) return false;
    }
    return true;
  });

  return candidates.sort((a, b) =>
    String(a.end).localeCompare(String(b.end)) ||
    String(a.filed).localeCompare(String(b.filed))
  ).at(-1) || null;
};

const formatSecFactValue = (entry) => {
  const value = toNumberOrNull(entry?.val);
  if (value === null) return null;
  if (entry.unit === "USD/shares") return `$${value.toFixed(2)}`;
  if (Math.abs(value) >= 1000000000) return `$${(value / 1000000000).toFixed(2)}B`;
  if (Math.abs(value) >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  return `$${value.toLocaleString()}`;
};

async function fetchPublicDocumentTitle(url) {
  if (!url) return null;
  try {
    const response = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      },
      timeout: 8000,
      maxRedirects: 4
    });
    const contentType = String(response.headers["content-type"] || "");
    if (!/html|text/i.test(contentType)) return null;
    const $ = cheerio.load(response.data || "");
    const title = $("title").first().text().trim();
    const bodyText = $("body").text().replace(/\s+/g, " ").trim();
    const resultTitle =
      bodyText.match(/([A-Z][A-Z0-9,.'’&\- ]{8,}\s+REPORTS\s+[^.]{20,160}?RESULTS)/)?.[1] ||
      bodyText.match(/([A-Z][A-Z0-9,.'’&\- ]{8,}\s+ANNOUNCES\s+[^.]{20,160}?RESULTS)/)?.[1] ||
      bodyText.match(/([A-Z][A-Z0-9,.'’&\- ]{8,}\s+RELEASES\s+[^.]{20,160}?RESULTS)/)?.[1] ||
      bodyText.match(/([A-Z][A-Za-z0-9,.'’&\- ]{2,}\s+(?:Reports|Announces|Releases)\s+[^.]{12,140}?Results)/)?.[1] ||
      bodyText.match(/([A-Z][A-Za-z0-9,.'’&\- ]{2,}\s+Announces\s+Financial Results for\s+[^.]{8,120}?Fiscal\s+\d{4})/)?.[1];

    return resultTitle || (/^document$/i.test(title) ? null : title) || null;
  } catch {
    return null;
  }
}

const buildStatementRows = (companyFacts, definitions, options) =>
  definitions.map((definition) => {
    const fact = findLatestSecFact(companyFacts, definition.concepts, {
      ...options,
      units: definition.units || ["USD"]
    });
    return {
      label: definition.label,
      value: fact ? toNumberOrNull(fact.val) : null,
      displayValue: fact ? formatSecFactValue(fact) : "N/A",
      concept: fact?.concept || definition.concepts[0],
      periodEnd: fact?.end || null,
      filedDate: fact?.filed || null,
      form: fact?.form || null
    };
  });

const INCOME_STATEMENT_DEFINITIONS = [
  { label: "Revenue", concepts: ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet", "OperatingRevenues", "RevenuesNetOfInterestExpense"] },
  { label: "Gross Profit", concepts: ["GrossProfit", "InterestIncomeExpenseNet"] },
  { label: "Operating Income", concepts: ["OperatingIncomeLoss", "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest"] },
  { label: "Pretax Income", concepts: ["IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest", "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments"] },
  { label: "Net Income", concepts: ["NetIncomeLoss", "ProfitLoss", "NetIncomeLossAvailableToCommonStockholdersBasic"] },
  { label: "Diluted EPS", concepts: ["EarningsPerShareDiluted", "EarningsPerShareBasicAndDiluted"], units: ["USD/shares"] }
];

const BALANCE_SHEET_DEFINITIONS = [
  { label: "Cash & Equivalents", concepts: ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"] },
  { label: "Total Assets", concepts: ["Assets"] },
  { label: "Current Debt", concepts: ["DebtCurrent", "LongTermDebtCurrent", "ShortTermBorrowings", "LongTermDebtAndFinanceLeaseObligationsCurrent"] },
  { label: "Long-Term Debt", concepts: ["LongTermDebtNoncurrent", "LongTermDebtAndFinanceLeaseObligationsNoncurrent"] },
  { label: "Total Liabilities", concepts: ["Liabilities"] },
  { label: "Shareholders' Equity", concepts: ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"] }
];

const CASH_FLOW_DEFINITIONS = [
  { label: "Operating Cash Flow", concepts: ["NetCashProvidedByUsedInOperatingActivities", "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations"] },
  { label: "Capital Expenditures", concepts: ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets", "PaymentsForAdditionsToPropertyPlantAndEquipment"] },
  { label: "Dividends Paid", concepts: ["PaymentsOfDividends", "PaymentsOfDividendsCommonStock"] },
  { label: "Share Repurchases", concepts: ["PaymentsForRepurchaseOfCommonStock", "PaymentsForRepurchaseOfEquity"] },
  { label: "Cash Change", concepts: ["CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsPeriodIncreaseDecreaseIncludingExchangeRateEffect", "CashAndCashEquivalentsPeriodIncreaseDecrease"] }
];

const INSURANCE_BENEFIT_EXPENSE_CONCEPTS = [
  "PolicyholderBenefitsAndClaimsIncurredNet",
  "PolicyholderBenefitsAndClaimsIncurredHealthCare",
  "BenefitsLossesAndExpenses",
  "LiabilityForUnpaidClaimsAndClaimsAdjustmentExpenseIncurredClaims1",
  "SupplementalInformationForPropertyCasualtyInsuranceUnderwritersCurrentYearClaimsAndClaimsAdjustmentExpense"
];

async function fetchSecFilingExhibits(cik, filing) {
  if (!filing?.accessionNumber) return [];
  try {
    const response = await axios.get(
      `${secFilingIndexUrl(cik, filing.accessionNumber)}index.json`,
      {
        headers: { "User-Agent": "InvestmentTerminal/1.0 contact@investmentterminal.app" },
        timeout: 8000
      }
    );
    const items = response.data?.directory?.item || [];
    const exhibitItems = items
      .filter((item) => {
        const name = String(item.name || "");
        return /\.(htm|html|pdf)$/i.test(name) &&
          (/ex[-_]?99|exhibit|earnings|release|results|presentation|(?:^|[^0-9])99[._-]?1|991|(?:^|[._-])pr(?:[._-]|\.)|pr\.(?:htm|html|pdf)$/i.test(name));
      })
      .slice(0, 12);

    const documents = await Promise.all(exhibitItems.map(async (item) => {
      const url = secArchivesDocumentUrl(cik, filing.accessionNumber, item.name);
      const title = await fetchPublicDocumentTitle(url);
      const label = `${title || ""} ${item.name}`;
      const score =
        scoreIrResultsDocument(label, url, 0) +
        (/(?:^|[^0-9])99[._-]?1|991/i.test(item.name) ? 18 : 0) +
        (/(?:^|[._-])pr(?:[._-]|\.)|pr\.(?:htm|html|pdf)$/i.test(item.name) ? 16 : 0) +
        (/ex[-_]?99/i.test(item.name) ? 10 : 0) -
        (/slides|presentation|deck/i.test(label) && !/release|reports? .*results/i.test(label) ? 16 : 0);
      return {
        title: title || item.name,
        url,
        type: /\.pdf$/i.test(item.name) ? "PDF" : "HTML",
        source: "SEC exhibit",
        score
      };
    }));
    return documents.sort((a, b) => b.score - a.score).slice(0, 8);
  } catch (err) {
    console.log("SEC exhibits skipped:", filing.form, err.response?.status || err.message);
    return [];
  }
}

async function fetchCompanyDocuments(ticker) {
  const symbol = String(ticker || "").trim().toUpperCase();
  const cached = companyDocumentsCache.get(symbol);
  if (cached && Date.now() - cached.fetchedAt < 3 * 60 * 60 * 1000) {
    return cached.data;
  }
  const inFlight = companyDocumentsInFlight.get(symbol);
  if (inFlight) return inFlight;

  const fetchPromise = (async () => {
    try {
      const [filings, fmpProfile] = await Promise.all([
        resolveWithin(fetchFmpCompanyFilings(symbol), 3500, []),
        resolveWithin(fetchFmpStableQuoteProfile(symbol), 1200, {})
      ]);
      if (!filings.length) {
        const data = {
          available: false,
          symbol,
          companyName: fmpProfile.name || symbol,
          updatedAt: new Date().toISOString(),
          filings: {},
          allSecFilings: [],
          filingCounts: { all: 0 },
          resultDocuments: [],
          investorRelationsDocuments: [],
          earningsExhibits: [],
          message: "FMP filings are not available for this ticker yet."
        };
        companyDocumentsCache.set(symbol, { data, fetchedAt: Date.now() });
        return data;
      }

      const allSecFilings = filings.map((filing) => {
        const document = buildFmpFilingDocumentItem(filing);
        const category = getSecFilingCategory(document.form);
        return {
          ...document,
          title: `${document.form || "Filing"} filing`,
          category,
          categoryLabel: getSecFilingCategoryLabel(category)
        };
      }).filter((document) => document.url || document.indexUrl);
      const filingCounts = allSecFilings.reduce((counts, filing) => {
        counts[filing.category] = (counts[filing.category] || 0) + 1;
        counts.all = (counts.all || 0) + 1;
        return counts;
      }, { all: 0 });
      const latest10k = filings.find((filing) => /^10-K/i.test(filing.formType || filing.form || ""));
      const latest10q = filings.find((filing) => /^10-Q/i.test(filing.formType || filing.form || ""));
      const latest8k = filings.find((filing) => /^8-K/i.test(filing.formType || filing.form || ""));
      const latestEarnings8k =
        filings.find((filing) =>
          /^8-K/i.test(filing.formType || filing.form || "") &&
          (filing.hasFinancials === true || /results|earnings|quarter|annual|financial/i.test(`${filing.finalLink || ""} ${filing.link || ""}`))
        ) || latest8k;
      const resultDocuments = [latestEarnings8k]
        .filter(Boolean)
        .map((filing) => buildFmpFilingDocumentItem(filing, "Latest earnings/results filing"));

      const data = {
        available: true,
        symbol,
        companyName: fmpProfile.name || symbol,
        cik: filings.find((filing) => filing.cik)?.cik || null,
        updatedAt: new Date().toISOString(),
        filings: {
          tenK: latest10k ? buildFmpFilingDocumentItem(latest10k, "Latest 10-K annual report") : null,
          tenQ: latest10q ? buildFmpFilingDocumentItem(latest10q, "Latest 10-Q quarterly report") : null,
          earningsRelease: latestEarnings8k ? buildFmpFilingDocumentItem(latestEarnings8k, "Latest earnings/results 8-K") : null,
          latest8K: latest8k ? buildFmpFilingDocumentItem(latest8k, "Latest 8-K") : null
        },
        allSecFilings,
        filingCounts,
        resultDocuments,
        investorRelationsDocuments: [],
        earningsExhibits: resultDocuments
      };

      companyDocumentsCache.set(symbol, { data, fetchedAt: Date.now() });
      return data;
    } catch (err) {
      console.log("FMP company filings skipped:", symbol, err.response?.status || err.message);
      const data = {
        available: false,
        symbol,
        companyName: symbol,
        updatedAt: new Date().toISOString(),
        filings: {},
        allSecFilings: [],
        filingCounts: { all: 0 },
        resultDocuments: [],
        investorRelationsDocuments: [],
        earningsExhibits: [],
        message: "FMP filings are temporarily unavailable for this ticker."
      };
      companyDocumentsCache.set(symbol, { data, fetchedAt: Date.now() });
      return data;
    }
  })().finally(() => {
    companyDocumentsInFlight.delete(symbol);
  });

  companyDocumentsInFlight.set(symbol, fetchPromise);
  return fetchPromise;
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
          "PremiumsEarnedNet",
          "RevenueFromContractWithCustomerExcludingAssessedTax",
          "SalesRevenueNet"
        ]
      : [
          "RevenueFromContractWithCustomerExcludingAssessedTax",
          "OperatingRevenues",
          "Revenues",
          "PremiumsEarnedNet",
          "SalesRevenueNet",
          "RevenuesNetOfInterestExpense"
        ];
    let revenue = null;
    let revenueConcept = null;
    for (const concept of revenueConcepts) {
      const candidate = secAnnualFactEntries(facts, concept).at(-1);
      const candidateValue = Math.abs(toNumberOrNull(candidate?.val) || 0);
      const revenueValue = Math.abs(toNumberOrNull(revenue?.val) || 0);
      if (
        candidate &&
        (
          !revenue ||
          String(candidate.end) > String(revenue.end) ||
          (
            String(candidate.end) === String(revenue.end) &&
            candidateValue > revenueValue * 1.2
          )
        )
      ) {
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
    const insuranceBenefitExpense = latestSecAnnualFact(facts, INSURANCE_BENEFIT_EXPENSE_CONCEPTS, endDate);
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
      const interimInsuranceBenefitExpense = latestSecInterimFact(
        facts,
        INSURANCE_BENEFIT_EXPENSE_CONCEPTS,
        interimEnd,
        interimRevenueEntry
      );
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
        insuranceBenefitExpense: interimInsuranceBenefitExpense,
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
      const annualInsuranceBenefitExpense = latestSecAnnualFact(
        facts,
        INSURANCE_BENEFIT_EXPENSE_CONCEPTS,
        yearEnd
      );
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
          : annualInsuranceBenefitExpense?.val !== undefined
            ? revenueEntry.val - annualInsuranceBenefitExpense.val
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
            : interimFacts?.insuranceBenefitExpense?.val !== undefined
              ? interimRevenueEntry.val - interimFacts.insuranceBenefitExpense.val
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
          costOfRevenue?.val !== undefined
            ? revenue.val - costOfRevenue.val
            : insuranceBenefitExpense?.val !== undefined
              ? revenue.val - insuranceBenefitExpense.val
              : null
        );
    const annualHistoryRows = revenueEntries.slice(-6).map((revenueEntry) => {
      const yearEnd = revenueEntry.end;
      const annualNetIncome = latestSecAnnualFact(facts, [
        "NetIncomeLoss",
        "ProfitLoss",
        "NetIncomeLossAvailableToCommonStockholdersBasic"
      ], yearEnd);
      const annualGrossProfit = latestSecAnnualFact(facts, ["GrossProfit"], yearEnd);
      const annualCostOfRevenue = latestSecAnnualFact(facts, [
        "CostOfGoodsAndServicesSold",
        "CostOfRevenue"
      ], yearEnd);
      const annualInsuranceBenefitExpense = latestSecAnnualFact(
        facts,
        INSURANCE_BENEFIT_EXPENSE_CONCEPTS,
        yearEnd
      );
      const annualOperatingIncome = latestSecAnnualFact(
        facts,
        ["OperatingIncomeLoss"],
        yearEnd
      );
      const annualOperatingCashFlow = latestSecAnnualFact(facts, [
        "NetCashProvidedByUsedInOperatingActivities",
        "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations"
      ], yearEnd);
      const annualCapitalExpenditures = latestSecAnnualFact(facts, [
        "PaymentsToAcquirePropertyPlantAndEquipment",
        "PaymentsToAcquireProductiveAssets",
        "PaymentsForAdditionsToPropertyPlantAndEquipment",
        "PaymentsToAcquirePropertyPlantAndEquipmentAndIntangibleAssets"
      ], yearEnd);
      const annualEps = latestSecAnnualFact(facts, [
        "EarningsPerShareDiluted",
        "EarningsPerShareBasicAndDiluted",
        "EarningsPerShareBasic"
      ], yearEnd);
      const annualGrossProfitValue = annualGrossProfit?.val ?? (
        annualCostOfRevenue?.val !== undefined
          ? revenueEntry.val - annualCostOfRevenue.val
          : annualInsuranceBenefitExpense?.val !== undefined
            ? revenueEntry.val - annualInsuranceBenefitExpense.val
          : null
      );

      return {
        year: Number(revenueEntry.fy || yearEnd.slice(0, 4)),
        period: String(revenueEntry.fy || yearEnd.slice(0, 4)),
        isInterim: false,
        revenue: revenueEntry.val / 1000000000,
        earnings: annualNetIncome?.val !== undefined
          ? annualNetIncome.val / 1000000000
          : null,
        grossProfit:
          annualGrossProfitValue !== null && annualGrossProfitValue !== undefined
            ? annualGrossProfitValue / 1000000000
            : null,
        operatingIncome: annualOperatingIncome?.val !== undefined
          ? annualOperatingIncome.val / 1000000000
          : null,
        operatingCashflow: annualOperatingCashFlow?.val !== undefined
          ? annualOperatingCashFlow.val / 1000000000
          : null,
        freeCashflow:
          annualOperatingCashFlow?.val !== undefined &&
          annualCapitalExpenditures?.val !== undefined
            ? (annualOperatingCashFlow.val - Math.abs(annualCapitalExpenditures.val)) / 1000000000
            : null,
        eps: annualEps?.val ?? null,
        source: "SEC annual filing"
      };
    });
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
        ...annualHistoryRows,
        ...interimRevenueEntries.map((interimRevenueEntry) => {
          const interimFacts = buildInterimFacts(interimRevenueEntry);
          const interimGrossProfitValue = interimFacts?.grossProfit?.val ?? (
            interimFacts?.costOfRevenue?.val !== undefined
              ? interimRevenueEntry.val - interimFacts.costOfRevenue.val
              : interimFacts?.insuranceBenefitExpense?.val !== undefined
                ? interimRevenueEntry.val - interimFacts.insuranceBenefitExpense.val
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

async function fetchUsdRate(currency, fallbackRate) {
  const code = String(currency || "").toUpperCase();
  if (!code || code === "USD") return 1;

  const cached = fxRateCache.get(code);
  if (cached && Date.now() - cached.fetchedAt < 12 * 60 * 60 * 1000) {
    return cached.rate;
  }

  try {
    const { data } = await axios.get(
      `https://open.er-api.com/v6/latest/${encodeURIComponent(code)}`,
      { timeout: 2500 }
    );
    const rate = toNumberOrNull(data?.rates?.USD);
    if (rate !== null && rate > 0) {
      fxRateCache.set(code, { rate, fetchedAt: Date.now() });
      return rate;
    }
  } catch (err) {
    console.log("FX rate skipped:", code, err.message);
  }

  return fallbackRate;
}

function convertMoneyFields(row, usdRate, fields) {
  if (!row) return row;
  const next = { ...row };
  fields.forEach((field) => {
    const value = toNumberOrNull(next[field]);
    if (value !== null) next[field] = value * usdRate;
  });
  return next;
}

function convertForeignAdrRow(row, config, usdRate, sharesOutstanding = null) {
  if (!row) return row;
  const next = convertMoneyFields(row, usdRate, [
    "revenue",
    "earnings",
    "grossProfit",
    "operatingIncome",
    "operatingCashflow",
    "freeCashflow"
  ]);
  if (config.recomputeEpsFromConvertedEarnings && sharesOutstanding) {
    const recalculatedEps = computeEpsFromEarningsAndShares(next.earnings, sharesOutstanding);
    if (recalculatedEps !== null) next.eps = recalculatedEps;
  } else {
    const eps = toNumberOrNull(row.eps);
    if (eps !== null) next.eps = eps * config.adrRatio * usdRate;
  }
  next.sourceCurrency = config.sourceCurrency;
  next.displayCurrency = config.displayCurrency;
  return next;
}

function normalizeForeignAdrEpsEstimate(value, config, usdRate, options = {}) {
  const number = toNumberOrNull(value);
  if (number === null) return value;
  const localCurrencyThreshold =
    options.localCurrencyThreshold ||
    config.localCurrencyEpsThreshold ||
    40;
  return Math.abs(number) >= localCurrencyThreshold
    ? number * config.adrRatio * usdRate
    : number;
}

function normalizeForeignAdrMoneyEstimate(value, usdRate, threshold) {
  const number = toNumberOrNull(value);
  if (number === null) return value;
  return Math.abs(number) >= threshold ? number * usdRate : number;
}

function normalizeForeignAdrMarketCap(value, usdRate, config = {}) {
  const number = toNumberOrNull(value);
  if (number === null) return null;
  if (config.marketCapMultiplier) return number * config.marketCapMultiplier;
  return Math.abs(number) >= 10000000000000 ? number * usdRate : number;
}

function normalizeForeignAdrEstimateBlock(block, config, usdRate, sharesOutstanding, options = {}) {
  if (!block) return block;
  const revenueThreshold = options.quarterly ? 300000000000 : 1000000000000;
  const earningsThreshold = options.quarterly ? 100000000000 : 500000000000;
  const eps = normalizeForeignAdrEpsEstimate(block.eps, config, usdRate, {
    localCurrencyThreshold: options.quarterly ? 8 : 40
  });
  const revenue = normalizeForeignAdrMoneyEstimate(block.revenue, usdRate, revenueThreshold);
  const rawEarnings = normalizeForeignAdrMoneyEstimate(block.earnings, usdRate, earningsThreshold);
  const ebitda = normalizeForeignAdrMoneyEstimate(block.ebitda, usdRate, earningsThreshold);
  const ebit = normalizeForeignAdrMoneyEstimate(block.ebit, usdRate, earningsThreshold);
  const sgaExpense = normalizeForeignAdrMoneyEstimate(block.sgaExpense, usdRate, earningsThreshold);
  const earnings =
    toNumberOrNull(rawEarnings) !== null
      ? rawEarnings
      : toNumberOrNull(eps) !== null && sharesOutstanding
        ? eps * sharesOutstanding * 1000000
        : block.earnings;

  return {
    ...block,
    revenue,
    earnings,
    ebitda,
    ebit,
    sgaExpense,
    eps
  };
}

function normalizeForeignAdrEpsBeatMissRows(rows, config, usdRate) {
  if (!Array.isArray(rows)) return rows;
  return rows.map((row) => {
    const epsOptions = { localCurrencyThreshold: 8 };
    const estimate = normalizeForeignAdrEpsEstimate(row.estimate, config, usdRate, epsOptions);
    const actual = normalizeForeignAdrEpsEstimate(row.actual, config, usdRate, epsOptions);
    const gaapActual = normalizeForeignAdrEpsEstimate(row.gaapActual, config, usdRate, epsOptions);
    const surprise = toNumberOrNull(actual) !== null && toNumberOrNull(estimate) !== null
      ? actual - estimate
      : normalizeForeignAdrEpsEstimate(row.surprise, config, usdRate, epsOptions);
    const gaapSurprise = toNumberOrNull(gaapActual) !== null && toNumberOrNull(estimate) !== null
      ? gaapActual - estimate
      : normalizeForeignAdrEpsEstimate(row.gaapSurprise, config, usdRate, epsOptions);

    return {
      ...row,
      estimate,
      actual,
      gaapActual,
      surprise,
      gaapSurprise
    };
  });
}

function recalculatedHistoricalPe(rows = [], yearEndPrices = []) {
  const priceByYear = new Map(
    (yearEndPrices || [])
      .map((row) => [Number(row.year), toNumberOrNull(row.close)])
      .filter(([, close]) => close !== null)
  );

  return rows
    .filter((row) => !row?.isInterim && row?.year)
    .map((row) => {
      const price = priceByYear.get(Number(row.year));
      const eps = toNumberOrNull(row.eps);
      return {
        year: row.year,
        period: row.period || String(row.year),
        isInterim: false,
        pe: price !== undefined && eps !== null && eps !== 0 ? price / eps : null,
        price,
        eps,
        source: row.source
      };
    })
    .filter((row) => row.pe !== null && Number.isFinite(row.pe) && Math.abs(row.pe) < 1000)
    .slice(-6);
}

const isoDateOnly = (date) =>
  Number.isNaN(date?.getTime?.()) ? "" : date.toISOString().slice(0, 10);

async function fetchFmpDailyPricesForDates(ticker, dates = []) {
  const symbol = String(ticker || "").trim().toUpperCase();
  const cleanDates = (dates || [])
    .map((date) => new Date(`${String(date || "").slice(0, 10)}T00:00:00Z`))
    .filter((date) => !Number.isNaN(date.getTime()));
  if (!symbol || !cleanDates.length || !process.env.FMP_API_KEY || !canUseFmp()) return new Map();

  const minDate = new Date(Math.min(...cleanDates.map((date) => date.getTime())));
  const maxDate = new Date(Math.max(...cleanDates.map((date) => date.getTime())));
  minDate.setUTCDate(minDate.getUTCDate() - 8);
  maxDate.setUTCDate(maxDate.getUTCDate() + 2);
  const cacheLabel = `historical PE prices:${isoDateOnly(minDate)}:${isoDateOnly(maxDate)}`;

  try {
    const rows = await getFmpData(symbol, cacheLabel, [
      `/stable/historical-price-eod/light?symbol={ticker}&from=${isoDateOnly(minDate)}&to=${isoDateOnly(maxDate)}`
    ]);
    const prices = (Array.isArray(rows) ? rows : [])
      .map((row) => ({
        date: String(row.date || "").slice(0, 10),
        time: new Date(`${String(row.date || "").slice(0, 10)}T00:00:00Z`).getTime(),
        price: firstFiniteNumber(row.price, row.close, row.adjClose)
      }))
      .filter((row) => row.date && !Number.isNaN(row.time) && row.price !== null)
      .sort((a, b) => a.time - b.time);

    const priceByTarget = new Map();
    cleanDates.forEach((targetDate) => {
      const targetTime = targetDate.getTime();
      const closest = [...prices]
        .filter((row) => row.time <= targetTime)
        .at(-1) || prices.find((row) => row.time > targetTime);
      if (closest) priceByTarget.set(isoDateOnly(targetDate), closest);
    });
    return priceByTarget;
  } catch (err) {
    setFmpCooldown(err, "historical PE prices", symbol);
    console.log("FMP historical PE prices skipped:", symbol, err.response?.status || err.message);
    return new Map();
  }
}

async function calculateFmpQuarterlyHistoricalPe(ticker, revenueRows = []) {
  let sourceRows = Array.isArray(revenueRows) ? revenueRows : [];
  const hasDatedQuarterlyRows = sourceRows.some((row) =>
    row?.isInterim &&
    (row.date || row.reportDate || row.fillingDate || row.acceptedDate)
  );
  if (!hasDatedQuarterlyRows) {
    const freshRows = await resolveWithin(fetchFmpQuarterlyFinancialHistory(ticker), 2600, []);
    if (Array.isArray(freshRows) && freshRows.some((row) => row.date)) {
      sourceRows = freshRows;
    }
  }

  const quarterlyRows = sourceRows
    .filter((row) =>
      row?.isInterim &&
      !row?.isCurrent &&
      toNumberOrNull(row.eps) !== null &&
      String(row.period || "").match(/Q[1-4]/i)
    )
    .sort((a, b) => {
      const yearDiff = Number(a.year) - Number(b.year);
      if (yearDiff !== 0) return yearDiff;
      return String(a.period || "").localeCompare(String(b.period || ""));
    });
  if (quarterlyRows.length < 4) return [];

  const dates = quarterlyRows
    .map((row) => row.date || row.reportDate || row.fillingDate || row.acceptedDate)
    .filter(Boolean);
  const pricesByDate = await fetchFmpDailyPricesForDates(ticker, dates);

  return quarterlyRows
    .map((row, index) => {
      if (index < 3) return null;
      const trailingRows = quarterlyRows.slice(index - 3, index + 1);
      const trailingEps = trailingRows.reduce((sum, item) => sum + (toNumberOrNull(item.eps) || 0), 0);
      const targetDate = isoDateOnly(new Date(`${String(row.date || row.reportDate || row.fillingDate || row.acceptedDate || "").slice(0, 10)}T00:00:00Z`));
      const priceRow = pricesByDate.get(targetDate);
      const price = priceRow?.price ?? null;
      const pe = price !== null && trailingEps > 0 ? price / trailingEps : null;
      return {
        year: row.year,
        period: row.period || String(row.year),
        date: row.date || null,
        isInterim: true,
        pe,
        price,
        eps: trailingEps,
        source: "FMP quarter-end price / trailing four-quarter EPS"
      };
    })
    .filter((row) => row && toNumberOrNull(row.pe) !== null && Number.isFinite(row.pe) && Math.abs(row.pe) < 1000)
    .slice(-24);
}

async function fetchStockAnalysisHistoricalPe(ticker) {
  const symbol = getStockAnalysisPath(ticker);
  const cached = stockAnalysisHistoricalPeCache.get(symbol);
  if (cached && Date.now() - cached.fetchedAt < 6 * 60 * 60 * 1000) {
    return cached.data;
  }

  try {
    const { data } = await axios.get(buildStockAnalysisUrl(ticker, "financials/ratios/"), {
      headers: STOCK_ANALYSIS_HEADERS,
      timeout: 5500
    });
    const $ = cheerio.load(data || "");
    const table = $("table").first();
    if (!table.length) return [];

    const headers = table.find("thead tr").first().find("th").toArray()
      .slice(1)
      .map((cell) => $(cell).text().replace(/\s+/g, " ").trim());
    let peValues = [];
    table.find("tbody tr").each((_, row) => {
      if (peValues.length) return;
      const cells = $(row).find("th,td").toArray();
      const label = $(cells[0]).text().replace(/\s+/g, " ").trim().toLowerCase();
      if (label !== "pe ratio" && label !== "p/e ratio") return;
      peValues = cells.slice(1).map((cell) => parseStockAnalysisNumber($(cell).text()));
    });

    const rows = headers
      .map((header, index) => {
        if (/^current$/i.test(header)) return null;
        const year = Number(header.match(/\b(?:FY\s*)?(\d{4})\b/i)?.[1]);
        const pe = toNumberOrNull(peValues[index]);
        if (!Number.isFinite(year) || pe === null || Math.abs(pe) >= 1000) return null;
        return {
          year,
          period: String(year),
          isInterim: false,
          pe,
          source: "StockAnalysis ratios"
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.year - b.year)
      .slice(-6);

    if (rows.length) {
      stockAnalysisHistoricalPeCache.set(symbol, { data: rows, fetchedAt: Date.now() });
    }
    return rows;
  } catch (err) {
    setStockAnalysisCooldown(err, "historical PE", ticker);
    console.log("StockAnalysis historical PE skipped:", ticker, err.response?.status || err.message);
    return [];
  }
}

const sanitizeFmpAdrMetricCards = (data = {}) => ({
  ...data,
  forwardPE: null,
  forwardPS: null,
  cashAndCashEquivalents: null,
  totalCash: null,
  totalDebt: null,
  netCash: null,
  netCashPerShare: null,
  equityBookValue: null,
  bookValuePerShare: null,
  workingCapital: null,
  freeCashflow: null,
  operatingCashflow: null,
  revenuePerEmployee: null,
  profitsPerEmployee: null,
  balanceSheetAsOf: null,
  balanceSheetSource: null
});

const finalizeStockMetricCardResponse = (ticker, data = {}) =>
  FOREIGN_ADR_CONFIG[ticker] &&
  data.isAdr === true &&
  data.valuationMetricsVersion === VALUATION_METRICS_VERSION
    ? sanitizeFmpAdrMetricCards(data)
    : data;

async function finalizeStockResponseForClient(ticker, data = {}) {
  const adrNormalized = await normalizeForeignAdrStockData(ticker, data);
  const currencyNormalized = await normalizeForeignFinancialCurrencyStockData(ticker, adrNormalized);
  return finalizeStockMetricCardResponse(ticker, currencyNormalized);
}

function latestAnnualRevenueMagnitude(data = {}) {
  const annualRows = Array.isArray(data.revenueData)
    ? data.revenueData.filter((row) => !row?.isInterim && toNumberOrNull(row?.revenue) !== null)
    : [];
  const latest = annualRows[annualRows.length - 1] || {};
  return toNumberOrNull(latest.revenue);
}

async function fetchFmpReportedFinancialCurrency(ticker) {
  const symbol = String(ticker || "").trim().toUpperCase();
  if (!symbol || !process.env.FMP_API_KEY || !canUseFmp()) return null;
  try {
    const rows = await getFmpData(symbol, "reported financial currency", [
      "/stable/income-statement?symbol={ticker}&period=annual&limit=1"
    ]);
    const row = Array.isArray(rows) ? rows[0] || {} : rows || {};
    return firstText(row.reportedCurrency, row.currency) || null;
  } catch (err) {
    setFmpCooldown(err, "reported financial currency", symbol);
    console.log("FMP reported currency skipped:", symbol, err.response?.status || err.message);
    return null;
  }
}

async function normalizeForeignAdrStockData(ticker, data = {}) {
  const config = FOREIGN_ADR_CONFIG[ticker];
  if (!config) {
    return data;
  }
  if (data.currencyAdjustedFor === `${ticker}_${config.displayCurrency}_ADR`) {
    const latestAnnualRevenue = latestAnnualRevenueMagnitude(data);
    const looksAlreadyConverted =
      latestAnnualRevenue === null ||
      Math.abs(latestAnnualRevenue) < (config.convertedRevenueBillionsThreshold || 1000);
    if (data.foreignCurrencyConversionVersion === FOREIGN_CURRENCY_CONVERSION_VERSION || looksAlreadyConverted) {
      const versionedData = {
        ...data,
        foreignCurrencyConversionVersion: FOREIGN_CURRENCY_CONVERSION_VERSION
      };
      return versionedData.isAdr === true && versionedData.valuationMetricsVersion === VALUATION_METRICS_VERSION
        ? sanitizeFmpAdrMetricCards(versionedData)
        : versionedData;
    }
  }

  const usdRate = await fetchUsdRate(config.sourceCurrency, config.fallbackUsdRate);
  if (!usdRate) return data;

  const rawMarketCap = toNumberOrNull(data.marketCap);
  const price = toNumberOrNull(data.price);
  const marketCap = normalizeForeignAdrMarketCap(rawMarketCap, usdRate, config);
  const sharesOutstanding =
    marketCap !== null && price
      ? marketCap / price / 1000000
      : toNumberOrNull(data.sharesOutstanding);
  const revenueData = Array.isArray(data.revenueData)
    ? data.revenueData.map((row) => convertForeignAdrRow(row, config, usdRate, sharesOutstanding))
    : data.revenueData;
  const revenueHistory = Array.isArray(data.revenueHistory)
    ? data.revenueHistory.map((row) => convertMoneyFields(row, usdRate, ["value", "revenue"]))
    : data.revenueHistory;

  const analystEstimates = data.analystEstimates
    ? {
        ...data.analystEstimates,
        nextQuarter: normalizeForeignAdrEstimateBlock(
          data.analystEstimates.nextQuarter,
          config,
          usdRate,
          sharesOutstanding,
          { quarterly: true }
        ),
        currentYear: normalizeForeignAdrEstimateBlock(
          data.analystEstimates.currentYear,
          config,
          usdRate,
          sharesOutstanding
        ),
        nextYear: normalizeForeignAdrEstimateBlock(
          data.analystEstimates.nextYear,
          config,
          usdRate,
          sharesOutstanding
        ),
        followingYear: normalizeForeignAdrEstimateBlock(
          data.analystEstimates.followingYear,
          config,
          usdRate,
          sharesOutstanding
        ),
        futureYears: Array.isArray(data.analystEstimates.futureYears)
          ? data.analystEstimates.futureYears.map((row) =>
              normalizeForeignAdrEstimateBlock(row, config, usdRate, sharesOutstanding)
            )
          : data.analystEstimates.futureYears
      }
    : data.analystEstimates;
  const epsBeatMiss = normalizeForeignAdrEpsBeatMissRows(data.epsBeatMiss, config, usdRate);
  const yearEndPrices = await fetchYahooYearEndPrices(ticker).catch(() => []);
  const existingAnnualHistoricalPe = Array.isArray(data.historicalPe)
    ? data.historicalPe.filter((row) => !row?.isInterim && !row?.isCurrent && toNumberOrNull(row?.pe) !== null)
    : [];
  const annualHistoricalPe = existingAnnualHistoricalPe.length >= 3
    ? existingAnnualHistoricalPe
    : Array.isArray(revenueData)
      ? recalculatedHistoricalPe(revenueData, yearEndPrices)
      : [];
  const currentPeRows = Array.isArray(data.historicalPe)
    ? data.historicalPe.filter((row) => row?.isCurrent || row?.isInterim)
    : [];
  const currentRevenue = toNumberOrNull(analystEstimates?.currentYear?.revenue);
  const latestAnnualEps = Array.isArray(revenueData)
    ? [...revenueData].reverse().find((row) => !row?.isInterim && toNumberOrNull(row?.eps) !== null)?.eps
    : null;
  const normalizedPe =
    price && toNumberOrNull(latestAnnualEps) !== null && latestAnnualEps !== 0
      ? price / latestAnnualEps
      : data.pe;
  const topLevelMoney = convertMoneyFields(data, usdRate, [
    "cashAndCashEquivalents",
    "equityBookValue",
    "freeCashflow",
    "netCash",
    "operatingCashflow",
    "workingCapital",
    "totalCash",
    "totalDebt",
    "revenuePerEmployee",
    "profitsPerEmployee"
  ]);
  const convertedBookValuePerShare = toNumberOrNull(data.bookValuePerShare) !== null
    ? data.bookValuePerShare * config.adrRatio * usdRate
    : data.bookValuePerShare;
  const convertedNetCashPerShare = toNumberOrNull(data.netCashPerShare) !== null
    ? data.netCashPerShare * config.adrRatio * usdRate
    : data.netCashPerShare;
  const normalizedPriceToBook =
    toNumberOrNull(data.priceToBook) !== null && data.priceToBook > 0.1
      ? data.priceToBook
      : price && toNumberOrNull(convertedBookValuePerShare) !== null && convertedBookValuePerShare > 0
        ? price / convertedBookValuePerShare
        : data.priceToBook;

  const normalized = {
    ...topLevelMoney,
    revenueData,
    revenueHistory,
    marketCap: marketCap ?? data.marketCap,
    sharesOutstanding,
    pe: normalizedPe,
    trailingEps: latestAnnualEps ?? data.trailingEps,
    bookValuePerShare: convertedBookValuePerShare,
    netCashPerShare: convertedNetCashPerShare,
    priceToBook: normalizedPriceToBook,
    priceToSales:
      marketCap !== null && currentRevenue && currentRevenue > 0
        ? marketCap / currentRevenue
        : data.priceToSales,
    analystEstimates,
    epsBeatMiss,
    historicalPe: mergeHistoricalPeRows(annualHistoricalPe, currentPeRows),
    financialCurrency: config.displayCurrency,
    sourceFinancialCurrency: config.sourceCurrency,
    adrRatio: config.adrRatio,
    currencyAdjustedFor: `${ticker}_${config.displayCurrency}_ADR`,
    foreignCurrencyConversionVersion: FOREIGN_CURRENCY_CONVERSION_VERSION
  };

  if (data.isAdr === true && data.valuationMetricsVersion === VALUATION_METRICS_VERSION) {
    return sanitizeFmpAdrMetricCards({
      ...normalized,
      pe: data.pe,
      priceToSales: data.priceToSales,
      priceToBook: data.priceToBook,
      priceToTangibleBook: data.priceToTangibleBook,
      priceToFreeCashflow: data.priceToFreeCashflow,
      priceToOperatingCashflow: data.priceToOperatingCashflow,
      pegRatio: data.pegRatio
    });
  }

  return normalized;
}

function convertGenericForeignRowToUsd(row, usdRate) {
  if (!row) return row;
  const next = convertMoneyFields(row, usdRate, [
    "revenue",
    "earnings",
    "grossProfit",
    "operatingIncome",
    "operatingCashflow",
    "freeCashflow",
    "ebitda",
    "ebit",
    "sgaExpense",
    "value"
  ]);
  const eps = toNumberOrNull(row.eps);
  if (eps !== null) next.eps = eps * usdRate;
  next.sourceCurrency = row.sourceCurrency || null;
  next.displayCurrency = "USD";
  return next;
}

const HIGH_SCALE_FINANCIAL_CURRENCIES = new Set(["JPY", "KRW", "TWD", "CNY", "IDR", "VND"]);

function convertGenericEstimateBlockToUsd(block, usdRate, options = {}) {
  if (!block) return block;
  const sourceCurrency = String(options.sourceCurrency || "").toUpperCase();
  const useScaleGuard = HIGH_SCALE_FINANCIAL_CURRENCIES.has(sourceCurrency);
  const threshold = options.quarterly ? 300000000000 : 1000000000000;
  const next = { ...block };
  ["revenue", "earnings", "ebitda", "ebit", "sgaExpense"].forEach((field) => {
    const value = toNumberOrNull(next[field]);
    if (value === null) return;
    if (!useScaleGuard || Math.abs(value) >= threshold) next[field] = value * usdRate;
  });
  const eps = toNumberOrNull(block.eps);
  if (eps !== null && (!useScaleGuard || Math.abs(eps) >= (options.quarterly ? 8 : 40))) {
    next.eps = eps * usdRate;
  }
  return next;
}

const convertGenericEstimateBlocksToUsd = (rows, usdRate, options = {}) =>
  Array.isArray(rows)
    ? rows.map((row) => convertGenericEstimateBlockToUsd(row, usdRate, options))
    : rows;

function convertGenericEpsBeatMissToUsd(rows, usdRate) {
  if (!Array.isArray(rows)) return rows;
  return rows.map((row) => {
    const next = { ...row };
    ["estimate", "actual", "gaapActual", "surprise", "gaapSurprise"].forEach((field) => {
      const value = toNumberOrNull(next[field]);
      if (value !== null) next[field] = value * usdRate;
    });
    return next;
  });
}

async function normalizeForeignFinancialCurrencyStockData(ticker, data = {}) {
  const rowSourceCurrency = Array.isArray(data.revenueData)
    ? firstText(...data.revenueData.map((row) => row?.sourceCurrency))
    : null;
  let sourceCurrency = firstText(data.sourceFinancialCurrency, rowSourceCurrency, data.financialCurrency);
  if ((!sourceCurrency || String(sourceCurrency).toUpperCase() === "USD") && Math.abs(latestAnnualRevenueMagnitude(data) || 0) > 1000) {
    const reportedCurrency = await fetchFmpReportedFinancialCurrency(ticker);
    if (reportedCurrency && String(reportedCurrency).toUpperCase() !== "USD") {
      sourceCurrency = reportedCurrency;
    }
  }
  if (!sourceCurrency || String(sourceCurrency).toUpperCase() === "USD") {
    return data;
  }
  if (String(data.currencyAdjustedFor || "").includes("_USD_ADR")) {
    return data;
  }
  const alreadyConverted =
    String(data.currencyAdjustedFor || "").includes("_USD_") &&
    data.foreignCurrencyConversionVersion === FOREIGN_CURRENCY_CONVERSION_VERSION;
  if (alreadyConverted) {
    return data;
  }

  const usdRate = await fetchUsdRate(sourceCurrency, null);
  if (!usdRate) return data;

  const analystEstimates = data.analystEstimates
    ? {
        ...data.analystEstimates,
        nextQuarter: convertGenericEstimateBlockToUsd(data.analystEstimates.nextQuarter, usdRate, {
          sourceCurrency,
          quarterly: true
        }),
        currentYear: convertGenericEstimateBlockToUsd(data.analystEstimates.currentYear, usdRate, { sourceCurrency }),
        nextYear: convertGenericEstimateBlockToUsd(data.analystEstimates.nextYear, usdRate, { sourceCurrency }),
        followingYear: convertGenericEstimateBlockToUsd(data.analystEstimates.followingYear, usdRate, { sourceCurrency }),
        futureYears: convertGenericEstimateBlocksToUsd(data.analystEstimates.futureYears, usdRate, { sourceCurrency })
      }
    : data.analystEstimates;

  const topLevelMoney = convertMoneyFields(data, usdRate, [
    "cashAndCashEquivalents",
    "equityBookValue",
    "freeCashflow",
    "netCash",
    "operatingCashflow",
    "consensusCurrentYearRevenue",
    "consensusNextYearRevenue",
    "totalCash",
    "totalDebt",
    "workingCapital",
    "revenuePerEmployee",
    "profitsPerEmployee"
  ]);
  const convertedBookValuePerShare = toNumberOrNull(data.bookValuePerShare) !== null
    ? data.bookValuePerShare * usdRate
    : data.bookValuePerShare;
  const convertedNetCashPerShare = toNumberOrNull(data.netCashPerShare) !== null
    ? data.netCashPerShare * usdRate
    : data.netCashPerShare;
  const price = toNumberOrNull(data.price);
  const normalizedPriceToBook =
    toNumberOrNull(data.priceToBook) !== null && data.priceToBook > 0.1
      ? data.priceToBook
      : price && toNumberOrNull(convertedBookValuePerShare) !== null && convertedBookValuePerShare > 0
        ? price / convertedBookValuePerShare
        : data.priceToBook;

  return {
    ...topLevelMoney,
    bookValuePerShare: convertedBookValuePerShare,
    netCashPerShare: convertedNetCashPerShare,
    priceToBook: normalizedPriceToBook,
    revenueData: Array.isArray(data.revenueData)
      ? data.revenueData.map((row) => convertGenericForeignRowToUsd({ ...row, sourceCurrency }, usdRate))
      : data.revenueData,
    revenueHistory: Array.isArray(data.revenueHistory)
      ? data.revenueHistory.map((row) => convertGenericForeignRowToUsd({ ...row, sourceCurrency }, usdRate))
      : data.revenueHistory,
    analystEstimates,
    epsBeatMiss: convertGenericEpsBeatMissToUsd(data.epsBeatMiss, usdRate),
    financialCurrency: "USD",
    sourceFinancialCurrency: sourceCurrency,
    currencyAdjustedFor: `${ticker}_${sourceCurrency}_TO_USD`,
    foreignCurrencyConversionVersion: FOREIGN_CURRENCY_CONVERSION_VERSION
  };
}

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

function buildYahooExtendedHoursQuote(quoteData = {}) {
  const previousClose = firstYahooNumber(
    quoteData.regularMarketPreviousClose,
    quoteData.postMarketPreviousClose,
    quoteData.preMarketPreviousClose
  );

  const buildSession = (prefix, label, comparisonPrice) => {
    const price = firstYahooNumber(quoteData[`${prefix}Price`]);
    if (price === null) return null;
    const change = comparisonPrice !== null ? price - comparisonPrice : null;
    const percentChange = change !== null && comparisonPrice > 0
      ? (change / comparisonPrice) * 100
      : null;
    return {
      label,
      price,
      change,
      percentChange,
      previousClose: comparisonPrice
    };
  };

  const regularClose = firstYahooNumber(quoteData.regularMarketPrice, previousClose);
  const preMarket = buildSession("preMarket", "Pre-market", regularClose);
  const afterHours = buildSession("postMarket", "After hours", regularClose);
  const marketState = String(quoteData.marketState || "").toUpperCase();
  const activeSession = /PRE/.test(marketState) && preMarket
    ? "preMarket"
    : /POST|CLOSED|POSTPOST/.test(marketState) && afterHours
      ? "afterHours"
      : preMarket
        ? "preMarket"
        : afterHours
          ? "afterHours"
          : null;
  const active = activeSession === "preMarket"
    ? preMarket
    : activeSession === "afterHours"
      ? afterHours
      : null;

  if (!preMarket && !afterHours) return null;

  return {
    marketState: marketState || null,
    preMarket,
    afterHours,
    activeSession,
    active
  };
}

function buildYahooChartExtendedHoursQuote(result = {}) {
  const meta = result.meta || {};
  const timestamps = result.timestamp || [];
  const quote = result.indicators?.quote?.[0] || {};
  const periods = meta.currentTradingPeriod || {};
  const previousClose = firstNumber(meta.previousClose, meta.chartPreviousClose);
  const regularPeriod = periods.regular || {};
  const regularSessionClose = timestamps
    .map((timestamp, index) => ({
      timestamp,
      price: toNumberOrNull(quote.close?.[index])
    }))
    .filter((point) =>
      point.price !== null &&
      regularPeriod.start &&
      regularPeriod.end &&
      point.timestamp >= regularPeriod.start &&
      point.timestamp <= regularPeriod.end
    )
    .at(-1)?.price;
  const regularClose = firstNumber(regularSessionClose, meta.regularMarketPrice, previousClose);

  const buildSession = (periodKey, label, comparisonPrice) => {
    const period = periods[periodKey];
    if (!period?.start || !period?.end) return null;

    const points = timestamps
      .map((timestamp, index) => ({
        timestamp,
        price: toNumberOrNull(quote.close?.[index])
      }))
      .filter((point) =>
        point.price !== null &&
        point.timestamp >= period.start &&
        point.timestamp <= period.end
      );

    const latestPoint = points.at(-1);
    if (!latestPoint) return null;

    const change = comparisonPrice !== null
      ? latestPoint.price - comparisonPrice
      : null;
    const percentChange = change !== null && comparisonPrice > 0
      ? (change / comparisonPrice) * 100
      : null;

    return {
      label,
      price: latestPoint.price,
      change,
      percentChange,
      previousClose: comparisonPrice,
      timestamp: latestPoint.timestamp * 1000
    };
  };

  const preMarket = buildSession("pre", "Pre-market", regularClose || previousClose);
  const afterHours = buildSession("post", "After hours", regularClose || previousClose);
  const marketState = String(meta.marketState || "").toUpperCase();
  const activeSession = /PRE/.test(marketState) && preMarket
    ? "preMarket"
    : (/POST|CLOSED|POSTPOST/.test(marketState) && afterHours) || afterHours
      ? "afterHours"
      : preMarket
        ? "preMarket"
        : null;
  const active = activeSession === "preMarket"
    ? preMarket
    : activeSession === "afterHours"
      ? afterHours
      : null;

  if (!preMarket && !afterHours) return null;

  return {
    marketState: marketState || null,
    preMarket,
    afterHours,
    activeSession,
    active
  };
}

async function fetchYahooChartQuote(ticker) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}`;
    const { data } = await axios.get(url, {
      params: {
        range: "1d",
        interval: "1m",
        includePrePost: "true"
      },
      timeout: 4000,
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    });
    const result = data?.chart?.result?.[0] || {};
    const meta = result.meta || {};
    const quote = result.indicators?.quote?.[0] || {};
    const closes = (quote.close || []).filter((value) => toNumberOrNull(value) !== null);
    const price = firstNumber(meta.regularMarketPrice, closes.at(-1));
    const previousClose = firstNumber(meta.previousClose, meta.chartPreviousClose, closes.at(-2));
    const computedChange = price !== null && previousClose !== null
      ? price - previousClose
      : null;
    const change = firstFiniteNumber(meta.regularMarketChange, computedChange);
    const percentChange = firstFiniteNumber(
      meta.regularMarketChangePercent,
      change !== null && previousClose ? (change / previousClose) * 100 : null
    );

    return {
      ...normalizeQuotePayload(
      {
        c: price,
        d: change,
        dp: percentChange,
        pc: previousClose,
        h: quote.high?.filter((value) => toNumberOrNull(value) !== null).at(-1),
        l: quote.low?.filter((value) => toNumberOrNull(value) !== null).at(-1),
        o: quote.open?.filter((value) => toNumberOrNull(value) !== null).at(-1)
      },
      {}
      ),
      extendedHours: buildYahooChartExtendedHoursQuote(result)
    };
  } catch (err) {
    setYahooCooldown(err, "chart quote", ticker);
    console.log("Yahoo chart quote skipped:", ticker, err.response?.status || err.message);
    return {};
  }
}

async function getPrimaryQuote(ticker, previousData = {}) {
  const previousQuote = normalizeQuotePayload({}, previousData);

  try {
    const fmpQuote = await resolveWithin(fetchFmpStableQuoteProfile(ticker), 1300, {});
    if (toNumberOrNull(fmpQuote?.price) !== null) {
      return normalizeQuotePayload(
        {
          c: fmpQuote.price,
          d: fmpQuote.change,
          dp: fmpQuote.percentChange,
          pc: fmpQuote.previousClose,
          h: fmpQuote.high,
          l: fmpQuote.low,
          o: fmpQuote.open,
          currency: fmpQuote.currency
        },
        previousData
      );
    }
  } catch (err) {
    console.log("FMP primary quote skipped:", ticker, err.response?.status || err.message);
  }

  try {
    const finnhubQuote = normalizeQuotePayload(
      await getFinnhub(`https://finnhub.io/api/v1/quote?symbol=${ticker}`),
      previousData
    );

    if (finnhubQuote.c) return finnhubQuote;
  } catch (err) {
    console.log("Finnhub quote skipped:", ticker, err.response?.status || err.message);
  }

  const chartQuote = await fetchYahooChartQuote(ticker);

  if (chartQuote.c) {
    return normalizeQuotePayload(chartQuote, previousData);
  }

  const yahooData = await getYahooSupplementalData(ticker);
  return normalizeQuotePayload({}, { ...previousData, ...yahooData }) || previousQuote;
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

const normalizeFmpAnnualEstimateRows = (rows = [], options = {}) => {
  const symbol = String(options.symbol || "").trim().toUpperCase();
  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const currentYear = now.getUTCFullYear();
  const maxFutureYear = currentYear + (options.maxFutureYears ?? 6);

  return (Array.isArray(rows) ? rows : rows ? [rows] : [])
    .filter((row) => !symbol || String(row.symbol || "").trim().toUpperCase() === symbol)
    .map((row) => ({
      ...row,
      estimateDate: new Date(`${String(row.date || "").slice(0, 10)}T12:00:00Z`)
    }))
    .filter((row) => {
      if (Number.isNaN(row.estimateDate.getTime())) return false;
      const year = row.estimateDate.getUTCFullYear();
      return row.estimateDate >= todayUtc && year >= currentYear && year <= maxFutureYear;
    })
    .sort((a, b) => a.estimateDate - b.estimateDate);
};

const normalizeFmpAnnualEstimateBlock = (row = {}) => {
  if (!row || Number.isNaN(row.estimateDate?.getTime?.())) return null;
  const fiscalYear = row.estimateDate.getUTCFullYear();
  return {
    fiscalYear,
    date: String(row.date || "").slice(0, 10) || null,
    revenue: toNumberOrNull(fmpEstimateField(row, "revenueAvg", "estimatedRevenueAvg")),
    earnings: toNumberOrNull(fmpEstimateField(row, "netIncomeAvg", "estimatedNetIncomeAvg")),
    ebitda: toNumberOrNull(fmpEstimateField(row, "ebitdaAvg", "estimatedEbitdaAvg")),
    ebit: toNumberOrNull(fmpEstimateField(row, "ebitAvg", "estimatedEbitAvg")),
    sgaExpense: toNumberOrNull(fmpEstimateField(row, "sgaExpenseAvg", "estimatedSgaExpenseAvg")),
    eps: toNumberOrNull(fmpEstimateField(row, "epsAvg", "estimatedEpsAvg")),
    numAnalystsRevenue: toNumberOrNull(row.numAnalystsRevenue),
    numAnalystsEps: toNumberOrNull(row.numAnalystsEps),
    source: "FMP"
  };
};

const normalizeFmpAnnualEstimateBlocks = (rows = []) =>
  rows
    .map(normalizeFmpAnnualEstimateBlock)
    .filter((row) =>
      row &&
      (
        toNumberOrNull(row.revenue) !== null ||
        toNumberOrNull(row.earnings) !== null ||
        toNumberOrNull(row.ebitda) !== null ||
        toNumberOrNull(row.ebit) !== null ||
        toNumberOrNull(row.sgaExpense) !== null ||
        toNumberOrNull(row.eps) !== null
      )
    );

const estimateLooksSaneAgainstHistory = (estimate = {}, latestAnnual = {}) => {
  const estimateRevenue = toNumberOrNull(estimate.revenueAvg ?? estimate.estimatedRevenueAvg);
  const estimateEps = toNumberOrNull(estimate.epsAvg ?? estimate.estimatedEpsAvg);
  const latestRevenue = toDollarsFromBillions(latestAnnual.revenue);
  const latestEps = toNumberOrNull(latestAnnual.eps);
  if (estimateRevenue !== null && latestRevenue && estimateRevenue > latestRevenue * 8) return false;
  if (estimateEps !== null && latestEps && Math.abs(estimateEps) > Math.max(Math.abs(latestEps) * 8, 20)) return false;
  return true;
};

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

const normalizeTickerForStockAnalysis = (ticker) => {
  const symbol = String(ticker || "").trim();
  if (/^BRK[-.]B$/i.test(symbol)) return "brk.b";
  if (/^BRK[-.]A$/i.test(symbol)) return "brk.a";
  return symbol.toLowerCase();
};

const STOCK_ANALYSIS_PATH_OVERRIDES = {
  ASML: "quote/ams/ASML",
  BP: "quote/lon/BP",
  HMC: "quote/tyo/7267",
  NVO: "quote/cph/NOVO.B",
  SAP: "quote/etr/SAP",
  SHEL: "quote/lon/SHEL",
  SONY: "quote/tyo/6758",
  TTE: "quote/epa/TTE"
};

const getStockAnalysisPath = (ticker) => {
  const symbol = String(ticker || "").trim().toUpperCase();
  const configuredPath = FOREIGN_ADR_CONFIG[symbol]?.stockAnalysisPath || STOCK_ANALYSIS_PATH_OVERRIDES[symbol];
  if (configuredPath) return String(configuredPath).replace(/^\/+/, "").replace(/\/+$/, "");
  return `stocks/${normalizeTickerForStockAnalysis(ticker)}`;
};

const buildStockAnalysisUrl = (ticker, path = "") => {
  const basePath = getStockAnalysisPath(ticker);
  const cleanPath = String(path || "").replace(/^\/+/, "");
  return `https://stockanalysis.com/${basePath}/${cleanPath}`;
};

const STOCK_ANALYSIS_TRANSCRIPT_PATH_OVERRIDES = {
  TSM: ["quote/tpe/2330"]
};

const stockAnalysisTranscriptIndexUrlCache = new Map();

const normalizeBookValuePerShare = (bookValuePerShare, price, ticker) => {
  const bookValue = toNumberOrNull(bookValuePerShare);
  const priceNumber = toNumberOrNull(price);
  if (bookValue === null) return null;

  if (
    /^BRK[-.]B$/i.test(String(ticker || "")) &&
    priceNumber !== null &&
    priceNumber > 0 &&
    bookValue / priceNumber > 50
  ) {
    return bookValue / 1500;
  }

  return bookValue;
};

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

function keepLatestInterimRowPerMissingAnnualYear(rows = []) {
  const annualYears = new Set(
    (rows || [])
      .filter((row) => row?.year && !row?.isInterim)
      .map((row) => Number(row.year))
  );
  const interimYears = (rows || [])
    .filter((row) => row?.isInterim && row?.period !== "Current")
    .map((row) => Number(row.year))
    .filter((year) => Number.isFinite(year));
  const latestInterimYear = interimYears.length ? Math.max(...interimYears) : null;
  const latestInterimByYear = new Map();
  (rows || []).forEach((row, index) => {
    if (!row?.isInterim || row?.period === "Current") return;
    const rowYear = Number(row.year);
    if (!Number.isFinite(rowYear) || annualYears.has(rowYear) || rowYear === latestInterimYear) return;

    const existing = latestInterimByYear.get(rowYear);
    const rowRank = Number(String(row.period || "").match(/Q([1-4])/i)?.[1] || 0);
    if (!existing || rowRank >= existing.rank) {
      latestInterimByYear.set(rowYear, { index, rank: rowRank });
    }
  });

  if (!latestInterimByYear.size) return rows;

  const keptInterimIndexes = new Set(
    [...latestInterimByYear.values()].map((entry) => entry.index)
  );
  return (rows || []).filter((row) => {
    if (!row?.isInterim || row?.period === "Current") return true;

    const rowYear = Number(row.year);
    if (!Number.isFinite(rowYear) || annualYears.has(rowYear)) return true;
    if (rowYear === latestInterimYear) return true;

    const rowIndex = rows.indexOf(row);
    return keptInterimIndexes.has(rowIndex);
  });
}

function removeSupersededYtdInterimRows(rows = []) {
  const trueQuarterKeys = new Set(
    (rows || [])
      .filter((row) => row?.isInterim && !/ytd/i.test(String(row.period || "")))
      .map((row) => {
        const match = String(row.period || "").match(/Q([1-4])/i);
        return row?.year && match ? `${row.year}:Q${match[1]}` : null;
      })
      .filter(Boolean)
  );

  if (!trueQuarterKeys.size) return rows;

  return (rows || []).filter((row) => {
    if (!row?.isInterim || !/ytd/i.test(String(row.period || ""))) return true;
    return false;
  });
}

function cleanFinancialHistoryRows(rows = []) {
  return keepLatestInterimRowPerMissingAnnualYear(
    removeSupersededYtdInterimRows(removeDuplicateInterimAnnualRows(rows))
  );
}

function limitHistoricalFinancialRows(rows, limit = 7) {
  const dedupedRows = cleanFinancialHistoryRows(rows);
  if (!Number.isFinite(limit)) return dedupedRows;

  const annualRows = dedupedRows.filter((row) => !row?.isInterim).slice(-limit);
  const interimRowsByYear = new Map();
  dedupedRows
    .filter((row) => row?.isInterim && row?.period !== "Current")
    .forEach((row) => {
      const year = Number(row.year);
      if (!Number.isFinite(year)) return;
      const rowsForYear = interimRowsByYear.get(year) || [];
      rowsForYear.push(row);
      interimRowsByYear.set(year, rowsForYear);
    });
  const interimRows = [...interimRowsByYear.entries()]
    .sort(([yearA], [yearB]) => yearA - yearB)
    .flatMap(([, rowsForYear]) =>
      rowsForYear
        .sort((a, b) => String(a.period || "").localeCompare(String(b.period || "")))
        .slice(-4)
    );
  const mergedRows = [...annualRows, ...interimRows].sort((a, b) => {
    const yearDiff = Number(a.year) - Number(b.year);
    if (yearDiff !== 0) return yearDiff;
    if (Boolean(a.isInterim) !== Boolean(b.isInterim)) return a.isInterim ? 1 : -1;
    return String(a.period || "").localeCompare(String(b.period || ""));
  });

  return mergedRows;
}

function mergeHistoricalFinancials(primary = [], fallback = [], limit = 7) {
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
      sourceCurrency: firstText(row.sourceCurrency, existing.sourceCurrency) || null,
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

  return limitHistoricalFinancialRows(mergedRows, limit);
}

function mergeSupplementalHistoricalFields(baseRows = [], supplementalRows = [], limit = 7) {
  const rowsByPeriod = new Map();
  const rowKeyFor = (row) => {
    const period = row.period || String(row.year);
    return row.isInterim ? `${row.year}:${period}` : `${row.year}:annual`;
  };

  baseRows.forEach((row) => {
    if (!row?.year) return;
    rowsByPeriod.set(rowKeyFor(row), {
      ...row,
      period: row.period || String(row.year),
      isInterim: Boolean(row.isInterim)
    });
  });

  supplementalRows.forEach((row) => {
    if (!row?.year) return;
    const rowKey = rowKeyFor(row);
    const existing = rowsByPeriod.get(rowKey);

    if (!existing) {
      rowsByPeriod.set(rowKey, {
        ...row,
        period: row.period || String(row.year),
        isInterim: Boolean(row.isInterim)
      });
      return;
    }

    rowsByPeriod.set(rowKey, {
      ...existing,
      grossProfit: existing.grossProfit ?? row.grossProfit ?? null,
      operatingIncome: existing.operatingIncome ?? row.operatingIncome ?? null,
      operatingCashflow: existing.operatingCashflow ?? row.operatingCashflow ?? null,
      freeCashflow: existing.freeCashflow ?? row.freeCashflow ?? null,
      sharesOutstanding: existing.sharesOutstanding ?? row.sharesOutstanding ?? null,
      source: existing.source || row.source
    });
  });

  return limitHistoricalFinancialRows([...rowsByPeriod.values()]
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
      const yearDiff = Number(a.year) - Number(b.year);
      if (yearDiff !== 0) return yearDiff;
      if (Boolean(a.isInterim) !== Boolean(b.isInterim)) {
        return a.isInterim ? 1 : -1;
      }
      return String(a.period || "").localeCompare(String(b.period || ""));
    }), limit);
}

function mergeAllHistoricalFinancials(...sources) {
  return sources.reduce(
    (mergedRows, sourceRows) => mergeHistoricalFinancials(sourceRows || [], mergedRows, Infinity),
    []
  );
}

function removeStaleModeledFallbackRows(rows = []) {
  const realAnnualYears = (rows || [])
    .filter((row) =>
      row?.year &&
      !row?.isInterim &&
      row?.source !== "Modeled fallback" &&
      row?.source !== "Current metric fallback"
    )
    .map((row) => Number(row.year))
    .filter((year) => Number.isFinite(year));

  if (!realAnnualYears.length) return rows;

  const latestRealAnnualYear = Math.max(...realAnnualYears);
  return (rows || []).filter((row) => {
    if (row?.source !== "Modeled fallback" || row?.isInterim) return true;
    const rowYear = Number(row.year);
    return Number.isFinite(rowYear) && rowYear > latestRealAnnualYear;
  });
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

  return (rows || []).filter((row) => {
    if (!row?.year || !duplicateInterimYears.has(Number(row.year))) return true;

    const source = String(row.source || "");
    if (row.isInterim) {
      if (/current metric fallback|modeled fallback/i.test(source)) return false;
      return true;
    }

    return true;
  });
}

function getRecentEarningsReleaseAnnualRows(ticker) {
  if (ticker === "NKE") {
    return [{
      year: 2026,
      period: "2026",
      isInterim: false,
      revenue: 46.4,
      earnings: 3.1,
      eps: 2.1,
      source: "Nike FY2026 earnings release"
    }];
  }

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
        ? computeEarningsFromEpsAndShares(row.eps, shares)
        : null),
    eps:
      row.eps ??
      (row.earnings !== null && row.earnings !== undefined
        ? computeEpsFromEarningsAndShares(row.earnings, shares)
        : null)
  }));
}

const computeEpsFromEarningsAndShares = (earningsBillions, shares) => {
  const earnings = toNumberOrNull(earningsBillions);
  const shareCount = toNumberOrNull(shares);
  if (earnings === null || shareCount === null || shareCount <= 0) return null;
  return (earnings * 1000) / shareCount;
};

const computeEarningsFromEpsAndShares = (eps, shares) => {
  const epsValue = toNumberOrNull(eps);
  const shareCount = toNumberOrNull(shares);
  if (epsValue === null || shareCount === null || shareCount <= 0) return null;
  return (epsValue * shareCount) / 1000;
};

const normalizeHistoricalShares = (candidate, currentShares) => {
  let shares = toNumberOrNull(candidate);
  const baseline = toNumberOrNull(currentShares);
  if (shares === null || baseline === null || baseline <= 0) return shares;

  while (shares > 0 && shares < baseline * 0.4) shares *= 10;
  while (shares > baseline * 2.5) shares /= 10;
  return shares;
};

const normalizeSharesOutstandingMillions = (candidate, marketCap, price) => {
  let shares = toNumberOrNull(candidate);
  const cap = toNumberOrNull(marketCap);
  const quotePrice = toNumberOrNull(price);
  if (shares === null) return null;

  const impliedShares =
    cap !== null && cap > 0 && quotePrice !== null && quotePrice > 0
      ? cap / quotePrice / 1000000
      : null;
  if (impliedShares === null || impliedShares <= 0) return shares;

  while (shares / impliedShares > 25) shares /= 1000;
  while (impliedShares / shares > 25) shares *= 1000;
  return shares;
};

const normalizeHistoricalEps = (row, currentShares) => {
  const eps = toNumberOrNull(row?.eps);
  const earnings = toNumberOrNull(row?.earnings);
  const shares = toNumberOrNull(currentShares);
  if (eps === null || earnings === null || shares === null || shares <= 0 || eps === 0) {
    return eps;
  }

  const impliedShares = Math.abs((earnings * 1000) / eps);
  if (!Number.isFinite(impliedShares) || impliedShares <= 0) return eps;

  const shareRatio = impliedShares / shares;
  if (shareRatio < 0.4 || shareRatio > 2.5) {
    return computeEpsFromEarningsAndShares(earnings, shares);
  }

  return eps;
};

function removeStaleProviderScaleBreakRows(rows = []) {
  const annualRows = (rows || [])
    .filter((row) => row?.year && !row?.isInterim && toNumberOrNull(row.revenue) > 0)
    .sort((a, b) => Number(a.year) - Number(b.year));

  if (annualRows.length < 4) return rows;

  const staleKeys = new Set();
  annualRows.forEach((row, index) => {
    const source = String(row.source || "");
    if (!/finnhub/i.test(source)) return;

    const revenue = toNumberOrNull(row.revenue);
    const laterTrustedRevenues = annualRows
      .slice(index + 1)
      .filter((laterRow) => /stockanalysis|yahoo|fmp|sec/i.test(String(laterRow.source || "")))
      .map((laterRow) => toNumberOrNull(laterRow.revenue))
      .filter((value) => value !== null && value > 0)
      .sort((a, b) => a - b);

    if (revenue === null || laterTrustedRevenues.length < 2) return;

    const medianLaterRevenue = laterTrustedRevenues[Math.floor(laterTrustedRevenues.length / 2)];
    if (medianLaterRevenue >= revenue * 5) {
      staleKeys.add(`${Number(row.year)}:${row.period || row.year}`);
    }
  });

  if (!staleKeys.size) return rows;

  return (rows || []).filter((row) => !staleKeys.has(`${Number(row?.year)}:${row?.period || row?.year}`));
}

function finalizeFinancialHistory(rows, sharesOutstanding) {
  return fillEstimatedEps(rows, sharesOutstanding).map((row) => ({
    year: row.year,
    period: row.period || String(row.year),
    isInterim: Boolean(row.isInterim),
    revenue: toNumberOrNull(row.revenue),
    earnings: toNumberOrNull(row.earnings),
    eps: normalizeHistoricalEps(row, sharesOutstanding),
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
          ? Math.abs((row.earnings * 1000) / row.eps)
          : null,
        sharesOutstanding
      ),
      sharesOutstanding
    ),
    sourceCurrency: firstText(row.sourceCurrency) || null,
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

function historicalGrowth(rows, field) {
  const completedAnnualRows = [...(rows || [])]
    .filter((row) =>
      row?.year &&
      !row?.isInterim &&
      !row?.isCurrent &&
      row?.source !== "Modeled fallback" &&
      toNumberOrNull(row?.[field]) !== null
    )
    .sort((a, b) => a.year - b.year);
  const current = toNumberOrNull(completedAnnualRows.at(-1)?.[field]);
  const previous = toNumberOrNull(completedAnnualRows.at(-2)?.[field]);

  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function chartHistoryPointCount(stock, key) {
  const periods = new Set();
  (stock?.data?.revenueData || []).forEach((row) => {
    if (row?.source === "Modeled fallback" || row?.source === "Current metric fallback") return;
    if (toNumberOrNull(row?.[key]) === null || row?.isCurrent) return;
    periods.add(row.period || `${row.year}-${row.isInterim ? "interim" : "annual"}`);
  });
  return periods.size;
}

function hasChartHistory(stock, key) {
  return chartHistoryPointCount(stock, key) >= 2;
}

function interimHistoryPointCount(data = {}) {
  const periods = new Set();
  (data.revenueData || []).forEach((row) => {
    if (row?.source === "Modeled fallback" || row?.source === "Current metric fallback") return;
    if (!row?.isInterim || row?.isCurrent) return;
    if (
      toNumberOrNull(row.revenue) === null &&
      toNumberOrNull(row.earnings) === null &&
      toNumberOrNull(row.eps) === null
    ) {
      return;
    }
    periods.add(row.period || `${row.year}-interim`);
  });
  return periods.size;
}

function hasUsableInterimHistory(data = {}) {
  return (
    data.interimHistoryVersion === INTERIM_HISTORY_VERSION &&
    Boolean(data.interimHistoryCheckedAt) &&
    interimHistoryPointCount(data) >= MIN_USABLE_INTERIM_HISTORY_ROWS
  );
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
    (
      !needsInterimCheck ||
      hasUsableInterimHistory(data)
    )
  );
}

function hasAnnualCoreChartHistory(stock) {
  return (
    hasChartHistory(stock, "revenue") &&
    hasChartHistory(stock, "earnings") &&
    hasChartHistory(stock, "eps")
  );
}

function hasAnyCoreChartHistory(stock) {
  return (
    hasChartHistory(stock, "revenue") ||
    hasChartHistory(stock, "earnings") ||
    hasChartHistory(stock, "eps")
  );
}

function hasRequestedCoreChartHistory(data = {}, wantsQuarterlyHistory = false) {
  return wantsQuarterlyHistory
    ? hasCompleteChartHistory({ data })
    : hasAnnualCoreChartHistory({ data });
}

function isCompletedStockAnalysisAnnualHeader(header = {}) {
  if (!header.id || header.id === "TTM") return false;
  const endDate = new Date(`${header.id}T00:00:00Z`);
  if (Number.isNaN(endDate.getTime())) return true;
  return endDate.getTime() <= Date.now();
}

function hasCompleteSupplementalData(stock) {
  const data = stock?.data || {};
  const hasBalanceSheetMetrics =
    toNumberOrNull(data.totalCash) !== null || toNumberOrNull(data.totalDebt) !== null;
  const balanceSheetCheckedAt = data.balanceSheetCheckedAt ? new Date(data.balanceSheetCheckedAt) : null;
  const balanceSheetCheckedRecently =
    balanceSheetCheckedAt &&
    !Number.isNaN(balanceSheetCheckedAt.getTime()) &&
    Date.now() - balanceSheetCheckedAt.getTime() < 60 * 60 * 1000;
  const valuationMetricsCheckedAt = data.valuationMetricsCheckedAt ? new Date(data.valuationMetricsCheckedAt) : null;
  const valuationMetricsCheckedRecently =
    valuationMetricsCheckedAt &&
    !Number.isNaN(valuationMetricsCheckedAt.getTime()) &&
    Date.now() - valuationMetricsCheckedAt.getTime() < 60 * 60 * 1000;
  const quarterEstimateCheckedAt = data.quarterEstimateCheckedAt ? new Date(data.quarterEstimateCheckedAt) : null;
  const quarterEstimateCheckedRecently =
    quarterEstimateCheckedAt &&
    !Number.isNaN(quarterEstimateCheckedAt.getTime()) &&
    Date.now() - quarterEstimateCheckedAt.getTime() < 60 * 60 * 1000;
  const marketActivityUpdatedAt = data.marketActivityUpdatedAt ? new Date(data.marketActivityUpdatedAt) : null;
  const marketActivityCheckedRecently =
    marketActivityUpdatedAt &&
    !Number.isNaN(marketActivityUpdatedAt.getTime()) &&
    Date.now() - marketActivityUpdatedAt.getTime() < 60 * 60 * 1000;
  const hasValuationMetrics =
    toNumberOrNull(data.pe) !== null ||
    toNumberOrNull(data.forwardPE) !== null ||
    toNumberOrNull(data.priceToSales) !== null ||
    toNumberOrNull(data.priceToBook) !== null ||
    valuationMetricsCheckedRecently;

  return (
    hasValuationMetrics &&
    (hasBalanceSheetMetrics || balanceSheetCheckedRecently) &&
    data.balanceSheetMetricsVersion === BALANCE_SHEET_METRICS_VERSION &&
    data.estimateDataVersion === STOCK_ESTIMATE_VERSION &&
    (quarterEstimateCheckedRecently || Boolean(data.analystEstimates?.nextQuarter)) &&
    marketActivityCheckedRecently
  );
}

function needsFinancialHistoryRefresh(stock) {
  return (
    stock?.data?.financialHistoryVersion !== FINANCIAL_HISTORY_VERSION ||
    !hasCompleteChartHistory(stock)
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
  const useFmpOnlyMetricCards = data.valuationMetricsVersion === VALUATION_METRICS_VERSION;
  const hasSuppliedAnalystEstimates =
    toNumberOrNull(data.analystEstimates?.currentYear?.revenue) !== null &&
    toNumberOrNull(data.analystEstimates?.currentYear?.eps) !== null &&
    toNumberOrNull(data.analystEstimates?.nextYear?.revenue) !== null &&
    toNumberOrNull(data.analystEstimates?.nextYear?.eps) !== null;
  const yahooLockedEstimates = data.analystEstimatesSource === "Yahoo Finance";
  const isFinancialCompany = data.isFinancialCompany === true;
  const price = toNumberOrNull(data.price);
  const revenueRows = Array.isArray(data.revenueData)
    ? data.revenueData.filter((row) =>
        row?.source !== "Modeled fallback" &&
        row?.source !== "Current metric fallback"
      )
    : [];
  const sortedRevenueRows = [...revenueRows]
    .filter((row) => row?.year)
    .sort((a, b) => a.year - b.year);
  const realRevenueRows = sortedRevenueRows.filter(
    (row) => row.source !== "Modeled fallback"
  );
  const latestRevenueRow =
    realRevenueRows.filter((row) => !row.isInterim).at(-1) ||
    realRevenueRows.at(-1) ||
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
  const marketCapImpliedShares =
    marketCap !== null && price ? marketCap / price / 1000000 : null;
  const suppliedSharesMillions = normalizeSharesOutstandingMillions(
    firstNumber(data.sharesOutstanding, marketCapImpliedShares),
    marketCap,
    price
  );
  const suppliedToImpliedRatio =
    suppliedSharesMillions && impliedSharesMillions
      ? suppliedSharesMillions / impliedSharesMillions
      : null;
  const sharesOutstanding = firstNumber(
    marketCapImpliedShares,
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
  const bookValuePerShare = normalizeBookValuePerShare(
    firstNumber(data.bookValuePerShare),
    price,
    data.symbol || data.ticker
  );
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
  const pegRatio = firstNumber(data.pegRatio, data.trailingPegRatio);
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
  const guaranteedRevenueBaseData = mergeHistoricalFinancials(
    revenueRows,
    []
  );
  const fallbackHistoryYear = Math.max(
    latestYear,
    new Date().getFullYear()
  );
  const hasOperatingCashflowHistory = guaranteedRevenueBaseData.some(
    (row) => toNumberOrNull(row.operatingCashflow) !== null
  );
  const hasFreeCashflowHistory = guaranteedRevenueBaseData.some(
    (row) => toNumberOrNull(row.freeCashflow) !== null
  );
  const hasSharesOutstandingHistory = guaranteedRevenueBaseData.some(
    (row) => toNumberOrNull(row.sharesOutstanding) !== null
  );
  const fallbackOperatingCashflow = toNumberOrNull(data.operatingCashflow);
  const fallbackFreeCashflow = toNumberOrNull(freeCashflow);
  const fallbackCashflowRows = [];

  if (
    (!hasOperatingCashflowHistory && fallbackOperatingCashflow !== null) ||
    (!hasFreeCashflowHistory && fallbackFreeCashflow !== null) ||
    (!hasSharesOutstandingHistory && sharesOutstanding !== null)
  ) {
    fallbackCashflowRows.push({
      year: fallbackHistoryYear,
      period: "Current",
      isInterim: true,
      operatingCashflow: !hasOperatingCashflowHistory && fallbackOperatingCashflow !== null
        ? fallbackOperatingCashflow / 1000000000
        : null,
      freeCashflow: !hasFreeCashflowHistory && fallbackFreeCashflow !== null
        ? fallbackFreeCashflow / 1000000000
        : null,
      sharesOutstanding: !hasSharesOutstandingHistory && sharesOutstanding !== null
        ? sharesOutstanding
        : null,
      source: "Current metric fallback"
    });
  }

  const guaranteedRevenueRows = [
    ...guaranteedRevenueBaseData,
    ...fallbackCashflowRows
  ];
  const interimRevenueYears = new Set(
    guaranteedRevenueRows
      .filter((row) => row?.isInterim && row?.period !== "Current")
      .map((row) => Number(row.year))
  );
  const guaranteedRevenueData = cleanFinancialHistoryRows(
    removeStaleModeledFallbackRows(guaranteedRevenueRows)
      .filter((row) =>
        !(
          row?.source === "Current metric fallback" &&
          row?.period === "Current" &&
          interimRevenueYears.has(Number(row.year))
        )
      )
      .sort((a, b) => {
        const yearDiff = Number(a.year) - Number(b.year);
        if (yearDiff !== 0) return yearDiff;
        if (Boolean(a.isInterim) !== Boolean(b.isInterim)) {
          return a.isInterim ? 1 : -1;
        }
        return String(a.period || "").localeCompare(String(b.period || ""));
      })
  );
  const suppliedMarginHistory = Array.isArray(data.marginHistory)
    ? data.marginHistory
    : [];
  const latestInterimRevenueForMargins = [...guaranteedRevenueData]
    .filter((row) => row?.isInterim && toNumberOrNull(row.revenue) !== null)
    .sort((a, b) => {
      const yearDiff = Number(a.year) - Number(b.year);
      if (yearDiff !== 0) return yearDiff;
      return String(a.period || "").localeCompare(String(b.period || ""));
    })
    .at(-1);
  const latestInterimMarginPeriod =
    latestInterimRevenueForMargins?.period ||
    (latestInterimRevenueForMargins ? String(latestInterimRevenueForMargins.year) : null);
  const latestInterimMarginRow =
    latestInterimRevenueForMargins &&
    suppliedMarginHistory.find((row) =>
      row?.isInterim &&
      Number(row.year) === Number(latestInterimRevenueForMargins.year) &&
      (row.period || String(row.year)) === latestInterimMarginPeriod
    );
  const hasGrossMarginHistory = suppliedMarginHistory.some(
    (row) => toNumberOrNull(row.grossMargin) !== null
  );
  const hasOperatingMarginHistory = suppliedMarginHistory.some(
    (row) => toNumberOrNull(row.operatingMargin) !== null
  );
  const hasProfitMarginHistory = suppliedMarginHistory.some(
    (row) => toNumberOrNull(row.profitMargin) !== null
  );
  const fallbackMarginRows = [];

  const fallbackGrossMargins = toNumberOrNull(grossMargins);
  const fallbackOperatingMargins = toNumberOrNull(operatingMargins);
  const fallbackProfitMargins = toNumberOrNull(profitMargins);
  const interimRevenueForMargin = toNumberOrNull(latestInterimRevenueForMargins?.revenue);
  const interimMarginPercent = (value) => {
    const number = toNumberOrNull(value);
    return number !== null && interimRevenueForMargin
      ? (number / interimRevenueForMargin) * 100
      : null;
  };
  const interimGrossMargin = interimMarginPercent(latestInterimRevenueForMargins?.grossProfit);
  const interimOperatingMargin = interimMarginPercent(latestInterimRevenueForMargins?.operatingIncome);
  const interimProfitMargin = interimMarginPercent(latestInterimRevenueForMargins?.earnings);

  const latestInterimNeedsMarginFallback =
    latestInterimRevenueForMargins &&
    (
      (toNumberOrNull(latestInterimMarginRow?.grossMargin) === null && firstNumber(interimGrossMargin, fallbackGrossMargins) !== null) ||
      (toNumberOrNull(latestInterimMarginRow?.operatingMargin) === null && firstNumber(interimOperatingMargin, fallbackOperatingMargins) !== null) ||
      (toNumberOrNull(latestInterimMarginRow?.profitMargin) === null && firstNumber(interimProfitMargin, fallbackProfitMargins) !== null)
    );

  if (latestInterimNeedsMarginFallback) {
    fallbackMarginRows.push({
      year: latestInterimRevenueForMargins.year,
      period: latestInterimMarginPeriod,
      isInterim: true,
      grossMargin: toNumberOrNull(latestInterimMarginRow?.grossMargin) === null
        ? firstNumber(interimGrossMargin, fallbackGrossMargins)
        : null,
      operatingMargin: toNumberOrNull(latestInterimMarginRow?.operatingMargin) === null
        ? firstNumber(interimOperatingMargin, fallbackOperatingMargins)
        : null,
      profitMargin: toNumberOrNull(latestInterimMarginRow?.profitMargin) === null
        ? firstNumber(interimProfitMargin, fallbackProfitMargins)
        : null,
      source: latestInterimRevenueForMargins.source || "Current interim fallback"
    });
  }

  if (
    (!hasGrossMarginHistory && fallbackGrossMargins !== null) ||
    (!hasOperatingMarginHistory && fallbackOperatingMargins !== null) ||
    (!hasProfitMarginHistory && fallbackProfitMargins !== null)
  ) {
    fallbackMarginRows.push({
      year: fallbackHistoryYear,
      period: "Current",
      isInterim: true,
      grossMargin: !hasGrossMarginHistory ? fallbackGrossMargins : null,
      operatingMargin: !hasOperatingMarginHistory ? fallbackOperatingMargins : null,
      profitMargin: !hasProfitMarginHistory ? fallbackProfitMargins : null,
      source: "Current metric fallback"
    });
  }

  const marginRowsWithFallback = [
    ...suppliedMarginHistory,
    ...fallbackMarginRows
  ];
  const mergedMarginRowsByPeriod = new Map();
  marginRowsWithFallback.forEach((row) => {
    if (!row?.year) return;
    const period = row.period || String(row.year);
    const rowKey = row.isInterim ? `${row.year}:${period}` : `${row.year}:annual`;
    const existing = mergedMarginRowsByPeriod.get(rowKey) || {};
    mergedMarginRowsByPeriod.set(rowKey, {
      year: row.year,
      period,
      isInterim: row.isInterim ?? existing.isInterim ?? false,
      grossMargin: existing.grossMargin ?? row.grossMargin ?? null,
      operatingMargin: existing.operatingMargin ?? row.operatingMargin ?? null,
      profitMargin: existing.profitMargin ?? row.profitMargin ?? null,
      source: existing.source || row.source
    });
  });
  const mergedMarginRows = [...mergedMarginRowsByPeriod.values()];
  const interimMarginYears = new Set(
    mergedMarginRows
      .filter((row) => row?.isInterim)
      .map((row) => Number(row.year))
  );
  const guaranteedMarginHistory = mergedMarginRows
    .filter((row) =>
      !(
        row?.source === "Modeled fallback" &&
        !row?.isInterim &&
        interimMarginYears.has(Number(row.year))
      ) &&
      !(
        row?.source === "Current metric fallback" &&
        row?.period === "Current" &&
        interimMarginYears.has(Number(row.year))
      )
    )
    .sort((a, b) => {
    const yearDiff = Number(a.year) - Number(b.year);
    if (yearDiff !== 0) return yearDiff;
    if (Boolean(a.isInterim) !== Boolean(b.isInterim)) {
      return a.isInterim ? 1 : -1;
    }
    return String(a.period || "").localeCompare(String(b.period || ""));
  });
  const cleanSuppliedRevenueHistory = Array.isArray(data.revenueHistory)
    ? data.revenueHistory.filter((row) =>
        row?.source !== "Modeled fallback" &&
        row?.source !== "Current metric fallback"
      )
    : [];
  const guaranteedRevenueHistory = cleanSuppliedRevenueHistory.some(
    (row) => toNumberOrNull(row.revenue) !== null
  )
    ? cleanSuppliedRevenueHistory
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
  const suppliedHistoricalPe = Array.isArray(data.historicalPe)
    ? data.historicalPe
    : [];
  const latestInterimPePeriodRow = [...guaranteedRevenueData]
    .filter((row) =>
      row?.isInterim &&
      toNumberOrNull(row.eps) !== null &&
      toNumberOrNull(row.eps) !== 0
    )
    .sort((a, b) => {
      const yearDiff = Number(a.year) - Number(b.year);
      if (yearDiff !== 0) return yearDiff;
      return String(a.period || "").localeCompare(String(b.period || ""));
    })
    .at(-1);
  const currentMetricPe = toNumberOrNull(pe);
  const currentPeRow =
    currentMetricPe !== null &&
    Number.isFinite(currentMetricPe) &&
    Math.abs(currentMetricPe) < 1000
      ? {
          year: new Date().getFullYear(),
          period: "Current",
          isInterim: false,
          isCurrent: true,
          pe: currentMetricPe,
          price,
          eps: trailingEps,
          source: "Current metric P/E"
        }
      : null;
  const guaranteedHistoricalPe = currentPeRow
    ? [
        ...suppliedHistoricalPe.filter((row) => {
          if (!row) return false;
          const rowPeriod = row.period || String(row.year);
          const currentPeriod = currentPeRow.period || String(currentPeRow.year);
          if (row.isCurrent) return false;
          if (
            currentPeRow.isInterim &&
            row.isInterim &&
            Number(row.year) === Number(currentPeRow.year) &&
            rowPeriod === currentPeriod
          ) {
            return false;
          }
          if (!currentPeRow.isInterim && rowPeriod === "Current") return false;
          return true;
        }),
        currentPeRow
      ]
        .filter((row) => {
          const rowPe = toNumberOrNull(row.pe);
          return rowPe !== null && Number.isFinite(rowPe) && Math.abs(rowPe) < 1000;
        })
        .slice(-7)
    : suppliedHistoricalPe;
  const suppliedCurrentEps = toNumberOrNull(data.analystEstimates?.currentYear?.eps);
  const suppliedNextEps = toNumberOrNull(data.analystEstimates?.nextYear?.eps);
  const consensusCurrentRevenue = toNumberOrNull(data.consensusCurrentYearRevenue);
  const consensusNextRevenue = toNumberOrNull(data.consensusNextYearRevenue);
  const consensusCurrentEpsForEstimate = toNumberOrNull(data.consensusCurrentYearEps);
  const consensusNextEpsForEstimate = toNumberOrNull(data.consensusNextYearEps);
  const repairEstimateEarnings = (earnings, eps, consensusEps) => {
    const earningsNumber = toNumberOrNull(earnings);
    const epsNumber = firstNumber(eps, consensusEps);
    const epsImplied =
      epsNumber !== null && sharesOutstanding
        ? epsNumber * sharesOutstanding * 1000000
        : null;
    if (epsImplied === null) return earningsNumber;
    if (earningsNumber === null) return epsImplied;
    const ratio = Math.abs(earningsNumber / epsImplied);
    return ratio > 2 || ratio < 0.5 ? epsImplied : earningsNumber;
  };
  const currentEpsNeedsRepair =
    consensusCurrentYearEps !== null &&
    suppliedCurrentEps !== null &&
    (
      suppliedCurrentEps > consensusCurrentYearEps * 1.25 ||
      suppliedCurrentEps < consensusCurrentYearEps * 0.75 ||
      (suppliedNextEps !== null && suppliedCurrentEps > suppliedNextEps * 1.25)
    );
  const yahooRepairedAnalystEstimates = yahooLockedEstimates
    ? {
        ...(data.analystEstimates || {}),
        currentYear: {
          ...(data.analystEstimates?.currentYear || {}),
          revenue: firstNumber(data.analystEstimates?.currentYear?.revenue, consensusCurrentRevenue),
          eps: firstNumber(data.analystEstimates?.currentYear?.eps, consensusCurrentEpsForEstimate),
          earnings: repairEstimateEarnings(
            data.analystEstimates?.currentYear?.earnings,
            data.analystEstimates?.currentYear?.eps,
            consensusCurrentEpsForEstimate
          )
        },
        nextYear: {
          ...(data.analystEstimates?.nextYear || {}),
          revenue: firstNumber(data.analystEstimates?.nextYear?.revenue, consensusNextRevenue),
          eps: firstNumber(data.analystEstimates?.nextYear?.eps, consensusNextEpsForEstimate),
          earnings: repairEstimateEarnings(
            data.analystEstimates?.nextYear?.earnings,
            data.analystEstimates?.nextYear?.eps,
            consensusNextEpsForEstimate
          )
        }
      }
    : null;
  const suppliedAnalystEstimates = yahooLockedEstimates
    ? yahooRepairedAnalystEstimates
    : currentEpsNeedsRepair
    ? {
        ...(data.analystEstimates || {}),
        currentYear: {
          ...(data.analystEstimates?.currentYear || {}),
          earnings: currentEarnings,
          eps: currentEps
        }
      }
    : data.analystEstimates;
  const nowIso = new Date().toISOString();
  const analystUpdatesCheckedAt = data.analystUpdatesCheckedAt ||
    (Array.isArray(data.analystUpdates) && data.analystUpdates.length ? nowIso : null);
  const institutionalHoldersCheckedAt = data.institutionalHoldersCheckedAt ||
    (Array.isArray(data.institutionalHolders) && data.institutionalHolders.length ? nowIso : null);
  const insiderTransactionsCheckedAt = data.insiderTransactionsCheckedAt ||
    (Array.isArray(data.insiderTransactions) && data.insiderTransactions.length ? nowIso : null);

  return {
    ...data,
    marketCap,
    sharesOutstanding,
    pe: useFmpOnlyMetricCards ? data.pe : pe,
    priceToSales: useFmpOnlyMetricCards ? data.priceToSales : priceToSales,
    priceToBook: useFmpOnlyMetricCards ? data.priceToBook : priceToBook,
    bookValuePerShare: useFmpOnlyMetricCards ? data.bookValuePerShare : bookValuePerShare,
    forwardPE: useFmpOnlyMetricCards ? data.forwardPE : forwardPE,
    pegRatio: useFmpOnlyMetricCards ? data.pegRatio : pegRatio,
    revenueGrowth: useFmpOnlyMetricCards ? data.revenueGrowth : revenueGrowth,
    earningsGrowth: useFmpOnlyMetricCards ? data.earningsGrowth : earningsGrowth,
    grossMargins: useFmpOnlyMetricCards ? data.grossMargins : grossMargins,
    operatingMargins: useFmpOnlyMetricCards ? data.operatingMargins : operatingMargins,
    profitMargins: useFmpOnlyMetricCards ? data.profitMargins : profitMargins,
    fiftyTwoWeekHigh,
    fiftyTwoWeekLow,
    freeCashflow: useFmpOnlyMetricCards ? data.freeCashflow : freeCashflow,
    targetMean: useFmpOnlyMetricCards ? data.targetMean : targetMean,
    recommendationKey: useFmpOnlyMetricCards ? data.recommendationKey : recommendationKey,
    analystRatingText: useFmpOnlyMetricCards ? data.analystRatingText : analystRatingText,
    historicalPe: guaranteedHistoricalPe,
    analystEstimates: yahooLockedEstimates || hasSuppliedAnalystEstimates
      ? suppliedAnalystEstimates
      : fallbackAnalystEstimates,
    analystUpdatesCheckedAt,
    institutionalHoldersCheckedAt,
    insiderTransactionsCheckedAt,
    revenueHistory: guaranteedRevenueHistory,
    marginHistory: guaranteedMarginHistory,
    revenueData: guaranteedRevenueData
  };
}

async function repairHistoricalPeIfNeeded(ticker, data = {}) {
  const currentRows = Array.isArray(data.historicalPe) ? data.historicalPe : [];
  if (currentRows.filter((row) => !row?.isCurrent && toNumberOrNull(row?.pe) !== null).length >= 3) {
    return data;
  }

  const annualRows = Array.isArray(data.revenueData)
    ? data.revenueData.filter((row) =>
        !row?.isInterim &&
        row?.year &&
        toNumberOrNull(row.eps) !== null &&
        toNumberOrNull(row.eps) !== 0
      )
    : [];
  if (!annualRows.length) return data;

  const yearEndPrices = await fetchYahooYearEndPrices(ticker).catch(() => []);
  const priceByYear = new Map(
    (yearEndPrices || [])
      .filter((row) => toNumberOrNull(row.close) !== null)
      .map((row) => [Number(row.year), toNumberOrNull(row.close)])
  );
  if (!priceByYear.size) return data;

  const rebuiltRows = annualRows
    .map((row) => {
      const price = priceByYear.get(Number(row.year));
      const eps = toNumberOrNull(row.eps);
      const pe = price !== undefined && eps !== null && eps !== 0 ? price / eps : null;
      return {
        year: row.year,
        period: row.period || String(row.year),
        isInterim: false,
        pe,
        price,
        eps,
        source: "Yahoo year-end price"
      };
    })
    .filter((row) => row.pe !== null && Number.isFinite(row.pe) && Math.abs(row.pe) < 1000)
    .slice(-6);

  if (!rebuiltRows.length) return data;

  const nonAnnualRows = currentRows.filter((row) => row?.isInterim || row?.isCurrent);
  return {
    ...data,
    historicalPe: [...rebuiltRows, ...nonAnnualRows]
      .filter((row) => toNumberOrNull(row.pe) !== null && Math.abs(toNumberOrNull(row.pe)) < 1000)
      .slice(-7)
  };
}

function withDerivedQuarterlyHistoricalPe(data = {}) {
  const currentRows = Array.isArray(data.historicalPe) ? data.historicalPe : [];
  if (!currentRows.length) return data;
  const cleanRows = currentRows.filter((row) =>
    !row?.isInterim ||
    /FMP quarter-end price/i.test(String(row?.source || ""))
  );
  if (cleanRows.length === currentRows.length) return data;

  return {
    ...data,
    historicalPe: cleanRows,
    historicalPeSource: "FMP annual ratios"
  };
}

function mergeHistoricalPeRows(annualRows = [], otherRows = []) {
  const cleanAnnualRows = (Array.isArray(annualRows) ? annualRows : [])
    .filter((row) =>
      !row?.isInterim &&
      !row?.isCurrent &&
      toNumberOrNull(row?.pe) !== null &&
      Number.isFinite(toNumberOrNull(row?.pe)) &&
      Math.abs(toNumberOrNull(row?.pe)) < 1000
    )
    .sort((a, b) => Number(a.year) - Number(b.year))
    .slice(-7);
  const cleanOtherRows = (Array.isArray(otherRows) ? otherRows : [])
    .filter((row) =>
      (row?.isInterim || row?.isCurrent) &&
      toNumberOrNull(row?.pe) !== null &&
      Number.isFinite(toNumberOrNull(row?.pe)) &&
      Math.abs(toNumberOrNull(row?.pe)) < 1000
    )
    .sort((a, b) => {
      if (a?.isCurrent !== b?.isCurrent) return a?.isCurrent ? 1 : -1;
      const yearDiff = Number(a.year) - Number(b.year);
      if (yearDiff !== 0) return yearDiff;
      return String(a.period || "").localeCompare(String(b.period || ""));
    })
    .slice(-20);

  return [...cleanAnnualRows, ...cleanOtherRows];
}

function withDerivedBalanceSheetMetrics(data = {}) {
  if (toNumberOrNull(data.netCashPerShare) !== null) return data;
  const netCash = toNumberOrNull(data.netCash);
  const totalCash = toNumberOrNull(data.totalCash ?? data.cashAndCashEquivalents);
  const totalDebt = toNumberOrNull(data.totalDebt);
  const derivedNetCash = netCash ?? (
    totalCash !== null || totalDebt !== null
      ? (totalCash || 0) - (totalDebt || 0)
      : null
  );
  const sharesOutstanding = firstFiniteNumber(
    data.marketCap && data.price ? data.marketCap / data.price : null,
    data.weightedAverageShsOut,
    data.sharesOutstanding
  );
  if (derivedNetCash === null || !sharesOutstanding) return data;
  return {
    ...data,
    netCash: netCash ?? derivedNetCash,
    netCashPerShare: derivedNetCash / sharesOutstanding
  };
}

async function prepareStockResponseData(ticker, data = {}, options = {}) {
  let baseData = withGuaranteedAnalystSection(applyStockEarningsDateOverrides(ticker, data));
  const existingNextQuarter = baseData.analystEstimates?.nextQuarter || {};
  if (
    !baseData.quarterEstimateCheckedAt &&
    (
      toNumberOrNull(existingNextQuarter.revenue) !== null ||
      toNumberOrNull(existingNextQuarter.eps) !== null ||
      Boolean(existingNextQuarter.date)
    )
  ) {
    baseData = {
      ...baseData,
      quarterEstimateCheckedAt: new Date().toISOString()
    };
  }
  const missingValuationMetrics = STOCK_ANALYSIS_VALUATION_FIELDS.some((field) => toNumberOrNull(baseData[field]) === null);
  const hasBalanceSheetValue =
    toNumberOrNull(baseData.totalCash) !== null ||
    toNumberOrNull(baseData.totalDebt) !== null ||
    toNumberOrNull(baseData.cashAndCashEquivalents) !== null;
  const needsBalanceSheetMetrics = !baseData.balanceSheetCheckedAt || !hasBalanceSheetValue;
  const [valuation, balanceSheetMetrics] = await Promise.all([
    missingValuationMetrics
      ? resolveWithin(fetchFmpStableValuationMetrics(ticker), options.fast ? 900 : 1200, {})
      : Promise.resolve({}),
    needsBalanceSheetMetrics
      ? resolveWithin(fetchLatestBalanceSheetMetrics(ticker, { fast: true }), options.fast ? 650 : 1600, {})
      : Promise.resolve({})
  ]);

  if (missingValuationMetrics) {
    const valuationPatch = {};
    if (Object.keys(valuation || {}).length) {
      STOCK_ANALYSIS_VALUATION_FIELDS.forEach((field) => {
        valuationPatch[field] = toNumberOrNull(valuation[field]);
      });
      FMP_TEXT_METRIC_FIELDS.forEach((field) => {
        valuationPatch[field] = firstText(valuation[field]) || null;
      });
      baseData = withGuaranteedAnalystSection({
        ...baseData,
        ...valuationPatch,
        valuationMetricsCheckedAt: new Date().toISOString(),
        valuationMetricsVersion: VALUATION_METRICS_VERSION
      });
      Stock.findOneAndUpdate(
        { ticker },
        {
          $set: Object.fromEntries(
            Object.entries({
              ...valuationPatch,
              valuationMetricsCheckedAt: baseData.valuationMetricsCheckedAt,
              valuationMetricsVersion: VALUATION_METRICS_VERSION
            }).map(([key, value]) => [`data.${key}`, value])
          )
        }
      ).catch((err) => {
        console.log("Fast valuation response cache skipped:", ticker, err.message);
      });
    }
  }

  if (needsBalanceSheetMetrics) {
    const balancePatch = {};
    const balanceFields = [
      "totalCash",
      "totalDebt",
      "cashAndCashEquivalents",
      "netCash",
      "netCashPerShare",
      "equityBookValue",
      "bookValuePerShare",
      "workingCapital"
    ];
    balanceFields.forEach((field) => {
      const value = toNumberOrNull(balanceSheetMetrics[field]);
      if (value !== null) balancePatch[field] = value;
    });
    const hasBalancePatchValue = balanceFields.some((field) => toNumberOrNull(balancePatch[field]) !== null);
    if (hasBalancePatchValue || !options.fast) {
      const balanceCheckedAt = balanceSheetMetrics.balanceSheetCheckedAt || new Date().toISOString();
      balancePatch.balanceSheetCheckedAt = balanceCheckedAt;
      balancePatch.balanceSheetMetricsVersion = BALANCE_SHEET_METRICS_VERSION;
      if (balanceSheetMetrics.balanceSheetAsOf) balancePatch.balanceSheetAsOf = balanceSheetMetrics.balanceSheetAsOf;
      if (balanceSheetMetrics.balanceSheetSource) balancePatch.balanceSheetSource = balanceSheetMetrics.balanceSheetSource;
      baseData = {
        ...baseData,
        ...balancePatch
      };
      Stock.findOneAndUpdate(
        { ticker },
        {
          $set: Object.fromEntries(
            Object.entries(balancePatch).map(([key, value]) => [`data.${key}`, value])
          )
        }
      ).catch((err) => {
        console.log("Fast balance response cache skipped:", ticker, err.message);
      });
    }
  }
  const repairedData = options.fast
    ? baseData
    : await repairHistoricalPeIfNeeded(ticker, baseData);
  const fmpMetricCards = await resolveWithin(fetchFmpMetricCards(ticker), options.fast ? 1800 : 3200, {});
  if (Object.keys(fmpMetricCards || {}).length) persistFmpMetricCards(ticker, fmpMetricCards);
  const adrNormalized = await normalizeForeignAdrStockData(
    ticker,
    applyFmpMetricCards(withDerivedQuarterlyHistoricalPe(repairedData), fmpMetricCards)
  );
  return normalizeForeignFinancialCurrencyStockData(ticker, adrNormalized);
}

function prepareCachedStockResponseData(ticker, data = {}) {
  return withDerivedQuarterlyHistoricalPe(
    withGuaranteedAnalystSection(applyStockEarningsDateOverrides(ticker, data || {}))
  );
}

function hasCompleteCompanyProfileSnapshot(data = {}) {
  return Boolean(
    data.ceo &&
    data.country &&
    data.exchange &&
    data.description &&
    toNumberOrNull(data.priceAvg50) !== null &&
    toNumberOrNull(data.priceAvg200) !== null &&
    toNumberOrNull(data.floatShares) !== null &&
    toNumberOrNull(data.freeFloatShares) !== null &&
    Array.isArray(data.executives) &&
    data.executives.length > 0
  );
}

function hasCachedHistoricalPe(responseData = {}) {
  const annualPeRows = Array.isArray(responseData.historicalPe)
    ? responseData.historicalPe.filter((row) =>
        !row?.isInterim &&
        !row?.isCurrent &&
        toNumberOrNull(row?.pe) !== null
      )
    : [];
  const hasFmpHistoricalPe =
    responseData.historicalPeSource === "FMP annual ratios" ||
    annualPeRows.some((row) => String(row?.source || "").includes("FMP"));
  return annualPeRows.length >= 3 && hasFmpHistoricalPe;
}

async function ensureCompleteNextQuarterEstimateForResponse(ticker, data = {}) {
  if (hasCompleteNextQuarterEstimate(data.analystEstimates?.nextQuarter)) {
    return data;
  }

  const estimate = await resolveWithin(
    fetchCalendarQuarterEstimate(ticker, { fast: true }),
    3200,
    {}
  );
  if (!hasCompleteNextQuarterEstimate(estimate)) {
    return data;
  }

  const nextQuarter = {
    revenue: normalizeStatementDollars(estimate.revenue),
    earnings: null,
    eps: toNumberOrNull(estimate.eps),
    date: estimate.date || null,
    fiscalQuarter: estimate.fiscalQuarter || null,
    source: estimate.source || "FMP earnings history"
  };

  const patchedData = {
    ...data,
    analystEstimates: {
      ...(data.analystEstimates || {}),
      nextQuarter
    },
    analystEstimatesSources: {
      ...(data.analystEstimatesSources || {}),
      nextQuarter: nextQuarter.source
    },
    analystEstimatesSource: "FMP",
    quarterEstimateCheckedAt: new Date().toISOString(),
    estimateDataVersion: STOCK_ESTIMATE_VERSION,
    epsBeatMiss: buildEpsBeatMissSeries(data.epsBeatMiss || [], nextQuarter)
  };

  Stock.findOneAndUpdate(
    { ticker },
    {
      $set: {
        "data.analystEstimates.nextQuarter": nextQuarter,
        "data.analystEstimatesSources.nextQuarter": nextQuarter.source,
        "data.analystEstimatesSource": "FMP",
        "data.quarterEstimateCheckedAt": patchedData.quarterEstimateCheckedAt,
        "data.estimateDataVersion": STOCK_ESTIMATE_VERSION,
        "data.epsBeatMiss": patchedData.epsBeatMiss
      }
    }
  ).catch((err) => {
    console.log("Next quarter estimate response repair cache skipped:", ticker, err.message);
  });

  return patchedData;
}

async function prepareCachedStockResponseDataFast(ticker, data = {}) {
  let responseData = prepareCachedStockResponseData(ticker, data);
  const hasBalanceSheetValues =
    toNumberOrNull(responseData.totalCash) !== null ||
    toNumberOrNull(responseData.totalDebt) !== null ||
    toNumberOrNull(responseData.cashAndCashEquivalents) !== null ||
    toNumberOrNull(responseData.netCash) !== null ||
    toNumberOrNull(responseData.equityBookValue) !== null ||
    toNumberOrNull(responseData.workingCapital) !== null;
  const needsFmpFastPatch =
    responseData.valuationMetricsVersion !== VALUATION_METRICS_VERSION ||
    responseData.balanceSheetMetricsVersion !== BALANCE_SHEET_METRICS_VERSION ||
    !hasBalanceSheetValues ||
    toNumberOrNull(responseData.beta) === null ||
    toNumberOrNull(responseData.volume) === null ||
    responseData.lastDividend === undefined ||
    !hasCompleteCompanyProfileSnapshot(responseData) ||
    responseData.estimateDataVersion !== STOCK_ESTIMATE_VERSION ||
    responseData.analystEstimatesSource !== "FMP" ||
    !hasCompleteNextQuarterEstimate(responseData.analystEstimates?.nextQuarter);
  if (needsFmpFastPatch) {
    const fastPatch = await resolveWithin(buildFastStockSnapshot(ticker, responseData), 2600, null);
    if (fastPatch) responseData = prepareCachedStockResponseData(ticker, fastPatch);
  }
  responseData = await ensureCompleteNextQuarterEstimateForResponse(ticker, responseData);
  if (responseData.valuationMetricsVersion !== VALUATION_METRICS_VERSION) {
    const valuationPatch = await resolveWithin(fetchFmpStableValuationMetrics(ticker), 2600, {});
    const valuationFields = {};
    if (Object.keys(valuationPatch || {}).length) {
      STOCK_ANALYSIS_VALUATION_FIELDS.forEach((field) => {
        valuationFields[field] = toNumberOrNull(valuationPatch[field]);
      });
      FMP_TEXT_METRIC_FIELDS.forEach((field) => {
        valuationFields[field] = firstText(valuationPatch[field]) || null;
      });
      if (valuationPatch.isAdr === true) {
        Object.assign(valuationFields, {
          isAdr: true,
          totalCash: null,
          totalDebt: null,
          cashAndCashEquivalents: null,
          netCash: null,
          netCashPerShare: null,
          equityBookValue: null,
          bookValuePerShare: null,
          workingCapital: null,
          balanceSheetAsOf: null,
          balanceSheetSource: null,
          balanceSheetCheckedAt: new Date().toISOString(),
          balanceSheetMetricsVersion: BALANCE_SHEET_METRICS_VERSION
        });
      }
      responseData = prepareCachedStockResponseData(ticker, {
        ...responseData,
        ...valuationFields,
        valuationMetricsCheckedAt: new Date().toISOString(),
        valuationMetricsVersion: VALUATION_METRICS_VERSION
      });
      Stock.findOneAndUpdate(
        { ticker },
        {
          $set: Object.fromEntries(
            Object.entries({
              ...valuationFields,
              valuationMetricsCheckedAt: responseData.valuationMetricsCheckedAt,
              valuationMetricsVersion: VALUATION_METRICS_VERSION
            }).map(([key, value]) => [`data.${key}`, value])
          )
        }
      ).catch((err) => {
        console.log("Cached valuation repair skipped:", ticker, err.message);
      });
    }
  }
  const repairedHasBalanceSheetValues =
    toNumberOrNull(responseData.totalCash) !== null ||
    toNumberOrNull(responseData.totalDebt) !== null ||
    toNumberOrNull(responseData.cashAndCashEquivalents) !== null ||
    toNumberOrNull(responseData.netCash) !== null ||
    toNumberOrNull(responseData.equityBookValue) !== null ||
    toNumberOrNull(responseData.workingCapital) !== null;
  if (responseData.isAdr === true) {
    responseData = prepareCachedStockResponseData(ticker, {
      ...responseData,
      totalCash: null,
      totalDebt: null,
      cashAndCashEquivalents: null,
      netCash: null,
      netCashPerShare: null,
      equityBookValue: null,
      bookValuePerShare: null,
      workingCapital: null,
      balanceSheetAsOf: null,
      balanceSheetSource: null,
      balanceSheetCheckedAt: responseData.balanceSheetCheckedAt || new Date().toISOString(),
      balanceSheetMetricsVersion: BALANCE_SHEET_METRICS_VERSION
    });
  } else if (responseData.balanceSheetMetricsVersion !== BALANCE_SHEET_METRICS_VERSION || !repairedHasBalanceSheetValues) {
    const balanceSheetPatch = await resolveWithin(fetchLatestBalanceSheetMetrics(ticker, { fast: true }), 2600, {});
    const balanceFields = [
      "totalCash",
      "totalDebt",
      "cashAndCashEquivalents",
      "netCash",
      "netCashPerShare",
      "equityBookValue",
      "bookValuePerShare",
      "workingCapital"
    ];
    const balanceValues = {};
    balanceFields.forEach((field) => {
      const value = toNumberOrNull(balanceSheetPatch[field]);
      if (value !== null) balanceValues[field] = value;
    });
    if (Object.keys(balanceValues).length) {
      responseData = prepareCachedStockResponseData(ticker, {
        ...responseData,
        ...balanceValues,
        balanceSheetAsOf: balanceSheetPatch.balanceSheetAsOf || responseData.balanceSheetAsOf || null,
        balanceSheetSource: balanceSheetPatch.balanceSheetSource || responseData.balanceSheetSource || null,
        balanceSheetCheckedAt: balanceSheetPatch.balanceSheetCheckedAt || new Date().toISOString(),
        balanceSheetMetricsVersion: BALANCE_SHEET_METRICS_VERSION
      });
      Stock.findOneAndUpdate(
        { ticker },
        {
          $set: Object.fromEntries(
            Object.entries({
              ...balanceValues,
              balanceSheetAsOf: responseData.balanceSheetAsOf || null,
              balanceSheetSource: responseData.balanceSheetSource || null,
              balanceSheetCheckedAt: responseData.balanceSheetCheckedAt,
              balanceSheetMetricsVersion: BALANCE_SHEET_METRICS_VERSION
            }).map(([key, value]) => [`data.${key}`, value])
          )
        }
      ).catch((err) => {
        console.log("Cached balance sheet repair skipped:", ticker, err.message);
      });
    }
  }
  const epsBeatMissRows = Array.isArray(responseData.epsBeatMiss) ? responseData.epsBeatMiss : [];
  const reportedEpsBeatMissRows = epsBeatMissRows.filter((row) => toNumberOrNull(row.actual) !== null);
  const hasNonFmpEpsBeatMissRows = epsBeatMissRows.some((row) =>
    row?.source && !/FMP/i.test(String(row.source))
  );
  const hasThinEpsBeatMissRows = epsBeatMissRows.length < 4 || reportedEpsBeatMissRows.length < 2;
  if (hasNonFmpEpsBeatMissRows || hasThinEpsBeatMissRows) {
    const fmpEpsBeatMissRows = await resolveWithin(fetchFmpEpsSurprises(ticker), 1400, []);
    if (Array.isArray(fmpEpsBeatMissRows) && fmpEpsBeatMissRows.length) {
      const epsBeatMiss = buildEpsBeatMissSeries(
        fmpEpsBeatMissRows,
        responseData.analystEstimates?.nextQuarter || {}
      );
      responseData = {
        ...responseData,
        epsBeatMiss,
        epsBeatMissCheckedAt: new Date().toISOString()
      };
      Stock.findOneAndUpdate(
        { ticker },
        {
          $set: {
            "data.epsBeatMiss": epsBeatMiss,
            "data.epsBeatMissCheckedAt": responseData.epsBeatMissCheckedAt
          }
        }
      ).catch((err) => {
        console.log("Fast EPS beat/miss response cache skipped:", ticker, err.message);
      });
    }
  }
  const hasNonFmpAnalystRows = (responseData.analystUpdates || [])
    .some((row) => row?.source && !/FMP/i.test(String(row.source)));
  const hasNonFmpInsiderRows = (responseData.insiderTransactions || [])
    .some((row) => row?.source && !/FMP/i.test(String(row.source)));
  const marketActivityUpdatedAt = responseData.marketActivityUpdatedAt
    ? new Date(responseData.marketActivityUpdatedAt).getTime()
    : 0;
  const marketActivityCheckedRecently =
    marketActivityUpdatedAt &&
    !Number.isNaN(marketActivityUpdatedAt) &&
    Date.now() - marketActivityUpdatedAt < 20 * 60 * 1000;
  const hasMissingAnalystRows = !marketActivityCheckedRecently &&
    (!Array.isArray(responseData.analystUpdates) || !responseData.analystUpdates.length);
  const hasMissingInsiderRows = !marketActivityCheckedRecently &&
    (!Array.isArray(responseData.insiderTransactions) || !responseData.insiderTransactions.length);
  const hasMissingHolderRows = !Array.isArray(responseData.institutionalHolders) || !responseData.institutionalHolders.length;
  const hasIncompleteInsiderRows = (responseData.insiderTransactions || []).some((row) =>
    (row.owner || row.filerName) && !(row.transaction || row.transactionType)
  );
  if (
    hasNonFmpAnalystRows ||
    hasNonFmpInsiderRows ||
    hasMissingAnalystRows ||
    hasMissingInsiderRows ||
    hasMissingHolderRows ||
    hasIncompleteInsiderRows
  ) {
    const fmpMarketActivity = await resolveWithin(fetchFmpMarketActivity(ticker), 1800, {
      analystUpdates: [],
      institutionalHolders: [],
      insiderTransactions: []
    });
    const hasFetchedMarketActivity =
      (Array.isArray(fmpMarketActivity.analystUpdates) && fmpMarketActivity.analystUpdates.length) ||
      (Array.isArray(fmpMarketActivity.institutionalHolders) && fmpMarketActivity.institutionalHolders.length) ||
      (Array.isArray(fmpMarketActivity.insiderTransactions) && fmpMarketActivity.insiderTransactions.length);
    if (!hasFetchedMarketActivity) {
      responseData = {
        ...responseData,
        marketActivityUpdatedAt: responseData.marketActivityUpdatedAt || new Date().toISOString()
      };
    } else {
    const marketActivityUpdatedAt = new Date().toISOString();
    const nextAnalystUpdates = fmpMarketActivity.analystUpdates?.length
      ? fmpMarketActivity.analystUpdates
      : responseData.analystUpdates || [];
    const nextInstitutionalHolders = fmpMarketActivity.institutionalHolders?.length
      ? fmpMarketActivity.institutionalHolders
      : responseData.institutionalHolders || [];
    const nextInsiderTransactions = fmpMarketActivity.insiderTransactions?.length
      ? fmpMarketActivity.insiderTransactions
      : responseData.insiderTransactions || [];
    responseData = {
      ...responseData,
      analystUpdates: nextAnalystUpdates,
      institutionalHolders: nextInstitutionalHolders,
      insiderTransactions: nextInsiderTransactions,
      analystUpdatesCheckedAt: marketActivityUpdatedAt,
      institutionalHoldersCheckedAt: marketActivityUpdatedAt,
      insiderTransactionsCheckedAt: marketActivityUpdatedAt,
      marketActivityUpdatedAt
    };
    Stock.findOneAndUpdate(
      { ticker },
      {
        $set: {
          "data.analystUpdates": responseData.analystUpdates,
          "data.institutionalHolders": responseData.institutionalHolders,
          "data.insiderTransactions": responseData.insiderTransactions,
          "data.analystUpdatesCheckedAt": marketActivityUpdatedAt,
          "data.institutionalHoldersCheckedAt": marketActivityUpdatedAt,
          "data.insiderTransactionsCheckedAt": marketActivityUpdatedAt,
          "data.marketActivityUpdatedAt": marketActivityUpdatedAt
        }
      }
    ).catch((err) => {
      console.log("Fast FMP market activity response cache skipped:", ticker, err.message);
    });
    }
  }
  const fmpMetricCards = await resolveWithin(fetchFmpMetricCards(ticker), 3200, {});
  responseData = applyFmpMetricCards(prepareCachedStockResponseData(ticker, responseData), fmpMetricCards);
  persistFmpMetricCards(ticker, fmpMetricCards);
  if (hasCachedHistoricalPe(responseData)) {
    const existingQuarterlyPeRows = Array.isArray(responseData.historicalPe)
      ? responseData.historicalPe.filter((row) => row?.isInterim && toNumberOrNull(row?.pe) !== null)
      : [];
    if (existingQuarterlyPeRows.length < 8 && Array.isArray(responseData.revenueData)) {
      const quarterlyPeRows = await resolveWithin(
        calculateFmpQuarterlyHistoricalPe(ticker, responseData.revenueData),
        3200,
        []
      );
      if (quarterlyPeRows.length) {
        const annualRows = responseData.historicalPe.filter((row) => !row?.isInterim && !row?.isCurrent);
        responseData = {
          ...responseData,
          historicalPe: mergeHistoricalPeRows(annualRows, quarterlyPeRows),
          historicalPeSource: "FMP annual ratios / FMP quarter-end price"
        };
      }
    }
    return finalizeStockResponseForClient(ticker, responseData);
  }

  const fmpPeRows = await resolveWithin(fetchFmpHistoricalPe(ticker), 1000, []);
  if (!Array.isArray(fmpPeRows) || !fmpPeRows.length) {
    return finalizeStockResponseForClient(ticker, responseData);
  }

  const quarterlyPeRows = await resolveWithin(
    calculateFmpQuarterlyHistoricalPe(ticker, responseData.revenueData),
    3200,
    []
  );
  const historicalPe = mergeHistoricalPeRows(fmpPeRows, quarterlyPeRows);
  const historicalPeCheckedAt = new Date().toISOString();
  responseData = {
    ...responseData,
    historicalPe,
    historicalPeSource: quarterlyPeRows.length
      ? "FMP annual ratios / FMP quarter-end price"
      : "FMP annual ratios",
    historicalPeCheckedAt
  };

  Stock.findOneAndUpdate(
    { ticker },
    {
      $set: {
        "data.historicalPe": historicalPe,
        "data.historicalPeSource": responseData.historicalPeSource,
        "data.historicalPeCheckedAt": historicalPeCheckedAt
      }
    }
  ).catch((err) => {
    console.log("Fast historical PE response cache skipped:", ticker, err.message);
  });

  return finalizeStockResponseForClient(ticker, responseData);
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
    setYahooCooldown(err, "time-series financials", ticker);
    console.log("Yahoo time-series financials skipped:", ticker, err.message);
    return [];
  }
}

async function fetchYahooFinancialHistory(ticker) {
  const timeSeriesHistory = await fetchYahooTimeSeriesFinancials(ticker);

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
    setYahooCooldown(err, "financial history", ticker);
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
    setYahooCooldown(err, "year-end prices", ticker);
    console.log("Yahoo year-end prices skipped:", ticker, err.message);
    return [];
  }
}

async function fetchFmpIncomeStatementHistory(ticker) {
  if (!process.env.FMP_API_KEY) return [];
  if (!canUseFmp()) return [];

  try {
    const incomeRes = await axios.get("https://financialmodelingprep.com/stable/income-statement", {
      params: {
        symbol: ticker,
        period: "annual",
        limit: 7,
        apikey: process.env.FMP_API_KEY
      },
      timeout: 3500
    });
    const incomeRows = Array.isArray(incomeRes.data) ? incomeRes.data : [];

    const rows = incomeRows
      .map((row) => ({
        year: Number(row.calendarYear || row.fiscalYear || String(row.date || "").slice(0, 4)),
        period: String(row.fiscalYear || row.calendarYear || String(row.date || "").slice(0, 4)),
        revenue: toBillions(row.revenue),
        earnings: toBillions(row.netIncome),
        grossProfit: toBillions(row.grossProfit),
        operatingIncome: toBillions(row.operatingIncome),
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
        sourceCurrency: firstText(row.reportedCurrency, row.currency) || null,
        source: "FMP stable income statement"
      }))
      .filter((row) => row.year)
      .sort((a, b) => a.year - b.year);

    if (rows.length) return rows;
  } catch (err) {
    setFmpCooldown(err, "stable income statement", ticker);
    console.log("FMP income statement skipped:", ticker, err.response?.status || err.message);
  }

  return [];
}

async function fetchAlphaVantageIncomeStatementHistory(ticker) {
  const data = await getAlphaVantageFundamentalData(ticker, "INCOME_STATEMENT");
  const rows = Array.isArray(data?.annualReports) ? data.annualReports : [];

  return rows
    .map((row) => ({
      year: Number(String(row.fiscalDateEnding || "").slice(0, 4)),
      period: String(String(row.fiscalDateEnding || "").slice(0, 4)),
      revenue: toBillions(row.totalRevenue),
      earnings: toBillions(row.netIncome),
      grossProfit: toBillions(row.grossProfit),
      operatingIncome: toBillions(row.operatingIncome),
      eps: null,
      source: "Alpha Vantage income statement"
    }))
    .filter((row) => row.year && (row.revenue !== null || row.earnings !== null))
    .sort((a, b) => a.year - b.year);
}

const fmpQuarterNumber = (row = {}) => {
  const periodMatch = String(row.period || "").match(/Q([1-4])/i);
  if (periodMatch) return Number(periodMatch[1]);

  const date = new Date(row.date);
  if (Number.isNaN(date.getTime())) return null;
  return Math.floor(date.getUTCMonth() / 3) + 1;
};

async function fetchFmpQuarterlyFinancialHistory(ticker) {
  if (!process.env.FMP_API_KEY) return [];
  if (!canUseFmp()) return [];

  try {
    const [incomeData, cashFlowData] = await Promise.all([
      getFmpData(ticker, "quarterly income statement", [
        "/stable/income-statement?symbol={ticker}&period=quarter&limit=20"
      ]),
      getFmpData(ticker, "quarterly cash flow", [
        "/stable/cash-flow-statement?symbol={ticker}&period=quarter&limit=20"
      ])
    ]);
    const incomeRows = (Array.isArray(incomeData) ? incomeData : incomeData ? [incomeData] : [])
      .map((row) => ({
        ...row,
        fiscalYear: Number(row.calendarYear || row.fiscalYear || String(row.date || "").slice(0, 4)),
        fiscalQuarter: fmpQuarterNumber(row)
      }))
      .filter((row) => row.fiscalYear && row.fiscalQuarter)
      .sort((a, b) => {
        const yearDiff = a.fiscalYear - b.fiscalYear;
        if (yearDiff !== 0) return yearDiff;
        return a.fiscalQuarter - b.fiscalQuarter;
      });
    if (!incomeRows.length) return [];

    const cashByYearQuarter = new Map(
      (Array.isArray(cashFlowData) ? cashFlowData : cashFlowData ? [cashFlowData] : [])
        .map((row) => {
          const fiscalYear = Number(row.calendarYear || row.fiscalYear || String(row.date || "").slice(0, 4));
          const fiscalQuarter = fmpQuarterNumber(row);
          return [`${fiscalYear}:${fiscalQuarter}`, row];
        })
    );

    return incomeRows
      .map((row) => {
        const cash = cashByYearQuarter.get(`${row.fiscalYear}:${row.fiscalQuarter}`) || {};
        return {
          year: row.fiscalYear,
          period: `${row.fiscalYear} Q${row.fiscalQuarter}`,
          date: row.date || null,
          isInterim: true,
          revenue: toBillions(row.revenue),
          earnings: toBillions(row.netIncome),
          grossProfit: toBillions(row.grossProfit),
          operatingIncome: toBillions(row.operatingIncome),
          operatingCashflow: toBillions(
            cash.operatingCashFlow ??
              cash.operatingCashflow ??
              cash.netCashProvidedByOperatingActivities
          ),
          freeCashflow: toBillions(cash.freeCashFlow ?? cash.freeCashflow),
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
          sourceCurrency: firstText(row.reportedCurrency, row.currency) || null,
          source: "FMP quarterly financials"
        };
      })
      .filter((row) =>
        row.revenue !== null ||
        row.earnings !== null ||
        row.eps !== null ||
        row.operatingCashflow !== null ||
        row.freeCashflow !== null
      )
      .slice(-40);
  } catch (err) {
    setFmpCooldown(err, "quarterly financials", ticker);
    console.log("FMP quarterly financials skipped:", ticker, err.response?.status || err.message);
    return [];
  }
}

async function fetchFmpFinancialHistory(ticker) {
  const [annualRows, quarterlyRows, annualCashData] = await Promise.all([
    fetchFmpIncomeStatementHistory(ticker),
    fetchFmpQuarterlyFinancialHistory(ticker),
    getFmpData(ticker, "annual cash flow", [
      "/stable/cash-flow-statement?symbol={ticker}&period=annual&limit=7"
    ])
  ]);
  const annualCashRows = (Array.isArray(annualCashData) ? annualCashData : annualCashData ? [annualCashData] : [])
    .map((row) => ({
      year: Number(row.calendarYear || row.fiscalYear || String(row.date || "").slice(0, 4)),
      period: String(row.fiscalYear || row.calendarYear || String(row.date || "").slice(0, 4)),
      operatingCashflow: toBillions(
        row.operatingCashFlow ??
          row.operatingCashflow ??
          row.netCashProvidedByOperatingActivities
      ),
      freeCashflow: toBillions(row.freeCashFlow ?? row.freeCashflow),
      sourceCurrency: firstText(row.reportedCurrency, row.currency) || null,
      source: "FMP stable cash flow statement"
    }))
    .filter((row) => row.year)
    .sort((a, b) => a.year - b.year);

  return mergeHistoricalFinancials(
    [...annualRows, ...quarterlyRows],
    annualCashRows,
    Infinity
  );
}

const parseStockAnalysisNumber = (value) => {
  const text = String(value || "")
    .replace(/[$,%]/g, "")
    .replace(/\u2212/g, "-")
    .trim();
  if (!text || text === "-" || /^n\/a$/i.test(text)) return null;
  const multiplier = /\((.*)\)/.test(text) ? -1 : 1;
  const number = Number(text.replace(/[(),]/g, ""));
  return Number.isFinite(number) ? number * multiplier : null;
};

async function fetchStockAnalysisBalanceSheetMetrics(ticker) {
  try {
    const { data } = await axios.get(
      buildStockAnalysisUrl(ticker, "financials/balance-sheet/"),
      {
        headers: { "User-Agent": "Mozilla/5.0" },
        timeout: 4500
      }
    );
    const $ = cheerio.load(data || "");
    const table = $("table").first();
    if (!table.length) return {};

    const headers = table.find("thead tr").first().find("th").toArray()
      .slice(1)
      .map((cell) => $(cell).text().trim());
    const selectedIndex = 0;

    const rows = new Map();
    table.find("tbody tr").each((_, row) => {
      const cells = $(row).find("td").toArray();
      const label = $(cells[0]).text().trim().replace(/\s+/g, " ").toLowerCase();
      if (!label) return;
      rows.set(label, cells.slice(1).map((cell) => parseStockAnalysisNumber($(cell).text())));
    });

    const read = (...labels) => {
      for (const label of labels) {
        const values = rows.get(label.toLowerCase());
        if (!values) continue;
        const value = toNumberOrNull(values[selectedIndex]);
        if (value !== null) return value * 1000000;
      }
      return null;
    };

    const totalCash = read(
      "Cash & Equivalents",
      "Cash and Equivalents",
      "Cash",
      "Cash & Short-Term Investments",
      "Cash and Short-Term Investments"
    );
    const cashAndCashEquivalents = read(
      "Cash & Equivalents",
      "Cash and Equivalents",
      "Cash"
    );
    const totalDebt = firstFiniteNumber(
      read("Total Debt", "Total Debt & Finance Lease Obligations"),
      (() => {
        const shortTermDebt = read(
          "Short-Term Debt",
          "Short Term Debt",
          "Current Debt",
          "Current Portion of Long-Term Debt",
          "Current Portion of Long Term Debt"
        );
        const longTermDebt = read(
          "Long-Term Debt",
          "Long Term Debt",
          "Long-Term Debt & Finance Lease Obligations",
          "Long Term Debt & Finance Lease Obligations"
        );
        return shortTermDebt !== null || longTermDebt !== null
          ? (shortTermDebt || 0) + (longTermDebt || 0)
          : null;
      })()
    );
    const netCash = read("Net Cash (Debt)", "Net Cash", "Net Cash / Debt");
    const netCashPerShare = firstFiniteNumber(
      toNumberOrNull(rows.get("net cash per share")?.[selectedIndex]),
      toNumberOrNull(rows.get("net cash (debt) per share")?.[selectedIndex])
    );
    const equityBookValue = read("Book Value", "Shareholders' Equity", "Total Equity");
    const bookValuePerShare = firstFiniteNumber(
      toNumberOrNull(rows.get("book value per share")?.[selectedIndex]),
      toNumberOrNull(rows.get("shareholders' equity per share")?.[selectedIndex])
    );
    const workingCapital = firstFiniteNumber(
      read("Working Capital"),
      (() => {
        const currentAssets = read("Total Current Assets");
        const currentLiabilities = read("Total Current Liabilities");
        return currentAssets !== null && currentLiabilities !== null
          ? currentAssets - currentLiabilities
          : null;
      })()
    );
    if (totalCash === null && totalDebt === null) return {};

    const selectedHeader = headers[selectedIndex] || null;
    const year = selectedHeader?.match(/\b(?:FY\s*)?(\d{4})\b/i)?.[1] || null;
    return {
      totalCash: cashAndCashEquivalents ?? totalCash,
      totalDebt,
      cashAndCashEquivalents,
      netCash,
      netCashPerShare,
      equityBookValue,
      bookValuePerShare,
      workingCapital,
      balanceSheetAsOf: year ? `${year}-12-31` : null,
      balanceSheetSource: "StockAnalysis latest balance sheet"
    };
  } catch (err) {
    setStockAnalysisCooldown(err, "balance sheet", ticker);
    console.log("StockAnalysis balance sheet skipped:", ticker, err.response?.status || err.message);
    return {};
  }
}

async function fetchStockAnalysisAnnualFinancialHistoryFast(ticker) {
  try {
    const { data } = await axios.get(
      buildStockAnalysisUrl(ticker, "financials/income-statement/"),
      {
        headers: { "User-Agent": "Mozilla/5.0" },
        timeout: 3500
      }
    );
    const $ = cheerio.load(data || "");
    const table = $("table").first();
    if (!table.length) return [];
    const statementCurrency = $("main").text().match(/Currency is\s+([A-Z]{3})/i)?.[1]?.toUpperCase() || null;

    const rawHeaders = table.find("thead tr").first().find("th").toArray()
      .slice(1)
      .map((cell) => ({
        id: $(cell).attr("id"),
        text: $(cell).text().trim()
      }));
    const valueOffset = rawHeaders.some((header) => header.id === "TTM" || /^TTM$/i.test(header.text)) ? 1 : 0;
    const headers = rawHeaders.filter(isCompletedStockAnalysisAnnualHeader);
    const valuesByLabel = new Map();

    table.find("tbody tr").each((_, row) => {
      const cells = $(row).find("td").toArray();
      const label = $(cells[0]).text().trim().replace(/\s+/g, " ");
      if (!label) return;
      valuesByLabel.set(
        label.toLowerCase(),
        cells.slice(1).map((cell) => parseStockAnalysisNumber($(cell).text()))
      );
    });

    const valuesFor = (...labels) => {
      for (const label of labels) {
        const values = valuesByLabel.get(label.toLowerCase());
        if (values) return values;
      }
      return [];
    };
    const revenueValues = valuesFor("Revenue");
    const earningsValues = valuesFor("Net Income");
    const grossProfitValues = valuesFor("Gross Profit", "Net Interest Income");
    const operatingIncomeValues = valuesFor("Operating Income", "Pretax Income");
    const epsValues = valuesFor("EPS (Diluted)", "EPS Diluted", "Diluted EPS");

    return headers
      .map((header, index) => {
        const year = Number(String(header.id).slice(0, 4));
        if (!Number.isFinite(year)) return null;
        return {
          year,
          period: String(year),
          revenue: revenueValues[index + valueOffset] !== undefined ? revenueValues[index + valueOffset] / 1000 : null,
          earnings: earningsValues[index + valueOffset] !== undefined ? earningsValues[index + valueOffset] / 1000 : null,
          grossProfit: grossProfitValues[index + valueOffset] !== undefined ? grossProfitValues[index + valueOffset] / 1000 : null,
          operatingIncome: operatingIncomeValues[index + valueOffset] !== undefined ? operatingIncomeValues[index + valueOffset] / 1000 : null,
          eps: epsValues[index + valueOffset] ?? null,
          sourceCurrency: statementCurrency,
          source: "StockAnalysis fast annual financials"
        };
      })
      .filter((row) => row?.year)
      .sort((a, b) => a.year - b.year);
  } catch (err) {
    setStockAnalysisCooldown(err, "fast annual financials", ticker);
    console.log("StockAnalysis fast annual financials skipped:", ticker, err.response?.status || err.message);
    return [];
  }
}

async function fetchStockAnalysisIncomeStatementHistory(ticker) {
  try {
    const stockAnalysisRequest = (path) =>
      axios.get(
        buildStockAnalysisUrl(ticker, path),
        {
          headers: { "User-Agent": "Mozilla/5.0" },
          timeout: STOCK_PROVIDER_TIMEOUT_MS
        }
      );
    let [annualResponse, quarterlyResponse, annualCashFlowResponse, quarterlyCashFlowResponse] = await Promise.all([
      stockAnalysisRequest("financials/income-statement/"),
      stockAnalysisRequest("financials/income-statement/?p=quarterly").catch(() => ({ data: "" })),
      stockAnalysisRequest("financials/cash-flow-statement/").catch(() => ({ data: "" })),
      stockAnalysisRequest("financials/cash-flow-statement/?p=quarterly").catch(() => ({ data: "" }))
    ]);
    const countQuarterlyHeaders = (html) => {
      const page = cheerio.load(html || "");
      return page("table").first().find("thead tr").first().find("th").toArray()
        .slice(1)
        .filter((cell) => /\bQ[1-4]\s+\d{4}\b/i.test(page(cell).text().trim()))
        .length;
    };
    if (countQuarterlyHeaders(quarterlyResponse.data) < 4) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      const retryQuarterlyResponse = await stockAnalysisRequest("financials/income-statement/?p=quarterly")
        .catch(() => ({ data: "" }));
      if (countQuarterlyHeaders(retryQuarterlyResponse.data) > countQuarterlyHeaders(quarterlyResponse.data)) {
        quarterlyResponse = retryQuarterlyResponse;
      }
    }
    if (countQuarterlyHeaders(quarterlyCashFlowResponse.data) < 4) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      const retryCashFlowResponse = await stockAnalysisRequest("financials/cash-flow-statement/?p=quarterly")
        .catch(() => ({ data: "" }));
      if (countQuarterlyHeaders(retryCashFlowResponse.data) > countQuarterlyHeaders(quarterlyCashFlowResponse.data)) {
        quarterlyCashFlowResponse = retryCashFlowResponse;
      }
    }
    const { data } = annualResponse;
    const $ = cheerio.load(data);
    const table = $("table").first();
    if (!table.length) return [];
    const statementCurrency = $("main").text().match(/Currency is\s+([A-Z]{3})/i)?.[1]?.toUpperCase() || null;

    const rawHeaders = table.find("thead tr").first().find("th").toArray()
      .slice(1)
      .map((cell) => ({
        id: $(cell).attr("id"),
        text: $(cell).text().trim()
      }));
    const valueOffset = rawHeaders.some((header) => header.id === "TTM" || /^TTM$/i.test(header.text)) ? 1 : 0;
    const headers = rawHeaders.filter(isCompletedStockAnalysisAnnualHeader);
    const valuesByLabel = new Map();

    table.find("tbody tr").each((_, row) => {
      const cells = $(row).find("td").toArray();
      const label = $(cells[0]).text().trim().replace(/\s+/g, " ");
      if (!label) return;
      valuesByLabel.set(
        label.toLowerCase(),
        cells.slice(1).map((cell) => parseStockAnalysisNumber($(cell).text()))
      );
    });

    const valuesFor = (...labels) => {
      for (const label of labels) {
        const values = valuesByLabel.get(label.toLowerCase());
        if (values) return values;
      }
      return [];
    };
    const revenueValues = valuesFor("Revenue");
    const earningsValues = valuesFor("Net Income");
    const grossProfitValues = valuesFor("Gross Profit", "Net Interest Income");
    const operatingIncomeValues = valuesFor("Operating Income", "Pretax Income");
    const epsValues = valuesFor("EPS (Diluted)", "EPS Diluted", "Diluted EPS");
    const annualCashFlow = cheerio.load(annualCashFlowResponse.data || "");
    const annualCashValuesByLabel = new Map();

    annualCashFlow("table").first().find("tbody tr").each((_, row) => {
      const cells = annualCashFlow(row).find("td").toArray();
      const label = annualCashFlow(cells[0]).text().trim().replace(/\s+/g, " ");
      if (!label) return;
      annualCashValuesByLabel.set(
        label.toLowerCase(),
        cells.slice(1).map((cell) => parseStockAnalysisNumber(annualCashFlow(cell).text()))
      );
    });

    const annualCashValuesFor = (...labels) => {
      for (const label of labels) {
        const values = annualCashValuesByLabel.get(label.toLowerCase());
        if (values) return values;
      }
      return [];
    };
    const annualOperatingCashflowValues = annualCashValuesFor("Operating Cash Flow");
    const annualFreeCashflowValues = annualCashValuesFor("Free Cash Flow");

    const annualRows = headers
      .map((header, index) => {
        const year = Number(String(header.id).slice(0, 4));
        if (!Number.isFinite(year)) return null;

        return {
          year,
          period: String(year),
          revenue: revenueValues[index + valueOffset] !== undefined ? revenueValues[index + valueOffset] / 1000 : null,
          earnings: earningsValues[index + valueOffset] !== undefined ? earningsValues[index + valueOffset] / 1000 : null,
          grossProfit: grossProfitValues[index + valueOffset] !== undefined ? grossProfitValues[index + valueOffset] / 1000 : null,
          operatingIncome: operatingIncomeValues[index + valueOffset] !== undefined ? operatingIncomeValues[index + valueOffset] / 1000 : null,
          operatingCashflow: annualOperatingCashflowValues[index + valueOffset] !== undefined ? annualOperatingCashflowValues[index + valueOffset] / 1000 : null,
          freeCashflow: annualFreeCashflowValues[index + valueOffset] !== undefined ? annualFreeCashflowValues[index + valueOffset] / 1000 : null,
          eps: epsValues[index + valueOffset] ?? null,
          sourceCurrency: statementCurrency,
          source: "StockAnalysis financials"
        };
      })
      .filter((row) => row?.year)
      .sort((a, b) => a.year - b.year);

    const quarterly = cheerio.load(quarterlyResponse.data || "");
    const quarterlyTable = quarterly("table").first();
    const quarterHeaders = quarterlyTable.find("thead tr").first().find("th").toArray()
      .slice(1)
      .map((cell) => {
        const text = quarterly(cell).text().trim();
        const match = text.match(/\bQ([1-4])\s+(\d{4})\b/i);
        return {
          quarter: match ? Number(match[1]) : null,
          year: match ? Number(match[2]) : null
        };
      });
    const quarterValuesByLabel = new Map();

    quarterlyTable.find("tbody tr").each((_, row) => {
      const cells = quarterly(row).find("td").toArray();
      const label = quarterly(cells[0]).text().trim().replace(/\s+/g, " ");
      if (!label) return;
      quarterValuesByLabel.set(
        label.toLowerCase(),
        cells.slice(1).map((cell) => parseStockAnalysisNumber(quarterly(cell).text()))
      );
    });

    const quarterValuesFor = (...labels) => {
      for (const label of labels) {
        const values = quarterValuesByLabel.get(label.toLowerCase());
        if (values) return values;
      }
      return [];
    };
    const quarterRevenueValues = quarterValuesFor("Revenue");
    const quarterEarningsValues = quarterValuesFor("Net Income");
    const quarterGrossProfitValues = quarterValuesFor("Gross Profit", "Net Interest Income");
    const quarterOperatingIncomeValues = quarterValuesFor("Operating Income", "Pretax Income");
    const quarterEpsValues = quarterValuesFor("EPS (Diluted)", "EPS Diluted", "Diluted EPS");
    const quarterlyCashFlow = cheerio.load(quarterlyCashFlowResponse.data || "");
    const quarterCashValuesByLabel = new Map();

    quarterlyCashFlow("table").first().find("tbody tr").each((_, row) => {
      const cells = quarterlyCashFlow(row).find("td").toArray();
      const label = quarterlyCashFlow(cells[0]).text().trim().replace(/\s+/g, " ");
      if (!label) return;
      quarterCashValuesByLabel.set(
        label.toLowerCase(),
        cells.slice(1).map((cell) => parseStockAnalysisNumber(quarterlyCashFlow(cell).text()))
      );
    });

    const quarterCashValuesFor = (...labels) => {
      for (const label of labels) {
        const values = quarterCashValuesByLabel.get(label.toLowerCase());
        if (values) return values;
      }
      return [];
    };
    const quarterOperatingCashflowValues = quarterCashValuesFor("Operating Cash Flow");
    const quarterFreeCashflowValues = quarterCashValuesFor("Free Cash Flow");
    const quarterlyRows = quarterHeaders
      .map((header, index) => ({
        ...header,
        revenue: quarterRevenueValues[index],
        earnings: quarterEarningsValues[index],
        grossProfit: quarterGrossProfitValues[index],
        operatingIncome: quarterOperatingIncomeValues[index],
        eps: quarterEpsValues[index],
        operatingCashflow: quarterOperatingCashflowValues[index],
        freeCashflow: quarterFreeCashflowValues[index]
      }))
      .filter((row) => row.year && row.quarter)
      .sort((a, b) => {
        const yearDiff = a.year - b.year;
        if (yearDiff !== 0) return yearDiff;
        return a.quarter - b.quarter;
      })
      .map((row) => ({
        year: row.year,
        period: `${row.year} Q${row.quarter}`,
        isInterim: true,
        revenue: toNumberOrNull(row.revenue) !== null ? toNumberOrNull(row.revenue) / 1000 : null,
        earnings: toNumberOrNull(row.earnings) !== null ? toNumberOrNull(row.earnings) / 1000 : null,
        grossProfit: toNumberOrNull(row.grossProfit) !== null ? toNumberOrNull(row.grossProfit) / 1000 : null,
        operatingIncome: toNumberOrNull(row.operatingIncome) !== null ? toNumberOrNull(row.operatingIncome) / 1000 : null,
        operatingCashflow: toNumberOrNull(row.operatingCashflow) !== null ? toNumberOrNull(row.operatingCashflow) / 1000 : null,
        freeCashflow: toNumberOrNull(row.freeCashflow) !== null ? toNumberOrNull(row.freeCashflow) / 1000 : null,
        eps: toNumberOrNull(row.eps),
        sourceCurrency: statementCurrency,
        source: "StockAnalysis quarterly financials"
      }))
      .filter((row) =>
        row.revenue !== null ||
        row.earnings !== null ||
        row.eps !== null ||
        row.grossProfit !== null ||
        row.operatingIncome !== null ||
        row.operatingCashflow !== null ||
        row.freeCashflow !== null
      );

    return [...annualRows, ...quarterlyRows].sort((a, b) => {
      const yearDiff = Number(a.year) - Number(b.year);
      if (yearDiff !== 0) return yearDiff;
      if (Boolean(a.isInterim) !== Boolean(b.isInterim)) return a.isInterim ? 1 : -1;
      return String(a.period || "").localeCompare(String(b.period || ""));
    });
  } catch (err) {
    setStockAnalysisCooldown(err, "financials", ticker);
    console.log("StockAnalysis financials skipped:", ticker, err.response?.status || err.message);
    return [];
  }
}

const selectYahooAnnualEstimateTrends = (trends = []) => {
  const annualEstimateTrends = trends.filter((item) =>
    /y$/i.test(String(item?.period || ""))
  );
  const currentYear =
    trends.find((item) => item.period === "0y") ||
    annualEstimateTrends[0] ||
    {};
  const nextYear =
    trends.find((item) => item.period === "+1y") ||
    annualEstimateTrends.find((item) => item !== currentYear) ||
    {};

  return { currentYear, nextYear };
};

const estimateFromYahooTrend = (trend = {}) => ({
  revenue: firstYahooNumber(trend?.revenueEstimate?.avg),
  earnings: null,
  eps: firstYahooNumber(trend?.earningsEstimate?.avg)
});

const yahooDateToIso = (value) => {
  if (!value) return null;
  const numeric = Number(value);
  const date = value instanceof Date
    ? value
    : Number.isFinite(numeric) && String(value).trim() !== ""
      ? new Date(numeric < 10000000000 ? numeric * 1000 : numeric)
      : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
};

const buildYahooMarketActivity = (summary = {}, financialData = {}) => {
  const analystUpdates = (summary.upgradeDowngradeHistory?.history || [])
    .map((item) => ({
      firm: firstText(item.firm),
      latestRating: firstText(item.toGrade),
      previousRating: firstText(item.fromGrade),
      action: firstText(item.action),
      priceTarget: toNumberOrNull(item.priceTarget),
      date: yahooDateToIso(item.epochGradeDate),
      source: "Yahoo Finance"
    }))
    .filter((item) => item.firm || item.latestRating)
    .slice(0, 12);

  const institutionalHolders = (summary.institutionOwnership?.ownershipList || [])
    .map((item) => ({
      institution: firstText(item.organization),
      shares: toNumberOrNull(item.position),
      value: toNumberOrNull(item.value),
      percentHeld: toNumberOrNull(item.pctHeld),
      percentChange: toNumberOrNull(item.pctChange),
      reportDate: yahooDateToIso(item.reportDate),
      source: "Yahoo Finance"
    }))
    .filter((item) => item.institution)
    .slice(0, 10);

  const insiderTransactions = (summary.insiderTransactions?.transactions || [])
    .map((item) => ({
      filerName: firstText(item.filerName),
      relation: firstText(item.filerRelation),
      transaction: firstText(item.transactionText),
      shares: toNumberOrNull(item.shares),
      value: toNumberOrNull(item.value),
      moneyText: firstText(item.moneyText),
      ownership: firstText(item.ownership),
      date: yahooDateToIso(item.startDate),
      source: "Yahoo Finance"
    }))
    .filter((item) => item.filerName || item.transaction)
    .slice(0, 12);

  const holders = summary.majorHoldersBreakdown || {};

  return {
    analystUpdates,
    institutionalHolders,
    insiderTransactions,
    holderSummary: {
      insidersPercentHeld: toNumberOrNull(holders.insidersPercentHeld),
      institutionsPercentHeld: toNumberOrNull(holders.institutionsPercentHeld),
      institutionsFloatPercentHeld: toNumberOrNull(holders.institutionsFloatPercentHeld),
      institutionsCount: toNumberOrNull(holders.institutionsCount)
    },
    analystTargets: {
      mean: firstYahooNumber(financialData.targetMeanPrice),
      median: firstYahooNumber(financialData.targetMedianPrice),
      high: firstYahooNumber(financialData.targetHighPrice),
      low: firstYahooNumber(financialData.targetLowPrice),
      recommendationMean: firstYahooNumber(financialData.recommendationMean),
      recommendationKey: firstText(financialData.recommendationKey)
    }
  };
};

async function fetchFinnhubAnalystUpdates(ticker) {
  if (!process.env.FINNHUB_API_KEY) return [];

  try {
    const rows = await getFinnhub(
      `https://finnhub.io/api/v1/stock/upgrade-downgrade?symbol=${encodeURIComponent(ticker)}`
    );

    return (Array.isArray(rows) ? rows : [])
      .map((item) => ({
        firm: firstText(item.company),
        latestRating: firstText(item.toGrade),
        previousRating: firstText(item.fromGrade),
        action: firstText(item.action),
        priceTarget: toNumberOrNull(item.priceTarget),
        date: yahooDateToIso(item.gradeTime),
        source: "Finnhub"
      }))
      .filter((item) => item.firm || item.latestRating)
      .slice(0, 12);
  } catch (err) {
    console.log("Finnhub analyst updates skipped:", ticker, err.response?.status || err.message);
    return [];
  }
}

async function fetchFinnhubEpsSurprises(ticker) {
  const symbol = String(ticker || "").trim().toUpperCase();
  if (!symbol || !process.env.FINNHUB_API_KEY) return [];

  const cached = readCachedMarketActivity(epsSurpriseCache, symbol);
  if (cached) return cached;

  try {
    const rows = await getFinnhub(
      `https://finnhub.io/api/v1/stock/earnings?symbol=${encodeURIComponent(symbol)}`
    );
    const result = (Array.isArray(rows) ? rows : [])
      .map((item) => {
        const estimate = toNumberOrNull(item.estimate);
        const actual = toNumberOrNull(item.actual);
        const surprise = toNumberOrNull(item.surprise) ?? (
          actual !== null && estimate !== null ? actual - estimate : null
        );
        return {
          period: yahooDateToIso(item.period),
          fiscalYear: toNumberOrNull(item.year),
          fiscalQuarter: toNumberOrNull(item.quarter),
          estimate,
          actual,
          surprise,
          surprisePercent: toNumberOrNull(item.surprisePercent),
          source: "Finnhub"
        };
      })
      .filter((item) => item.period && (item.estimate !== null || item.actual !== null))
      .sort((a, b) => String(a.period).localeCompare(String(b.period)))
      .slice(-5);

    return writeCachedMarketActivity(
      epsSurpriseCache,
      symbol,
      result,
      result.length ? 6 * 60 * 60 * 1000 : 20 * 60 * 1000
    );
  } catch (err) {
    console.log("Finnhub EPS surprises skipped:", symbol, err.response?.status || err.message);
    return writeCachedMarketActivity(epsSurpriseCache, symbol, [], 15 * 60 * 1000);
  }
}

async function fetchFmpEpsSurprises(ticker) {
  const symbol = String(ticker || "").trim().toUpperCase();
  if (!symbol) return [];
  if (!process.env.FMP_API_KEY || !canUseFmp()) {
    return fetchFinnhubEpsSurprises(symbol);
  }

  const cached = readCachedMarketActivity(epsSurpriseCache, `fmp:${symbol}`);
  if (cached) return cached;

  try {
    const rows = await resolveWithin(
      getFmpData(symbol, "earnings history", [
        `/stable/earnings?symbol={ticker}&limit=8`
      ]),
      2200,
      []
    );
    let data = mergeEpsBeatMissRows(
      (Array.isArray(rows) ? rows : rows ? [rows] : [])
        .filter((item) => String(item.symbol || "").trim().toUpperCase() === symbol)
        .map((item) => {
          const estimate = toNumberOrNull(item.epsEstimated ?? item.epsEstimate);
          const actual = toNumberOrNull(item.epsActual);
          const surprise = actual !== null && estimate !== null ? actual - estimate : null;
          return {
            period: yahooDateToIso(item.date),
            estimate,
            actual,
            surprise,
            surprisePercent: surprise !== null && estimate
              ? (surprise / Math.abs(estimate)) * 100
              : null,
            source: "FMP earnings history"
          };
        })
        .filter((item) => item.period && (item.estimate !== null || item.actual !== null))
    )
      .sort((a, b) => String(a.period).localeCompare(String(b.period)))
      .slice(-5);
    if (data.length < 4) {
      data = mergeEpsBeatMissRows(data, await resolveWithin(fetchFinnhubEpsSurprises(symbol), 1800, []))
        .sort((a, b) => String(a.period).localeCompare(String(b.period)))
        .slice(-5);
    }
    return writeCachedMarketActivity(
      epsSurpriseCache,
      `fmp:${symbol}`,
      data,
      data.length ? 6 * 60 * 60 * 1000 : 20 * 60 * 1000
    );
  } catch (err) {
    setFmpCooldown(err, "EPS surprises", symbol);
    console.log("FMP EPS surprises skipped:", symbol, err.response?.status || err.message);
    const fallback = await resolveWithin(fetchFinnhubEpsSurprises(symbol), 1800, []);
    return writeCachedMarketActivity(epsSurpriseCache, `fmp:${symbol}`, fallback, fallback.length ? 6 * 60 * 60 * 1000 : 15 * 60 * 1000);
  }
}

const parseEpsBeatMissFiscalLabel = (value) => {
  const text = String(value || "").trim();
  if (!text) return {};
  const match = text.match(/\bQ\s*([1-4])\b(?:\s*(?:FY)?)?\s*'?(\d{2,4})/i);
  if (!match) return {};
  const quarter = Number(match[1]);
  const rawYear = Number(match[2]);
  const year = rawYear < 100 ? 2000 + rawYear : rawYear;
  return Number.isFinite(quarter) && Number.isFinite(year)
    ? { fiscalQuarter: quarter, fiscalYear: year }
    : {};
};

const epsBeatMissKey = (row = {}) => {
  const fiscalYear = toNumberOrNull(row.fiscalYear);
  const fiscalQuarter = toNumberOrNull(row.fiscalQuarter);
  if (fiscalYear !== null && fiscalQuarter !== null) {
    return `fq:${fiscalYear}:q${fiscalQuarter}`;
  }
  const labelFiscal = parseEpsBeatMissFiscalLabel(row.label);
  if (labelFiscal.fiscalYear && labelFiscal.fiscalQuarter) {
    return `fq:${labelFiscal.fiscalYear}:q${labelFiscal.fiscalQuarter}`;
  }
  return row.period ? `date:${row.period}` : null;
};

const isReportedEpsRow = (row = {}) =>
  toNumberOrNull(row.actual) !== null || toNumberOrNull(row.gaapActual) !== null;

const chooseEpsBeatMissPeriod = (existing = {}, row = {}) => {
  if (!existing.period) return row.period;
  if (!row.period) return existing.period;
  if (isReportedEpsRow(row) && !isReportedEpsRow(existing)) return row.period;
  if (isReportedEpsRow(existing) && !isReportedEpsRow(row)) return existing.period;
  return row.period > existing.period ? row.period : existing.period;
};

const mergeEpsBeatMissRows = (...rowSets) => {
  const byPeriod = new Map();
  rowSets.flat().forEach((row) => {
    if (!row?.period) return;
    const labelFiscal = parseEpsBeatMissFiscalLabel(row.label);
    const hydratedRow = {
      ...row,
      fiscalYear: toNumberOrNull(row.fiscalYear) ?? labelFiscal.fiscalYear ?? row.fiscalYear,
      fiscalQuarter: toNumberOrNull(row.fiscalQuarter) ?? labelFiscal.fiscalQuarter ?? row.fiscalQuarter
    };
    const key = epsBeatMissKey(hydratedRow);
    if (!key) return;
    const existing = byPeriod.get(key) || {};
    byPeriod.set(key, {
      ...existing,
      ...Object.fromEntries(
        Object.entries(hydratedRow).filter(([, value]) => value !== null && value !== undefined && value !== "")
      ),
      period: chooseEpsBeatMissPeriod(existing, hydratedRow),
      estimate: toNumberOrNull(hydratedRow.estimate) ?? toNumberOrNull(existing.estimate),
      actual: toNumberOrNull(hydratedRow.actual) ?? toNumberOrNull(existing.actual),
      gaapActual: toNumberOrNull(hydratedRow.gaapActual) ?? toNumberOrNull(existing.gaapActual),
      surprise: toNumberOrNull(hydratedRow.surprise) ?? toNumberOrNull(existing.surprise),
      gaapSurprise: toNumberOrNull(hydratedRow.gaapSurprise) ?? toNumberOrNull(existing.gaapSurprise),
      surprisePercent: toNumberOrNull(hydratedRow.surprisePercent) ?? toNumberOrNull(existing.surprisePercent)
    });
  });

  return [...byPeriod.values()].sort((a, b) => String(a.period).localeCompare(String(b.period)));
};

const buildEpsBeatMissSeries = (reportedRows = [], nextQuarterEstimate = {}) => {
  const rows = mergeEpsBeatMissRows(reportedRows || []);
  const nextEstimate = toNumberOrNull(nextQuarterEstimate?.eps);
  const nextDate = yahooDateToIso(nextQuarterEstimate?.date);
  const nextLabel = firstText(nextQuarterEstimate?.fiscalQuarter, "Next Quarter");
  const nextFiscal = parseEpsBeatMissFiscalLabel(nextLabel);
  const nextKey = epsBeatMissKey({
    period: nextDate,
    label: nextLabel,
    fiscalYear: nextFiscal.fiscalYear,
    fiscalQuarter: nextFiscal.fiscalQuarter
  });
  if (
    nextEstimate !== null &&
    nextDate &&
    !rows.some((row) =>
      (nextKey && epsBeatMissKey(row) === nextKey) ||
      row.period === nextDate
    )
  ) {
    rows.push({
      period: nextDate,
      fiscalYear: nextFiscal.fiscalYear || null,
      fiscalQuarter: nextFiscal.fiscalQuarter || null,
      label: nextLabel,
      estimate: nextEstimate,
      actual: null,
      surprise: null,
      surprisePercent: null,
      source: "FMP earnings calendar"
    });
  }

  return rows
    .filter((row) => row.estimate !== null || row.actual !== null)
    .slice(-5);
};

const readCachedMarketActivity = (cache, key) => {
  const cached = cache.get(key);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    cache.delete(key);
    return null;
  }
  return cached.data;
};

const writeCachedMarketActivity = (cache, key, data, ttlMs) => {
  cache.set(key, {
    data,
    expiresAt: Date.now() + ttlMs
  });
  return data;
};

const normalizeFmpMarketActivityRows = (data) => {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return [];
  for (const key of ["data", "results", "items", "ownership", "transactions", "history"]) {
    if (Array.isArray(data[key])) return data[key];
  }
  return [data];
};

async function fetchFmpMarketActivity(ticker) {
  const symbol = String(ticker || "").trim().toUpperCase();
  if (!symbol || !process.env.FMP_API_KEY) {
    return { analystUpdates: [], institutionalHolders: [], insiderTransactions: [] };
  }

  const cached = readCachedMarketActivity(fmpMarketActivityCache, symbol);
  if (cached) return cached;

  const emptyResult = { analystUpdates: [], institutionalHolders: [], insiderTransactions: [] };
  const [priceTargetNewsData, gradesData, holdersData, insiderData] = await Promise.all([
    resolveWithin(getFmpData(symbol, "analyst price target news", [
      "/stable/price-target-news?symbol={ticker}"
    ]), STOCK_PROVIDER_TIMEOUT_MS, null),
    resolveWithin(getFmpData(symbol, "analyst actions", [
      "/stable/grades?symbol={ticker}"
    ]), STOCK_PROVIDER_TIMEOUT_MS, null),
    resolveWithin(fetchMarketBeatInstitutionalHolders(symbol), STOCK_PROVIDER_TIMEOUT_MS, []),
    resolveWithin(getFmpData(symbol, "insider trading", [
      "/stable/insider-trading/search?symbol={ticker}"
    ]), STOCK_PROVIDER_TIMEOUT_MS, null)
  ]);

  const gradeUpdates = normalizeFmpMarketActivityRows(gradesData)
    .map((item) => ({
      firm: firstText(item.gradingCompany, item.company, item.firm, item.analyst, item.institution),
      latestRating: firstText(item.newGrade, item.toGrade, item.rating, item.grade, item.newRating),
      previousRating: firstText(item.previousGrade, item.fromGrade, item.oldGrade, item.previousRating),
      action: firstText(item.action, item.newsTitle, item.type),
      priceTarget: toNumberOrNull(item.priceTarget ?? item.targetPrice ?? item.priceTargetNew ?? item.newPriceTarget),
      date: yahooDateToIso(item.date || item.publishedDate || item.gradeTime || item.updatedAt),
      source: "FMP"
    }))
    .filter((item) => item.firm || item.latestRating)
  const priceTargetUpdates = normalizeFmpMarketActivityRows(priceTargetNewsData)
    .map((item) => ({
      firm: firstText(item.analystCompany, item.gradingCompany, item.company, item.firm),
      analyst: firstText(item.analystName),
      latestRating: firstText(item.newGrade, item.rating),
      previousRating: firstText(item.previousGrade),
      action: firstText(item.newsTitle, item.action, "price target"),
      priceTarget: toNumberOrNull(item.priceTarget ?? item.adjPriceTarget ?? item.targetPrice),
      date: yahooDateToIso(item.publishedDate || item.date),
      source: "FMP"
    }))
    .filter((item) => item.firm || item.priceTarget !== null || item.action);
  const firmKey = (value) => String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ");
  const latestRatingByFirm = new Map();
  gradeUpdates.forEach((row) => {
    const key = firmKey(row.firm);
    if (key && row.latestRating && !latestRatingByFirm.has(key)) latestRatingByFirm.set(key, row);
  });
  const latestTargetByFirm = new Map();
  priceTargetUpdates.forEach((row) => {
    const key = firmKey(row.firm);
    if (key && row.priceTarget !== null && !latestTargetByFirm.has(key)) latestTargetByFirm.set(key, row);
  });
  const analystUpdates = [
    ...priceTargetUpdates.map((row) => {
      const ratingRow = latestRatingByFirm.get(firmKey(row.firm));
      return {
        ...row,
        latestRating: row.latestRating || ratingRow?.latestRating || "Price target update",
        previousRating: row.previousRating || ratingRow?.previousRating || null
      };
    }),
    ...gradeUpdates.map((row) => {
      const targetRow = latestTargetByFirm.get(firmKey(row.firm));
      return {
        ...row,
        priceTarget: row.priceTarget ?? targetRow?.priceTarget ?? null
      };
    })
  ]
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
    .filter((row, index, rows) => {
      const key = `${firmKey(row.firm)}:${row.date || ""}:${row.latestRating || ""}:${row.priceTarget ?? ""}`;
      return rows.findIndex((candidate) =>
        `${firmKey(candidate.firm)}:${candidate.date || ""}:${candidate.latestRating || ""}:${candidate.priceTarget ?? ""}` === key
      ) === index;
    })
    .slice(0, 12);

  const institutionalHolders = (Array.isArray(holdersData) ? holdersData : [])
    .filter((item) => item.institution)
    .slice(0, 10);

  const insiderTransactions = normalizeFmpMarketActivityRows(insiderData)
    .filter((item) => String(item.symbol || "").trim().toUpperCase() === symbol)
    .map((item) => ({
      filerName: firstText(item.reportingName, item.ownerName, item.name),
      relation: firstText(item.typeOfOwner, item.relationship, item.title, item.reportingCik),
      transaction: firstText(
        item.transactionType,
        item.acquisitionOrDisposition === "A" ? "Acquisition" : null,
        item.acquisitionOrDisposition === "D" ? "Disposition" : null,
        item.transactionCode,
        "Reported transaction"
      ),
      owner: firstText(item.reportingName, item.ownerName, item.name),
      transactionType: firstText(
        item.transactionType,
        item.acquisitionOrDisposition === "A" ? "Acquisition" : null,
        item.acquisitionOrDisposition === "D" ? "Disposition" : null,
        item.transactionCode,
        "Reported transaction"
      ),
      shares: toNumberOrNull(item.securitiesTransacted ?? item.shares),
      value: toNumberOrNull(item.price) !== null && toNumberOrNull(item.securitiesTransacted) !== null
        ? toNumberOrNull(item.price) * toNumberOrNull(item.securitiesTransacted)
        : null,
      price: toNumberOrNull(item.price),
      sharesOwned: toNumberOrNull(item.securitiesOwned),
      date: yahooDateToIso(item.transactionDate || item.filingDate),
      source: "FMP"
    }))
    .filter((item) => item.owner || item.transactionType)
    .slice(0, 12);

  const result = { analystUpdates, institutionalHolders, insiderTransactions };
  const hasData = analystUpdates.length || institutionalHolders.length || insiderTransactions.length;
  return writeCachedMarketActivity(
    fmpMarketActivityCache,
    symbol,
    hasData ? result : emptyResult,
    hasData ? 6 * 60 * 60 * 1000 : 45 * 1000
  );
}

const cleanMarketBeatCellText = (value) =>
  String(value || "")
    .replace(/Subscribe to MarketBeat All Access.*?rating/gi, "")
    .replace(/\d+\s+of\s+5\s+stars/gi, "")
    .replace(/\s+/g, " ")
    .trim();

const marketBeatDateToIso = (value) => {
  const match = String(value || "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return yahooDateToIso(value);
  const [, month, day, year] = match;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

const parseMarketBeatPriceTarget = (value) => {
  const matches = [...String(value || "").matchAll(/\$?(-?\d+(?:,\d{3})*(?:\.\d+)?)/g)];
  if (!matches.length) return null;
  return toNumberOrNull(matches.at(-1)?.[1]?.replace(/,/g, ""));
};

const parseMarketBeatCompactNumber = (value) => {
  const text = String(value || "").trim().replace(/,/g, "");
  if (!text || /^N\/A$/i.test(text)) return null;
  const match = text.match(/(-?\$?\d+(?:\.\d+)?)([KMBT])?/i);
  if (!match) return null;
  const number = toNumberOrNull(match[1].replace("$", ""));
  if (number === null) return null;
  const suffix = String(match[2] || "").toUpperCase();
  const multiplier = suffix === "T"
    ? 1000000000000
    : suffix === "B"
      ? 1000000000
      : suffix === "M"
        ? 1000000
        : suffix === "K"
          ? 1000
          : 1;
  return number * multiplier;
};

const parseMarketBeatPercent = (value) => {
  const text = String(value || "").replace(/,/g, "").trim();
  if (!text || /^N\/A$/i.test(text)) return null;
  const match = text.match(/(-?\+?\d+(?:\.\d+)?)%/);
  return match ? toNumberOrNull(match[1]) : null;
};

const parseMarketBeatMoneyNumber = (value) => {
  const text = String(value || "").replace(/,/g, "").trim();
  if (!text || /^-+$/.test(text) || /^N\/A$/i.test(text)) return null;
  const normalized = text
    .replace(/[−–—]/g, "-")
    .replace(/\$/g, "")
    .replace(/\s+/g, "");
  const match = normalized.match(/([+-]?\d+(?:\.\d+)?)/);
  return match ? toNumberOrNull(match[1]) : null;
};

const MARKETBEAT_EXCHANGES = ["NASDAQ", "NYSE", "AMEX"];
const MARKETBEAT_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
};

async function fetchMarketBeatRows(symbol, page, tableMatcher, rowMapper) {
  const pathSymbols = [...new Set([
    symbol,
    symbol.replace(/-/g, "."),
    symbol.replace(/-/g, "")
  ])].filter(Boolean);
  const attempts = MARKETBEAT_EXCHANGES.flatMap((exchange) => pathSymbols.map(async (pathSymbolRaw) => {
    const pathSymbol = encodeURIComponent(pathSymbolRaw);
    const url = `https://www.marketbeat.com/stocks/${exchange}/${pathSymbol}/${page}/`;
    try {
      const response = await axios.get(url, {
        headers: MARKETBEAT_HEADERS,
        timeout: 8000
      });
      const $ = cheerio.load(response.data || "");
      const targetTable = $("table").filter((_, table) => {
        const headerText = $(table).find("th").text().replace(/\s+/g, " ").trim();
        return tableMatcher(headerText);
      }).first();

      if (!targetTable.length) throw new Error("MarketBeat table missing");

      const rows = [];
      targetTable.find("tbody tr").each((_, row) => {
        const cells = $(row).find("td").map((__, cell) =>
          cleanMarketBeatCellText($(cell).text())
        ).get();
        const mapped = rowMapper(cells);
        if (mapped) rows.push(mapped);
      });

      if (!rows.length) throw new Error("MarketBeat rows missing");
      return rows;
    } catch (err) {
      if (err.response?.status !== 404) {
        console.log("MarketBeat page skipped:", symbol, page, exchange, err.response?.status || err.message);
      }
      throw err;
    }
  }));

  try {
    return await Promise.any(attempts);
  } catch {
    return [];
  }
}

async function fetchMarketBeatInstitutionalHolders(ticker) {
  const symbol = String(ticker || "").trim().toUpperCase();
  if (!symbol) return [];

  const cacheKey = `${symbol}:holders`;
  const cached = readCachedMarketActivity(marketBeatAnalystCache, cacheKey);
  if (cached) return cached;

  const rows = await fetchMarketBeatRows(
    symbol,
    "institutional-ownership",
    (headerText) => /Major Shareholder|Institution|Holder/i.test(headerText) && /Shares Held/i.test(headerText),
    (cells) => {
        const institution = cells[1];
        if (!institution) return null;
        return {
          institution,
          shares: parseMarketBeatCompactNumber(cells[2]),
          value: parseMarketBeatCompactNumber(cells[3]),
          percentHeld: parseMarketBeatPercent(cells[6]),
          percentChange: parseMarketBeatPercent(cells[5]),
          reportDate: marketBeatDateToIso(cells[0]),
          source: "MarketBeat"
        };
    }
  );

  const result = rows
    .filter((item) => item.institution)
    .sort((a, b) => (toNumberOrNull(b.value) || 0) - (toNumberOrNull(a.value) || 0))
    .slice(0, 10);
  return writeCachedMarketActivity(
    marketBeatAnalystCache,
    cacheKey,
    result,
    result.length ? 6 * 60 * 60 * 1000 : 20 * 60 * 1000
  );
}

async function fetchMarketBeatAnalystUpdates(ticker) {
  const symbol = String(ticker || "").trim().toUpperCase();
  if (!symbol) return [];

  const cached = readCachedMarketActivity(marketBeatAnalystCache, symbol);
  if (cached) return cached;

  const rows = await fetchMarketBeatRows(
    symbol,
    "forecast",
    (headerText) => /Date/i.test(headerText) && /Brokerage/i.test(headerText) && /Price Target/i.test(headerText),
    (cells) => {
        const firm = cells[1];
        const action = cells[3];
        const latestRating = cells[4];
        const priceTarget = parseMarketBeatPriceTarget(cells[5]);
        const date = marketBeatDateToIso(cells[0]);
        if (!firm || (!latestRating && priceTarget === null && !action)) return null;
        return {
          firm,
          latestRating,
          previousRating: null,
          action,
          priceTarget,
          date,
          source: "MarketBeat"
        };
    }
  );

  const result = rows.slice(0, 12);
  return writeCachedMarketActivity(
    marketBeatAnalystCache,
    symbol,
    result,
    result.length ? 6 * 60 * 60 * 1000 : 20 * 60 * 1000
  );
}

async function fetchMarketBeatEpsSurprises(ticker) {
  const symbol = String(ticker || "").trim().toUpperCase();
  if (!symbol) return [];

  const cacheKey = `${symbol}:eps`;
  const cached = readCachedMarketActivity(epsSurpriseCache, cacheKey);
  if (cached) return cached;

  const rows = await fetchMarketBeatRows(
    symbol,
    "earnings",
    (headerText) =>
      /Consensus Estimate/i.test(headerText) &&
      /Reported EPS/i.test(headerText) &&
      /GAAP EPS/i.test(headerText),
    (cells) => {
      const date = marketBeatDateToIso(cells[0]);
      const isUpcoming = /\(Estimated\)|\(Confirmed\)/i.test(`${cells[0]} ${cells[1]}`);
      const estimate = parseMarketBeatMoneyNumber(cells[2]);
      const actual = parseMarketBeatMoneyNumber(cells[3]);
      const surprise = parseMarketBeatMoneyNumber(cells[4]) ?? (
        actual !== null && estimate !== null ? actual - estimate : null
      );
      const gaapActual = parseMarketBeatMoneyNumber(cells[5]);
      if (!date || (estimate === null && actual === null && gaapActual === null)) return null;

      return {
        period: date,
        fiscalYear: null,
        fiscalQuarter: null,
        label: isUpcoming ? "Next Quarter" : firstText(cells[1], null),
        estimate,
        actual,
        gaapActual,
        surprise,
        gaapSurprise: gaapActual !== null && estimate !== null ? gaapActual - estimate : null,
        surprisePercent: null,
        source: "MarketBeat"
      };
    }
  );

  const result = rows
    .filter((row) => row.period && (row.estimate !== null || row.actual !== null || row.gaapActual !== null))
    .sort((a, b) => String(a.period).localeCompare(String(b.period)))
    .slice(-8);

  return writeCachedMarketActivity(
    epsSurpriseCache,
    cacheKey,
    result,
    result.length ? 6 * 60 * 60 * 1000 : 20 * 60 * 1000
  );
}

const SEC_TRANSACTION_LABELS = {
  P: "Buy",
  S: "Sell",
  A: "Award",
  G: "Gift",
  M: "Option exercise",
  F: "Tax withholding",
  D: "Disposition",
  C: "Conversion",
  J: "Other"
};

const secBoolean = ($, root, selector) => {
  const text = $(root).find(selector).first().text().trim();
  return text === "1" || /^true$/i.test(text);
};

async function fetchSecInsiderTransactions(ticker) {
  const symbol = String(ticker || "").trim().toUpperCase();
  if (!symbol) return [];

  const cached = readCachedMarketActivity(secInsiderTransactionCache, symbol);
  if (cached) return cached;

  try {
    const tickerMap = await getSecTickerMap();
    const cik = tickerMap.get(symbol);
    if (!cik) return [];

    const submissionsResponse = await axios.get(`https://data.sec.gov/submissions/CIK${cik}.json`, {
      headers: { "User-Agent": "InvestmentTerminal/1.0 contact@investmentterminal.app" },
      timeout: 10000
    });

    const filings = normalizeSecRecentFilings(submissionsResponse.data?.filings?.recent || {})
      .filter((filing) => /^4(?:\/A)?$/i.test(filing.form) && filing.primaryDocument)
      .slice(0, 12);

    const batches = await Promise.all(filings.map(async (filing) => {
      const rawPrimaryDocument = String(filing.primaryDocument || "").split("/").pop();
      const url = secArchivesDocumentUrl(cik, filing.accessionNumber, rawPrimaryDocument);
      if (!url) return [];

      try {
        const response = await axios.get(url, {
          headers: {
            "User-Agent": "InvestmentTerminal/1.0 contact@investmentterminal.app",
            Accept: "application/xml,text/xml,text/html,*/*"
          },
          timeout: 8000,
          responseType: "text",
          transformResponse: [(data) => data]
        });
        const $ = cheerio.load(response.data || "", { xmlMode: true });
        const owner = $("reportingOwner").first();
        const filerName = owner.find("reportingOwnerId rptOwnerName").first().text().trim();
        const relationParts = [];
        const relationship = owner.find("reportingOwnerRelationship").first();
        if (secBoolean($, relationship, "isDirector")) relationParts.push("Director");
        if (secBoolean($, relationship, "isOfficer")) relationParts.push("Officer");
        if (secBoolean($, relationship, "isTenPercentOwner")) relationParts.push("10% owner");
        const officerTitle = relationship.find("officerTitle").first().text().trim();
        if (officerTitle) relationParts.push(officerTitle);
        const relation = [...new Set(relationParts)].join(", ");

        const rows = [];
        $("nonDerivativeTransaction").each((_, element) => {
          const code = $(element).find("transactionCoding transactionCode").first().text().trim().toUpperCase();
          const shares = toNumberOrNull($(element).find("transactionAmounts transactionShares value").first().text());
          const price = toNumberOrNull($(element).find("transactionAmounts transactionPricePerShare value").first().text());
          const date = $(element).find("transactionDate value").first().text().trim() || filing.reportDate || filing.filingDate;
          const ownership = $(element).find("ownershipNature directOrIndirectOwnership value").first().text().trim();
          const acquiredDisposed = $(element).find("transactionAmounts transactionAcquiredDisposedCode value").first().text().trim();
          if (!shares && !code) return;
          const value = shares !== null && price !== null ? shares * price : null;
          const transaction = SEC_TRANSACTION_LABELS[code] || code || firstText(acquiredDisposed === "A" ? "Acquired" : null, acquiredDisposed === "D" ? "Disposed" : null, "Transaction");
          rows.push({
            filerName,
            relation,
            transaction,
            shares,
            value,
            moneyText: price !== null ? `$${price.toFixed(2)}/share` : null,
            ownership,
            date: yahooDateToIso(date),
            source: "SEC Form 4"
          });
        });
        return rows;
      } catch (err) {
        console.log("SEC insider filing skipped:", symbol, filing.accessionNumber, err.response?.status || err.message);
        return [];
      }
    }));

    const transactions = batches
      .flat()
      .filter((item) => item.filerName || item.transaction)
      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
      .slice(0, 12);

    return writeCachedMarketActivity(
      secInsiderTransactionCache,
      symbol,
      transactions,
      transactions.length ? 6 * 60 * 60 * 1000 : 30 * 60 * 1000
    );
  } catch (err) {
    console.log("SEC insider transactions skipped:", symbol, err.response?.status || err.message);
    return writeCachedMarketActivity(secInsiderTransactionCache, symbol, [], 15 * 60 * 1000);
  }
}

const parseYahooAnalysisNumber = (value, { money = false } = {}) => {
  const text = String(value || "").trim().replace(/,/g, "");
  if (!text || text === "--" || /^N\/A$/i.test(text)) return null;
  const negative = /^\(.+\)$/.test(text) || text.startsWith("-");
  const normalized = text.replace(/[$%()]/g, "").replace(/^-/, "");
  const suffix = normalized.match(/[KMBT]$/i)?.[0]?.toUpperCase();
  const number = Number(normalized.replace(/[KMBT]$/i, ""));
  if (!Number.isFinite(number)) return null;
  const multiplier = money
    ? suffix === "T"
      ? 1000000000000
      : suffix === "B"
        ? 1000000000
        : suffix === "M"
          ? 1000000
          : suffix === "K"
            ? 1000
            : 1
    : 1;
  return (negative ? -1 : 1) * number * multiplier;
};

const extractYahooAnalysisAverageRow = ($, sectionTestId, { money = false } = {}) => {
  const section = $(`section[data-testid="${sectionTestId}"]`);
  if (!section.length) return null;

  const row = section.find('tr[data-testid="data-table-v2-row"]').filter((_, element) => {
    const label = $(element).find('td[data-testid-cell="label"]').text().trim();
    return /^Avg\. Estimate$/i.test(label);
  }).first();

  if (!row.length) return null;

  return {
    currentYear: parseYahooAnalysisNumber(row.find('td[data-testid-cell="0y"]').text(), { money }),
    nextYear: parseYahooAnalysisNumber(row.find('td[data-testid-cell="+1y"]').text(), { money })
  };
};

const fetchYahooAnalysisPageHtml = (ticker) =>
  new Promise((resolve, reject) => {
    const url = new URL(`https://finance.yahoo.com/quote/${encodeURIComponent(ticker)}/analysis/`);
    url.searchParams.set("guccounter", "1");

    const req = https.get(url, {
      maxHeaderSize: 512 * 1024,
      timeout: 9000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1"
      }
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const body = Buffer.concat(chunks);
        const finish = (err, output) => {
          if (err) return reject(err);
          if (res.statusCode < 200 || res.statusCode >= 300) {
            const error = new Error(`Yahoo analysis page HTTP ${res.statusCode}`);
            error.response = { status: res.statusCode, data: output.toString("utf8").slice(0, 500) };
            return reject(error);
          }
          resolve(output.toString("utf8"));
        };

        const encoding = String(res.headers["content-encoding"] || "").toLowerCase();
        if (encoding.includes("br")) return zlib.brotliDecompress(body, finish);
        if (encoding.includes("gzip")) return zlib.gunzip(body, finish);
        if (encoding.includes("deflate")) return zlib.inflate(body, finish);
        return finish(null, body);
      });
    });

    req.on("timeout", () => {
      req.destroy(new Error("Yahoo analysis page timeout"));
    });
    req.on("error", reject);
  });

async function fetchYahooAnalysisPageEstimates(ticker) {
  if (!canUseYahooAnalysisPage()) return null;

  try {
    const html = await fetchYahooAnalysisPageHtml(ticker);
    const $ = cheerio.load(html);
    const revenue = extractYahooAnalysisAverageRow($, "revenueEstimate", { money: true });
    const eps = extractYahooAnalysisAverageRow($, "earningsEstimate");
    if (!revenue && !eps) return null;

    return {
      currentYear: {
        revenue: revenue?.currentYear ?? null,
        earnings: null,
        eps: eps?.currentYear ?? null
      },
      nextYear: {
        revenue: revenue?.nextYear ?? null,
        earnings: null,
        eps: eps?.nextYear ?? null
      }
    };
  } catch (err) {
    setYahooAnalysisPageCooldown(err, "analysis page", ticker);
    console.log("Yahoo analysis page skipped:", ticker, err.response?.status || err.message);
    return null;
  }
}

async function fetchYahooEarningsTrendEstimates(ticker) {
  if (!canUseYahooEarningsTrend()) return null;

  try {
    const summary = await yahooFinance.quoteSummary(ticker, {
      modules: ["earningsTrend"]
    });
    const trends = summary?.earningsTrend?.trend || [];
    const { currentYear, nextYear } = selectYahooAnnualEstimateTrends(trends);

    return {
      currentYear: estimateFromYahooTrend(currentYear),
      nextYear: estimateFromYahooTrend(nextYear)
    };
  } catch (err) {
    setYahooEarningsTrendCooldown(err, "earnings trend", ticker);
    console.log("Yahoo earnings trend skipped:", ticker, err.message);
    return null;
  }
}

async function fetchYahooSupplementalData(ticker) {
  try {
    const [analysisPageEstimates, earningsTrendEstimates, summary, quoteData, chartData] = await Promise.all([
      fetchYahooAnalysisPageEstimates(ticker),
      fetchYahooEarningsTrendEstimates(ticker),
      canUseYahooQuoteSummary()
        ? yahooFinance
            .quoteSummary(ticker, {
              modules: [
                "financialData",
                "defaultKeyStatistics",
                "summaryDetail",
                "recommendationTrend",
                "upgradeDowngradeHistory",
                "institutionOwnership",
                "insiderTransactions",
                "majorHoldersBreakdown"
              ]
            })
            .catch((err) => {
              setYahooQuoteSummaryCooldown(err, "quote summary", ticker);
              console.log("Yahoo quote summary skipped:", ticker, err.message);
              return {};
            })
        : Promise.resolve({}),
      canUseYahoo()
        ? yahooFinance.quote(ticker).catch((err) => {
            setYahooCooldown(err, "quote", ticker);
            console.log("Yahoo quote skipped:", ticker, err.message);
            return {};
          })
        : Promise.resolve({}),
      canUseYahoo()
        ? yahooFinance.chart(ticker, {
            period1: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
            interval: "1d",
            return: "array"
          }).catch((err) => {
            setYahooCooldown(err, "chart range", ticker);
            console.log("Yahoo chart range skipped:", ticker, err.message);
            return { quotes: [] };
          })
        : Promise.resolve({ quotes: [] })
    ]);

    const financialData = summary?.financialData || {};
    const keyStats = summary?.defaultKeyStatistics || {};
    const detail = summary?.summaryDetail || {};
    const trends = summary?.earningsTrend?.trend || [];
    const recommendationTrend = summary?.recommendationTrend?.trend || [];
    const marketActivity = buildYahooMarketActivity(summary, financialData);
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

    const { currentYear, nextYear } = selectYahooAnnualEstimateTrends(trends);
    const analystEstimates = analysisPageEstimates || earningsTrendEstimates || {
      currentYear: estimateFromYahooTrend(currentYear),
      nextYear: estimateFromYahooTrend(nextYear)
    };

    return {
      name: quoteData.longName || quoteData.shortName || ticker,
      symbol: quoteData.symbol || ticker,
      currency: firstText(quoteData.currency),
      financialCurrency: firstText(quoteData.financialCurrency, quoteData.currency),
      price: firstYahooNumber(quoteData.regularMarketPrice),
      change: firstFiniteNumber(quoteData.regularMarketChange),
      percentChange: firstFiniteNumber(quoteData.regularMarketChangePercent),
      extendedHours: buildYahooExtendedHoursQuote(quoteData),
      previousClose: firstYahooNumber(quoteData.regularMarketPreviousClose),
      high: firstYahooNumber(quoteData.regularMarketDayHigh),
      low: firstYahooNumber(quoteData.regularMarketDayLow),
      open: firstYahooNumber(quoteData.regularMarketOpen),
      marketCap: firstYahooNumber(detail.marketCap, keyStats.marketCap, quoteData.marketCap),
      pe: firstYahooNumber(detail.trailingPE, keyStats.trailingPE, quoteData.trailingPE),
      forwardPE: firstYahooNumber(keyStats.forwardPE, financialData.forwardPE, quoteData.forwardPE),
      pegRatio: firstYahooNumber(keyStats.pegRatio, keyStats.trailingPegRatio, quoteData.pegRatio, quoteData.trailingPegRatio),
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
      analystEstimates,
      analystUpdates: marketActivity.analystUpdates,
      institutionalHolders: marketActivity.institutionalHolders,
      insiderTransactions: marketActivity.insiderTransactions,
      holderSummary: marketActivity.holderSummary,
      analystTargets: marketActivity.analystTargets
    };
  } catch (err) {
    setYahooCooldown(err, "supplemental data", ticker);
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

async function fetchLatestBalanceSheetMetrics(ticker, options = {}) {
  const symbol = String(ticker || "").trim().toUpperCase();
  const fast = Boolean(options.fast);
  const checkedAt = new Date().toISOString();
  if (!symbol) return { balanceSheetCheckedAt: checkedAt };
  const hasBalanceSheetData = (result = {}) =>
    toNumberOrNull(result.totalCash) !== null || toNumberOrNull(result.totalDebt) !== null;

  const withCheckedAt = (result = {}) => ({
    ...result,
    balanceSheetCheckedAt: checkedAt
  });

  try {
    const fmpResult = await fetchFmpStableBalanceSheetMetrics(symbol);
    if (hasBalanceSheetData(fmpResult)) return withCheckedAt(fmpResult);
  } catch (err) {
    console.log("FMP stable balance sheet metrics skipped:", symbol, err.response?.status || err.message);
  }

  return withCheckedAt({});

  try {
    const stockAnalysisResult = await fetchStockAnalysisBalanceSheetMetrics(symbol);
    if (hasBalanceSheetData(stockAnalysisResult)) return withCheckedAt(stockAnalysisResult);
  } catch (err) {
    console.log("StockAnalysis balance sheet metrics skipped:", symbol, err.response?.status || err.message);
  }

  const latestSecInstantFact = (companyFacts, concepts = []) => {
    let latest = null;
    for (const concept of concepts) {
      const entries = Object.values(companyFacts?.facts?.["us-gaap"]?.[concept]?.units || {})
        .flat()
        .filter((entry) =>
          ["10-K", "10-K/A", "10-Q", "10-Q/A"].includes(entry?.form) &&
          entry?.end &&
          toNumberOrNull(entry?.val) !== null &&
          !entry?.start
        );
      for (const entry of entries) {
        const candidate = { ...entry, concept };
        if (
          !latest ||
          String(candidate.end) > String(latest.end) ||
          (String(candidate.end) === String(latest.end) && String(candidate.filed || "") > String(latest.filed || ""))
        ) {
          latest = candidate;
        }
      }
    }
    return latest
      ? {
          value: toNumberOrNull(latest.val),
          asOf: latest.end || null,
          concept: latest.concept || null
        }
      : { value: null, asOf: null, concept: null };
  };

  const latestSecInstantFactByPattern = (companyFacts, includePattern, rejectPattern = null) => {
    let latest = null;
    const facts = companyFacts?.facts?.["us-gaap"] || {};
    for (const [concept, fact] of Object.entries(facts)) {
      if (!includePattern.test(concept) || (rejectPattern && rejectPattern.test(concept))) continue;
      const entries = Object.values(fact?.units || {})
        .flat()
        .filter((entry) =>
          ["10-K", "10-K/A", "10-Q", "10-Q/A", "20-F", "20-F/A", "40-F", "40-F/A"].includes(entry?.form) &&
          entry?.end &&
          toNumberOrNull(entry?.val) !== null &&
          !entry?.start
        );
      for (const entry of entries) {
        const candidate = { ...entry, concept };
        if (
          !latest ||
          String(candidate.end) > String(latest.end) ||
          (String(candidate.end) === String(latest.end) && String(candidate.filed || "") > String(latest.filed || ""))
        ) {
          latest = candidate;
        }
      }
    }
    return latest
      ? {
          value: toNumberOrNull(latest.val),
          asOf: latest.end || null,
          concept: latest.concept || null
        }
      : { value: null, asOf: null, concept: null };
  };

  const hasSecConceptByPattern = (companyFacts, includePattern, rejectPattern = null) =>
    Object.keys(companyFacts?.facts?.["us-gaap"] || {}).some(
      (concept) => includePattern.test(concept) && !(rejectPattern && rejectPattern.test(concept))
    );

  const mostRecentAsOf = (...facts) =>
    facts
      .map((fact) => fact?.asOf)
      .filter(Boolean)
      .sort()
      .at(-1) || null;

  const sourceForSec = (strictSource, ...broadFacts) =>
    broadFacts.some((fact) => fact?.value !== null)
      ? `${strictSource} (broad scan)`
      : strictSource;
  const isFreshBalanceSheetDate = (asOf) => {
    if (!asOf) return false;
    const timestamp = Date.parse(`${asOf}T00:00:00Z`);
    if (!Number.isFinite(timestamp)) return false;
    return Date.now() - timestamp <= 820 * 24 * 60 * 60 * 1000;
  };
  const balanceSheetDebtRejectPattern =
    /Maturit|Repayment|Repayments|Proceeds|Interest|FairValue|Unamortized|Discount|Premium|IssuanceCosts|AvailableForSale|Securities|Unrealized|Hedge|Gain|Loss|Expense|RightOfUseAsset|PaymentsDue|UnusedBorrowingCapacity|LineOfCreditFacilityMaximumBorrowingCapacity|Disclosure|TextBlock/i;
  const balanceSheetCashRejectPattern =
    /PeriodIncreaseDecrease|ProvidedBy|UsedIn|Payments|Proceeds|Dividends|Uninsured|FairValueDisclosure|Flow|TextBlock/i;
  const broadCashPattern =
    /^(CashAndCashEquivalents|CashCashEquivalents|CashAndShortTermInvestments|CashCashEquivalentsAndShortTermInvestments|CashEquivalentsAtCarryingValue)/i;
  const broadDebtPattern =
    /^(Debt|Borrowings|NotesPayable|CommercialPaper|FinanceLeaseLiabilit|CapitalLeaseObligation|LongTermDebt|ShortTermDebt|ShorttermDebt)/i;

  const fromSecCompanyFacts = async () => {
    const tickerMap = await getSecTickerMap();
    const cik = tickerMap.get(symbol);
    if (!cik) return {};
    const { data } = await axios.get(
      `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`,
      {
        headers: { "User-Agent": "InvestmentTerminal/1.0 contact@investmentterminal.app" },
        timeout: fast ? 2500 : 4500
      }
    );
    const cash = latestSecInstantFact(data, [
      "CashAndCashEquivalentsAtCarryingValue",
      "CashAndCashEquivalentsAtCarryingValueIncludingDiscontinuedOperations",
      "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents",
      "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsIncludingDisposalGroupAndDiscontinuedOperations",
      "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsIncludingDiscontinuedOperations",
      "CashCashEquivalentsAndShortTermInvestments"
    ]);
    const broadCash = latestSecInstantFactByPattern(data, broadCashPattern, balanceSheetCashRejectPattern);
    const totalDebt = latestSecInstantFact(data, [
      "Debt",
      "DebtAndFinanceLeaseObligations",
      "DebtAndCapitalLeaseObligations",
      "DebtLongtermAndShorttermCombinedAmount",
      "DebtInstrumentCarryingAmount",
      "LongTermDebt",
      "LongTermDebtAndFinanceLeaseObligations",
      "LongTermDebtAndCapitalLeaseObligations",
      "LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities"
    ]);
    const currentDebt = latestSecInstantFact(data, [
      "DebtCurrent",
      "LongTermDebtCurrent",
      "ShortTermDebt",
      "ShorttermDebt",
      "ShortTermBorrowings",
      "LongTermDebtAndFinanceLeaseObligationsCurrent",
      "LongTermDebtAndCapitalLeaseObligationsCurrent"
    ]);
    const longTermDebt = latestSecInstantFact(data, [
      "LongTermDebt",
      "LongTermDebtNoncurrent",
      "LongTermDebtAndFinanceLeaseObligationsNoncurrent",
      "LongTermDebtAndCapitalLeaseObligations",
      "LongTermDebtAndCapitalLeaseObligationsNoncurrent"
    ]);
    const broadDebt = latestSecInstantFactByPattern(data, broadDebtPattern, balanceSheetDebtRejectPattern);
    const combinedDebt =
      currentDebt.value !== null || longTermDebt.value !== null
        ? (currentDebt.value || 0) + (longTermDebt.value || 0)
        : null;
    const totalCash = firstFiniteNumber(cash.value, broadCash.value);
    const hasAnyDebtConcept = hasSecConceptByPattern(data, broadDebtPattern, balanceSheetDebtRejectPattern);
    const inferredZeroDebt =
      totalCash !== null &&
      totalDebt.value === null &&
      combinedDebt === null &&
      longTermDebt.value === null &&
      broadDebt.value === null &&
      !hasAnyDebtConcept
        ? 0
        : null;
    const resolvedDebt = firstFiniteNumber(totalDebt.value, combinedDebt, broadDebt.value, longTermDebt.value, inferredZeroDebt);
    const balanceSheetAsOf = mostRecentAsOf(totalDebt, currentDebt, longTermDebt, broadDebt, cash, broadCash) || null;
    if ((totalCash !== null || resolvedDebt !== null) && !isFreshBalanceSheetDate(balanceSheetAsOf)) {
      return {};
    }

    return {
      totalCash,
      totalDebt: resolvedDebt,
      balanceSheetAsOf,
      balanceSheetSource: sourceForSec("SEC latest balance sheet", broadCash, broadDebt)
    };
  };

  const fromYahooTimeSeries = async () => {
    if (!canUseYahoo()) return {};
    const typeList = [
      "quarterlyTotalDebt",
      "quarterlyCashAndCashEquivalents",
      "quarterlyCashCashEquivalentsAndShortTermInvestments",
      "quarterlyCashAndShortTermInvestments",
      "quarterlyCashFinancial",
      "quarterlyCashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents",
      "quarterlyLongTermDebt",
      "quarterlyLongTermDebtAndCapitalLeaseObligation",
      "quarterlyLongTermDebtAndFinanceLeaseObligation",
      "quarterlyLongTermDebtNonCurrent",
      "quarterlyCurrentDebt",
      "quarterlyCurrentDebtAndCapitalLeaseObligation",
      "quarterlyShortTermDebt",
      "quarterlyCommercialPaper",
      "annualTotalDebt",
      "annualCashAndCashEquivalents",
      "annualCashCashEquivalentsAndShortTermInvestments",
      "annualCashAndShortTermInvestments",
      "annualCashFinancial",
      "annualCashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents",
      "annualLongTermDebt",
      "annualLongTermDebtAndCapitalLeaseObligation",
      "annualLongTermDebtAndFinanceLeaseObligation",
      "annualLongTermDebtNonCurrent",
      "annualCurrentDebt",
      "annualCurrentDebtAndCapitalLeaseObligation",
      "annualShortTermDebt",
      "annualCommercialPaper"
    ];
    const period1 = Math.floor(Date.UTC(new Date().getUTCFullYear() - 4, 0, 1) / 1000);
    const period2 = Math.floor(Date.now() / 1000);
    const { data } = await axios.get(
      `https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(symbol)}`,
      {
        params: {
          type: typeList.join(","),
          period1,
          period2
        },
        timeout: fast ? 2200 : 3500,
        headers: YAHOO_CHART_HEADERS
      }
    );
    const readLatest = (field) => {
      const row = data?.timeseries?.result?.find((item) => Array.isArray(item?.[field]));
      const latest = row?.[field]
        ?.filter((item) => item?.reportedValue?.raw !== undefined)
        ?.sort((a, b) => String(a.asOfDate).localeCompare(String(b.asOfDate)))
        ?.at(-1);
      return {
        value: latest ? firstYahooRawNumber(latest.reportedValue) : null,
        asOf: latest?.asOfDate || null
      };
    };
    const quarterlyCash = readLatest("quarterlyCashAndCashEquivalents");
    const quarterlyCashAndShortTerm = readLatest("quarterlyCashCashEquivalentsAndShortTermInvestments");
    const quarterlyCashAndShortTermAlt = readLatest("quarterlyCashAndShortTermInvestments");
    const quarterlyCashFinancial = readLatest("quarterlyCashFinancial");
    const quarterlyRestrictedCash = readLatest("quarterlyCashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents");
    const annualCash = readLatest("annualCashAndCashEquivalents");
    const annualCashAndShortTerm = readLatest("annualCashCashEquivalentsAndShortTermInvestments");
    const annualCashAndShortTermAlt = readLatest("annualCashAndShortTermInvestments");
    const annualCashFinancial = readLatest("annualCashFinancial");
    const annualRestrictedCash = readLatest("annualCashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents");
    const quarterlyDebt = readLatest("quarterlyTotalDebt");
    const annualDebt = readLatest("annualTotalDebt");
    const quarterlyLongTermDebt = readLatest("quarterlyLongTermDebt");
    const quarterlyLongTermDebtLease = readLatest("quarterlyLongTermDebtAndCapitalLeaseObligation");
    const quarterlyLongTermDebtFinanceLease = readLatest("quarterlyLongTermDebtAndFinanceLeaseObligation");
    const quarterlyLongTermDebtNonCurrent = readLatest("quarterlyLongTermDebtNonCurrent");
    const annualLongTermDebt = readLatest("annualLongTermDebt");
    const annualLongTermDebtLease = readLatest("annualLongTermDebtAndCapitalLeaseObligation");
    const annualLongTermDebtFinanceLease = readLatest("annualLongTermDebtAndFinanceLeaseObligation");
    const annualLongTermDebtNonCurrent = readLatest("annualLongTermDebtNonCurrent");
    const quarterlyCurrentDebt = readLatest("quarterlyCurrentDebt");
    const quarterlyCurrentDebtLease = readLatest("quarterlyCurrentDebtAndCapitalLeaseObligation");
    const quarterlyShortTermDebt = readLatest("quarterlyShortTermDebt");
    const quarterlyCommercialPaper = readLatest("quarterlyCommercialPaper");
    const annualCurrentDebt = readLatest("annualCurrentDebt");
    const annualCurrentDebtLease = readLatest("annualCurrentDebtAndCapitalLeaseObligation");
    const annualShortTermDebt = readLatest("annualShortTermDebt");
    const annualCommercialPaper = readLatest("annualCommercialPaper");
    const fallbackQuarterlyDebt =
      quarterlyLongTermDebt.value !== null ||
      quarterlyLongTermDebtLease.value !== null ||
      quarterlyLongTermDebtFinanceLease.value !== null ||
      quarterlyLongTermDebtNonCurrent.value !== null ||
      quarterlyCurrentDebt.value !== null ||
      quarterlyCurrentDebtLease.value !== null ||
      quarterlyShortTermDebt.value !== null ||
      quarterlyCommercialPaper.value !== null
        ? (firstFiniteNumber(
            quarterlyLongTermDebt.value,
            quarterlyLongTermDebtLease.value,
            quarterlyLongTermDebtFinanceLease.value,
            quarterlyLongTermDebtNonCurrent.value,
            0
          ) || 0) +
          (firstFiniteNumber(
            quarterlyCurrentDebt.value,
            quarterlyCurrentDebtLease.value,
            quarterlyShortTermDebt.value,
            quarterlyCommercialPaper.value,
            0
          ) || 0)
        : null;
    const fallbackAnnualDebt =
      annualLongTermDebt.value !== null ||
      annualLongTermDebtLease.value !== null ||
      annualLongTermDebtFinanceLease.value !== null ||
      annualLongTermDebtNonCurrent.value !== null ||
      annualCurrentDebt.value !== null ||
      annualCurrentDebtLease.value !== null ||
      annualShortTermDebt.value !== null ||
      annualCommercialPaper.value !== null
        ? (firstFiniteNumber(
            annualLongTermDebt.value,
            annualLongTermDebtLease.value,
            annualLongTermDebtFinanceLease.value,
            annualLongTermDebtNonCurrent.value,
            0
          ) || 0) +
          (firstFiniteNumber(
            annualCurrentDebt.value,
            annualCurrentDebtLease.value,
            annualShortTermDebt.value,
            annualCommercialPaper.value,
            0
          ) || 0)
        : null;

    return {
      totalCash: firstFiniteNumber(
        quarterlyCash.value,
        quarterlyCashAndShortTerm.value,
        quarterlyCashAndShortTermAlt.value,
        quarterlyCashFinancial.value,
        quarterlyRestrictedCash.value,
        annualCash.value,
        annualCashAndShortTerm.value,
        annualCashAndShortTermAlt.value,
        annualCashFinancial.value,
        annualRestrictedCash.value
      ),
      totalDebt: firstFiniteNumber(
        quarterlyDebt.value,
        annualDebt.value,
        fallbackQuarterlyDebt,
        fallbackAnnualDebt,
        quarterlyLongTermDebt.value,
        quarterlyLongTermDebtLease.value,
        quarterlyLongTermDebtFinanceLease.value,
        quarterlyLongTermDebtNonCurrent.value,
        annualLongTermDebt.value,
        annualLongTermDebtLease.value,
        annualLongTermDebtFinanceLease.value,
        annualLongTermDebtNonCurrent.value
      ),
      balanceSheetAsOf:
        quarterlyDebt.asOf ||
        quarterlyCash.asOf ||
        quarterlyCashAndShortTerm.asOf ||
        quarterlyCashAndShortTermAlt.asOf ||
        quarterlyCashFinancial.asOf ||
        quarterlyRestrictedCash.asOf ||
        annualDebt.asOf ||
        annualCash.asOf ||
        annualCashAndShortTerm.asOf ||
        annualCashAndShortTermAlt.asOf ||
        annualCashFinancial.asOf ||
        annualRestrictedCash.asOf ||
        null,
      balanceSheetSource: "Yahoo Finance latest balance sheet"
    };
  };

  const fromYahoo = async () => {
    if (!canUseYahooQuoteSummary()) return {};
    const summary = await yahooFinance.quoteSummary(symbol, {
      modules: [
        "financialData",
        "balanceSheetHistory",
        "balanceSheetHistoryQuarterly"
      ]
    });
    const financialData = summary?.financialData || {};
    const annualSheet = summary?.balanceSheetHistory?.balanceSheetStatements?.[0] || {};
    const quarterlySheet = summary?.balanceSheetHistoryQuarterly?.balanceSheetStatements?.[0] || {};
    const sheet = quarterlySheet && Object.keys(quarterlySheet).length ? quarterlySheet : annualSheet;
    const totalCash = firstYahooRawNumber(
      financialData.totalCash,
      sheet.cash,
      sheet.cashAndCashEquivalents,
      sheet.cashCashEquivalentsAndShortTermInvestments
    );
    const totalDebt = firstYahooRawNumber(
      financialData.totalDebt,
      sheet.totalDebt,
      sheet.longTermDebtAndCapitalLeaseObligation,
      sheet.longTermDebt,
      sheet.shortLongTermDebtTotal,
      sheet.currentDebtAndCapitalLeaseObligation
    );

    return {
      totalCash,
      totalDebt,
      balanceSheetAsOf: sheet.endDate
        ? new Date(firstYahooRawNumber(sheet.endDate) * 1000).toISOString().slice(0, 10)
        : null,
      balanceSheetSource: "Yahoo Finance latest balance sheet"
    };
  };

  const fromFmp = async () => {
    const data = await getFmpData(symbol, "balance sheet", [
      "/stable/balance-sheet-statement?symbol={ticker}&period=quarter&limit=1",
      "/api/v3/balance-sheet-statement/{ticker}?period=quarter&limit=1",
      "/stable/balance-sheet-statement?symbol={ticker}&period=annual&limit=1",
      "/api/v3/balance-sheet-statement/{ticker}?period=annual&limit=1"
    ]);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return {};
    const shortTermDebt = toNumberOrNull(row.shortTermDebt);
    const longTermDebt = toNumberOrNull(row.longTermDebt);
    const combinedDebt =
      shortTermDebt !== null || longTermDebt !== null
        ? (shortTermDebt || 0) + (longTermDebt || 0)
        : null;
    return {
      totalCash: firstFiniteNumber(
        row.cashAndCashEquivalents,
        row.cashAndShortTermInvestments,
        row.cash
      ),
      totalDebt: firstFiniteNumber(
        row.totalDebt,
        combinedDebt,
        row.longTermDebt
      ),
      balanceSheetAsOf: row.date || row.fillingDate || null,
      balanceSheetSource: "FMP latest balance sheet"
    };
  };

  const fromAlphaVantage = async () => {
    const data = await getAlphaVantageFundamentalData(symbol, "BALANCE_SHEET");
    const report = Array.isArray(data?.quarterlyReports) && data.quarterlyReports.length
      ? data.quarterlyReports[0]
      : Array.isArray(data?.annualReports) && data.annualReports.length
        ? data.annualReports[0]
        : null;
    if (!report) return {};
    const shortTermDebt = toNumberOrNull(report.shortTermDebt);
    const currentLongTermDebt = toNumberOrNull(report.currentLongTermDebt);
    const longTermDebt = toNumberOrNull(report.longTermDebt);
    const combinedDebt =
      shortTermDebt !== null || currentLongTermDebt !== null || longTermDebt !== null
        ? (shortTermDebt || 0) + (currentLongTermDebt || 0) + (longTermDebt || 0)
        : null;

    return {
      totalCash: firstFiniteNumber(
        report.cashAndCashEquivalentsAtCarryingValue,
        report.cashAndShortTermInvestments
      ),
      totalDebt: firstFiniteNumber(
        report.shortLongTermDebtTotal,
        report.totalDebt,
        combinedDebt,
        report.longTermDebt
      ),
      balanceSheetAsOf: report.fiscalDateEnding || null,
      balanceSheetSource: "Alpha Vantage latest balance sheet"
    };
  };

  try {
    const secResult = await fromSecCompanyFacts();
    if (hasBalanceSheetData(secResult)) return withCheckedAt(secResult);
  } catch (err) {
    console.log("SEC balance sheet metrics skipped:", symbol, err.response?.status || err.message);
  }

  try {
    const timeSeriesResult = await fromYahooTimeSeries();
    if (hasBalanceSheetData(timeSeriesResult)) return withCheckedAt(timeSeriesResult);
  } catch (err) {
    setYahooCooldown(err, "balance sheet time series", symbol);
    console.log("Yahoo balance sheet time series skipped:", symbol, err.response?.status || err.message);
  }

  if (fast) return withCheckedAt({});

  try {
    const yahooResult = await fromYahoo();
    if (hasBalanceSheetData(yahooResult)) return withCheckedAt(yahooResult);
  } catch (err) {
    setYahooQuoteSummaryCooldown(err, "balance sheet metrics", symbol);
    console.log("Yahoo balance sheet metrics skipped:", symbol, err.response?.status || err.message);
  }

  try {
    const alphaResult = await fromAlphaVantage();
    if (hasBalanceSheetData(alphaResult)) return withCheckedAt(alphaResult);
  } catch (err) {
    console.log("Alpha Vantage balance sheet metrics skipped:", symbol, err.response?.status || err.message);
  }

  try {
    return withCheckedAt(await fromFmp());
  } catch (err) {
    console.log("FMP balance sheet metrics skipped:", symbol, err.response?.status || err.message);
    return withCheckedAt({});
  }
}

async function fetchYahooQuickQuote(ticker) {
  if (!canUseYahoo()) return {};

  try {
    const quoteData = await yahooFinance.quote(ticker);
    return {
      name: quoteData.longName || quoteData.shortName || ticker,
      symbol: quoteData.symbol || ticker,
      currency: firstText(quoteData.currency),
      financialCurrency: firstText(quoteData.financialCurrency, quoteData.currency),
      price: firstYahooNumber(quoteData.regularMarketPrice),
      change: firstFiniteNumber(quoteData.regularMarketChange),
      percentChange: firstFiniteNumber(quoteData.regularMarketChangePercent),
      extendedHours: buildYahooExtendedHoursQuote(quoteData),
      previousClose: firstYahooNumber(quoteData.regularMarketPreviousClose),
      high: firstYahooNumber(quoteData.regularMarketDayHigh),
      low: firstYahooNumber(quoteData.regularMarketDayLow),
      open: firstYahooNumber(quoteData.regularMarketOpen),
      marketCap: firstYahooNumber(quoteData.marketCap),
      pe: firstYahooNumber(quoteData.trailingPE),
      forwardPE: firstYahooNumber(quoteData.forwardPE),
      pegRatio: firstYahooNumber(quoteData.pegRatio, quoteData.trailingPegRatio),
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
    setYahooCooldown(err, "quick quote", ticker);
    console.log("Yahoo quick quote skipped:", ticker, err.message);
    return {};
  }
}

async function publishFastStockSnapshot(ticker) {
  const stock = await Stock.findOne({ ticker }).lean();
  const quickData = await buildFastStockSnapshot(ticker, stock?.data || {});
  if (!quickData) return;
  const latestStock = await Stock.findOne({ ticker }).lean().catch(() => null);
  const latestData = latestStock?.data || stock?.data || {};
  const mergedData = withGuaranteedAnalystSection({
    ...latestData,
    ...quickData,
    revenueData: Array.isArray(latestData.revenueData) && latestData.revenueData.length
      ? latestData.revenueData
      : quickData.revenueData,
    revenueHistory: Array.isArray(latestData.revenueHistory) && latestData.revenueHistory.length
      ? latestData.revenueHistory
      : quickData.revenueHistory,
    marginHistory: Array.isArray(latestData.marginHistory) && latestData.marginHistory.length
      ? latestData.marginHistory
      : quickData.marginHistory,
    financialHistoryVersion: latestData.financialHistoryVersion ?? quickData.financialHistoryVersion,
    financialHistoryCheckedAt: latestData.financialHistoryCheckedAt ?? quickData.financialHistoryCheckedAt,
    interimHistoryVersion: latestData.interimHistoryVersion ?? quickData.interimHistoryVersion,
    interimHistoryCheckedAt: latestData.interimHistoryCheckedAt ?? quickData.interimHistoryCheckedAt,
    hasInterimHistory: latestData.hasInterimHistory ?? quickData.hasInterimHistory,
    latestInterimPeriod: latestData.latestInterimPeriod ?? quickData.latestInterimPeriod
  });

  const update = {
    ticker,
    status: latestStock?.status === "ready" || stock?.status === "ready" ? "ready" : "pending",
    data: mergedData
  };

  if (latestStock?.status !== "ready" && stock?.status !== "ready") {
    update.updatedAt = new Date();
  }

  await Stock.findOneAndUpdate(
    { ticker },
    update,
    { upsert: !latestStock && !stock }
  );
}

function hasFastRenderableOverview(stock) {
  const data = stock?.data || stock || {};
  const hasCoreCharts = hasAnnualCoreChartHistory({ data });
  const hasOverviewMetrics =
    data.valuationMetricsVersion === VALUATION_METRICS_VERSION ||
    data.balanceSheetMetricsVersion === BALANCE_SHEET_METRICS_VERSION ||
    toNumberOrNull(data.marketCap) !== null ||
    toNumberOrNull(data.pe) !== null ||
    toNumberOrNull(data.forwardPE) !== null ||
    toNumberOrNull(data.totalCash) !== null ||
    toNumberOrNull(data.totalDebt) !== null;
  const hasEstimates =
    data.estimateDataVersion === STOCK_ESTIMATE_VERSION ||
    toNumberOrNull(data.analystEstimates?.currentYear?.revenue) !== null ||
    toNumberOrNull(data.analystEstimates?.currentYear?.eps) !== null ||
    toNumberOrNull(data.analystEstimates?.nextYear?.revenue) !== null ||
    toNumberOrNull(data.analystEstimates?.nextYear?.eps) !== null ||
    toNumberOrNull(data.analystEstimates?.nextQuarter?.revenue) !== null ||
    toNumberOrNull(data.analystEstimates?.nextQuarter?.eps) !== null;

  return hasCoreCharts && (hasOverviewMetrics || hasEstimates);
}

async function markFastOverviewReady(ticker) {
  const stock = await Stock.findOne({ ticker }).lean().catch(() => null);
  if (!stock || stock.status === "ready" || !hasFastRenderableOverview(stock)) return;

  await Stock.findOneAndUpdate(
    { ticker },
    {
      status: "ready",
      updatedAt: new Date()
    }
  );
}

async function publishValuationMetricsSnapshot(ticker) {
  const metricCards = await resolveWithin(fetchFmpMetricCards(ticker), 3200, {});
  if (!hasFmpMetricCardPayload(metricCards)) return;
  const update = buildFmpMetricCardUpdate(metricCards);

  await Stock.findOneAndUpdate(
    { ticker },
    {
      $set: Object.fromEntries(
        Object.entries(update).map(([key, value]) => [`data.${key}`, value])
      )
    }
  );
}

async function publishQuarterEstimateSnapshot(ticker) {
  const stock = await Stock.findOne({ ticker }).lean();
  if (!stock) return;
  const estimate = await resolveWithin(
    fetchCalendarQuarterEstimate(ticker, { fast: true }),
    4500,
    {}
  );
  const hasEstimate =
    toNumberOrNull(estimate?.revenue) !== null ||
    toNumberOrNull(estimate?.eps) !== null ||
    Boolean(estimate?.date);
  if (!hasEstimate) return;

  const nextQuarter = {
    revenue: normalizeStatementDollars(estimate.revenue),
    earnings: null,
    eps: toNumberOrNull(estimate.eps),
    date: estimate.date || null,
    fiscalQuarter: estimate.fiscalQuarter || null,
    source: estimate.source || "FMP earnings history"
  };

  await Stock.findOneAndUpdate(
    { ticker },
    {
      $set: {
        "data.analystEstimates.nextQuarter": nextQuarter,
        "data.analystEstimatesSources.nextQuarter": estimate.source || "FMP earnings history",
        "data.quarterEstimateCheckedAt": new Date().toISOString(),
        "data.estimateDataVersion": STOCK_ESTIMATE_VERSION,
        ...(hasEstimate
          ? { "data.epsBeatMiss": buildEpsBeatMissSeries(stock.data?.epsBeatMiss || [], nextQuarter) }
          : {})
      }
    }
  );
}

async function publishEpsBeatMissSnapshot(ticker) {
  const stock = await Stock.findOne({ ticker }).lean();
  if (!stock) return;
  const [calendarQuarterEstimate, fmpRows] = await Promise.all([
    resolveWithin(fetchCalendarQuarterEstimate(ticker, { fast: true }), 2200, stock.data?.analystEstimates?.nextQuarter || {}),
    resolveWithin(fetchFmpEpsSurprises(ticker), 5200, [])
  ]);
  const reportedRows = mergeEpsBeatMissRows(stock.data?.epsBeatMiss || [], fmpRows || []);
  const epsBeatMiss = buildEpsBeatMissSeries(reportedRows, calendarQuarterEstimate);
  if (!Array.isArray(epsBeatMiss) || !epsBeatMiss.length) return;

  await Stock.findOneAndUpdate(
    { ticker },
    {
      $set: {
        "data.epsBeatMiss": epsBeatMiss,
        "data.epsBeatMissCheckedAt": new Date().toISOString()
      }
    }
  );
}

async function publishHistoricalPeSnapshot(ticker) {
  const historicalPe = await resolveWithin(fetchFmpHistoricalPe(ticker), 1800, []);
  if (!Array.isArray(historicalPe) || !historicalPe.length) return;

  await Stock.findOneAndUpdate(
    { ticker },
    {
      $set: {
        "data.historicalPe": historicalPe,
        "data.historicalPeSource": "FMP annual ratios",
        "data.historicalPeCheckedAt": new Date().toISOString()
      }
    }
  );
}

async function publishBalanceSheetSnapshot(ticker) {
  const stock = await Stock.findOne({ ticker }).lean();
  if (!stock) return;
  const metricCards = await resolveWithin(fetchFmpMetricCards(ticker), 3200, {});
  if (!hasFmpMetricCardPayload(metricCards)) return;
  const update = buildFmpMetricCardUpdate(metricCards);

  await Stock.findOneAndUpdate(
    { ticker },
    {
      $set: Object.fromEntries(
        Object.entries(update).map(([key, value]) => [`data.${key}`, value])
      )
    }
  );
}

async function buildMarketActivitySnapshot(ticker, previousData = {}) {
  const [
    marketBeatAnalystUpdates,
    marketBeatInstitutionalHolders,
    secInsiderTransactions
  ] = await Promise.all([
    resolveWithin(fetchMarketBeatAnalystUpdates(ticker), 2400, []),
    resolveWithin(fetchMarketBeatInstitutionalHolders(ticker), 2400, []),
    resolveWithin(fetchSecInsiderTransactions(ticker), 2800, [])
  ]);

  return {
    analystUpdates: marketBeatAnalystUpdates.length
      ? marketBeatAnalystUpdates
      : previousData.analystUpdates || [],
    institutionalHolders: marketBeatInstitutionalHolders.length
      ? marketBeatInstitutionalHolders
      : previousData.institutionalHolders || [],
    insiderTransactions: secInsiderTransactions.length
      ? secInsiderTransactions
      : previousData.insiderTransactions || [],
    marketActivityUpdatedAt: new Date().toISOString()
  };
}

async function publishMarketActivitySnapshot(ticker) {
  const stock = await Stock.findOne({ ticker }).lean();
  if (!stock) return;
  const data = stock.data || {};
  const lastCheckedAt = data.marketActivityUpdatedAt
    ? new Date(data.marketActivityUpdatedAt).getTime()
    : 0;
  const checkedRecently = lastCheckedAt && Date.now() - lastCheckedAt < 6 * 60 * 60 * 1000;
  const failedRecently = lastCheckedAt && Date.now() - lastCheckedAt < 90 * 1000;
  const hasMarketActivityRows =
    (Array.isArray(data.analystUpdates) && data.analystUpdates.length) ||
    (Array.isArray(data.institutionalHolders) && data.institutionalHolders.length) ||
    (Array.isArray(data.insiderTransactions) && data.insiderTransactions.length);
  const hasAllMarketActivitySections =
    Array.isArray(data.analystUpdates) && data.analystUpdates.length &&
    Array.isArray(data.institutionalHolders) && data.institutionalHolders.length &&
    Array.isArray(data.insiderTransactions) && data.insiderTransactions.length;
  const hasOnlyAcceptedMarketActivityRows =
    (data.analystUpdates || []).every((row) => !row?.source || /FMP/i.test(String(row.source))) &&
    (data.insiderTransactions || []).every((row) => !row?.source || /FMP/i.test(String(row.source))) &&
    (data.institutionalHolders || []).every((row) =>
      !row?.source || /FMP|MarketBeat/i.test(String(row.source))
    );

  if (((checkedRecently && hasAllMarketActivitySections) || failedRecently) && hasOnlyAcceptedMarketActivityRows) {
    return;
  }

  const publishFmpRows = async () => {
    const data = await resolveWithin(fetchFmpMarketActivity(ticker), 2200, {
      analystUpdates: [],
      institutionalHolders: [],
      insiderTransactions: []
    });
    const hasFetchedMarketActivity =
      (Array.isArray(data.analystUpdates) && data.analystUpdates.length) ||
      (Array.isArray(data.institutionalHolders) && data.institutionalHolders.length) ||
      (Array.isArray(data.insiderTransactions) && data.insiderTransactions.length);
    if (!hasFetchedMarketActivity) return;
    const now = new Date().toISOString();
    const $set = {
      "data.analystUpdates": Array.isArray(data.analystUpdates) && data.analystUpdates.length
        ? data.analystUpdates
        : stock.data?.analystUpdates || [],
      "data.institutionalHolders": Array.isArray(data.institutionalHolders) && data.institutionalHolders.length
        ? data.institutionalHolders
        : stock.data?.institutionalHolders || [],
      "data.insiderTransactions": Array.isArray(data.insiderTransactions) && data.insiderTransactions.length
        ? data.insiderTransactions
        : stock.data?.insiderTransactions || [],
      "data.analystUpdatesCheckedAt": now,
      "data.institutionalHoldersCheckedAt": now,
      "data.insiderTransactionsCheckedAt": now,
      "data.marketActivityUpdatedAt": now
    };
    await Stock.findOneAndUpdate({ ticker }, { $set });
  };

  await publishFmpRows();
}

async function buildFastStockSnapshot(ticker, previousData = {}) {
  const [
    fmpProfile,
    sparkQuote,
    yahooData,
    chartQuote,
    calendarQuarterEstimate,
    fmpValuation,
    stockAnalysisValuation,
    stockAnalysisForecast,
    balanceSheetMetrics,
    fmpFiftyTwoWeekRange,
    fmpSharesFloat,
    fmpExecutives
  ] = await Promise.all([
    resolveWithin(fetchFmpStableQuoteProfile(ticker), 1200, {}),
    resolveWithin(fetchYahooSparkQuote(ticker), 1200, {}),
    Promise.resolve({}),
    resolveWithin(fetchYahooChartQuote(ticker), 1200, {}),
    resolveWithin(fetchCalendarQuarterEstimate(ticker, { fast: true }), 1400, previousData.analystEstimates?.nextQuarter || {}),
    resolveWithin(fetchFmpMetricCards(ticker), 2600, {}),
    Promise.resolve({}),
    Promise.resolve({}),
    Promise.resolve({}),
    resolveWithin(fetchFmpFiftyTwoWeekRange(ticker), 1800, {}),
    resolveWithin(fetchFmpSharesFloat(ticker), 2200, {}),
    resolveWithin(fetchFmpKeyExecutives(ticker), 2200, [])
  ]);
  const definedValues = (data = {}) => Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== null && value !== undefined)
  );
  const chartData = chartQuote?.c || sparkQuote?.price
    ? {
        price: firstNumber(fmpProfile.price, chartQuote.c, sparkQuote.price),
        change: firstNumber(fmpProfile.change, chartQuote.d, sparkQuote.change),
        percentChange: firstNumber(fmpProfile.percentChange, chartQuote.dp, sparkQuote.percentChange),
        extendedHours: chartQuote.extendedHours || null,
        previousClose: firstNumber(fmpProfile.previousClose, chartQuote.pc, sparkQuote.previousClose),
        high: firstNumber(fmpProfile.high, chartQuote.h),
        low: firstNumber(fmpProfile.low, chartQuote.l),
        open: firstNumber(fmpProfile.open, chartQuote.o)
      }
    : definedValues(fmpProfile);
  const isFmpAdr = fmpProfile.isAdr === true;
  const fastData = {
    ...chartData,
    ...yahooData,
    name: firstText(fmpProfile.name, yahooData.name),
    symbol: ticker,
    isAdr: isFmpAdr,
    currency: firstText(fmpProfile.currency, yahooData.currency),
    financialCurrency: firstText(fmpProfile.financialCurrency, yahooData.financialCurrency),
    sector: firstText(fmpProfile.sector, yahooData.sector),
    industry: firstText(fmpProfile.industry, yahooData.industry),
    ceo: firstText(fmpProfile.ceo, yahooData.ceo),
    country: firstText(fmpProfile.country, yahooData.country),
    exchange: firstText(fmpProfile.exchange, yahooData.exchange),
    exchangeFullName: firstText(fmpProfile.exchangeFullName, yahooData.exchangeFullName),
    description: firstText(fmpProfile.description, yahooData.description),
    website: firstText(fmpProfile.website, yahooData.website),
    executives: Array.isArray(fmpExecutives) ? fmpExecutives : [],
    logo: getFinnhubLogoUrl(ticker),
    marketCap: firstNumber(fmpProfile.marketCap, fmpValuation.marketCap, yahooData.marketCap),
    beta: firstNumber(fmpProfile.beta),
    volume: firstNumber(fmpProfile.volume),
    lastDividend: firstNumber(fmpProfile.lastDividend),
    floatShares: firstNumber(fmpSharesFloat.floatShares),
    freeFloatShares: firstNumber(fmpSharesFloat.freeFloatShares),
    freeFloatPercent: firstNumber(fmpSharesFloat.freeFloatPercent),
    floatSharesUpdatedAt: firstText(fmpSharesFloat.floatSharesUpdatedAt),
    sharesFloatSource: firstText(fmpSharesFloat.sharesFloatSource),
    fiftyTwoWeekHigh: firstNumber(fmpProfile.fiftyTwoWeekHigh, fmpFiftyTwoWeekRange.fiftyTwoWeekHigh),
    fiftyTwoWeekLow: firstNumber(fmpProfile.fiftyTwoWeekLow, fmpFiftyTwoWeekRange.fiftyTwoWeekLow),
    priceAvg50: firstNumber(fmpProfile.priceAvg50, fmpValuation.priceAvg50),
    priceAvg200: firstNumber(fmpProfile.priceAvg200, fmpValuation.priceAvg200),
    pe: firstNumber(fmpValuation.pe),
    forwardPE: firstNumber(fmpValuation.forwardPE),
    pegRatio: firstNumber(fmpValuation.pegRatio),
    forwardPS: firstNumber(fmpValuation.forwardPS),
    priceToSales: firstNumber(fmpValuation.priceToSales, yahooData.priceToSales),
    priceToBook: firstNumber(fmpValuation.priceToBook),
    priceToTangibleBook: firstNumber(fmpValuation.priceToTangibleBook),
    priceToFreeCashflow: firstNumber(fmpValuation.priceToFreeCashflow),
    priceToOperatingCashflow: firstNumber(fmpValuation.priceToOperatingCashflow),
    pretaxMargin: firstNumber(fmpValuation.pretaxMargin),
    ebitdaMargin: firstNumber(fmpValuation.ebitdaMargin),
    ebitMargin: firstNumber(fmpValuation.ebitMargin),
    fcfMargin: firstNumber(fmpValuation.fcfMargin),
    returnOnEquity: firstNumber(fmpValuation.returnOnEquity),
    returnOnAssets: firstNumber(fmpValuation.returnOnAssets),
    returnOnInvestedCapital: firstNumber(fmpValuation.returnOnInvestedCapital),
    returnOnCapitalEmployed: firstNumber(fmpValuation.returnOnCapitalEmployed),
    weightedAverageCostOfCapital: firstNumber(fmpValuation.weightedAverageCostOfCapital),
    revenueGrowth: firstNumber(fmpValuation.revenueGrowth),
    earningsGrowth: firstNumber(fmpValuation.earningsGrowth),
    grossMargins: firstNumber(fmpValuation.grossMargins),
    operatingMargins: firstNumber(fmpValuation.operatingMargins),
    profitMargins: firstNumber(fmpValuation.profitMargins),
    targetMean: firstNumber(fmpValuation.targetMean),
    recommendationKey: firstText(fmpValuation.recommendationKey),
    analystRatingText: firstText(fmpValuation.analystRatingText),
    freeCashflow: firstNumber(fmpValuation.freeCashflow),
    operatingCashflow: firstNumber(fmpValuation.operatingCashflow),
    revenuePerEmployee: firstNumber(fmpValuation.revenuePerEmployee),
    profitsPerEmployee: firstNumber(fmpValuation.profitsPerEmployee),
    employeeCount: firstNumber(fmpValuation.employeeCount, fmpProfile.employeeCount),
    ...Object.fromEntries(
      STOCK_ANALYSIS_VALUATION_FIELDS.map((field) => [field, toNumberOrNull(fmpValuation[field])])
    ),
    totalCash: isFmpAdr ? null : firstNumber(fmpValuation.totalCash, fmpValuation.cashAndCashEquivalents),
    totalDebt: isFmpAdr ? null : fmpValuation.totalDebt ?? null,
    cashAndCashEquivalents: isFmpAdr ? null : firstNumber(fmpValuation.cashAndCashEquivalents, fmpValuation.totalCash),
    netCash: isFmpAdr ? null : fmpValuation.netCash ?? null,
    netCashPerShare: isFmpAdr ? null : firstNumber(
      fmpValuation.netCashPerShare,
      fmpValuation.netCash !== null &&
        fmpProfile.marketCap &&
        fmpProfile.price
        ? fmpValuation.netCash / (fmpProfile.marketCap / fmpProfile.price)
        : null
    ),
    equityBookValue: isFmpAdr ? null : fmpValuation.equityBookValue ?? null,
    bookValuePerShare: isFmpAdr ? null : fmpValuation.bookValuePerShare ?? null,
    workingCapital: isFmpAdr ? null : fmpValuation.workingCapital ?? null,
    balanceSheetAsOf: isFmpAdr ? null : fmpValuation.balanceSheetAsOf || null,
    balanceSheetSource: isFmpAdr ? null : fmpValuation.balanceSheetSource || null
  };
  const hasFastSnapshotData =
    toNumberOrNull(fastData.price) !== null ||
    STOCK_ANALYSIS_VALUATION_FIELDS.some((field) => toNumberOrNull(fastData[field]) !== null) ||
    toNumberOrNull(fastData.totalCash) !== null ||
    toNumberOrNull(fastData.totalDebt) !== null ||
    toNumberOrNull(fmpValuation.currentYearRevenue) !== null ||
    toNumberOrNull(fmpValuation.currentYearEps) !== null ||
    toNumberOrNull(fmpValuation.nextYearRevenue) !== null ||
    toNumberOrNull(fmpValuation.nextYearEps) !== null ||
    toNumberOrNull(calendarQuarterEstimate.revenue) !== null ||
    toNumberOrNull(calendarQuarterEstimate.eps) !== null;
  if (!hasFastSnapshotData) return null;

  const hasCalendarQuarterEstimate =
    toNumberOrNull(calendarQuarterEstimate.revenue) !== null ||
    toNumberOrNull(calendarQuarterEstimate.eps) !== null ||
    Boolean(calendarQuarterEstimate.date);
  const previousNextQuarterEstimate = previousData.analystEstimates?.nextQuarter || {};
  const nextQuarterEstimate = hasCalendarQuarterEstimate
    ? {
        revenue: normalizeStatementDollars(calendarQuarterEstimate.revenue),
        earnings: null,
        eps: toNumberOrNull(calendarQuarterEstimate.eps),
        date: calendarQuarterEstimate.date || null,
        fiscalQuarter: calendarQuarterEstimate.fiscalQuarter || null,
        source: calendarQuarterEstimate.source || "FMP earnings history"
      }
    : previousNextQuarterEstimate;
  const fmpFutureYearEstimates = Array.isArray(fmpValuation.annualEstimateRows)
    ? fmpValuation.annualEstimateRows
    : [];
  const fastCurrentYearEstimate = fmpFutureYearEstimates[0] || {};
  const fastNextYearEstimate = fmpFutureYearEstimates[1] || {};

  const analystEstimates = {
    nextQuarter: {
      revenue: normalizeStatementDollars(nextQuarterEstimate.revenue),
      earnings: null,
      eps: toNumberOrNull(nextQuarterEstimate.eps),
      date: nextQuarterEstimate.date || null,
      fiscalQuarter: nextQuarterEstimate.fiscalQuarter || null,
      source: nextQuarterEstimate.source || "FMP earnings history"
    },
    currentYear: {
      ...(previousData.analystEstimates?.currentYear || {}),
      ...(fastCurrentYearEstimate || {}),
      revenue: firstNumber(
        normalizeStatementDollars(fastCurrentYearEstimate.revenue),
        normalizeStatementDollars(fmpValuation.currentYearRevenue),
        previousData.analystEstimates?.currentYear?.revenue
      ),
      earnings: firstNumber(
        fastCurrentYearEstimate.earnings,
        fmpValuation.currentYearNetIncome,
        previousData.analystEstimates?.currentYear?.earnings
      ),
      eps: firstNumber(
        toNumberOrNull(fastCurrentYearEstimate.eps),
        toNumberOrNull(fmpValuation.currentYearEps),
        previousData.analystEstimates?.currentYear?.eps
      ),
      source: "FMP"
    },
    nextYear: {
      ...(previousData.analystEstimates?.nextYear || {}),
      ...(fastNextYearEstimate || {}),
      revenue: firstNumber(
        normalizeStatementDollars(fastNextYearEstimate.revenue),
        normalizeStatementDollars(fmpValuation.nextYearRevenue),
        previousData.analystEstimates?.nextYear?.revenue
      ),
      earnings: firstNumber(
        fastNextYearEstimate.earnings,
        fmpValuation.nextYearNetIncome,
        previousData.analystEstimates?.nextYear?.earnings
      ),
      eps: firstNumber(
        toNumberOrNull(fastNextYearEstimate.eps),
        toNumberOrNull(fmpValuation.nextYearEps),
        previousData.analystEstimates?.nextYear?.eps
      ),
      source: "FMP"
    },
    futureYears: fmpFutureYearEstimates.length
      ? fmpFutureYearEstimates
      : previousData.analystEstimates?.futureYears || []
  };
  const epsBeatMiss = buildEpsBeatMissSeries(previousData.epsBeatMiss || [], analystEstimates.nextQuarter);
  const nextEps = toNumberOrNull(analystEstimates.nextYear.eps);
  const hasBalanceSnapshotValue =
    toNumberOrNull(fastData.totalCash) !== null ||
    toNumberOrNull(fastData.totalDebt) !== null ||
    toNumberOrNull(fastData.cashAndCashEquivalents) !== null ||
    toNumberOrNull(fastData.netCash) !== null ||
    toNumberOrNull(fastData.equityBookValue) !== null ||
    toNumberOrNull(fastData.workingCapital) !== null;
  const fmpMetricCardValues = Object.keys(fmpValuation || {}).length
    ? {
        ...Object.fromEntries(
          STOCK_ANALYSIS_VALUATION_FIELDS.map((field) => [field, toNumberOrNull(fastData[field])])
        ),
        ...Object.fromEntries(
          FMP_TEXT_METRIC_FIELDS.map((field) => [field, firstText(fastData[field]) || null])
        )
      }
    : {};
  const fmpBalanceCardValues = Object.keys(fmpValuation || {}).length
    ? Object.fromEntries(
        [
          "totalCash",
          "totalDebt",
          "cashAndCashEquivalents",
          "netCash",
          "netCashPerShare",
          "equityBookValue",
          "bookValuePerShare",
          "workingCapital"
        ].map((field) => [field, toNumberOrNull(fastData[field])])
      )
    : {};
  return applyFmpMetricCards(withGuaranteedAnalystSection({
    ...previousData,
    ...definedValues(fastData),
    ...fmpMetricCardValues,
    ...fmpBalanceCardValues,
    valuationMetricsCheckedAt: new Date().toISOString(),
    valuationMetricsVersion: VALUATION_METRICS_VERSION,
    balanceSheetCheckedAt: hasBalanceSnapshotValue
      ? new Date().toISOString()
      : previousData.balanceSheetCheckedAt,
    balanceSheetMetricsVersion: hasBalanceSnapshotValue
      ? BALANCE_SHEET_METRICS_VERSION
      : previousData.balanceSheetMetricsVersion,
    forwardPE: firstNumber(
      fastData.forwardPE,
      nextEps > 0 ? fastData.price / nextEps : null,
      previousData.forwardPE
    ),
    analystEstimates,
    epsBeatMiss,
    analystEstimatesSources: {
      nextQuarter: analystEstimates.nextQuarter.source,
      currentYear: "FMP",
      nextYear: "FMP",
      followingYear: "FMP"
    },
    analystEstimatesSource: "FMP",
    estimateDataVersion: STOCK_ESTIMATE_VERSION
  }), fmpValuation);
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

const getImmediateStockSnapshot = async (ticker, previousData = {}) => {
  const hasRenderableSnapshot =
    toNumberOrNull(previousData.price) !== null &&
    (
      hasAnyCoreChartHistory({ data: previousData }) ||
      hasCompleteSupplementalData({ data: previousData })
    );
  if (hasRenderableSnapshot) {
    const needsMetricCards =
      previousData.valuationMetricsVersion !== VALUATION_METRICS_VERSION ||
      previousData.balanceSheetMetricsVersion !== BALANCE_SHEET_METRICS_VERSION;
    const needsCompanyProfile = !hasCompleteCompanyProfileSnapshot(previousData);
    if (!needsMetricCards && !needsCompanyProfile) return buildMinimalStockSnapshot(ticker, previousData);
    const fastPatch = needsCompanyProfile
      ? await resolveWithin(buildFastStockSnapshot(ticker, previousData), 3200, null)
      : null;
    if (fastPatch) return buildMinimalStockSnapshot(ticker, fastPatch);
    const metricCards = needsMetricCards ? await resolveWithin(fetchFmpMetricCards(ticker), 2600, {}) : {};
    return applyFmpMetricCards(buildMinimalStockSnapshot(ticker, previousData), metricCards);
  }

  return (await resolveWithin(buildFastStockSnapshot(ticker, previousData), 3200, null)) ||
    buildMinimalStockSnapshot(ticker, previousData);
};

async function publishChartHistorySnapshot(ticker, previousData = {}, secAnnualMargins = {}, sharesOutstanding = null) {
  if (!Array.isArray(secAnnualMargins.history) || !secAnnualMargins.history.length) return;

  const revenueData = cleanFinancialHistoryRows(finalizeFinancialHistory(
    mergeHistoricalFinancials(secAnnualMargins.history, previousData.revenueData || []),
    sharesOutstanding
  ));

  if (!hasCompleteChartHistory({ data: { ...previousData, revenueData, interimHistoryCheckedAt: new Date().toISOString() } })) {
    return;
  }

  const revenueHistory = cleanFinancialHistoryRows(finalizeRevenueHistory(revenueData));
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

  const marginHistory = cleanFinancialHistoryRows([...marginRowsByPeriod.values()]
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
    }));
  const nextData = withGuaranteedAnalystSection({
    ...previousData,
    financialHistoryCheckedAt: new Date().toISOString(),
    interimHistoryCheckedAt: new Date().toISOString(),
    interimHistoryVersion: INTERIM_HISTORY_VERSION,
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
  const quotePromise = getPrimaryQuote(ticker, previousData || {});
  const profilePromise = Promise.resolve({});
  const metricDataPromise = Promise.resolve({ metric: {} });
  const financialsPromise = Promise.resolve({ data: [] });
  const priceTargetPromise = Promise.resolve({});
  const secAnnualMarginsPromise = Promise.resolve({ history: [], marginHistory: [] });

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
    .slice(0, 10)
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
    alphaVantageIncomeStatementData,
    yahooSupplementalData,
    yahooYearEndPrices,
    nasdaqData,
    stockAnalysisForecast,
    stockAnalysisHistoricalPe,
    secAnnualMargins,
    fmpCashFlowData,
    fmpPriceTargetData,
    fmpAnalystEstimateData,
    fmpRatingData,
    stockAnalysisFinancialData,
    stockAnalysisValuation,
    fmpStableValuation,
    fmpQuoteProfile,
    fmpFiftyTwoWeekRange,
    fmpSharesFloat,
    fmpExecutives,
    calendarQuarterEstimate,
    finnhubAnalystUpdates,
    fmpMarketActivity,
    marketBeatAnalystUpdates,
    marketBeatInstitutionalHolders,
    secInsiderTransactions,
    epsSurprises,
    marketBeatEpsSurprises,
    balanceSheetMetrics,
    recommendation,
    epsEstimate,
    revenueEstimate
  ] = await Promise.all([
    Promise.resolve([]),
    resolveWithin(fetchFmpFinancialHistory(ticker), STOCK_PROVIDER_TIMEOUT_MS, []),
    Promise.resolve([]),
    Promise.resolve({}),
    Promise.resolve([]),
    Promise.resolve({}),
    Promise.resolve({}),
    resolveWithin(fetchFmpHistoricalPe(ticker), 1800, []),
    earlySecAnnualMargins,
    resolveWithin(getFmpData(ticker, "cash flow", [
      "/stable/cash-flow-statement?symbol={ticker}&period=annual&limit=6"
    ]), STOCK_PROVIDER_TIMEOUT_MS, null),
    resolveWithin(getFmpData(ticker, "price target", [
      "/stable/price-target-consensus?symbol={ticker}"
    ]), STOCK_PROVIDER_TIMEOUT_MS, null),
    resolveWithin(getFmpData(ticker, "analyst estimates", [
      "/stable/analyst-estimates?symbol={ticker}&period=annual&limit=10"
    ]), STOCK_PROVIDER_TIMEOUT_MS, null),
    resolveWithin(getFmpData(ticker, "rating", [
      "/stable/ratings-snapshot?symbol={ticker}"
    ]), STOCK_PROVIDER_TIMEOUT_MS, null),
    Promise.resolve([]),
    Promise.resolve({}),
    resolveWithin(fetchFmpStableValuationMetrics(ticker), STOCK_PROVIDER_TIMEOUT_MS, {}),
    resolveWithin(fetchFmpStableQuoteProfile(ticker), 1600, {}),
    resolveWithin(fetchFmpFiftyTwoWeekRange(ticker), 1800, {}),
    resolveWithin(fetchFmpSharesFloat(ticker), 1600, {}),
    resolveWithin(fetchFmpKeyExecutives(ticker), 1600, []),
    resolveWithin(fetchCalendarQuarterEstimate(ticker), STOCK_SLOW_PROVIDER_TIMEOUT_MS, {}),
    Promise.resolve([]),
    resolveWithin(fetchFmpMarketActivity(ticker), STOCK_PROVIDER_TIMEOUT_MS, { analystUpdates: [], institutionalHolders: [], insiderTransactions: [] }),
    Promise.resolve([]),
    Promise.resolve([]),
    Promise.resolve([]),
    resolveWithin(fetchFmpEpsSurprises(ticker), 5200, previousData?.epsBeatMiss || []),
    Promise.resolve([]),
    resolveWithin(fetchLatestBalanceSheetMetrics(ticker), STOCK_PROVIDER_TIMEOUT_MS, {}),
    Promise.resolve([]),
    Promise.resolve({ data: [] }),
    Promise.resolve({ data: [] })
  ]);
  const fmpQuarterlyFinancialData = [];
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
  fmpAnalystEstimates = normalizeFmpAnnualEstimateRows(fmpAnalystEstimates, { symbol: ticker, maxFutureYears: 6 });
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
  const previousRealRevenueData =
    previousData?.financialHistoryVersion === FINANCIAL_HISTORY_VERSION
      ? (previousData?.revenueData || []).filter(
          (row) =>
            row?.source !== "Modeled fallback" &&
            row?.source !== "Current metric fallback"
        )
      : [];

  const foreignAdrConfig = FOREIGN_ADR_CONFIG[ticker] || null;
  const reportedAnnualData = foreignAdrConfig
    ? mergeAllHistoricalFinancials(
        previousRealRevenueData,
        fmpIncomeStatementData,
        stockAnalysisFinancialData,
        yahooFinancialData,
        getRecentEarningsReleaseAnnualRows(ticker)
      )
    : mergeAllHistoricalFinancials(
        previousRealRevenueData,
        fmpIncomeStatementData,
        stockAnalysisFinancialData,
        finnhubMetricData,
        finnhubReportedData,
        yahooFinancialData,
        alphaVantageIncomeStatementData,
        getRecentEarningsReleaseAnnualRows(ticker)
      );
  const supplementalAnnualData = mergeAllHistoricalFinancials(
    fmpCashFlowHistory,
    fmpQuarterlyFinancialData,
    stockAnalysisFinancialData,
    secAnnualMargins.history || []
  );
  const historicalMarketCap =
    fmpQuoteProfile.marketCap ??
    nasdaqData.marketCap ??
    yahooSupplementalData.marketCap ??
    (profile.marketCapitalization
      ? profile.marketCapitalization * 1000000
      : sharesOutstanding && quote.c
        ? sharesOutstanding * 1000000 * quote.c
        : null);
  const historicalSharesOutstanding = normalizeSharesOutstandingMillions(
    firstNumber(
      sharesOutstanding,
      yahooSupplementalData.sharesOutstanding
        ? yahooSupplementalData.sharesOutstanding / 1000000
        : null,
      historicalMarketCap && quote.c
        ? historicalMarketCap / quote.c / 1000000
        : null
    ),
    historicalMarketCap,
    quote.c
  );
  const revenueData = limitHistoricalFinancialRows(
    removeStaleModeledFallbackRows(
      removeStaleProviderScaleBreakRows(
        finalizeFinancialHistory(
          mergeSupplementalHistoricalFields(reportedAnnualData, supplementalAnnualData, Infinity),
          historicalSharesOutstanding
        )
      )
    )
  );
  const revenueHistory = cleanFinancialHistoryRows(finalizeRevenueHistory(
    revenueData
  ));
  const annualRowsAll = [...revenueData]
    .filter((row) => row.year && !row.isInterim)
    .sort((a, b) => a.year - b.year);
  const annualRows =
    annualRowsAll.filter((row) => row.source !== "Modeled fallback").length
      ? annualRowsAll.filter((row) => row.source !== "Modeled fallback")
      : annualRowsAll;
  const latestAnnual = annualRows[annualRows.length - 1] || {};
  const previousAnnual = annualRows[annualRows.length - 2] || {};
  const stockAnalysisFinancialCurrency = firstText(
    ...stockAnalysisFinancialData.map((row) => row.sourceCurrency)
  );
  const historicalFinancialCurrency = firstText(
    ...revenueData.map((row) => row.sourceCurrency),
    stockAnalysisFinancialCurrency
  );
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
  [
    ...(previousData?.marginHistory || []),
    ...fallbackMarginHistory,
    ...(secAnnualMargins.marginHistory || [])
  ].forEach((row) => {
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
  let marginHistory = cleanFinancialHistoryRows([...marginRowsByPeriod.values()]
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
    }));
  const knownFinancialInstitution = KNOWN_FINANCIAL_INSTITUTIONS.has(ticker);
  const latestRawMarginRow =
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
    marginHistory.at(-1) ||
    {};
  const yearEndPrices = new Map(
    (yahooYearEndPrices.length
      ? yahooYearEndPrices
      : yahooSupplementalData.yearEndPrices || []
    ).map((row) => [Number(row.year), row.close])
  );
  let historicalPe = Array.isArray(stockAnalysisHistoricalPe) && stockAnalysisHistoricalPe.length
    ? stockAnalysisHistoricalPe
    : revenueData
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
  const quarterlyHistoricalPe = await resolveWithin(
    calculateFmpQuarterlyHistoricalPe(ticker, revenueData),
    1800,
    []
  );
  if (quarterlyHistoricalPe.length) {
    const annualPeRows = historicalPe.filter((row) => !row?.isInterim && !row?.isCurrent);
    historicalPe = mergeHistoricalPeRows(annualPeRows, quarterlyHistoricalPe);
  }
  const latestInterimPeRow = null;

  if (!quote || !quote.c || quote.c === 0) {
    throw new Error("No price returned");
  }

  const epsEstimates = epsEstimate?.data || [];
  const revenueEstimates = revenueEstimate?.data || [];
  const saneFmpAnalystEstimates = fmpAnalystEstimates.filter((row) =>
    estimateLooksSaneAgainstHistory(row, latestAnnual)
  );
  const fmpFutureYearEstimates = normalizeFmpAnnualEstimateBlocks(saneFmpAnalystEstimates);
  const fmpCurrentEstimate = saneFmpAnalystEstimates[0] || {};
  const fmpNextEstimate = saneFmpAnalystEstimates[1] || {};
  const fmpFollowingEstimate = saneFmpAnalystEstimates[2] || {};
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
  const yahooCurrentEstimate = {};
  const yahooNextEstimate = {};
  const currentEps =
    fmpEstimateField(fmpCurrentEstimate, "epsAvg", "estimatedEpsAvg") ??
    estimateNextValue(currentEpsBase, conservativeProjectionRate(earningsGrowthRate, 0.15)) ??
    currentEpsBase ??
    null;

  const projectedNextEps = estimateNextValue(
    currentEps,
    conservativeProjectionRate(earningsGrowthRate, 0.22)
  );
  const trustedNextEpsCandidate = firstNumber(
    fmpEstimateField(fmpNextEstimate, "epsAvg", "estimatedEpsAvg")
  );
  const nextEpsCandidate =
    trustedNextEpsCandidate ??
    projectedNextEps ??
    historicalForwardEps ??
    epsFromForwardPE(quote.c, fmpStableValuation.forwardPE) ??
    null;
  const nextEps = trustedNextEpsCandidate !== null
    ? trustedNextEpsCandidate
    : sanitizeForwardEps(nextEpsCandidate, historicalForwardEps);

  const fmpCurrentEpsEstimate = toNumberOrNull(
    fmpEstimateField(fmpCurrentEstimate, "epsAvg", "estimatedEpsAvg")
  );
  const fmpNextEpsEstimate = toNumberOrNull(
    fmpEstimateField(fmpNextEstimate, "epsAvg", "estimatedEpsAvg")
  );
  const fmpCurrentRevenueEstimate = sanitizeCurrentRevenueEstimate(
    fmpEstimateField(fmpCurrentEstimate, "revenueAvg", "estimatedRevenueAvg")
  );
  const currentRevenue =
    fmpCurrentRevenueEstimate ??
    currentRevenueEstimateFallback;

  const fmpNextRevenueEstimate = sanitizeNextRevenueEstimate(
    fmpEstimateField(fmpNextEstimate, "revenueAvg", "estimatedRevenueAvg"),
    currentRevenue
  );
  const nextRevenue =
    fmpNextRevenueEstimate ??
    estimateNextValue(currentRevenue, firstNumber(fastGrowthRevenueRate, revenueGrowthRate));

  const fmpFollowingRevenueEstimate = sanitizeRevenueEstimate(
    fmpEstimateField(fmpFollowingEstimate, "revenueAvg", "estimatedRevenueAvg"),
    nextRevenue
  );
  const followingRevenue =
    fmpFollowingRevenueEstimate ??
    estimateDecayedForwardValue(nextRevenue, currentRevenueBase);
  const preliminaryMarketCap =
    fmpQuoteProfile.marketCap ??
    nasdaqData.marketCap ??
    yahooSupplementalData.marketCap ??
    (profile.marketCapitalization
      ? profile.marketCapitalization * 1000000
      : sharesOutstanding && quote.c
        ? sharesOutstanding * 1000000 * quote.c
      : null);
  const preliminarySharesOutstandingValue = normalizeSharesOutstandingMillions(
    firstNumber(
      sharesOutstanding,
      yahooSupplementalData.sharesOutstanding
        ? yahooSupplementalData.sharesOutstanding / 1000000
        : null,
      preliminaryMarketCap && quote.c
        ? preliminaryMarketCap / quote.c / 1000000
        : null
    ),
    preliminaryMarketCap,
    quote.c
  );

  const currentEarnings =
    firstNumber(
      currentEps && preliminarySharesOutstandingValue
        ? currentEps * preliminarySharesOutstandingValue * 1000000
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
      nextEps && preliminarySharesOutstandingValue
        ? nextEps * preliminarySharesOutstandingValue * 1000000
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
      followingEps && preliminarySharesOutstandingValue
        ? followingEps * preliminarySharesOutstandingValue * 1000000
        : null
    );

  const marketCap = preliminaryMarketCap;
  const sharesOutstandingValue = preliminarySharesOutstandingValue;
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
  const rawTrailingEpsValue = firstNumber(
    secAnnualMargins.trailingEps,
    yahooSupplementalData.trailingEps,
    metrics.epsTTM,
    metrics.epsInclExtraItemsTTM
  );
  const marketReportedPE = firstNumber(
    fmpStableValuation.pe,
    metrics.peTTM,
    stockAnalysisForecast.pe,
    yahooSupplementalData.pe,
    metrics.peNormalizedAnnual
  );
  const computedTrailingPE =
    rawTrailingEpsValue > 0 && quote.c
      ? quote.c / rawTrailingEpsValue
      : null;
  const trailingEpsValue =
    rawTrailingEpsValue > 0 &&
    quote.c &&
    marketReportedPE > 1 &&
    computedTrailingPE !== null &&
    computedTrailingPE < marketReportedPE * 0.25
      ? quote.c / marketReportedPE
      : rawTrailingEpsValue;
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
    marketReportedPE
  );
  if (
    !latestInterimPeRow &&
    reportedPE !== null &&
    Number.isFinite(reportedPE) &&
    Math.abs(reportedPE) < 1000
  ) {
    const annualPeRows = historicalPe.filter((row) => !row?.isInterim && !row?.isCurrent);
    const otherPeRows = [
      ...historicalPe.filter((row) => row?.isInterim || row?.isCurrent),
      {
        year: new Date().getFullYear(),
        period: "Current",
        isCurrent: true,
        pe: reportedPE,
        price: quote.c,
        eps: trailingEpsValue
      }
    ];
    historicalPe = mergeHistoricalPeRows(annualPeRows, otherPeRows);
  }
  const reportedForwardPE = firstNumber(
    stockAnalysisForecast.forwardPE,
    metrics.forwardPE,
    yahooSupplementalData.forwardPE,
    forwardEpsValue > 0 ? quote.c / forwardEpsValue : null
  );
  const pegRatio = firstNumber(
    fmpStableValuation.pegRatio,
    yahooSupplementalData.pegRatio,
    stockAnalysisForecast.pegRatio,
    metrics.forwardPEG,
    metrics.pegTTM
  );
  const revenueGrowth = firstFiniteNumber(
    fmpStableValuation.revenueGrowth,
    chartRevenueGrowth,
    secAnnualMargins.revenueGrowth,
    annualGrowth(latestAnnual.revenue, previousAnnual.revenue),
    yahooSupplementalData.revenueGrowth,
    metrics.revenueGrowthTTMYoy
  );
  const earningsGrowth = firstFiniteNumber(
    fmpStableValuation.earningsGrowth,
    chartEarningsGrowth,
    secAnnualMargins.earningsGrowth,
    annualGrowth(latestAnnual.earnings, previousAnnual.earnings),
    yahooSupplementalData.earningsGrowth,
    metrics.epsGrowthTTMYoy
  );
  const grossMargins = isFinancialCompany
    ? firstNumber(
        latestVisibleMarginRow.grossMargin,
        fmpStableValuation.grossMargins,
        secAnnualMargins.grossMargins,
        yahooSupplementalData.grossMargins
      )
    : firstNumber(
        latestVisibleMarginRow.grossMargin,
        fmpStableValuation.grossMargins,
        secAnnualMargins.grossMargins,
        metrics.grossMarginTTM,
        yahooSupplementalData.grossMargins,
        annualMargin(latestAnnual.grossProfit, latestAnnual.revenue)
      );
  const operatingMargins = isFinancialCompany
    ? firstNumber(
        latestVisibleMarginRow.operatingMargin,
        fmpStableValuation.operatingMargins,
        secAnnualMargins.operatingMargins,
        yahooSupplementalData.operatingMargins
      )
    : firstNumber(
        latestVisibleMarginRow.operatingMargin,
        fmpStableValuation.operatingMargins,
        secAnnualMargins.operatingMargins,
        metrics.operatingMarginTTM,
        yahooSupplementalData.operatingMargins,
        annualMargin(latestAnnual.operatingIncome, latestAnnual.revenue)
      );
  const profitMargins = firstNumber(
    latestVisibleMarginRow.profitMargin,
    fmpStableValuation.profitMargins,
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
  const pe = firstNumber(
    fmpStableValuation.pe,
    reportedPE,
    currentEpsValue ? quote.c / currentEpsValue : null
  );
  const forwardPE = firstNumber(
    reportedForwardPE,
    nextEpsValue ? quote.c / nextEpsValue : null
  );
  const priceToSales = firstNumber(
    fmpStableValuation.priceToSales,
    yahooSupplementalData.priceToSales,
    metrics.psTTM,
    metrics.psAnnual,
    modeledMarketCap && currentRevenueValue > 0
      ? modeledMarketCap / currentRevenueValue
      : null
  );
  const bookValuePerShare = normalizeBookValuePerShare(
    firstNumber(
      fmpStableValuation.bookValuePerShare,
      balanceSheetMetrics.bookValuePerShare,
      metrics.bookValuePerShareAnnual,
      metrics.bookValuePerShareQuarterly,
      yahooSupplementalData.bookValuePerShare
    ),
    quote.c,
    ticker
  );
  const priceToBook = firstNumber(
    fmpStableValuation.priceToBook,
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
        fmpStableValuation.operatingCashflow,
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
          fmpStableValuation.freeCashflow,
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
      fmpStableValuation.targetMean,
      fmpPriceTarget?.targetConsensus,
      fmpPriceTarget?.targetMean,
      fmpPriceTarget?.targetMedian,
      fmpPriceTarget?.targetAverage,
      fmpPriceTarget?.priceTarget,
      fmpPriceTarget?.targetPrice,
      yahooSupplementalData.targetMean,
      yahooSupplementalData.targetMedian,
      stockAnalysisForecast.targetMean,
      stockAnalysisForecast.targetMedian,
      nasdaqData.targetMean,
      priceTarget?.targetMean,
      priceTarget?.targetMedian,
      metrics.ptMean
    ),
    price: quote.c,
    revenueGrowth,
    earningsGrowth,
    forwardPE,
    pe
  });
  const recommendationKey = firstText(
    fmpStableValuation.recommendationKey,
    normalizeRating(rating),
    estimateRatingFallback(rating, targetMean, quote.c)
  );
  const analystRatingText = firstText(
    fmpStableValuation.analystRatingText,
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
    fmpQuoteProfile.dividendYield ??
      nasdaqData.dividendYield ?? (finnhubDividendYield !== null
      ? finnhubDividendYield / 100
      : yahooSupplementalData.dividendYield)
  );
  const fiftyTwoWeekHigh = firstNumber(
    fmpQuoteProfile.fiftyTwoWeekHigh,
    fmpFiftyTwoWeekRange.fiftyTwoWeekHigh,
    nasdaqData.fiftyTwoWeekHigh,
    yahooSupplementalData.fiftyTwoWeekHigh,
    metrics["52WeekHigh"],
    metrics["52WeekHighPrice"]
  );
  const fiftyTwoWeekLow = firstNumber(
    fmpQuoteProfile.fiftyTwoWeekLow,
    fmpFiftyTwoWeekRange.fiftyTwoWeekLow,
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

  const consensusCurrentRevenueValue = fmpCurrentRevenueEstimate;
  const consensusNextRevenueValue = fmpNextRevenueEstimate;
  const consensusCurrentEpsValue = fmpCurrentEpsEstimate;
  const consensusNextEpsValue = fmpNextEpsEstimate;
  const previousBalanceSheetAsOfMs = Date.parse(`${previousData?.balanceSheetAsOf || ""}T00:00:00Z`);
  const canReusePreviousBalanceSheetMetrics =
    previousData?.balanceSheetMetricsVersion === BALANCE_SHEET_METRICS_VERSION &&
    Number.isFinite(previousBalanceSheetAsOfMs) &&
    Date.now() - previousBalanceSheetAsOfMs <= 820 * 24 * 60 * 60 * 1000;
  const displayedCurrentRevenueValue = consensusCurrentRevenueValue;
  const displayedCurrentEpsValue = consensusCurrentEpsValue;
  const estimateSharesOutstanding = normalizeSharesOutstandingMillions(
    modeledSharesOutstanding,
    marketCap,
    quote.c
  );
  const displayedCurrentEarningsValue =
    toNumberOrNull(fmpEstimateField(fmpCurrentEstimate, "netIncomeAvg", "estimatedNetIncomeAvg")) ??
    (displayedCurrentEpsValue !== null && estimateSharesOutstanding
      ? displayedCurrentEpsValue * estimateSharesOutstanding * 1000000
      : null);
  const displayedNextRevenueValue = consensusNextRevenueValue;
  const displayedNextEpsValue = consensusNextEpsValue;
  const displayedNextEarningsValue =
    toNumberOrNull(fmpEstimateField(fmpNextEstimate, "netIncomeAvg", "estimatedNetIncomeAvg")) ??
    (displayedNextEpsValue !== null && estimateSharesOutstanding
      ? displayedNextEpsValue * estimateSharesOutstanding * 1000000
      : null);
  const employeeCountValue = firstFiniteNumber(fmpStableValuation.employeeCount, fmpQuoteProfile.employeeCount);
  const isFmpAdr = fmpQuoteProfile.isAdr === true;

  let data = preserveBankMargins(withGuaranteedAnalystSection({
    isFinancialCompany,
    bankMetrics: displayedBankMetrics,
    marginHistory,
    historicalPe,
    name: firstText(fmpQuoteProfile.name, profile.name, ticker),
    symbol: ticker,
    isAdr: isFmpAdr,
    currency: firstText(fmpQuoteProfile.currency, yahooSupplementalData.currency, quote.currency, previousData?.currency),
    financialCurrency: firstText(fmpQuoteProfile.financialCurrency, yahooSupplementalData.financialCurrency, yahooSupplementalData.currency, quote.currency, previousData?.financialCurrency),
    sourceFinancialCurrency: historicalFinancialCurrency || previousData?.sourceFinancialCurrency || null,
    sector: firstText(fmpQuoteProfile.sector, profile.gicsSector, profile.sector, yahooSupplementalData.sector, previousData?.sector),
    industry: firstText(fmpQuoteProfile.industry, profile.finnhubIndustry, profile.gicsSubIndustry, profile.industry, yahooSupplementalData.industry, previousData?.industry),
    ceo: firstText(fmpQuoteProfile.ceo, previousData?.ceo),
    country: firstText(fmpQuoteProfile.country, previousData?.country),
    exchange: firstText(fmpQuoteProfile.exchange, previousData?.exchange),
    exchangeFullName: firstText(fmpQuoteProfile.exchangeFullName, previousData?.exchangeFullName),
    description: firstText(fmpQuoteProfile.description, previousData?.description),
    website: firstText(fmpQuoteProfile.website, previousData?.website),
    executives: Array.isArray(fmpExecutives) && fmpExecutives.length
      ? fmpExecutives
      : Array.isArray(previousData?.executives)
        ? previousData.executives
        : [],
    logo: getFinnhubLogoUrl(ticker),
    price: quote.c,
    change: quote.d,
    percentChange: quote.dp,
    extendedHours: yahooSupplementalData.extendedHours || null,
    previousClose: quote.pc,
    high: firstFiniteNumber(fmpQuoteProfile.high, quote.h),
    low: firstFiniteNumber(fmpQuoteProfile.low, quote.l),
    open: firstFiniteNumber(fmpQuoteProfile.open, quote.o),
    beta: firstFiniteNumber(fmpQuoteProfile.beta),
    volume: firstFiniteNumber(fmpQuoteProfile.volume),
    lastDividend: firstFiniteNumber(fmpQuoteProfile.lastDividend),
    floatShares: firstFiniteNumber(fmpSharesFloat.floatShares, previousData?.floatShares),
    freeFloatShares: firstFiniteNumber(fmpSharesFloat.freeFloatShares, previousData?.freeFloatShares),
    freeFloatPercent: firstFiniteNumber(fmpSharesFloat.freeFloatPercent, previousData?.freeFloatPercent),
    floatSharesUpdatedAt: firstText(fmpSharesFloat.floatSharesUpdatedAt, previousData?.floatSharesUpdatedAt),
    sharesFloatSource: firstText(fmpSharesFloat.sharesFloatSource, previousData?.sharesFloatSource),
    dividendYield,
    fiftyTwoWeekHigh,
    fiftyTwoWeekLow,
    priceAvg50: firstFiniteNumber(fmpQuoteProfile.priceAvg50, fmpStableValuation.priceAvg50, previousData?.priceAvg50),
    priceAvg200: firstFiniteNumber(fmpQuoteProfile.priceAvg200, fmpStableValuation.priceAvg200, previousData?.priceAvg200),
    marketCap,
    totalCash: isFmpAdr ? null : toNumberOrNull(balanceSheetMetrics.totalCash),
    totalDebt: isFmpAdr ? null : toNumberOrNull(balanceSheetMetrics.totalDebt),
    cashAndCashEquivalents: isFmpAdr ? null : toNumberOrNull(balanceSheetMetrics.cashAndCashEquivalents ?? balanceSheetMetrics.totalCash),
    netCash: isFmpAdr ? null : toNumberOrNull(balanceSheetMetrics.netCash),
    netCashPerShare: isFmpAdr ? null : toNumberOrNull(balanceSheetMetrics.netCashPerShare),
    equityBookValue: isFmpAdr ? null : toNumberOrNull(balanceSheetMetrics.equityBookValue),
    bookValuePerShare: isFmpAdr ? null : firstFiniteNumber(
      fmpStableValuation.bookValuePerShare,
      balanceSheetMetrics.bookValuePerShare
    ),
    workingCapital: isFmpAdr ? null : firstFiniteNumber(
      balanceSheetMetrics.workingCapital,
      fmpStableValuation.workingCapital
    ),
    balanceSheetAsOf: isFmpAdr ? null : balanceSheetMetrics.balanceSheetAsOf || null,
    balanceSheetSource: isFmpAdr ? null : balanceSheetMetrics.balanceSheetSource || null,
    balanceSheetCheckedAt: isFmpAdr ? new Date().toISOString() : balanceSheetMetrics.balanceSheetCheckedAt || null,
    balanceSheetMetricsVersion: BALANCE_SHEET_METRICS_VERSION,
    priceToSales: toNumberOrNull(fmpStableValuation.priceToSales),
    priceToBook: toNumberOrNull(fmpStableValuation.priceToBook),
    sharesOutstanding: sharesOutstandingValue,
    pe: toNumberOrNull(fmpStableValuation.pe),
    forwardPE: toNumberOrNull(fmpStableValuation.forwardPE),
    forwardPS: toNumberOrNull(fmpStableValuation.forwardPS),
    priceToTangibleBook: toNumberOrNull(fmpStableValuation.priceToTangibleBook),
    priceToFreeCashflow: toNumberOrNull(fmpStableValuation.priceToFreeCashflow),
    priceToOperatingCashflow: toNumberOrNull(fmpStableValuation.priceToOperatingCashflow),
    pegRatio: toNumberOrNull(fmpStableValuation.pegRatio),
    pretaxMargin: toNumberOrNull(fmpStableValuation.pretaxMargin),
    ebitdaMargin: toNumberOrNull(fmpStableValuation.ebitdaMargin),
    ebitMargin: toNumberOrNull(fmpStableValuation.ebitMargin),
    fcfMargin: toNumberOrNull(fmpStableValuation.fcfMargin),
    returnOnEquity: toNumberOrNull(fmpStableValuation.returnOnEquity),
    returnOnAssets: toNumberOrNull(fmpStableValuation.returnOnAssets),
    returnOnInvestedCapital: toNumberOrNull(fmpStableValuation.returnOnInvestedCapital),
    returnOnCapitalEmployed: toNumberOrNull(fmpStableValuation.returnOnCapitalEmployed),
    weightedAverageCostOfCapital: toNumberOrNull(fmpStableValuation.weightedAverageCostOfCapital),
    revenuePerEmployee: toNumberOrNull(fmpStableValuation.revenuePerEmployee),
    profitsPerEmployee: toNumberOrNull(fmpStableValuation.profitsPerEmployee),
    employeeCount: employeeCountValue,
    valuationMetricsCheckedAt: new Date().toISOString(),
    valuationMetricsVersion: VALUATION_METRICS_VERSION,
    trailingEps: trailingEpsValue,
    forwardEps: forwardEpsValue,
    operatingCashflow: toNumberOrNull(fmpStableValuation.operatingCashflow),
    consensusCurrentYearEps: consensusCurrentEpsValue,
    consensusNextYearEps: consensusNextEpsValue,
    consensusCurrentYearRevenue: consensusCurrentRevenueValue,
    consensusNextYearRevenue: consensusNextRevenueValue,
    analystEstimateSource: "FMP annual analyst estimates",
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
    revenueGrowth: toNumberOrNull(fmpStableValuation.revenueGrowth),
    earningsGrowth: toNumberOrNull(fmpStableValuation.earningsGrowth),
    grossMargins,
    operatingMargins,
    profitMargins,
    freeCashflow: toNumberOrNull(fmpStableValuation.freeCashflow),
    targetMean: toNumberOrNull(fmpStableValuation.targetMean),
    recommendationKey: firstText(fmpStableValuation.recommendationKey),
    analystRatingText: firstText(fmpStableValuation.analystRatingText),
    analystUpdates: fmpMarketActivity?.analystUpdates?.length
      ? fmpMarketActivity.analystUpdates
      : previousData?.analystUpdates || [],
    institutionalHolders: fmpMarketActivity?.institutionalHolders?.length
      ? fmpMarketActivity.institutionalHolders
      : previousData?.institutionalHolders || [],
    insiderTransactions: fmpMarketActivity?.insiderTransactions?.length
      ? fmpMarketActivity.insiderTransactions
      : previousData?.insiderTransactions || [],
    marketActivityUpdatedAt: new Date().toISOString(),
    holderSummary: yahooSupplementalData.holderSummary || previousData?.holderSummary || {},
    analystTargets: yahooSupplementalData.analystTargets || previousData?.analystTargets || {},
    epsBeatMiss: buildEpsBeatMissSeries(
      mergeEpsBeatMissRows(previousData?.epsBeatMiss || [], epsSurprises),
      calendarQuarterEstimate
    ),
    analystEstimatesSource: "FMP",
    analystEstimatesSources: {
      nextQuarter: calendarQuarterEstimate.source || "FMP earnings history",
      currentYear: "FMP",
      nextYear: "FMP",
      followingYear: "FMP",
      futureYears: "FMP"
    },
    analystEstimates: {
      nextQuarter: {
        revenue: normalizeStatementDollars(calendarQuarterEstimate.revenue),
        earnings: null,
        eps: toNumberOrNull(calendarQuarterEstimate.eps),
        date: calendarQuarterEstimate.date || null,
        fiscalQuarter: calendarQuarterEstimate.fiscalQuarter || null,
        source: calendarQuarterEstimate.source || "FMP earnings history"
      },
      currentYear: {
        ...(fmpFutureYearEstimates[0] || {}),
        revenue: displayedCurrentRevenueValue,
        earnings: displayedCurrentEarningsValue,
        eps: displayedCurrentEpsValue
      },
      nextYear: {
        ...(fmpFutureYearEstimates[1] || {}),
        revenue: displayedNextRevenueValue,
        earnings: displayedNextEarningsValue,
        eps: displayedNextEpsValue
      },
      followingYear: {
        ...(fmpFutureYearEstimates[2] || {}),
        revenue: fmpFutureYearEstimates[2]?.revenue ?? null,
        earnings: fmpFutureYearEstimates[2]?.earnings ?? null,
        eps: fmpFutureYearEstimates[2]?.eps ?? null
      },
      futureYears: fmpFutureYearEstimates
    },
    quarterEstimateCheckedAt: new Date().toISOString(),
    estimateDataVersion: STOCK_ESTIMATE_VERSION,
    financialHistoryVersion: FINANCIAL_HISTORY_VERSION,
    financialHistoryCheckedAt: new Date().toISOString(),
    interimHistoryCheckedAt: new Date().toISOString(),
    interimHistoryVersion: INTERIM_HISTORY_VERSION,
    hasInterimHistory: revenueData.some((row) => row.isInterim),
    latestInterimPeriod: revenueData.findLast((row) => row.isInterim)?.period || null,
    revenueHistory,
    revenueData
  }), previousData);
  const fmpMetricCards = await resolveWithin(fetchFmpMetricCards(ticker), STOCK_PROVIDER_TIMEOUT_MS, {});
  data = applyFmpMetricCards(data, fmpMetricCards);
  data = await normalizeForeignAdrStockData(ticker, data);
  data = await normalizeForeignFinancialCurrencyStockData(ticker, data);

  await Stock.findOneAndUpdate(
    { ticker },
    {
      $set: {
        ticker,
        status: "ready",
        data,
        updatedAt: new Date()
      },
      $unset: {
        error: ""
      }
    },
    { upsert: true }
  );

  return finalizeStockMetricCardResponse(ticker, data);
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

async function publishFastFinancialHistorySnapshot(ticker) {
  const stock = await Stock.findOne({ ticker }).lean();
  const previousData = stock?.data || {};
  if (
    hasCompleteChartHistory({ data: previousData }) &&
    previousData.financialHistoryVersion === FINANCIAL_HISTORY_VERSION &&
    hasUsableInterimHistory(previousData) &&
    previousData.financialHistoryCheckedAt
  ) {
    return;
  }

  const fmpRows = await resolveWithin(fetchFmpFinancialHistory(ticker), 2200, []);
  const financialRows = Array.isArray(fmpRows) ? fmpRows : [];
  if (!Array.isArray(financialRows) || !financialRows.length) return;

  const revenueData = cleanFinancialHistoryRows(finalizeFinancialHistory(
    mergeHistoricalFinancials(financialRows, previousData.revenueData || [], Infinity),
    previousData.sharesOutstanding || null
  ));
  const checkedAt = new Date().toISOString();
  if (!hasAnyCoreChartHistory({ data: { ...previousData, revenueData, interimHistoryCheckedAt: checkedAt } })) {
    return;
  }

  const revenueHistory = revenueData
    .filter((row) => !row?.isInterim && !row?.isCurrent)
    .map((row) => ({
      year: row.year,
      revenue: row.revenue,
      earnings: row.earnings,
      eps: row.eps,
      source: row.source
    }));
  const marginPercent = (numerator, revenue) => {
    const numeratorNumber = toNumberOrNull(numerator);
    const revenueNumber = toNumberOrNull(revenue);
    return numeratorNumber !== null && revenueNumber ? (numeratorNumber / revenueNumber) * 100 : null;
  };
  const marginHistory = cleanFinancialHistoryRows(revenueData
    .map((row) => ({
      year: row.year,
      period: row.period || String(row.year),
      isInterim: Boolean(row.isInterim),
      grossMargin: marginPercent(row.grossProfit, row.revenue),
      operatingMargin: marginPercent(row.operatingIncome, row.revenue),
      profitMargin: marginPercent(row.earnings, row.revenue),
      source: row.source
    }))
    .filter((row) =>
      row.year &&
      (
        toNumberOrNull(row.grossMargin) !== null ||
        toNumberOrNull(row.operatingMargin) !== null ||
        toNumberOrNull(row.profitMargin) !== null
      )
    ));

  await Stock.findOneAndUpdate(
    { ticker },
    {
      $set: {
        "data.revenueData": revenueData,
        "data.revenueHistory": revenueHistory,
        "data.marginHistory": marginHistory.length ? marginHistory : previousData.marginHistory || [],
        "data.financialHistoryVersion": FINANCIAL_HISTORY_VERSION,
        "data.financialHistoryCheckedAt": checkedAt,
        "data.interimHistoryCheckedAt": checkedAt,
        "data.interimHistoryVersion": INTERIM_HISTORY_VERSION,
        "data.hasInterimHistory": revenueData.some((row) => row.isInterim),
        "data.latestInterimPeriod": revenueData.findLast((row) => row.isInterim)?.period || null
      }
    }
  );
}

async function hydrateQuarterlyHistoryForResponse(ticker, previousData = {}, timeoutMs = 1800) {
  if (hasUsableInterimHistory(previousData)) return previousData;

  const fmpRows = await resolveWithin(
    fetchFmpFinancialHistory(ticker),
    timeoutMs,
    []
  );
  const financialRows = Array.isArray(fmpRows) ? fmpRows : [];
  if (!financialRows.some((row) => row?.isInterim)) {
    return previousData;
  }

  const revenueData = cleanFinancialHistoryRows(finalizeFinancialHistory(
    mergeHistoricalFinancials(financialRows, previousData.revenueData || [], Infinity),
    previousData.sharesOutstanding || null
  ));
  if (interimHistoryPointCount({ revenueData }) < MIN_USABLE_INTERIM_HISTORY_ROWS) return previousData;

  const revenueHistory = revenueData
    .filter((row) => !row?.isInterim && !row?.isCurrent)
    .map((row) => ({
      year: row.year,
      revenue: row.revenue,
      earnings: row.earnings,
      eps: row.eps,
      source: row.source
    }));
  const marginPercent = (numerator, revenue) => {
    const numeratorNumber = toNumberOrNull(numerator);
    const revenueNumber = toNumberOrNull(revenue);
    return numeratorNumber !== null && revenueNumber ? (numeratorNumber / revenueNumber) * 100 : null;
  };
  const marginHistory = cleanFinancialHistoryRows(revenueData
    .map((row) => ({
      year: row.year,
      period: row.period || String(row.year),
      isInterim: Boolean(row.isInterim),
      grossMargin: marginPercent(row.grossProfit, row.revenue),
      operatingMargin: marginPercent(row.operatingIncome, row.revenue),
      profitMargin: marginPercent(row.earnings, row.revenue),
      source: row.source
    }))
    .filter((row) =>
      row.year &&
      (
        toNumberOrNull(row.grossMargin) !== null ||
        toNumberOrNull(row.operatingMargin) !== null ||
        toNumberOrNull(row.profitMargin) !== null
      )
    ));
  const checkedAt = new Date().toISOString();
  const nextData = {
    ...previousData,
    revenueData,
    revenueHistory,
    marginHistory: marginHistory.length ? marginHistory : previousData.marginHistory || [],
    financialHistoryVersion: FINANCIAL_HISTORY_VERSION,
    financialHistoryCheckedAt: checkedAt,
    interimHistoryCheckedAt: checkedAt,
    interimHistoryVersion: INTERIM_HISTORY_VERSION,
    hasInterimHistory: true,
    latestInterimPeriod: revenueData.findLast((row) => row.isInterim)?.period || null
  };

  Stock.findOneAndUpdate(
    { ticker },
    {
      $set: {
        status: hasFastRenderableOverview(nextData) ? "ready" : "pending",
        data: nextData,
        updatedAt: new Date()
      }
    }
  ).catch((err) => {
    console.log("Quarterly response hydration cache skipped:", ticker, err.message);
  });

  return nextData;
}

function startStockFetch(ticker) {
  if (activeStockFetches.has(ticker)) return;

  activeStockFetches.add(ticker);

  const chartFastHydration = publishFastFinancialHistorySnapshot(ticker).catch((err) => {
    console.log("Fast financial history snapshot skipped:", ticker, err.message);
  });
  const coreFastHydration = Promise.allSettled([
    chartFastHydration,
    publishFastStockSnapshot(ticker).catch((err) => {
      console.log("Fast stock snapshot skipped:", ticker, err.message);
    }),
    publishValuationMetricsSnapshot(ticker).catch((err) => {
      console.log("Valuation metrics snapshot skipped:", ticker, err.message);
    }),
    publishQuarterEstimateSnapshot(ticker).catch((err) => {
      console.log("Quarter estimate snapshot skipped:", ticker, err.message);
    }),
    publishEpsBeatMissSnapshot(ticker).catch((err) => {
      console.log("EPS beat/miss snapshot skipped:", ticker, err.message);
    }),
    publishHistoricalPeSnapshot(ticker).catch((err) => {
      console.log("Historical PE snapshot skipped:", ticker, err.message);
    }),
    publishBalanceSheetSnapshot(ticker).catch((err) => {
      console.log("Balance sheet snapshot skipped:", ticker, err.message);
    })
  ]);
  activeStockFastHydrations.set(ticker, coreFastHydration);
  enqueueMarketActivitySnapshot(ticker);

  coreFastHydration.finally(() => {
    setTimeout(() => {
      if (activeStockFastHydrations.get(ticker) === coreFastHydration) {
        activeStockFastHydrations.delete(ticker);
      }
    }, 15000);
  });

  coreFastHydration
    .then(() => markFastOverviewReady(ticker))
    .catch((err) => {
      console.log("Fast overview ready marker skipped:", ticker, err.message);
    })
    .finally(() => {
      activeStockFetches.delete(ticker);
      setTimeout(() => startFullStockRefresh(ticker), 1200);
    });
}

function enqueueMarketActivitySnapshot(ticker) {
  if (!ticker || queuedMarketActivityFetches.has(ticker)) return;
  if (marketActivityQueue.length >= 30) {
    const droppedTicker = marketActivityQueue.shift();
    if (droppedTicker) queuedMarketActivityFetches.delete(droppedTicker);
  }
  marketActivityQueue.push(ticker);
  queuedMarketActivityFetches.add(ticker);
  runMarketActivityQueue().catch((err) => {
    console.log("Market activity queue skipped:", err.message);
  });
}

function maybeEnqueueMarketActivitySnapshot(ticker, data = {}) {
  const lastCheckedAt = data.marketActivityUpdatedAt
    ? new Date(data.marketActivityUpdatedAt).getTime()
    : 0;
  const hasRows =
    (Array.isArray(data.analystUpdates) && data.analystUpdates.length) ||
    (Array.isArray(data.institutionalHolders) && data.institutionalHolders.length) ||
    (Array.isArray(data.insiderTransactions) && data.insiderTransactions.length);
  const checkedRecently =
    lastCheckedAt &&
    !Number.isNaN(lastCheckedAt) &&
    Date.now() - lastCheckedAt < (hasRows ? 15 * 60 * 1000 : 90 * 1000);

  if (!checkedRecently) {
    enqueueMarketActivitySnapshot(ticker);
  }
}

async function runMarketActivityQueue() {
  if (marketActivityWorkerRunning) return;
  marketActivityWorkerRunning = true;

  try {
    while (marketActivityQueue.length) {
      const ticker = marketActivityQueue.shift();
      queuedMarketActivityFetches.delete(ticker);
      await publishMarketActivitySnapshot(ticker).catch((err) => {
        console.log("Market activity snapshot skipped:", ticker, err.message);
      });
      await wait(500);
    }
  } finally {
    marketActivityWorkerRunning = false;
    if (marketActivityQueue.length) {
      runMarketActivityQueue().catch((err) => {
        console.log("Market activity queue skipped:", err.message);
      });
    }
  }
}

function startFullStockRefresh(ticker) {
  if (activeFullStockFetches.has(ticker)) return;
  activeFullStockFetches.add(ticker);

  Promise.resolve()
    .then(async () => {
      const stock = await Stock.findOne({ ticker }).lean().catch(() => null);
      const data = stock?.data || {};
      const hasFastOverviewData =
        data.financialHistoryVersion === FINANCIAL_HISTORY_VERSION &&
        data.valuationMetricsVersion === VALUATION_METRICS_VERSION &&
        data.balanceSheetMetricsVersion === BALANCE_SHEET_METRICS_VERSION &&
        data.estimateDataVersion === STOCK_ESTIMATE_VERSION &&
        hasCompleteChartHistory(stock) &&
        hasUsableInterimHistory(data);

      if (hasFastOverviewData) return null;
      return fetchStockData(ticker);
    })
    .catch(async (err) => {
      console.error(`Stock fetch failed for ${ticker}:`, err.message);
      await markStockFetchFailed(ticker, err);
    })
    .finally(() => {
      activeFullStockFetches.delete(ticker);
    });
}

async function getHydratedStockDataForFirstResponse(ticker, fallbackData = {}, waitMs = 2200, options = {}) {
  const waitForInterimHistory = options.waitForInterimHistory !== false;
  if (
    !waitForInterimHistory &&
    hasAnyCoreChartHistory({ data: fallbackData })
  ) {
    const hydratedStock = await Stock.findOne({ ticker }).lean().catch(() => null);
    const hydratedData = hydratedStock?.data || {};
    return {
      stock: hydratedStock,
      data: Object.keys(hydratedData).length ? hydratedData : fallbackData
    };
  }

  const deadline = Date.now() + waitMs;
  const hydration = activeStockFastHydrations.get(ticker);
  if (hydration) {
    await resolveWithin(hydration, waitMs, null);
  }

  let hydratedStock = await Stock.findOne({ ticker }).lean().catch(() => null);
  let hydratedData = hydratedStock?.data || {};
  if (
    waitMs > 0 &&
    waitForInterimHistory &&
    !hasUsableInterimHistory(fallbackData) &&
    !hasUsableInterimHistory(hydratedData)
  ) {
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 90));
      hydratedStock = await Stock.findOne({ ticker }).lean().catch(() => null);
      hydratedData = hydratedStock?.data || {};
      if (hasUsableInterimHistory(hydratedData)) break;
      if (
        hydratedData.interimHistoryVersion === INTERIM_HISTORY_VERSION &&
        hydratedData.interimHistoryCheckedAt
      ) {
        break;
      }
    }
  }
  const fallbackHasCharts = hasAnyCoreChartHistory({ data: fallbackData });
  const hydratedHasCharts = hasAnyCoreChartHistory({ data: hydratedData });
  const hydratedHasSupplemental =
    Boolean(hydratedData.quarterEstimateCheckedAt) ||
    Boolean(hydratedData.marketActivityUpdatedAt) ||
    Boolean(hydratedData.balanceSheetCheckedAt) ||
    Boolean(hydratedData.valuationMetricsCheckedAt);

  if (hydratedHasCharts || hydratedHasSupplemental || !fallbackHasCharts) {
    const selectedData = Object.keys(hydratedData).length ? hydratedData : fallbackData;
    const responseData = waitForInterimHistory && !hasUsableInterimHistory(selectedData)
      ? await hydrateQuarterlyHistoryForResponse(ticker, selectedData)
      : selectedData;
    return {
      stock: hydratedStock,
      data: responseData
    };
  }

  const responseData = waitForInterimHistory && !hasUsableInterimHistory(fallbackData)
    ? await hydrateQuarterlyHistoryForResponse(ticker, fallbackData)
    : fallbackData;
  return {
    stock: hydratedStock,
    data: responseData
  };
}

function getStockResponseError(data = {}, error = null) {
  if (
    hasAnyCoreChartHistory({ data }) ||
    hasCompleteChartHistory({ data }) ||
    hasCompleteSupplementalData({ data })
  ) {
    return null;
  }

  return error || null;
}

function normalizePeerSymbol(symbol) {
  return String(symbol || "")
    .trim()
    .toUpperCase()
    .replace(/\./g, "-");
}

function getFallbackSimilarSymbols(ticker, stockData = {}) {
  const normalizedTicker = normalizePeerSymbol(ticker);
  const direct = FALLBACK_SIMILAR_COMPANIES[normalizedTicker.replace(/-/g, "_")] || [];
  const industryText = `${stockData.sector || ""} ${stockData.industry || ""}`.toLowerCase();

  if (direct.length) return direct;
  if (industryText.includes("semiconductor")) return FALLBACK_SIMILAR_COMPANIES.NVDA;
  if (industryText.includes("restaurant")) return FALLBACK_SIMILAR_COMPANIES.CAKE;
  if (industryText.includes("beverage")) return FALLBACK_SIMILAR_COMPANIES.CELH;
  if (industryText.includes("software")) return FALLBACK_SIMILAR_COMPANIES.MSFT;
  if (industryText.includes("retail")) return FALLBACK_SIMILAR_COMPANIES.WMT;
  if (industryText.includes("auto")) return FALLBACK_SIMILAR_COMPANIES.AZO;
  if (industryText.includes("apparel") || industryText.includes("footwear")) return FALLBACK_SIMILAR_COMPANIES.NKE;
  if (industryText.includes("cosmetic") || industryText.includes("personal")) return FALLBACK_SIMILAR_COMPANIES.ELF;
  if (industryText.includes("cruise") || industryText.includes("travel")) return FALLBACK_SIMILAR_COMPANIES.CCL;
  if (industryText.includes("biotech") || industryText.includes("healthcare") || industryText.includes("medical")) return FALLBACK_SIMILAR_COMPANIES.TMO;
  if (industryText.includes("internet") || industryText.includes("cloud")) return FALLBACK_SIMILAR_COMPANIES.SNOW;

  return [];
}

async function fetchFmpSimilarCompanyPeers(ticker) {
  if (!process.env.FMP_API_KEY || !canUseFmp()) return [];
  const symbol = normalizePeerSymbol(ticker);
  if (!symbol) return [];

  try {
    const data = await getFmpData(symbol, "stock peers", [
      "/stable/stock-peers?symbol={ticker}"
    ]);
    const rows = Array.isArray(data) ? data : data ? [data] : [];
    return rows
      .map((row) => ({
        symbol: normalizePeerSymbol(row.symbol || row.ticker),
        name: firstText(row.companyName, row.name),
        price: firstFiniteNumber(row.price),
        marketCap: firstFiniteNumber(row.mktCap, row.marketCap)
      }))
      .filter((row) => row.symbol && row.symbol !== symbol);
  } catch (err) {
    setFmpCooldown(err, "stock peers", symbol);
    console.log("FMP stock peers skipped:", symbol, err.response?.status || err.message);
    return [];
  }
}

async function buildSimilarCompanyItem(symbol) {
  const normalizedSymbol = normalizePeerSymbol(symbol);
  const stock = await Stock.findOne({ ticker: normalizedSymbol }).lean().catch(() => null);
  const data = stock?.data || {};
  const cachedQuote = livePriceCache.get(normalizedSymbol) || {};

  return {
    symbol: normalizedSymbol,
    name: firstText(data.name, data.companyName, FALLBACK_COMPANY_NAMES[normalizedSymbol], normalizedSymbol),
    logo: firstText(data.logo, getFinnhubLogoUrl(normalizedSymbol)),
    sector: firstText(data.sector),
    industry: firstText(data.industry),
    price: firstFiniteNumber(cachedQuote.price, data.price),
    percentChange: firstFiniteNumber(cachedQuote.percentChange, data.percentChange),
    forwardPE: firstFiniteNumber(data.forwardPE, data.forwardPe, data.peForward),
    marketCap: firstFiniteNumber(data.marketCap)
  };
}

async function fetchSimilarCompanyQuote(symbol) {
  const cached = livePriceCache.get(symbol);
  if (
    cached &&
    toNumberOrNull(cached.price) !== null &&
    toNumberOrNull(cached.percentChange) !== null &&
    Date.now() - cached.fetchedAt < 45 * 1000
  ) {
    return cached;
  }

  let quote = null;
  let extendedHours = null;

  const fmpQuote = await resolveWithin(fetchFmpStableQuoteProfile(symbol), 1200, null).catch(() => null);
  if (fmpQuote && toNumberOrNull(fmpQuote.price) !== null) {
    quote = normalizeQuotePayload({}, {
      price: fmpQuote.price,
      change: fmpQuote.change,
      percentChange: fmpQuote.percentChange,
      previousClose: fmpQuote.previousClose,
      high: fmpQuote.high,
      low: fmpQuote.low,
      open: fmpQuote.open
    });
  }

  const quickData = await resolveWithin(fetchYahooQuickQuote(symbol), 1600, null).catch(() => null);
  if (quickData && (toNumberOrNull(quote?.c) === null || toNumberOrNull(quote?.dp) === null)) {
    extendedHours = quickData.extendedHours || null;
    quote = normalizeQuotePayload({}, quickData);
  }

  if (toNumberOrNull(quote?.c) === null || toNumberOrNull(quote?.dp) === null) {
    const yahooChartQuote = await resolveWithin(fetchYahooChartQuote(symbol), 1600, null).catch(() => null);
    if (!extendedHours && yahooChartQuote?.extendedHours) {
      extendedHours = yahooChartQuote.extendedHours;
    }
    quote = normalizeQuotePayload(quote || {}, {
      price: yahooChartQuote?.c,
      change: yahooChartQuote?.d,
      percentChange: yahooChartQuote?.dp,
      previousClose: yahooChartQuote?.pc,
      high: yahooChartQuote?.h,
      low: yahooChartQuote?.l,
      open: yahooChartQuote?.o
    });
  }

  if (toNumberOrNull(quote?.c) === null || toNumberOrNull(quote?.dp) === null) {
    const finnhubQuote = await resolveWithin(
      getFinnhub(`https://finnhub.io/api/v1/quote?symbol=${symbol}`),
      1600,
      null
    ).catch(() => null);
    quote = normalizeQuotePayload(quote || {}, {
      price: finnhubQuote?.c,
      change: finnhubQuote?.d,
      percentChange: finnhubQuote?.dp,
      previousClose: finnhubQuote?.pc,
      high: finnhubQuote?.h,
      low: finnhubQuote?.l,
      open: finnhubQuote?.o
    });
  }

  const price = toNumberOrNull(quote?.c);
  const previousClose = toNumberOrNull(quote?.pc);
  const providerChange = toNumberOrNull(quote?.d);
  const providerPercentChange = toNumberOrNull(quote?.dp);
  const computedChange =
    price !== null && previousClose > 0
      ? price - previousClose
      : null;
  const change = providerChange ?? computedChange;
  const percentChange = providerPercentChange ?? (
    computedChange !== null && previousClose > 0
      ? (computedChange / previousClose) * 100
      : null
  );

  if (price !== null && price > 0) {
    const nextQuote = {
      price,
      change,
      percentChange,
      previousClose,
      extendedHours,
      fetchedAt: Date.now()
    };
    livePriceCache.set(symbol, nextQuote);
    return nextQuote;
  }

  return cached || {};
}

async function fetchSimilarCompanyForwardPe(symbol) {
  const cached = similarCompanyMetricCache.get(symbol);
  if (cached && Date.now() - cached.fetchedAt < 6 * 60 * 60 * 1000) {
    return cached.forwardPE;
  }

  const [fmpValuation, metrics] = await Promise.all([
    resolveWithin(fetchFmpStableValuationMetrics(symbol), 1200, {}),
    resolveWithin(
      getFinnhub(`https://finnhub.io/api/v1/stock/metric?symbol=${symbol}&metric=all`),
      2200,
      null
    ).catch(() => null)
  ]);
  const forwardPE = firstFiniteNumber(fmpValuation?.forwardPE, metrics?.metric?.forwardPE, metrics?.metric?.peNormalizedAnnual);

  if (forwardPE !== null) {
    similarCompanyMetricCache.set(symbol, {
      forwardPE,
      fetchedAt: Date.now()
    });
  }

  return forwardPE;
}

async function hydrateSimilarCompaniesFast(companies) {
  const queue = [...companies];
  const workerCount = Math.min(4, queue.length);

  await resolveWithin(
    Promise.all(Array.from({ length: workerCount }, async () => {
      while (queue.length) {
        const company = queue.shift();
        if (!company?.symbol) continue;

        const [quote, forwardPE] = await Promise.all([
          toNumberOrNull(company.price) !== null && toNumberOrNull(company.percentChange) !== null
            ? Promise.resolve(null)
            : fetchSimilarCompanyQuote(company.symbol),
          toNumberOrNull(company.forwardPE) !== null
            ? Promise.resolve(null)
            : fetchSimilarCompanyForwardPe(company.symbol)
        ]);

        if (quote) {
          company.price = firstFiniteNumber(quote.price, company.price);
          company.percentChange = firstFiniteNumber(quote.percentChange, company.percentChange);
        }
        company.forwardPE = firstFiniteNumber(company.forwardPE, forwardPE);
      }
    })),
    5200,
    null
  );

  return companies;
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

  const wantsLiveQuotes = req.query.live === "1" || req.query.live === "true";
  const prices = {};
  const details = {};
  const savedStocks = await Stock.find({ ticker: { $in: symbols } })
    .select("ticker data.price data.change data.percentChange data.previousClose data.extendedHours data.logo data.name")
    .lean();
  const savedBySymbol = new Map(savedStocks.map((stock) => [stock.ticker, stock.data || {}]));

  const hydrateSavedSymbol = (symbol) => {
    const savedData = savedBySymbol.get(symbol) || {};
    const savedPrice = toNumberOrNull(savedData.price);
    const savedPreviousClose = toNumberOrNull(savedData.previousClose);
    const savedPercentChange = toNumberOrNull(savedData.percentChange);
    details[symbol] = {
      name: savedData.name || symbol,
      logo: savedData.logo || getFinnhubLogoUrl(symbol),
      change: toNumberOrNull(savedData.change),
      extendedHours: savedData.extendedHours || null,
      percentChange: !wantsLiveQuotes && savedPercentChange !== null
        ? savedPercentChange
        : !wantsLiveQuotes && savedPrice !== null && savedPreviousClose > 0
          ? ((savedPrice - savedPreviousClose) / savedPreviousClose) * 100
          : null
    };
    if (savedPrice !== null && savedPrice > 0) prices[symbol] = savedPrice;

    const cached = livePriceCache.get(symbol);
    if (cached) {
      prices[symbol] = cached.price;
      details[symbol] = {
        ...details[symbol],
        change: toNumberOrNull(cached.change) ?? details[symbol].change,
        extendedHours: cached.extendedHours || details[symbol].extendedHours,
        percentChange: toNumberOrNull(cached.percentChange) ?? details[symbol].percentChange
      };
    }
  };

  const refreshSymbolQuote = async (symbol) => {
    const cached = livePriceCache.get(symbol);
    const cachedHasPercent = toNumberOrNull(cached?.percentChange) !== null;
    if (cached && cachedHasPercent && Date.now() - cached.fetchedAt < 45 * 1000) return;

    try {
      const quickData = await resolveWithin(fetchYahooQuickQuote(symbol), 2500, null) || {};
      let quote = normalizeQuotePayload(
        {},
        quickData || {}
      );
      let extendedHours = quickData?.extendedHours || null;
      if (!quote || toNumberOrNull(quote.c) === null || toNumberOrNull(quote.dp) === null) {
        const yahooChartQuote = await resolveWithin(fetchYahooChartQuote(symbol), 2500, null);
        if (!extendedHours && yahooChartQuote?.extendedHours) {
          extendedHours = yahooChartQuote.extendedHours;
        }
        quote = normalizeQuotePayload(quote || {}, {
          price: yahooChartQuote?.c,
          change: yahooChartQuote?.d,
          percentChange: yahooChartQuote?.dp,
          previousClose: yahooChartQuote?.pc,
          high: yahooChartQuote?.h,
          low: yahooChartQuote?.l,
          open: yahooChartQuote?.o
        });
      }
      if (!quote || toNumberOrNull(quote.c) === null || toNumberOrNull(quote.dp) === null) {
        const finnhubQuote = await resolveWithin(
          getFinnhub(`https://finnhub.io/api/v1/quote?symbol=${symbol}`),
          2500,
          null
        );
        quote = normalizeQuotePayload(quote || {}, {
          price: finnhubQuote?.c,
          change: finnhubQuote?.d,
          percentChange: finnhubQuote?.dp,
          previousClose: finnhubQuote?.pc,
          high: finnhubQuote?.h,
          low: finnhubQuote?.l,
          open: finnhubQuote?.o
        });
      }
      const price = toNumberOrNull(quote?.c);
      const previousClose = toNumberOrNull(quote?.pc);
      const providerChange = toNumberOrNull(quote?.d);
      const providerPercentChange = toNumberOrNull(quote?.dp);
      const computedChange = price !== null && previousClose > 0
        ? price - previousClose
        : null;
      const change = providerChange ?? computedChange;
      const percentChange = providerPercentChange ?? (
        computedChange !== null && previousClose > 0
          ? (computedChange / previousClose) * 100
          : null
      );
      if (price !== null && price > 0) {
        prices[symbol] = price;
        livePriceCache.set(symbol, {
          price,
          change,
          percentChange,
          extendedHours,
          fetchedAt: Date.now()
        });
      }
      details[symbol] = {
        ...details[symbol],
        change: change ?? details[symbol].change,
        extendedHours: extendedHours || details[symbol].extendedHours,
        percentChange: percentChange ?? details[symbol].percentChange
      };
    } catch (err) {
      console.log("Saved-symbol price skipped:", symbol, err.response?.status || err.message);
    }
  };

  const runBackgroundQuoteRefresh = (refreshSymbols) => {
    const symbolsToRefresh = refreshSymbols.filter((symbol) => !activePriceRefreshes.has(symbol));
    if (!symbolsToRefresh.length) return;
    symbolsToRefresh.forEach((symbol) => activePriceRefreshes.add(symbol));

    const queue = [...symbolsToRefresh];
    const workerCount = Math.min(2, queue.length);
    Promise.all(Array.from({ length: workerCount }, async () => {
      while (queue.length) {
        const symbol = queue.shift();
        await refreshSymbolQuote(symbol);
      }
    })).finally(() => {
      symbolsToRefresh.forEach((symbol) => activePriceRefreshes.delete(symbol));
    });
  };

  symbols.forEach(hydrateSavedSymbol);

  const symbolsNeedingLive = symbols.filter((symbol) => {
    const cached = livePriceCache.get(symbol);
    return (
      wantsLiveQuotes ||
      toNumberOrNull(prices[symbol]) === null ||
      !cached ||
      toNumberOrNull(cached.percentChange) === null
    );
  });
  const queue = [...symbolsNeedingLive];
  const workerCount = Math.min(wantsLiveQuotes ? 5 : 4, queue.length);
  await resolveWithin(Promise.all(Array.from({ length: workerCount }, async () => {
    while (queue.length) {
      const symbol = queue.shift();
      await refreshSymbolQuote(symbol);
    }
  })), wantsLiveQuotes ? 6500 : 3200, null);
  symbols.forEach(hydrateSavedSymbol);

  const staleSymbols = symbols.filter((symbol) => {
    const cached = livePriceCache.get(symbol);
    return (
      !cached ||
      toNumberOrNull(cached.percentChange) === null ||
      Date.now() - cached.fetchedAt >= 45 * 1000
    );
  });
  runBackgroundQuoteRefresh(staleSymbols);

  res.json({ prices, details });
});

const hasCompleteHeatmapQuote = (company = {}) =>
  toNumberOrNull(company.price) !== null &&
  toNumberOrNull(company.percentChange) !== null;

function normalizeHeatmapCompanyQuote(company = {}, quote = {}) {
  const price = firstFiniteNumber(quote.price, quote.c, company.price);
  const marketCap = firstFiniteNumber(quote.marketCap, quote.mktCap, company.marketCap);
  const previousClose = firstFiniteNumber(quote.previousClose, quote.pc, company.previousClose);
  const providerChange = firstFiniteNumber(quote.change, quote.d, company.change);
  const computedChange = price !== null && previousClose > 0
    ? price - previousClose
    : null;
  const change = firstFiniteNumber(providerChange, computedChange);
  const percentChange = firstFiniteNumber(
    quote.percentChange,
    quote.dp,
    company.percentChange,
    change !== null && previousClose > 0 ? (change / previousClose) * 100 : null
  );

  return {
    ...company,
    price,
    marketCap,
    weight: marketCap ? Math.max(toNumberOrNull(company.weight) || 1, marketCap / 100000000000) : company.weight,
    change,
    previousClose,
    percentChange
  };
}

function buildMarketHeatmapPayload(companies, stale = false) {
  const sectorGroups = new Map();
  companies.forEach((company) => {
    const sector = company.sector || "Other";
    if (!sectorGroups.has(sector)) sectorGroups.set(sector, []);
    sectorGroups.get(sector).push(company);
  });

  const sectors = [...sectorGroups.entries()]
    .map(([name, rows]) => {
      const rowsWithChange = rows.filter((row) => toNumberOrNull(row.percentChange) !== null);
      const totalWeight = rowsWithChange.reduce((sum, row) => sum + (toNumberOrNull(row.weight) || 1), 0);
      const weightedChange = rowsWithChange.reduce(
        (sum, row) => sum + (toNumberOrNull(row.percentChange) || 0) * (toNumberOrNull(row.weight) || 1),
        0
      );
      return {
        name,
        count: rows.length,
        averagePercentChange: totalWeight > 0 ? weightedChange / totalWeight : null
      };
    })
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));

  const movers = companies
    .filter(hasCompleteHeatmapQuote)
    .sort((a, b) => toNumberOrNull(b.percentChange) - toNumberOrNull(a.percentChange));

  return {
    companies,
    sectors,
    topGainers: movers.slice(0, 8),
    topLosers: [...movers].reverse().slice(0, 8),
    updatedAt: new Date().toISOString(),
    stale
  };
}

const STOCK_ANALYSIS_HEADERS = {
  "User-Agent": "Mozilla/5.0 AppleWebKit/537.36 Chrome/124 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
};

const parseStockAnalysisMoney = (value) => {
  const text = String(value || "").trim();
  if (!text || /^n\/a$/i.test(text)) return null;
  const match = text.replace(/,/g, "").match(/^\$?(-?[\d.]+)\s*([KMBT])?$/i);
  if (!match) return parseApiNumber(text);
  const multipliers = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 };
  return Number(match[1]) * (multipliers[match[2]?.toUpperCase()] || 1);
};

const parseStockAnalysisPercent = (value) => {
  const parsed = parseApiNumber(value);
  return parsed === null ? null : parsed;
};

const parseStockAnalysisShares = (value) => parseApiNumber(value);

const readStockAnalysisRows = ($, tableIndex = 0) => {
  const rows = {};
  $("table").eq(tableIndex).find("tr").each((_, row) => {
    const cells = $(row).find("th,td").map((__, cell) => $(cell).text().trim()).get();
    if (cells.length >= 2) rows[cells[0]] = cells[1];
  });
  return rows;
};

const parseEmbeddedStockAnalysisPairs = (html, arrayName, keyName = "n", valueName = "w") => {
  const match = String(html || "").match(new RegExp(`${arrayName}:\\[(.*?)\\](?:,|})`));
  if (!match) return [];
  return [...match[1].matchAll(new RegExp(`\\{[^}]*${keyName}:"([^"]+)"[^}]*${valueName}:(-?[\\d.]+)`, "g"))]
    .map((item) => ({
      name: item[1],
      weight: parseApiNumber(item[2])
    }))
    .filter((item) => item.name && item.weight !== null);
};

const inferStockAnalysisAssetAllocation = (html, sectors = [], holdings = []) => {
  const explicit = parseEmbeddedStockAnalysisPairs(html, "asset_allocation", "key", "value");
  if (explicit.length) return explicit;

  const source = String(html || "");
  if (!/asset_allocation:null/.test(source)) return [];

  if (sectors.length) {
    return [{ name: "Stocks", weight: 100 }];
  }

  const holdingText = (Array.isArray(holdings) ? holdings : [])
    .slice(0, 10)
    .map((holding) => `${holding.name || ""} ${holding.symbol || ""}`)
    .join(" ");
  if (/\b(treasury|bond|note|bill|mktliq|mortgage|agency|credit|income)\b/i.test(holdingText)) {
    return [{ name: "Bonds", weight: 100 }];
  }

  return [];
};

const parseEmbeddedStockAnalysisCountries = (html) => {
  const match = String(html || "").match(/countries:\[(.*?)\](?:,|})/);
  if (!match) return [];
  return [...match[1].matchAll(/\{[^}]*weight:(-?[\d.]+)[^}]*country:"([^"]+)"/g)]
    .map((item) => ({
      name: item[2],
      weight: parseApiNumber(item[1])
    }))
    .filter((item) => item.name && item.weight !== null);
};

const parseEmbeddedStockAnalysisHoldingsMeta = (html) => {
  const source = String(html || "");
  const count = source.match(/(?:infoTable|holdingsTable):\{[^}]*count:(\d+)/)?.[1];
  const top10 = source.match(/(?:infoTable|holdingsTable):\{[^}]*top10:([\d.]+)/)?.[1];
  const lastUpdated = source.match(/(?:lastUpdated|updated):"([^"]+)"/)?.[1];
  const asOf = source.match(/date:"([^"]+)"/)?.[1];
  return {
    count: parseApiNumber(count),
    top10Percent: parseApiNumber(top10),
    asOf: asOf || lastUpdated || null,
    lastUpdated: lastUpdated || null
  };
};

const parseEmbeddedStockAnalysisQuoteValue = (html, key) => {
  const quoteBlock = String(html || "").match(/quote:\{([^}]+)\}/)?.[1] || "";
  const match = quoteBlock.match(new RegExp(`(?:^|,)${key}:([^,}]+)`));
  return parseApiNumber(match?.[1]);
};

const parseEmbeddedStockAnalysisQuoteString = (html, key) => {
  const quoteBlock = String(html || "").match(/quote:\{([^}]+)\}/)?.[1] || "";
  return quoteBlock.match(new RegExp(`(?:^|,)${key}:"([^"]+)"`))?.[1] || null;
};

const cleanEtfDescription = (text) =>
  String(text || "").replace(/^Fund Home Page\s+/i, "").trim();

const cleanStockAnalysisFundDescription = (text) => {
  const cleaned = cleanEtfDescription(text)
    .replace(/\s+/g, " ")
    .trim();
  if (/^get the latest\b/i.test(cleaned)) return "";
  return cleaned;
};

const readStockAnalysisAboutDescription = ($, symbol) => {
  let description = "";
  const normalizedSymbol = String(symbol || "").trim().toUpperCase();

  $("h2").each((_, heading) => {
    if (description) return;
    const headingText = $(heading).text().replace(/\s+/g, " ").trim();
    if (headingText !== `About ${normalizedSymbol}`) return;

    description =
      $(heading).parent().nextAll("p").first().text().trim() ||
      $(heading).nextAll("p").first().text().trim();
  });

  return cleanStockAnalysisFundDescription(description);
};

const parseStockAnalysisFundHoldings = ($) =>
  $("table").first().find("tbody tr").map((_, row) => {
    const cells = $(row).find("td").map((__, cell) => $(cell).text().trim()).get();
    if (cells.length < 4) return null;
    return {
      rank: parseApiNumber(cells[0]),
      symbol: String(cells[1] || "").replace(/^\$/, "").replace(/\./g, "-").toUpperCase(),
      name: cells[2],
      weight: parseStockAnalysisPercent(cells[3]),
      shares: parseStockAnalysisShares(cells[4])
    };
  }).get().filter(Boolean);

async function fetchStockAnalysisMutualFundData(ticker, upstreamError = null) {
  const symbol = String(ticker || "").trim().toUpperCase();
  if (!canUseStockAnalysis()) {
    throw upstreamError || new Error("StockAnalysis cooldown active");
  }
  const stockAnalysisSymbol = normalizeTickerForStockAnalysis(symbol);
  const [overviewResponse, holdingsResponse] = await Promise.all([
    axios.get(`https://stockanalysis.com/quote/mutf/${stockAnalysisSymbol}/`, {
      headers: STOCK_ANALYSIS_HEADERS,
      timeout: 6500
    }),
    axios.get(`https://stockanalysis.com/quote/mutf/${stockAnalysisSymbol}/holdings/`, {
      headers: STOCK_ANALYSIS_HEADERS,
      timeout: 6500
    }).catch(() => ({ data: "" }))
  ]).catch((err) => {
    setStockAnalysisCooldown(err, "mutual fund data", symbol);
    throw upstreamError || err;
  });

  const overviewHtml = overviewResponse.data || "";
  const holdingsHtml = holdingsResponse.data || "";
  const $ = cheerio.load(overviewHtml);
  const holdingsPage = cheerio.load(holdingsHtml);
  const summaryRows = readStockAnalysisRows($, 0);
  const performanceRows = readStockAnalysisRows($, 1);
  const h1 = $("h1").first().text().trim();
  const h1Match = h1.match(/^(.*?)\s*\(([^)]+)\)$/);
  const name = h1Match?.[1] || h1 || symbol;
  const price = firstFiniteNumber(
    parseEmbeddedStockAnalysisQuoteValue(overviewHtml, "p"),
    parseStockAnalysisMoney(performanceRows["Previous Close"])
  );
  const change = parseEmbeddedStockAnalysisQuoteValue(overviewHtml, "c");
  const percentChange = parseEmbeddedStockAnalysisQuoteValue(overviewHtml, "cp");
  const holdings = parseStockAnalysisFundHoldings(holdingsPage);
  const overviewHoldings = $("table").eq(4).find("tbody tr").map((_, row) => {
    const cells = $(row).find("td").map((__, cell) => $(cell).text().trim()).get();
    if (cells.length < 3) return null;
    return {
      symbol: String(cells[1] || "").replace(/^\$/, "").replace(/\./g, "-").toUpperCase(),
      name: cells[0],
      weight: parseStockAnalysisPercent(cells[2])
    };
  }).get().filter(Boolean);
  const selectedHoldings = holdings.length ? holdings : overviewHoldings;
  const sectors = parseEmbeddedStockAnalysisPairs(holdingsHtml, "sectors");
  const countries = parseEmbeddedStockAnalysisCountries(holdingsHtml);
  const assetAllocation = inferStockAnalysisAssetAllocation(holdingsHtml, sectors, selectedHoldings);
  const holdingsMeta = parseEmbeddedStockAnalysisHoldingsMeta(overviewHtml);
  const holdingsPageMeta = parseEmbeddedStockAnalysisHoldingsMeta(holdingsHtml);
  const provider = holdingsHtml.match(/provider:"([^"]+)"/)?.[1] || "";
  const description =
    readStockAnalysisAboutDescription($, symbol) ||
    cleanStockAnalysisFundDescription($("meta[name='description']").attr("content") || "");
  const data = {
    symbol,
    name,
    type: "Mutual Fund",
    price,
    change,
    percentChange,
    currency: "USD",
    updatedAt: new Date().toISOString(),
    source: "StockAnalysis mutual fund data",
    description,
    stats: {
      assets: parseStockAnalysisMoney(summaryRows["Fund Assets"]),
      expenseRatio: parseStockAnalysisPercent(summaryRows["Expense Ratio"]),
      peRatio: null,
      dividend: parseStockAnalysisMoney(summaryRows["Dividend (ttm)"]),
      dividendYield: parseStockAnalysisPercent(summaryRows["Dividend Yield"]),
      dividendGrowth: parseStockAnalysisPercent(summaryRows["Dividend Growth"]),
      payoutFrequency: summaryRows["Payout Frequency"] || null,
      exDividendDate: summaryRows["Ex-Dividend Date"] || null,
      turnover: parseStockAnalysisPercent(summaryRows.Turnover),
      volume: null,
      previousClose: parseStockAnalysisMoney(performanceRows["Previous Close"]),
      ytdReturn: parseStockAnalysisPercent(performanceRows["YTD Return"]),
      oneYearReturn: parseStockAnalysisPercent(performanceRows["1-Year Return"]),
      fiveYearReturn: parseStockAnalysisPercent(performanceRows["5-Year Return"]),
      fiftyTwoWeekLow: parseStockAnalysisMoney(performanceRows["52-Week Low"]),
      fiftyTwoWeekHigh: parseStockAnalysisMoney(performanceRows["52-Week High"]),
      beta: parseApiNumber(performanceRows["Beta (5Y)"]),
      holdingsCount: parseApiNumber(performanceRows.Holdings) || holdingsMeta.count || holdingsPageMeta.count,
      inceptionDate: performanceRows["Inception Date"] || null,
      top10Percent: holdingsMeta.top10Percent || holdingsPageMeta.top10Percent,
      minimumInitialInvestment: parseStockAnalysisMoney(summaryRows["Min. Investment"]),
      minimumIncrementalInvestment: null,
      pricingFrequency: null,
      shareClass: null,
      distributionFrequency: summaryRows["Payout Frequency"] || null,
      lastTradeDate: parseEmbeddedStockAnalysisQuoteString(overviewHtml, "td")
    },
    profile: {
      assetClass: "Mutual Fund",
      category: summaryRows.Category || overviewHtml.match(/fundCategory:"([^"]+)"/)?.[1] || "",
      region: "",
      exchange: "MUTF",
      provider,
      indexTracked: ""
    },
    holdings: selectedHoldings,
    sectors,
    countries,
    assetAllocation,
    holdingsAsOf: holdingsMeta.asOf || holdingsPageMeta.asOf,
    holdingsLastUpdated: holdingsMeta.lastUpdated || holdingsPageMeta.lastUpdated
  };

  etfDataCache.set(symbol, { data, fetchedAt: Date.now() });
  return data;
}

const normalizeYahooFundHolding = (holding, index) => ({
  rank: index + 1,
  symbol: String(holding?.symbol || "").replace(/^\$/, "").replace(/\./g, "-").toUpperCase(),
  name: holding?.holdingName || holding?.name || holding?.symbol || "Holding",
  weight: parseApiNumber(holding?.holdingPercent) !== null
    ? parseApiNumber(holding.holdingPercent) * 100
    : parseApiNumber(holding?.weight),
  shares: null
});

const normalizeYahooFundExposure = (rows = [], nameKey = "categoryName", weightKey = "equityPosition") =>
  (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      name: row?.[nameKey] || row?.category || row?.name,
      weight: parseApiNumber(row?.[weightKey]) !== null
        ? parseApiNumber(row?.[weightKey]) * 100
        : parseApiNumber(row?.weight)
    }))
    .filter((row) => row.name && row.weight !== null);

async function fetchNasdaqFundFallback(ticker, upstreamError = null) {
  const symbol = String(ticker || "").trim().toUpperCase();
  const headers = {
    "User-Agent": STOCK_ANALYSIS_HEADERS["User-Agent"],
    Accept: "application/json",
    Origin: "https://www.nasdaq.com",
    Referer: "https://www.nasdaq.com/"
  };
  const [infoResponse, summaryResponse] = await Promise.all([
    axios.get(`https://api.nasdaq.com/api/quote/${symbol}/info`, {
      params: { assetclass: "mutualfunds" },
      headers,
      timeout: 6500,
      validateStatus: () => true
    }),
    axios.get(`https://api.nasdaq.com/api/quote/${symbol}/summary`, {
      params: { assetclass: "mutualfunds" },
      headers,
      timeout: 6500,
      validateStatus: () => true
    }).catch(() => ({ data: null }))
  ]);
  const info = infoResponse.data?.data;
  if (!info?.symbol) throw upstreamError || new Error("Fund data unavailable");
  const primary = info.primaryData || {};
  const summary = summaryResponse.data?.data?.summaryData || {};
  const readSummary = (key) => {
    const value = summary?.[key]?.value;
    return value && !/^n\/a$/i.test(String(value)) ? value : null;
  };
  const price = parseApiNumber(primary.lastSalePrice);
  const change = parseApiNumber(primary.netChange);
  const percentChange = parseApiNumber(primary.percentageChange);
  const data = {
    symbol,
    name: info.companyName || symbol,
    type: readSummary("InstrumentType") || info.stockType || "Mutual Fund",
    price,
    change,
    percentChange,
    currency: primary.currency || readSummary("Currency") || "USD",
    updatedAt: new Date().toISOString(),
    source: "Nasdaq mutual fund data",
    description: "Mutual fund quote and profile data from Nasdaq Fund Network. Holdings are shown when a fund provider source makes them available.",
    stats: {
      assets: null,
      expenseRatio: parseStockAnalysisPercent(readSummary("NetExpenseRatio")),
      peRatio: null,
      dividendYield: null,
      volume: parseApiNumber(primary.volume),
      previousClose: price !== null && change !== null ? price - change : null,
      fiftyTwoWeekLow: null,
      fiftyTwoWeekHigh: null,
      beta: null,
      holdingsCount: null,
      inceptionDate: readSummary("NAVInceptionDate"),
      top10Percent: null,
      minimumInitialInvestment: parseStockAnalysisMoney(readSummary("MinimumInitialSubscription")),
      minimumIncrementalInvestment: parseStockAnalysisMoney(readSummary("MinimumIncrementalSubscription")),
      pricingFrequency: readSummary("PricingFrequency"),
      shareClass: readSummary("ShareClass"),
      distributionFrequency: readSummary("DistributionTypeAndFrequency"),
      lastTradeDate: primary.lastTradeTimestamp || null
    },
    profile: {
      assetClass: readSummary("InstrumentType") || "Mutual Fund",
      category: readSummary("Category") || "",
      region: "",
      exchange: info.exchange || "",
      provider: "",
      indexTracked: readSummary("InvestorType") || ""
    },
    holdings: [],
    sectors: [],
    countries: [],
    assetAllocation: [],
    holdingsAsOf: null,
    holdingsLastUpdated: primary.lastTradeTimestamp || null
  };

  etfDataCache.set(symbol, { data, fetchedAt: Date.now() });
  return data;
}

async function fetchYahooFundFallback(ticker, stockAnalysisError = null) {
  const symbol = String(ticker || "").trim().toUpperCase();
  const chartResponse = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`, {
    params: { range: "1mo", interval: "1d" },
    headers: { "User-Agent": STOCK_ANALYSIS_HEADERS["User-Agent"] },
    timeout: 6500
  }).catch((err) => {
    throw err;
  });
  const chart = chartResponse.data?.chart?.result?.[0];
  const meta = chart?.meta || {};
  if (!meta.symbol && !meta.regularMarketPrice) throw stockAnalysisError || new Error("Fund data unavailable");

  const timestamps = Array.isArray(chart?.timestamp) ? chart.timestamp : [];
  const closes = chart?.indicators?.quote?.[0]?.close || [];
  const lastClose = [...closes].reverse().find((value) => parseApiNumber(value) !== null);
  const previousClose = firstFiniteNumber(
    parseApiNumber(meta.chartPreviousClose),
    closes.length > 1 ? parseApiNumber(closes[closes.length - 2]) : null
  );
  const price = firstFiniteNumber(parseApiNumber(meta.regularMarketPrice), parseApiNumber(lastClose));
  const change = price !== null && previousClose !== null ? price - previousClose : null;
  const percentChange = price !== null && previousClose ? (change / previousClose) * 100 : null;

  const summary = await resolveWithin(
    yahooFinance.quoteSummary(symbol, {
      modules: ["summaryProfile", "topHoldings", "fundProfile", "price", "summaryDetail", "defaultKeyStatistics"]
    }).catch(() => null),
    2500,
    null
  );
  const topHoldings = summary?.topHoldings || {};
  const fundProfile = summary?.fundProfile || {};
  const summaryDetail = summary?.summaryDetail || {};
  const priceSummary = summary?.price || {};
  const stats = summary?.defaultKeyStatistics || {};
  const annualExpenseRatio = firstFiniteNumber(
    parseApiNumber(fundProfile.annualReportExpenseRatio),
    parseApiNumber(summaryDetail.annualReportExpenseRatio)
  );
  const holdings = (topHoldings.holdings || []).map(normalizeYahooFundHolding).filter((holding) => holding.name);
  const bondHoldings = topHoldings.bondHoldings || {};
  const assetAllocation = [
    ["Cash", topHoldings.cashPosition],
    ["Stocks", topHoldings.stockPosition],
    ["Bonds", topHoldings.bondPosition],
    ["Preferred", topHoldings.preferredPosition],
    ["Convertible", topHoldings.convertiblePosition],
    ["Other", topHoldings.otherPosition]
  ]
    .map(([name, value]) => ({
      name,
      weight: parseApiNumber(value) !== null ? parseApiNumber(value) * 100 : null
    }))
    .filter((row, index, rows) =>
      row.weight !== null &&
      rows.findIndex((item) => item.name === row.name) === index
    );

  const data = {
    symbol,
    name: meta.longName || meta.shortName || priceSummary.longName || priceSummary.shortName || symbol,
    type: String(meta.instrumentType || "Fund").toUpperCase() === "MUTUALFUND" ? "Mutual Fund" : (meta.instrumentType || "Fund"),
    price,
    change,
    percentChange,
    currency: meta.currency || priceSummary.currency || "USD",
    updatedAt: new Date().toISOString(),
    source: "Yahoo fund chart data",
    description: summary?.summaryProfile?.longBusinessSummary || "Fund profile data is limited, but price and NAV data are available from the latest market feed.",
    stats: {
      assets: parseApiNumber(summaryDetail.totalAssets),
      expenseRatio: annualExpenseRatio !== null ? annualExpenseRatio * 100 : null,
      peRatio: parseApiNumber(topHoldings.equityHoldings?.priceToEarnings),
      dividendYield: parseApiNumber(summaryDetail.yield) !== null ? parseApiNumber(summaryDetail.yield) * 100 : null,
      volume: parseApiNumber(meta.regularMarketVolume),
      previousClose,
      fiftyTwoWeekLow: parseApiNumber(meta.fiftyTwoWeekLow),
      fiftyTwoWeekHigh: parseApiNumber(meta.fiftyTwoWeekHigh),
      beta: parseApiNumber(stats.beta),
      holdingsCount: parseApiNumber(topHoldings.holdings?.length) || null,
      inceptionDate: meta.firstTradeDate ? new Date(meta.firstTradeDate * 1000).toISOString().slice(0, 10) : null,
      top10Percent: holdings.reduce((sum, holding) => sum + (holding.weight || 0), 0) || null,
      bondDuration: parseApiNumber(bondHoldings.duration),
      bondMaturity: parseApiNumber(bondHoldings.maturity),
      bondCreditQuality: bondHoldings.creditQuality || null
    },
    profile: {
      assetClass: fundProfile.categoryName || (String(meta.instrumentType || "").toUpperCase() === "MUTUALFUND" ? "Mutual Fund" : meta.instrumentType || "Fund"),
      category: fundProfile.categoryName || summary?.summaryProfile?.category || "",
      region: "",
      exchange: meta.fullExchangeName || meta.exchangeName || "",
      provider: fundProfile.family || "",
      indexTracked: fundProfile.legalType || ""
    },
    holdings,
    sectors: normalizeYahooFundExposure(topHoldings.sectorWeightings, "categoryName", "equityPosition"),
    countries: [],
    assetAllocation,
    holdingsAsOf: null,
    holdingsLastUpdated: timestamps.length ? new Date(timestamps[timestamps.length - 1] * 1000).toISOString().slice(0, 10) : null
  };

  etfDataCache.set(symbol, { data, fetchedAt: Date.now() });
  return data;
}

async function fetchEtfData(ticker) {
  const symbol = String(ticker || "").trim().toUpperCase();
  const stockAnalysisSymbol = normalizeTickerForStockAnalysis(symbol);
  const cached = etfDataCache.get(symbol);
  if (cached && Date.now() - cached.fetchedAt < 60 * 60 * 1000) return cached.data;
  if (!canUseStockAnalysis()) {
    try {
      return await fetchNasdaqFundFallback(symbol, new Error("StockAnalysis cooldown active"));
    } catch (fundErr) {
      return fetchYahooFundFallback(symbol, fundErr);
    }
  }

  let overviewResponse;
  let holdingsResponse;
  try {
    [overviewResponse, holdingsResponse] = await Promise.all([
    axios.get(`https://stockanalysis.com/etf/${stockAnalysisSymbol}/`, {
      headers: STOCK_ANALYSIS_HEADERS,
      timeout: 6500
    }),
    axios.get(`https://stockanalysis.com/etf/${stockAnalysisSymbol}/holdings/`, {
      headers: STOCK_ANALYSIS_HEADERS,
      timeout: 6500
    }).catch(() => ({ data: "" }))
    ]);
  } catch (err) {
    setStockAnalysisCooldown(err, "ETF data", symbol);
    try {
      return await fetchStockAnalysisMutualFundData(symbol, err);
    } catch (stockAnalysisFundErr) {
      try {
        return await fetchNasdaqFundFallback(symbol, stockAnalysisFundErr);
      } catch (fundErr) {
        return fetchYahooFundFallback(symbol, fundErr);
      }
    }
  }

  const overviewHtml = overviewResponse.data || "";
  const holdingsHtml = holdingsResponse.data || "";
  const $ = cheerio.load(overviewHtml);
  const holdingsPage = cheerio.load(holdingsHtml);
  const summaryRows = readStockAnalysisRows($, 0);
  const tradingRows = readStockAnalysisRows($, 1);
  const h1 = $("h1").first().text().trim();
  const h1Match = h1.match(/^(.*?)\s*\(([^)]+)\)$/);
  const name = h1Match?.[1] || h1 || symbol;
  const price = firstFiniteNumber(parseEmbeddedStockAnalysisQuoteValue(overviewHtml, "p"), parseStockAnalysisMoney($("main").text().match(/\b\d+\.\d{2}\b/)?.[0]));
  const change = parseEmbeddedStockAnalysisQuoteValue(overviewHtml, "c");
  const percentChange = parseEmbeddedStockAnalysisQuoteValue(overviewHtml, "cp");

  const aboutText = $("body").text().replace(/\s+/g, " ");
  const profileText = aboutText.slice(Math.max(0, aboutText.indexOf(`About ${symbol}`)));
  const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const readAbout = (label, nextLabel) => {
    const pattern = nextLabel
      ? new RegExp(`${escapeRegex(label)}\\s+(.+?)\\s+${escapeRegex(nextLabel)}`)
      : new RegExp(`${escapeRegex(label)}\\s+(.+?)\\s*(?:Top 10 Holdings|Dividend History|Performance|News|$)`);
    return profileText.match(pattern)?.[1]?.trim() || "";
  };
  const readProfileField = (label) => {
    let value = "";
    $("span").each((_, span) => {
      if (value) return;
      const spanText = $(span).text().trim();
      if (spanText !== label) return;
      const parentText = $(span).parent().text().replace(/\s+/g, " ").trim();
      value = parentText.replace(new RegExp(`^${escapeRegex(label)}\\s*`), "").trim();
    });
    return value;
  };
  const providerFromSchema = (() => {
    let provider = "";
    $("script[type='application/ld+json']").each((_, script) => {
      if (provider) return;
      try {
        const json = JSON.parse($(script).text());
        provider = json?.provider?.name || "";
      } catch {
        provider = "";
      }
    });
    return provider;
  })();

  const holdings = holdingsPage("table").first().find("tbody tr").map((_, row) => {
    const cells = holdingsPage(row).find("td").map((__, cell) => holdingsPage(cell).text().trim()).get();
    if (cells.length < 4) return null;
    return {
      rank: parseApiNumber(cells[0]),
      symbol: String(cells[1] || "").replace(/^\$/, "").replace(/\./g, "-").toUpperCase(),
      name: cells[2],
      weight: parseStockAnalysisPercent(cells[3]),
      shares: parseStockAnalysisShares(cells[4])
    };
  }).get().filter(Boolean);

  const overviewTopHoldings = $("table").eq(2).find("tbody tr").map((_, row) => {
    const cells = $(row).find("td").map((__, cell) => $(cell).text().trim()).get();
    if (cells.length < 3) return null;
    return {
      symbol: String(cells[1] || "").replace(/^\$/, "").replace(/\./g, "-").toUpperCase(),
      name: cells[0],
      weight: parseStockAnalysisPercent(cells[2])
    };
  }).get().filter(Boolean);

  const selectedHoldings = holdings.length ? holdings : overviewTopHoldings;
  const sectors = parseEmbeddedStockAnalysisPairs(holdingsHtml, "sectors");
  const countries = parseEmbeddedStockAnalysisCountries(holdingsHtml);
  const assetAllocation = inferStockAnalysisAssetAllocation(holdingsHtml, sectors, selectedHoldings);
  const holdingsMeta = parseEmbeddedStockAnalysisHoldingsMeta(holdingsHtml);
  const data = {
    symbol,
    name,
    type: "ETF",
    price,
    change,
    percentChange,
    currency: "USD",
    updatedAt: new Date().toISOString(),
    source: "StockAnalysis ETF data",
    description: cleanEtfDescription(readAbout("About " + symbol, "Asset Class")),
    stats: {
      assets: parseStockAnalysisMoney(summaryRows.Assets),
      expenseRatio: parseStockAnalysisPercent(summaryRows["Expense Ratio"]),
      peRatio: parseApiNumber(summaryRows["PE Ratio"]),
      sharesOutstanding: parseStockAnalysisMoney(summaryRows["Shares Out"]),
      dividend: parseStockAnalysisMoney(summaryRows["Dividend (ttm)"]),
      dividendYield: parseStockAnalysisPercent(summaryRows["Dividend Yield"]),
      exDividendDate: summaryRows["Ex-Dividend Date"] || null,
      payoutFrequency: summaryRows["Payout Frequency"] || null,
      payoutRatio: parseStockAnalysisPercent(summaryRows["Payout Ratio"]),
      volume: parseApiNumber(tradingRows.Volume),
      open: parseStockAnalysisMoney(tradingRows.Open),
      previousClose: parseStockAnalysisMoney(tradingRows["Previous Close"]),
      dayRange: tradingRows["Day's Range"] || null,
      fiftyTwoWeekLow: parseStockAnalysisMoney(tradingRows["52-Week Low"]),
      fiftyTwoWeekHigh: parseStockAnalysisMoney(tradingRows["52-Week High"]),
      beta: parseApiNumber(tradingRows.Beta),
      holdingsCount: holdingsMeta.count || parseApiNumber(summaryRows.Holdings),
      inceptionDate: tradingRows["Inception Date"] || summaryRows["Inception Date"] || null,
      top10Percent: holdingsMeta.top10Percent
    },
    profile: {
      assetClass: readProfileField("Asset Class") || readAbout("Asset Class", "Category"),
      category: readProfileField("Category") || readAbout("Category", "Region"),
      region: readProfileField("Region") || readAbout("Region", "Stock Exchange"),
      exchange: readProfileField("Stock Exchange") || readAbout("Stock Exchange", "Ticker Symbol"),
      provider: providerFromSchema || readProfileField("ETF Provider") || readAbout("ETF Provider", "Index Tracked"),
      indexTracked: readProfileField("Index Tracked") || readAbout("Index Tracked")
    },
    holdings: selectedHoldings,
    sectors,
    countries,
    assetAllocation,
    holdingsAsOf: holdingsMeta.asOf,
    holdingsLastUpdated: holdingsMeta.lastUpdated
  };

  etfDataCache.set(symbol, { data, fetchedAt: Date.now() });
  return data;
}

app.get("/api/market-heatmap", async (req, res) => {
  const cached = marketHeatmapCache.get("sp500");
  const cachedAge = cached ? Date.now() - cached.fetchedAt : Infinity;
  const freshCacheMs = 75 * 1000;
  const staleCacheMs = 20 * 60 * 1000;
  const hasFullHeatmapPayload = (payload) =>
    Array.isArray(payload?.companies) && payload.companies.length >= 450;
  const countCompleteQuotes = (payload) =>
    (payload?.companies || []).filter(hasCompleteHeatmapQuote).length;
  const hasReadyHeatmapPayload = (payload) =>
    hasFullHeatmapPayload(payload) && countCompleteQuotes(payload) >= 450;

  const cachedNeedsRefresh = cached?.data?.companies?.some((company) => !hasCompleteHeatmapQuote(company));

  const startHeatmapRefresh = () => {
    if (!marketHeatmapRefreshPromise) {
      marketHeatmapRefreshPromise = fetchFreshHeatmap()
        .catch((err) => {
          console.log("Market heat map refresh failed:", err.message);
          return null;
        })
        .finally(() => {
          marketHeatmapRefreshPromise = null;
        });
    }
    return marketHeatmapRefreshPromise;
  };

  if (hasReadyHeatmapPayload(cached?.data) && cachedAge < freshCacheMs && !cachedNeedsRefresh) {
    return res.json(cached.data);
  }

  const buildFromFallbackCache = async () => {
    const heatmapCompanies = await fetchSp500Constituents();
    const symbols = heatmapCompanies.map((company) => company.symbol);
    const savedStocks = await Stock.find({ ticker: { $in: symbols } })
      .select("ticker data.price data.change data.percentChange data.previousClose data.marketCap")
      .lean()
      .catch(() => []);
    const savedBySymbol = new Map((savedStocks || []).map((stock) => [stock.ticker, stock.data || {}]));
    const companies = heatmapCompanies.map((company) => {
      const quote = livePriceCache.get(company.symbol) || {};
      const saved = savedBySymbol.get(company.symbol) || {};
      return normalizeHeatmapCompanyQuote(company, {
        price: firstFiniteNumber(quote.price, saved.price),
        marketCap: firstFiniteNumber(quote.marketCap, saved.marketCap),
        change: firstFiniteNumber(quote.change, saved.change),
        percentChange: firstFiniteNumber(quote.percentChange, saved.percentChange),
        previousClose: firstFiniteNumber(quote.previousClose, saved.previousClose)
      });
    });
    if (!companies.some((company) => toNumberOrNull(company.price) !== null)) return null;
    return buildMarketHeatmapPayload(companies, true);
  };

  const getSavedHeatmapQuotes = async (symbols = []) => {
    const savedStocks = await Stock.find({ ticker: { $in: symbols } })
      .select("ticker data.price data.change data.percentChange data.previousClose data.marketCap")
      .lean()
      .catch(() => []);
    return new Map((savedStocks || []).map((stock) => [stock.ticker, stock.data || {}]));
  };

  const fetchFreshHeatmap = async () => {
    const heatmapCompanies = await fetchSp500Constituents();
    const heatmapSymbols = heatmapCompanies.map((company) => company.symbol);
    const [yahooSparkQuotes, savedBySymbol] = await Promise.all([
      resolveWithin(fetchYahooSparkQuotes(heatmapSymbols), 8500, []),
      resolveWithin(getSavedHeatmapQuotes(heatmapSymbols), 1300, new Map())
    ]);
    const yahooBySymbol = new Map((Array.isArray(yahooSparkQuotes) ? yahooSparkQuotes : [])
      .map((quote) => [String(quote.symbol || "").toUpperCase(), quote]));
    const seededResults = heatmapCompanies.map((company) => {
      const yahooQuote = yahooBySymbol.get(company.symbol);
      const liveQuote = livePriceCache.get(company.symbol) || {};
      const savedQuote = savedBySymbol.get(company.symbol) || {};
      return normalizeHeatmapCompanyQuote(company, {
        price: firstFiniteNumber(yahooQuote?.price, liveQuote.price, savedQuote.price),
        marketCap: firstFiniteNumber(yahooQuote?.marketCap, liveQuote.marketCap, savedQuote.marketCap),
        change: firstFiniteNumber(yahooQuote?.change, liveQuote.change, savedQuote.change),
        percentChange: firstFiniteNumber(yahooQuote?.percentChange, liveQuote.percentChange, savedQuote.percentChange),
        previousClose: firstFiniteNumber(yahooQuote?.previousClose, liveQuote.previousClose, savedQuote.previousClose)
      });
    });
    seededResults.forEach((company) => {
      if (toNumberOrNull(company.price) !== null) {
        livePriceCache.set(company.symbol, {
          price: company.price,
          marketCap: company.marketCap,
          change: company.change,
          percentChange: company.percentChange,
          previousClose: company.previousClose,
          extendedHours: null,
          fetchedAt: Date.now()
        });
      }
    });

    const bySymbol = new Map(seededResults.map((company) => [company.symbol, company]));
    const companies = heatmapCompanies.map((company) => (
      bySymbol.get(company.symbol) || normalizeHeatmapCompanyQuote(company, {
        price: toNumberOrNull(livePriceCache.get(company.symbol)?.price),
        marketCap: toNumberOrNull(livePriceCache.get(company.symbol)?.marketCap),
        change: toNumberOrNull(livePriceCache.get(company.symbol)?.change),
        percentChange: toNumberOrNull(livePriceCache.get(company.symbol)?.percentChange),
        previousClose: toNumberOrNull(livePriceCache.get(company.symbol)?.previousClose)
      })
    ));
    const data = buildMarketHeatmapPayload(companies, false);

    if (companies.length >= 450 && countCompleteQuotes({ companies }) >= 300) {
      marketHeatmapCache.set("sp500", {
        fetchedAt: Date.now(),
        data
      });
    }

    return data;
  };

  if (hasReadyHeatmapPayload(cached?.data) && cachedAge < staleCacheMs) {
    startHeatmapRefresh().catch((err) => {
      console.log("Market heat map background refresh skipped:", err.message);
    });
    return res.json({ ...cached.data, stale: true, refreshing: cachedNeedsRefresh });
  }

  const cachedFallbackData = await resolveWithin(buildFromFallbackCache(), 950, null);
  if (
    hasReadyHeatmapPayload(cachedFallbackData) ||
    (hasFullHeatmapPayload(cachedFallbackData) && countCompleteQuotes(cachedFallbackData) >= 450)
  ) {
    marketHeatmapCache.set("sp500", {
      fetchedAt: Date.now(),
      data: buildMarketHeatmapPayload(cachedFallbackData.companies, true)
    });
    return res.json({
      ...cachedFallbackData,
      stale: true,
      refreshing: true
    });
  }

  const [data, slowCachedFallbackData] = await Promise.all([
    resolveWithin(startHeatmapRefresh(), 9000, null),
    resolveWithin(buildFromFallbackCache(), 700, null)
  ]);
  const bestData = countCompleteQuotes(data) >= countCompleteQuotes(slowCachedFallbackData)
    ? data
    : slowCachedFallbackData;
  if (hasFullHeatmapPayload(bestData)) {
    if (countCompleteQuotes(bestData) >= 450) {
      marketHeatmapCache.set("sp500", {
        fetchedAt: Date.now(),
        data: buildMarketHeatmapPayload(bestData.companies, Boolean(bestData.stale))
      });
    }
    return res.json({
      ...bestData,
      refreshing: bestData.companies.some((company) =>
        toNumberOrNull(company.price) === null ||
        toNumberOrNull(company.percentChange) === null
      )
    });
  }

  const fallbackCompanies = await resolveWithin(
    fetchSp500Constituents(),
    900,
    SP500_HEATMAP_COMPANIES
  );
  const fallbackPayload = {
    companies: fallbackCompanies.length
      ? fallbackCompanies.map((company) => ({
          ...company,
          price: null,
          change: null,
          percentChange: null
        }))
      : [],
    sectors: [],
    updatedAt: new Date().toISOString(),
    stale: true,
    refreshing: true
  };
  return res.json(fallbackPayload);
});

function normalizeMarketMoverRow(row = {}) {
  const symbol = String(row.symbol || row.ticker || "").trim().toUpperCase();
  if (!/^[A-Z0-9.-]{1,12}$/.test(symbol)) return null;
  const price = parseApiNumber(row.price ?? row.regularMarketPrice);
  const change = parseApiNumber(row.change ?? row.regularMarketChange);
  const percentChange = parseApiNumber(
    row.changesPercentage ??
    row.percentChange ??
    row.changePercentage ??
    row.regularMarketChangePercent
  );

  return {
    symbol,
    name: firstText(row.name, row.companyName, row.shortName, row.longName, FALLBACK_COMPANY_NAMES[symbol], symbol),
    price,
    change,
    percentChange
  };
}

app.get("/api/market-movers", async (req, res) => {
  const cached = broadMarketMoversCache.get("latest");
  const cachedAge = cached ? Date.now() - cached.fetchedAt : Infinity;
  const freshCacheMs = 90 * 1000;
  const staleCacheMs = 20 * 60 * 1000;

  if (cached?.data && cachedAge < freshCacheMs) {
    return res.json(cached.data);
  }

  const fetchFreshMovers = async () => {
    const [
      fmpGainerRows,
      fmpLoserRows,
      yahooGainerRows,
      yahooLoserRows,
      stockAnalysisGainerRows,
      stockAnalysisLoserRows
    ] = await Promise.all([
      resolveWithin(fetchFmpMarketMoverList("gainers"), 6500, []),
      resolveWithin(fetchFmpMarketMoverList("losers"), 6500, []),
      resolveWithin(fetchYahooMarketMoverList("gainers"), 6500, []),
      resolveWithin(fetchYahooMarketMoverList("losers"), 6500, []),
      resolveWithin(fetchStockAnalysisMarketMoverList("gainers"), 7000, []),
      resolveWithin(fetchStockAnalysisMarketMoverList("losers"), 7000, [])
    ]);

    const mergeMoverRows = (...groups) => {
      const bySymbol = new Map();
      groups.flat().forEach((row) => {
        const normalized = normalizeMarketMoverRow(row);
        if (!normalized || toNumberOrNull(normalized.percentChange) === null) return;
        if (!bySymbol.has(normalized.symbol)) bySymbol.set(normalized.symbol, normalized);
      });
      return [...bySymbol.values()];
    };

    const gainers = mergeMoverRows(fmpGainerRows, yahooGainerRows, stockAnalysisGainerRows)
      .map(normalizeMarketMoverRow)
      .filter(Boolean)
      .sort((a, b) => toNumberOrNull(b.percentChange) - toNumberOrNull(a.percentChange))
      .slice(0, 10);
    const losers = mergeMoverRows(fmpLoserRows, yahooLoserRows, stockAnalysisLoserRows)
      .map(normalizeMarketMoverRow)
      .filter(Boolean)
      .sort((a, b) => toNumberOrNull(a.percentChange) - toNumberOrNull(b.percentChange))
      .slice(0, 10);
    const data = {
      gainers,
      losers,
      source: gainers.length || losers.length
        ? "FMP/Yahoo/StockAnalysis market movers"
        : "Market movers",
      updatedAt: new Date().toISOString()
    };

    if (gainers.length || losers.length) {
      broadMarketMoversCache.set("latest", {
        fetchedAt: Date.now(),
        data
      });
    }

    return data;
  };

  if (cached?.data && cachedAge < staleCacheMs) {
    fetchFreshMovers().catch((err) => {
      console.log("Market movers background refresh skipped:", err.message);
    });
    return res.json({ ...cached.data, stale: true, refreshing: true });
  }

  try {
    const data = await resolveWithin(fetchFreshMovers(), 7000, null);
    if (data?.gainers?.length || data?.losers?.length) return res.json(data);
  } catch (err) {
    console.log("Market movers refresh failed:", err.message);
  }

  if (cached?.data) return res.json({ ...cached.data, stale: true });

  return res.json({
    gainers: [],
    losers: [],
    source: "FMP market movers",
    updatedAt: new Date().toISOString(),
    stale: true
  });
});

app.get("/api/market-indices", async (req, res) => {
  const cached = marketIndexCache.get("latest");
  const cachedAge = cached ? Date.now() - cached.fetchedAt : Infinity;
  const freshCacheMs = 8 * 1000;
  const staleCacheMs = 5 * 60 * 1000;
  const cachedByKey = new Map((cached?.data?.indices || []).map((index) => [index.key, index]));

  const buildIndexQuote = (index, symbol, price, change, percentChange, source, extra = {}) => {
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
      source,
      ...extra
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

  const fetchStockAnalysisIndexMoves = async () => {
    if (!canUseStockAnalysis()) return new Map();
    try {
      const response = await axios.get("https://stockanalysis.com/markets/active/", {
        headers: {
          "User-Agent": "Mozilla/5.0 AppleWebKit/537.36 Chrome/124 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        },
        timeout: 2500
      });
      const $ = cheerio.load(response.data || "");
      const pageText = $("body").text().replace(/\s+/g, " ");
      const moves = new Map();

      MARKET_INDICES.forEach((index) => {
        const escapedLabel = String(index.stockAnalysisLabel || index.label)
          .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const match = pageText.match(new RegExp(`${escapedLabel}\\s+([+-]?\\d+(?:\\.\\d+)?)%`, "i"));
        const percentChange = parseIndexNumber(match?.[1]);
        if (percentChange !== null) {
          moves.set(index.key, {
            percentChange,
            source: "StockAnalysis"
          });
        }
      });

      return moves;
    } catch (err) {
      setStockAnalysisCooldown(err, "index moves", "indices");
      console.log("StockAnalysis index moves skipped:", err.response?.status || err.message);
      return new Map();
    }
  };

  const applyStockAnalysisMove = (index, indexQuote, stockAnalysisMoves) => {
    const move = stockAnalysisMoves.get(index.key);
    if (!move || toNumberOrNull(move.percentChange) === null) return indexQuote;
    if (
      /^FMP/i.test(String(indexQuote?.source || "")) &&
      toNumberOrNull(indexQuote?.percentChange) !== null
    ) {
      return indexQuote;
    }

    const quote = indexQuote || cachedByKey.get(index.key);
    const price = toNumberOrNull(quote?.price);
    const percentChange = move.percentChange;
    const impliedPreviousClose = price !== null && percentChange !== -100
      ? price / (1 + percentChange / 100)
      : null;
    const change = price !== null && impliedPreviousClose
      ? price - impliedPreviousClose
      : toNumberOrNull(quote?.change);

    return {
      ...(quote || {}),
      key: index.key,
      label: index.label,
      symbol: index.yahooSymbol,
      price: price ?? null,
      change,
      percentChange,
      source: price !== null
        ? `StockAnalysis / ${quote?.source || "cached index"}`
        : "StockAnalysis"
    };
  };

  const fetchFmpIndex = async (index) => {
    if (!process.env.FMP_API_KEY || !canUseFmp()) return null;
    const symbol = index.fmpSymbol || index.yahooSymbol;
    const response = await axios.get("https://financialmodelingprep.com/stable/quote", {
      params: {
        symbol,
        apikey: process.env.FMP_API_KEY
      },
      timeout: 1600,
      validateStatus: () => true
    });
    if (response.status >= 400) {
      const error = new Error(`FMP index quote ${response.status}`);
      error.response = response;
      throw error;
    }
    const quote = Array.isArray(response.data) ? response.data[0] : response.data;
    const indexQuote = buildIndexQuote(
      index,
      symbol,
      quote?.price,
      quote?.change,
      quote?.changePercentage,
      "FMP"
    );
    if (!indexQuote) throw new Error(`Missing ${index.label} FMP quote`);
    return indexQuote;
  };

  const fetchInvestingIndex = async (index) => {
    const response = await axios.get(
      `https://www.investing.com/indices/${index.investingPath}`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 AppleWebKit/537.36 Chrome/124 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        },
        timeout: 4000
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
    if (!canUseYahoo()) return null;

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
        timeout: 3500
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
    if (!canUseYahoo()) return null;

    const quote = await resolveWithin(
      yahooFinance.quote(index.yahooSymbol),
      3500,
      null
    );
    if (!quote) return null;
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

  const fetchYahooFuture = async (index) => {
    if (!index.futuresSymbol) return null;

    let price = null;
    let change = null;
    let percentChange = null;
    let marketState = null;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3500);
      const chartResponse = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(index.futuresSymbol)}?interval=5m&range=1d`,
        {
          headers: {
            "User-Agent": "Mozilla/5.0 AppleWebKit/537.36 Chrome/124 Safari/537.36",
            Accept: "application/json,text/plain,*/*"
          },
          signal: controller.signal
        }
      );
      clearTimeout(timeout);
      if (!chartResponse.ok) {
        const error = new Error(`Yahoo futures chart ${chartResponse.status}`);
        error.response = { status: chartResponse.status };
        throw error;
      }
      const chartData = await chartResponse.json();
      const result = chartData?.chart?.result?.[0];
      const meta = result?.meta || {};
      const closes = result?.indicators?.quote?.[0]?.close || [];
      price = firstFiniteNumber(
        meta.regularMarketPrice,
        [...closes].reverse().find((value) => toNumberOrNull(value) !== null)
      );
      const previousClose = firstFiniteNumber(meta.chartPreviousClose, meta.previousClose);
      change = price !== null && previousClose !== null ? price - previousClose : null;
      percentChange = change !== null && previousClose > 0 ? (change / previousClose) * 100 : null;
      marketState = meta.marketState || marketState;
    } catch (err) {
      console.log("Market index futures chart skipped:", index.label, err.response?.status || err.message);
    }

    if (price === null && canUseYahoo()) {
      const quote = await resolveWithin(
        yahooFinance.quote(index.futuresSymbol).catch(() => null),
        1200,
        null
      );
      price = firstYahooNumber(quote?.regularMarketPrice);
      change = firstFiniteNumber(quote?.regularMarketChange);
      percentChange = firstFiniteNumber(quote?.regularMarketChangePercent);
      marketState = quote?.marketState || marketState;
    }

    if (price === null) return null;

    return {
      symbol: index.futuresSymbol,
      label: `${index.label} futures`,
      price,
      change,
      percentChange,
      marketState,
      source: "Yahoo Futures"
    };
  };

  const fetchFmpFuture = async (index) => {
    if (!process.env.FMP_API_KEY || !canUseFmp() || !index.fmpFuturesSymbol) return null;
    const response = await axios.get("https://financialmodelingprep.com/stable/quote", {
      params: {
        symbol: index.fmpFuturesSymbol,
        apikey: process.env.FMP_API_KEY
      },
      timeout: 1600,
      validateStatus: () => true
    });
    if (response.status === 402 || response.status === 403) return null;
    if (response.status >= 400) {
      const error = new Error(`FMP futures quote ${response.status}`);
      error.response = response;
      throw error;
    }
    const quote = Array.isArray(response.data) ? response.data[0] : response.data;
    const price = toNumberOrNull(quote?.price);
    if (price === null) return null;
    return {
      symbol: index.fmpFuturesSymbol,
      label: `${index.label} futures`,
      price,
      change: toNumberOrNull(quote?.change),
      percentChange: toNumberOrNull(quote?.changePercentage),
      source: "FMP Futures"
    };
  };

  const fetchBestIndexQuote = async (index) => {
    const sources = [
      ["FMP", fetchFmpIndex],
      ["Yahoo chart", fetchYahooChartIndex],
      ["Yahoo quote", fetchYahooIndex],
      ["Investing.com", fetchInvestingIndex]
    ];
    for (const [label, fetchIndex] of sources) {
      const indexQuote = await resolveWithin(Promise.resolve()
        .then(() => fetchIndex(index))
        .then((quote) => {
          if (!quote) throw new Error(`Missing ${index.label} ${label} quote`);
          return quote;
        })
        .catch((err) => {
          if (/^Yahoo/i.test(label)) {
            setYahooCooldown(err, `market index ${label}`, index.label);
          } else if (label === "FMP" && err?.response?.status !== 402 && err?.response?.status !== 403) {
            setFmpCooldown(err, "market index", index.label);
          }
          console.log(`Market index ${label} skipped:`, index.label, err.response?.status || err.message);
          return null;
        }), label === "Investing.com" ? 2600 : 1800, null);
      if (indexQuote) return indexQuote;
    }

    return null;
  };

  const fetchFreshIndices = async () => {
    const stockAnalysisMoves = await resolveWithin(fetchStockAnalysisIndexMoves(), 2600, new Map());
    const indexQuotes = await Promise.all(MARKET_INDICES.map(async (index) => {
      let indexQuote = await fetchBestIndexQuote(index);
      indexQuote = applyStockAnalysisMove(index, indexQuote, stockAnalysisMoves);

      if (!indexQuote) return cachedByKey.get(index.key) || null;

      return {
        ...indexQuote,
        futures: cachedByKey.get(index.key)?.futures || null
      };
    }));

    const indices = [];
    for (const [indexPosition, index] of MARKET_INDICES.entries()) {
      const indexQuote = indexQuotes[indexPosition];
      if (!indexQuote) {
        indices.push(cachedByKey.get(index.key) || null);
        continue;
      }
      try {
        if (indexPosition > 0) await wait(175);
        const futures = await resolveWithin(
          fetchFmpFuture(index)
            .catch((err) => {
              if (err?.response?.status !== 402 && err?.response?.status !== 403) {
                setFmpCooldown(err, "market index futures", index.label);
                console.log("FMP market index futures skipped:", index.label, err.response?.status || err.message);
              }
              return null;
            })
            .then((fmpFuture) => fmpFuture || fetchYahooFuture(index)),
          2600,
          null
        );
        indices.push(futures
          ? { ...indexQuote, futures }
          : { ...indexQuote, futures: cachedByKey.get(index.key)?.futures || null });
      } catch (err) {
        setYahooCooldown(err, "market index futures", index.label);
        console.log("Market index futures skipped:", index.label, err.response?.status || err.message);
        indices.push({ ...indexQuote, futures: cachedByKey.get(index.key)?.futures || null });
      }
    }

    const mergedIndices = MARKET_INDICES.map((index) =>
      indices.find((item) => item?.key === index.key) || cachedByKey.get(index.key)
    ).filter(Boolean);
    const data = {
      indices: mergedIndices,
      updatedAt: new Date().toISOString()
    };

    if (data.indices.length === MARKET_INDICES.length) {
      marketIndexCache.set("latest", {
        fetchedAt: Date.now(),
        data
      });
    }

    return data;
  };

  const startBackgroundRefresh = () => {
    if (marketIndexRefreshPromise) return;
    marketIndexRefreshPromise = fetchFreshIndices()
      .catch((err) => {
        console.log("Market index background refresh skipped:", err.message);
      })
      .finally(() => {
        marketIndexRefreshPromise = null;
      });
  };

  if (cached?.data?.indices?.length && cachedAge < freshCacheMs) {
    return res.json(cached.data);
  }

  if (cached?.data?.indices?.length && cachedAge < staleCacheMs) {
    startBackgroundRefresh();
    return res.json({ ...cached.data, stale: true, refreshing: true });
  }

  try {
    const data = await resolveWithin(fetchFreshIndices(), 3800, null);
    if (data?.indices?.length) return res.json(data);
  } catch (err) {
    console.log("Market indices refresh failed:", err.message);
  }

  if (cached?.data?.indices?.length) {
    return res.json({ ...cached.data, stale: true });
  }

  return res.json({ indices: [], updatedAt: new Date().toISOString() });
});

app.get("/api/price-history/:ticker", async (req, res) => {
  const buildFallbackPriceHistory = async (requestedTicker, ticker, requestedRange) => {
    if (requestedRange !== "1D") return null;

    const cachedQuote = livePriceCache.get(ticker);
    const savedStock = await resolveWithin(
      Stock.findOne({ ticker })
        .select("ticker data.price data.previousClose data.change data.percentChange")
        .lean(),
      1200,
      null
    );
    const savedData = savedStock?.data || {};
    const price = firstFiniteNumber(cachedQuote?.price, savedData.price);
    const previousClose = firstFiniteNumber(savedData.previousClose);
    const change = firstFiniteNumber(
      cachedQuote?.change,
      savedData.change,
      price !== null && previousClose > 0 ? price - previousClose : null
    );
    const percentChange = firstFiniteNumber(
      cachedQuote?.percentChange,
      savedData.percentChange,
      change !== null && previousClose > 0 ? (change / previousClose) * 100 : null
    );

    if (price === null || price <= 0) return null;

    const now = Date.now();
    const basePrice = previousClose && previousClose > 0 ? previousClose : price;
    return {
      symbol: requestedTicker,
      sourceSymbol: ticker,
      range: requestedRange,
      interval: "fallback",
      stale: true,
      points: [
        {
          time: now - 6 * 60 * 60 * 1000,
          date: new Date(now - 6 * 60 * 60 * 1000).toISOString(),
          price: basePrice,
          volume: null
        },
        {
          time: now,
          date: new Date(now).toISOString(),
          price,
          volume: null
        }
      ],
      latest: {
        price,
        change,
        percentChange,
        previousClose: basePrice
      },
      updatedAt: new Date(now).toISOString()
    };
  };

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
    const wantsFastHistory = req.query.fast === "1" || req.query.fast === "true";
    if (cached && Date.now() - cached.fetchedAt < rangeConfig.ttl) {
      return res.json(cached.data);
    }
    if (cached?.data && requestedRange === "1D" && wantsFastHistory) {
      return res.json({ ...cached.data, stale: true });
    }
    if (!canUseYahoo() && cached?.data) {
      return res.json({ ...cached.data, stale: true });
    }
    if (requestedRange === "1D" && wantsFastHistory) {
      const fallbackHistory = await buildFallbackPriceHistory(requestedTicker, ticker, requestedRange);
      if (fallbackHistory) {
        return res.json(fallbackHistory);
      }
    }

    const fmpHistory = await resolveWithin(
      fetchFmpPriceHistory(ticker, requestedRange),
      2400,
      null
    );
    if (fmpHistory?.points?.length) {
      const data = {
        ...fmpHistory,
        symbol: requestedTicker,
        sourceSymbol: ticker
      };
      priceHistoryCache.set(cacheKey, {
        fetchedAt: Date.now(),
        data
      });
      return res.json(data);
    }

    const params = {
      interval: rangeConfig.interval
    };
    if (requestedRange === "1D") {
      params.includePrePost = "true";
    }

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
        timeout: requestedRange === "1D" ? 5500 : 8000,
        headers: YAHOO_CHART_HEADERS
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
    setYahooCooldown(err, "price history", req.params.ticker);
    const cached = priceHistoryCache.get(`${req.params.ticker.trim().toUpperCase()}:${String(req.query.range || "1D").trim().toUpperCase()}`);
    if (cached?.data) {
      return res.json({ ...cached.data, stale: true });
    }
    const requestedTicker = req.params.ticker.trim().toUpperCase();
    const ticker = TICKER_ALIASES[requestedTicker] || requestedTicker;
    const requestedRange = String(req.query.range || "1D").trim().toUpperCase();
    const fallbackHistory = await buildFallbackPriceHistory(requestedTicker, ticker, requestedRange);
    if (fallbackHistory) {
      return res.json(fallbackHistory);
    }
    console.log("Price history failed:", req.params.ticker, err.response?.status || err.message);
    return res.status(502).json({ error: "Price history unavailable" });
  }
});

app.get("/api/similar-companies/:ticker", async (req, res) => {
  try {
    const requestedTicker = req.params.ticker.trim().toUpperCase();
    const ticker = TICKER_ALIASES[requestedTicker] || requestedTicker;

    if (!ticker || ticker.length > 10) {
      return res.status(400).json({ companies: [] });
    }

    let stock = await Stock.findOne({ ticker }).lean().catch(() => null);
    let currentData = stock?.data || {};
    if ((!currentData.sector && !currentData.industry) && activeStockFetches.has(ticker)) {
      const hydrated = await getHydratedStockDataForFirstResponse(ticker, currentData, 1000);
      stock = hydrated.stock || stock;
      currentData = hydrated.data || stock?.data || currentData;
    }
    let peerSymbols = [];

    const [fmpPeers, finnhubPeers] = await Promise.all([
      resolveWithin(fetchFmpSimilarCompanyPeers(ticker), 1800, []),
      resolveWithin(
        getFinnhub(`https://finnhub.io/api/v1/stock/peers?symbol=${ticker}`),
        2500,
        []
      )
    ]);

    if (Array.isArray(finnhubPeers)) {
      peerSymbols = finnhubPeers;
    }

    peerSymbols = [
      ...(Array.isArray(fmpPeers) ? fmpPeers.map((row) => row.symbol) : []),
      ...getFallbackSimilarSymbols(ticker, currentData),
      ...peerSymbols
    ]
      .map(normalizePeerSymbol)
      .filter((symbol) =>
        symbol &&
        symbol !== ticker &&
        /^[A-Z0-9-]{1,10}$/.test(symbol)
      );

    peerSymbols = [...new Set(peerSymbols)].slice(0, 12);
    if (!peerSymbols.length) {
      peerSymbols = ["MSFT", "AAPL", "GOOGL", "AMZN", "META", "NVDA"].filter((symbol) => symbol !== ticker);
    }

    const fmpPeerBySymbol = new Map((Array.isArray(fmpPeers) ? fmpPeers : []).map((row) => [row.symbol, row]));
    const companies = await hydrateSimilarCompaniesFast((await Promise.all(
      peerSymbols.map(async (symbol) => {
        const company = await buildSimilarCompanyItem(symbol);
        const fmpPeer = fmpPeerBySymbol.get(symbol) || {};
        return company
          ? {
              ...company,
              name: firstText(fmpPeer.name, company.name),
              price: firstFiniteNumber(fmpPeer.price, company.price),
              marketCap: firstFiniteNumber(fmpPeer.marketCap, company.marketCap)
            }
          : null;
      })
    ))
      .filter(Boolean)
      .slice(0, 8));

    return res.json({
      symbol: ticker,
      sector: currentData.sector || null,
      industry: currentData.industry || null,
      companies
    });
  } catch (err) {
    console.log("Similar companies failed:", req.params.ticker, err.message);
    return res.status(502).json({ companies: [] });
  }
});

app.get("/api/etf/:ticker", async (req, res) => {
  try {
    const ticker = String(req.params.ticker || "").trim().toUpperCase();
    if (!/^[A-Z0-9.-]{1,12}$/.test(ticker)) {
      return res.status(400).json({ error: "Invalid ETF ticker" });
    }

    const data = await fetchEtfData(ticker);
    res.json(data);
  } catch (err) {
    console.log("ETF data failed:", req.params.ticker, err.response?.status || err.message);
    res.status(404).json({ error: "ETF data not found yet" });
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
    const wantsQuarterlyHistory = String(req.query.mode || "").trim().toLowerCase() === "quarterly";

    let stock = await Stock.findOne({ ticker });
    if (!stock) {
      const initialData = await getImmediateStockSnapshot(ticker, buildMinimalStockSnapshot(ticker));
      stock = await Stock.findOneAndUpdate(
        { ticker },
        {
          ticker,
          status: "pending",
          data: initialData,
          updatedAt: new Date()
        },
        {
          upsert: true,
          new: true
        }
      );

      startStockFetch(ticker);
      const hydrated = await getHydratedStockDataForFirstResponse(
        ticker,
        initialData,
        STOCK_FAST_CHART_HYDRATION_WAIT_MS,
        { waitForInterimHistory: wantsQuarterlyHistory }
      );
      const responseData = await prepareCachedStockResponseDataFast(ticker, hydrated.data || initialData);
      maybeEnqueueMarketActivitySnapshot(ticker, responseData);
      const isStillRefreshing =
        !hasFastRenderableOverview(responseData) ||
        !hasRequestedCoreChartHistory(responseData, wantsQuarterlyHistory);

      return res.json({
        ticker,
        status: "ready",
        ...responseData,
        refreshing: isStillRefreshing,
        updatedAt: hydrated.stock?.updatedAt || stock.updatedAt
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
        const needsFastHydration =
          !(wantsQuarterlyHistory ? hasCompleteChartHistory(stock) : hasAnnualCoreChartHistory(stock)) ||
          (wantsQuarterlyHistory && !hasUsableInterimHistory(stock.data || {}));
        const hydrated = needsFastHydration
          ? await getHydratedStockDataForFirstResponse(
              ticker,
              stock.data,
              STOCK_FAST_CHART_HYDRATION_WAIT_MS,
              { waitForInterimHistory: wantsQuarterlyHistory }
            )
          : { stock, data: stock.data };
        const responseData = await prepareCachedStockResponseDataFast(ticker, hydrated.data || stock.data);
        maybeEnqueueMarketActivitySnapshot(ticker, responseData);
        const isStillRefreshing =
          !hasFastRenderableOverview(responseData) ||
          !hasRequestedCoreChartHistory(responseData, wantsQuarterlyHistory);

        return res.json({
          ticker: stock.ticker,
          status: "ready",
          ...responseData,
          refreshing: isStillRefreshing,
          error: getStockResponseError(responseData, stock.error),
          updatedAt: hydrated.stock?.updatedAt || stock.updatedAt
        });
      }

      const responseData = await prepareCachedStockResponseDataFast(ticker, buildMinimalStockSnapshot(ticker));
      maybeEnqueueMarketActivitySnapshot(ticker, responseData);
      const isStillRefreshing =
        !hasFastRenderableOverview(responseData) ||
        !hasRequestedCoreChartHistory(responseData, wantsQuarterlyHistory);

      return res.json({
        ticker: stock.ticker,
        status: "ready",
        ...responseData,
        refreshing: isStillRefreshing,
        updatedAt: stock.updatedAt || new Date()
      });
    }

    if (stock.status === "ready") {
      const updatedAt = stock.updatedAt ? new Date(stock.updatedAt) : null;
      const isOutdated =
        stock.data?.financialHistoryVersion !== FINANCIAL_HISTORY_VERSION ||
        stock.data?.estimateDataVersion !== STOCK_ESTIMATE_VERSION;
      const needsInterimHistoryRefresh =
        !hasUsableInterimHistory(stock.data || {}) &&
        !(
          stock.data?.interimHistoryVersion === INTERIM_HISTORY_VERSION &&
          stock.data?.interimHistoryCheckedAt
        );
      const hasCheckedAnnualHistory =
        stock.data?.financialHistoryVersion === FINANCIAL_HISTORY_VERSION &&
        Boolean(stock.data?.financialHistoryCheckedAt);
      const requestedChartHistoryReady = wantsQuarterlyHistory
        ? hasCompleteChartHistory(stock)
        : hasAnnualCoreChartHistory(stock);
      const isCoreIncomplete =
        !requestedChartHistoryReady ||
        (wantsQuarterlyHistory && needsInterimHistoryRefresh);
      const isStale =
        isOutdated ||
        isCoreIncomplete ||
        !updatedAt ||
        Date.now() - updatedAt.getTime() > STOCK_FULL_REFRESH_MS;
      if (isStale) {
        startStockFetch(ticker);
        const needsFastHydration =
          isCoreIncomplete ||
          (wantsQuarterlyHistory && !hasUsableInterimHistory(stock.data || {}));
        const hydrated = needsFastHydration
          ? await getHydratedStockDataForFirstResponse(
              ticker,
              stock.data || {},
              STOCK_FAST_CHART_HYDRATION_WAIT_MS,
              { waitForInterimHistory: wantsQuarterlyHistory }
            )
          : { stock, data: stock.data || {} };
        const responseData = await prepareCachedStockResponseDataFast(ticker, hydrated.data || stock.data || {});
        maybeEnqueueMarketActivitySnapshot(ticker, responseData);
        const isStillRefreshing =
          isCoreIncomplete ||
          !hasRequestedCoreChartHistory(responseData, wantsQuarterlyHistory);

        return res.json({
          ticker: stock.ticker,
          status: "ready",
          ...responseData,
          refreshing: isStillRefreshing,
          error: getStockResponseError(responseData, stock.error),
          updatedAt: hydrated.stock?.updatedAt || stock.updatedAt
        });
      }
    }

    if (stock.status === "failed") {
      const updatedAt = stock.updatedAt ? new Date(stock.updatedAt) : null;
      const failedRecently =
        updatedAt && Date.now() - updatedAt.getTime() < STOCK_FAILED_RETRY_MS;

      if (failedRecently) {
        const fallbackData = stock.data && Object.keys(stock.data).length
          ? stock.data
          : buildMinimalStockSnapshot(ticker);
        const shouldRetryFailedSnapshot =
          toNumberOrNull(fallbackData.price) === null;

        if (shouldRetryFailedSnapshot) {
          const responseData = await prepareCachedStockResponseDataFast(ticker, fallbackData);
          await Stock.findOneAndUpdate(
            { ticker },
            {
              status: "pending",
              data: responseData,
              error: null,
              updatedAt: new Date()
            }
          );
          startStockFetch(ticker);
          maybeEnqueueMarketActivitySnapshot(ticker, responseData);

          return res.json({
            ticker: stock.ticker,
            status: "ready",
            ...responseData,
            refreshing: true,
            updatedAt: new Date()
          });
        }

        const responseData = await prepareCachedStockResponseDataFast(ticker, fallbackData);
        const shouldKeepPolling =
          !hasRequestedCoreChartHistory(responseData, wantsQuarterlyHistory);

        maybeEnqueueMarketActivitySnapshot(ticker, responseData);

        return res.json({
          ticker: stock.ticker,
          status: "ready",
          ...responseData,
          refreshing: shouldKeepPolling,
          error: getStockResponseError(responseData, stock.error),
          updatedAt: stock.updatedAt
        });
      }

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
        const responseData = await prepareCachedStockResponseDataFast(ticker, stock.data);
        maybeEnqueueMarketActivitySnapshot(ticker, responseData);

        return res.json({
          ticker: stock.ticker,
          status: "ready",
          ...responseData,
          refreshing: true,
          error: getStockResponseError(responseData, stock.error),
          updatedAt: stock.updatedAt
        });
      }

      const responseData = await prepareCachedStockResponseDataFast(ticker, buildMinimalStockSnapshot(ticker));
      maybeEnqueueMarketActivitySnapshot(ticker, responseData);

      return res.json({
        ticker,
        status: "ready",
        ...responseData,
        refreshing: true,
        updatedAt: stock.updatedAt || new Date()
      });
    }

    const responseData = await prepareCachedStockResponseDataFast(ticker, stock.data);
    maybeEnqueueMarketActivitySnapshot(ticker, responseData);
    const isStillRefreshing = !hasRequestedCoreChartHistory(responseData, wantsQuarterlyHistory);

    return res.json({
      ticker: stock.ticker,
      status: stock.status,
      ...responseData,
      refreshing: isStillRefreshing,
      error: getStockResponseError(responseData, stock.error),
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

const percentText = (value, digits = 1) => {
  const number = toNumberOrNull(value);
  return number === null ? "N/A" : `${number.toFixed(digits)}%`;
};

const yahooRawNumber = (value) => toNumberOrNull(
  value && typeof value === "object" && "raw" in value ? value.raw : value
);

const firstYahooRawNumber = (...values) => {
  for (const value of values) {
    const number = yahooRawNumber(value);
    if (number !== null) return number;
  }
  return null;
};

const getQuestionIntent = (question = "") => {
  const text = String(question || "").toLowerCase();
  const statementLineItem = /\b(sg&a|sga|selling general|selling, general|g&a|general and administrative|admin expense|administrative expense|r&d|research and development|cogs|cost of goods|cost of revenue|operating expense|opex|operating income|interest expense|tax expense|depreciation|amortization)\b/.test(text);
  const earningsCall = /\b(earnings call|conference call|call highlights?|transcript|management said|ceo said|cfo said|q&a|yesterday|today|latest call|most recent call)\b/.test(text);
  const companyFacts = /\b(ceo|cfo|coo|chief executive|chief financial|founder|founded|headquarters|headquartered|employees|management|chairman|president|who runs|what does|business model)\b/.test(text);
  return {
    debt: /\b(debt|leverage|liabilit|balance sheet|borrowings?|cash|equity|current ratio)\b/.test(text),
    dividend: /\b(dividend|yield|payout)\b/.test(text),
    forwardPe: /\b(forward\s*p\/?e|forward\s*pe|forward\s*multiple)\b/.test(text),
    peg: /\b(peg|price\/earnings to growth|price earnings to growth)\b/.test(text),
    pe: /\b(p\/?e|pe ratio|earnings multiple)\b/.test(text),
    valuation: /\b(valuation|expensive|cheap|multiple|price to sales|p\/s|p\/b|price to book|peg)\b/.test(text),
    estimates: /\b(estimate|consensus|forecast|next year|current year|eps|revenue)\b/.test(text),
    risk: /\b(risk|risks|bear|downside|concern|worry)\b/.test(text),
    catalyst: /\b(catalyst|bull|upside|positive|why buy|growth)\b/.test(text),
    margins: /\b(margins?|profitability|gross|operating margins?|profit margins?)\b/.test(text),
    cashFlow: /\b(free cash flow|fcf|cash flow)\b/.test(text),
    target: /\b(price target|target|upside)\b/.test(text),
    statementLineItem,
    earningsCall,
    companyFacts,
    currentEvents: earningsCall || /\b(today|yesterday|latest|most recent|news|reported|just reported)\b/.test(text)
  };
};

const getRequestedStatementLineItems = (question = "") => {
  const text = String(question || "").toLowerCase();
  const items = [];
  const add = (key, label, concepts = [], labelPattern = null) => {
    if (!items.some((item) => item.key === key)) {
      items.push({ key, label, concepts, labelPattern });
    }
  };

  if (/\b(sg&a|sga|selling general|selling, general|g&a|general and administrative|admin expense|administrative expense)\b/.test(text)) {
    add("sga", "SG&A / G&A expense", [
      "us-gaap_SellingGeneralAndAdministrativeExpense",
      "us-gaap_GeneralAndAdministrativeExpense",
      "us-gaap_SellingAndMarketingExpense",
      "us-gaap_SellingExpense"
    ], /(selling.*general.*administrative|general and administrative|administrative expense|selling and marketing|selling expense)/i);
  }
  if (/\b(r&d|research and development)\b/.test(text)) {
    add("rd", "Research and development expense", [
      "us-gaap_ResearchAndDevelopmentExpense",
      "us-gaap_ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost"
    ], /(research and development|r&d)/i);
  }
  if (/\b(cogs|cost of goods|cost of revenue|food and beverage costs?)\b/.test(text)) {
    add("costOfRevenue", "Cost of revenue", [
      "us-gaap_CostOfRevenue",
      "us-gaap_CostOfGoodsAndServicesSold",
      "us-gaap_CostsOfGoodsSold",
      "cake_FoodAndBeverageCosts"
    ], /(cost of revenue|cost of goods|food and beverage costs?)/i);
  }
  if (/\b(operating expense|opex)\b/.test(text)) {
    add("operatingExpenses", "Operating expenses", [
      "us-gaap_OperatingExpenses",
      "us-gaap_CostsAndExpenses"
    ], /(operating expenses|costs and expenses)/i);
  }
  if (/\b(operating income|operating profit|operating loss)\b/.test(text)) {
    add("operatingIncome", "Operating income", [
      "us-gaap_OperatingIncomeLoss"
    ], /operating income|operating \(loss\)/i);
  }
  if (/\b(interest expense|interest income)\b/.test(text)) {
    add("interestExpense", "Interest expense", [
      "us-gaap_InterestExpenseNonOperating",
      "us-gaap_InterestIncomeExpenseNonoperatingNet"
    ], /interest/i);
  }
  if (/\b(tax expense|income tax)\b/.test(text)) {
    add("taxExpense", "Income tax expense", [
      "us-gaap_IncomeTaxExpenseBenefit"
    ], /income tax/i);
  }
  if (/\b(depreciation|amortization|d&a)\b/.test(text)) {
    add("depreciationAmortization", "Depreciation and amortization", [
      "us-gaap_DepreciationDepletionAndAmortization"
    ], /(depreciation|amortization)/i);
  }

  return items;
};

async function fetchExternalStatementContext(ticker, intent = {}, question = "") {
  if (!intent.statementLineItem) return null;
  if (!process.env.FINNHUB_API_KEY) return null;

  const symbol = String(ticker || "").trim().toUpperCase();
  const requestedItems = getRequestedStatementLineItems(question);
  if (!symbol || !requestedItems.length) return null;

  const cacheKey = `${symbol}:${requestedItems.map((item) => item.key).join(",")}`;
  const cached = mrRallyStatementCache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < 10 * 60 * 1000) return cached.value;

  try {
    const { data } = await axios.get("https://finnhub.io/api/v1/stock/financials-reported", {
      params: {
        symbol,
        freq: "quarterly",
        token: process.env.FINNHUB_API_KEY
      },
      timeout: 7000
    });
    const filing = (data?.data || [])
      .filter((item) => item?.report?.ic)
      .sort((a, b) => String(b.endDate || "").localeCompare(String(a.endDate || "")))
      .at(0);

    if (!filing) return null;

    const incomeStatement = filing.report.ic || [];
    const revenue = incomeStatement.find((line) =>
      /revenue/i.test(line?.label || "") ||
      /Revenue/i.test(line?.concept || "")
    );
    const revenueValue = toNumberOrNull(revenue?.value);

    const lineItems = requestedItems.map((requested) => {
      const match = incomeStatement.find((line) =>
        requested.concepts.includes(line?.concept)
      ) || incomeStatement.find((line) =>
        requested.labelPattern?.test(line?.label || "")
      );
      const value = toNumberOrNull(match?.value);
      return {
        key: requested.key,
        label: requested.label,
        reportedLabel: match?.label || null,
        concept: match?.concept || null,
        value,
        percentOfRevenue: value !== null && revenueValue ? (value / revenueValue) * 100 : null
      };
    }).filter((line) => line.value !== null || line.reportedLabel);

    const context = {
      source: "Finnhub reported quarterly filing data",
      form: filing.form || null,
      period: filing.year && filing.quarter ? `${filing.year} Q${filing.quarter}` : null,
      startDate: filing.startDate || null,
      endDate: filing.endDate || null,
      filedDate: filing.filedDate || null,
      revenue: revenueValue,
      revenueLabel: revenue?.label || null,
      lineItems
    };

    mrRallyStatementCache.set(cacheKey, { createdAt: Date.now(), value: context });
    return context;
  } catch (err) {
    console.log("Mr. Rally statement line items skipped:", symbol, err.response?.status || err.message);
    return null;
  }
}

const decodeDuckDuckGoUrl = (href = "") => {
  try {
    const absolute = href.startsWith("//") ? `https:${href}` : href;
    const parsed = new URL(absolute);
    const redirected = parsed.searchParams.get("uddg");
    return redirected ? decodeURIComponent(redirected) : absolute;
  } catch {
    return null;
  }
};

const extractRelevantWebText = (text = "", question = "") => {
  const cleaned = String(text || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "";

  const lower = cleaned.toLowerCase();
  const anchors = [
    "company participants",
    "conference call",
    "earnings call",
    "operator",
    "question-and-answer",
    "highlights",
    ...normalizeCompanyName(question).split(" ").filter((token) => token.length > 4)
  ];
  const anchorIndex = anchors
    .map((anchor) => lower.indexOf(anchor.toLowerCase()))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];
  const start = anchorIndex !== undefined ? Math.max(0, anchorIndex - 900) : 0;

  return cleaned.slice(start, start + 14000);
};

const buildEarningsCallHighlightBullets = (text = "") => {
  const cleaned = String(text || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  const sentences = cleaned
    .split(/(?<=[.!?])\s+(?=[A-Z$0-9])/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 50 && sentence.length <= 340);
  const keywords = [
    /revenue|sales|growth|declin|increase|decrease/i,
    /gross margin|margin|profit|eps|earnings/i,
    /guidance|outlook|expect|forecast|fiscal/i,
    /china|north america|emea|direct|wholesale|digital|inventory/i,
    /tariff|consumer|demand|pressure|turnaround|strategy/i,
    /cfo|ceo|management|appointed|transition/i
  ];
  const picked = [];
  for (const pattern of keywords) {
    const sentence = sentences.find((candidate) =>
      pattern.test(candidate) &&
      !picked.some((existing) => existing === candidate)
    );
    if (sentence) picked.push(sentence);
    if (picked.length >= 6) break;
  }
  return picked.slice(0, 5);
};

async function searchDuckDuckGo(query) {
  const { data } = await axios.get("https://html.duckduckgo.com/html/", {
    params: { q: query },
    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept: "text/html,application/xhtml+xml"
    },
    timeout: 9000
  });
  const $ = cheerio.load(data || "");
  const results = [];
  $(".result").each((_, element) => {
    const title = $(element).find(".result__a").text().trim().replace(/\s+/g, " ");
    const href = decodeDuckDuckGoUrl($(element).find(".result__a").attr("href"));
    const snippet = $(element).find(".result__snippet").text().trim().replace(/\s+/g, " ");
    if (!title || !href || !/^https?:\/\//i.test(href)) return;
    if (results.some((result) => result.url === href)) return;
    results.push({ title, url: href, snippet });
  });
  return results.slice(0, 8);
}

async function fetchPublicPageText(url) {
  const { data, headers } = await axios.get(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept: "text/html,text/plain,application/xhtml+xml"
    },
    timeout: 10000,
    maxRedirects: 4
  });
  const contentType = String(headers["content-type"] || "").toLowerCase();
  if (!/html|text/.test(contentType)) return "";
  return stripHtmlToText(String(data || ""));
}

async function fetchMrRallyWebContext(ticker, intent = {}, question = "") {
  if (!intent.currentEvents && !intent.earningsCall) return null;

  const symbol = String(ticker || "").trim().toUpperCase();
  if (!symbol) return null;

  const cacheKey = `${symbol}:${normalizeCompanyName(question).slice(0, 90)}`;
  const cached = mrRallyWebContextCache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < 20 * 60 * 1000) return cached.value;

  const currentYear = new Date().getFullYear();
  const query = intent.earningsCall
    ? `${symbol} ${currentYear} earnings call highlights revenue guidance transcript`
    : `${symbol} latest stock news earnings`;

  try {
    const searchResults = await searchDuckDuckGo(query);
    const ranked = searchResults
      .map((result) => ({
        ...result,
        score:
          (/transcript|earnings call|conference call/i.test(`${result.title} ${result.snippet}`) ? 8 : 0) +
          (/complete transcript|q[1-4].*transcript|transcript.*q[1-4]/i.test(`${result.title} ${result.snippet}`) ? 5 : 0) +
          (/benzinga|alphastreet|seekingalpha|yahoo|stockanalysis|gurufocus/i.test(result.url) ? 4 : 0) +
          (/\/transcripts\/?$|earnings-calls\/?$/i.test(result.url) ? -7 : 0) +
          (/latest|q[1-4]|2026|2025/i.test(`${result.title} ${result.snippet}`) ? 2 : 0)
      }))
      .sort((a, b) => b.score - a.score);

    const pages = [];
    for (const result of ranked.slice(0, 4)) {
      if (pages.length >= 2) break;
      try {
        const text = await fetchPublicPageText(result.url);
        const relevantText = extractRelevantWebText(text, question);
        if (relevantText.length < 300) continue;
        if (
          intent.earningsCall &&
          !/operator|company participants|question-and-answer|conference call|complete transcript/i.test(relevantText)
        ) continue;
        pages.push({
          title: result.title,
          url: result.url,
          snippet: result.snippet,
          text: relevantText
        });
      } catch (err) {
        // Some publishers block server-side requests. Keep trying other results.
      }
    }

    const context = {
      source: "Public web search and transcript pages",
      query,
      results: ranked.slice(0, 5).map(({ title, url, snippet }) => ({ title, url, snippet })),
      pages
    };

    mrRallyWebContextCache.set(cacheKey, { createdAt: Date.now(), value: context });
    return context;
  } catch (err) {
    console.log("Mr. Rally public web context skipped:", symbol, err.response?.status || err.message);
    return null;
  }
}

async function fetchExternalFinancialContext(ticker, intent = {}) {
  if (!intent.debt && !intent.cashFlow) return null;
  const buildFromYahooTimeSeries = async () => {
    const typeList = [
      "quarterlyTotalDebt",
      "quarterlyCashAndCashEquivalents",
      "quarterlyLongTermDebt",
      "quarterlyCurrentDebt",
      "quarterlyTotalLiabilitiesNetMinorityInterest",
      "quarterlyTotalAssets",
      "quarterlyStockholdersEquity",
      "annualTotalDebt",
      "annualCashAndCashEquivalents",
      "annualLongTermDebt",
      "annualCurrentDebt",
      "annualTotalLiabilitiesNetMinorityInterest",
      "annualTotalAssets",
      "annualStockholdersEquity"
    ];
    const period1 = Math.floor(Date.UTC(new Date().getUTCFullYear() - 6, 0, 1) / 1000);
    const period2 = Math.floor(Date.now() / 1000);
    const { data } = await axios.get(
      `https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(ticker)}`,
      {
        params: {
          type: typeList.join(","),
          period1,
          period2
        },
        timeout: 10000,
        headers: YAHOO_CHART_HEADERS
      }
    );
    const readLatest = (field) => {
      const row = data?.timeseries?.result?.find((item) => Array.isArray(item?.[field]));
      const latest = row?.[field]
        ?.filter((item) => item?.reportedValue?.raw !== undefined)
        ?.sort((a, b) => String(a.asOfDate).localeCompare(String(b.asOfDate)))
        ?.at(-1);
      return {
        value: latest ? firstYahooRawNumber(latest.reportedValue) : null,
        asOf: latest?.asOfDate || null
      };
    };
    const totalDebt = readLatest("quarterlyTotalDebt");
    const annualTotalDebt = readLatest("annualTotalDebt");
    const cash = readLatest("quarterlyCashAndCashEquivalents");
    const annualCash = readLatest("annualCashAndCashEquivalents");
    const longTermDebt = readLatest("quarterlyLongTermDebt");
    const annualLongTermDebt = readLatest("annualLongTermDebt");
    const currentDebt = readLatest("quarterlyCurrentDebt");
    const annualCurrentDebt = readLatest("annualCurrentDebt");
    const liabilities = readLatest("quarterlyTotalLiabilitiesNetMinorityInterest");
    const assets = readLatest("quarterlyTotalAssets");
    const equity = readLatest("quarterlyStockholdersEquity");
    const resolvedDebt = firstFiniteNumber(totalDebt.value, annualTotalDebt.value, longTermDebt.value, annualLongTermDebt.value);
    const resolvedCash = firstFiniteNumber(cash.value, annualCash.value);
    return {
      source: "Yahoo Finance external balance-sheet data",
      asOf: totalDebt.asOf || annualTotalDebt.asOf || longTermDebt.asOf || annualLongTermDebt.asOf || cash.asOf || annualCash.asOf || null,
      balanceSheet: {
        cash: resolvedCash,
        totalDebt: resolvedDebt,
        netDebt: resolvedDebt !== null && resolvedCash !== null ? resolvedDebt - resolvedCash : null,
        longTermDebt: firstFiniteNumber(longTermDebt.value, annualLongTermDebt.value),
        currentDebt: firstFiniteNumber(currentDebt.value, annualCurrentDebt.value),
        totalLiabilities: liabilities.value,
        totalAssets: assets.value,
        equity: equity.value,
        debtToEquity: resolvedDebt !== null && equity.value ? (resolvedDebt / equity.value) * 100 : null,
        currentRatio: null
      },
      valuation: {}
    };
  };

  try {
    const summary = await yahooFinance.quoteSummary(ticker, {
      modules: [
        "financialData",
        "balanceSheetHistory",
        "balanceSheetHistoryQuarterly",
        "defaultKeyStatistics"
      ]
    });
    const financialData = summary?.financialData || {};
    const keyStats = summary?.defaultKeyStatistics || {};
    const annualSheet = summary?.balanceSheetHistory?.balanceSheetStatements?.[0] || {};
    const quarterlySheet = summary?.balanceSheetHistoryQuarterly?.balanceSheetStatements?.[0] || {};
    const sheet = quarterlySheet && Object.keys(quarterlySheet).length ? quarterlySheet : annualSheet;

    const cash = firstYahooRawNumber(
      financialData.totalCash,
      sheet.cash,
      sheet.cashAndCashEquivalents,
      sheet.cashCashEquivalentsAndShortTermInvestments
    );
    const totalDebt = firstYahooRawNumber(
      financialData.totalDebt,
      sheet.totalDebt,
      sheet.longTermDebtAndCapitalLeaseObligation,
      sheet.longTermDebt,
      sheet.shortLongTermDebtTotal
    );
    const longTermDebt = firstYahooRawNumber(
      sheet.longTermDebt,
      sheet.longTermDebtAndCapitalLeaseObligation
    );
    const currentDebt = firstYahooRawNumber(
      sheet.shortLongTermDebt,
      sheet.currentDebt,
      sheet.currentDebtAndCapitalLeaseObligation
    );
    const totalLiabilities = firstYahooRawNumber(sheet.totalLiab, sheet.totalLiabilitiesNetMinorityInterest);
    const totalAssets = firstYahooRawNumber(sheet.totalAssets);
    const equity = firstYahooRawNumber(sheet.totalStockholderEquity, sheet.stockholdersEquity);
    const netDebt = totalDebt !== null && cash !== null ? totalDebt - cash : null;

    const summaryContext = {
      source: "Yahoo Finance external financial data",
      asOf: sheet.endDate ? new Date(firstYahooRawNumber(sheet.endDate) * 1000).toISOString().slice(0, 10) : null,
      balanceSheet: {
        cash,
        totalDebt,
        netDebt,
        longTermDebt,
        currentDebt,
        totalLiabilities,
        totalAssets,
        equity,
        debtToEquity: firstYahooRawNumber(financialData.debtToEquity),
        currentRatio: firstYahooRawNumber(financialData.currentRatio)
      },
      valuation: {
        enterpriseValue: firstYahooRawNumber(keyStats.enterpriseValue),
        trailingEps: firstYahooRawNumber(keyStats.trailingEps),
        forwardEps: firstYahooRawNumber(keyStats.forwardEps)
      }
    };
    if (summaryContext.balanceSheet.totalDebt !== null || summaryContext.balanceSheet.cash !== null) {
      return summaryContext;
    }
    return await buildFromYahooTimeSeries();
  } catch (err) {
    try {
      return await buildFromYahooTimeSeries();
    } catch (fallbackErr) {
      console.log("Mr. Rally external financials skipped:", ticker, fallbackErr.message);
      return null;
    }
  }
}

async function fetchExternalMetricContext(ticker, intent = {}) {
  const needsMetrics = intent.peg || intent.valuation || intent.pe || intent.forwardPe || intent.dividend || intent.target;
  if (!needsMetrics) return null;

  const symbol = String(ticker || "").trim().toUpperCase();
  if (!symbol) return null;

  const cacheKey = `${symbol}:${[
    intent.peg ? "peg" : "",
    intent.valuation ? "valuation" : "",
    intent.pe ? "pe" : "",
    intent.forwardPe ? "forwardPe" : "",
    intent.dividend ? "dividend" : "",
    intent.target ? "target" : ""
  ].filter(Boolean).join(",")}`;
  const cached = mrRallyExternalMetricCache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < 10 * 60 * 1000) return cached.value;

  const mergeValuation = (base, next = {}) => ({
    pegRatio: firstFiniteNumber(base.pegRatio, next.pegRatio, next.trailingPegRatio),
    trailingPegRatio: firstFiniteNumber(base.trailingPegRatio, next.trailingPegRatio, next.pegRatio),
    trailingPE: firstFiniteNumber(base.trailingPE, next.trailingPE, next.peRatioTTM, next.peRatio),
    forwardPE: firstFiniteNumber(base.forwardPE, next.forwardPE),
    priceToSales: firstFiniteNumber(base.priceToSales, next.priceToSales, next.priceToSalesRatioTTM),
    priceToBook: firstFiniteNumber(base.priceToBook, next.priceToBook, next.priceToBookRatioTTM),
    enterpriseValue: firstFiniteNumber(base.enterpriseValue, next.enterpriseValue),
    beta: firstFiniteNumber(base.beta, next.beta),
    dividendYield: firstFiniteNumber(base.dividendYield, next.dividendYield, next.dividendYielTTM, next.dividendYieldTTM),
    payoutRatio: firstFiniteNumber(base.payoutRatio, next.payoutRatio, next.payoutRatioTTM),
    analystTarget: firstFiniteNumber(base.analystTarget, next.analystTarget)
  });

  let metricContext = {
    source: "",
    valuation: {}
  };

  if (canUseYahooQuoteSummary()) {
    try {
      const summary = await yahooFinance.quoteSummary(symbol, {
        modules: ["defaultKeyStatistics", "financialData", "summaryDetail"]
      });
      const keyStats = summary?.defaultKeyStatistics || {};
      const financialData = summary?.financialData || {};
      const detail = summary?.summaryDetail || {};
      metricContext = {
        source: "Yahoo Finance external valuation data",
        valuation: mergeValuation(metricContext.valuation, {
          pegRatio: firstYahooRawNumber(keyStats.pegRatio, keyStats.trailingPegRatio),
          trailingPegRatio: firstYahooRawNumber(keyStats.trailingPegRatio),
          trailingPE: firstYahooRawNumber(detail.trailingPE),
          forwardPE: firstYahooRawNumber(keyStats.forwardPE, financialData.forwardPE),
          priceToSales: firstYahooRawNumber(detail.priceToSalesTrailing12Months),
          priceToBook: firstYahooRawNumber(keyStats.priceToBook),
          enterpriseValue: firstYahooRawNumber(keyStats.enterpriseValue),
          beta: firstYahooRawNumber(keyStats.beta),
          dividendYield: firstYahooRawNumber(detail.dividendYield),
          payoutRatio: firstYahooRawNumber(detail.payoutRatio),
          analystTarget: firstYahooRawNumber(financialData.targetMeanPrice)
        })
      };
    } catch (err) {
      setYahooQuoteSummaryCooldown(err, "Mr. Rally valuation metrics", symbol);
      console.log("Mr. Rally Yahoo valuation metrics skipped:", symbol, err.response?.status || err.message);
    }
  }

  const hasRequestedYahooMetric =
    (intent.peg && metricContext.valuation.pegRatio !== null && metricContext.valuation.pegRatio !== undefined) ||
    (intent.dividend && metricContext.valuation.dividendYield !== null && metricContext.valuation.dividendYield !== undefined) ||
    (intent.forwardPe && metricContext.valuation.forwardPE !== null && metricContext.valuation.forwardPE !== undefined);

  if (!hasRequestedYahooMetric && process.env.FINNHUB_API_KEY) {
    try {
      const { data } = await axios.get("https://finnhub.io/api/v1/stock/metric", {
        params: {
          symbol,
          metric: "all",
          token: process.env.FINNHUB_API_KEY
        },
        timeout: 4500
      });
      const metrics = data?.metric || {};
      const valuation = mergeValuation(metricContext.valuation, {
        pegRatio: firstFiniteNumber(metrics.forwardPEG, metrics.pegTTM),
        trailingPegRatio: firstFiniteNumber(metrics.pegTTM),
        trailingPE: firstFiniteNumber(metrics.peTTM, metrics.peBasicExclExtraTTM, metrics.peInclExtraTTM),
        forwardPE: firstFiniteNumber(metrics.forwardPE),
        priceToSales: firstFiniteNumber(metrics.psTTM),
        priceToBook: firstFiniteNumber(metrics.pbQuarterly, metrics.pbAnnual),
        dividendYield: firstFiniteNumber(metrics.currentDividendYieldTTM, metrics.dividendYieldIndicatedAnnual),
        beta: firstFiniteNumber(metrics.beta)
      });
      if (Object.values(valuation).some((value) => value !== null && value !== undefined)) {
        metricContext = {
          source: metricContext.source
            ? `${metricContext.source}; Finnhub external valuation metrics`
            : "Finnhub external valuation metrics",
          valuation
        };
      }
    } catch (err) {
      console.log("Mr. Rally Finnhub valuation metrics skipped:", symbol, err.response?.status || err.message);
    }
  }

  const hasRequestedProviderMetric =
    (intent.peg && metricContext.valuation.pegRatio !== null && metricContext.valuation.pegRatio !== undefined) ||
    (intent.dividend && metricContext.valuation.dividendYield !== null && metricContext.valuation.dividendYield !== undefined) ||
    (intent.forwardPe && metricContext.valuation.forwardPE !== null && metricContext.valuation.forwardPE !== undefined);

  if (!hasRequestedProviderMetric && canUseFmp()) {
    const fmpRatios = await getFmpData(symbol, "Mr. Rally valuation ratios", [
      `/stable/ratios-ttm?symbol=${encodeURIComponent(symbol)}`,
      `/api/v3/ratios-ttm/${encodeURIComponent(symbol)}`
    ]);
    const fmpMetrics = await getFmpData(symbol, "Mr. Rally key metrics", [
      `/stable/key-metrics-ttm?symbol=${encodeURIComponent(symbol)}`,
      `/api/v3/key-metrics-ttm/${encodeURIComponent(symbol)}`
    ]);
    const ratioRow = Array.isArray(fmpRatios) ? fmpRatios[0] : fmpRatios;
    const metricRow = Array.isArray(fmpMetrics) ? fmpMetrics[0] : fmpMetrics;
    const valuation = mergeValuation(metricContext.valuation, {
      pegRatio: firstFiniteNumber(ratioRow?.pegRatioTTM, ratioRow?.pegRatio, metricRow?.pegRatioTTM, metricRow?.pegRatio),
      trailingPE: firstFiniteNumber(ratioRow?.priceEarningsRatioTTM, ratioRow?.peRatioTTM, metricRow?.peRatioTTM),
      priceToSales: firstFiniteNumber(ratioRow?.priceToSalesRatioTTM, metricRow?.priceToSalesRatioTTM),
      priceToBook: firstFiniteNumber(ratioRow?.priceToBookRatioTTM, metricRow?.pbRatioTTM),
      dividendYield: firstFiniteNumber(ratioRow?.dividendYielTTM, ratioRow?.dividendYieldTTM, metricRow?.dividendYieldTTM),
      payoutRatio: firstFiniteNumber(ratioRow?.payoutRatioTTM, metricRow?.payoutRatioTTM),
      enterpriseValue: firstFiniteNumber(metricRow?.enterpriseValueTTM, metricRow?.enterpriseValue),
      beta: firstFiniteNumber(metricRow?.beta)
    });
    if (Object.values(valuation).some((value) => value !== null && value !== undefined)) {
      metricContext = {
        source: metricContext.source
          ? `${metricContext.source}; FMP external valuation data`
          : "FMP external valuation data",
        valuation
      };
    }
  }

  if (!Object.values(metricContext.valuation).some((value) => value !== null && value !== undefined)) {
    mrRallyExternalMetricCache.set(cacheKey, { createdAt: Date.now(), value: null });
    return null;
  }

  mrRallyExternalMetricCache.set(cacheKey, { createdAt: Date.now(), value: metricContext });
  return metricContext;
}

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

const extractStockSymbolsFromQuestion = (message = "", fallbackTicker = "") => {
  const ignored = new Set([
    "A", "AI", "API", "CEO", "CFO", "DCF", "EPS", "ETF", "FCF", "FY", "G", "GA", "GAAP",
    "GDP", "IPO", "MR", "PE", "PEG", "PS", "Q", "R", "RD", "SEC", "SG", "SGA", "TTM", "US", "USD", "YOY"
  ]);
  const symbols = new Set();
  const add = (value) => {
    const symbol = String(value || "").trim().toUpperCase();
    if (/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol) && !ignored.has(symbol)) {
      symbols.add(TICKER_ALIASES[symbol] || symbol);
    }
  };

  String(message || "").match(/\$?[A-Za-z][A-Za-z0-9.-]{0,9}\b/g)?.forEach((match) => {
    const token = match.replace(/^\$/, "");
    const wasCashTagged = match.startsWith("$");
    if (wasCashTagged || token === token.toUpperCase()) add(token);
  });
  if (!symbols.size) add(fallbackTicker);

  return [...symbols].slice(0, 5);
};

const escapeRegex = (value = "") => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizeCompanyName = (value = "") =>
  String(value || "")
    .toLowerCase()
    .replace(/['’]s\b/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

const MR_RALLY_COMPANY_STOP_WORDS = new Set([
  "a", "about", "all", "also", "am", "an", "and", "any", "are", "at", "balance",
  "be", "biggest", "book", "by", "can", "cash", "catalyst", "catalysts", "change",
  "company", "compare", "could", "current", "debt", "did", "do", "does", "earnings",
  "equity", "estimate", "estimates", "for", "forward", "free", "from", "give", "gross",
  "has", "have", "how", "income", "is", "it", "long", "margin", "margins", "market",
  "its", "me", "much", "net", "next", "of", "on", "operating", "p", "pe", "price", "profit",
  "ratio", "revenue", "risk", "risks", "sales", "say", "sheet", "short", "stock",
  "stocks", "target", "tell", "term", "the", "their", "them", "this", "to", "total",
  "valuation", "what", "whats", "with", "year"
]);

const buildCompanySearchPhrase = (message = "") => {
  const normalized = normalizeCompanyName(message);
  const tokens = normalized
    .split(" ")
    .filter((token) => token.length > 1 && !MR_RALLY_COMPANY_STOP_WORDS.has(token));

  return tokens.slice(0, 6).join(" ");
};

const addResolvedSymbol = (symbols, value) => {
  const symbol = String(value || "").trim().toUpperCase();
  if (/^[A-Z][A-Z0-9.-]{0,11}$/.test(symbol)) {
    symbols.add(TICKER_ALIASES[symbol] || symbol);
  }
};

const shouldUseCurrentTickerForMrRally = (message = "", intent = {}) => {
  const normalizedMessage = normalizeCompanyName(message);
  if (/\b(this company|this stock|current company|current stock|the company|the stock)\b/.test(normalizedMessage)) {
    return true;
  }

  return Boolean(
    intent.debt ||
    intent.dividend ||
    intent.forwardPe ||
    intent.peg ||
    intent.pe ||
    intent.valuation ||
    intent.estimates ||
    intent.risk ||
    intent.catalyst ||
    intent.margins ||
    intent.cashFlow ||
    intent.target ||
    intent.statementLineItem ||
    intent.earningsCall ||
    intent.companyFacts
  );
};

async function resolveSymbolsFromCompanyName(message = "") {
  const symbols = new Set();
  const normalizedMessage = normalizeCompanyName(message);

  Object.entries(COMPANY_NAME_ALIASES).forEach(([name, symbol]) => {
    const normalizedName = normalizeCompanyName(name);
    if (normalizedName && new RegExp(`(^| )${escapeRegex(normalizedName)}( |$)`).test(normalizedMessage)) {
      addResolvedSymbol(symbols, symbol);
    }
  });

  const searchPhrase = buildCompanySearchPhrase(message);
  if (!searchPhrase) return [...symbols].slice(0, 5);

  try {
    const phraseRegex = new RegExp(escapeRegex(searchPhrase), "i");
    const cachedMatches = await Stock.find({
      $or: [
        { ticker: phraseRegex },
        { "data.symbol": phraseRegex },
        { "data.name": phraseRegex },
        { "data.longName": phraseRegex },
        { "data.shortName": phraseRegex }
      ]
    })
      .select("ticker data.symbol data.name data.longName data.shortName")
      .limit(5)
      .lean();

    cachedMatches.forEach((stock) => {
      const symbol = String(stock?.ticker || stock?.data?.symbol || "");
      if (!symbol.includes(".")) addResolvedSymbol(symbols, symbol);
    });
  } catch (err) {
    console.log("Mr. Rally company-name cache lookup skipped:", err.message);
  }

  if (symbols.size) return [...symbols].slice(0, 5);

  try {
    const { data } = await axios.get("https://query1.finance.yahoo.com/v1/finance/search", {
      params: {
        q: searchPhrase,
        quotesCount: 6,
        newsCount: 0,
        listsCount: 0
      },
      timeout: 8000,
      headers: YAHOO_CHART_HEADERS
    });

    const searchTokens = searchPhrase.split(" ").filter((token) => token.length > 1);
    (data?.quotes || [])
      .filter((quote) => quote?.quoteType === "EQUITY")
      .filter((quote) => /^[A-Z][A-Z0-9-]{0,11}$/.test(String(quote?.symbol || "")))
      .filter((quote) => {
        const label = normalizeCompanyName(`${quote.shortname || ""} ${quote.longname || ""}`);
        return !searchTokens.length || searchTokens.some((token) => label.includes(token));
      })
      .slice(0, 5)
      .forEach((quote) => addResolvedSymbol(symbols, quote.symbol));
  } catch (err) {
    console.log("Mr. Rally Yahoo company-name lookup skipped:", err.message);
  }

  return [...symbols].slice(0, 5);
}

async function resolveMrRallyHistorySymbols(history = []) {
  const recentUserMessages = [...(history || [])]
    .reverse()
    .filter((item) => item?.role === "user")
    .map((item) => item?.content || "")
    .filter(Boolean)
    .slice(0, 6);
  const recentAssistantMessages = [...(history || [])]
    .reverse()
    .filter((item) => item?.role !== "user")
    .map((item) => item?.content || "")
    .filter(Boolean)
    .slice(0, 4);

  for (const content of recentUserMessages) {
    const explicitSymbols = extractStockSymbolsFromQuestion(content);
    if (explicitSymbols.length) return explicitSymbols;

    const companySymbols = await resolveWithin(
      resolveSymbolsFromCompanyName(content),
      MR_RALLY_COMPANY_LOOKUP_TIMEOUT_MS,
      []
    );
    if (companySymbols.length) return companySymbols;
  }

  for (const content of recentAssistantMessages) {
    const explicitSymbols = extractStockSymbolsFromQuestion(content);
    if (explicitSymbols.length) return explicitSymbols;
  }

  return [];
}

async function resolveMrRallySymbols(message = "", fallbackTicker = "", intent = {}, historySymbols = []) {
  const explicitSymbols = extractStockSymbolsFromQuestion(message);
  if (explicitSymbols.length) return explicitSymbols;

  const normalizedMessage = normalizeCompanyName(message);
  if (
    historySymbols.length &&
    /\b(this company|this stock|that company|that stock|same company|same stock|the company|the stock|it|its|they|them|their)\b/.test(normalizedMessage)
  ) {
    return historySymbols;
  }

  if (historySymbols.length && shouldUseCurrentTickerForMrRally(message, intent)) {
    return historySymbols;
  }

  const companySymbols = await resolveWithin(
    resolveSymbolsFromCompanyName(message),
    MR_RALLY_COMPANY_LOOKUP_TIMEOUT_MS,
    []
  );
  if (companySymbols.length) return companySymbols;

  return fallbackTicker && shouldUseCurrentTickerForMrRally(message, intent)
    ? extractStockSymbolsFromQuestion("", fallbackTicker)
    : [];
}

async function getMrRallyStockContext(ticker, intent = {}) {
  const requestedTicker = String(ticker || "").trim().toUpperCase();
  const symbol = TICKER_ALIASES[requestedTicker] || requestedTicker;
  if (!/^[A-Z0-9.-]{1,12}$/.test(symbol)) return null;

  let stock = await Stock.findOne({ ticker: symbol });
  const needsRefresh = !stock;

  if (needsRefresh) {
    try {
      await resolveWithin(fetchStockData(symbol), 9000, null);
      stock = await Stock.findOne({ ticker: symbol });
    } catch (err) {
      console.log("Mr. Rally stock refresh skipped:", symbol, err.message);
    }
  }

  if (!stock?.data) {
    try {
      const quickData = await getImmediateStockSnapshot(symbol, {});
      return {
        symbol,
        name: quickData.name || symbol,
        source: "external market quote",
        price: quickData.price,
        change: quickData.change,
        percentChange: quickData.percentChange,
        previousClose: quickData.previousClose,
        availableData: ["quote"]
      };
    } catch (err) {
      return {
        symbol,
        name: symbol,
        source: "unavailable",
        error: "No reliable data was available for this ticker."
      };
    }
  }

  const data = withGuaranteedAnalystSection(stock.data || {});
  const analysis = buildResearchAnalysis(stock);
  const [externalFinancials, externalMetrics, externalStatements, externalWebContext] = await Promise.all([
    resolveWithin(fetchExternalFinancialContext(symbol, intent), MR_RALLY_FAST_CONTEXT_TIMEOUT_MS, null),
    resolveWithin(fetchExternalMetricContext(symbol, intent), MR_RALLY_FAST_CONTEXT_TIMEOUT_MS, null),
    resolveWithin(fetchExternalStatementContext(symbol, intent, intent.question || ""), MR_RALLY_FAST_CONTEXT_TIMEOUT_MS, null),
    resolveWithin(fetchMrRallyWebContext(symbol, intent, intent.question || ""), MR_RALLY_WEB_CONTEXT_TIMEOUT_MS, null)
  ]);
  const history = [...(data.revenueData || [])]
    .filter((row) => row?.year)
    .sort((a, b) => a.year - b.year)
    .slice(-6);

  return {
    symbol: data.symbol || symbol,
    name: data.name || symbol,
    source: "MrktRally website data",
    price: data.price,
    change: data.change,
    percentChange: data.percentChange,
    previousClose: data.previousClose,
    marketCap: data.marketCap,
    pe: data.pe,
    forwardPE: data.forwardPE,
    priceToSales: data.priceToSales,
    priceToBook: data.priceToBook,
    pegRatio: data.pegRatio,
    targetMean: data.targetMean,
    recommendationKey: data.recommendationKey,
    analystRatingText: data.analystRatingText,
    margins: {
      gross: data.grossMargins,
      operating: data.operatingMargins,
      profit: data.profitMargins
    },
    freeCashflow: data.freeCashflow,
    analystEstimates: data.analystEstimates,
    history,
    verdict: analysis.verdict,
    catalysts: analysis.stockAnalysis.catalysts,
    risks: analysis.stockAnalysis.risks,
    scenarios: analysis.stockAnalysis.scenarios,
    externalFinancials,
    externalMetrics,
    externalStatements,
    externalWebContext,
    updatedAt: stock.updatedAt
  };
}

const buildMrRallyFallbackAnswer = (question, contexts) => {
  const intent = getQuestionIntent(question);
  const usable = contexts.filter((item) => item && !item.error);
  if (!usable.length) {
    return "I could not reach the AI answer service for that question yet. Ask again in a moment, or include a ticker if you want me to use MrktRally's saved stock data.";
  }

  return usable.map((item) => {
    const estimates = item.analystEstimates || {};
    const currentYear = estimates.currentYear || {};
    const nextYear = estimates.nextYear || {};
    const externalBalance = item.externalFinancials?.balanceSheet || {};
    const externalValuation = item.externalMetrics?.valuation || {};
    const externalStatements = item.externalStatements || {};
    const externalWeb = item.externalWebContext || {};
    const lines = [`${item.symbol}: ${item.name}`];

    if (intent.earningsCall || intent.currentEvents) {
      if (externalWeb.pages?.length) {
        const page = externalWeb.pages[0];
        const snippetBullets = (externalWeb.results || [])
          .map((result) => result.snippet)
          .filter((snippet) =>
            snippet &&
            snippet.length > 80 &&
            !/provides transcripts|access historical|investor relations/i.test(snippet)
          )
          .slice(0, 4);
        const bullets = buildEarningsCallHighlightBullets(page.text);
        lines.push(`I found the recent outside transcript/source: ${page.title}.`);
        if (snippetBullets.length) {
          lines.push("Biggest items I can pull from recent outside sources:");
          snippetBullets.forEach((bullet) => lines.push(`- ${bullet}`));
        } else if (bullets.length) {
          lines.push("Biggest items I can pull from it:");
          bullets.forEach((bullet) => lines.push(`- ${bullet}`));
        } else {
          lines.push(page.snippet || page.text.slice(0, 700));
        }
        lines.push(`Source: ${page.url}`);
      } else if (externalWeb.results?.length) {
        lines.push("I found recent outside sources, but could not pull enough page text to summarize them reliably.");
        externalWeb.results.slice(0, 3).forEach((result) => {
          lines.push(`${result.title}: ${result.url}`);
        });
      } else {
        lines.push("I could not find recent earnings-call context for that question yet.");
      }
      return lines.join("\n");
    }

    if (intent.companyFacts) {
      lines.push("I need the AI/current company profile service to answer that company-fact question cleanly. Try again in a moment.");
      return lines.join("\n");
    }

    if (intent.statementLineItem) {
      if (externalStatements.lineItems?.length) {
        const period = externalStatements.period || "latest reported quarter";
        const endDate = externalStatements.endDate
          ? String(externalStatements.endDate).slice(0, 10)
          : null;
        lines.push(`${period}${endDate ? ` ended ${endDate}` : ""}:`);
        externalStatements.lineItems.forEach((line) => {
          lines.push(`${line.reportedLabel || line.label}: ${analysisMoney(line.value)}${line.percentOfRevenue !== null && line.percentOfRevenue !== undefined ? ` (${percentText(line.percentOfRevenue)} of revenue)` : ""}.`);
        });
        if (externalStatements.revenue !== null && externalStatements.revenue !== undefined) {
          lines.push(`Revenue: ${analysisMoney(externalStatements.revenue)}.`);
        }
        lines.push(`Source: ${externalStatements.source}.`);
      } else {
        lines.push("I could not find that specific line item in the latest quarterly income statement.");
      }
      return lines.join("\n");
    }

    if (intent.peg) {
      const pegRatio = firstFiniteNumber(item.pegRatio, externalValuation.pegRatio, externalValuation.trailingPegRatio);
      lines.push(`PEG ratio is ${pegRatio !== null ? `${round(pegRatio, 2)}x` : "N/A"}.`);
      if (item.externalMetrics?.source && (item.pegRatio === null || item.pegRatio === undefined)) {
        lines.push(`Source: ${item.externalMetrics.source}.`);
      }
      return lines.join("\n");
    }

    if (intent.forwardPe) {
      const forwardPe = firstFiniteNumber(item.forwardPE, externalValuation.forwardPE);
      lines.push(`Forward P/E is ${forwardPe !== null ? `${round(forwardPe, 2)}x` : "N/A"}.`);
      return lines.join("\n");
    }

    if (intent.debt) {
      lines.push(`Total debt: ${analysisMoney(externalBalance.totalDebt)}.`);
      lines.push(`Cash: ${analysisMoney(externalBalance.cash)}.`);
      lines.push(`Net debt: ${analysisMoney(externalBalance.netDebt)}.`);
      if (externalBalance.longTermDebt !== null && externalBalance.longTermDebt !== undefined) {
        lines.push(`Long-term debt: ${analysisMoney(externalBalance.longTermDebt)}.`);
      }
      if (externalBalance.currentDebt !== null && externalBalance.currentDebt !== undefined) {
        lines.push(`Current debt: ${analysisMoney(externalBalance.currentDebt)}.`);
      }
      if (externalBalance.debtToEquity !== null && externalBalance.debtToEquity !== undefined) {
        lines.push(`Debt-to-equity: ${round(externalBalance.debtToEquity, 2)}.`);
      }
      lines.push(`Source: ${item.externalFinancials?.source || "external balance-sheet data"}.`);
      return lines.join("\n");
    }

    if (intent.risk) {
      lines.push(item.risks?.length ? item.risks.join("\n") : "I do not see enough risk data for this stock yet.");
      return lines.join("\n");
    }

    if (intent.catalyst) {
      lines.push(item.catalysts?.length ? item.catalysts.join("\n") : "I do not see enough catalyst data for this stock yet.");
      return lines.join("\n");
    }

    if (intent.estimates) {
      lines.push(`Current-year estimate: revenue ${analysisMoney(currentYear.revenue)}, EPS ${currentYear.eps !== null && currentYear.eps !== undefined ? `$${round(currentYear.eps, 2)}` : "N/A"}.`);
      lines.push(`Next-year estimate: revenue ${analysisMoney(nextYear.revenue)}, EPS ${nextYear.eps !== null && nextYear.eps !== undefined ? `$${round(nextYear.eps, 2)}` : "N/A"}.`);
      return lines.join("\n");
    }

    if (intent.margins) {
      lines.push(`Gross margin: ${round(item.margins?.gross, 2) ?? "N/A"}%.`);
      lines.push(`Operating margin: ${round(item.margins?.operating, 2) ?? "N/A"}%.`);
      lines.push(`Profit margin: ${round(item.margins?.profit, 2) ?? "N/A"}%.`);
      return lines.join("\n");
    }

    if (intent.cashFlow) {
      lines.push(`Free cash flow: ${analysisMoney(item.freeCashflow)}.`);
      return lines.join("\n");
    }

    if (intent.target) {
      const targetMean = firstFiniteNumber(item.targetMean, externalValuation.analystTarget);
      const upside = item.price && targetMean ? ((targetMean - item.price) / item.price) * 100 : null;
      lines.push(`Consensus price target: ${analysisMoney(targetMean)}${upside !== null ? `, or ${round(upside, 2)}% from the current price` : ""}.`);
      return lines.join("\n");
    }

    if (intent.valuation || intent.pe) {
      lines.push(`P/E: ${round(firstFiniteNumber(item.pe, externalValuation.trailingPE), 2) ?? "N/A"}x.`);
      lines.push(`Forward P/E: ${round(firstFiniteNumber(item.forwardPE, externalValuation.forwardPE), 2) ?? "N/A"}x.`);
      lines.push(`PEG: ${round(firstFiniteNumber(item.pegRatio, externalValuation.pegRatio, externalValuation.trailingPegRatio), 2) ?? "N/A"}x.`);
      lines.push(`Price-to-sales: ${round(firstFiniteNumber(item.priceToSales, externalValuation.priceToSales), 2) ?? "N/A"}x.`);
      lines.push(`Price-to-book: ${round(firstFiniteNumber(item.priceToBook, externalValuation.priceToBook), 2) ?? "N/A"}x.`);
      return lines.join("\n");
    }

    lines.push(`Price: ${analysisMoney(item.price)}${item.percentChange !== null && item.percentChange !== undefined ? ` (${round(item.percentChange, 2)}%)` : ""}.`);
    if (item.verdict?.summary) lines.push(item.verdict.summary);
    return lines.join("\n");
  }).join("\n\n");
};

const readOpenAIText = (response) => {
  if (response?.output_text) return response.output_text.trim();

  const text = response?.output
    ?.flatMap((item) => item?.content || [])
    ?.map((part) => part?.text || part?.output_text || "")
    ?.join("")
    ?.trim();

  return text || "";
};

const readGeminiText = (response = {}) =>
  response?.candidates
    ?.flatMap((candidate) => candidate?.content?.parts || [])
    ?.map((part) => part?.text || "")
    ?.join("")
    ?.trim() || "";

function buildMrRallyAiPrompt({ message, currentTicker, intent, history, contexts, canUseLiveWeb = false }) {
  const siteContext = contexts.map((item) => ({
    symbol: item.symbol,
    name: item.name,
    source: item.source,
    price: item.price,
    change: item.change,
    percentChange: item.percentChange,
    previousClose: item.previousClose,
    marketCap: item.marketCap,
    pe: item.pe,
    forwardPE: item.forwardPE,
    pegRatio: item.pegRatio,
    priceToSales: item.priceToSales,
    priceToBook: item.priceToBook,
    targetMean: item.targetMean,
    recommendationKey: item.recommendationKey,
    analystRatingText: item.analystRatingText,
    margins: item.margins,
    freeCashflow: item.freeCashflow,
    analystEstimates: item.analystEstimates,
    recentFinancialHistory: item.history,
    verdict: item.verdict,
    catalysts: item.catalysts,
    risks: item.risks,
    scenarios: item.scenarios,
    externalFinancials: item.externalFinancials,
    externalMetrics: item.externalMetrics,
    externalStatements: item.externalStatements,
    externalWebContext: item.externalWebContext,
    updatedAt: item.updatedAt
  }));

  const instructions = [
    "You are Mr. Rally, the stock research chat inside MrktRally.",
    "Answer like a helpful ChatGPT-style market analyst, not like a database dump.",
    "Directly answer the user's exact question first. If they ask for one number, give that number and a short explanation only.",
    "Use the provided MrktRally site data as the first trusted source only when it is relevant to the exact company or topic the user asked about.",
    "If no MrktRally site context is provided, answer the user's stock, market, investing, or company question directly from your own knowledge and current public sources when search is available.",
    canUseLiveWeb
      ? "If MrktRally does not have the requested data, use web search/current public sources to answer."
      : "If MrktRally does not have the requested data, answer from the model's general knowledge only when appropriate and clearly say when current market data is not available.",
    "For basic company facts like CEO, founder, headquarters, or what the business does, answer naturally and use current public sources when search is available.",
    "When public web or transcript context is provided, use it to answer current earnings-call, news, and management-commentary questions instead of saying the data is unavailable.",
    "Do not pretend missing MrktRally data exists. If outside data fills the gap, say so briefly.",
    "For factual market data, be clear about the period or date when that matters.",
    "Keep the tone natural and conversational, but avoid personalized financial advice.",
    "Do not use the same template for every stock."
  ].join(" ");

  const userInput = [
    `Current page ticker: ${currentTicker || "none"}`,
    `Detected question intent: ${JSON.stringify(intent)}`,
    `Recent conversation: ${JSON.stringify(history)}`,
    `MrktRally site context: ${JSON.stringify(siteContext)}`,
    `User question: ${message}`
  ].join("\n\n");

  return { instructions, userInput };
}

async function buildMrRallyOpenAiAnswer({ message, currentTicker, intent, history, contexts }) {
  const canUseLiveWeb = Boolean(!contexts.length || intent.currentEvents || intent.earningsCall || intent.companyFacts);
  const { instructions, userInput } = buildMrRallyAiPrompt({
    message,
    currentTicker,
    intent,
    history,
    contexts,
    canUseLiveWeb
  });

  try {
    const responseOptions = {
      model: process.env.MR_RALLY_MODEL || "gpt-4.1-mini",
      instructions,
      input: userInput,
      max_output_tokens: 700,
      temperature: 0.35
    };

    if (canUseLiveWeb) {
      responseOptions.tools = [
        {
          type: "web_search_preview",
          search_context_size: "low",
          user_location: {
            type: "approximate",
            country: "US"
          }
        }
      ];
      responseOptions.tool_choice = "auto";
    }

    const response = await openai.responses.create({
      ...responseOptions
    });

    const answer = readOpenAIText(response);
    if (answer) return answer;
  } catch (err) {
    console.log("Mr. Rally Responses API skipped:", err.message);
  }

  const completion = await openai.chat.completions.create({
    model: process.env.MR_RALLY_MODEL || "gpt-4.1-mini",
    temperature: 0.35,
    max_tokens: 700,
    messages: [
      { role: "system", content: instructions },
      { role: "user", content: userInput }
    ]
  });

  return completion.choices?.[0]?.message?.content?.trim() || buildMrRallyFallbackAnswer(message, contexts);
}

async function buildMrRallyGeminiAnswer({ message, currentTicker, intent, history, contexts }) {
  const canUseLiveWeb = Boolean(!contexts.length || intent.currentEvents || intent.earningsCall || intent.companyFacts);
  const { instructions, userInput } = buildMrRallyAiPrompt({
    message,
    currentTicker,
    intent,
    history,
    contexts,
    canUseLiveWeb
  });

  const model = process.env.MR_RALLY_GEMINI_MODEL || "gemini-2.5-flash";
  const requestBody = {
      systemInstruction: {
        parts: [{ text: instructions }]
      },
      contents: [
        {
          role: "user",
          parts: [{ text: userInput }]
        }
      ],
      generationConfig: {
        temperature: 0.35,
        maxOutputTokens: 700
      }
    };

  if (canUseLiveWeb) {
    requestBody.tools = [
      { google_search: {} }
    ];
  }

  try {
    const { data } = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      requestBody,
      {
        params: { key: geminiApiKey },
        timeout: MR_RALLY_AI_TIMEOUT_MS
      }
    );

    return readGeminiText(data) || buildMrRallyFallbackAnswer(message, contexts);
  } catch (err) {
    const messageText = err.response?.data?.error?.message || err.message;
    if (!/tool|google_search|search|unsupported|invalid/i.test(messageText)) throw err;
    console.log("Mr. Rally Gemini search grounding skipped:", messageText);
  }

  const { data } = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      ...requestBody,
      tools: undefined
    },
    {
      params: { key: geminiApiKey },
      timeout: MR_RALLY_AI_TIMEOUT_MS
    }
  );

  return readGeminiText(data) || buildMrRallyFallbackAnswer(message, contexts);
}

async function buildMrRallyGroqAnswer({ message, currentTicker, intent, history, contexts }) {
  const { instructions, userInput } = buildMrRallyAiPrompt({
    message,
    currentTicker,
    intent,
    history,
    contexts,
    canUseLiveWeb: false
  });

  const model = process.env.MR_RALLY_GROQ_MODEL || "llama-3.3-70b-versatile";
  const { data } = await axios.post(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      model,
      temperature: 0.35,
      max_tokens: 650,
      messages: [
        { role: "system", content: instructions },
        { role: "user", content: userInput }
      ]
    },
    {
      headers: {
        Authorization: `Bearer ${groqApiKey}`,
        "Content-Type": "application/json"
      },
      timeout: 9000
    }
  );

  return data?.choices?.[0]?.message?.content?.trim() || "";
}

async function buildMrRallyAiAnswer({ message, currentTicker, intent, history, contexts }) {
  if (groqApiKey) {
    try {
      const groqAnswer = await buildMrRallyGroqAnswer({ message, currentTicker, intent, history, contexts });
      if (groqAnswer) return groqAnswer;
    } catch (err) {
      const status = err.response?.status ? ` (${err.response.status})` : "";
      const detail = err.response?.data?.error?.message || err.message;
      console.log(`Mr. Rally Groq answer skipped${status}:`, detail);
    }
  }

  if (geminiApiKey) {
    try {
      return await buildMrRallyGeminiAnswer({ message, currentTicker, intent, history, contexts });
    } catch (err) {
      const status = err.response?.status ? ` (${err.response.status})` : "";
      const detail = err.response?.data?.error?.message || err.message;
      console.log(`Mr. Rally Gemini answer skipped${status}:`, detail);
    }
  }

  if (openai) {
    try {
      return await buildMrRallyOpenAiAnswer({ message, currentTicker, intent, history, contexts });
    } catch (err) {
      console.log("Mr. Rally OpenAI answer skipped:", err.message);
    }
  }

  return buildMrRallyFallbackAnswer(message, contexts);
}

app.post("/api/mr-rally-chat", async (req, res) => {
  try {
    const message = String(req.body?.message || "").trim();
    const currentTicker = String(req.body?.ticker || "").trim().toUpperCase();
    const intent = { ...getQuestionIntent(message), question: message };
    const history = Array.isArray(req.body?.history)
      ? req.body.history.slice(-6).map((item) => ({
          role: item.role === "user" ? "user" : "assistant",
          content: String(item.content || "").slice(0, 1200)
        }))
      : [];

    if (!message) {
      return res.status(400).json({ error: "Ask Mr. Rally a question first." });
    }

    const historySymbols = await resolveMrRallyHistorySymbols(history);
    const symbols = await resolveMrRallySymbols(message, currentTicker, intent, historySymbols);
    const contexts = (await Promise.all(symbols.map((symbol) =>
      getMrRallyStockContext(symbol, intent)
    ))).filter(Boolean);

    const answer = await resolveWithin(
      buildMrRallyAiAnswer({
        message,
        currentTicker: historySymbols.length ? historySymbols[0] : currentTicker,
        intent,
        history,
        contexts
      }),
      MR_RALLY_AI_TIMEOUT_MS + 1000,
      null
    ) || buildMrRallyFallbackAnswer(message, contexts);

    return res.json({
      answer,
      symbols: contexts.map((item) => item.symbol),
      sources: [...new Set(contexts.flatMap((item) =>
        [item.source, item.externalFinancials?.source, item.externalMetrics?.source, item.externalStatements?.source, item.externalWebContext?.source].filter(Boolean)
      ))]
    });
  } catch (err) {
    console.error("Mr. Rally chat failed:", err.message);
    return res.status(500).json({ error: "Mr. Rally is temporarily unavailable." });
  }
});

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

async function fetchFinnhubEarningsCall(ticker, requestedPeriod = null) {
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
  const sortedItems = [...items].sort((a, b) =>
    new Date(b.time || `${b.year}-${b.quarter || 1}`) -
    new Date(a.time || `${a.year}-${a.quarter || 1}`)
  );
  const latest = requestedPeriod
    ? sortedItems.find((item) =>
        Number(item.year) === requestedPeriod.year &&
        Number(item.quarter) === requestedPeriod.quarter
      )
    : sortedItems[0];
  if (!latest) return null;
  const detailResponse = await axios.get(
    "https://finnhub.io/api/v1/stock/transcripts",
    {
      params: { id: latest.id, token: process.env.FINNHUB_API_KEY },
      timeout: 20000
    }
  );
  const detail = detailResponse.data || {};
  const transcript = (detail.transcript || []).map((section, index) => ({
    id: `${index}-${section.name || "speaker"}`,
    speaker: section.name || "Speaker",
    session: section.session || null,
    text: Array.isArray(section.speech)
      ? section.speech.join(" ")
      : String(section.speech || "")
  })).filter((section) => section.text);

  if (!transcript.length) return null;

  return {
    available: true,
    provider: "Finnhub",
    title: detail.title || latest.title || `${ticker} earnings call`,
    date: detail.time || latest.time,
    fiscalYear: detail.year || latest.year,
    fiscalPeriod: detail.quarter ? `Q${detail.quarter}` : null,
    audioUrl: null,
    transcriptUrl: null,
    transcript
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

async function extractPdfText(buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result?.text || "";
  } finally {
    await parser.destroy().catch(() => {});
  }
}

function stripHtmlToText(html) {
  const $ = cheerio.load(html || "");
  $("script, style, nav, header, footer, iframe, noscript").remove();
  return $("body").text().replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

async function fetchTranscriptSectionsFromUrl(transcriptUrl) {
  if (!transcriptUrl) return [];

  const response = await axios.get(transcriptUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept: "application/pdf,text/html,text/plain,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    },
    responseType: "arraybuffer",
    timeout: 12000,
    maxRedirects: 4,
    validateStatus: (status) => status >= 200 && status < 400
  });

  const contentType = String(response.headers["content-type"] || "").toLowerCase();
  const buffer = Buffer.from(response.data);
  const looksLikePdf =
    contentType.includes("pdf") ||
    transcriptUrl.toLowerCase().includes(".pdf") ||
    buffer.subarray(0, 4).toString() === "%PDF";

  const text = looksLikePdf
    ? await extractPdfText(buffer)
    : /html|xml/i.test(contentType)
      ? stripHtmlToText(buffer.toString("utf8"))
      : buffer.toString("utf8");

  return splitPlainTranscript(text)
    .filter((section) =>
      section.text.length > 40 &&
      !/^(table of contents|safe harbor|copyright)$/i.test(section.text.trim())
    )
    .slice(0, 160);
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
    "/news",
    "/news-releases",
    "/press-releases",
    "/investor-news",
    "/investor-news-events",
    "/investor-relations/news",
    "/investor-relations/news-releases",
    "/investor-relations/press-releases",
    "/investors/news",
    "/investors/news-releases",
    "/investors/press-releases",
    "/financial-information/earnings-annual-reports",
    "/financial-information/quarterly-results",
    "/financial-information/quarterly-earnings",
    "/financials/quarterly-results",
    "/financials/quarterly-earnings",
    "/financial-results",
    "/quarterly-results",
    "/quarterly-earnings",
    "/investors",
    "/investor-relations",
    "/investor",
    "/ir",
    "/news-events/events-presentations",
    "/events-and-presentations",
    "/events-presentations",
    "/events",
    "/news-events/press-releases",
    "/news-events/news-releases",
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
  return [...pages].slice(0, 48);
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

function extractIrTranscriptLinks(html, pageUrl, ticker) {
  const $ = cheerio.load(html || "");
  const links = [];
  const seen = new Set();
  const escapedTicker = String(ticker).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tickerPattern = new RegExp(`\\b${escapedTicker}\\b`, "i");

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href");
    const resolved = resolvePublicUrl(href, pageUrl);
    if (!resolved || seen.has(resolved) || isExcludedIrAudioHost(resolved)) return;
    const parsedResolved = new URL(resolved);
    const parsedPage = new URL(pageUrl);
    if (
      parsedResolved.origin === parsedPage.origin &&
      parsedResolved.pathname === parsedPage.pathname &&
      parsedResolved.hash
    ) return;
    const contextText = $(element)
      .closest("tr, li, article, section")
      .text()
      .trim()
      .replace(/\s+/g, " ");
    const directLabel = [
      $(element).text(),
      $(element).attr("title"),
      $(element).attr("aria-label"),
      resolved
    ].filter(Boolean).join(" ");
    if (!/transcript/i.test(directLabel)) return;
    const label = [
      directLabel,
      contextText,
    ].filter(Boolean).join(" ");
    seen.add(resolved);
    const currentYear = new Date().getFullYear();
    const orderBonus = Math.max(0, 40 - links.length);
    const score =
      (/earnings|quarter|results|conference|webcast|call|replay/i.test(label) ? 6 : 0) +
      (/transcript/i.test(label) ? 5 : 0) +
      (/pdf|html|webcast_transcript/i.test(label) ? 2 : 0) +
      (tickerPattern.test(label) ? 2 : 0) +
      (new RegExp(`\\b${currentYear}\\b`).test(label) ? 5 : 0) +
      (new RegExp(`\\b${currentYear - 1}\\b`).test(label) ? 3 : 0) +
      (new RegExp(`\\b${currentYear + 1}\\b`).test(label) ? 2 : 0) +
      orderBonus;
    links.push({
      transcriptUrl: resolved,
      title: $(element).text().trim() || `${ticker} earnings call transcript`,
      score,
      pageUrl
    });
  });

  return links;
}

function extractIrDocumentLinks(html, pageUrl, ticker) {
  const $ = cheerio.load(html || "");
  const links = [];
  const seen = new Set();
  const escapedTicker = String(ticker).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tickerPattern = new RegExp(`\\b${escapedTicker}\\b`, "i");
  const currentYear = new Date().getFullYear();

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href");
    const resolved = resolvePublicUrl(href, pageUrl);
    if (!resolved || seen.has(resolved) || isExcludedIrAudioHost(resolved)) return;

    const parsedResolved = new URL(resolved);
    const parsedPage = new URL(pageUrl);
    if (
      parsedResolved.origin === parsedPage.origin &&
      parsedResolved.pathname === parsedPage.pathname &&
      parsedResolved.hash
    ) return;

    const contextText = $(element)
      .closest("tr, li, article, section, div")
      .text()
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 400);
    const label = [
      $(element).text(),
      $(element).attr("title"),
      $(element).attr("aria-label"),
      contextText,
      resolved
    ].filter(Boolean).join(" ");
    const isDocumentUrl = /\.(pdf|htm|html)(?:$|\?)/i.test(parsedResolved.pathname);
    const looksLikeResultsDocument =
      /earnings|quarter|results|release|financial results|press release|shareholder letter|presentation|supplement|10-k|10-q|annual report/i.test(label);

    if (!isDocumentUrl || !looksLikeResultsDocument) return;
    seen.add(resolved);

    const score =
      scoreIrResultsDocument(label, resolved, links.length) +
      (tickerPattern.test(label) ? 3 : 0) +
      (new RegExp(`\\b${currentYear}\\b`).test(label) ? 4 : 0) +
      (new RegExp(`\\b${currentYear - 1}\\b`).test(label) ? 2 : 0) -
      (/presentation|supplement|slides/i.test(label) && !/release|reports? .*results/i.test(label) ? 10 : 0) -
      (/10-k|10-q|annual report/i.test(label) && !/earnings|results|press release/i.test(label) ? 8 : 0);

    links.push({
      title: $(element).text().trim() || $(element).attr("title") || `${ticker} results document`,
      url: resolved,
      type: /\.pdf(?:$|\?)/i.test(parsedResolved.pathname) ? "PDF" : "HTML",
      pageUrl,
      source: "Investor Relations",
      score
    });
  });

  return links;
}

function scoreIrResultsDocument(label, url, orderIndex = 0) {
  const text = `${label || ""} ${url || ""}`;
  const currentYear = new Date().getFullYear();
  const orderBonus = Math.max(0, 30 - orderIndex);
  const isLatestYear =
    new RegExp(`\\b${currentYear}\\b`).test(text) ||
    new RegExp(`\\b${currentYear - 1}\\b`).test(text) ||
    new RegExp(`\\b${currentYear + 1}\\b`).test(text);

  return (
    (/reports? (first|second|third|fourth|fiscal|quarter|annual|full.year)?.{0,30}results/i.test(text) ? 22 : 0) +
    (/quarterly results|financial results|earnings results|fiscal .* results|results release/i.test(text) ? 18 : 0) +
    (/earnings release|press release|news release/i.test(text) ? 12 : 0) +
    (/ceo|chief executive|commented|said/i.test(text) ? 6 : 0) +
    (/income statement|statements? of operations|balance sheet|cash flows?|cash flow statement/i.test(text) ? 8 : 0) +
    (/highlights|quarter highlights|business highlights|financial highlights/i.test(text) ? 5 : 0) +
    (/q[1-4]|first quarter|second quarter|third quarter|fourth quarter|full year|annual/i.test(text) ? 5 : 0) +
    (/pdf/i.test(text) ? 4 : 0) +
    (isLatestYear ? 8 : 0) +
    orderBonus
  );
}

function extractIrPageResultDocument(html, pageUrl, ticker) {
  const $ = cheerio.load(html || "");
  $("script, style, nav, header, footer, iframe, noscript").remove();
  const title =
    $("meta[property='og:title']").attr("content") ||
    $("h1").first().text().trim() ||
    $("title").first().text().trim();
  const bodyText = $("body").text().replace(/\s+/g, " ").trim().slice(0, 5000);
  const label = `${title} ${bodyText}`;
  const score = scoreIrResultsDocument(label, pageUrl, 0);
  const looksLikeRelease =
    score >= 34 &&
    /results|earnings|quarter|fiscal|financial/i.test(label) &&
    !/transcript|webcast replay|presentation only/i.test(label);

  if (!looksLikeRelease) return null;

  const date =
    $("time[datetime]").first().attr("datetime") ||
    $("meta[property='article:published_time']").attr("content") ||
    $("meta[name='date']").attr("content") ||
    null;

  return {
    title: title || `${ticker} latest results release`,
    url: pageUrl,
    type: "Results Release",
    source: "Investor Relations release",
    filingDate: date ? String(date).slice(0, 10) : null,
    score
  };
}

async function fetchInvestorRelationsDocumentsFromPage(pageUrl, ticker) {
  const html = await fetchHtmlPage(pageUrl);
  if (!html) return { documents: [], discoveredPages: [] };

  const documents = [
    extractIrPageResultDocument(html, pageUrl, ticker),
    ...extractIrDocumentLinks(html, pageUrl, ticker)
  ].filter(Boolean);
  const discoveredPages = [];
  const $ = cheerio.load(html);
  $("a[href]").each((_, element) => {
    const label = `${$(element).text()} ${$(element).attr("href") || ""}`;
    if (!/earnings|quarter|results|news|press|release|financial|reports|presentations|events/i.test(label)) return;
    const resolved = resolvePublicUrl($(element).attr("href"), pageUrl);
    if (resolved && !isExcludedIrAudioHost(resolved)) {
      discoveredPages.push(resolved);
    }
  });

  return { documents, discoveredPages };
}

async function getCompanyInvestorRelationsUrl(ticker) {
  if (KNOWN_COMPANY_WEBSITES[ticker]) {
    return KNOWN_COMPANY_WEBSITES[ticker];
  }

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

function isStockAnalysisAudioUrl(audioUrl) {
  try {
    const parsed = new URL(audioUrl);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    return (
      host === "files.quartr.com" &&
      /^\/audio-files\/[^/?#]+\.(?:mpeg|mp3|m4a|wav|mp4)$/i.test(parsed.pathname)
    );
  } catch {
    return false;
  }
}

function cleanStockAnalysisAudioUrl(audioUrl) {
  const cleaned = String(audioUrl || "")
    .replace(/\\u0026/g, "&")
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&")
    .trim();
  return isStockAnalysisAudioUrl(cleaned) ? cleaned : null;
}

function extractStockAnalysisAudioUrl(html = "") {
  const text = String(html || "");
  const directMatch = text.match(/audioUrl:\s*"([^"]+)"/);
  const directUrl = cleanStockAnalysisAudioUrl(directMatch?.[1]);
  if (directUrl) return directUrl;

  const fileMatch = text.match(/https?:\\?\/\\?\/files\.quartr\.com\\?\/audio-files\\?\/[^"'\\\s<>]+/i);
  return cleanStockAnalysisAudioUrl(fileMatch?.[0]);
}

function buildStockAnalysisAudioProxyUrl(apiBaseUrl, ticker, audioUrl) {
  const params = new URLSearchParams({ url: audioUrl });
  return `${apiBaseUrl}/api/earnings-call/${encodeURIComponent(ticker)}/stockanalysis-audio?${params}`;
}

function buildEarningsTranscriptProxyUrl(apiBaseUrl, ticker, transcriptUrl) {
  const params = new URLSearchParams({ url: transcriptUrl });
  return `${apiBaseUrl}/api/earnings-call/${encodeURIComponent(ticker)}/transcript-file?${params}`;
}

async function fetchInvestorRelationsDocuments(ticker) {
  const companyUrl = await getCompanyInvestorRelationsUrl(ticker);
  if (!companyUrl) return [];

  const candidatePages = buildIrCandidatePages(companyUrl);
  const discoveredPages = new Set(candidatePages);
  const documentLinks = [];

  const fetchPage = async (pageUrl) =>
    resolveWithin(
      fetchInvestorRelationsDocumentsFromPage(pageUrl, ticker).catch(() => ({ documents: [], discoveredPages: [] })),
      3500,
      { documents: [], discoveredPages: [] }
    );
  const primaryResults = await Promise.all(candidatePages.slice(0, 24).map(fetchPage));
  primaryResults.forEach((result) => {
    documentLinks.push(...result.documents);
    result.discoveredPages.forEach((pageUrl) => {
      if (discoveredPages.size < 48) discoveredPages.add(pageUrl);
    });
  });

  const secondaryPages = [...discoveredPages]
    .slice(candidatePages.length)
    .filter((pageUrl) => /earnings|quarter|results|news|press|release|financial/i.test(pageUrl))
    .slice(0, 24);
  const secondaryResults = await Promise.all(secondaryPages.map(fetchPage));
  secondaryResults.forEach((result) => {
    documentLinks.push(...result.documents);
  });

  const byUrl = new Map();
  documentLinks.forEach((document) => {
    const existing = byUrl.get(document.url);
    if (!existing || document.score > existing.score) {
      byUrl.set(document.url, document);
    }
  });

  return [...byUrl.values()]
    .filter((document) => document.score >= 18)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);
}

async function classifyInvestorRelationsMedia(candidate) {
  try {
    const response = await axios.get(candidate.audioUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Range: "bytes=0-1023"
      },
      responseType: "stream",
      timeout: 8000,
      maxRedirects: 4,
      validateStatus: (status) => status >= 200 && status < 400
    });
    response.data.destroy?.();
    const contentType = String(response.headers["content-type"] || "").toLowerCase();

    if (/audio|mpeg|mp3|mp4|octet-stream/.test(contentType)) {
      return {
        ...candidate,
        mediaKind: "audio",
        contentType
      };
    }

    if (/html|text/.test(contentType)) {
      return {
        ...candidate,
        mediaKind: "webcast",
        contentType
      };
    }
  } catch (err) {
    if (isLikelyAudioUrl(candidate.audioUrl)) {
      return {
        ...candidate,
        mediaKind: "audio",
        contentType: null
      };
    }
  }

  return null;
}

async function fetchInvestorRelationsAudio(ticker, apiBaseUrl = "", options = {}) {
  const companyUrl = await getCompanyInvestorRelationsUrl(ticker);
  if (!companyUrl) return null;

  const candidatePages = buildIrCandidatePages(companyUrl);
  const discoveredPages = new Set(candidatePages);
  const audioLinks = [];
  const transcriptLinks = [];

  for (const pageUrl of candidatePages) {
    try {
      const html = await fetchHtmlPage(pageUrl);
      if (!html) continue;
      audioLinks.push(...extractIrAudioLinks(html, pageUrl, ticker));
      transcriptLinks.push(...extractIrTranscriptLinks(html, pageUrl, ticker));

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
      transcriptLinks.push(...extractIrTranscriptLinks(html, pageUrl, ticker));
    } catch {
      // Keep the IR finder best-effort.
    }
  }

  const rankedLinks = audioLinks
    .filter((link) => link.score >= 6)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  const transcript = transcriptLinks
    .filter((link) => link.score > 0)
    .sort((a, b) => b.score - a.score)[0] || null;

  if (options.transcriptOnly) {
    if (!transcript) return null;
    const transcriptSections = await fetchTranscriptSectionsFromUrl(transcript.transcriptUrl)
      .catch((err) => {
        console.log("IR transcript text extraction skipped:", ticker, err.response?.status || err.message);
        return [];
      });
    return {
      available: true,
      provider: "Investor Relations",
      title: transcript.title || `${ticker} earnings call transcript`,
      date: null,
      fiscalYear: null,
      fiscalPeriod: null,
      audioUrl: null,
      webcastUrl: null,
      rawAudioUrl: null,
      transcriptUrl: transcript.transcriptUrl,
      transcript: transcriptSections,
      sourceUrl: transcript.pageUrl,
      transcriptSourceUrl: transcript.pageUrl
    };
  }

  let best = null;
  for (const candidate of rankedLinks) {
    best = await classifyInvestorRelationsMedia(candidate);
    if (best) break;
  }

  if (!best && !transcript) return null;

  return {
    available: true,
    provider: "Investor Relations",
    title: best?.title || transcript?.title || `${ticker} earnings call transcript`,
    date: null,
    fiscalYear: null,
    fiscalPeriod: null,
    audioUrl: best?.mediaKind === "audio"
      ? (apiBaseUrl
        ? buildEarningsAudioProxyUrl(apiBaseUrl, ticker, best.audioUrl)
        : best.audioUrl)
      : null,
    webcastUrl: best?.mediaKind === "webcast" ? best.audioUrl : null,
    rawAudioUrl: best?.audioUrl || null,
    transcriptUrl: transcript?.transcriptUrl || null,
    transcript: [],
    sourceUrl: best?.pageUrl || transcript?.pageUrl || null,
    transcriptSourceUrl: transcript?.pageUrl || null
  };
}

async function fetchAlphaVantageEarningsCall(ticker, knownFiscalPeriod = null, requestedPeriod = null) {
  const apiKey = getAlphaVantageApiKey();
  if (!apiKey) return null;
  const buildFallbackPeriods = async () => {
    const fiscalPeriod = knownFiscalPeriod || await getLatestSecFiscalPeriod(ticker);
    const now = new Date();
    const currentQuarter = Math.floor(now.getUTCMonth() / 3) + 1;
    const fallbackQuarter = currentQuarter === 1 ? 4 : currentQuarter - 1;
    const fallbackYear = currentQuarter === 1 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
    const startingYear = fiscalPeriod?.year || fallbackYear;
    const startingQuarter = fiscalPeriod?.quarter || fallbackQuarter;
    return Array.from({ length: 2 }, (_, index) => {
      const zeroBasedQuarter = startingQuarter - 1 - index;
      return {
        year: startingYear + Math.floor(zeroBasedQuarter / 4),
        quarter: ((zeroBasedQuarter % 4) + 4) % 4 + 1
      };
    });
  };
  const periodsToTry = requestedPeriod
    ? [requestedPeriod]
    : await buildFallbackPeriods();

  for (const { year, quarter } of periodsToTry) {
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
  providerError.fiscalPeriod = periodsToTry.map(({ year, quarter }) => `${year}Q${quarter}`).join(" through ");
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

function parseEarningsCallPublicTranscript(html, ticker, requestedPeriod = null, pageUrl = "") {
  const $ = cheerio.load(html || "");
  const transcript = $(".call-text-container .content").map((index, element) => {
    const speaker = $(element).find(".speaker-name").first().text().trim() || "Speaker";
    const session = $(element).find(".designation").first().text().trim() || null;
    const text = $(element).find(".call-text").first().text().replace(/\s+/g, " ").trim();
    return text
      ? {
          id: `${index}-${speaker}`,
          speaker,
          session,
          text
        }
      : null;
  }).get().filter(Boolean);

  if (!transcript.length) return null;

  const title = $("title").first().text().trim() ||
    `${ticker} ${requestedPeriod ? `Q${requestedPeriod.quarter} ${requestedPeriod.year}` : ""} earnings call transcript`;
  const dateText = $(".call-date-container").first().text().replace(/share/i, "").trim();
  const dateMatch = dateText.match(/\d{1,2}\/\d{1,2}\/\d{4}/);

  return {
    available: true,
    provider: "EarningsCall",
    title,
    date: dateMatch ? dateMatch[0] : null,
    fiscalYear: requestedPeriod?.year || null,
    fiscalPeriod: requestedPeriod ? `Q${requestedPeriod.quarter}` : null,
    audioUrl: null,
    transcriptUrl: null,
    transcript,
    sourceUrl: pageUrl,
    transcriptSourceUrl: pageUrl
  };
}

function parseStockAnalysisTranscript(html, ticker, requestedPeriod = null, pageUrl = "") {
  const $ = cheerio.load(html || "");
  const audioUrl = extractStockAnalysisAudioUrl(html);
  $("script,style,noscript,nav,footer,header,aside").remove();

  const transcriptRoot = $('[aria-label="Full transcript"] [role="article"]').first();
  const transcriptBlocks = transcriptRoot.length
    ? transcriptRoot.find("div").filter((_, element) => {
        const className = $(element).attr("class") || "";
        const hasSectionBorder = className.split(/\s+/).includes("border-t");
        return hasSectionBorder && $(element).children("div").first().text().trim() && $(element).find("p").length;
      })
    : $();

  const transcript = transcriptBlocks.map((index, element) => {
    const speaker = $(element).children("div").first().text().replace(/\s+/g, " ").trim() || "Speaker";
    const paragraphs = $(element).find("p").map((_, paragraph) =>
      $(paragraph).text().replace(/\s+/g, " ").trim()
    ).get().filter(Boolean);
    const text = paragraphs.join("\n\n");
    return text
      ? {
          id: `${index}-${speaker}`,
          speaker,
          session: null,
          text
        }
      : null;
  }).get().filter(Boolean);

  if (!transcript.length) return null;

  const title = $("title").first().text().trim() ||
    `${ticker} ${requestedPeriod ? `Q${requestedPeriod.quarter} ${requestedPeriod.year}` : ""} earnings call transcript`;
  const pageText = $("main").first().text().replace(/\s+/g, " ").trim();
  const dateMatch = pageText.match(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},\s+20\d{2}\b/i);

  return {
    available: true,
    provider: "StockAnalysis",
    title,
    date: dateMatch ? dateMatch[0] : null,
    fiscalYear: requestedPeriod?.year || null,
    fiscalPeriod: requestedPeriod ? `Q${requestedPeriod.quarter}` : null,
    audioUrl,
    transcriptUrl: null,
    transcript,
    sourceUrl: pageUrl,
    transcriptSourceUrl: pageUrl
  };
}

async function fetchStockAnalysisEarningsCall(ticker, requestedPeriod = null) {
  if (!requestedPeriod) return null;
  if (!canUseStockAnalysis()) return null;
  const symbol = normalizeTickerForStockAnalysis(ticker);
  if (!symbol || !/^[a-z0-9.-]{1,15}$/.test(symbol)) return null;

  const cacheKey = `${symbol}-${requestedPeriod.year}-Q${requestedPeriod.quarter}`;
  const cached = earningsCallTranscriptCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < 60 * 60 * 1000) {
    return cached.data;
  }

  const cachedPeriodData = earningsCallPeriodsCache.get(String(ticker || "").trim().toUpperCase());
  const hasCachedStockAnalysisPeriods = (cachedPeriodData?.data?.periods || [])
    .some((item) => item.provider === "StockAnalysis");
  const periods = cachedPeriodData && hasCachedStockAnalysisPeriods && Date.now() - cachedPeriodData.fetchedAt < 60 * 60 * 1000
    ? (cachedPeriodData.data?.periods || []).filter((item) => item.provider === "StockAnalysis")
    : await fetchStockAnalysisEarningsCallPeriods(ticker);
  const period = periods.find((item) =>
    Number(item.year) === requestedPeriod.year &&
    Number(item.quarter) === requestedPeriod.quarter &&
    item.sourceUrl
  );
  if (!period?.sourceUrl) return null;
  const indexUrl = period.indexUrl || buildStockAnalysisTranscriptIndexUrls(ticker)[0] || period.sourceUrl;

  try {
    const html = await fetchStockAnalysisTranscriptHtml(period.sourceUrl, indexUrl, 12000);
    if (!html) return null;
    const parsed = parseStockAnalysisTranscript(html, ticker, requestedPeriod, period.sourceUrl);
    if (parsed) {
      earningsCallTranscriptCache.set(cacheKey, { data: parsed, fetchedAt: Date.now() });
      return parsed;
    }
  } catch (err) {
    setStockAnalysisCooldown(err, "transcript", ticker);
    console.log("StockAnalysis transcript skipped:", ticker, requestedPeriod.year, requestedPeriod.quarter, err.response?.status || err.message);
  }

  return null;
}

async function fetchEarningsCallPublicPage(ticker, requestedPeriod = null) {
  if (!requestedPeriod) return null;

  const quote = await yahooFinance.quote(ticker).catch(() => ({}));
  const preferredExchange = normalizeEarningsCallExchange(quote.exchange);
  const exchanges = preferredExchange
    ? [preferredExchange, ...EARNINGS_CALL_EXCHANGES.filter((item) => item !== preferredExchange)]
    : EARNINGS_CALL_EXCHANGES;
  const symbol = encodeURIComponent(ticker.toLowerCase());

  for (const exchange of exchanges) {
    const pageUrl = `https://earningscall.biz/e/${exchange.toLowerCase()}/s/${symbol}/y/${requestedPeriod.year}/q/q${requestedPeriod.quarter}`;
    try {
      const response = await axios.get(pageUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        },
        timeout: 18000,
        validateStatus: (status) => status >= 200 && status < 500
      });
      if (response.status === 404) continue;
      if (response.status >= 400) throw new Error(`EarningsCall public page returned ${response.status}`);
      const parsed = parseEarningsCallPublicTranscript(response.data, ticker, requestedPeriod, pageUrl);
      if (parsed) return parsed;
    } catch (err) {
      if (![401, 403, 404].includes(err.response?.status)) {
        console.log("EarningsCall public transcript skipped:", ticker, exchange, requestedPeriod.year, requestedPeriod.quarter, err.response?.status || err.message);
      }
    }
  }

  return null;
}

async function fetchEarningsCallBiz(ticker, apiBaseUrl, requestedPeriod = null) {
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
      const sortedEvents = events
        .filter((event) => event.is_published !== false)
        .sort((a, b) =>
          new Date(b.conference_date || `${b.year}-${b.quarter}`) -
          new Date(a.conference_date || `${a.year}-${a.quarter}`)
        );
      const latest = requestedPeriod
        ? sortedEvents.find((event) =>
            Number(event.year) === requestedPeriod.year &&
            Number(event.quarter) === requestedPeriod.quarter
          )
        : sortedEvents[0];
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

app.get("/api/earnings-call/:ticker/stockanalysis-audio", async (req, res) => {
  const ticker = req.params.ticker.trim().toUpperCase();
  const audioUrl = String(req.query.url || "");

  if (!/^[A-Z0-9.-]{1,15}$/.test(ticker) || !isStockAnalysisAudioUrl(audioUrl)) {
    return res.status(400).json({ error: "Invalid StockAnalysis audio request" });
  }

  try {
    const upstream = await axios.get(audioUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "audio/*,*/*;q=0.8",
        Referer: "https://stockanalysis.com/",
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
    console.error("StockAnalysis audio proxy failed:", ticker, err.response?.status || err.message);
    return res.status(502).json({ error: "StockAnalysis earnings call audio unavailable" });
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

app.get("/api/earnings-call/:ticker/transcript-file", async (req, res) => {
  const ticker = req.params.ticker.trim().toUpperCase();
  const transcriptUrl = String(req.query.url || "");

  if (!/^[A-Z0-9.-]{1,15}$/.test(ticker) || !transcriptUrl) {
    return res.status(400).json({ error: "Invalid transcript request" });
  }

  try {
    const cached = await EarningsCall.findOne({ ticker }).lean();
    const cachedData = cached?.data || {};
    const allowedUrls = new Set([
      cachedData.rawTranscriptUrl,
      cachedData.transcriptUrl,
      cachedData.transcriptSourceUrl
    ].filter(Boolean));

    if (!allowedUrls.has(transcriptUrl)) {
      return res.status(403).json({ error: "Transcript URL is not approved for this ticker" });
    }

    const upstream = await axios.get(transcriptUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "application/pdf,text/html,text/plain,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      },
      responseType: "stream",
      timeout: 30000,
      maxRedirects: 4,
      validateStatus: (status) => status >= 200 && status < 400
    });

    const contentType = upstream.headers["content-type"] || "application/pdf";
    res.status(upstream.status);
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.setHeader("X-Content-Type-Options", "nosniff");
    return upstream.data.pipe(res);
  } catch (err) {
    console.error("Transcript proxy failed:", ticker, err.response?.status || err.message);
    return res.status(502).json({ error: "Transcript file unavailable" });
  }
});

app.get("/api/company-documents/:ticker", async (req, res) => {
  const ticker = req.params.ticker.trim().toUpperCase();
  if (!/^[A-Z0-9.-]{1,15}$/.test(ticker)) {
    return res.status(400).json({ available: false, error: "Invalid ticker" });
  }

  try {
    const data = await fetchCompanyDocuments(ticker);
    return res.json(data);
  } catch (err) {
    console.error("Company documents fetch failed:", ticker, err.response?.status || err.message);
    return res.json({
      available: false,
      symbol: ticker,
      error: "Company documents are temporarily unavailable"
    });
  }
});

function earningsCallResultScore(result = {}, providerName = "") {
  const fiscalYear = toNumberOrNull(result.fiscalYear);
  const fiscalQuarter = toNumberOrNull(String(result.fiscalPeriod || "").match(/Q([1-4])/i)?.[1]);
  const dateTime = result.date ? new Date(result.date).getTime() : null;
  const periodScore =
    fiscalYear !== null && fiscalQuarter !== null
      ? fiscalYear * 10 + fiscalQuarter
      : null;
  const providerPriority = {
    StockAnalysis: 8,
    EarningsCall: 7,
    Quartr: 6,
    "Alpha Vantage": 5,
    Finnhub: 4,
    "Investor Relations": 2,
    "Cached transcript": 1
  }[providerName] || 0;

  if (periodScore !== null) return periodScore * 100 + providerPriority;
  if (dateTime && Number.isFinite(dateTime)) return Math.floor(dateTime / 86400000) + providerPriority;
  return providerPriority;
}

function normalizeCachedEarningsCall(cached, ticker, cachedTranscriptUrl) {
  if (!cached?.data?.transcript?.length && !cachedTranscriptUrl) return null;
  return {
    available: true,
    provider: cached.data.provider || "Cached transcript",
    title: cached.data.title || `${ticker} earnings call transcript`,
    date: cached.data.date || null,
    fiscalYear: cached.data.fiscalYear || null,
    fiscalPeriod: cached.data.fiscalPeriod || null,
    audioUrl: cached.data.rawAudioUrl || cached.data.audioUrl || null,
    rawAudioUrl: cached.data.rawAudioUrl || null,
    transcriptUrl: cachedTranscriptUrl || null,
    transcript: cached.data.transcript || [],
    transcriptSourceUrl: cached.data.transcriptSourceUrl || null
  };
}

function normalizeEarningsCallPeriodItem(item = {}, provider = "") {
  const quarterRaw =
    item.quarter ??
    item.fiscalQuarter ??
    String(item.fiscalPeriod || "").match(/Q([1-4])/i)?.[1];
  const yearRaw = item.year ?? item.fiscalYear;
  const year = toNumberOrNull(yearRaw);
  const quarter = toNumberOrNull(quarterRaw);
  if (year === null || quarter === null || quarter < 1 || quarter > 4) return null;
  const date = item.conference_date || item.time || item.date || null;
  return {
    value: `${year}-Q${quarter}`,
    label: `${year} Q${quarter}`,
    year,
    quarter,
    date,
    sourceUrl: item.sourceUrl || item.url || null,
    indexUrl: item.indexUrl || null,
    provider
  };
}

function isFutureEarningsCallDate(date) {
  if (!date) return false;
  const parsed = new Date(date);
  if (!Number.isFinite(parsed.getTime())) return false;
  return parsed.getTime() > Date.now() + 12 * 60 * 60 * 1000;
}

function isCompletedEarningsCallPeriod(period = {}) {
  if (!period?.value) return false;
  if (isFutureEarningsCallDate(period.date)) return false;
  return true;
}

function mergeEarningsCallPeriods(...periodSets) {
  const byPeriod = new Map();
  periodSets.flat().forEach((period) => {
    if (!isCompletedEarningsCallPeriod(period)) return;
    const existing = byPeriod.get(period.value);
    if (!existing) {
      byPeriod.set(period.value, period);
      return;
    }
    byPeriod.set(period.value, {
      ...existing,
      ...Object.fromEntries(
        Object.entries(period).filter(([, value]) => value !== null && value !== undefined && value !== "")
      ),
      sourceUrl: existing.sourceUrl || period.sourceUrl || null,
      provider: existing.provider || period.provider
    });
  });

  return [...byPeriod.values()]
    .sort((a, b) => (b.year * 4 + b.quarter) - (a.year * 4 + a.quarter))
    .slice(0, 20);
}

async function fetchEarningsCallBizPeriods(ticker) {
  if (!process.env.EARNINGSCALL_API_KEY) return [];
  const quote = await yahooFinance.quote(ticker).catch(() => ({}));
  const preferredExchange = normalizeEarningsCallExchange(quote.exchange);
  const exchanges = preferredExchange
    ? [preferredExchange, ...EARNINGS_CALL_EXCHANGES.filter((item) => item !== preferredExchange)]
    : EARNINGS_CALL_EXCHANGES;

  for (const exchange of exchanges.slice(0, 4)) {
    try {
      const response = await axios.get("https://v2.api.earningscall.biz/events", {
        params: {
          apikey: process.env.EARNINGSCALL_API_KEY,
          exchange: exchange.toLowerCase(),
          symbol: ticker.toLowerCase()
        },
        timeout: 10000
      });
      const periods = (Array.isArray(response.data?.events) ? response.data.events : [])
        .filter((event) => event.is_published !== false)
        .map((event) => normalizeEarningsCallPeriodItem(event, "EarningsCall"))
        .filter(Boolean);
      if (periods.length) return periods;
    } catch (err) {
      if (![401, 403, 404].includes(err.response?.status)) {
        console.log("EarningsCall periods skipped:", ticker, exchange, err.response?.status || err.message);
      }
      if ([401, 403].includes(err.response?.status)) break;
    }
  }
  return [];
}

async function fetchEarningsCallPublicPeriods(ticker) {
  const quote = await yahooFinance.quote(ticker).catch(() => ({}));
  const preferredExchange = normalizeEarningsCallExchange(quote.exchange);
  const exchanges = preferredExchange
    ? [preferredExchange, ...EARNINGS_CALL_EXCHANGES.filter((item) => item !== preferredExchange)]
    : EARNINGS_CALL_EXCHANGES;
  const symbol = encodeURIComponent(String(ticker || "").trim().toLowerCase());

  for (const exchange of exchanges.slice(0, 5)) {
    const pageUrl = `https://earningscall.biz/e/${exchange.toLowerCase()}/s/${symbol}`;
    try {
      const response = await axios.get(pageUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        },
        timeout: 12000,
        responseType: "text",
        transformResponse: [(data) => data],
        validateStatus: (status) => status >= 200 && status < 500
      });
      if (response.status === 404) continue;
      if (response.status >= 400) throw new Error(`EarningsCall public periods returned ${response.status}`);

      const periods = [...String(response.data || "").matchAll(/\/y\/(20\d{2})\/q\/q([1-4])/gi)]
        .map((match) =>
          normalizeEarningsCallPeriodItem(
            {
              year: Number(match[1]),
              quarter: Number(match[2]),
              sourceUrl: `${pageUrl}${match[0]}`
            },
            "EarningsCall"
          )
        )
        .filter(Boolean);
      if (periods.length) return mergeEarningsCallPeriods(periods);
    } catch (err) {
      if (![401, 403, 404].includes(err.response?.status)) {
        console.log("EarningsCall public periods skipped:", ticker, exchange, err.response?.status || err.message);
      }
    }
  }

  return [];
}

async function fetchFinnhubEarningsCallPeriods(ticker) {
  if (!process.env.FINNHUB_API_KEY) return [];
  try {
    const response = await axios.get(
      "https://finnhub.io/api/v1/stock/transcripts/list",
      {
        params: { symbol: ticker, token: process.env.FINNHUB_API_KEY },
        timeout: 12000
      }
    );
    return (response.data?.transcripts || response.data || [])
      .map((item) => normalizeEarningsCallPeriodItem(item, "Finnhub"))
      .filter(Boolean);
  } catch (err) {
    console.log("Finnhub transcript periods skipped:", ticker, err.response?.status || err.message);
    return [];
  }
}

async function fetchStockAnalysisTranscriptHtml(url, referer, timeout = 12000) {
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await axios.get(url, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          Referer: referer,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9"
        },
        timeout: timeout + attempt * 2500,
        responseType: "text",
        transformResponse: [(data) => data],
        validateStatus: (status) => status >= 200 && status < 500
      });
      if (response.status >= 400) return null;
      return String(response.data || "");
    } catch (err) {
      lastError = err;
      await new Promise((resolve) => setTimeout(resolve, 350 + attempt * 550));
    }
  }
  if (lastError) throw lastError;
  return null;
}

function buildStockAnalysisTranscriptIndexUrls(ticker) {
  const symbol = normalizeTickerForStockAnalysis(ticker);
  if (!symbol || !/^[a-z0-9.-]{1,15}$/.test(symbol)) return [];
  const urls = [buildStockAnalysisUrl(ticker, "transcripts/")];
  const overrides = STOCK_ANALYSIS_TRANSCRIPT_PATH_OVERRIDES[String(ticker || "").trim().toUpperCase()] || [];
  overrides.forEach((path) => {
    urls.push(`https://stockanalysis.com/${String(path).replace(/^\/+/, "").replace(/\/+$/, "")}/transcripts/`);
  });
  return [...new Set(urls)];
}

async function fetchStockAnalysisSearchCandidates(query) {
  const cleaned = String(query || "").trim();
  if (!cleaned) return [];
  if (!canUseStockAnalysis()) return [];
  try {
    const response = await axios.get("https://stockanalysis.com/api/search", {
      params: { q: cleaned },
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "application/json,text/plain,*/*"
      },
      timeout: 7000,
      validateStatus: (status) => status >= 200 && status < 500
    });
    if (response.status >= 400) return [];
    return Array.isArray(response.data?.data) ? response.data.data : [];
  } catch (err) {
    setStockAnalysisCooldown(err, "transcript search", cleaned);
    console.log("StockAnalysis transcript search skipped:", cleaned, err.response?.status || err.message);
    return [];
  }
}

function stockAnalysisCandidateToTranscriptUrl(candidate) {
  const path = String(candidate?.s || "").trim();
  if (!path || /^(mutf|futures|crypto)\//i.test(path)) return null;

  if (candidate?.t === "s" && !path.includes("/")) {
    return `https://stockanalysis.com/stocks/${encodeURIComponent(normalizeTickerForStockAnalysis(path))}/transcripts/`;
  }

  if (candidate?.t === "sy" && /^[a-z0-9.-]+\/[^/]+$/i.test(path)) {
    const [exchange, symbol] = path.split("/");
    return `https://stockanalysis.com/quote/${encodeURIComponent(exchange.toLowerCase())}/${encodeURIComponent(symbol)}/transcripts/`;
  }

  return null;
}

function normalizeStockAnalysisCompanyName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\b(incorporated|inc|corporation|corp|company|co|limited|ltd|plc|p\.l\.c|group|holdings?|holding|sa|se|nv|n\.v|a\/s|ag|s\.a|class [a-z])\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stockAnalysisNamesLikelyMatch(candidateName, requestedName) {
  const candidate = normalizeStockAnalysisCompanyName(candidateName);
  const requested = normalizeStockAnalysisCompanyName(requestedName);
  if (!candidate || !requested) return false;
  return (
    candidate === requested ||
    candidate.includes(requested) ||
    requested.includes(candidate)
  );
}

function stockAnalysisCandidateScore(candidate, ticker, companyName = "") {
  const symbol = String(ticker || "").trim().toUpperCase().replace(/-/g, ".");
  const candidateSymbol = String(candidate?.s || "").split("/").pop()?.trim().toUpperCase().replace(/-/g, ".") || "";
  const candidateName = String(candidate?.n || "").toLowerCase();
  const requestedName = String(companyName || "").toLowerCase();
  const nameMatches = requestedName && candidateName
    ? stockAnalysisNamesLikelyMatch(candidateName, requestedName)
    : false;
  if (requestedName && candidateName && !nameMatches) return -Infinity;

  let score = 0;

  if (candidateSymbol === symbol) score += 60;
  if (candidate?.t === "s") score += 45;
  if (candidate?.t === "sy") score += 25;
  if (nameMatches) score += 55;
  if (/^(bcba|bvmf|bkk|wse|vie|neo|fra|otc)\//i.test(String(candidate?.s || ""))) score -= 12;
  if (candidate?.st && candidate.st !== "s") score -= 20;

  return score;
}

async function discoverStockAnalysisTranscriptIndexUrls(ticker) {
  const symbol = String(ticker || "").trim().toUpperCase();
  const cached = stockAnalysisTranscriptIndexUrlCache.get(symbol);
  if (cached && Date.now() - cached.fetchedAt < 12 * 60 * 60 * 1000) {
    return cached.urls;
  }

  const urls = buildStockAnalysisTranscriptIndexUrls(symbol);
  const quote = await yahooFinance.quote(symbol).catch(() => ({}));
  const queries = [
    symbol,
    symbol.replace(/-/g, "."),
    quote.longName,
    quote.shortName,
    quote.displayName
  ].filter(Boolean);

  const byUrl = new Map(urls.map((url) => [url, 1000]));
  const quoteCompanyName = quote.longName || quote.shortName || quote.displayName || "";
  const seenQueries = new Set();
  for (let index = 0; index < queries.length; index += 1) {
    const query = queries[index];
    const queryKey = String(query || "").trim().toLowerCase();
    if (!queryKey || seenQueries.has(queryKey)) continue;
    seenQueries.add(queryKey);
    const candidates = await fetchStockAnalysisSearchCandidates(query);
    const referenceName = quoteCompanyName || (/^[A-Z0-9.-]{1,12}$/i.test(String(query)) ? "" : query);
    if (!quoteCompanyName && /^[A-Z0-9.-]{1,12}$/i.test(String(query))) {
      candidates
        .filter((candidate) =>
          candidate?.t === "s" &&
          String(candidate?.s || "").trim().toUpperCase().replace(/-/g, ".") === symbol.replace(/-/g, ".") &&
          candidate?.n
        )
        .slice(0, 2)
        .forEach((candidate) => {
          const nameKey = String(candidate.n).trim().toLowerCase();
          if (nameKey && !seenQueries.has(nameKey)) queries.push(candidate.n);
        });
    }
    candidates
      .map((candidate) => ({
        url: stockAnalysisCandidateToTranscriptUrl(candidate),
        score: stockAnalysisCandidateScore(candidate, symbol, referenceName)
      }))
      .filter((item) => item.url && Number.isFinite(item.score))
      .forEach((item) => {
        byUrl.set(item.url, Math.max(byUrl.get(item.url) || -Infinity, item.score));
      });
  }

  const discoveredUrls = [...byUrl.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([url]) => url)
    .slice(0, 14);

  stockAnalysisTranscriptIndexUrlCache.set(symbol, { urls: discoveredUrls, fetchedAt: Date.now() });
  return discoveredUrls;
}

async function fetchStockAnalysisPeriodsFromIndexUrls(ticker, indexUrls) {
  if (!indexUrls.length) return [];
  if (!canUseStockAnalysis()) return [];

  for (const indexUrl of indexUrls) {
    try {
      const html = await fetchStockAnalysisTranscriptHtml(indexUrl, indexUrl, 9000);
      if (!html) continue;
      const $ = cheerio.load(html);
      const transcriptLinks = [];
      $("a").each((_, element) => {
        const text = $(element).text().replace(/\s+/g, " ").trim();
        const match = text.match(/Earnings Call:\s*Q([1-4])\s+(20\d{2})/i);
        const href = $(element).attr("href");
        if (!match || !href) return;
        transcriptLinks.push({
          quarter: Number(match[1]),
          year: Number(match[2]),
          indexUrl,
          sourceUrl: new URL(href, indexUrl).toString()
        });
      });
      const periods = mergeEarningsCallPeriods(
        transcriptLinks.map((item) =>
          normalizeEarningsCallPeriodItem(
            item,
            "StockAnalysis"
          )
        ).filter(Boolean)
      );
      if (periods.length) return periods;
    } catch (err) {
      setStockAnalysisCooldown(err, "transcript periods", ticker);
      console.log("StockAnalysis transcript periods skipped:", ticker, indexUrl, err.response?.status || err.message);
    }
  }

  return [];
}

async function fetchStockAnalysisEarningsCallPeriods(ticker) {
  if (!canUseStockAnalysis()) return [];
  const directUrls = buildStockAnalysisTranscriptIndexUrls(ticker);
  const directPeriods = await fetchStockAnalysisPeriodsFromIndexUrls(ticker, directUrls);
  if (directPeriods.length) return directPeriods;

  const discoveredUrls = await discoverStockAnalysisTranscriptIndexUrls(ticker);
  const directUrlSet = new Set(directUrls);
  return fetchStockAnalysisPeriodsFromIndexUrls(
    ticker,
    discoveredUrls.filter((url) => !directUrlSet.has(url))
  );
}

function cachedEarningsCallPeriod(cached, ticker) {
  const cachedData = normalizeCachedEarningsCall(cached, ticker, cached?.data?.rawTranscriptUrl);
  if (cachedData?.provider !== "StockAnalysis") return [];
  return cachedData
    ? [normalizeEarningsCallPeriodItem(cachedData, cachedData.provider || "Cached transcript")].filter(Boolean)
    : [];
}

async function fetchAvailableEarningsCallPeriods(ticker) {
  const symbol = String(ticker || "").trim().toUpperCase();
  const cached = earningsCallPeriodsCache.get(symbol);
  if (cached && Date.now() - cached.fetchedAt < 60 * 60 * 1000) {
    return cached.data;
  }

  const savedCall = await EarningsCall.findOne({ ticker: symbol }).catch(() => null);
  const stockAnalysisPeriods = await resolveWithin(fetchStockAnalysisEarningsCallPeriods(symbol), 12000, []);
  const periods = mergeEarningsCallPeriods(stockAnalysisPeriods, cachedEarningsCallPeriod(savedCall, symbol));
  const data = {
    available: periods.length > 0,
    symbol,
    periods,
    updatedAt: new Date().toISOString()
  };
  if (periods.length) {
    earningsCallPeriodsCache.set(symbol, { data, fetchedAt: Date.now() });
  }
  return data;
}

app.get("/api/earnings-call-periods/:ticker", async (req, res) => {
  const ticker = req.params.ticker.trim().toUpperCase();
  if (!/^[A-Z0-9.-]{1,15}$/.test(ticker)) {
    return res.status(400).json({ available: false, periods: [], error: "Invalid ticker" });
  }

  try {
    const data = await fetchAvailableEarningsCallPeriods(ticker);
    return res.json(data);
  } catch (err) {
    console.error("Earnings call periods fetch failed:", ticker, err.response?.status || err.message);
    return res.status(502).json({
      available: false,
      symbol: ticker,
      periods: [],
      error: "Earnings call periods are temporarily unavailable"
    });
  }
});

app.get("/api/earnings-call/:ticker", async (req, res) => {
  const ticker = req.params.ticker.trim().toUpperCase();
  const requestedPeriod = parseRequestedEarningsPeriod(req.query);
  const isSpecificPeriodRequest = Boolean(requestedPeriod);

  try {
    const apiBaseUrl =
      process.env.PUBLIC_API_URL ||
      `${req.protocol}://${req.get("host")}`;
    const cached = await EarningsCall.findOne({ ticker });
    const providerErrors = [];
    const cachedTranscriptUrl =
      cached?.data?.rawTranscriptUrl ||
      (/\/transcript-file\?/.test(String(cached?.data?.transcriptUrl || ""))
        ? null
        : cached?.data?.transcriptUrl);
    const sendTranscriptData = async (transcriptData) => {
      const rawAudioUrl = transcriptData.rawAudioUrl || transcriptData.audioUrl || null;
      const proxiedAudioUrl = rawAudioUrl
        ? (
            String(rawAudioUrl).startsWith(apiBaseUrl)
              ? rawAudioUrl
              : isStockAnalysisAudioUrl(rawAudioUrl)
                ? buildStockAnalysisAudioProxyUrl(apiBaseUrl, ticker, rawAudioUrl)
                : transcriptData.audioUrl || null
          )
        : null;
      const data = {
        ...transcriptData,
        provider: transcriptData.provider,
        symbol: ticker,
        audioUrl: proxiedAudioUrl,
        webcastUrl: null,
        rawAudioUrl,
        rawTranscriptUrl: transcriptData.transcriptUrl || null,
        transcriptUrl: transcriptData.transcriptUrl
          ? buildEarningsTranscriptProxyUrl(apiBaseUrl, ticker, transcriptData.transcriptUrl)
          : null,
        transcript: transcriptData.transcript || [],
        computerReadAudio: false,
        hasOriginalAudio: Boolean(proxiedAudioUrl),
        version: EARNINGS_CALL_VERSION,
        errors: providerErrors,
        fetchedAt: new Date().toISOString()
      };
      if (!isSpecificPeriodRequest) {
        await EarningsCall.findOneAndUpdate(
          { ticker },
          { ticker, data, updatedAt: new Date() },
          { upsert: true, new: true }
        );
      }
      return res.json(data);
    };

    if (isSpecificPeriodRequest) {
      const stockAnalysisData = await resolveWithin(
        fetchStockAnalysisEarningsCall(ticker, requestedPeriod),
        20000,
        null
      );
      if (stockAnalysisData?.available && (stockAnalysisData.transcript?.length || stockAnalysisData.transcriptUrl)) {
        return sendTranscriptData(stockAnalysisData);
      }
    } else {
      const stockAnalysisPeriods = await resolveWithin(fetchStockAnalysisEarningsCallPeriods(ticker), 12000, []);
      const latestPeriod = stockAnalysisPeriods[0] || null;
      if (latestPeriod) {
        const stockAnalysisData = await resolveWithin(
          fetchStockAnalysisEarningsCall(ticker, latestPeriod),
          20000,
          null
        );
        if (stockAnalysisData?.available && (stockAnalysisData.transcript?.length || stockAnalysisData.transcriptUrl)) {
          return sendTranscriptData(stockAnalysisData);
        }
      }
    }

    return res.json({
      available: false,
      symbol: ticker,
      provider: "StockAnalysis",
      transcript: [],
      audioUrl: null,
      computerReadAudio: false,
      hasOriginalAudio: false,
      version: EARNINGS_CALL_VERSION,
      errors: providerErrors,
      requestedPeriod: requestedPeriod
        ? `${requestedPeriod.year} Q${requestedPeriod.quarter}`
        : null,
      message: requestedPeriod
        ? `StockAnalysis does not have an earnings call transcript for ${ticker} ${requestedPeriod.year} Q${requestedPeriod.quarter}.`
        : "StockAnalysis does not have an earnings call transcript for this ticker yet."
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
async function fetchStockAnalysisEarningsCalendarRows(targetDates = []) {
  const targetSet = new Set(targetDates);
  try {
    if (
      stockAnalysisEarningsCalendarPageCache &&
      Date.now() - stockAnalysisEarningsCalendarPageCache.fetchedAt < 10 * 60 * 1000
    ) {
      const cachedRows = stockAnalysisEarningsCalendarPageCache.rows || [];
      return targetSet.size
        ? cachedRows.filter((row) => targetSet.has(row.date))
        : cachedRows;
    }
    if (!canUseStockAnalysis()) return [];

    const response = await axios.get("https://stockanalysis.com/stocks/earnings-calendar/", {
      headers: STOCK_ANALYSIS_HEADERS,
      timeout: 7000
    });
    const html = String(response.data || "");
    const allRows = [];
    const parseCalendarNumber = (value) => {
      const text = String(value || "").trim();
      if (!text || text === "null") return null;
      const number = Number(text);
      return Number.isFinite(number) ? number : null;
    };

    for (const dayMatch of html.matchAll(/\{date:"(\d{4}-\d{2}-\d{2})",day:"([^"]+)",symbols:\[(.*?)\],count:/gs)) {
      const [, date, , symbolsBlock] = dayMatch;

      for (const symbolMatch of symbolsBlock.matchAll(/\{s:"([^"]+)",n:"([^"]*)",t:(null|"[^"]*"),e:([^,}]+),eg:([^,}]+),r:([^,}]+),rg:([^,}]+),m:([^,}]+)\}/g)) {
        const [, symbol, name, timeRaw, eps, , revenue, , marketCap] = symbolMatch;
        allRows.push({
          date,
          symbol,
          company: name || symbol,
          reportTimeCode: timeRaw === "null" ? null : timeRaw.replace(/"/g, ""),
          epsEstimate: parseCalendarNumber(eps),
          revenueEstimate: parseCalendarNumber(revenue),
          marketCap: parseCalendarNumber(marketCap),
          source: "StockAnalysis earnings calendar"
        });
      }
    }

    stockAnalysisEarningsCalendarPageCache = { rows: allRows, fetchedAt: Date.now() };
    return targetSet.size
      ? allRows.filter((row) => targetSet.has(row.date))
      : allRows;
  } catch (err) {
    setStockAnalysisCooldown(err, "earnings calendar", "calendar");
    console.log("StockAnalysis earnings calendar skipped:", err.response?.status || err.message);
    return [];
  }
}

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
  const cacheKey = `fmp:v10:${dates[0]}`;
  const cached = earningsCalendarCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < 60 * 60 * 1000 && cached.data?.days?.some((day) => day.events?.length)) {
    return res.json(cached.data);
  }

  try {
    const [fmpRows, stockAnalysisRows] = await Promise.all([
      process.env.FMP_API_KEY && canUseFmp()
        ? resolveWithin(
          getFmpData("calendar", "earnings calendar page", [
            `/stable/earnings-calendar?from=${dates[0]}&to=${dates[6]}`
          ]),
          3500,
          []
        )
        : Promise.resolve([]),
      resolveWithin(fetchStockAnalysisEarningsCalendarRows(dates), 3500, [])
    ]);
    const timeLabels = {
      bmo: "Before open",
      amc: "After close",
      dmh: "During market",
      "time-pre-market": "Before open",
      "time-after-hours": "After close"
    };
    const normalizeReportTime = (...values) => {
      for (const value of values) {
        const raw = String(value || "").trim();
        if (!raw) continue;
        const text = raw.toLowerCase();
        if (timeLabels[text]) return timeLabels[text];
        if (/\b(before|pre[-\s]?market|premarket|open)\b/.test(text)) return "Before open";
        if (/\b(after|post[-\s]?market|after[-\s]?hours|close)\b/.test(text)) return "After close";
        if (/\b(during|market hours)\b/.test(text)) return "During market";
        if (!/not supplied|unknown|n\/a/.test(text)) return raw;
      }
      return "Time not supplied";
    };
    const stockAnalysisByDateSymbol = new Map(
      (Array.isArray(stockAnalysisRows) ? stockAnalysisRows : [])
        .map((row) => [`${row.date}:${String(row.symbol || "").trim().toUpperCase()}`, row])
    );
    const stockAnalysisBySymbol = new Map();
    (Array.isArray(stockAnalysisRows) ? stockAnalysisRows : []).forEach((row) => {
      const symbol = String(row.symbol || "").trim().toUpperCase();
      if (symbol && !stockAnalysisBySymbol.has(symbol)) stockAnalysisBySymbol.set(symbol, row);
    });
    const rawFmpList = Array.isArray(fmpRows) ? fmpRows : fmpRows ? [fmpRows] : [];
    const fallbackStockAnalysisList = Array.isArray(stockAnalysisRows) ? stockAnalysisRows : [];
    const fmpList = rawFmpList.length ? rawFmpList : fallbackStockAnalysisList;
    const calendarSymbols = [...new Set(fmpList
      .map((row) => String(row.symbol || "").trim().toUpperCase())
      .filter(Boolean))];
    const quoteCandidateSymbols = [...new Set(dates.flatMap((date) =>
      fmpList
        .filter((row) => String(row.date || "").slice(0, 10) === date)
        .map((row) => ({
          symbol: String(row.symbol || "").trim().toUpperCase(),
          rankValue: firstFiniteNumber(row.marketCap, row.revenueActual, row.revenueEstimated) || 0
        }))
        .filter((row) => row.symbol)
        .sort((a, b) => b.rankValue - a.rankValue)
        .slice(0, 100)
        .map((row) => row.symbol)
    ))].slice(0, 500);
    const savedMarketCapBySymbol = new Map();
    if (quoteCandidateSymbols.length) {
      const savedStocks = await Stock.find(
        { ticker: { $in: quoteCandidateSymbols } },
        { ticker: 1, "data.marketCap": 1 }
      ).lean().catch(() => []);
      (savedStocks || []).forEach((stock) => {
        const symbol = String(stock.ticker || "").trim().toUpperCase();
        const marketCap = toNumberOrNull(stock.data?.marketCap);
        if (symbol && marketCap !== null) savedMarketCapBySymbol.set(symbol, marketCap);
      });
    }
    const missingQuoteSymbols = quoteCandidateSymbols
      .filter((symbol) => !savedMarketCapBySymbol.has(symbol))
      .slice(0, 220);
    const quoteMarketCapRows = [];
    if (process.env.FMP_API_KEY && canUseFmp() && missingQuoteSymbols.length) {
      const quoteRows = await Promise.all(
        missingQuoteSymbols.map((symbol) =>
          resolveWithin(getFmpData(symbol, "calendar quote market cap", [
            "/stable/quote?symbol={ticker}"
          ]), 2200, null)
        )
      );
      quoteMarketCapRows.push(...quoteRows);
    }
    const fmpMarketCapBySymbol = new Map(
      quoteMarketCapRows
        .map((quoteData) => {
          const quote = Array.isArray(quoteData) ? quoteData[0] || {} : quoteData || {};
          return [String(quote.symbol || "").trim().toUpperCase(), toNumberOrNull(quote.marketCap)];
        })
        .filter(([symbol, marketCap]) => symbol && marketCap !== null)
    );
    savedMarketCapBySymbol.forEach((marketCap, symbol) => {
      if (!fmpMarketCapBySymbol.has(symbol)) fmpMarketCapBySymbol.set(symbol, marketCap);
    });
    const eventsByDate = new Map();
    fmpList.forEach((row) => {
      const date = String(row.date || "").slice(0, 10);
      if (!dates.includes(date)) return;
      const symbol = String(row.symbol || "").trim().toUpperCase();
      if (!symbol) return;
      const stockAnalysisRow = stockAnalysisByDateSymbol.get(`${date}:${symbol}`) || stockAnalysisBySymbol.get(symbol) || {};
      const event = {
        date,
        symbol,
        company: row.name || row.company || stockAnalysisRow.company || symbol,
        logo: getFinnhubLogoUrl(symbol),
        marketCap: firstFiniteNumber(
          fmpMarketCapBySymbol.get(symbol),
          row.marketCap
        ),
        reportTime: normalizeReportTime(row.time, row.reportTime, row.reportTimeCode, stockAnalysisRow.reportTime, stockAnalysisRow.reportTimeCode),
        fiscalQuarter: row.fiscalDateEnding ? String(row.fiscalDateEnding).slice(0, 10) : null,
        epsEstimate: firstFiniteNumber(row.epsEstimated, row.epsEstimate, stockAnalysisRow.epsEstimate),
        revenueEstimate: firstFiniteNumber(row.revenueEstimated, row.revenueEstimate, stockAnalysisRow.revenueEstimate),
        epsActual: parseApiNumber(row.epsActual),
        revenueActual: parseApiNumber(row.revenueActual),
        source: "FMP earnings calendar"
      };
      const list = eventsByDate.get(date) || [];
      list.push(event);
      eventsByDate.set(date, list);
    });
    const days = dates.map((date) => {
      const uniqueEvents = new Map();
      (eventsByDate.get(date) || []).forEach((event) => {
        const existing = uniqueEvents.get(event.symbol);
        if (!existing || (event.marketCap || 0) > (existing.marketCap || 0)) {
          uniqueEvents.set(event.symbol, event);
        }
      });
      const events = [...uniqueEvents.values()]
        .sort((a, b) =>
          (b.marketCap || 0) - (a.marketCap || 0) ||
          (b.revenueEstimate || b.revenueActual || 0) - (a.revenueEstimate || a.revenueActual || 0) ||
          a.symbol.localeCompare(b.symbol)
        )
        .slice(0, 80);
      return { date, events };
    });
    const responseData = {
      weekStart: dates[0],
      weekEnd: dates[6],
      days
    };
    if (days.some((day) => day.events?.length)) {
      earningsCalendarCache.set(cacheKey, { data: responseData, cachedAt: Date.now() });
    }
    return res.json(responseData);
  } catch (err) {
    console.error("Earnings calendar error:", err.message);
    return res.status(500).json({ weekStart: dates[0], weekEnd: dates[6], days: [] });
  }
});

const parseCalendarIsoDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return null;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const calendarIsoDate = (date) => date.toISOString().slice(0, 10);

const shiftCalendarIsoDate = (isoDate, days) => {
  const date = parseCalendarIsoDate(isoDate);
  if (!date) return isoDate;
  date.setUTCDate(date.getUTCDate() + days);
  return calendarIsoDate(date);
};

const buildCalendarDates = (startValue) => {
  const requestedStart = parseCalendarIsoDate(startValue);
  const weekStart = requestedStart || (() => {
    const date = new Date();
    date.setUTCHours(12, 0, 0, 0);
    const daysFromMonday = (date.getUTCDay() + 6) % 7;
    date.setUTCDate(date.getUTCDate() - daysFromMonday);
    return date;
  })();

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setUTCDate(date.getUTCDate() + index);
    return calendarIsoDate(date);
  });
};

app.get("/api/calendar-events", async (req, res) => {
  const type = ["earnings", "dividends", "ipos"].includes(String(req.query.type || "").toLowerCase())
    ? String(req.query.type).toLowerCase()
    : "earnings";
  const dates = buildCalendarDates(req.query.start);
  const cacheKey = `${type}:${dates[0]}:${dates[6]}`;
  const cached = fmpCalendarCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return res.json(cached.data);

  if (!process.env.FMP_API_KEY || !canUseFmp()) {
    return res.status(503).json({ weekStart: dates[0], weekEnd: dates[6], type, days: [] });
  }

  try {
    if (type === "earnings") {
      const response = await axios.get(`http://127.0.0.1:${PORT}/api/earnings`, {
        params: { start: dates[0] },
        timeout: 9000
      });
      const responseData = { ...(response.data || {}), type: "earnings" };
      fmpCalendarCache.set(cacheKey, { data: responseData, expiresAt: Date.now() + 15 * 60 * 1000 });
      return res.json(responseData);
    }

    const endpoint = type === "dividends" ? "dividends-calendar" : "ipos-calendar";
    const queryFrom = type === "dividends"
      ? shiftCalendarIsoDate(dates[0], -120)
      : dates[0];
    const rows = await getFmpData("calendar", `${type} calendar page`, [
      `/stable/${endpoint}?from=${queryFrom}&to=${dates[6]}`
    ]);
    const rawRows = Array.isArray(rows) ? rows : rows ? [rows] : [];
    const eventsByDate = new Map();

    rawRows.forEach((row) => {
      const exDividendDate = String(row.exDividendDate || row.date || "").slice(0, 10);
      const paymentDate = String(row.paymentDate || "").slice(0, 10);
      const ipoDate = String(row.date || row.daa || "").slice(0, 10);
      const date = type === "dividends" ? paymentDate : ipoDate;
      if (!dates.includes(date)) return;
      const symbol = String(row.symbol || "").trim().toUpperCase();
      if (!symbol) return;
      const event = type === "dividends"
        ? {
            date,
            symbol,
            company: row.name || row.companyName || symbol,
            logo: getFinnhubLogoUrl(symbol),
            dividend: firstFiniteNumber(row.adjDividend, row.dividend),
            yield: firstFiniteNumber(row.yield),
            frequency: firstText(row.frequency) || "N/A",
            exDividendDate,
            recordDate: firstText(row.recordDate),
            paymentDate,
            declarationDate: firstText(row.declarationDate),
            source: "FMP dividends calendar"
          }
        : {
            date,
            symbol,
            company: row.company || row.name || symbol,
            logo: getFinnhubLogoUrl(symbol),
            exchange: firstText(row.exchange) || "N/A",
            status: firstText(row.actions) || "Expected",
            shares: firstFiniteNumber(row.shares),
            priceRange: firstText(row.priceRange),
            marketCap: firstFiniteNumber(row.marketCap),
            source: "FMP IPO calendar"
          };

      const list = eventsByDate.get(date) || [];
      list.push(event);
      eventsByDate.set(date, list);
    });

    const days = dates.map((date) => {
      const events = (eventsByDate.get(date) || [])
        .sort((a, b) => {
          if (type === "dividends") return (b.yield || 0) - (a.yield || 0) || a.symbol.localeCompare(b.symbol);
          return (b.marketCap || 0) - (a.marketCap || 0) || a.symbol.localeCompare(b.symbol);
        })
        .slice(0, 150);
      return { date, events };
    });

    const responseData = {
      type,
      weekStart: dates[0],
      weekEnd: dates[6],
      days,
      updatedAt: new Date().toISOString(),
      source: type === "dividends" ? "FMP dividends calendar" : "FMP IPO calendar"
    };
    fmpCalendarCache.set(cacheKey, { data: responseData, expiresAt: Date.now() + 15 * 60 * 1000 });
    return res.json(responseData);
  } catch (err) {
    setFmpCooldown(err, `${type} calendar`, "calendar");
    console.log(`FMP ${type} calendar skipped:`, err.response?.status || err.message);
    return res.status(500).json({ weekStart: dates[0], weekEnd: dates[6], type, days: [] });
  }
});

app.get("/api/treasury-rates", async (req, res) => {
  const end = parseCalendarIsoDate(req.query.to) || new Date();
  end.setUTCHours(12, 0, 0, 0);
  const from = parseCalendarIsoDate(req.query.from) || (() => {
    const date = new Date(end);
    date.setUTCDate(date.getUTCDate() - 90);
    return date;
  })();
  const fromIso = calendarIsoDate(from);
  const toIso = calendarIsoDate(end);
  const cacheKey = `${fromIso}:${toIso}`;
  const cached = treasuryRatesCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return res.json(cached.data);

  if (!process.env.FMP_API_KEY || !canUseFmp()) {
    return res.status(503).json({ rows: [], latest: null, source: "FMP treasury rates" });
  }

  try {
    const data = await getFmpData("treasury", "treasury rates", [
      `/stable/treasury-rates?from=${fromIso}&to=${toIso}`
    ]);
    const rows = (Array.isArray(data) ? data : data ? [data] : [])
      .map((row) => ({
        date: String(row.date || "").slice(0, 10),
        month1: toNumberOrNull(row.month1),
        month2: toNumberOrNull(row.month2),
        month3: toNumberOrNull(row.month3),
        month6: toNumberOrNull(row.month6),
        year1: toNumberOrNull(row.year1),
        year2: toNumberOrNull(row.year2),
        year3: toNumberOrNull(row.year3),
        year5: toNumberOrNull(row.year5),
        year7: toNumberOrNull(row.year7),
        year10: toNumberOrNull(row.year10),
        year20: toNumberOrNull(row.year20),
        year30: toNumberOrNull(row.year30)
      }))
      .filter((row) => row.date)
      .sort((a, b) => b.date.localeCompare(a.date));

    const responseData = {
      from: fromIso,
      to: toIso,
      latest: rows[0] || null,
      rows,
      updatedAt: new Date().toISOString(),
      source: "FMP treasury rates"
    };
    treasuryRatesCache.set(cacheKey, { data: responseData, expiresAt: Date.now() + 30 * 60 * 1000 });
    return res.json(responseData);
  } catch (err) {
    setFmpCooldown(err, "treasury rates", "treasury");
    console.log("FMP treasury rates skipped:", err.response?.status || err.message);
    return res.status(500).json({ rows: [], latest: null, error: "Treasury rates are not available yet." });
  }
});

app.get("/api/news", async (req, res) => {
  const symbol = String(req.query.symbol || "").trim().toUpperCase();
  const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 80);
  const page = Math.max(Number(req.query.page) || 0, 0);
  const isStockNews = Boolean(symbol);
  const cacheKey = `${isStockNews ? symbol : "general"}:${page}:${limit}`;
  const cached = fmpNewsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return res.json(cached.data);

  if (isStockNews && !/^[A-Z0-9.-]{1,15}$/.test(symbol)) {
    return res.status(400).json({ error: "Invalid ticker", articles: [] });
  }

  if (!process.env.FMP_API_KEY || !canUseFmp()) {
    return res.status(503).json({ articles: [], source: "FMP news" });
  }

  try {
    const endpoint = isStockNews
      ? `/stable/news/stock?symbols=${encodeURIComponent(symbol)}&page=${page}&limit=${limit}`
      : `/stable/news/general-latest?page=${page}&limit=${limit}`;
    const data = await getFmpData(isStockNews ? symbol : "general", isStockNews ? "stock news" : "general news", [
      endpoint
    ]);
    const articles = (Array.isArray(data) ? data : data ? [data] : [])
      .map((item, index) => ({
        id: `${String(item.url || item.title || index)}-${index}`,
        symbol: firstText(item.symbol, symbol) || null,
        publishedDate: firstText(item.publishedDate),
        publisher: firstText(item.publisher, item.site) || "FMP",
        title: firstText(item.title) || "Untitled",
        image: firstText(item.image),
        site: firstText(item.site),
        text: firstText(item.text),
        url: firstText(item.url),
        source: isStockNews ? "FMP stock news" : "FMP general news"
      }))
      .filter((article) => article.title && article.url);

    const responseData = {
      symbol: isStockNews ? symbol : null,
      articles,
      updatedAt: new Date().toISOString(),
      source: isStockNews ? "FMP stock news" : "FMP general news"
    };
    fmpNewsCache.set(cacheKey, { data: responseData, expiresAt: Date.now() + 10 * 60 * 1000 });
    return res.json(responseData);
  } catch (err) {
    setFmpCooldown(err, isStockNews ? "stock news" : "general news", symbol || "general");
    console.log("FMP news skipped:", symbol || "general", err.response?.status || err.message);
    return res.status(500).json({ articles: [], error: "News is not available yet." });
  }
});

// =========================
// AUTH ROUTES
// =========================

// SIGNUP
app.post("/api/signup", async (req, res) => {
try {
const { username, email, password } = req.body;
const normalizedEmail = String(email || "").trim().toLowerCase();

if (!username || !normalizedEmail || !password) {
  return res.status(400).json({ error: "Username, email, and password are required" });
}


const exists = await User.findOne({ email: normalizedEmail });
if (exists) return res.status(400).json({ error: "User exists" });

const hashed = await bcrypt.hash(password, 10);

const user = new User({
  username,
  email: normalizedEmail,
  password: hashed,
  authProvider: "password"
});

await user.save();

res.json(createAuthResponse(user));


} catch (err) {
console.error(err);
res.status(500).json({ error: "Signup failed" });
}
});

// LOGIN
app.post("/api/login", async (req, res) => {
try {
const { email, password } = req.body;
const normalizedEmail = String(email || "").trim().toLowerCase();


const user = await User.findOne({ email: normalizedEmail });
if (!user) return res.status(400).json({ error: "Invalid credentials" });
if (!user.password) {
  return res.status(400).json({ error: "Use Google sign-in for this account or reset your password" });
}

const valid = await bcrypt.compare(password, user.password);
if (!valid) return res.status(400).json({ error: "Invalid credentials" });

res.json(createAuthResponse(user));

} catch (err) {
console.error(err);
res.status(500).json({ error: "Login failed" });
}
});

app.post("/api/google-login", async (req, res) => {
try {
const { credential } = req.body;
const googleClientId = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID;

if (!googleClientId) {
  return res.status(500).json({ error: "Google sign-in is not configured yet" });
}

if (!credential) {
  return res.status(400).json({ error: "Missing Google credential" });
}

const googleResponse = await axios.get("https://oauth2.googleapis.com/tokeninfo", {
  params: { id_token: credential },
  timeout: 8000
});

const profile = googleResponse.data || {};
if (profile.aud !== googleClientId) {
  return res.status(401).json({ error: "Google sign-in could not be verified" });
}

if (profile.email_verified !== "true" && profile.email_verified !== true) {
  return res.status(401).json({ error: "Google email is not verified" });
}

const normalizedEmail = String(profile.email || "").trim().toLowerCase();
if (!normalizedEmail) {
  return res.status(400).json({ error: "Google account did not include an email" });
}

let user = await User.findOne({ email: normalizedEmail });
if (!user) {
  user = new User({
    username: profile.name || normalizedEmail.split("@")[0],
    email: normalizedEmail,
    googleId: profile.sub || "",
    authProvider: "google"
  });
} else {
  user.googleId = user.googleId || profile.sub || "";
  user.authProvider = user.password ? "password_google" : "google";
}

await user.save();
res.json(createAuthResponse(user));

} catch (err) {
console.error(err);
res.status(500).json({ error: "Google sign-in failed" });
}
});

app.post("/api/forgot-password", async (req, res) => {
try {
const normalizedEmail = String(req.body.email || "").trim().toLowerCase();
const user = normalizedEmail ? await User.findOne({ email: normalizedEmail }) : null;
const genericResponse = {
  success: true,
  message: "If that email is on MrktRally, a reset link will be sent."
};

if (!user) return res.json(genericResponse);

const resetToken = crypto.randomBytes(32).toString("hex");
user.passwordResetToken = hashPasswordResetToken(resetToken);
user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000);
await user.save();

const resetUrl = `${getFrontendUrl(req).replace(/\/$/, "")}/?resetToken=${encodeURIComponent(resetToken)}&email=${encodeURIComponent(user.email)}`;
let emailSent = false;
let emailError = "";

try {
  emailSent = await sendPasswordResetEmail({ to: user.email, resetUrl });
} catch (err) {
  emailError = err?.response || err?.message || "Email send failed";
  console.error("Password reset email failed:", emailError);
}

if (!emailSent) {
  console.log(`Password reset link for ${user.email}: ${resetUrl}`);
}

res.json({
  ...genericResponse,
  emailConfigured: Boolean(process.env.RESEND_API_KEY || process.env.SMTP_HOST),
  emailSent,
  emailError: emailSent ? undefined : "Password reset email could not be sent. Check SMTP settings in Render.",
  resetLink: !emailSent && process.env.ALLOW_RESET_LINK_RESPONSE === "true" ? resetUrl : undefined
});

} catch (err) {
console.error(err);
res.status(500).json({ error: "Password reset request failed" });
}
});

app.post("/api/reset-password", async (req, res) => {
try {
const normalizedEmail = String(req.body.email || "").trim().toLowerCase();
const resetToken = String(req.body.token || "");
const newPassword = String(req.body.password || "");

if (!normalizedEmail || !resetToken || newPassword.length < 6) {
  return res.status(400).json({ error: "A valid reset link and a password of at least 6 characters are required" });
}

const user = await User.findOne({
  email: normalizedEmail,
  passwordResetToken: hashPasswordResetToken(resetToken),
  passwordResetExpires: { $gt: new Date() }
});

if (!user) {
  return res.status(400).json({ error: "Reset link is invalid or expired" });
}

user.password = await bcrypt.hash(newPassword, 10);
user.passwordResetToken = "";
user.passwordResetExpires = null;
user.authProvider = user.googleId ? "password_google" : "password";
await user.save();

res.json(createAuthResponse(user));

} catch (err) {
console.error(err);
res.status(500).json({ error: "Password reset failed" });
}
});

app.get("/api/search-stocks", async (req, res) => {
try {
const query = String(req.query.q || "").trim();
if (query.length < 2) return res.json({ results: [] });

const cleanQuery = query.replace(/[^a-zA-Z0-9 .&'-]/g, "").slice(0, 60);
if (cleanQuery.length < 2) return res.json({ results: [] });

const cacheKey = cleanQuery.toLowerCase();
const cached = stockSearchCache.get(cacheKey);
if (cached && cached.expiresAt > Date.now()) return res.json({ results: cached.results });

let rows = [];
if (process.env.FMP_API_KEY && canUseFmp()) {
  const endpoints = [
    `https://financialmodelingprep.com/stable/search-symbol?query=${encodeURIComponent(cleanQuery)}&limit=12&apikey=${process.env.FMP_API_KEY}`,
    `https://financialmodelingprep.com/stable/search-name?query=${encodeURIComponent(cleanQuery)}&limit=12&apikey=${process.env.FMP_API_KEY}`
  ];

  const responses = await Promise.allSettled(
    endpoints.map((endpoint) => axios.get(endpoint, { timeout: 1800 }))
  );
  responses.forEach((result) => {
    if (result.status === "fulfilled" && Array.isArray(result.value.data)) {
      rows.push(...result.value.data);
      return;
    }
    const err = result.reason;
    if (err) {
      setFmpCooldown(err, "stock search", cleanQuery);
      console.log("FMP stock search skipped:", cleanQuery, err.response?.status || err.message);
    }
  });
}

if (!rows.length) {
  const exact = await Stock.findOne({
    ticker: cleanQuery.toUpperCase()
  }).select("ticker data.symbol data.name data.longName data.shortName data.exchange data.sector").lean();
  if (exact) rows = [exact];
}

const seen = new Set();
const primaryExchangeRank = (exchange) => {
  const value = String(exchange || "").trim().toUpperCase();
  if (value === "NASDAQ") return 0;
  if (value === "NYSE") return 1;
  if (value === "AMEX" || value === "NYSEAMERICAN") return 2;
  if (value === "OTC") return 8;
  return 5;
};
const isStockSearchEquity = (item) => {
  const symbol = String(item?.symbol || "").trim().toUpperCase();
  const name = String(item?.name || "").trim();
  const type = String(item?.type || "").trim().toLowerCase();
  const exchange = String(item?.exchange || "").trim().toUpperCase();
  const exchangeName = String(item?.exchangeFullName || "").trim().toLowerCase();
  if (!symbol || ["CRYPTO", "CCC", "FOREX", "FX"].includes(exchange)) return false;
  if (type && !/(stock|equity|common)/i.test(type)) return false;
  if (/\b(etf|etn|fund|income strategy|daily bear|daily bull|weeklypay|2x|3x|leveraged|inverse|forex)\b/i.test(name)) return false;
  if (/\b(crypto|cryptocurrency|foreign exchange|forex)\b/i.test(exchangeName)) return false;
  if (/^[A-Z]{2,6}(USD|EUR|GBP|JPY|CAD|AUD|CHF)$/.test(symbol)) return false;
  return true;
};
const matchesStockSearchQuery = (item) => {
  const queryText = cleanQuery.toLowerCase();
  const tokens = queryText
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
  if (!tokens.length) return true;
  const symbol = String(item.symbol || "").toLowerCase();
  const words = String(item.name || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter(Boolean);
  return tokens.every((token) =>
    symbol.startsWith(token) ||
    words.some((word) => word.startsWith(token))
  );
};
const results = rows
  .map((row) => {
    const symbol = String(row.symbol || row.ticker || row?.data?.symbol || "").trim().toUpperCase();
    if (!symbol || !/^[A-Z0-9.-]{1,12}$/.test(symbol)) return null;
    const name = firstText(
      row.name,
      row.companyName,
      row.shortName,
      row.longName,
      row?.data?.name,
      row?.data?.longName,
      row?.data?.shortName,
      FALLBACK_COMPANY_NAMES[symbol],
      symbol
    );
    const exchange = firstText(row.exchange, row.stockExchange, row.exchangeShortName, row?.data?.exchange);
    const type = firstText(row.type, row.securityType);
    return {
      symbol,
      name,
      exchange,
      exchangeFullName: firstText(row.exchangeFullName, row.stockExchange),
      type,
      logo: getFinnhubLogoUrl(symbol),
      logoFallbacks: [
        getFinnhubLogoUrl(symbol),
        `https://images.financialmodelingprep.com/symbol/${encodeURIComponent(symbol)}.png`,
        `https://financialmodelingprep.com/image-stock/${encodeURIComponent(symbol)}.png`,
        `https://eodhd.com/img/logos/US/${encodeURIComponent(symbol)}.png`,
        `https://assets.parqet.com/logos/symbol/${encodeURIComponent(symbol)}?format=png`
      ].filter(Boolean)
    };
  })
  .filter(Boolean)
  .filter(isStockSearchEquity)
  .filter(matchesStockSearchQuery)
  .sort((a, b) => {
    const exactA = a.symbol === cleanQuery.toUpperCase() ? -1 : 0;
    const exactB = b.symbol === cleanQuery.toUpperCase() ? -1 : 0;
    if (exactA !== exactB) return exactA - exactB;
    const rankA = primaryExchangeRank(a.exchange);
    const rankB = primaryExchangeRank(b.exchange);
    if (rankA !== rankB) return rankA - rankB;
    const suffixA = /[.-]/.test(a.symbol) ? 1 : 0;
    const suffixB = /[.-]/.test(b.symbol) ? 1 : 0;
    if (suffixA !== suffixB) return suffixA - suffixB;
    return a.symbol.localeCompare(b.symbol);
  })
  .filter((item) => {
    if (seen.has(item.symbol)) return false;
    seen.add(item.symbol);
    return true;
  })
  .slice(0, 8);

stockSearchCache.set(cacheKey, {
  results,
  expiresAt: Date.now() + 10 * 60 * 1000
});

res.json({ results });
} catch (err) {
console.error("Stock search failed:", err.response?.status || err.message);
res.status(500).json({ results: [] });
}
});

app.get("/api/stock-screener", async (req, res) => {
try {
if (!process.env.FMP_API_KEY || !canUseFmp()) return res.json({ results: [], updatedAt: new Date().toISOString() });

const numericParam = (name, min = null, max = null) => {
  const value = toNumberOrNull(req.query[name]);
  if (value === null) return null;
  if (min !== null && value < min) return null;
  if (max !== null && value > max) return null;
  return value;
};
const textParam = (name, maxLength = 50) => {
  const value = String(req.query[name] || "").trim();
  if (!value) return "";
  return value.replace(/[^a-zA-Z0-9 .,&'/-]/g, "").slice(0, maxLength);
};

const limit = Math.min(Math.max(Number(req.query.limit) || 50, 10), 100);
const page = Math.min(Math.max(Number(req.query.page) || 0, 0), 50);
const assetType = String(req.query.assetType || "all").trim().toLowerCase();
const params = {
  isActivelyTrading: true,
  limit,
  page
};
if (assetType === "stocks") {
  params.isEtf = false;
  params.isFund = false;
} else if (assetType === "etfs") {
  params.isEtf = true;
  params.isFund = false;
} else if (assetType === "funds") {
  params.isFund = true;
}

[
  ["marketCapMoreThan", numericParam("marketCapMoreThan", 0)],
  ["marketCapLowerThan", numericParam("marketCapLowerThan", 0)],
  ["priceMoreThan", numericParam("priceMoreThan", 0)],
  ["priceLowerThan", numericParam("priceLowerThan", 0)],
  ["betaMoreThan", numericParam("betaMoreThan", -20, 20)],
  ["betaLowerThan", numericParam("betaLowerThan", -20, 20)],
  ["dividendMoreThan", numericParam("dividendMoreThan", 0)],
  ["dividendLowerThan", numericParam("dividendLowerThan", 0)],
  ["volumeMoreThan", numericParam("volumeMoreThan", 0)],
  ["volumeLowerThan", numericParam("volumeLowerThan", 0)]
].forEach(([key, value]) => {
  if (value !== null) params[key] = value;
});

[
  ["sector", textParam("sector")],
  ["industry", textParam("industry")],
  ["exchange", textParam("exchange", 20)],
  ["country", textParam("country", 20)]
].forEach(([key, value]) => {
  if (value) params[key] = value;
});

const cacheKey = JSON.stringify(params);
const cached = stockScreenerCache.get(cacheKey);
if (cached && cached.expiresAt > Date.now()) return res.json(cached.data);

const { data } = await axios.get("https://financialmodelingprep.com/stable/company-screener", {
  params: {
    ...params,
    apikey: process.env.FMP_API_KEY
  },
  timeout: 6000
});

const results = (Array.isArray(data) ? data : [])
  .filter(Boolean)
  .map((row) => {
    const symbol = String(row.symbol || "").trim().toUpperCase();
    const isEtf = row.isEtf === true || String(row.isEtf || "").toLowerCase() === "true";
    const isFund = row.isFund === true || String(row.isFund || "").toLowerCase() === "true";
    const dividendValue = firstFiniteNumber(row.lastAnnualDividend, row.lastDividend, row.dividend);
    const currentDividend = dividendValue !== null && dividendValue >= 0.01 ? dividendValue : null;
    return {
      symbol,
      companyName: firstText(row.companyName, row.name, symbol),
      marketCap: toNumberOrNull(row.marketCap),
      sector: firstText(row.sector),
      industry: firstText(row.industry),
      beta: toNumberOrNull(row.beta),
      price: toNumberOrNull(row.price),
      currentDividend,
      lastDividend: currentDividend,
      dividend: currentDividend,
      volume: toNumberOrNull(row.volume),
      exchange: firstText(row.exchangeShortName, row.exchange),
      country: firstText(row.country),
      assetType: isEtf ? "ETF" : isFund ? "Fund" : "Stock",
      isEtf,
      isFund,
      logo: getFinnhubLogoUrl(symbol)
    };
  })
  .filter((row) => row.symbol && /^[A-Z0-9.-]{1,12}$/.test(row.symbol))
  .sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0));

const responseData = {
  results,
  filters: params,
  updatedAt: new Date().toISOString(),
  source: "FMP stock screener"
};

stockScreenerCache.set(cacheKey, {
  data: responseData,
  expiresAt: Date.now() + 5 * 60 * 1000
});

res.json(responseData);
} catch (err) {
setFmpCooldown(err, "stock screener", "screener");
console.log("FMP stock screener skipped:", err.response?.status || err.message);
res.status(500).json({ results: [], error: "Stock screener data is not available yet." });
}
});

const financialStatementLabel = (field) => {
  const overrides = {
    eps: "EPS",
    epsDiluted: "Diluted EPS",
    ebitda: "EBITDA",
    ebitdaratio: "EBITDA Margin",
    grossProfitRatio: "Gross Margin",
    operatingIncomeRatio: "Operating Margin",
    incomeBeforeTaxRatio: "Pretax Margin",
    netIncomeRatio: "Profit Margin",
    weightedAverageShsOut: "Weighted Avg Shares",
    weightedAverageShsOutDil: "Diluted Weighted Avg Shares",
    cashAndCashEquivalents: "Cash & Cash Equivalents",
    cashAndShortTermInvestments: "Cash & Short Term Investments",
    propertyPlantEquipmentNet: "Property, Plant & Equipment",
    accountPayables: "Accounts Payable",
    othertotalStockholdersEquity: "Other Stockholders' Equity",
    netCashProvidedByOperatingActivities: "Operating Cash Flow",
    operatingCashFlow: "Operating Cash Flow",
    netCashUsedForInvestingActivites: "Net Cash Used For Investing",
    netCashUsedProvidedByFinancingActivities: "Net Cash From Financing",
    netIncomeFromContinuingOperations: "Net Income From Continuing Operations",
    netIncomeFromDiscontinuedOperations: "Net Income From Discontinued Operations",
    freeCashFlow: "Free Cash Flow"
  };
  if (overrides[field]) return overrides[field];
  return String(field || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\bAnd\b/g, "&")
    .replace(/\bOf\b/g, "of")
    .replace(/\bIn\b/g, "in")
    .replace(/\bFor\b/g, "for")
    .replace(/^./, (letter) => letter.toUpperCase());
};

const financialStatementValueFormat = (field) => {
  const key = String(field || "").toLowerCase();
  if (key === "eps" || key === "epsdiluted" || key.includes("pershare")) return "perShare";
  if (key.endsWith("ratio") || key.includes("margin")) return "percent";
  if (key.includes("weightedaverageshsout") || key.includes("shares")) return "shares";
  return "currency";
};

const financialStatementPeriodLabel = (row, period) => {
  const year = firstText(row?.calendarYear, row?.fiscalYear, String(row?.date || "").slice(0, 4));
  if (period === "quarter") {
    const quarter = firstText(row?.period);
    return quarter && year ? `${quarter} ${year}` : firstText(row?.date, year);
  }
  return year ? String(year) : firstText(row?.date);
};

const normalizeFinancialStatementRows = (rows, statementType, period) => {
  const config = FINANCIAL_STATEMENT_ENDPOINTS[statementType] || FINANCIAL_STATEMENT_ENDPOINTS.income;
  const statementRows = Array.isArray(rows) ? rows.filter(Boolean).slice(0, 5) : [];
  const availableFieldSet = new Set(config.fields);
  statementRows.forEach((row) => {
    Object.keys(row || {}).forEach((field) => {
      if (!FINANCIAL_STATEMENT_META_FIELDS.has(field) && toNumberOrNull(row[field]) !== null) {
        availableFieldSet.add(field);
      }
    });
  });

  const fields = [...availableFieldSet].filter((field) =>
    statementRows.some((row) => toNumberOrNull(row?.[field]) !== null)
  );
  const periods = statementRows.map((row, index) => ({
    key: `${row.date || index}-${row.period || period}`,
    label: financialStatementPeriodLabel(row, period),
    date: row.date || null,
    filingDate: row.fillingDate || row.filingDate || null,
    currency: firstText(row.reportedCurrency)
  }));

  return {
    periods,
    rows: fields.map((field) => ({
      key: field,
      label: financialStatementLabel(field),
      format: financialStatementValueFormat(field),
      values: statementRows.map((row) => toNumberOrNull(row?.[field]))
    }))
  };
};

app.get("/api/financial-statements/:ticker", async (req, res) => {
  try {
    const symbol = String(req.params.ticker || "").trim().toUpperCase();
    if (!symbol || !/^[A-Z0-9.-]{1,15}$/.test(symbol)) {
      return res.status(400).json({ error: "Invalid ticker" });
    }
    if (!process.env.FMP_API_KEY || !canUseFmp()) {
      return res.status(503).json({ error: "Financial statements are not available yet." });
    }

    const statementType = FINANCIAL_STATEMENT_ENDPOINTS[req.query.statement] ? req.query.statement : "income";
    const period = String(req.query.period || "annual").toLowerCase() === "quarter" ? "quarter" : "annual";
    const config = FINANCIAL_STATEMENT_ENDPOINTS[statementType];
    const data = await getFmpData(symbol, `financial statements ${statementType} ${period}`, [
      `/stable/${config.path}?symbol={ticker}&period=${period}&limit=5`
    ]);
    const statementRows = Array.isArray(data) ? data : data ? [data] : [];
    const normalized = normalizeFinancialStatementRows(statementRows, statementType, period);

    res.json({
      symbol,
      statement: statementType,
      statementLabel: config.label,
      period,
      source: "FMP financial statements",
      updatedAt: new Date().toISOString(),
      ...normalized
    });
  } catch (err) {
    setFmpCooldown(err, "financial statements", req.params.ticker);
    console.log("FMP financial statements skipped:", req.params.ticker, err.response?.status || err.message);
    res.status(500).json({ error: "Financial statements are not available yet." });
  }
});

app.get("/api/stock-screener/options", async (req, res) => {
try {
if (!process.env.FMP_API_KEY || !canUseFmp()) {
  return res.json({ sectors: [], industries: [], exchanges: [], countries: [], updatedAt: new Date().toISOString() });
}

const cacheKey = "stock-screener-options";
const cached = stockScreenerOptionsCache.get(cacheKey);
if (cached && cached.expiresAt > Date.now()) return res.json(cached.data);

const fetchOptionList = async (path, key, mapper = null) => {
  try {
    const { data } = await axios.get(`https://financialmodelingprep.com/stable/${path}`, {
      params: { apikey: process.env.FMP_API_KEY },
      timeout: 6000
    });

    return [...new Set((Array.isArray(data) ? data : [])
      .map((row) => {
        if (mapper) return mapper(row);
        return firstText(row?.[key], row);
      })
      .map((value) => String(value || "").trim())
      .filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));
  } catch (err) {
    console.log(`FMP ${path} options skipped:`, err.response?.status || err.message);
    return [];
  }
};

const [sectors, industries, exchanges, countries] = await Promise.all([
  fetchOptionList("available-sectors", "sector"),
  fetchOptionList("available-industries", "industry"),
  fetchOptionList("available-exchanges", "exchange", (row) => firstText(row?.exchange, row?.name)),
  fetchOptionList("available-countries", "country")
]);

const responseData = {
  sectors,
  industries,
  exchanges,
  countries,
  updatedAt: new Date().toISOString(),
  source: "FMP screener options"
};

stockScreenerOptionsCache.set(cacheKey, {
  data: responseData,
  expiresAt: Date.now() + 24 * 60 * 60 * 1000
});

res.json(responseData);
} catch (err) {
setFmpCooldown(err, "stock screener options", "screener-options");
console.log("FMP stock screener options skipped:", err.response?.status || err.message);
res.status(500).json({ sectors: [], industries: [], exchanges: [], countries: [], error: "Stock screener options are not available yet." });
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
