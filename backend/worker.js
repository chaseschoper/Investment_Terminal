require("dotenv").config();

const mongoose = require("mongoose");
const axios = require("axios");
const yahooFinance = require("yahoo-finance2").default;

const Stock = require("./models/Stock");
const FINANCIAL_HISTORY_VERSION = 6;
const REVENUE_KEY_PRIORITY = {
  annualTotalRevenue: 5,
  annualOperatingRevenue: 4,
  annualNetInterestIncome: 3,
  annualTotalPremiumsEarned: 3,
  annualNonInterestIncome: 2
};

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
    if (
      timeSeriesHistory.some((row) => toNumberOrNull(row.revenue) !== null) &&
      timeSeriesHistory.some((row) => toNumberOrNull(row.earnings) !== null) &&
      timeSeriesHistory.some((row) => toNumberOrNull(row.eps) !== null)
    ) {
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
      console.log("Financials reported skipped:", ticker, err.message);
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
      console.log("Price target skipped:", ticker);
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

      if (
        currentNumber === null ||
        previousNumber === null ||
        previousNumber === 0
      ) {
        return null;
      }

      return ((currentNumber - previousNumber) / Math.abs(previousNumber)) * 100;
    };

    const annualMargin = (numerator, revenue) => {
      const numeratorNumber = toNumberOrNull(numerator);
      const revenueNumber = toNumberOrNull(revenue);

      if (
        numeratorNumber === null ||
        revenueNumber === null ||
        revenueNumber === 0
      ) {
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
      latestAnnual.eps ??
      null;

    const nextEps =
      epsEstimates[1]?.epsAvg ??
      metrics.epsEstimateNextYear ??
      null;

    const currentRevenue =
      revenueEstimates[0]?.revenueAvg ??
      yahooSupplementalData.analystEstimates?.currentYear?.revenue ??
      (latestAnnual.revenue ? latestAnnual.revenue * 1000000000 : null);

    const nextRevenue =
      revenueEstimates[1]?.revenueAvg ??
      yahooSupplementalData.analystEstimates?.nextYear?.revenue ??
      null;

    const currentEarnings =
      firstNumber(
        fmpAnalystEstimates[0]?.netIncomeAvg,
        latestAnnual.earnings ? latestAnnual.earnings * 1000000000 : null,
        currentEps && sharesOutstanding
          ? currentEps * sharesOutstanding * 1000000
          : null
      );

    const nextEarnings =
      firstNumber(
        fmpAnalystEstimates[1]?.netIncomeAvg,
        nextEps && sharesOutstanding
          ? nextEps * sharesOutstanding * 1000000
          : null
      );

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

          marketCap: yahooSupplementalData.marketCap ??
            (profile.marketCapitalization
              ? profile.marketCapitalization * 1000000
              : null),

          sharesOutstanding:
            sharesOutstanding ??
            (yahooSupplementalData.sharesOutstanding
              ? yahooSupplementalData.sharesOutstanding / 1000000
              : null),

          pe: firstNumber(
            metrics.peNormalizedAnnual,
            metrics.peTTM,
            yahooSupplementalData.pe
          ),
          forwardPE: firstNumber(
            metrics.forwardPE,
            yahooSupplementalData.forwardPE
          ),

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

          freeCashflow: firstNumber(
            metrics.freeCashFlowTTM,
            metrics.fcfTTM,
            fmpCashFlow[0]?.freeCashFlow,
            yahooSupplementalData.freeCashflow,
            latestAnnual.freeCashflow
              ? latestAnnual.freeCashflow * 1000000000
              : null
          ),

          targetMean: firstNumber(
            priceTarget?.targetMean,
            metrics.ptMean,
            fmpPriceTarget?.targetConsensus,
            fmpPriceTarget?.targetMean,
            yahooSupplementalData.targetMean
          ),
          recommendationKey:
            rating !== "N/A" ? rating : yahooSupplementalData.recommendationKey,

          analystEstimates: {
            currentYear: {
              revenue: firstNumber(
                fmpAnalystEstimates[0]?.revenueAvg,
                currentRevenue
              ),
              earnings: currentEarnings,
              eps: firstNumber(currentEps, fmpAnalystEstimates[0]?.epsAvg)
            },
            nextYear: {
              revenue: firstNumber(
                fmpAnalystEstimates[1]?.revenueAvg,
                nextRevenue
              ),
              earnings: nextEarnings,
              eps: firstNumber(nextEps, fmpAnalystEstimates[1]?.epsAvg)
            }
          },
          financialHistoryVersion: FINANCIAL_HISTORY_VERSION,
          revenueHistory,

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
