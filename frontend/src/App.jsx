import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

import {
  useEffect,
  useRef,
  useState
} from "react";
import { createPortal } from "react-dom";
const formatMoney = (value) => {

  if (value === null || value === undefined) return "N/A";

  if (value >= 1000) {
    return `$${(value / 1000).toFixed(1)}T`;
  }

  return `$${value.toFixed(1)}B`;
};
const isNumber = (value) =>
  typeof value === "number" && !Number.isNaN(value);

const firstNumber = (...values) =>
  values.find((value) => isNumber(value)) ?? null;

const formatPercent = (value) =>
  isNumber(value) ? `${value.toFixed(1)}%` : "N/A";

const isFutureTranscriptPeriod = (period) => {
  if (!period?.date) return false;
  const parsed = new Date(period.date);
  if (!Number.isFinite(parsed.getTime())) return false;
  return parsed.getTime() > Date.now() + 12 * 60 * 60 * 1000;
};

const normalizeTranscriptPeriodOptions = (periods = []) =>
  (Array.isArray(periods) ? periods : [])
    .map((period) => {
      const year = Number(period?.year);
      const quarter = Number(period?.quarter);
      if (!Number.isInteger(year) || !Number.isInteger(quarter)) return null;
      return {
        value: period.value || `${year}-Q${quarter}`,
        label: period.label || `${year} Q${quarter}`,
        year,
        quarter,
        date: period.date || null,
        provider: period.provider || null
      };
    })
    .filter(Boolean)
    .filter((period) => !isFutureTranscriptPeriod(period))
    .sort((a, b) => (b.year * 4 + b.quarter) - (a.year * 4 + a.quarter));

const COMPANY_DOCUMENT_TABS = [
  { id: "results", label: "Latest Results" },
  { id: "annual", label: "Annual Reports" },
  { id: "quarterly", label: "Quarterly Reports" },
  { id: "current", label: "8-K / Current" },
  { id: "proxy", label: "Proxy" },
  { id: "ownership", label: "Ownership" },
  { id: "registration", label: "Registration" },
  { id: "all", label: "All SEC Filings" }
];

const DEFAULT_SCREENER_FILTERS = {
  marketCapMoreThan: "1000000000",
  marketCapLowerThan: "",
  priceMoreThan: "",
  priceLowerThan: "",
  betaMoreThan: "",
  betaLowerThan: "",
  dividendMoreThan: "",
  dividendLowerThan: "",
  volumeMoreThan: "",
  volumeLowerThan: "",
  sector: "",
  industry: "",
  exchange: "",
  country: "US",
  assetType: "all",
  limit: "50"
};

const FINANCIAL_STATEMENT_TYPES = [
  { id: "income", label: "Income Statement" },
  { id: "balance", label: "Balance Sheet" },
  { id: "cashflow", label: "Cash Flow" }
];

const FINANCIAL_STATEMENT_PERIODS = [
  { id: "annual", label: "Annual" },
  { id: "quarter", label: "Quarterly" }
];

const EPS_CHART_SHARE_OPTIONS = [
  { id: "diluted", label: "Diluted EPS", key: "epsDiluted" },
  { id: "basic", label: "Basic EPS", key: "epsBasic" }
];

const EPS_BEAT_MISS_OPTIONS = [
  { id: "normalized", label: "Normalized EPS" }
];

const epsChartShareOption = (basis = "diluted") =>
  EPS_CHART_SHARE_OPTIONS.find((option) => option.id === basis) || EPS_CHART_SHARE_OPTIONS[0];

const FUNDAMENTAL_HISTORY_RANGES = [
  { id: "3", label: "3Y", years: 3 },
  { id: "5", label: "5Y", years: 5 },
  { id: "10", label: "10Y", years: 10 },
  { id: "15", label: "15Y", years: 15 },
  { id: "20", label: "20Y", years: 20 },
  { id: "max", label: "Max", years: null }
];

const rangeLimitForPeriod = (rangeId, period) => {
  const range = FUNDAMENTAL_HISTORY_RANGES.find((item) => item.id === rangeId);
  const isQuarterly = String(period || "").toLowerCase().startsWith("q");
  if (!range?.years) return isQuarterly ? 80 : 40;
  return isQuarterly ? range.years * 4 : range.years;
};

const historyRowSortValue = (row = {}) => {
  const dateValue = row.date || row.reportDate || row.fillingDate || row.acceptedDate;
  if (dateValue) {
    const time = new Date(`${String(dateValue).slice(0, 10)}T12:00:00`).getTime();
    if (!Number.isNaN(time)) return time;
  }

  const year = Number(row.year);
  if (!Number.isFinite(year)) return null;
  const periodText = String(row.period || row.fiscalQuarter || "").toUpperCase();
  const quarterMatch = periodText.match(/Q([1-4])/);
  const quarter = quarterMatch ? Number(quarterMatch[1]) : 0;
  return year * 10 + quarter;
};

const sortHistoryRowsOldestFirst = (rows = []) =>
  [...(Array.isArray(rows) ? rows : [])].sort((a, b) => {
    const valueA = historyRowSortValue(a);
    const valueB = historyRowSortValue(b);
    if (valueA !== null && valueB !== null && valueA !== valueB) {
      return valueA - valueB;
    }
    if (valueA !== null && valueB === null) return -1;
    if (valueA === null && valueB !== null) return 1;
    return String(a?.period || a?.label || "").localeCompare(String(b?.period || b?.label || ""));
  });

const filterRowsByHistoryRange = (rows = [], rangeId = "5", mode = "annual") => {
  if (!Array.isArray(rows)) return [];
  const sortedRows = sortHistoryRowsOldestFirst(rows);
  if (rangeId === "max") return sortedRows;
  const limit = rangeLimitForPeriod(rangeId, mode);
  if (!Number.isFinite(limit) || sortedRows.length <= limit) return sortedRows;
  return sortedRows.slice(-limit);
};

const filterFinancialStatementByHistoryRange = (statementData, rangeId = "5", period = "annual") => {
  if (!statementData?.periods?.length) return statementData;
  const indexedPeriods = statementData.periods.map((periodRow, index) => ({
    periodRow,
    index,
    sortValue: historyRowSortValue(periodRow)
  }));
  const sortedPeriods = indexedPeriods.sort((a, b) => {
    if (a.sortValue !== null && b.sortValue !== null && a.sortValue !== b.sortValue) {
      return a.sortValue - b.sortValue;
    }
    if (a.sortValue !== null && b.sortValue === null) return -1;
    if (a.sortValue === null && b.sortValue !== null) return 1;
    return a.index - b.index;
  });
  const limit = rangeLimitForPeriod(rangeId, period);
  const visiblePeriods = rangeId === "max" || !Number.isFinite(limit) || sortedPeriods.length <= limit
    ? sortedPeriods
    : sortedPeriods.slice(-limit);
  const visibleIndexes = visiblePeriods.map((item) => item.index);

  return {
    ...statementData,
    periods: visiblePeriods.map((item) => item.periodRow),
    rows: (statementData.rows || []).map((row) => ({
      ...row,
      values: visibleIndexes.map((index) => row.values?.[index])
    }))
  };
};

const historyRangeLabel = (rangeId) =>
  FUNDAMENTAL_HISTORY_RANGES.find((range) => range.id === rangeId)?.label || "5Y";

const parsePeriodDate = (value) => {
  const text = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const fiscalPeriodStartDate = (period = {}, mode = "annual") => {
  const endDate = parsePeriodDate(period.date || period.reportDate || period.fillingDate || period.acceptedDate);
  if (!endDate) return null;
  const startDate = new Date(endDate);
  if (String(mode || "").toLowerCase().startsWith("q")) {
    startDate.setUTCMonth(startDate.getUTCMonth() - 2);
  } else {
    startDate.setUTCFullYear(startDate.getUTCFullYear() - 1);
    startDate.setUTCDate(startDate.getUTCDate() + 1);
  }
  return startDate;
};

const comparableFundamentalPeriod = (period = {}, mode = "annual") => {
  const isQuarterly = String(mode || "").toLowerCase().startsWith("q");
  const endDate = parsePeriodDate(period.date || period.reportDate || period.fillingDate || period.acceptedDate);
  if (endDate && !isQuarterly) {
    const endMonth = endDate.getUTCMonth();
    const comparableYear = endDate.getUTCFullYear() - (endMonth <= 4 ? 1 : 0);
    return {
      key: `CY${comparableYear}`,
      label: String(comparableYear),
      sortValue: comparableYear * 10
    };
  }
  const startDate = fiscalPeriodStartDate(period, mode);
  if (startDate) {
    const year = startDate.getUTCFullYear();
    if (!isQuarterly) {
      return {
        key: `CY${year}`,
        label: String(year),
        sortValue: year * 10
      };
    }
    const quarter = Math.floor(startDate.getUTCMonth() / 3) + 1;
    return {
      key: `${year}-Q${quarter}`,
      label: `${year} Q${quarter}`,
      sortValue: year * 10 + quarter
    };
  }

  const rawLabel = String(period.label || period.key || "");
  const year = Number(period.year || rawLabel.match(/\b(20\d{2}|19\d{2})\b/)?.[1]);
  const quarter = Number(period.quarter || rawLabel.match(/Q([1-4])/i)?.[1]);
  if (Number.isFinite(year) && year > 0) {
    if (isQuarterly && Number.isFinite(quarter) && quarter >= 1 && quarter <= 4) {
      return {
        key: `${year}-Q${quarter}`,
        label: `${year} Q${quarter}`,
        sortValue: year * 10 + quarter
      };
    }
    return {
      key: `CY${year}`,
      label: String(year),
      sortValue: year * 10
    };
  }

  const fallback = period.date || period.label || period.key || "Period";
  return {
    key: fallback,
    label: fallback,
    sortValue: historyRowSortValue(period) ?? 0
  };
};

const FUNDAMENTAL_STATEMENT_FIELDS = {
  income: [
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
  ],
  balance: [
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
    "otherTotalStockholdersEquity",
    "totalStockholdersEquity",
    "totalEquity",
    "totalLiabilitiesAndTotalEquity",
    "minorityInterest",
    "totalInvestments",
    "totalDebt",
    "netDebt"
  ],
  cashflow: [
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
    "otherInvestingActivities",
    "netCashProvidedByInvestingActivities",
    "netDebtIssuance",
    "longTermNetDebtIssuance",
    "shortTermNetDebtIssuance",
    "netStockIssuance",
    "netCommonStockIssuance",
    "commonStockIssuance",
    "commonStockRepurchased",
    "netPreferredStockIssuance",
    "netDividendsPaid",
    "commonDividendsPaid",
    "preferredDividendsPaid",
    "otherFinancingActivities",
    "netCashProvidedByFinancingActivities",
    "effectOfForexChangesOnCash",
    "netChangeInCash",
    "cashAtEndOfPeriod",
    "cashAtBeginningOfPeriod",
    "capitalExpenditure",
    "freeCashFlow"
  ]
};

const FUNDAMENTAL_FIELD_LABELS = {
  accountsPayables: "Accounts Payable",
  accountsReceivables: "Accounts Receivable",
  accumulatedOtherComprehensiveIncomeLoss: "Accumulated Other Comprehensive Income/Loss",
  capitalExpenditure: "Capital Expenditure",
  cashAndCashEquivalents: "Cash & Equivalents",
  cashAndShortTermInvestments: "Cash + Short-Term Investments",
  cashAtBeginningOfPeriod: "Cash at Beginning of Period",
  cashAtEndOfPeriod: "Cash at End of Period",
  changeInWorkingCapital: "Change in Working Capital",
  commonStockIssued: "Common Stock Issued",
  commonStockIssuance: "Common Stock Issued",
  commonDividendsPaid: "Common Dividends Paid",
  commonStockRepurchased: "Common Stock Repurchased",
  costOfRevenue: "Cost of Revenue",
  deferredIncomeTax: "Deferred Income Tax",
  deferredRevenueNonCurrent: "Deferred Revenue, Non-Current",
  deferredTaxLiabilitiesNonCurrent: "Deferred Tax Liabilities, Non-Current",
  depreciationAndAmortization: "Depreciation & Amortization",
  dividendsPaid: "Dividends Paid",
  ebitda: "EBITDA",
  ebitdaratio: "EBITDA Margin",
  eps: "EPS",
  epsDiluted: "Diluted EPS",
  freeCashFlow: "Free Cash Flow",
  generalAndAdministrativeExpenses: "G&A Expense",
  grossProfit: "Gross Profit",
  grossProfitRatio: "Gross Margin",
  incomeBeforeTax: "Income Before Tax",
  incomeBeforeTaxRatio: "Pretax Margin",
  incomeTaxExpense: "Income Tax Expense",
  investmentsInPropertyPlantAndEquipment: "Investments in PP&E",
  longTermNetDebtIssuance: "Long-Term Net Debt Issuance",
  netCashProvidedByFinancingActivities: "Net Cash from Financing",
  netCashProvidedByInvestingActivities: "Net Cash from Investing",
  netCashProvidedByOperatingActivities: "Net Cash Provided by Operations",
  netDebt: "Net Debt",
  netDebtIssuance: "Net Debt Issuance",
  netDividendsPaid: "Dividends Paid",
  netCommonStockIssuance: "Net Common Stock Issuance",
  netPreferredStockIssuance: "Net Preferred Stock Issuance",
  netIncome: "Net Income",
  netIncomeRatio: "Profit Margin",
  netReceivables: "Net Receivables",
  operatingCashFlow: "Operating Cash Flow",
  operatingExpenses: "Operating Expenses",
  operatingIncome: "Operating Income",
  operatingIncomeRatio: "Operating Margin",
  otherFinancingActivities: "Other Financing Activities",
  otherInvestingActivities: "Other Investing Activities",
  otherTotalStockholdersEquity: "Other Stockholders' Equity",
  preferredDividendsPaid: "Preferred Dividends Paid",
  propertyPlantEquipmentNet: "PP&E Net",
  researchAndDevelopmentExpenses: "R&D Expense",
  salesMaturitiesOfInvestments: "Sales/Maturities of Investments",
  sellingAndMarketingExpenses: "Selling & Marketing Expense",
  sellingGeneralAndAdministrativeExpenses: "SG&A Expense",
  shortTermNetDebtIssuance: "Short-Term Net Debt Issuance",
  stockBasedCompensation: "Stock-Based Compensation",
  totalCurrentAssets: "Total Current Assets",
  totalCurrentLiabilities: "Total Current Liabilities",
  totalDebt: "Total Debt",
  totalEquity: "Total Equity",
  totalInvestments: "Total Investments",
  totalLiabilities: "Total Liabilities",
  totalLiabilitiesAndTotalEquity: "Liabilities + Total Equity",
  totalNonCurrentAssets: "Total Non-Current Assets",
  totalNonCurrentLiabilities: "Total Non-Current Liabilities",
  totalStockholdersEquity: "Stockholders' Equity",
  weightedAverageShsOut: "Weighted Avg Shares",
  weightedAverageShsOutDil: "Weighted Avg Diluted Shares"
};

const FUNDAMENTAL_METRIC_FIELD_LABELS = {
  assetTurnover: "Asset Turnover",
  averageInventory: "Average Inventory",
  averagePayables: "Average Payables",
  averageReceivables: "Average Receivables",
  bookValuePerShare: "Book Value / Share",
  bottomLineProfitMargin: "Bottom Line Profit Margin",
  capexPerShare: "Capex / Share",
  capexToDepreciation: "Capex / Depreciation",
  capexToOperatingCashFlow: "Capex / Operating Cash Flow",
  capexToRevenue: "Capex / Revenue",
  capitalExpenditureCoverageRatio: "Capex Coverage",
  cashConversionCycle: "Cash Conversion Cycle",
  cashDebtCoverage: "Cash / Debt",
  cashPerShare: "Cash / Share",
  cashRatio: "Cash Ratio",
  continuousOperationsProfitMargin: "Continuing Ops Profit Margin",
  currentRatio: "Current Ratio",
  daysOfInventoryOnHand: "Days Inventory on Hand",
  daysInventoryOutstanding: "Days Inventory Outstanding",
  daysOfPayablesOutstanding: "Days Payables Outstanding",
  daysPayablesOutstanding: "Days Payables Outstanding",
  daysOfSalesOutstanding: "Days Sales Outstanding",
  daysSalesOutstanding: "Days Sales Outstanding",
  debtServiceCoverageRatio: "Debt Service Coverage",
  debtToAssets: "Debt / Assets",
  debtToAssetsRatio: "Debt / Assets",
  debtToCapitalRatio: "Debt / Capital",
  debtToEquity: "Debt / Equity",
  debtToEquityRatio: "Debt / Equity",
  dividendPaidAndCapexCoverageRatio: "Dividend + Capex Coverage",
  dividendPayoutRatio: "Dividend Payout Ratio",
  dividendYield: "Dividend Yield",
  earningsYield: "Earnings Yield",
  ebitMargin: "EBIT Margin",
  ebitdaMargin: "EBITDA Margin",
  effectiveTaxRate: "Effective Tax Rate",
  enterpriseValue: "Enterprise Value",
  enterpriseValueMultiple: "EV / EBITDA",
  enterpriseValueOverEBITDA: "EV / EBITDA",
  evToFreeCashFlow: "EV / Free Cash Flow",
  evToOperatingCashFlow: "EV / Operating Cash Flow",
  evToSales: "EV / Sales",
  financialLeverageRatio: "Financial Leverage",
  fixedAssetTurnover: "Fixed Asset Turnover",
  freeCashFlowOperatingCashFlowRatio: "FCF / Operating Cash Flow",
  freeCashFlowPerShare: "Free Cash Flow / Share",
  freeCashFlowYield: "Free Cash Flow Yield",
  grahamNetNet: "Graham Net-Net",
  grahamNumber: "Graham Number",
  grossProfitMargin: "Gross Margin",
  incomeQuality: "Income Quality",
  interestCoverage: "Interest Coverage",
  interestCoverageRatio: "Interest Coverage",
  interestDebtPerShare: "Interest Debt / Share",
  intangiblesToTotalAssets: "Intangibles / Assets",
  investedCapital: "Invested Capital",
  inventoryTurnover: "Inventory Turnover",
  liabilitiesToAssets: "Liabilities / Assets",
  longTermDebtToCapitalRatio: "Long-Term Debt / Capital",
  marketCap: "Market Cap",
  netCurrentAssetValue: "Net Current Asset Value",
  netDebtToEBITDA: "Net Debt / EBITDA",
  netIncomePerEBT: "Net Income / EBT",
  netIncomePerShare: "Net Income / Share",
  netProfitMargin: "Profit Margin",
  operatingCashFlowCoverageRatio: "Operating Cash Flow Coverage",
  operatingCashFlowPerShare: "Operating Cash Flow / Share",
  operatingCashFlowRatio: "Operating Cash Flow Ratio",
  operatingCashFlowSalesRatio: "Operating Cash Flow / Sales",
  operatingCycle: "Operating Cycle",
  operatingProfitMargin: "Operating Margin",
  payablesTurnover: "Payables Turnover",
  payoutRatio: "Payout Ratio",
  pbRatio: "Price / Book",
  pfcfRatio: "Price / Free Cash Flow",
  pocfratio: "Price / Operating Cash Flow",
  pretaxProfitMargin: "Pretax Margin",
  priceBookValueRatio: "Price / Book",
  priceCashFlowRatio: "Price / Cash Flow",
  priceEarningsRatio: "P/E Ratio",
  priceEarningsToGrowthRatio: "PEG Ratio",
  priceFairValue: "Price / Fair Value",
  priceSalesRatio: "Price / Sales",
  priceToBookRatio: "Price / Book",
  priceToEarningsGrowthRatio: "PEG Ratio",
  priceToEarningsRatio: "P/E Ratio",
  priceToFreeCashFlowRatio: "Price / Free Cash Flow",
  priceToOperatingCashFlowRatio: "Price / Operating Cash Flow",
  priceToSalesRatio: "Price / Sales",
  quickAssets: "Quick Assets",
  quickRatio: "Quick Ratio",
  receivablesTurnover: "Receivables Turnover",
  researchAndDevelopementToRevenue: "R&D / Revenue",
  returnOnAssets: "ROA",
  returnOnCapitalEmployed: "ROCE",
  returnOnEquity: "ROE",
  returnOnInvestedCapital: "ROIC",
  returnOnTangibleAssets: "Return on Tangible Assets",
  revenuePerShare: "Revenue / Share",
  roe: "ROE",
  roic: "ROIC",
  salesGeneralAndAdministrativeToRevenue: "SG&A / Revenue",
  shareholdersEquityPerShare: "Equity / Share",
  shortTermOperatingCashFlowCoverageRatio: "Short-Term OCF Coverage",
  solvencyRatio: "Solvency Ratio",
  stockBasedCompensationToRevenue: "Stock-Based Comp / Revenue",
  tangibleAssetValue: "Tangible Asset Value",
  tangibleBookValuePerShare: "Tangible Book Value / Share",
  workingCapital: "Working Capital",
  workingCapitalTurnoverRatio: "Working Capital Turnover"
};

const prettyFundamentalFieldLabel = (field) =>
  FUNDAMENTAL_METRIC_FIELD_LABELS[field] ||
  FUNDAMENTAL_FIELD_LABELS[field] ||
  String(field || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (char) => char.toUpperCase());

const fundamentalFieldFormat = (field) => {
  const cleanField = String(field || "").toLowerCase();
  if (cleanField.includes("ratio") || cleanField.endsWith("margin")) return "percent";
  if (cleanField.includes("eps") || cleanField.includes("pershare")) return "perShare";
  if (cleanField.includes("shsout") || cleanField.includes("shares")) return "shares";
  return "money";
};

const incomeMarginFieldConfig = {
  grossProfitRatio: {
    metricField: "grossProfitMargin",
    numeratorField: "grossProfit",
    denominatorField: "revenue"
  },
  operatingIncomeRatio: {
    metricField: "operatingProfitMargin",
    numeratorField: "operatingIncome",
    denominatorField: "revenue"
  },
  incomeBeforeTaxRatio: {
    metricField: "pretaxProfitMargin",
    numeratorField: "incomeBeforeTax",
    denominatorField: "revenue"
  },
  netIncomeRatio: {
    metricField: "netProfitMargin",
    numeratorField: "netIncome",
    denominatorField: "revenue"
  },
  ebitdaratio: {
    metricField: "ebitdaMargin",
    numeratorField: "ebitda",
    denominatorField: "revenue"
  }
};

const statementIndicators = (statement, fields) =>
  fields.map((field) => {
    const marginConfig = statement === "income" ? incomeMarginFieldConfig[field] : null;
    if (marginConfig) {
      return {
        key: `${statement}_${field}`,
        label: prettyFundamentalFieldLabel(field),
        source: statement,
        field,
        format: "percent",
        calculate: (period) => calculateFundamentalMargin(
          period,
          marginConfig.metricField,
          period.income?.[marginConfig.numeratorField],
          period.income?.[marginConfig.denominatorField],
          field
        )
      };
    }
    return {
      key: `${statement}_${field}`,
      label: prettyFundamentalFieldLabel(field),
      source: statement,
      field,
      format: fundamentalFieldFormat(field),
      scalePercent: String(field || "").toLowerCase().includes("ratio")
    };
  });

const metricPercentFields = new Set([
  "bottomLineProfitMargin",
  "capexToDepreciation",
  "capexToOperatingCashFlow",
  "capexToRevenue",
  "continuousOperationsProfitMargin",
  "debtToAssets",
  "debtToAssetsRatio",
  "debtToCapitalRatio",
  "dividendPayoutRatio",
  "dividendYield",
  "earningsYield",
  "ebitMargin",
  "ebitdaMargin",
  "effectiveTaxRate",
  "freeCashFlowOperatingCashFlowRatio",
  "freeCashFlowYield",
  "grossProfitMargin",
  "intangiblesToTotalAssets",
  "longTermDebtToCapitalRatio",
  "netProfitMargin",
  "operatingCashFlowSalesRatio",
  "operatingProfitMargin",
  "payoutRatio",
  "pretaxProfitMargin",
  "researchAndDevelopementToRevenue",
  "returnOnAssets",
  "returnOnCapitalEmployed",
  "returnOnEquity",
  "returnOnInvestedCapital",
  "returnOnTangibleAssets",
  "roe",
  "roic",
  "salesGeneralAndAdministrativeToRevenue",
  "stockBasedCompensationToRevenue"
]);

const metricMoneyFields = new Set([
  "averageInventory",
  "averagePayables",
  "averageReceivables",
  "enterpriseValue",
  "grahamNetNet",
  "grahamNumber",
  "investedCapital",
  "marketCap",
  "netCurrentAssetValue",
  "quickAssets",
  "tangibleAssetValue",
  "workingCapital"
]);

const fundamentalMetricFormat = (field) => {
  if (metricPercentFields.has(field)) return "percent";
  if (metricMoneyFields.has(field)) return "money";
  if (String(field || "").toLowerCase().includes("pershare")) return "perShare";
  return "plain";
};

const metricIndicator = (spec) => {
  const config = typeof spec === "string" ? { field: spec } : spec;
  const field = config.field;
  return {
    key: `metrics_${field}`,
    label: config.label || prettyFundamentalFieldLabel(field),
    source: "metrics",
    field,
    aliases: config.aliases || [],
    format: fundamentalMetricFormat(field),
    scalePercent: metricPercentFields.has(field)
  };
};

const metricIndicators = (fields) => fields.map(metricIndicator);

const FUNDAMENTAL_CHART_INDICATOR_GROUPS = [
  {
    id: "income",
    label: "Income Statement",
    indicators: statementIndicators("income", FUNDAMENTAL_STATEMENT_FIELDS.income)
  },
  {
    id: "margins",
    label: "Margins",
    indicators: [
      { key: "grossMargin", label: "Gross Margin", format: "percent", calculate: (period) => calculateFundamentalMargin(period, "grossProfitMargin", period.income?.grossProfit, period.income?.revenue, "grossProfitRatio") },
      { key: "operatingMargin", label: "Operating Margin", format: "percent", calculate: (period) => calculateFundamentalMargin(period, "operatingProfitMargin", period.income?.operatingIncome, period.income?.revenue, "operatingIncomeRatio") },
      { key: "pretaxMargin", label: "Pretax Margin", format: "percent", calculate: (period) => calculateFundamentalMargin(period, "pretaxProfitMargin", period.income?.incomeBeforeTax, period.income?.revenue, "incomeBeforeTaxRatio") },
      { key: "profitMargin", label: "Profit Margin", format: "percent", calculate: (period) => calculateFundamentalMargin(period, "netProfitMargin", period.income?.netIncome, period.income?.revenue, "netIncomeRatio") },
      { key: "ebitdaMargin", label: "EBITDA Margin", format: "percent", calculate: (period) => calculateFundamentalMargin(period, "ebitdaMargin", period.income?.ebitda, period.income?.revenue, "ebitdaratio") },
      { key: "ebitMargin", label: "EBIT Margin", format: "percent", calculate: (period) => calculateFundamentalMargin(period, "ebitMargin", period.income?.ebit, period.income?.revenue) },
      { key: "fcfMargin", label: "FCF Margin", format: "percent", calculate: (period) => calculateFundamentalMargin(period, null, period.cashflow?.freeCashFlow, period.income?.revenue) },
      { key: "sgaToRevenue", label: "SG&A / Revenue", format: "percent", calculate: (period) => calculateFundamentalMargin(period, "salesGeneralAndAdministrativeToRevenue", period.income?.sellingGeneralAndAdministrativeExpenses, period.income?.revenue) },
      { key: "rdToRevenue", label: "R&D / Revenue", format: "percent", calculate: (period) => calculateFundamentalMargin(period, "researchAndDevelopementToRevenue", period.income?.researchAndDevelopmentExpenses, period.income?.revenue) }
    ]
  },
  {
    id: "balance",
    label: "Balance Sheet",
    indicators: statementIndicators("balance", FUNDAMENTAL_STATEMENT_FIELDS.balance)
  },
  {
    id: "cashflow",
    label: "Cash Flow",
    indicators: statementIndicators("cashflow", FUNDAMENTAL_STATEMENT_FIELDS.cashflow)
  },
  {
    id: "growth",
    label: "Growth",
    indicators: [
      { key: "revenueGrowth", label: "Revenue Growth", baseKey: "income_revenue", format: "percent", growthOf: { source: "income", field: "revenue" } },
      { key: "grossProfitGrowth", label: "Gross Profit Growth", baseKey: "income_grossProfit", format: "percent", growthOf: { source: "income", field: "grossProfit" } },
      { key: "operatingIncomeGrowth", label: "Operating Income Growth", baseKey: "income_operatingIncome", format: "percent", growthOf: { source: "income", field: "operatingIncome" } },
      { key: "netIncomeGrowth", label: "Net Income Growth", baseKey: "income_netIncome", format: "percent", growthOf: { source: "income", field: "netIncome" } },
      { key: "epsGrowth", label: "EPS Growth", baseKey: "income_eps", format: "percent", growthOf: { source: "income", field: "eps" } },
      { key: "ebitdaGrowth", label: "EBITDA Growth", baseKey: "income_ebitda", format: "percent", growthOf: { source: "income", field: "ebitda" } },
      { key: "operatingCashFlowGrowth", label: "Operating Cash Flow Growth", baseKey: "cashflow_operatingCashFlow", format: "percent", growthOf: { source: "cashflow", field: "operatingCashFlow" } },
      { key: "freeCashFlowGrowth", label: "Free Cash Flow Growth", baseKey: "cashflow_freeCashFlow", format: "percent", growthOf: { source: "cashflow", field: "freeCashFlow" } },
      { key: "totalAssetsGrowth", label: "Total Assets Growth", baseKey: "balance_totalAssets", format: "percent", growthOf: { source: "balance", field: "totalAssets" } },
      { key: "totalDebtGrowth", label: "Total Debt Growth", baseKey: "balance_totalDebt", format: "percent", growthOf: { source: "balance", field: "totalDebt" } },
      { key: "equityGrowth", label: "Equity Growth", baseKey: "balance_totalStockholdersEquity", format: "percent", growthOf: { source: "balance", field: "totalStockholdersEquity" } }
    ]
  },
  {
    id: "valuation-metrics",
    label: "Valuation Metrics",
    indicators: metricIndicators([
      "marketCap",
      "enterpriseValue",
      { field: "priceToEarningsRatio", label: "P/E Ratio", aliases: ["priceEarningsRatio"] },
      { field: "priceToSalesRatio", label: "Price / Sales", aliases: ["priceSalesRatio"] },
      { field: "priceToBookRatio", label: "Price / Book", aliases: ["priceBookValueRatio", "pbRatio"] },
      { field: "priceToFreeCashFlowRatio", label: "Price / Free Cash Flow", aliases: ["pfcfRatio"] },
      { field: "priceToOperatingCashFlowRatio", label: "Price / Operating Cash Flow", aliases: ["pocfratio", "priceCashFlowRatio"] },
      { field: "priceToEarningsGrowthRatio", label: "PEG Ratio", aliases: ["priceEarningsToGrowthRatio"] },
      { field: "evToSales", label: "EV / Sales" },
      { field: "enterpriseValueMultiple", label: "EV / EBITDA", aliases: ["enterpriseValueOverEBITDA", "evToEBITDA"] },
      { field: "evToOperatingCashFlow", label: "EV / Operating Cash Flow" },
      { field: "evToFreeCashFlow", label: "EV / Free Cash Flow" },
      "earningsYield",
      "freeCashFlowYield",
      "grahamNumber",
      "grahamNetNet"
    ])
  },
  {
    id: "per-share-metrics",
    label: "Per Share",
    indicators: metricIndicators([
      "revenuePerShare",
      "netIncomePerShare",
      "operatingCashFlowPerShare",
      "freeCashFlowPerShare",
      "cashPerShare",
      "bookValuePerShare",
      "tangibleBookValuePerShare",
      "shareholdersEquityPerShare",
      "interestDebtPerShare",
      "capexPerShare"
    ])
  },
  {
    id: "liquidity-solvency-metrics",
    label: "Liquidity & Solvency",
    indicators: metricIndicators([
      "currentRatio",
      "quickRatio",
      "cashRatio",
      { field: "debtToEquityRatio", label: "Debt / Equity", aliases: ["debtToEquity"] },
      { field: "debtToAssetsRatio", label: "Debt / Assets", aliases: ["debtToAssets"] },
      "debtToCapitalRatio",
      "longTermDebtToCapitalRatio",
      "financialLeverageRatio",
      { field: "interestCoverageRatio", label: "Interest Coverage", aliases: ["interestCoverage"] },
      "debtServiceCoverageRatio",
      "operatingCashFlowCoverageRatio",
      "shortTermOperatingCashFlowCoverageRatio",
      "operatingCashFlowRatio",
      "solvencyRatio",
      "netDebtToEBITDA",
      "workingCapital",
      "netCurrentAssetValue",
      { field: "cashDebtCoverage", label: "Cash / Debt" },
      { field: "liabilitiesToAssets", label: "Liabilities / Assets" },
      { field: "quickAssets", label: "Quick Assets" }
    ])
  },
  {
    id: "profitability-metrics",
    label: "Profitability",
    indicators: metricIndicators([
      "grossProfitMargin",
      "operatingProfitMargin",
      "pretaxProfitMargin",
      "netProfitMargin",
      "bottomLineProfitMargin",
      "continuousOperationsProfitMargin",
      "ebitdaMargin",
      "ebitMargin",
      "effectiveTaxRate",
      "incomeQuality"
    ])
  },
  {
    id: "efficiency-metrics",
    label: "Efficiency & Returns",
    indicators: metricIndicators([
      { field: "returnOnEquity", label: "ROE", aliases: ["roe"] },
      "returnOnAssets",
      { field: "returnOnInvestedCapital", label: "ROIC", aliases: ["roic"] },
      "returnOnCapitalEmployed",
      "returnOnTangibleAssets",
      "assetTurnover",
      "fixedAssetTurnover",
      "inventoryTurnover",
      "receivablesTurnover",
      "payablesTurnover",
      "workingCapitalTurnoverRatio",
      { field: "daysOfSalesOutstanding", label: "Days Sales Outstanding", aliases: ["daysSalesOutstanding"] },
      { field: "daysOfInventoryOutstanding", label: "Days Inventory Outstanding", aliases: ["daysInventoryOutstanding", "daysOfInventoryOnHand"] },
      { field: "daysOfPayablesOutstanding", label: "Days Payables Outstanding", aliases: ["daysPayablesOutstanding"] },
      "cashConversionCycle",
      "operatingCycle",
      "averageInventory",
      "averagePayables",
      "averageReceivables",
      "operatingCashFlowSalesRatio",
      "freeCashFlowOperatingCashFlowRatio"
    ])
  },
  {
    id: "company-scale-metrics",
    label: "Company Profile & Scale Metrics",
    indicators: metricIndicators([
      "marketCap",
      "enterpriseValue",
      "investedCapital",
      "tangibleAssetValue",
      "netCurrentAssetValue",
      "workingCapital",
      "intangiblesToTotalAssets",
      "researchAndDevelopementToRevenue",
      "salesGeneralAndAdministrativeToRevenue",
      "stockBasedCompensationToRevenue",
      "capexToRevenue",
      "capexToOperatingCashFlow",
      "capexToDepreciation"
    ])
  }
];

const FUNDAMENTAL_CHART_INDICATORS = FUNDAMENTAL_CHART_INDICATOR_GROUPS.flatMap((group) =>
  group.indicators.map((indicator) => ({ ...indicator, groupId: group.id, groupLabel: group.label }))
);

const DEFAULT_FUNDAMENTAL_INDICATORS = ["income_revenue", "income_netIncome", "income_eps"];

const CALENDAR_MODES = [
  { id: "earnings", label: "Earnings" },
  { id: "dividends", label: "Dividends" },
  { id: "ipos", label: "IPOs" },
  { id: "economic", label: "Economic" }
];

const TREASURY_RATE_TERMS = [
  { key: "month1", label: "1M" },
  { key: "month2", label: "2M" },
  { key: "month3", label: "3M" },
  { key: "month6", label: "6M" },
  { key: "year1", label: "1Y" },
  { key: "year2", label: "2Y" },
  { key: "year3", label: "3Y" },
  { key: "year5", label: "5Y" },
  { key: "year7", label: "7Y" },
  { key: "year10", label: "10Y" },
  { key: "year20", label: "20Y" },
  { key: "year30", label: "30Y" }
];

const STOCK_OVERVIEW_SECTIONS = [
  { id: "overview", label: "Header", icon: "header" },
  { id: "price-chart", label: "Price Chart", icon: "chart" },
  { id: "financials", label: "Financial Charts", icon: "bars" },
  { id: "metrics", label: "Metrics", icon: "grid" },
  { id: "analyst-estimates", label: "Estimates", icon: "target" },
  { id: "similar-companies", label: "Peers", icon: "peers" },
  { id: "ai-analysis", label: "AI Analysis", icon: "spark" },
  { id: "earnings-calls", label: "Transcript", icon: "transcript" },
  { id: "company-documents", label: "Documents", icon: "document" },
  { id: "stock-news", label: "News", icon: "news" }
];

const renderOverviewGuideIcon = (icon) => {
  const commonProps = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2.2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true"
  };

  switch (icon) {
    case "chart":
      return (
        <svg {...commonProps}>
          <path d="M4 18h16" />
          <path d="M5 15l4-5 4 3 6-8" />
          <path d="M16 5h3v3" />
        </svg>
      );
    case "bars":
      return (
        <svg {...commonProps}>
          <path d="M5 19V9" />
          <path d="M12 19V5" />
          <path d="M19 19v-7" />
        </svg>
      );
    case "grid":
      return (
        <svg {...commonProps}>
          <rect x="4" y="4" width="6" height="6" rx="1.5" />
          <rect x="14" y="4" width="6" height="6" rx="1.5" />
          <rect x="4" y="14" width="6" height="6" rx="1.5" />
          <rect x="14" y="14" width="6" height="6" rx="1.5" />
        </svg>
      );
    case "target":
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v3" />
          <path d="M22 12h-3" />
        </svg>
      );
    case "peers":
      return (
        <svg {...commonProps}>
          <circle cx="7" cy="8" r="3" />
          <circle cx="17" cy="8" r="3" />
          <path d="M3.5 19a4.5 4.5 0 0 1 7 0" />
          <path d="M13.5 19a4.5 4.5 0 0 1 7 0" />
        </svg>
      );
    case "spark":
      return (
        <svg {...commonProps}>
          <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" />
          <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" />
        </svg>
      );
    case "transcript":
      return (
        <svg {...commonProps}>
          <path d="M6 5h12" />
          <path d="M6 10h12" />
          <path d="M6 15h8" />
          <path d="M6 20h5" />
        </svg>
      );
    case "document":
      return (
        <svg {...commonProps}>
          <path d="M7 3h7l4 4v14H7z" />
          <path d="M14 3v5h4" />
          <path d="M10 13h5" />
          <path d="M10 17h5" />
        </svg>
      );
    case "news":
      return (
        <svg {...commonProps}>
          <path d="M5 5h12v14H5z" />
          <path d="M17 8h2v9a2 2 0 0 1-2 2" />
          <path d="M8 9h6" />
          <path d="M8 13h6" />
          <path d="M8 17h3" />
        </svg>
      );
    default:
      return (
        <svg {...commonProps}>
          <path d="M4 12h16" />
          <path d="M12 4v16" />
          <circle cx="12" cy="12" r="7" />
        </svg>
      );
  }
};

const HOME_FEATURES = [
  {
    id: "market-overview",
    icon: "market",
    label: "Market Overview",
    title: "See the whole market first",
    text: "Check the major indexes, market clock, broad-market movers, and top traded stocks before diving into one company."
  },
  {
    id: "overview",
    icon: "overview",
    label: "Stock Overview",
    title: "Everything on one company page",
    text: "Search a ticker and review live pricing, financial charts, metrics, estimates, peer comps, AI analysis, transcripts, and company documents together."
  },
  {
    id: "etfs",
    icon: "etf",
    label: "ETF Overview",
    title: "Break down funds fast",
    text: "Search ETFs and mutual funds to review price, assets, fees, yield, exposure, asset mix, and top holdings when available."
  },
  {
    id: "crypto",
    icon: "crypto",
    label: "Crypto Center",
    title: "Track digital assets",
    text: "Search cryptocurrencies to review price, market cap, supply, volume, ranges, moving averages, and 5-minute chart history."
  },
  {
    id: "forex",
    icon: "forex",
    label: "FOREX Overview",
    title: "Follow currency pairs",
    text: "Search forex pairs to review price, change, volume, daily and yearly ranges, moving averages, exchange, open, and previous close."
  },
  {
    id: "stock-screener",
    icon: "screener",
    label: "Stock Screener",
    title: "Find stocks by the numbers",
    text: "Filter active stocks, ETFs, and funds by market cap, price, sector, industry, beta, dividend, volume, exchange, and country."
  },
  {
    id: "news",
    icon: "news",
    label: "News",
    title: "Follow the market feed",
    text: "Read the latest market headlines and keep up with the companies driving the day."
  },
  {
    id: "financial-statements",
    icon: "statements",
    label: "Financial Statements",
    title: "Read the statements directly",
    text: "Open income statement, balance sheet, and cash flow lines across annual or quarterly periods."
  },
  {
    id: "fundamental-charts",
    icon: "fundamental-charts",
    label: "Fundamental Charts",
    title: "Chart fundamentals your way",
    text: "Compare stocks across annual or quarterly statement data, margins, cash flow, returns, per-share metrics, and growth."
  },
  {
    id: "projections",
    icon: "projections",
    label: "Projections",
    title: "Build your own stock cases",
    text: "Run bear, base, and bull scenarios with clean inputs for growth, margins, valuation, and expected return."
  },
  {
    id: "comparison",
    icon: "comparison",
    label: "Compare",
    title: "Line companies up side by side",
    text: "Compare several stocks at once so differences in price, performance, valuation, and fundamentals are easier to spot."
  },
  {
    id: "portfolio",
    icon: "portfolio",
    label: "Portfolio",
    title: "Track positions and performance",
    text: "Keep your holdings organized, see your portfolio value, and follow performance without leaving your research flow."
  },
  {
    id: "watchlists",
    icon: "watchlists",
    label: "Watchlists",
    title: "Keep ideas in the top bar",
    text: "Pin the stocks, ETFs, crypto, or forex pairs you care about in the top watchlist bar so they stay visible while you research."
  },
  {
    id: "earnings-calendar",
    icon: "calendar",
    label: "Calendar",
    title: "Know what reports next",
    text: "Use the calendar to see upcoming earnings, dividends, IPOs, expected EPS, expected revenue, and recent market events."
  },
  {
    id: "treasury-rates",
    icon: "treasury",
    label: "Treasury Rates",
    title: "Watch the yield curve",
    text: "Track the latest U.S. Treasury rates from 1 month through 30 years with recent history."
  },
  {
    id: "overview",
    icon: "documents",
    label: "Documents",
    title: "Read the actual company releases",
    text: "Open the latest 10-K, 10-Q, earnings release, income statement, balance sheet, and cash flow documents from the stock page."
  }
];

const HOME_TOUR_SECTIONS = [
  {
    id: "overview",
    icon: "overview",
    label: "Stock Overview",
    eyebrow: "Company command center",
    title: "One page for the full stock story.",
    text: "Search a company and move through live pricing, financial charts, valuation, estimates, peers, AI analysis, transcripts, filings, and company news without jumping between tabs.",
    bullets: ["Price chart and watchlist-aware quote", "Annual and quarterly financial charts", "Metrics, estimates, peers, documents, and news"],
    snapshot: "overview"
  },
  {
    id: "financial-statements",
    icon: "statements",
    label: "Financial Statements",
    eyebrow: "Raw statement view",
    title: "Income statement, balance sheet, and cash flow in one clean table.",
    text: "Choose annual or quarterly, stretch the period range, and read statement lines the way you would on a finance terminal.",
    bullets: ["Annual and quarterly periods", "Income statement, balance sheet, cash flow", "Sticky line labels for easier reading"],
    snapshot: "statements"
  },
  {
    id: "fundamental-charts",
    icon: "fundamental-charts",
    label: "Fundamental Charts",
    eyebrow: "Build your own charts",
    title: "Compare companies across any available fundamental indicator.",
    text: "Add multiple stocks, choose statement fields or metric groups, and chart annual or quarterly data across 3 years, 5 years, 10 years, 20 years, or max history.",
    bullets: ["Multiple tickers and indicators", "Organized metric categories", "Hover cards for exact values"],
    snapshot: "charts"
  },
  {
    id: "projections",
    icon: "projections",
    label: "Projections",
    eyebrow: "Scenario engine",
    title: "Turn estimates into bear, base, and bull cases.",
    text: "Use the estimates already flowing through MrktRally as a starting point, then edit the growth, margin, valuation, and return assumptions yourself.",
    bullets: ["Editable revenue and net income growth", "Bear, base, and bull views", "Expected return and valuation outputs"],
    snapshot: "projections"
  },
  {
    id: "comparison",
    icon: "comparison",
    label: "Compare",
    eyebrow: "Side-by-side research",
    title: "Line up companies before you pick a favorite.",
    text: "Compare prices, valuation, balance sheet metrics, profitability, efficiency, cash flow, company profile data, and more in one grouped view.",
    bullets: ["Multiple stocks at once", "Grouped metrics for cleaner scanning", "Fast add and remove controls"],
    snapshot: "compare"
  },
  {
    id: "stock-screener",
    icon: "screener",
    label: "Stock Screener",
    eyebrow: "Find market ideas",
    title: "Filter the market by the numbers that matter.",
    text: "Search active stocks, ETFs, and funds by size, price, beta, volume, dividend, sector, industry, exchange, and country.",
    bullets: ["Sector and industry filters", "Beta, volume, dividend, and market cap", "Sortable market idea table"],
    snapshot: "screener"
  },
  {
    id: "market-overview",
    icon: "market",
    label: "Market Overview",
    eyebrow: "Market dashboard",
    title: "Start with the market before the stock.",
    text: "Track index cards, the market clock, top movers, and top traded stocks from a dedicated market overview page.",
    bullets: ["Index cards and countdown", "Top gainers and losers", "Most actively traded names"],
    snapshot: "market"
  },
  {
    id: "etfs",
    icon: "etf",
    label: "ETF Overview",
    eyebrow: "Funds and ETFs",
    title: "Break down funds with the same research flow.",
    text: "Search ETFs and mutual funds to review price, chart history, assets, fees, yield, holdings, sector exposure, country exposure, and asset mix.",
    bullets: ["ETF and mutual fund search", "Holdings and exposure breakdowns", "Price chart with time ranges"],
    snapshot: "funds"
  },
  {
    id: "watchlists",
    icon: "watchlists",
    label: "Watchlists",
    eyebrow: "Top watchlist bar",
    title: "Keep your highest-priority symbols visible.",
    text: "Use the top watchlist bar to keep key stocks, ETFs, crypto, and forex pairs in view while you move through the terminal.",
    bullets: ["Persistent top bar", "Fast add and remove controls", "Stays visible across research pages"],
    snapshot: "watchlists"
  },
  {
    id: "portfolio",
    icon: "portfolio",
    label: "Portfolio",
    eyebrow: "Track positions",
    title: "Follow value, allocation, country, and industry exposure.",
    text: "Enter shares, cost basis, and cash so you can track total value, performance, allocation, and portfolio breakdowns.",
    bullets: ["Holdings and cash row", "Portfolio value and performance", "Allocation, country, and industry charts"],
    snapshot: "portfolio"
  },
  {
    id: "earnings-calendar",
    icon: "calendar",
    label: "Calendar",
    eyebrow: "Dates that move stocks",
    title: "Earnings, dividends, IPOs, and economic releases.",
    text: "Switch between the calendars that matter and open events to see the fields behind them.",
    bullets: ["Earnings reports with actuals and estimates", "Dividend and IPO calendars", "Economic data releases"],
    snapshot: "calendar"
  },
  {
    id: "treasury-rates",
    icon: "treasury",
    label: "Treasury Rates",
    eyebrow: "Macro pulse",
    title: "Watch the yield curve from short rates to long bonds.",
    text: "Follow Treasury rates across maturities with a clean chart view for the broader market backdrop.",
    bullets: ["1 month through 30 years", "Recent rate history", "Macro context beside equity research"],
    snapshot: "rates"
  },
  {
    id: "crypto",
    icon: "crypto",
    label: "Crypto Center",
    eyebrow: "Digital assets",
    title: "Track crypto quotes and chart history.",
    text: "Search crypto symbols for price, market cap, volume, supply, ranges, moving averages, and intraday chart movement.",
    bullets: ["Crypto quote cards", "Supply and market cap", "5-minute chart data"],
    snapshot: "crypto"
  },
  {
    id: "forex",
    icon: "forex",
    label: "FOREX Overview",
    eyebrow: "Currency pairs",
    title: "Follow major forex pairs in their own space.",
    text: "Search currency pairs and review price, change, volume, open, previous close, ranges, moving averages, and chart history.",
    bullets: ["Forex-only search", "Daily and yearly range cards", "Dedicated pair charting"],
    snapshot: "forex"
  },
  {
    id: "news",
    icon: "news",
    label: "News",
    eyebrow: "Market headlines",
    title: "Keep the news flow next to the numbers.",
    text: "Read general market headlines and stock-specific news from the stock overview page.",
    bullets: ["General news page", "Stock news under documents", "Clickable headlines for deeper reading"],
    snapshot: "news"
  }
];

const HOME_FOOTER_GROUPS = [
  {
    title: "Research",
    links: [
      ["overview", "Stock Overview"],
      ["financial-statements", "Financial Statements"],
      ["fundamental-charts", "Fundamental Charts"],
      ["projections", "Projections"],
      ["comparison", "Compare"]
    ]
  },
  {
    title: "Markets",
    links: [
      ["market-overview", "Market Overview"],
      ["stock-screener", "Stock Screener"],
      ["etfs", "ETF Overview"],
      ["crypto", "Crypto Center"],
      ["forex", "FOREX Overview"],
      ["treasury-rates", "Treasury Rates"]
    ]
  },
  {
    title: "Calendar",
    links: [
      ["earnings-calendar", "Earnings Calendar", "earnings"],
      ["earnings-calendar", "Dividends Calendar", "dividends"],
      ["earnings-calendar", "IPO Calendar", "ipos"],
      ["earnings-calendar", "Economic Releases", "economic"]
    ]
  },
  {
    title: "Portfolio",
    links: [
      ["portfolio", "Portfolio Tracker"],
      ["news", "News"]
    ]
  },
  {
    title: "Policies",
    links: [
      ["policy:terms", "Terms of Use"],
      ["policy:privacy", "Privacy Policy"],
      ["policy:cookies", "Cookie Policy"],
      ["policy:disclaimer", "Disclaimer"]
    ]
  }
];

const POLICY_CONTENT = {
  terms: {
    title: "Terms of Use",
    intro: "By using MrktRally, you agree to use the site as an informational market research platform for learning, tracking, organizing, and comparing your own investment research. These terms explain what the site does, what it does not do, and what you are responsible for when using it.",
    sections: [
      {
        title: "What MrktRally provides",
        text: "MrktRally brings together stock charts, financial statements, metrics, analyst estimates, filings, transcripts, calendars, market maps, ETF and fund research, watchlists, portfolio organization tools, screeners, treasury rates, crypto data, forex data, news, and other market research features. The site is meant to help you study companies and markets more efficiently in one place."
      },
      {
        title: "Not a financial service",
        text: "MrktRally is not a broker, dealer, investment adviser, exchange, bank, custodian, transfer agent, tax adviser, legal adviser, or trading platform. MrktRally does not open brokerage accounts, execute trades, hold money or securities, clear transactions, provide personalized investment recommendations, or tell you whether to buy, sell, hold, short, or trade any security."
      },
      {
        title: "Your responsibility",
        text: "You are responsible for your own research, decisions, account security, saved watchlists, portfolio entries, cost basis, share counts, cash values, and any conclusions you draw from the site. You should verify important information through official filings, company investor relations pages, broker statements, tax documents, and other reliable sources before making decisions."
      },
      {
        title: "Account access",
        text: "If you create an account, you agree to provide accurate login information and keep your account secure. You should not share your password, attempt to access another user's account, or use automated tools to create accounts. If you believe your account has been accessed without permission, contact MrktRally as soon as possible."
      },
      {
        title: "Saved research tools",
        text: "Watchlists, portfolios, saved symbols, cash entries, allocation charts, and performance calculations are provided for organization and learning. They are not official account statements, tax records, brokerage records, or audited performance reports. You should compare any saved portfolio information with your brokerage or personal records."
      },
      {
        title: "Market data and provider terms",
        text: "MrktRally depends on outside providers and public sources for many features. You agree not to misuse data from the site, redistribute provider data in a way that violates provider terms, reverse engineer API calls, mass-download restricted information, or use MrktRally as a substitute for a licensed market data terminal."
      },
      {
        title: "AI and generated content",
        text: "AI summaries, earnings call analysis, stock analysis, management questions, and other generated content are research aids. They may be incomplete, wrong, outdated, or overly confident. You should treat them as starting points for your own work and verify important claims against original filings, transcripts, company releases, and other primary sources."
      },
      {
        title: "Acceptable use",
        text: "Use MrktRally in a lawful, respectful, and reasonable way. Do not attempt to break security, overload servers, abuse the API, scrape restricted data, interfere with other users, upload malicious content, bypass access controls, impersonate others, or use the site in a way that violates laws, regulations, provider terms, or intellectual property rights."
      },
      {
        title: "Availability and changes",
        text: "MrktRally is an active project and may change over time. Pages, calculations, layouts, metrics, chart ranges, data fields, providers, calendars, transcripts, filings, and features may be added, removed, renamed, reorganized, limited, or changed to improve accuracy, speed, reliability, security, cost, or user experience."
      },
      {
        title: "No guarantee of uptime",
        text: "MrktRally may be unavailable, slow, interrupted, or temporarily broken because of hosting issues, provider outages, API limits, maintenance, bugs, deployments, internet problems, or third-party service failures. The site is provided on an as-available basis."
      },
      {
        title: "Intellectual property",
        text: "The MrktRally name, design, interface, code, branding, custom visuals, and organization of the site belong to MrktRally or its creator. Market data, company names, logos, filings, transcripts, and third-party materials belong to their respective owners and may be subject to separate terms."
      },
      {
        title: "Contact and enforcement",
        text: "If a user misuses the site, creates security risk, violates these terms, or harms the service, MrktRally may restrict, suspend, or remove access. Questions, account requests, or policy concerns can be sent through the contact link on the site."
      }
    ]
  },
  privacy: {
    title: "Privacy Policy",
    intro: "This policy explains what information MrktRally may collect, store, use, and share to run accounts, save research tools, improve speed, and keep the product working. MrktRally is designed around market research, not selling personal information.",
    sections: [
      {
        title: "Account information",
        text: "When you create an account, MrktRally may store your username, email address, password hash if you sign up with email and password, Google sign-in identifier if you use Google, policy acceptance status, policy version accepted, account creation date, and authentication information needed to keep you signed in. MrktRally does not store your plain-text password."
      },
      {
        title: "Saved user content",
        text: "MrktRally may store the watchlists, portfolio names, tickers, share counts, cost basis, cash entries, saved symbols, interface choices, and other research information you enter. This information is used to show your saved research again later, calculate portfolio values, display allocations, and personalize your experience."
      },
      {
        title: "Research requests",
        text: "When you search a stock, ETF, fund, crypto symbol, forex pair, market calendar, news page, filing, transcript, or chart, MrktRally may process the symbol, date range, selected page, selected period, selected metric, and related request details. These requests help the app fetch the correct information and improve performance."
      },
      {
        title: "Market data providers",
        text: "MrktRally uses providers such as FMP and Stock Analysis for market data, company financials, estimates, filings, earnings calls, ETF and fund data, calendars, news, and charts. When the site requests data, those providers may receive the requested symbol, endpoint, date range, or similar technical request information."
      },
      {
        title: "Hosting and infrastructure",
        text: "MrktRally uses services such as MongoDB for account data, Render for backend hosting, Vercel for frontend hosting, GitHub for code deployment, Google for sign-in, and email services such as SMTP or Resend for password recovery. These services may process technical data needed to operate, secure, deploy, or deliver the site."
      },
      {
        title: "Device and technical data",
        text: "The site or its hosting providers may process technical information such as browser type, device type, IP address, request timing, error logs, pages visited, referrer information, and performance data. This helps diagnose bugs, protect the service, improve loading speed, and understand whether features are working."
      },
      {
        title: "Local browser storage",
        text: "MrktRally may store data in your browser, including login state, cached market data, recent searches, selected chart ranges, selected tabs, policy status, and interface preferences. This makes the site faster and reduces repeated data loading, especially on research-heavy pages."
      },
      {
        title: "How information is used",
        text: "Information is used to create and secure accounts, keep you signed in, save watchlists and portfolios, load market data, show charts and calendars, calculate portfolio values, improve speed, debug issues, prevent misuse, respond to support requests, and maintain the site."
      },
      {
        title: "What MrktRally does not do",
        text: "MrktRally does not ask for brokerage credentials, bank account numbers, Social Security numbers, tax IDs, credit card numbers, or trading authorization. MrktRally does not sell securities, process trades, hold funds, or act as a custodian."
      },
      {
        title: "Sharing information",
        text: "MrktRally may share limited information with service providers only as needed to run the site, authenticate users, send account emails, fetch market data, host the application, store account records, diagnose errors, or comply with legal obligations. MrktRally does not aim to sell your personal information."
      },
      {
        title: "Security practices",
        text: "MrktRally uses reasonable security practices for an independent web project, such as hashed passwords, authentication tokens, provider-managed hosting, and limited account information. No website can guarantee perfect security, and users should use strong passwords and protect their own devices."
      },
      {
        title: "Data retention",
        text: "Account and saved research data may be kept while your account exists or as long as needed for site operations, debugging, security, backups, or legal reasons. Cached market data may expire or be replaced as new data is loaded. Some provider logs or hosting records may follow the provider's own retention rules."
      },
      {
        title: "Your choices",
        text: "You can sign out, remove watchlist items, delete portfolio positions, clear browser storage, request account changes, or request account deletion by contacting MrktRally. Some data may remain temporarily in backups, logs, deployment records, or provider systems where necessary."
      },
      {
        title: "Children and students",
        text: "MrktRally is a market research and education project. It is not intended to collect sensitive information from children. If you believe someone has used the site in a way that creates a privacy concern, contact MrktRally so it can be reviewed."
      }
    ]
  },
  cookies: {
    title: "Cookie Policy",
    intro: "MrktRally uses cookies, local storage, session storage, cached data, and similar browser technology to keep the site signed in, remembered, responsive, and useful across research sessions.",
    sections: [
      {
        title: "Essential storage",
        text: "Cookies, local storage, or similar browser storage may keep you signed in, remember whether you accepted policies, preserve selected pages or tabs, save interface preferences, and support security for account sessions. Without this storage, login and saved account features may not work correctly."
      },
      {
        title: "Performance and caching",
        text: "MrktRally may store recent market data, chart ranges, search results, stock details, ETF details, calendar state, portfolio page data, and page state in the browser to reduce repeat loading. This is especially important for pages that pull many charts, metrics, estimates, filings, and market data fields."
      },
      {
        title: "Authentication",
        text: "Login features may use storage to remember your account session. Google sign-in may use cookies or other Google-controlled technology to verify your identity. Password reset and email features may also rely on technical records to complete account actions."
      },
      {
        title: "Third-party services",
        text: "Google sign-in, hosting providers, email providers, market data providers, and performance or analytics tools if added may use cookies or similar technology according to their own policies. MrktRally does not control every cookie or storage decision made by those services."
      },
      {
        title: "Saved interface choices",
        text: "The site may remember selected pages, watchlist state, chart periods, annual or quarterly views, selected tabs, recently searched tickers, policy acceptance, and other interface choices so the app feels consistent when you return."
      },
      {
        title: "Security and abuse prevention",
        text: "Cookies and technical storage may help protect account sessions, prevent repeated sign-in prompts, reduce abusive requests, support rate-limit handling, and diagnose problems when pages fail to load correctly."
      },
      {
        title: "Controls",
        text: "You can block cookies, clear site data, or delete browser storage in your browser settings. Doing so may sign you out, remove cached market data, reset preferences, slow down the site, or prevent saved watchlist and portfolio features from working as expected."
      },
      {
        title: "No ad tracking focus",
        text: "MrktRally is built as a market research project, not an advertising network. The main reason for storage is to support authentication, remembered settings, saved research tools, and faster loading. If advertising or advanced analytics are ever added, this policy should be updated."
      },
      {
        title: "Updates to storage use",
        text: "As MrktRally adds or changes features, the site may adjust what it stores locally. For example, new charting tools, market pages, calendars, profile settings, or saved research features may require additional browser storage to work smoothly."
      }
    ]
  },
  disclaimer: {
    title: "Disclaimer",
    intro: "MrktRally is built for research, education, and organization. It should not be treated as financial advice, a trading system, an official record, or a guarantee that any data point is perfect.",
    sections: [
      {
        title: "Not financial advice",
        text: "Nothing on MrktRally is financial, investment, tax, legal, accounting, or trading advice. The site does not know your personal financial situation, risk tolerance, investment goals, time horizon, or legal obligations. Always do your own research and consider speaking with a qualified professional."
      },
      {
        title: "Data may be wrong or delayed",
        text: "Prices, estimates, financial statements, charts, filings, transcripts, ratings, calendars, news, market maps, after-hours data, and other information may be delayed, incomplete, stale, revised, unavailable, or inaccurate. Different providers can report different numbers, especially around earnings releases, foreign stocks, ADRs, fiscal-year changes, and restatements."
      },
      {
        title: "Provider differences",
        text: "MrktRally uses outside data sources, and those sources may define metrics differently. Items such as total debt, PEG ratio, margins, free cash flow, analyst estimates, after-hours movement, institutional holders, insider activity, and foreign-currency conversions may differ from another website, a company filing, or a brokerage platform."
      },
      {
        title: "Market risk",
        text: "Investing and trading involve risk, including loss of principal. Past performance, analyst estimates, valuation ratios, historical charts, projected growth, AI summaries, and back-looking financial data do not guarantee future results. Markets can move quickly and unexpectedly."
      },
      {
        title: "AI and generated analysis",
        text: "Any AI-generated summaries, stock analysis, earnings call highlights, management questions, or research notes are informational summaries only. They can miss context, misunderstand data, overstate confidence, or be based on incomplete information. Review the underlying data, filings, transcripts, and company releases before relying on any analysis."
      },
      {
        title: "Portfolio calculations",
        text: "Portfolio values, gains, losses, allocation charts, country and industry breakdowns, and performance percentages depend on the prices, shares, cost basis, and cash values available to the site. They may not match a brokerage account and should not be used as official tax, accounting, or performance records."
      },
      {
        title: "Projections and assumptions",
        text: "Projection tools, bull/base/bear cases, growth rates, margins, valuation multiples, and expected return calculations are based on assumptions. Small changes in assumptions can create large differences in outputs. These tools are for scenario building, not predictions or recommendations."
      },
      {
        title: "Calendar and event data",
        text: "Earnings dates, dividend dates, IPO dates, economic releases, report dates, and related calendar fields may change, may be missing, or may be reported differently by providers. Always confirm important dates with company investor relations pages, official exchange notices, or other primary sources."
      },
      {
        title: "No professional relationship",
        text: "Using MrktRally does not create an adviser-client, broker-client, fiduciary, legal, tax, accounting, or professional relationship. The site provides tools and information, but you remain responsible for interpreting that information and deciding what to do with it."
      },
      {
        title: "No warranties",
        text: "MrktRally is provided as is and as available. The site does not promise uninterrupted access, error-free operation, perfect calculations, complete data coverage, or that any feature will remain available in the future."
      },
      {
        title: "Independent project",
        text: "MrktRally is an independent research project and is not endorsed by, sponsored by, or affiliated with FMP, Stock Analysis, MongoDB, Google, GitHub, Vercel, Render, or any company shown on the site unless specifically stated. Company names, logos, and data belong to their respective owners."
      },
      {
        title: "Verify before acting",
        text: "Before making any financial decision, verify the numbers and context through primary sources such as SEC filings, company reports, earnings releases, investor relations materials, broker data, and professional advice where appropriate."
      }
    ]
  }
};

const CURRENT_POLICY_VERSION = "2026-07-30";

const renderHomeFeatureIcon = (icon) => {
  const commonProps = {
    className: `home-feature-icon icon-${icon}`,
    viewBox: "0 0 64 64",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
    focusable: "false"
  };

  switch (icon) {
    case "market":
      return (
        <svg {...commonProps}>
          <rect className="icon-muted" x="10" y="12" width="44" height="40" rx="6" />
          <path className="icon-blue" d="M18 42L27 32L35 36L47 21" />
          <path className="icon-green" d="M41 21H47V27" />
          <path className="icon-red" d="M18 23H25M18 30H23" />
        </svg>
      );
    case "overview":
      return (
        <svg {...commonProps}>
          <path className="icon-muted" d="M12 48V16M12 48H54" />
          <path className="icon-blue" d="M18 42L28 31L38 36L52 18" />
          <path className="icon-green" d="M44 18H52V26" />
          <circle className="icon-dot" cx="28" cy="31" r="3" />
        </svg>
      );
    case "etf":
      return (
        <svg {...commonProps}>
          <rect className="icon-muted" x="12" y="13" width="40" height="38" rx="7" />
          <path className="icon-blue" d="M21 25H43M21 33H43M21 41H34" />
          <path className="icon-green" d="M23 25V43M33 25V43M43 25V35" />
          <circle className="icon-dot" cx="44" cy="42" r="5" />
        </svg>
      );
    case "crypto":
      return (
        <svg {...commonProps}>
          <circle className="icon-muted" cx="32" cy="32" r="22" />
          <path className="icon-blue" d="M32 18V46M22 26H37C41 26 43 28 43 31C43 34 41 36 37 36H22" />
          <path className="icon-green" d="M25 18V46M38 18V46" />
          <path className="icon-red" d="M23 38H39" />
        </svg>
      );
    case "forex":
      return (
        <svg {...commonProps}>
          <path className="icon-muted" d="M12 22H48M48 22L40 14M48 22L40 30" />
          <path className="icon-blue" d="M52 42H16M16 42L24 34M16 42L24 50" />
          <path className="icon-green" d="M22 20C24 14 30 10 36 11" />
          <path className="icon-red" d="M42 44C39 50 32 54 25 52" />
        </svg>
      );
    case "commodities":
      return (
        <svg {...commonProps}>
          <path className="icon-muted" d="M18 15H46L52 25L32 53L12 25L18 15Z" />
          <path className="icon-blue" d="M18 15L32 53L46 15" />
          <path className="icon-green" d="M12 25H52" />
          <path className="icon-red" d="M23 34L30 28L37 31L45 22" />
        </svg>
      );
    case "screener":
      return (
        <svg {...commonProps}>
          <path className="icon-muted" d="M12 16H52M18 30H46M24 44H40" />
          <circle className="icon-blue-fill" cx="20" cy="16" r="5" />
          <circle className="icon-green-fill" cx="39" cy="30" r="5" />
          <circle className="icon-red-fill" cx="29" cy="44" r="5" />
        </svg>
      );
    case "news":
      return (
        <svg {...commonProps}>
          <rect className="icon-muted" x="11" y="14" width="42" height="38" rx="6" />
          <path className="icon-blue" d="M20 24H34M20 33H44M20 42H39" />
          <path className="icon-green" d="M39 21H47V29H39V21Z" />
          <path className="icon-red" d="M13 18H8V47C8 50 10 52 13 52H18" />
        </svg>
      );
    case "statements":
      return (
        <svg {...commonProps}>
          <rect className="icon-muted" x="12" y="13" width="40" height="38" rx="6" />
          <path className="icon-blue" d="M20 24H44M20 32H44M20 40H44" />
          <path className="icon-green" d="M28 18V48M38 18V48" />
          <path className="icon-red" d="M19 48H45" />
        </svg>
      );
    case "fundamental-charts":
      return (
        <svg {...commonProps}>
          <path className="icon-muted" d="M12 50H54M12 14V50" />
          <path className="icon-blue" d="M18 42L27 31L36 35L48 18" />
          <path className="icon-green" d="M18 28H23M29 22H34M40 16H45" />
          <path className="icon-red" d="M20 48V38M32 48V30M44 48V24" />
        </svg>
      );
    case "projections":
      return (
        <svg {...commonProps}>
          <path className="icon-muted" d="M14 48H52" />
          <path className="icon-red" d="M16 42L27 35L38 39L50 30" />
          <path className="icon-blue" d="M16 34L27 28L38 29L50 20" />
          <path className="icon-green" d="M16 26L27 20L38 18L50 10" />
        </svg>
      );
    case "comparison":
      return (
        <svg {...commonProps}>
          <path className="icon-muted" d="M12 50H54" />
          <rect className="icon-blue-fill" x="16" y="24" width="8" height="22" rx="2" />
          <rect className="icon-green-fill" x="29" y="14" width="8" height="32" rx="2" />
          <rect className="icon-red-fill" x="42" y="31" width="8" height="15" rx="2" />
        </svg>
      );
    case "portfolio":
      return (
        <svg {...commonProps}>
          <path className="icon-blue-fill" d="M32 12C43 12 52 21 52 32H32V12Z" />
          <path className="icon-green" d="M32 32L45 48C41.5 51 37 52 32 52C21 52 12 43 12 32C12 22.5 18.5 14.5 27 12.5V32H32Z" />
          <path className="icon-muted" d="M32 32H52C52 37.5 49.5 43 45 48L32 32Z" />
        </svg>
      );
    case "watchlists":
      return (
        <svg {...commonProps}>
          <path className="icon-green" d="M32 11L38 24L52 26L42 36L44 50L32 43L20 50L22 36L12 26L26 24L32 11Z" />
          <path className="icon-blue" d="M43 15H54M48.5 9.5V20.5" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...commonProps}>
          <rect className="icon-muted" x="13" y="16" width="38" height="36" rx="5" />
          <path className="icon-blue" d="M13 26H51M23 11V20M41 11V20" />
          <path className="icon-green" d="M22 34H26M31 34H35M40 34H44M22 42H26M31 42H35M40 42H44" />
        </svg>
      );
    case "treasury":
      return (
        <svg {...commonProps}>
          <path className="icon-muted" d="M12 25L32 13L52 25V30H12V25Z" />
          <path className="icon-blue" d="M17 50H47M20 30V46M29 30V46M38 30V46M47 30V46" />
          <path className="icon-green" d="M19 22H45" />
          <path className="icon-red" d="M24 39L30 35L36 37L43 32" />
        </svg>
      );
    case "documents":
      return (
        <svg {...commonProps}>
          <path className="icon-muted" d="M18 10H38L50 22V54H18V10Z" />
          <path className="icon-blue" d="M38 10V22H50" />
          <path className="icon-green" d="M25 33H43M25 41H43M25 49H36" />
        </svg>
      );
    case "mr-rally":
    default:
      return (
        <svg {...commonProps}>
          <path className="icon-muted" d="M13 16H51V42H34L23 52V42H13V16Z" />
          <path className="icon-green" d="M22 34L30 26L36 31L45 22" />
          <path className="icon-blue" d="M45 22V30M45 22H37" />
          <path className="icon-dot" d="M22 22H31" />
        </svg>
      );
  }
};

const renderHomeTourSnapshot = (snapshot) => {
  const snapshotMeta = {
    overview: { title: "NVDA", layout: "terminal", chips: ["1D", "Financials", "News"] },
    statements: { title: "Cash Flow Statement", layout: "statement", chips: ["Annual", "Quarterly", "Max"] },
    charts: { title: "Revenue vs. EPS", layout: "multi-chart", chips: ["NVDA", "GOOG", "AMD"] },
    projections: { title: "Bull / Base / Bear", layout: "scenario", chips: ["Bull", "Base", "Bear"] },
    compare: { title: "Company Comparison", layout: "comparison", chips: ["Valuation", "Margins", "Cash"] },
    screener: { title: "Market Ideas", layout: "screener", chips: ["Sector", "Beta", "Volume"] },
    market: { title: "Market Movers", layout: "screener", chips: ["Indexes", "Gainers", "Traded"] },
    funds: { title: "ETF Exposure", layout: "funds", chips: ["Holdings", "Fees", "Yield"] },
    watchlists: { title: "Watchlist", layout: "watchlist", chips: ["AMD", "NKE", "CRM"] },
    portfolio: { title: "Portfolio Allocation", layout: "portfolio", chips: ["Value", "Country", "Industry"] },
    calendar: { title: "Market Calendar", layout: "calendar", chips: ["Earnings", "Dividends", "IPOs"] },
    rates: { title: "Treasury Curve", layout: "rates", chips: ["1M", "10Y", "30Y"] },
    crypto: { title: "Crypto Center", layout: "crypto", chips: ["BTC", "ETH", "SOL"] },
    forex: { title: "FOREX Overview", layout: "forex", chips: ["EUR/USD", "GBP/USD", "USD/JPY"] },
    news: { title: "Market News", layout: "news", chips: ["General", "Stocks", "Headlines"] }
  };
  const meta = snapshotMeta[snapshot] || snapshotMeta.overview;
  const bars = snapshot === "crypto"
    ? [38, 62, 46, 74, 52, 88, 70]
    : snapshot === "forex"
      ? [58, 42, 64, 48, 72, 54, 66]
      : [32, 54, 42, 70, 58, 84, 67];
  const heatmapTiles = [3, -2, 1, 2, -3, 1, 4, -1, 2, -2, 1, 3, -1, 2, -3, 1, 2, -1, 3, 1, -2, 2, 1, -3];

  return (
    <div className={`home-tour-snapshot snapshot-key-${snapshot} snapshot-layout-${meta.layout}`} aria-hidden="true">
      <div className="snapshot-header">
        <strong>{meta.title}</strong>
        <span />
      </div>

      {meta.layout === "heatmap" ? (
        <div className="snapshot-heatmap">
          {heatmapTiles.map((value, index) => (
            <span
              key={`${snapshot}-tile-${index}`}
              className={value >= 0 ? "positive" : "negative"}
              style={{ "--tile-span": Math.max(1, Math.min(4, Math.abs(value))) }}
            />
          ))}
        </div>
      ) : meta.layout === "statement" ? (
        <div className="snapshot-statement">
          {["Revenue", "Gross Profit", "Net Income", "Free Cash Flow", "Cash"].map((row, index) => (
            <div key={row}>
              <strong>{row}</strong>
              <span style={{ "--row-fill": `${42 + index * 9}%` }} />
              <span style={{ "--row-fill": `${58 + index * 7}%` }} />
              <span style={{ "--row-fill": `${70 - index * 5}%` }} />
            </div>
          ))}
        </div>
      ) : meta.layout === "calendar" ? (
        <div className="snapshot-calendar-board">
          <div className="snapshot-calendar-grid">
            {Array.from({ length: 28 }, (_, index) => (
              <span key={`${snapshot}-day-${index}`} className={index % 5 === 0 || index % 9 === 0 ? "event" : ""} />
            ))}
          </div>
          <div className="snapshot-calendar-events">
            <span>Earnings</span>
            <span>Dividends</span>
            <span>IPOs</span>
            <span>Economic</span>
          </div>
        </div>
      ) : meta.layout === "portfolio" || meta.layout === "funds" ? (
        <div className="snapshot-allocation">
          <div className="snapshot-pie" />
          <div className="snapshot-holdings">
            {[72, 54, 44, 31].map((width, index) => (
              <span key={`${snapshot}-holding-${index}`} style={{ "--row-fill": `${width}%` }} />
            ))}
          </div>
        </div>
      ) : meta.layout === "terminal" ? (
        <div className="snapshot-terminal">
          <div className="snapshot-price-tile">
            <strong>$207.01</strong>
            <span>+2.14%</span>
          </div>
          <div className="snapshot-terminal-chart">
            <svg viewBox="0 0 420 150" preserveAspectRatio="none">
              <path d="M10 118 C62 94 84 101 126 72 S194 78 232 45 S318 50 410 22" />
            </svg>
          </div>
          <div className="snapshot-terminal-cards">
            <span>Revenue</span>
            <span>Margins</span>
            <span>Estimates</span>
            <span>Peers</span>
          </div>
        </div>
      ) : meta.layout === "multi-chart" ? (
        <div className="snapshot-multi-chart">
          {[0, 1, 2].map((chart) => (
            <div key={`${snapshot}-mini-chart-${chart}`}>
              <svg viewBox="0 0 220 110" preserveAspectRatio="none">
                <path d={chart === 0 ? "M8 88 C44 72 68 82 98 52 S158 54 212 22" : chart === 1 ? "M8 32 C42 48 70 44 108 58 S166 80 212 66" : "M8 92 C58 70 82 76 114 58 S170 32 212 36"} />
              </svg>
            </div>
          ))}
        </div>
      ) : meta.layout === "comparison" ? (
        <div className="snapshot-compare-table">
          {["NVDA", "AMD", "AVGO"].map((symbol, rowIndex) => (
            <div key={symbol}>
              <strong>{symbol}</strong>
              {[78, 56, 68].map((width, colIndex) => (
                <span key={`${symbol}-${colIndex}`} style={{ "--row-fill": `${width - rowIndex * 10 + colIndex * 4}%` }} />
              ))}
            </div>
          ))}
        </div>
      ) : meta.layout === "screener" ? (
        <div className="snapshot-screener">
          <div className="snapshot-filter-grid">
            {["Market Cap", "Sector", "Beta", "Volume", "Dividend", "Country"].map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
          <div className="snapshot-screener-results">
            {[0, 1, 2, 3].map((row) => <span key={`${snapshot}-result-${row}`} />)}
          </div>
        </div>
      ) : meta.layout === "watchlist" ? (
        <div className="snapshot-watchlist">
          {["AMD", "CAKE", "CRM", "NKE"].map((symbol, index) => (
            <span key={symbol} className={index % 2 ? "positive" : "negative"}>
              <strong>{symbol}</strong>
              <em>{index % 2 ? "+1.4%" : "-0.8%"}</em>
            </span>
          ))}
        </div>
      ) : meta.layout === "rates" ? (
        <div className="snapshot-rates-curve">
          {["1M", "2Y", "5Y", "10Y", "30Y"].map((label, index) => (
            <span key={label} style={{ "--bar-height": `${34 + index * 10}%` }}>
              <em>{label}</em>
            </span>
          ))}
        </div>
      ) : meta.layout === "crypto" || meta.layout === "forex" ? (
        <div className={`snapshot-asset-board ${meta.layout}`}>
          <div className="snapshot-asset-orb">{meta.layout === "crypto" ? "₿" : "$"}</div>
          <div className="snapshot-asset-chart">
            <svg viewBox="0 0 360 120" preserveAspectRatio="none">
              <path d={meta.layout === "crypto" ? "M8 90 C48 32 82 108 126 48 S192 96 246 34 S306 62 352 24" : "M8 70 C52 62 76 46 118 58 S184 78 226 54 S296 44 352 50"} />
            </svg>
          </div>
          <div className="snapshot-asset-stats">
            <span>Open</span>
            <span>Range</span>
            <span>Volume</span>
          </div>
        </div>
      ) : meta.layout === "news" ? (
        <div className="snapshot-news-feed">
          {["Market Pulse", "Company Update", "Analyst Note", "Earnings Watch"].map((headline, row) => (
            <span key={`${snapshot}-headline-${row}`}>
              <strong>{headline}</strong>
              <em />
            </span>
          ))}
        </div>
      ) : (
        <div className="snapshot-grid">
          <div className="snapshot-panel snapshot-chart-panel">
            <div className="snapshot-chart-bars">
              {bars.map((height, index) => (
                <span key={`${snapshot}-bar-${index}`} style={{ "--bar-height": `${height}%` }} />
              ))}
            </div>
            <svg className="snapshot-line" viewBox="0 0 360 130" preserveAspectRatio="none">
              <path d="M8 106 C58 72 84 94 126 58 S194 66 224 38 S292 42 352 18" />
              <circle cx="126" cy="58" r="6" />
              <circle cx="224" cy="38" r="6" />
              <circle cx="352" cy="18" r="6" />
            </svg>
          </div>
          <div className="snapshot-panel snapshot-metric-stack">
            <span />
            <span />
            <span />
          </div>
          <div className="snapshot-panel snapshot-table">
            {[0, 1, 2, 3].map((row) => (
              <span key={`${snapshot}-row-${row}`} />
            ))}
          </div>
        </div>
      )}

      {meta.layout !== "calendar" && (
        <div className="snapshot-chip-row">
          {meta.chips.map((chip) => (
            <span key={`${snapshot}-${chip}`}>{chip}</span>
          ))}
        </div>
      )}
    </div>
  );
};

const formatDividendYield = (value) =>
  isNumber(value) ? `${(Math.abs(value) > 1 ? value : value * 100).toFixed(2)}%` : "N/A";

const formatBillions = (value) =>
  isNumber(value) ? formatMoney(value / 1e9) : "N/A";

const formatSharesMillions = (value) => {
  if (!isNumber(value)) return "N/A";
  return value >= 1000
    ? `${(value / 1000).toFixed(2)}B`
    : `${value.toFixed(1)}M`;
};

const formatSharesCount = (value) => {
  if (!isNumber(value)) return "N/A";
  if (Math.abs(value) >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (Math.abs(value) >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (Math.abs(value) >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toLocaleString();
};

const formatLargeDollars = (value) => {
  if (!isNumber(value)) return "N/A";
  if (Math.abs(value) >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (Math.abs(value) >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (Math.abs(value) >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
};

const formatLargeNumber = (value) => {
  if (!isNumber(value)) return "N/A";
  if (Math.abs(value) >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (Math.abs(value) >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (Math.abs(value) >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toLocaleString();
};

const formatPlain = (value) =>
  isNumber(value) ? value.toFixed(2) : "N/A";

const formatPrice = (value) =>
  isNumber(value) ? `$${value.toFixed(2)}` : "N/A";

const formatStatementValue = (value, row = {}) => {
  if (!isNumber(value)) return "N/A";
  const format = String(row.format || "").toLowerCase();
  const key = String(row.key || "").toLowerCase();
  const label = String(row.label || "").toLowerCase();
  if (format === "percent" || (!format && (key.endsWith("ratio") || label.includes("margin")))) {
    const percentValue = Math.abs(value) <= 1 ? value * 100 : value;
    return `${percentValue.toFixed(2)}%`;
  }
  if (format === "perShare" || key === "eps" || key === "epsdiluted" || label.includes("eps")) {
    return value.toFixed(2);
  }
  if (format === "shares" || label.includes("shares")) {
    return formatSharesCount(value);
  }
  return formatLargeDollars(value);
};

const formatFundamentalChartValue = (value, indicator = {}) => {
  if (!isNumber(value)) return "N/A";
  if (indicator.format === "percent") return `${value.toFixed(2)}%`;
  if (indicator.format === "perShare") return `$${value.toFixed(2)}`;
  if (indicator.format === "shares") return formatSharesCount(value);
  if (indicator.format === "plain") return formatPlain(value);
  return formatLargeDollars(value);
};

const formatFundamentalAxisValue = (value, indicator = {}) => {
  if (!isNumber(value)) return "";
  if (indicator.format === "percent") return `${value.toFixed(0)}%`;
  if (indicator.format === "perShare") return `$${value.toFixed(0)}`;
  if (indicator.format === "shares") return formatLargeNumber(value);
  if (indicator.format === "plain") return formatPlain(value);
  return formatLargeDollars(value).replace(".00", "");
};

const FundamentalChartTooltip = ({ active, label, payload, indicator, hoveredPoint }) => {
  if (!active || !Array.isArray(payload) || !payload.length) return null;

  const focusedPoint =
    hoveredPoint?.indicatorKey === indicator?.key &&
    (!label || hoveredPoint.period === label || hoveredPoint.periodKey === label)
      ? hoveredPoint
      : null;

  if (focusedPoint) {
    return (
      <div className="fundamental-tooltip">
        <span>{focusedPoint.period}</span>
        <div className="fundamental-tooltip-row">
          <i style={{ background: focusedPoint.color }} />
          <strong>{focusedPoint.symbol}</strong>
          <em>{formatFundamentalChartValue(focusedPoint.value, indicator)}</em>
        </div>
      </div>
    );
  }

  const rows = payload
    .filter((item) => isNumber(item.value))
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  if (!rows.length) return null;

  return (
    <div className="fundamental-tooltip">
      <span>{label}</span>
      {rows.map((item) => (
        <div className="fundamental-tooltip-row" key={`${item.name}-${label}`}>
          <i style={{ background: item.color }} />
          <strong>{item.name}</strong>
          <em>{formatFundamentalChartValue(item.value, indicator)}</em>
        </div>
      ))}
    </div>
  );
};

const CombinedFundamentalChartTooltip = ({ active, label, payload, lines }) => {
  if (!active || !Array.isArray(payload) || !payload.length) return null;

  const rows = payload
    .filter((item) => isNumber(item.value))
    .map((item) => {
      const line = lines.find((candidate) => candidate.key === item.dataKey || candidate.key === item.name);
      return line ? { ...line, value: item.value } : null;
    })
    .filter(Boolean);

  if (!rows.length) return null;

  return (
    <div className="fundamental-tooltip fundamental-tooltip-combined">
      <span>{label}</span>
      {rows.map((row) => (
        <div className="fundamental-tooltip-row" key={`${row.key}-${label}`}>
          <i style={{ background: row.color }} />
          <strong>
            {row.symbol}
            <small>{row.indicator.label}</small>
          </strong>
          <em>{formatFundamentalChartValue(row.value, row.indicator)}</em>
        </div>
      ))}
    </div>
  );
};

const OverviewChartTooltip = ({ active, label, payload, formatter, valueLabel, symbol, color }) => {
  if (!active || !Array.isArray(payload) || !payload.length) return null;
  const point = payload.find((item) => isNumber(item.value));
  if (!point) return null;

  const period = formatChartPeriodLabel(point.payload?.period || label);
  const displaySymbol = symbol || point.name || "Stock";
  const accent = color || point.color || point.fill || point.stroke || "#67e8f9";

  return (
    <div className="fundamental-tooltip overview-chart-tooltip">
      <span>{period}</span>
      <div className="fundamental-tooltip-row">
        <i style={{ background: accent }} />
        <strong>{displaySymbol}</strong>
        <em>{formatter(point.value, valueLabel)}</em>
      </div>
    </div>
  );
};

const formatShortDate = (value) => {
  if (!value) return "N/A";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
};

function sumValues(...values) {
  const numbers = values.filter(isNumber);
  if (!numbers.length) return null;
  return numbers.reduce((total, value) => total + value, 0);
}

function differenceValue(value, subtractValue) {
  if (!isNumber(value) || !isNumber(subtractValue)) return null;
  return value - subtractValue;
}

function calculateRatio(numerator, denominator, asPercent = true) {
  if (!isNumber(numerator) || !isNumber(denominator) || denominator === 0) return null;
  const value = numerator / denominator;
  return asPercent ? value * 100 : value;
}

function normalizePercentMetric(value) {
  if (!isNumber(value)) return null;
  return Math.abs(value) <= 1 ? value * 100 : value;
}

function calculateFundamentalMargin(period, metricField, numerator, denominator, statementRatioField = null) {
  const metricValue = metricField ? normalizePercentMetric(period?.metrics?.[metricField]) : null;
  if (metricValue !== null) return metricValue;

  const statementRatioValue = statementRatioField ? normalizePercentMetric(period?.income?.[statementRatioField]) : null;
  if (statementRatioValue !== null) return statementRatioValue;

  return calculateRatio(numerator, denominator);
}

function calculateFundamentalMetricFallback(period, field) {
  const income = period?.income || {};
  const balance = period?.balance || {};
  const cashflow = period?.cashflow || {};
  const shares = firstNumber(income.weightedAverageShsOutDil, income.weightedAverageShsOut);
  const revenue = firstNumber(income.revenue);
  const grossProfit = firstNumber(income.grossProfit);
  const operatingIncome = firstNumber(income.operatingIncome);
  const incomeBeforeTax = firstNumber(income.incomeBeforeTax);
  const netIncome = firstNumber(income.netIncome);
  const ebitda = firstNumber(income.ebitda);
  const ebit = firstNumber(income.ebit, income.operatingIncome);
  const costOfRevenue = firstNumber(income.costOfRevenue);
  const cash = firstNumber(balance.cashAndShortTermInvestments, balance.cashAndCashEquivalents);
  const totalDebt = firstNumber(balance.totalDebt, sumValues(balance.shortTermDebt, balance.longTermDebt));
  const equity = firstNumber(balance.totalStockholdersEquity, balance.totalEquity);
  const totalAssets = firstNumber(balance.totalAssets);
  const totalLiabilities = firstNumber(balance.totalLiabilities);
  const currentAssets = firstNumber(balance.totalCurrentAssets);
  const currentLiabilities = firstNumber(balance.totalCurrentLiabilities);
  const inventory = firstNumber(balance.inventory);
  const receivables = firstNumber(balance.netReceivables);
  const payables = firstNumber(balance.accountPayables);
  const operatingCashFlow = firstNumber(cashflow.operatingCashFlow, cashflow.netCashProvidedByOperatingActivities);
  const freeCashFlow = firstNumber(cashflow.freeCashFlow);
  const capex = firstNumber(cashflow.capitalExpenditure);
  const depreciation = firstNumber(cashflow.depreciationAndAmortization);
  const quickAssets = differenceValue(currentAssets, inventory);
  const workingCapital = differenceValue(currentAssets, currentLiabilities);
  const netDebt = differenceValue(totalDebt, cash);
  const investedCapital = differenceValue(sumValues(totalDebt, equity), cash);
  const goodwillAndIntangibles = sumValues(balance.goodwill, balance.intangibleAssets);
  const tangibleAssetValue = isNumber(totalAssets)
    ? totalAssets - (goodwillAndIntangibles || 0)
    : null;
  const capitalEmployed = differenceValue(totalAssets, currentLiabilities);
  const daysOfSalesOutstanding = calculateRatio(isNumber(receivables) ? receivables * 365 : null, revenue, false);
  const daysOfInventoryOutstanding = calculateRatio(isNumber(inventory) ? inventory * 365 : null, costOfRevenue, false);
  const daysOfPayablesOutstanding = calculateRatio(isNumber(payables) ? payables * 365 : null, costOfRevenue, false);

  const fallbacks = {
    revenuePerShare: calculateRatio(revenue, shares, false),
    netIncomePerShare: calculateRatio(netIncome, shares, false),
    operatingCashFlowPerShare: calculateRatio(operatingCashFlow, shares, false),
    freeCashFlowPerShare: calculateRatio(freeCashFlow, shares, false),
    cashPerShare: calculateRatio(cash, shares, false),
    bookValuePerShare: calculateRatio(equity, shares, false),
    tangibleBookValuePerShare: calculateRatio(tangibleAssetValue, shares, false),
    shareholdersEquityPerShare: calculateRatio(equity, shares, false),
    interestDebtPerShare: calculateRatio(totalDebt, shares, false),
    capexPerShare: calculateRatio(capex, shares, false),
    currentRatio: calculateRatio(currentAssets, currentLiabilities, false),
    quickRatio: calculateRatio(quickAssets, currentLiabilities, false),
    cashRatio: calculateRatio(cash, currentLiabilities, false),
    debtToEquityRatio: calculateRatio(totalDebt, equity, false),
    debtToAssetsRatio: calculateRatio(totalDebt, totalAssets, false),
    debtToCapitalRatio: calculateRatio(totalDebt, sumValues(totalDebt, equity), false),
    longTermDebtToCapitalRatio: calculateRatio(balance.longTermDebt, sumValues(balance.longTermDebt, equity), false),
    financialLeverageRatio: calculateRatio(totalAssets, equity, false),
    interestCoverageRatio: calculateRatio(operatingIncome, Math.abs(firstNumber(income.interestExpense) || 0), false),
    debtServiceCoverageRatio: calculateRatio(operatingCashFlow, totalDebt, false),
    operatingCashFlowCoverageRatio: calculateRatio(operatingCashFlow, totalDebt, false),
    shortTermOperatingCashFlowCoverageRatio: calculateRatio(operatingCashFlow, balance.shortTermDebt, false),
    operatingCashFlowRatio: calculateRatio(operatingCashFlow, currentLiabilities, false),
    solvencyRatio: calculateRatio(sumValues(netIncome, depreciation), totalLiabilities, false),
    netDebtToEBITDA: calculateRatio(netDebt, ebitda, false),
    workingCapital,
    netCurrentAssetValue: differenceValue(currentAssets, totalLiabilities),
    cashDebtCoverage: calculateRatio(cash, totalDebt, false),
    liabilitiesToAssets: calculateRatio(totalLiabilities, totalAssets, false),
    quickAssets,
    grossProfitMargin: calculateRatio(grossProfit, revenue, false),
    operatingProfitMargin: calculateRatio(operatingIncome, revenue, false),
    pretaxProfitMargin: calculateRatio(incomeBeforeTax, revenue, false),
    netProfitMargin: calculateRatio(netIncome, revenue, false),
    bottomLineProfitMargin: calculateRatio(netIncome, revenue, false),
    continuousOperationsProfitMargin: calculateRatio(netIncome, revenue, false),
    ebitdaMargin: calculateRatio(ebitda, revenue, false),
    ebitMargin: calculateRatio(ebit, revenue, false),
    returnOnEquity: calculateRatio(netIncome, equity, false),
    returnOnAssets: calculateRatio(netIncome, totalAssets, false),
    returnOnInvestedCapital: calculateRatio(operatingIncome, investedCapital, false),
    returnOnCapitalEmployed: calculateRatio(operatingIncome, capitalEmployed, false),
    returnOnTangibleAssets: calculateRatio(netIncome, tangibleAssetValue, false),
    effectiveTaxRate: calculateRatio(income.incomeTaxExpense, incomeBeforeTax, false),
    incomeQuality: calculateRatio(operatingCashFlow, netIncome, false),
    assetTurnover: calculateRatio(revenue, totalAssets, false),
    fixedAssetTurnover: calculateRatio(revenue, balance.propertyPlantEquipmentNet, false),
    inventoryTurnover: calculateRatio(costOfRevenue, inventory, false),
    receivablesTurnover: calculateRatio(revenue, receivables, false),
    payablesTurnover: calculateRatio(costOfRevenue, payables, false),
    workingCapitalTurnoverRatio: calculateRatio(revenue, workingCapital, false),
    daysOfSalesOutstanding,
    daysOfInventoryOutstanding,
    daysOfPayablesOutstanding,
    cashConversionCycle: sumValues(daysOfSalesOutstanding, daysOfInventoryOutstanding, isNumber(daysOfPayablesOutstanding) ? -daysOfPayablesOutstanding : null),
    operatingCycle: sumValues(daysOfSalesOutstanding, daysOfInventoryOutstanding),
    averageInventory: inventory,
    averagePayables: payables,
    averageReceivables: receivables,
    operatingCashFlowSalesRatio: calculateRatio(operatingCashFlow, revenue, false),
    freeCashFlowOperatingCashFlowRatio: calculateRatio(freeCashFlow, operatingCashFlow, false),
    investedCapital,
    tangibleAssetValue,
    intangiblesToTotalAssets: calculateRatio(goodwillAndIntangibles, totalAssets, false),
    researchAndDevelopementToRevenue: calculateRatio(income.researchAndDevelopmentExpenses, revenue, false),
    salesGeneralAndAdministrativeToRevenue: calculateRatio(income.sellingGeneralAndAdministrativeExpenses, revenue, false),
    stockBasedCompensationToRevenue: calculateRatio(cashflow.stockBasedCompensation, revenue, false),
    capexToRevenue: calculateRatio(capex, revenue, false),
    capexToOperatingCashFlow: calculateRatio(capex, operatingCashFlow, false),
    capexToDepreciation: calculateRatio(capex, depreciation, false)
  };

  const value = fallbacks[field];
  if (isNumber(value)) return value;

  if (field === "daysSalesOutstanding") return fallbacks.daysOfSalesOutstanding;
  if (field === "daysInventoryOutstanding" || field === "daysOfInventoryOnHand") return fallbacks.daysOfInventoryOutstanding;
  if (field === "daysPayablesOutstanding") return fallbacks.daysOfPayablesOutstanding;
  if (field === "roe") return fallbacks.returnOnEquity;
  if (field === "roic") return fallbacks.returnOnInvestedCapital;
  if (field === "debtToEquity") return fallbacks.debtToEquityRatio;
  if (field === "debtToAssets") return fallbacks.debtToAssetsRatio;
  if (field === "interestCoverage") return fallbacks.interestCoverageRatio;

  return null;
}

const formatIndexPrice = (value) =>
  isNumber(value) ? value.toLocaleString(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }) : "--";

const formatSignedPercent = (value) =>
  isNumber(value) ? `${value > 0 ? "+" : ""}${value.toFixed(2)}%` : "--";

const formatSignedPriceChange = (value) =>
  isNumber(value) ? `${value >= 0 ? "+" : "-"}$${Math.abs(value).toFixed(2)}` : "";

const chunkSymbols = (symbols, size = 10) => {
  const chunks = [];
  for (let index = 0; index < symbols.length; index += size) {
    chunks.push(symbols.slice(index, index + size));
  }
  return chunks;
};

const STOCK_CHART_RANGES = ["1D", "1W", "1M", "1Y", "YTD", "5Y", "10Y", "MAX"];
const ETF_CHART_RANGES = STOCK_CHART_RANGES;
const STOCK_QUICK_PICKS = [
  { symbol: "NVDA", label: "NVIDIA" },
  { symbol: "MSFT", label: "Microsoft" },
  { symbol: "AAPL", label: "Apple" },
  { symbol: "AMZN", label: "Amazon" },
  { symbol: "GOOGL", label: "Alphabet" },
  { symbol: "META", label: "Meta" },
  { symbol: "AVGO", label: "Broadcom" },
  { symbol: "JPM", label: "JPMorgan" }
];
const CRYPTO_QUICK_PICKS = [
  { symbol: "BTCUSD", label: "Bitcoin" },
  { symbol: "ETHUSD", label: "Ethereum" },
  { symbol: "SOLUSD", label: "Solana" },
  { symbol: "XRPUSD", label: "XRP" },
  { symbol: "BNBUSD", label: "BNB" },
  { symbol: "ADAUSD", label: "Cardano" },
  { symbol: "DOGEUSD", label: "Dogecoin" },
  { symbol: "AVAXUSD", label: "Avalanche" }
];
const FOREX_QUICK_PICKS = [
  { symbol: "EURUSD", label: "Euro / Dollar" },
  { symbol: "GBPUSD", label: "Pound / Dollar" },
  { symbol: "USDJPY", label: "Dollar / Yen" },
  { symbol: "USDCHF", label: "Dollar / Franc" },
  { symbol: "AUDUSD", label: "Aussie / Dollar" },
  { symbol: "USDCAD", label: "Dollar / Loonie" },
  { symbol: "NZDUSD", label: "Kiwi / Dollar" },
  { symbol: "EURGBP", label: "Euro / Pound" }
];
const CRYPTO_TAPE_ICONS = {
  BTCUSD: "₿",
  ETHUSD: "Ξ",
  SOLUSD: "◎",
  XRPUSD: "X",
  BNBUSD: "BNB",
  ADAUSD: "₳",
  DOGEUSD: "Ð",
  AVAXUSD: "A"
};
const FOREX_TAPE_ICONS = {
  EURUSD: "€/$",
  GBPUSD: "£/$",
  USDJPY: "$/¥",
  USDCHF: "$/₣",
  AUDUSD: "A$",
  USDCAD: "C$",
  NZDUSD: "NZ$",
  EURGBP: "€/£"
};
const GUEST_MARKET_TAPE_ITEMS = [
  ...STOCK_QUICK_PICKS.map((item) => ({ ...item, type: "stock" })),
  ...CRYPTO_QUICK_PICKS.slice(0, 6).map((item) => ({ ...item, type: "crypto" })),
  ...FOREX_QUICK_PICKS.slice(0, 6).map((item) => ({ ...item, type: "forex" }))
];
const FOREX_CURRENCY_CODES = new Set([
  "USD", "EUR", "JPY", "GBP", "AUD", "CAD", "CHF", "CNY", "HKD", "NZD",
  "SEK", "KRW", "SGD", "NOK", "MXN", "INR", "RUB", "ZAR", "TRY", "BRL",
  "TWD", "DKK", "PLN", "THB", "IDR", "HUF", "CZK", "ILS", "CLP", "PHP",
  "AED", "COP", "SAR", "MYR", "RON"
]);
const CRYPTO_BASE_SYMBOLS = new Set([
  "BTC", "ETH", "SOL", "XRP", "BNB", "ADA", "DOGE", "AVAX", "DOT", "TRX",
  "LINK", "LTC", "BCH", "XLM", "HBAR", "ICP", "APT", "ARB", "OP", "SUI",
  "NEAR", "ETC", "FIL", "AAVE", "UNI", "MATIC", "POL", "ATOM", "ALGO", "VET",
  "SHIB", "PEPE", "TON", "USDT", "USDC", "DAI"
]);
const CRYPTO_QUOTE_SYMBOLS = ["USDT", "USDC", "USD", "EUR", "BTC", "ETH"];
const isForexPairSymbol = (symbol) => {
  const cleanSymbol = String(symbol || "").trim().toUpperCase().replace(/[^A-Z]/g, "");
  return (
    cleanSymbol.length === 6 &&
    FOREX_CURRENCY_CODES.has(cleanSymbol.slice(0, 3)) &&
    FOREX_CURRENCY_CODES.has(cleanSymbol.slice(3))
  );
};
const isCryptoPairSymbol = (symbol) => {
  const cleanSymbol = String(symbol || "").trim().toUpperCase().replace(/[-_/]/g, "");
  if (CRYPTO_QUICK_PICKS.some((item) => item.symbol === cleanSymbol)) return true;
  return CRYPTO_QUOTE_SYMBOLS.some((quote) => {
    if (!cleanSymbol.endsWith(quote) || cleanSymbol.length <= quote.length) return false;
    const base = cleanSymbol.slice(0, -quote.length);
    return CRYPTO_BASE_SYMBOLS.has(base);
  });
};
const isBlockedStockOnlySymbol = (symbol) =>
  isForexPairSymbol(symbol) || isCryptoPairSymbol(symbol);
const warnStockOnlySymbol = (symbol) => {
  const cleanSymbol = String(symbol || "").trim().toUpperCase();
  if (!cleanSymbol || !isBlockedStockOnlySymbol(cleanSymbol)) return false;
  alert(
    isForexPairSymbol(cleanSymbol)
      ? "FOREX pairs belong in the FOREX Overview page, not stock-only pages."
      : "Crypto pairs belong in the Crypto Center page, not stock-only pages."
  );
  return true;
};
const COMMODITY_GROUPS = [
  {
    title: "Precious Metals",
    items: [
      { symbol: "GCUSD", label: "Gold" },
      { symbol: "MGCUSD", label: "Micro Gold" },
      { symbol: "SIUSD", label: "Silver" },
      { symbol: "SILUSD", label: "Micro Silver" },
      { symbol: "PLUSD", label: "Platinum" },
      { symbol: "PAUSD", label: "Palladium" }
    ]
  },
  {
    title: "Energy",
    items: [
      { symbol: "CLUSD", label: "Crude Oil" },
      { symbol: "BZUSD", label: "Brent Crude" },
      { symbol: "NGUSD", label: "Natural Gas" },
      { symbol: "HOUSD", label: "Heating Oil" },
      { symbol: "RBUSD", label: "Gasoline RBOB" }
    ]
  },
  {
    title: "Agriculture",
    items: [
      { symbol: "ZCUSX", label: "Corn" },
      { symbol: "ZSUSX", label: "Soybeans" },
      { symbol: "ZMUSD", label: "Soybean Meal" },
      { symbol: "ZLUSX", label: "Soybean Oil" },
      { symbol: "ZOUSX", label: "Oats" },
      { symbol: "KEUSX", label: "Wheat" },
      { symbol: "ZRUSD", label: "Rough Rice" },
      { symbol: "SBUSX", label: "Sugar" },
      { symbol: "CTUSX", label: "Cotton" },
      { symbol: "KCUSX", label: "Coffee" },
      { symbol: "CCUSD", label: "Cocoa" },
      { symbol: "OJUSX", label: "Orange Juice" },
      { symbol: "LBUSD", label: "Lumber" },
      { symbol: "DCUSD", label: "Class III Milk" }
    ]
  },
  {
    title: "Livestock",
    items: [
      { symbol: "LEUSX", label: "Live Cattle" },
      { symbol: "GFUSX", label: "Feeder Cattle" },
      { symbol: "HEUSX", label: "Lean Hogs" }
    ]
  },
  {
    title: "Rates, Currency, and Index Futures",
    items: [
      { symbol: "DXUSD", label: "US Dollar" },
      { symbol: "ZQUSD", label: "30 Day Fed Funds" },
      { symbol: "ZTUSD", label: "2-Year T-Note" },
      { symbol: "ZFUSD", label: "5-Year T-Note" },
      { symbol: "ZNUSD", label: "10-Year T-Note" },
      { symbol: "ZBUSD", label: "30-Year Treasury Bond" },
      { symbol: "ESUSD", label: "E-mini S&P 500" },
      { symbol: "NQUSD", label: "Nasdaq 100" },
      { symbol: "YMUSD", label: "Mini Dow" },
      { symbol: "RTYUSD", label: "Micro Russell 2000" }
    ]
  },
  {
    title: "Industrial Metals",
    items: [
      { symbol: "HGUSD", label: "Copper" },
      { symbol: "ALIUSD", label: "Aluminum" }
    ]
  }
];

const formatStockChartAxisLabel = (value, range) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  if (range === "1D") {
    return date.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit"
    });
  }

  if (range === "1W" || range === "1M" || range === "YTD") {
    return date.toLocaleDateString([], {
      month: "short",
      day: "numeric"
    });
  }

  return date.toLocaleDateString([], {
    month: "short",
    year: "2-digit"
  });
};

const formatStockChartTooltipLabel = (value, range) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  if (range === "1D" || range === "1W") {
    return date.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  }

  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
};

const getMarketSignal = (indices = []) => {
  if (indices.some((index) => isNumber(index.percentChange) && index.percentChange <= -1.5)) {
    return { label: "Market Selloff", tone: "negative" };
  }

  if (indices.some((index) => isNumber(index.percentChange) && index.percentChange >= 1.5)) {
    return { label: "Market Rally", tone: "positive" };
  }

  return { label: "Market Watch", tone: "neutral" };
};

const getMarketIndexTone = (percentChange) => {
  if (!isNumber(percentChange)) return "neutral";
  if (percentChange >= 1.5) return "rally";
  if (percentChange <= -1.5) return "selloff";
  return "neutral";
};

const PROJECTION_YEARS = [2026, 2027, 2028, 2029, 2030];
const PROJECTION_CASES = [
  { id: "bull", label: "Bull Case" },
  { id: "base", label: "Base Case" },
  { id: "bear", label: "Bear Case" }
];
const DEFAULT_PROJECTION_ASSUMPTIONS = {
  revenue: "",
  revenueGrowth: "10",
  netIncome: "",
  netIncomeGrowth: "10",
  shares: "",
  sharesGrowth: "0",
  lowPe: "",
  highPe: ""
};

const getProjectionAssumptionValue = (settings, key, year) =>
  settings?.[key]?.[year] ?? DEFAULT_PROJECTION_ASSUMPTIONS[key] ?? "";

const createProjectionCaseSettings = () => ({
  revenue: {},
  revenueGrowth: {},
  netIncome: {},
  netIncomeGrowth: {},
  shares: {},
  sharesGrowth: {},
  lowPe: {},
  highPe: {}
});

const normalizeProjectionCaseSettings = (settings = {}) => ({
  revenue: settings.revenue || {},
  revenueGrowth: settings.revenueGrowth || {},
  netIncome: settings.netIncome || {},
  netIncomeGrowth: settings.netIncomeGrowth || {},
  shares: settings.shares || {},
  sharesGrowth: settings.sharesGrowth || {},
  lowPe: settings.lowPe || {},
  highPe: settings.highPe || {}
});

const normalizeStockProjections = (items = {}) => {
  if (!items || typeof items !== "object" || Array.isArray(items)) return {};

  return Object.fromEntries(
    Object.entries(items).map(([symbol, cases]) => [
      String(symbol || "").toUpperCase(),
      Object.fromEntries(
        PROJECTION_CASES.map((projectionCase) => [
          projectionCase.id,
          normalizeProjectionCaseSettings(cases?.[projectionCase.id])
        ])
      )
    ])
  );
};

const projectNetIncomeWithGrowth = (previousNetIncome, growthRate) => {
  if (!isNumber(previousNetIncome) || !isNumber(growthRate)) return null;
  if (previousNetIncome < 0) return previousNetIncome * (1 - growthRate);
  return previousNetIncome * (1 + growthRate);
};

const parseInputPercent = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number / 100 : null;
};

const parseInputNumber = (value) => {
  if (String(value ?? "").trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const parseProjectionMillionsInput = (value) => {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const normalized = raw.replace(/[$,\s]/g, "").toUpperCase();
  const suffix = normalized.endsWith("B")
    ? "B"
    : normalized.endsWith("M")
      ? "M"
      : "";
  const numericText = suffix ? normalized.slice(0, -1) : normalized;
  const number = Number(numericText);
  if (!Number.isFinite(number)) return null;

  if (suffix === "B") return number * 1000000000;
  if (suffix === "M") return number * 1000000;
  return number * 1000000;
};

const parseProjectionMoneyInput = parseProjectionMillionsInput;

const parseProjectionSharesInput = (value) => {
  return parseProjectionMillionsInput(value);
};

const formatProjectionShares = (value) => {
  if (!isNumber(value)) return "N/A";
  return formatSharesCount(value);
};

const formatProjectionMoney = (value) => {
  if (!isNumber(value)) return "N/A";
  return formatEstimateMoney(value);
};

const getEasternParts = (date) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  );

  return values;
};

const getEasternDateAsUtc = ({ year, month, day, hour = 0, minute = 0, second = 0 }) => {
  const targetUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  let estimate = new Date(targetUtc);

  for (let index = 0; index < 2; index += 1) {
    const actual = getEasternParts(estimate);
    const actualUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second
    );
    estimate = new Date(estimate.getTime() - (actualUtc - targetUtc));
  }

  return estimate;
};

const addEasternCalendarDays = (parts, days) => {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, 12));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
};

const getEasternWeekday = (parts) =>
  new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12)).getUTCDay();

const getMarketDateKey = ({ year, month, day }) =>
  `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

const getNthWeekdayOfMonth = (year, month, weekday, occurrence) => {
  let count = 0;
  for (let day = 1; day <= 31; day += 1) {
    const date = new Date(Date.UTC(year, month - 1, day, 12));
    if (date.getUTCMonth() !== month - 1) break;
    if (date.getUTCDay() === weekday) {
      count += 1;
      if (count === occurrence) return day;
    }
  }
  return null;
};

const getLastWeekdayOfMonth = (year, month, weekday) => {
  for (let day = 31; day >= 1; day -= 1) {
    const date = new Date(Date.UTC(year, month - 1, day, 12));
    if (date.getUTCMonth() === month - 1 && date.getUTCDay() === weekday) {
      return day;
    }
  }
  return null;
};

const getWesternEasterParts = (year) => {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { year, month, day };
};

const getObservedFixedHolidayKey = (year, month, day) => {
  const weekday = getEasternWeekday({ year, month, day });
  if (weekday === 6) return getMarketDateKey(addEasternCalendarDays({ year, month, day }, -1));
  if (weekday === 0) return getMarketDateKey(addEasternCalendarDays({ year, month, day }, 1));
  return getMarketDateKey({ year, month, day });
};

const getNyseHolidayKeys = (year) => {
  const holidays = new Set([
    getObservedFixedHolidayKey(year, 1, 1),
    getMarketDateKey({ year, month: 1, day: getNthWeekdayOfMonth(year, 1, 1, 3) }),
    getMarketDateKey({ year, month: 2, day: getNthWeekdayOfMonth(year, 2, 1, 3) }),
    getMarketDateKey(addEasternCalendarDays(getWesternEasterParts(year), -2)),
    getMarketDateKey({ year, month: 5, day: getLastWeekdayOfMonth(year, 5, 1) }),
    getObservedFixedHolidayKey(year, 6, 19),
    getObservedFixedHolidayKey(year, 7, 4),
    getMarketDateKey({ year, month: 9, day: getNthWeekdayOfMonth(year, 9, 1, 1) }),
    getMarketDateKey({ year, month: 11, day: getNthWeekdayOfMonth(year, 11, 4, 4) }),
    getObservedFixedHolidayKey(year, 12, 25),
    getObservedFixedHolidayKey(year + 1, 1, 1),
  ]);
  return holidays;
};

const isNyseHoliday = (parts) =>
  getNyseHolidayKeys(parts.year).has(getMarketDateKey(parts));

const isMarketSessionDay = (parts) => {
  const day = getEasternWeekday(parts);
  return day !== 0 && day !== 6 && !isNyseHoliday(parts);
};

const isNyseEarlyClose = (parts) => {
  if (!isMarketSessionDay(parts)) return false;
  const nextDay = addEasternCalendarDays(parts, 1);
  const nextDayAfter = addEasternCalendarDays(parts, 2);
  const isDayAfterThanksgiving =
    parts.month === 11 &&
    getEasternWeekday(parts) === 5 &&
    parts.day === getNthWeekdayOfMonth(parts.year, 11, 4, 4) + 1;
  const isBeforeIndependenceDay =
    nextDay.month === 7 && nextDay.day === 4;
  const isFridayBeforeSaturdayIndependenceDay =
    getEasternWeekday(parts) === 5 &&
    nextDayAfter.month === 7 &&
    nextDayAfter.day === 4;
  const isChristmasEve = parts.month === 12 && parts.day === 24;
  return isDayAfterThanksgiving || isBeforeIndependenceDay || isFridayBeforeSaturdayIndependenceDay || isChristmasEve;
};

const getMarketCloseParts = (parts) => ({
  ...parts,
  hour: isNyseEarlyClose(parts) ? 13 : 16,
  minute: 0,
  second: 0,
});

const getNextMarketSessionParts = (parts) => {
  for (let offset = 1; offset <= 14; offset += 1) {
    const nextParts = addEasternCalendarDays(parts, offset);
    if (isMarketSessionDay(nextParts)) return nextParts;
  }
  return null;
};

const formatCountdownDuration = (milliseconds) => {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
};

const getMarketClock = (now = new Date()) => {
  const parts = getEasternParts(now);
  const open = getEasternDateAsUtc({ ...parts, hour: 9, minute: 30, second: 0 });
  const close = getEasternDateAsUtc(getMarketCloseParts(parts));
  const isTradingDay = isMarketSessionDay(parts);

  if (isTradingDay && now >= open && now < close) {
    return {
      label: "Market closes in",
      value: formatCountdownDuration(close.getTime() - now.getTime()),
      tone: "open",
    };
  }

  if (isTradingDay && now < open) {
    return {
      label: "Market opens in",
      value: formatCountdownDuration(open.getTime() - now.getTime()),
      tone: "closed",
    };
  }

  const nextParts = getNextMarketSessionParts(parts);
  if (nextParts) {
    const nextOpen = getEasternDateAsUtc({ ...nextParts, hour: 9, minute: 30, second: 0 });
    return {
      label: "Market opens in",
      value: formatCountdownDuration(nextOpen.getTime() - now.getTime()),
      tone: "closed",
    };
  }

  return {
    label: "Market opens in",
    value: "--",
    tone: "closed",
  };
};

const getMarketEventSnapshot = (now = new Date()) => {
  const parts = getEasternParts(now);
  const open = getEasternDateAsUtc({ ...parts, hour: 9, minute: 30, second: 0 });
  const close = getEasternDateAsUtc(getMarketCloseParts(parts));
  const isTradingDay = isMarketSessionDay(parts);
  const sessionKey = getMarketDateKey(parts);

  if (!isTradingDay) {
    return { status: "closed", sessionKey, secondsToOpen: null, secondsToClose: null };
  }

  if (now < open) {
    return {
      status: "preopen",
      sessionKey,
      secondsToOpen: Math.ceil((open.getTime() - now.getTime()) / 1000),
      secondsToClose: null
    };
  }

  if (now < close) {
    return {
      status: "open",
      sessionKey,
      secondsToOpen: 0,
      secondsToClose: Math.ceil((close.getTime() - now.getTime()) / 1000)
    };
  }

  return { status: "closed", sessionKey, secondsToOpen: null, secondsToClose: 0 };
};

const MARKET_EVENT_TOASTS = {
  open: {
    title: "Market Open",
    message: "The trading day is live.",
    tone: "open"
  },
  close: {
    title: "Market Closed",
    message: "The closing bell has hit.",
    tone: "close"
  },
  oneHour: {
    title: "1 hour left to go",
    message: "One hour remains in the trading day.",
    tone: "warning"
  },
  twoMinutes: {
    title: "2 minutes to go",
    message: "The closing bell is almost here.",
    tone: "urgent"
  }
};

const formatChartBillions = (value) => {
  if (!isNumber(value)) return "N/A";

  if (value === 0) return "$0";

  const absValue = Math.abs(value);
  const sign = value < 0 ? "-" : "";

  if (absValue < 1) {
    return `${sign}$${(absValue * 1000).toFixed(0)}M`;
  }

  return `${sign}$${absValue.toFixed(1)}B`;
};

const formatChartEps = (value) =>
  isNumber(value) ? `$${value.toFixed(2)}` : "N/A";

const formatEstimateMoney = (value) =>
  isNumber(value) ? formatMoney(value / 1e9) : "N/A";

const formatEstimateEps = (value) =>
  isNumber(value) ? `$${value.toFixed(2)}` : "N/A";

const calculateEstimateGrowth = (estimate, actual) => {
  if (!isNumber(estimate) || !isNumber(actual) || actual === 0) return null;
  return ((estimate - actual) / Math.abs(actual)) * 100;
};

const formatChartPeriodLabel = (period) => {
  const value = String(period || "").trim();
  const quarterMatch = value.match(/(\d{4})\s+Q([1-4])/i);
  if (quarterMatch) return `Q${quarterMatch[2]} ${quarterMatch[1]}`;
  return value || "N/A";
};

const formatGrowthPercent = (value) =>
  isNumber(value) ? `${value > 0 ? "+" : ""}${value.toFixed(1)}%` : "N/A";

const calculateChartGrowth = (current, previous) => {
  if (!isNumber(current) || !isNumber(previous) || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
};

const calculateMarginPercent = (numerator, revenue) =>
  isNumber(numerator) && isNumber(revenue) && revenue !== 0
    ? (numerator / revenue) * 100
    : null;

const buildAnnualGrowthRows = (rows, key) => {
  const annualRows = (rows || [])
    .filter((row) =>
      row?.year &&
      !row?.isInterim &&
      !row?.isCurrent &&
      isNumber(row[key])
    )
    .sort((a, b) => Number(a.year) - Number(b.year));

  return annualRows.slice(1).map((row, index) => {
    const previous = annualRows[index];
    return {
      year: row.year,
      previousYear: previous.year,
      growth: calculateChartGrowth(row[key], previous[key])
    };
  });
};

const isAnnualChartRow = (row) =>
  row?.year && !row?.isInterim && !row?.isCurrent;

const isQuarterlyChartRow = (row) =>
  row?.year && row?.isInterim && !row?.isCurrent;

const filterChartRowsByMode = (rows = [], mode = "annual") =>
  (rows || []).filter((row) =>
    mode === "quarterly"
      ? isQuarterlyChartRow(row)
      : isAnnualChartRow(row)
  );

const buildChartRows = (rows, key) =>
  (rows || [])
    .map((item) => ({
      year: item.year,
      period: item.period || String(item.year),
      isInterim: Boolean(item.isInterim),
      isCurrent: Boolean(item.isCurrent),
      source: item.source,
      [key]: isNumber(item[key])
        ? item[key]
        : null,
    }))
    .filter((item) =>
      item.year &&
      item[key] !== null &&
      item.source !== "Modeled fallback" &&
      item.source !== "Current metric fallback" &&
      (item.isInterim || item.year <= new Date().getFullYear())
    );

const buildEpsChartRows = (rows = [], shareBasis = "diluted") => {
  const option = epsChartShareOption(shareBasis);
  return (rows || [])
    .map((item) => {
      const selectedEps = firstNumber(item[option.key], item.eps);
      return {
        year: item.year,
        period: item.period || String(item.year),
        isInterim: Boolean(item.isInterim),
        isCurrent: Boolean(item.isCurrent),
        source: item.source,
        eps: isNumber(selectedEps) ? selectedEps : null,
      };
    })
    .filter((item) =>
      item.year &&
      item.eps !== null &&
      item.source !== "Modeled fallback" &&
      item.source !== "Current metric fallback" &&
      (item.isInterim || item.year <= new Date().getFullYear())
    );
};

const mergeChartRows = (rows, key) => {
  const merged = new Map();

  (rows || []).forEach((item) => {
    if (!item?.year || !isNumber(item[key])) return;
    const period = item.period || String(item.year);
    const mergeKey = period || `${item.year}-${item.isInterim ? "interim" : "annual"}`;
    merged.set(mergeKey, {
      ...(merged.get(mergeKey) || {}),
      ...item,
      period,
      isInterim: Boolean(item.isInterim),
    });
  });

  return [...merged.values()].sort((a, b) => {
    const yearDiff = Number(a.year) - Number(b.year);
    if (yearDiff !== 0) return yearDiff;
    if (a.isInterim !== b.isInterim) return a.isInterim ? 1 : -1;
    return String(a.period).localeCompare(String(b.period));
  });
};

const mergeMultiMetricRows = (rows = [], keys = []) => {
  const merged = new Map();

  (rows || []).forEach((item) => {
    if (!item?.year) return;
    const period = item.period || String(item.year);
    const mergeKey = item.isInterim ? `${item.year}:${period}` : `${item.year}:annual`;
    const existing = merged.get(mergeKey) || {};
    const next = {
      ...existing,
      ...item,
      period,
      isInterim: Boolean(item.isInterim),
      isCurrent: Boolean(item.isCurrent)
    };
    keys.forEach((key) => {
      next[key] = isNumber(item[key]) ? item[key] : existing[key] ?? null;
    });
    merged.set(mergeKey, next);
  });

  return [...merged.values()]
    .filter((row) => keys.some((key) => isNumber(row[key])))
    .sort((a, b) => {
      const yearDiff = Number(a.year) - Number(b.year);
      if (yearDiff !== 0) return yearDiff;
      if (a.isInterim !== b.isInterim) return a.isInterim ? 1 : -1;
      return String(a.period || "").localeCompare(String(b.period || ""));
    });
};

const CHART_STABLE_FIELDS = [
  "revenueData",
  "revenueHistory",
  "marginHistory",
  "historicalPe",
  "totalCash",
  "totalDebt",
  "cashAndCashEquivalents",
  "netCash",
  "netCashPerShare",
  "equityBookValue",
  "bookValuePerShare",
  "workingCapital",
  "balanceSheetAsOf",
  "balanceSheetSource",
  "balanceSheetCheckedAt",
  "balanceSheetMetricsVersion"
];

const METRIC_STABLE_FIELDS = [
  "marketCap",
  "pe",
  "forwardPE",
  "forwardPS",
  "priceToTangibleBook",
  "priceToFreeCashflow",
  "priceToOperatingCashflow",
  "pegRatio",
  "enterpriseValue",
  "evToSales",
  "evToEbitda",
  "evToOperatingCashflow",
  "evToFreeCashflow",
  "netDebtToEbitda",
  "fcfYield",
  "earningsYield",
  "currentRatio",
  "quickRatio",
  "cashRatio",
  "debtToEquity",
  "debtToAssets",
  "debtToCapital",
  "financialLeverage",
  "interestCoverage",
  "dividendYieldTtm",
  "dividendPayoutRatio",
  "incomeQuality",
  "assetTurnover",
  "inventoryTurnover",
  "receivablesTurnover",
  "payablesTurnover",
  "cashConversionCycle",
  "daysSalesOutstanding",
  "daysPayablesOutstanding",
  "daysInventoryOutstanding",
  "operatingCycle",
  "rdToRevenue",
  "sgaToRevenue",
  "stockBasedCompToRevenue",
  "capexToRevenue",
  "capexToOperatingCashflow",
  "capexToDepreciation",
  "effectiveTaxRate",
  "priceToSales",
  "priceToBook",
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
  "sharesOutstanding",
  "grossMargins",
  "operatingMargins",
  "profitMargins",
  "pretaxMargin",
  "ebitdaMargin",
  "ebitMargin",
  "fcfMargin",
  "returnOnEquity",
  "returnOnAssets",
  "returnOnInvestedCapital",
  "returnOnCapitalEmployed",
  "weightedAverageCostOfCapital",
  "revenuePerEmployee",
  "profitsPerEmployee",
  "employeeCount",
  "freeCashflow",
  "operatingCashflow",
  "fiftyTwoWeekHigh",
  "fiftyTwoWeekLow",
  "targetMean",
  "analystRatingText",
  "recommendationKey",
  "bankMetrics"
];

const chartHistoryPointCount = (stock = {}, key) => {
  const periods = new Set();
  (Array.isArray(stock.revenueData) ? stock.revenueData : []).forEach((row) => {
    if (!isNumber(row?.[key]) || row?.isCurrent) return;
    periods.add(row.period || `${row.year}-${row.isInterim ? "interim" : "annual"}`);
  });
  return periods.size;
};

const hasCompleteCoreChartData = (stock = {}) =>
  chartHistoryPointCount(stock, "revenue") >= 2 &&
  chartHistoryPointCount(stock, "earnings") >= 2 &&
  chartHistoryPointCount(stock, "eps") >= 2;

const hasStableChartData = (stock = {}) =>
  hasCompleteCoreChartData(stock) ||
  (Array.isArray(stock.revenueHistory) && stock.revenueHistory.length >= 2);

const countInterimRows = (rows = []) =>
  (Array.isArray(rows) ? rows : []).filter((row) => row?.isInterim && row?.period !== "Current").length;

const chartRowsScore = (rows = [], keys = ["revenue", "earnings", "eps"]) => {
  if (!Array.isArray(rows)) return 0;
  const realRows = rows.filter((row) => row && !row.isCurrent);
  const valueCount = realRows.reduce((total, row) =>
    total + keys.filter((key) => isNumber(row?.[key])).length, 0);
  const epsBasisFieldCount = realRows.reduce((total, row) =>
    total + ["epsBasic", "epsDiluted"].filter((key) => isNumber(row?.[key])).length, 0);
  const epsBasisDifferenceCount = realRows.filter((row) =>
    isNumber(row?.epsBasic) &&
    isNumber(row?.epsDiluted) &&
    Math.abs(row.epsBasic - row.epsDiluted) > 0.0001
  ).length;
  return valueCount + epsBasisFieldCount * 4 + epsBasisDifferenceCount * 8 + countInterimRows(realRows) * 3 + realRows.length;
};

const chooseRicherRows = (previousRows, incomingRows, keys) => {
  if (!Array.isArray(previousRows) || !previousRows.length) return incomingRows;
  if (!Array.isArray(incomingRows) || !incomingRows.length) return previousRows;
  return chartRowsScore(incomingRows, keys) >= chartRowsScore(previousRows, keys)
    ? incomingRows
    : previousRows;
};

const historicalPeRowsScore = (rows = []) => {
  if (!Array.isArray(rows)) return 0;
  const cleanRows = rows.filter((row) =>
    row &&
    !row.isInterim &&
    !row.isCurrent &&
    isNumber(row.pe)
  );
  const fmpRows = cleanRows.filter((row) => /FMP/i.test(String(row?.source || "")));
  const uniqueYears = new Set(cleanRows.map((row) => Number(row.year)).filter(Number.isFinite)).size;
  return cleanRows.length * 10 + uniqueYears * 8 + fmpRows.length * 5;
};

const chooseHistoricalPeRows = (previousRows, incomingRows) => {
  if (!Array.isArray(previousRows) || !previousRows.length) return incomingRows;
  if (!Array.isArray(incomingRows) || !incomingRows.length) return previousRows;
  return historicalPeRowsScore(incomingRows) >= historicalPeRowsScore(previousRows)
    ? incomingRows
    : previousRows;
};

const hasMarketActivityData = (stock = {}) =>
  (Array.isArray(stock.analystUpdates) && stock.analystUpdates.length > 0) ||
  (Array.isArray(stock.insiderTransactions) && stock.insiderTransactions.length > 0);

const isLegacyInstitutionalHolderRow = (row = {}) =>
  /MarketBeat/i.test(String(row?.source || ""));

const getCurrentInstitutionalHolderRows = (rows = []) =>
  (Array.isArray(rows) ? rows : []).filter((row) => !isLegacyInstitutionalHolderRow(row));

const hasMarketActivityLoaded = (stock = {}) =>
  Boolean(stock.analystUpdatesCheckedAt || (Array.isArray(stock.analystUpdates) && stock.analystUpdates.length)) &&
  Boolean(stock.insiderTransactionsCheckedAt || (Array.isArray(stock.insiderTransactions) && stock.insiderTransactions.length));

const hasAnyOverviewMetricData = (stock = {}) =>
  isNumber(stock.marketCap) ||
  isNumber(stock.beta) ||
  isNumber(stock.volume) ||
  isNumber(stock.lastDividend) ||
  isNumber(stock.priceAvg50) ||
  isNumber(stock.priceAvg200) ||
  isNumber(stock.pe) ||
  isNumber(stock.forwardPE) ||
  isNumber(stock.priceToSales) ||
  isNumber(stock.priceToBook) ||
  isNumber(stock.revenueGrowth) ||
  isNumber(stock.earningsGrowth) ||
  isNumber(stock.grossMargins) ||
  isNumber(stock.profitMargins) ||
  isNumber(stock.freeCashflow) ||
  isNumber(stock.operatingCashflow) ||
  isNumber(stock.targetMean);

const overviewMetricCount = (stock = {}) =>
  [
    "marketCap",
    "beta",
    "volume",
    "lastDividend",
    "priceAvg50",
    "priceAvg200",
    "pe",
    "forwardPE",
    "pegRatio",
    "forwardPS",
    "priceToSales",
    "priceToBook",
    "priceToFreeCashflow",
    "priceToOperatingCashflow",
    "totalCash",
    "totalDebt",
    "cashAndCashEquivalents",
    "netCash",
    "equityBookValue",
    "workingCapital",
    "enterpriseValue",
    "evToSales",
    "evToEbitda",
    "evToOperatingCashflow",
    "evToFreeCashflow",
    "netDebtToEbitda",
    "fcfYield",
    "earningsYield",
    "currentRatio",
    "quickRatio",
    "cashRatio",
    "debtToEquity",
    "debtToAssets",
    "debtToCapital",
    "financialLeverage",
    "interestCoverage",
    "dividendYieldTtm",
    "dividendPayoutRatio",
    "incomeQuality",
    "assetTurnover",
    "inventoryTurnover",
    "receivablesTurnover",
    "payablesTurnover",
    "cashConversionCycle",
    "daysSalesOutstanding",
    "daysPayablesOutstanding",
    "daysInventoryOutstanding",
    "operatingCycle",
    "rdToRevenue",
    "sgaToRevenue",
    "stockBasedCompToRevenue",
    "capexToRevenue",
    "capexToOperatingCashflow",
    "capexToDepreciation",
    "effectiveTaxRate",
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
    "returnOnEquity",
    "returnOnAssets",
    "returnOnInvestedCapital",
    "revenuePerEmployee",
    "profitsPerEmployee",
    "employeeCount",
    "fiftyTwoWeekHigh",
    "fiftyTwoWeekLow"
  ].filter((field) => isNumber(stock[field])).length;

const hasNextQuarterData = (stock = {}) => {
  const nextQuarter = stock.analystEstimates?.nextQuarter || {};
  return (
    isNumber(nextQuarter.revenue) ||
    isNumber(nextQuarter.eps) ||
    Boolean(nextQuarter.date)
  );
};

const hasAnnualEstimateData = (stock = {}) => {
  const estimates = stock.analystEstimates || {};
  return (
    Array.isArray(estimates.futureYears) && estimates.futureYears.length
  ) || (
    (isNumber(estimates.currentYear?.revenue) || isNumber(estimates.currentYear?.eps)) &&
    (isNumber(estimates.nextYear?.revenue) || isNumber(estimates.nextYear?.eps))
  );
};

function segmentScore(segmentData) {
  return Array.isArray(segmentData?.segments)
    ? segmentData.segments.filter((segment) => isNumber(segment?.value)).length
    : 0;
}

const hasRevenueSegmentData = (stock = {}) =>
  segmentScore(stock.revenueProductSegments) > 0 ||
  segmentScore(stock.revenueGeographicSegments) > 0;

const hasCompleteMetricCardVersions = (stock = {}) =>
  stock?.valuationMetricsVersion === VALUATION_METRICS_VERSION &&
  stock?.balanceSheetMetricsVersion === BALANCE_SHEET_METRICS_VERSION;

const hasValuationMetricRequestSettled = (stock = {}) =>
  stock?.valuationMetricsVersion === VALUATION_METRICS_VERSION;

const hasBalanceSheetMetricRequestSettled = (stock = {}) =>
  stock?.balanceSheetMetricsVersion === BALANCE_SHEET_METRICS_VERSION;

const hasProfileMetricSnapshot = (stock = {}) =>
  Boolean(stock?.profileMetricsCheckedAt || stock?.fmpProfileSource);

const hasShareFloatMetricSnapshot = (stock = {}) =>
  Boolean(
    stock?.sharesFloatCheckedAt ||
    stock?.sharesFloatSource ||
    isNumber(stock?.floatShares) ||
    isNumber(stock?.freeFloatShares)
  );

const shouldRetryOverviewExtras = (stock = {}, attempt = 0) =>
  attempt < 120 &&
  (
    !stock.overviewExtrasCheckedAt ||
    !hasCompleteMetricCardVersions(stock) ||
    !hasProfileMetricSnapshot(stock) ||
    !hasShareFloatMetricSnapshot(stock)
  );

const shouldRetrySidecarData = (stock = {}, attempt = 0) =>
  attempt < 2 &&
  (
    !stock.stockSidecarsCheckedAt ||
    (attempt < 1 && (
      !hasAnnualEstimateData(stock) ||
      !hasNextQuarterData(stock) ||
      !hasMarketActivityLoaded(stock)
    ))
  );

const estimateFieldScore = (estimate = {}) =>
  ["revenue", "earnings", "eps", "ebitdaAvg", "ebitAvg", "sgaExpenseAvg", "date", "fiscalYear", "fiscalQuarter"]
    .filter((field) => estimate?.[field] !== null && estimate?.[field] !== undefined && estimate?.[field] !== "")
    .length;

const chooseRicherEstimate = (previousEstimate, incomingEstimate) => {
  if (!previousEstimate || !Object.keys(previousEstimate).length) return incomingEstimate;
  if (!incomingEstimate || !Object.keys(incomingEstimate).length) return previousEstimate;
  if (estimateFieldScore(incomingEstimate) >= estimateFieldScore(previousEstimate)) {
    return { ...previousEstimate, ...incomingEstimate };
  }
  return { ...incomingEstimate, ...previousEstimate };
};

const chooseRicherFutureYears = (previousYears, incomingYears) => {
  if (!Array.isArray(previousYears) || !previousYears.length) return incomingYears;
  if (!Array.isArray(incomingYears) || !incomingYears.length) return previousYears;
  const score = (rows) =>
    rows.reduce((total, row) => total + estimateFieldScore(row), 0) + rows.length * 4;
  return score(incomingYears) >= score(previousYears) ? incomingYears : previousYears;
};

const chooseRicherAnalystEstimates = (previousEstimates = {}, incomingEstimates = {}) => {
  if (!previousEstimates || !Object.keys(previousEstimates).length) return incomingEstimates;
  if (!incomingEstimates || !Object.keys(incomingEstimates).length) return previousEstimates;
  return {
    ...incomingEstimates,
    nextQuarter: chooseRicherEstimate(previousEstimates.nextQuarter, incomingEstimates.nextQuarter),
    currentYear: chooseRicherEstimate(previousEstimates.currentYear, incomingEstimates.currentYear),
    nextYear: chooseRicherEstimate(previousEstimates.nextYear, incomingEstimates.nextYear),
    followingYear: chooseRicherEstimate(previousEstimates.followingYear, incomingEstimates.followingYear),
    futureYears: chooseRicherFutureYears(previousEstimates.futureYears, incomingEstimates.futureYears)
  };
};

const epsBeatMissScore = (rows = []) =>
  (Array.isArray(rows) ? rows : []).reduce((total, row) =>
    total +
    (isNumber(row?.actual) ? 4 : 0) +
    (isNumber(row?.estimate) ? 3 : 0) +
    (row?.date ? 2 : 0) +
    (row?.period || row?.fiscalQuarter ? 1 : 0), 0);

const chooseRicherEpsBeatMissRows = (previousRows, incomingRows) => {
  if (!Array.isArray(previousRows) || !previousRows.length) return incomingRows;
  if (!Array.isArray(incomingRows) || !incomingRows.length) return previousRows;
  return epsBeatMissScore(incomingRows) >= epsBeatMissScore(previousRows)
    ? incomingRows
    : previousRows;
};

const chooseRicherSegmentData = (previousSegments, incomingSegments) => {
  if (!segmentScore(previousSegments)) return incomingSegments;
  if (!segmentScore(incomingSegments)) return previousSegments;
  return segmentScore(incomingSegments) >= segmentScore(previousSegments)
    ? incomingSegments
    : previousSegments;
};

const historicalFieldCount = (rows = [], field) =>
  (Array.isArray(rows) ? rows : [])
    .filter((row) => !row?.isCurrent && isNumber(row?.[field]))
    .length;

const hasExtendedHistoricalChartData = (stock = {}) => {
  const revenueData = stock.revenueData || [];
  const marginHistory = stock.marginHistory || [];
  const hasCashFlowHistory =
    historicalFieldCount(revenueData, "operatingCashflow") >= 2 ||
    historicalFieldCount(revenueData, "freeCashflow") >= 2;
  const hasMarginHistory =
    historicalFieldCount(marginHistory, "grossMargin") >= 2 ||
    historicalFieldCount(marginHistory, "operatingMargin") >= 2 ||
    historicalFieldCount(marginHistory, "profitMargin") >= 2 ||
    stock.isFinancialCompany;

  return hasCashFlowHistory && hasMarginHistory;
};

const shouldKeepWarmingNewStock = (stock = {}) =>
  !hasCompleteCoreChartData(stock) ||
  !hasExtendedHistoricalChartData(stock);

const stabilizeRefreshingStockData = (previous, incoming) => {
  if (
    !previous ||
    String(previous.ticker || previous.symbol || "").toUpperCase() !==
      String(incoming.ticker || incoming.symbol || "").toUpperCase()
  ) {
    return incoming;
  }

  const stable = { ...incoming };
  if (incoming?.refreshing && hasStableChartData(previous)) {
    CHART_STABLE_FIELDS.forEach((field) => {
      if (previous[field] !== undefined && previous[field] !== null) {
        stable[field] = previous[field];
      }
    });
  }
  stable.revenueData = chooseRicherRows(previous.revenueData, incoming.revenueData, [
    "revenue",
    "earnings",
    "eps",
    "epsBasic",
    "epsDiluted",
    "operatingCashflow",
    "freeCashflow",
    "sharesOutstanding"
  ]);
  stable.revenueHistory = chooseRicherRows(previous.revenueHistory, incoming.revenueHistory, [
    "revenue",
    "earnings",
    "eps",
    "epsBasic",
    "epsDiluted"
  ]);
  stable.marginHistory = chooseRicherRows(previous.marginHistory, incoming.marginHistory, [
    "grossMargin",
    "operatingMargin",
    "profitMargin"
  ]);
  stable.historicalPe = chooseHistoricalPeRows(previous.historicalPe, incoming.historicalPe);
  if (incoming.historicalPeCheckedAt || incoming.historicalPeSource) {
    stable.historicalPeCheckedAt = incoming.historicalPeCheckedAt || stable.historicalPeCheckedAt;
    stable.historicalPeSource = incoming.historicalPeSource || stable.historicalPeSource;
  }
  stable.analystEstimates = chooseRicherAnalystEstimates(
    previous.analystEstimates,
    incoming.analystEstimates
  );
  stable.epsBeatMiss = chooseRicherEpsBeatMissRows(previous.epsBeatMiss, incoming.epsBeatMiss);
  stable.revenueProductSegments = chooseRicherSegmentData(
    previous.revenueProductSegments,
    incoming.revenueProductSegments
  );
  stable.revenueGeographicSegments = chooseRicherSegmentData(
    previous.revenueGeographicSegments,
    incoming.revenueGeographicSegments
  );
  if (
    previous.afterHoursTrade &&
    (!incoming.afterHoursTrade || !isNumber(incoming.afterHoursTrade?.price))
  ) {
    stable.afterHoursTrade = previous.afterHoursTrade;
  }
  ["analystUpdates", "institutionalHolders", "insiderTransactions"].forEach((field) => {
    const previousRows = field === "institutionalHolders"
      ? getCurrentInstitutionalHolderRows(previous[field])
      : previous[field];
    const incomingRows = field === "institutionalHolders"
      ? getCurrentInstitutionalHolderRows(incoming[field])
      : incoming[field];
    if (
      Array.isArray(previousRows) &&
      previousRows.length &&
      (!Array.isArray(incomingRows) || incomingRows.length < previousRows.length)
    ) {
      stable[field] = previousRows;
    }
  });
  METRIC_STABLE_FIELDS.forEach((field) => {
    if (
      previous[field] !== undefined &&
      previous[field] !== null &&
      (incoming[field] === undefined || incoming[field] === null || incoming[field] === "N/A")
    ) {
      stable[field] = previous[field];
    }
  });
  stable.financialHistoryVersion =
    incoming.financialHistoryVersion ?? previous.financialHistoryVersion;
  stable.interimHistoryVersion =
    incoming.interimHistoryVersion ?? previous.interimHistoryVersion;
  stable.hasInterimHistory =
    incoming.hasInterimHistory ?? previous.hasInterimHistory;
  stable.latestInterimPeriod =
    incoming.latestInterimPeriod ?? previous.latestInterimPeriod;
  stable.estimateDataVersion =
    incoming.estimateDataVersion ?? previous.estimateDataVersion;
  stable.quarterEstimateCheckedAt =
    incoming.quarterEstimateCheckedAt ?? previous.quarterEstimateCheckedAt;
  stable.epsBeatMissCheckedAt =
    incoming.epsBeatMissCheckedAt ?? previous.epsBeatMissCheckedAt;
  stable.marketActivityUpdatedAt =
    incoming.marketActivityUpdatedAt ?? previous.marketActivityUpdatedAt;
  return stable;
};

const splitForSpeech = (text, maxLength = 1200) => {
  const sentences = String(text || "").match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
  const chunks = [];
  let chunk = "";

  for (const sentence of sentences) {
    if (chunk && chunk.length + sentence.length > maxLength) {
      chunks.push(chunk.trim());
      chunk = "";
    }
    chunk += sentence;
  }
  if (chunk.trim()) chunks.push(chunk.trim());
  return chunks;
};

const toLocalIsoDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getWeekStartIso = (date = new Date()) => {
  const copy = new Date(date);
  copy.setHours(12, 0, 0, 0);
  copy.setDate(copy.getDate() - ((copy.getDay() + 6) % 7));
  return toLocalIsoDate(copy);
};

const shiftIsoDate = (isoDate, days) => {
  const date = new Date(`${isoDate}T12:00:00`);
  date.setDate(date.getDate() + days);
  return toLocalIsoDate(date);
};

const formatCalendarMoney = (value, missingLabel = "N/A") => {
  if (!isNumber(value)) return missingLabel;
  const absolute = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (absolute >= 1e12) return `${sign}$${(absolute / 1e12).toFixed(2)}T`;
  if (absolute >= 1e9) return `${sign}$${(absolute / 1e9).toFixed(1)}B`;
  if (absolute >= 1e6) return `${sign}$${(absolute / 1e6).toFixed(1)}M`;
  return `${sign}$${absolute.toLocaleString()}`;
};

const formatCalendarEps = (value, missingLabel = "N/A") =>
  isNumber(value) ? `${value < 0 ? "-" : ""}$${Math.abs(value).toFixed(2)}` : missingLabel;

const formatCalendarPercent = (value, missingLabel = "N/A") =>
  isNumber(value) ? `${value.toFixed(2)}%` : missingLabel;

const formatCalendarSignedPercent = (value, missingLabel = "N/A") =>
  isNumber(value) ? `${value >= 0 ? "+" : ""}${value.toFixed(2)}%` : missingLabel;

const formatCalendarShares = (value, missingLabel = "N/A") => {
  if (!isNumber(value)) return missingLabel;
  const absolute = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (absolute >= 1e9) return `${sign}${(absolute / 1e9).toFixed(2)}B`;
  if (absolute >= 1e6) return `${sign}${(absolute / 1e6).toFixed(2)}M`;
  if (absolute >= 1e3) return `${sign}${(absolute / 1e3).toFixed(1)}K`;
  return `${sign}${absolute.toLocaleString()}`;
};

const isUsLiveEarningsEvent = (event = {}) => {
  const symbol = String(event.symbol || "").trim().toUpperCase();
  const exchange = String(event.exchange || "").trim().toUpperCase();
  if (!symbol || symbol.endsWith("F") || symbol.endsWith("Y")) return false;
  if (/[.=]/.test(symbol)) return false;
  if (/^(NASDAQ|NYSE|AMEX|NYSEAMERICAN|NYSE ARCA|ARCA|BATS|CBOE|IEX|NASDAQGM|NASDAQGS|NASDAQCM)$/.test(exchange)) return true;
  if (!exchange) return /^[A-Z]{1,5}$/.test(symbol);
  return false;
};

const getUsLiveEarningsEvents = (day = {}) =>
  (Array.isArray(day.liveEvents) && day.liveEvents.length ? day.liveEvents : day.events || [])
    .filter(isUsLiveEarningsEvent);

const formatCalendarValue = (value, unit = "", missingLabel = "N/A") => {
  if (!isNumber(value)) return missingLabel;
  const suffix = unit && unit !== "N/A" ? ` ${unit}` : "";
  return `${value.toLocaleString(undefined, {
    maximumFractionDigits: Math.abs(value) < 10 ? 2 : 1
  })}${suffix}`;
};

const formatTreasuryRate = (value) =>
  isNumber(value) ? `${value.toFixed(2)}%` : "N/A";

const formatNewsDate = (value) => {
  if (!value) return "";
  const date = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
};

const formatPortfolioCurrency = (value) => {
  if (!isNumber(value)) return "$0.00";
  return `${value < 0 ? "-" : ""}$${Math.abs(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
};

const PORTFOLIO_COLORS = [
  "#60a5fa",
  "#34d399",
  "#f59e0b",
  "#f472b6",
  "#a78bfa",
  "#22d3ee",
  "#fb7185",
  "#84cc16"
];
const DEFAULT_PORTFOLIO = {
  id: "portfolio-default",
  name: "My Portfolio",
  cash: 0,
  positions: []
};
const SAVED_LISTS_STORAGE_KEY = "mrktrally-saved-lists";
const MARKET_INDICES_STORAGE_KEY = "mrktrally-market-indices";
const SAVED_QUOTES_STORAGE_KEY = "mrktrally-saved-quotes";
const SAVED_QUOTES_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MARKET_INDEX_ORDER = [
  { key: "sp500", label: "S&P 500" },
  { key: "dow", label: "Dow Jones" },
  { key: "nasdaq", label: "Nasdaq 100" },
  { key: "russell2000", label: "Russell 2000" }
];

const normalizeSymbolList = (symbols = []) =>
  [...new Set((Array.isArray(symbols) ? symbols : [])
    .map((symbol) => String(symbol || "").trim().toUpperCase())
    .filter(Boolean))];

const normalizeStockSearchSymbol = (symbol) => {
  const cleanSymbol = String(symbol || "").trim().toUpperCase();
  return /^[A-Z]{1,5}\.[A-Z]$/.test(cleanSymbol)
    ? cleanSymbol.replace(".", "-")
    : cleanSymbol;
};

const getUserStorageId = (user) =>
  String(user?._id || user?.id || "");

const normalizePortfolios = (items = []) => {
  if (!Array.isArray(items) || !items.length) return [];
  return items.map((item, index) => ({
    id: String(item?.id || `portfolio-${index}`),
    name: String(item?.name || `Portfolio ${index + 1}`),
    cash: Number.isFinite(Number(item?.cash)) && Number(item?.cash) > 0
      ? Number(item.cash)
      : 0,
    positions: Array.isArray(item?.positions)
      ? item.positions.map((position, positionIndex) => ({
          ...position,
          id: String(
            position?.id ||
              `${item?.id || `portfolio-${index}`}-${position?.symbol || "position"}-${positionIndex}`
          )
        }))
      : []
  }));
};

const hasPortfolioPositions = (items = []) =>
  normalizePortfolios(items).some((item) => item.positions.length > 0);

const mergePortfolios = (localItems = [], remoteItems = []) => {
  const merged = new Map();

  [...normalizePortfolios(localItems), ...normalizePortfolios(remoteItems)].forEach((portfolio, index) => {
    const id = portfolio.id || `portfolio-${index}`;
    const existing = merged.get(id);
    if (!existing) {
      merged.set(id, portfolio);
      return;
    }

    const positionsBySymbol = new Map(
      (existing.positions || []).map((position) => [String(position.symbol || "").toUpperCase(), position])
    );
    (portfolio.positions || []).forEach((position) => {
      const symbol = String(position.symbol || "").toUpperCase();
      if (symbol) positionsBySymbol.set(symbol, position);
    });
    merged.set(id, {
      ...existing,
      ...portfolio,
      positions: [...positionsBySymbol.values()]
    });
  });

  const result = [...merged.values()];
  return result.length ? result : [DEFAULT_PORTFOLIO];
};

const mergeNamedWatchlists = (localLists = [], remoteLists = []) => {
  const merged = new Map();

  [...(Array.isArray(localLists) ? localLists : []), ...(Array.isArray(remoteLists) ? remoteLists : [])]
    .forEach((list, index) => {
      const id = String(list?.id || `watchlist-${index}`);
      const existing = merged.get(id);
      merged.set(id, {
        id,
        name: String(list?.name || existing?.name || `Watchlist ${index + 1}`),
        symbols: normalizeSymbolList([
          ...(existing?.symbols || []),
          ...(Array.isArray(list?.symbols) ? list.symbols : [])
        ])
      });
    });

  return [...merged.values()];
};

const readLocalJsonStorage = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
};

const readSavedUserSnapshot = () => readLocalJsonStorage("user", null);

const readSavedListsSnapshot = () => {
  const savedLists = readLocalJsonStorage(SAVED_LISTS_STORAGE_KEY, {});
  const portfolios = normalizePortfolios(savedLists.portfolios || []);
  const activePortfolioId = portfolios.some((item) => item.id === savedLists.activePortfolioId)
    ? savedLists.activePortfolioId
    : (portfolios[0]?.id || DEFAULT_PORTFOLIO.id);

  return {
    watchlist: normalizeSymbolList(savedLists.watchlist || []),
    portfolios: portfolios.length ? portfolios : [DEFAULT_PORTFOLIO],
    activePortfolioId,
    namedWatchlists: mergeNamedWatchlists(savedLists.namedWatchlists || [], []),
    projections: normalizeStockProjections(savedLists.projections || {}),
    profileSettings: savedLists.profileSettings || {}
  };
};

const readSavedQuoteSnapshot = () => {
  const snapshot = readLocalJsonStorage(SAVED_QUOTES_STORAGE_KEY, {});
  const savedAt = Date.parse(snapshot?.savedAt);
  if (!snapshot?.savedAt || Number.isNaN(savedAt)) {
    return { prices: {}, details: {} };
  }
  const isExpired = Date.now() - savedAt > SAVED_QUOTES_TTL_MS;
  return {
    prices: snapshot.prices && typeof snapshot.prices === "object" ? snapshot.prices : {},
    details: snapshot.details && typeof snapshot.details === "object" ? snapshot.details : {},
    isExpired,
    savedAt: snapshot.savedAt
  };
};

const mergeSavedQuoteSnapshot = (prices = {}, details = {}) => {
  if (!Object.keys(prices).length && !Object.keys(details).length) return;
  const existing = readSavedQuoteSnapshot();
  localStorage.setItem(
    SAVED_QUOTES_STORAGE_KEY,
    JSON.stringify({
      savedAt: new Date().toISOString(),
      prices: { ...existing.prices, ...prices },
      details: { ...existing.details, ...details }
    })
  );
};

const isChartQuoteDetail = (detail = {}) => {
  const source = String(detail?.source || "").toLowerCase();
  return source.includes("chart") || source.includes("intraday");
};
import axios from "axios";
const API_URL =
  import.meta.env.VITE_API_URL ||
  "https://investment-terminal-jtng.onrender.com";
const FINANCIAL_HISTORY_VERSION = 163;
const STOCK_ESTIMATE_VERSION = 23;
const INTERIM_HISTORY_VERSION = 6;
const VALUATION_METRICS_VERSION = 24;
const BALANCE_SHEET_METRICS_VERSION = 14;
const MIN_USABLE_INTERIM_HISTORY_ROWS = 8;
const MIN_DISPLAY_INTERIM_HISTORY_ROWS = 4;

const getApiBaseUrl = () => {
  const apiRoot = String(API_URL || "").replace(/\/$/, "");
  return apiRoot.endsWith("/api") ? apiRoot : `${apiRoot}/api`;
};

const getCompanyLogoProxyUrl = (symbol) => {
  const cleanSymbol = String(symbol || "").trim().toUpperCase();
  return cleanSymbol ? `${getApiBaseUrl()}/company-logo/${encodeURIComponent(cleanSymbol)}` : "";
};

const getImageProxyUrl = (src) => {
  if (!src || typeof src !== "string" || src.startsWith("/")) return src || "";
  try {
    const sourceUrl = new URL(src, window.location.origin);
    const apiUrl = new URL(getApiBaseUrl(), window.location.origin);
    const apiPath = apiUrl.pathname.replace(/\/$/, "");
    if (sourceUrl.origin === apiUrl.origin && sourceUrl.pathname.startsWith(apiPath)) {
      return src;
    }
  } catch {
    return src;
  }
  return `${getApiBaseUrl()}/image-proxy?url=${encodeURIComponent(src)}`;
};

const getCompanyLogoCandidates = (symbol, providerLogo = "") => {
  const cleanSymbol = String(symbol || "").trim().toUpperCase();
  if (!cleanSymbol) return [];
  const symbolVariants = [...new Set([
    cleanSymbol,
    cleanSymbol.replace(/\./g, "-"),
    cleanSymbol.replace(/-/g, "."),
    cleanSymbol.replace(/[.-]/g, ""),
    cleanSymbol.split(".")[0],
    cleanSymbol.split("-")[0]
  ].map((value) => String(value || "").replace(/[^A-Z0-9.-]/g, "")).filter(Boolean))];
  const encodedVariants = symbolVariants.map((variant) => encodeURIComponent(variant));
  const lowerEncodedVariants = symbolVariants.map((variant) => encodeURIComponent(variant.toLowerCase()));
  return [
    ...symbolVariants.map((variant) => getCompanyLogoProxyUrl(variant)),
    providerLogo ? getImageProxyUrl(providerLogo) : "",
    ...lowerEncodedVariants.map((variant) => getImageProxyUrl(`https://static2.finnhub.io/file/publicdatany/finnhubimage/stock_logo/${variant}.png`)),
    ...encodedVariants.map((variant) => getImageProxyUrl(`https://financialmodelingprep.com/image-stock/${variant}.png`)),
    ...encodedVariants.map((variant) => getImageProxyUrl(`https://images.financialmodelingprep.com/symbol/${variant}.png`)),
    ...encodedVariants.map((variant) => getImageProxyUrl(`https://storage.googleapis.com/iex/api/logos/${variant}.png`)),
    ...encodedVariants.map((variant) => getImageProxyUrl(`https://eodhd.com/img/logos/US/${variant}.png`)),
    ...encodedVariants.map((variant) => getImageProxyUrl(`https://assets.parqet.com/logos/symbol/${variant}?format=png`))
  ].filter((url, index, list) => url && list.indexOf(url) === index);
};

const getDefaultCompanyLogoUrl = (symbol) => getCompanyLogoCandidates(symbol)[0] || null;

const getDisplayCompanyLogoUrl = (symbol, providerLogo = "") => {
  const cleanSymbol = String(symbol || "").trim().toUpperCase();
  if (!cleanSymbol) return "";
  return getDefaultCompanyLogoUrl(cleanSymbol) || providerLogo || "";
};

const getLogoFallbackText = (symbol) => {
  const cleanSymbol = String(symbol || "").trim().toUpperCase();
  if (!cleanSymbol) return "?";
  return cleanSymbol.length <= 4 ? cleanSymbol : cleanSymbol.slice(0, 1);
};

const getFmpMarketSymbolLogoUrl = (symbol) => {
  const cleanSymbol = String(symbol || "").trim().toUpperCase();
  return cleanSymbol
    ? getImageProxyUrl(`https://images.financialmodelingprep.com/symbol/${encodeURIComponent(cleanSymbol)}.png`)
    : "";
};

const getCryptoLogoCandidates = (symbol, providerLogo = "") => {
  const cleanSymbol = String(symbol || "").trim().toUpperCase();
  const fmpLogo = cleanSymbol
    ? `https://images.financialmodelingprep.com/symbol/${encodeURIComponent(cleanSymbol)}.png`
    : "";
  return [
    fmpLogo ? getImageProxyUrl(fmpLogo) : "",
    providerLogo ? getImageProxyUrl(providerLogo) : "",
    fmpLogo,
    providerLogo
  ].filter((url, index, list) => url && list.indexOf(url) === index);
};

const handleCryptoLogoError = (event, symbol) => {
  const image = event.currentTarget;
  const fallbackUrls = getCryptoLogoCandidates(symbol, image.dataset.providerLogo || "");
  const stage = Number(image.dataset.logoFallbackStage || 0);
  for (let index = stage; index < fallbackUrls.length; index += 1) {
    const nextUrl = fallbackUrls[index];
    if (nextUrl && nextUrl !== image.src) {
      image.dataset.logoFallbackStage = String(index + 1);
      image.src = nextUrl;
      return;
    }
  }
  image.closest(".has-logo")?.classList.remove("has-logo");
  image.style.display = "none";
};

const handleCompanyLogoLoad = (event) => {
  const image = event.currentTarget;
  image.classList.remove("company-logo-light-mark");
  if (!image.complete || !image.naturalWidth || !image.naturalHeight) return;

  try {
    const sampleSize = 24;
    const canvas = document.createElement("canvas");
    canvas.width = sampleSize;
    canvas.height = sampleSize;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;

    context.clearRect(0, 0, sampleSize, sampleSize);
    context.drawImage(image, 0, 0, sampleSize, sampleSize);
    const pixels = context.getImageData(0, 0, sampleSize, sampleSize).data;
    let visible = 0;
    let dark = 0;
    let colorful = 0;
    let redDominant = 0;
    let blueDominant = 0;
    let lumaTotal = 0;

    for (let index = 0; index < pixels.length; index += 4) {
      const alpha = pixels[index + 3];
      if (alpha < 32) continue;
      const red = pixels[index];
      const green = pixels[index + 1];
      const blue = pixels[index + 2];
      const luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
      const saturation = Math.max(red, green, blue) - Math.min(red, green, blue);
      visible += 1;
      lumaTotal += luma;
      if (luma < 82) dark += 1;
      if (saturation > 36) colorful += 1;
      if (red > green + 20 && red > blue + 20) redDominant += 1;
      if (blue > red + 20 && blue > green + 20) blueDominant += 1;
    }

    if (!visible) return;
    const visibleRatio = visible / (sampleSize * sampleSize);
    const averageLuma = lumaTotal / visible;
    const darkRatio = dark / visible;
    const colorfulRatio = colorful / visible;
    const redDominantRatio = redDominant / visible;
    const blueDominantRatio = blueDominant / visible;
    const isMonochromeDarkMark =
      visibleRatio > 0.035 &&
      visibleRatio < 0.72 &&
      averageLuma < 88 &&
      darkRatio > 0.62 &&
      colorfulRatio < 0.45;
    const isTransparentDarkBlueMark =
      visibleRatio > 0.035 &&
      visibleRatio < 0.72 &&
      averageLuma < 55 &&
      darkRatio > 0.72 &&
      blueDominantRatio > 0.55 &&
      redDominantRatio < 0.2;
    if (isMonochromeDarkMark || isTransparentDarkBlueMark) {
      image.classList.add("company-logo-light-mark");
    }
  } catch {
    // Cross-origin fallback images cannot always be sampled. Keep the original logo in that case.
  }
};

const handleCompanyLogoError = (event, symbol) => {
  const image = event.currentTarget;
  const fallbackUrls = getCompanyLogoCandidates(symbol, image.dataset.providerLogo || "");
  const stage = Number(image.dataset.logoFallbackStage || 0);

  for (let index = stage; index < fallbackUrls.length; index += 1) {
    const nextUrl = fallbackUrls[index];
    if (nextUrl && nextUrl !== image.src) {
      image.dataset.logoFallbackStage = String(index + 1);
      image.src = nextUrl;
      return;
    }
  }

  image.closest(".has-logo")?.classList.remove("has-logo");
  image.style.display = "none";
};

import "./App.css";

function StockDataLoading({ label = "Loading financial data..." }) {
  return (
    <div className="stock-data-loading" role="status">
      <span className="stock-data-loading-dot" />
      <span>{label}</span>
    </div>
  );
}

function ChartGrowthStrip({ label, rows }) {
  if (!rows?.length) return null;

  return (
    <div className="chart-growth-strip" aria-label={label}>
      <span className="chart-growth-title">{label}</span>
      <div className="chart-growth-items">
        {rows.map((row) => (
          <span className="chart-growth-pill" key={`${label}-${row.year}`}>
            <span>{row.year} vs {row.previousYear}</span>
            <strong className={
              !isNumber(row.growth)
                ? "chart-growth-neutral"
                : row.growth >= 0
                  ? "chart-growth-positive"
                  : "chart-growth-negative"
            }>
              {formatGrowthPercent(row.growth)}
            </strong>
          </span>
        ))}
      </div>
    </div>
  );
}

function DataMiniTable({ title, subtitle, columns, rows, emptyText, loading = false }) {
  return (
    <section className="data-mini-table-card">
      <div className="data-mini-table-heading">
        <h3>{title}</h3>
        {subtitle && <span>{subtitle}</span>}
      </div>
      {loading && !rows?.length ? (
        <div className="data-mini-table-loading" role="status">
          <span className="stock-data-loading-dot" />
          <strong>Loading latest data...</strong>
        </div>
      ) : rows?.length ? (
        <div className="data-mini-table-scroll">
          <table className="data-mini-table">
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column.key}>{column.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={`${title}-${rowIndex}`}>
                  {columns.map((column) => (
                    <td key={column.key} data-label={column.label}>
                      {column.render ? column.render(row) : row[column.key] || "N/A"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="data-mini-table-empty">{emptyText}</div>
      )}
    </section>
  );
}

const formatEpsBeatMissDate = (value) => {
  if (!value) return "";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString([], { month: "short", day: "2-digit" });
};

const formatEpsBeatMissLabel = (row) => {
  if (row?.label) return row.label;
  if (isNumber(row?.fiscalQuarter) && isNumber(row?.fiscalYear)) {
    return `Q${row.fiscalQuarter} FY${String(row.fiscalYear).slice(-2)}`;
  }
  return row?.period ? formatEpsBeatMissDate(row.period) : "Quarter";
};

const formatEpsBeatMissPrimaryLabel = (row) => {
  if (isGenericUpcomingEpsRow(row)) return "Next Quarter";
  if (isNumber(row?.fiscalQuarter) && isNumber(row?.fiscalYear)) {
    return `Q${row.fiscalQuarter} FY${String(row.fiscalYear).slice(-2)}`;
  }
  const label = String(row?.label || "").trim();
  if (label && label !== formatEpsBeatMissDate(row.period)) return label;
  return row?.period ? formatEpsBeatMissDate(row.period) : "Quarter";
};

const formatEpsBeatMissSecondaryLabel = (row) => {
  const dateLabel = formatEpsBeatMissDate(row?.period);
  if (!dateLabel || dateLabel === formatEpsBeatMissPrimaryLabel(row)) return "";
  return dateLabel;
};

const formatSignedEpsSurprise = (value) => {
  if (!isNumber(value)) return "-";
  const sign = value < 0 ? "-" : "+";
  return `${sign}$${Math.abs(value).toFixed(2)}`;
};

const parseEpsBeatMissFiscalLabel = (label = "") => {
  const text = String(label || "");
  const quarterMatch = text.match(/\bQ\s*([1-4])\b/i);
  const fiscalYearMatch = text.match(/\bFY\s*(\d{2,4})\b/i);
  const fiscalQuarter = quarterMatch ? Number(quarterMatch[1]) : null;
  let fiscalYear = fiscalYearMatch ? Number(fiscalYearMatch[1]) : null;
  if (fiscalYear !== null && fiscalYear < 100) fiscalYear += 2000;
  return {
    fiscalQuarter: Number.isFinite(fiscalQuarter) ? fiscalQuarter : null,
    fiscalYear: Number.isFinite(fiscalYear) ? fiscalYear : null
  };
};

const financialHistoryFiscalKey = (row = {}) => {
  const year = Number(row.fiscalYear || row.year);
  const quarterMatch = String(row.period || row.label || "").match(/\bQ\s*([1-4])\b/i);
  const quarter = quarterMatch ? Number(quarterMatch[1]) : Number(row.fiscalQuarter);
  return Number.isFinite(year) && Number.isFinite(quarter) ? `${year}:Q${quarter}` : null;
};

const isReportedEpsBeatMissRow = (row = {}) =>
  isNumber(row.actual) || isNumber(row.gaapActual);

const epsBeatMissDateKey = (value) => {
  const text = String(value || "");
  const match = text.match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
};

const isGenericUpcomingEpsRow = (row = {}) =>
  /next quarter|upcoming/i.test(`${row.label || ""} ${row.period || ""}`);

const epsBeatMissRowKey = (row = {}) =>
  epsBeatMissDateKey(row.period) ||
  financialHistoryFiscalKey(row) ||
  (row.label ? `label:${String(row.label).trim().toLowerCase()}` : null);

const epsBeatMissHasFiscalLabel = (label) =>
  /\bQ\s*[1-4]\b/i.test(String(label || "")) && /\bFY\s*\d{2,4}\b/i.test(String(label || ""));

const chooseEpsBeatMissLabel = (existing = "", incoming = "") => {
  const existingText = String(existing || "").trim();
  const incomingText = String(incoming || "").trim();
  if (!existingText) return incomingText;
  if (!incomingText) return existingText;
  if (epsBeatMissHasFiscalLabel(incomingText) && !epsBeatMissHasFiscalLabel(existingText)) return incomingText;
  if (isGenericUpcomingEpsRow({ label: incomingText }) && !isGenericUpcomingEpsRow({ label: existingText })) return incomingText;
  return existingText;
};

const hydrateEpsBeatMissRow = (row = {}) => {
  const fiscal = parseEpsBeatMissFiscalLabel(row.label || row.period);
  return {
    ...row,
    fiscalYear: firstNumber(row.fiscalYear) ?? fiscal.fiscalYear,
    fiscalQuarter: firstNumber(row.fiscalQuarter) ?? fiscal.fiscalQuarter,
    estimate: firstNumber(row.estimate),
    actual: firstNumber(row.actual),
    gaapActual: firstNumber(row.gaapActual),
    surprise: firstNumber(row.surprise),
    gaapSurprise: firstNumber(row.gaapSurprise),
    surprisePercent: firstNumber(row.surprisePercent)
  };
};

const sortEpsBeatMissRows = (rows = []) =>
  [...rows].sort((a, b) => {
    const periodA = String(a.period || "").startsWith("upcoming:") ? "9999-12-31" : String(a.period || "");
    const periodB = String(b.period || "").startsWith("upcoming:") ? "9999-12-31" : String(b.period || "");
    return periodA.localeCompare(periodB);
  });

const normalizeEpsBeatMissRows = (rows = []) => {
  const byKey = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const hydrated = hydrateEpsBeatMissRow(row);
    if (!isNumber(hydrated.estimate) && !isNumber(hydrated.actual) && !isNumber(hydrated.gaapActual)) return;
    const key = epsBeatMissRowKey(hydrated);
    if (!key) return;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, hydrated);
      return;
    }
    const merged = {
      ...existing,
      ...Object.fromEntries(
        Object.entries(hydrated).filter(([, value]) => value !== null && value !== undefined && value !== "")
      ),
      label: chooseEpsBeatMissLabel(existing.label, hydrated.label),
      period: existing.period || hydrated.period,
      estimate: isNumber(hydrated.estimate) ? hydrated.estimate : existing.estimate,
      actual: isNumber(hydrated.actual) ? hydrated.actual : existing.actual,
      gaapActual: isNumber(hydrated.gaapActual) ? hydrated.gaapActual : existing.gaapActual,
      surprise: isNumber(hydrated.surprise) ? hydrated.surprise : existing.surprise,
      gaapSurprise: isNumber(hydrated.gaapSurprise) ? hydrated.gaapSurprise : existing.gaapSurprise,
      surprisePercent: isNumber(hydrated.surprisePercent) ? hydrated.surprisePercent : existing.surprisePercent
    };
    byKey.set(key, merged);
  });

  const sortedRows = sortEpsBeatMissRows([...byKey.values()]);
  const reportedRows = sortedRows.filter(isReportedEpsBeatMissRow);
  const upcomingRows = sortedRows.filter((row) => !isReportedEpsBeatMissRow(row));
  const bestUpcomingRow = upcomingRows.find((row) => epsBeatMissDateKey(row.period)) || upcomingRows.at(-1);
  return bestUpcomingRow
    ? [...reportedRows.slice(-4), bestUpcomingRow]
    : reportedRows.slice(-5);
};

const mergeUpcomingEpsBeatMissEstimate = (rows = [], nextQuarter = {}) => {
  const estimate = firstNumber(nextQuarter?.eps);
  const baseRows = normalizeEpsBeatMissRows(rows);
  if (!isNumber(estimate)) return baseRows;

  const label = nextQuarter?.fiscalQuarter || "Next Quarter";
  const fiscal = parseEpsBeatMissFiscalLabel(label);
  const upcomingRow = {
    period: nextQuarter?.date || `upcoming:${label}`,
    fiscalYear: fiscal.fiscalYear,
    fiscalQuarter: fiscal.fiscalQuarter,
    label,
    estimate,
    actual: null,
    gaapActual: null,
    surprise: null,
    gaapSurprise: null,
    surprisePercent: null,
    source: nextQuarter?.source || "Earnings calendar"
  };
  const upcomingKey = epsBeatMissRowKey(upcomingRow);
  const upcomingDateKey = epsBeatMissDateKey(nextQuarter?.date);
  const merged = [...baseRows];
  const reportedDuplicateIndex = merged.findIndex((row) => {
    if (!isReportedEpsBeatMissRow(row)) return false;
    const rowKey = epsBeatMissRowKey(row);
    const rowDateKey = epsBeatMissDateKey(row.period);
    return (
      (upcomingKey && rowKey === upcomingKey) ||
      (upcomingDateKey && rowDateKey === upcomingDateKey)
    );
  });
  if (reportedDuplicateIndex >= 0) {
    merged[reportedDuplicateIndex] = {
      ...merged[reportedDuplicateIndex],
      estimate: isNumber(merged[reportedDuplicateIndex].estimate)
        ? merged[reportedDuplicateIndex].estimate
        : estimate
    };
    return normalizeEpsBeatMissRows(merged);
  }

  const latestReportedDate = merged
    .filter(isReportedEpsBeatMissRow)
    .map((row) => epsBeatMissDateKey(row.period))
    .filter(Boolean)
    .sort()
    .at(-1);
  if (upcomingDateKey && latestReportedDate && upcomingDateKey <= latestReportedDate) {
    return normalizeEpsBeatMissRows(merged);
  }

  const existingIndex = merged.findIndex((row) => {
    if (isReportedEpsBeatMissRow(row)) return false;
    const rowKey = epsBeatMissRowKey(row);
    const rowDateKey = epsBeatMissDateKey(row.period);
    const rowEstimate = firstNumber(row.estimate);
    const sameFiscalKey = upcomingKey && rowKey === upcomingKey;
    const sameDate = upcomingDateKey && rowDateKey === upcomingDateKey;
    const sameGenericEstimate =
      isNumber(rowEstimate) &&
      Math.abs(rowEstimate - estimate) < 0.0001 &&
      (isGenericUpcomingEpsRow(row) || isGenericUpcomingEpsRow(upcomingRow));
    return sameFiscalKey || sameDate || sameGenericEstimate;
  });

  if (existingIndex >= 0) {
    merged[existingIndex] = {
      ...merged[existingIndex],
      ...upcomingRow,
      label: label || merged[existingIndex].label || "Next Quarter"
    };
  } else {
    merged.push(upcomingRow);
  }

  return normalizeEpsBeatMissRows(merged);
};

function EpsBeatMissChart({ rows = [] }) {
  const [selectedIndex, setSelectedIndex] = useState(null);
  const activeOption = EPS_BEAT_MISS_OPTIONS[0];
  const actualForRow = (row) => firstNumber(row?.actual);
  const estimateForRow = (row) => firstNumber(row?.estimate);
  const surpriseForRow = (row, actualValue, estimateValue) =>
    isNumber(row?.surprise)
      ? row.surprise
      : isNumber(actualValue) && isNumber(estimateValue)
        ? actualValue - estimateValue
        : null;
  const chartRows = normalizeEpsBeatMissRows(rows)
    .map((row) => {
      const actualValue = actualForRow(row);
      const estimateValue = estimateForRow(row);
      return {
        ...row,
        displayEstimate: estimateValue,
        displayActual: actualValue,
        displaySurprise: surpriseForRow(row, actualValue, estimateValue)
      };
    })
    .filter((row) => isNumber(row?.displayEstimate) || isNumber(row?.displayActual))
    .slice(-5);
  if (!chartRows.length) return null;
  const surpriseValueFor = (row) =>
    isNumber(row.displaySurprise) ? row.displaySurprise : null;

  const values = chartRows
    .flatMap((row) => [row.displayEstimate, row.displayActual])
    .filter(isNumber);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = Math.max((max - min) * 0.22, 0.12);
  const yMin = min - padding;
  const yMax = max + padding;
  const yFor = (value) => {
    if (!isNumber(value) || yMax === yMin) return 28;
    return 50 - ((value - yMin) / (yMax - yMin)) * 42;
  };
  const xFor = (index) =>
    chartRows.length === 1 ? 50 : 8 + (index / (chartRows.length - 1)) * 84;
  const referenceEstimate = chartRows.at(-1)?.displayEstimate;
  const selectedRow = chartRows[selectedIndex] || null;
  const selectedSurprise = selectedRow ? surpriseValueFor(selectedRow) : null;

  return (
    <div className="eps-beat-miss-card">
      <div className="eps-beat-miss-header">
        <div>
          <h3>EPS Beat / Miss</h3>
          <span>
            {formatEpsBeatMissPrimaryLabel(chartRows.at(-1))} estimate {formatEstimateEps(referenceEstimate)}
          </span>
        </div>
        <span className="eps-beat-miss-mode">{activeOption.label}</span>
      </div>

      <svg className="eps-beat-miss-plot" viewBox="0 0 100 62" role="img" aria-label={`${activeOption.label} beat miss chart`}>
        {[0, 1, 2, 3].map((line) => {
          const y = 10 + line * 12;
          return <line key={line} x1="3" x2="97" y1={y} y2={y} className="eps-beat-miss-grid" />;
        })}
        {isNumber(referenceEstimate) && (
          <line x1="3" x2="97" y1={yFor(referenceEstimate)} y2={yFor(referenceEstimate)} className="eps-beat-miss-reference" />
        )}
        {chartRows.map((row, index) => {
          const x = xFor(index);
          const estimateY = yFor(row.displayEstimate);
          const actualValue = row.displayActual;
          const actualY = yFor(actualValue);
          const surprise = surpriseValueFor(row);
          const missed = isNumber(surprise) ? surprise < 0 : false;
          const isSelected = selectedIndex === index;
          return (
            <g key={`${row.period || index}-${index}`}>
              {isNumber(row.displayEstimate) && (
                <circle
                  cx={x}
                  cy={estimateY}
                  r="1.65"
                  className="eps-estimate-dot"
                  role="button"
                  tabIndex="0"
                  aria-label={`${formatEpsBeatMissPrimaryLabel(row)} EPS estimate ${formatEstimateEps(row.displayEstimate)}`}
                  onClick={() => setSelectedIndex(index)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") setSelectedIndex(index);
                  }}
                />
              )}
              {isSelected && isNumber(actualValue) && (
                <circle cx={x} cy={actualY} r="2.7" className="eps-selected-ring" />
              )}
              {isNumber(actualValue) && (
                <circle
                  cx={x}
                  cy={actualY}
                  r="1.95"
                  className={missed ? "eps-miss-dot" : "eps-beat-dot"}
                  role="button"
                  tabIndex="0"
                  aria-label={`${formatEpsBeatMissPrimaryLabel(row)} actual EPS ${formatEstimateEps(actualValue)}`}
                  onClick={() => setSelectedIndex(index)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") setSelectedIndex(index);
                  }}
                />
              )}
            </g>
          );
        })}
      </svg>

      <div
        className="eps-beat-miss-labels"
        style={{ gridTemplateColumns: `repeat(${chartRows.length}, minmax(0, 1fr))` }}
      >
        {chartRows.map((row, index) => {
          const surprise = surpriseValueFor(row);
          const isMiss = isNumber(surprise) && surprise < 0;
          const secondaryLabel = formatEpsBeatMissSecondaryLabel(row);
          return (
            <div key={`${row.period || index}-label`} className="eps-beat-miss-label">
              <span>{formatEpsBeatMissPrimaryLabel(row)}</span>
              {isNumber(surprise) ? (
                <strong className={isMiss ? "miss" : "beat"}>
                  {isMiss ? "Missed" : "Beat"} {formatSignedEpsSurprise(surprise)}
                </strong>
              ) : (
                <strong className="upcoming">-</strong>
              )}
              {secondaryLabel && <small>{secondaryLabel}</small>}
            </div>
          );
        })}
      </div>
      {selectedRow && (
        <div className="eps-beat-miss-detail">
          <strong>{formatEpsBeatMissPrimaryLabel(selectedRow)}</strong>
          <span>Actual {isNumber(selectedRow.displayActual) ? formatEstimateEps(selectedRow.displayActual) : "N/A"}</span>
          <span>Estimate {isNumber(selectedRow.displayEstimate) ? formatEstimateEps(selectedRow.displayEstimate) : "N/A"}</span>
          <span className={isNumber(selectedSurprise) && selectedSurprise < 0 ? "miss" : "beat"}>
            {isNumber(selectedSurprise)
              ? `${selectedSurprise < 0 ? "Miss" : "Beat"} ${formatSignedEpsSurprise(selectedSurprise)}`
              : "Upcoming"}
          </span>
        </div>
      )}
    </div>
  );
}

function HistoricalLineChart({
  title,
  data,
  dataKey,
  color,
  formatter,
  valueLabel,
  symbol,
  loading = false,
  mode = "annual"
}) {
  const periodLabel = mode === "quarterly" ? "quarterly" : "annual";
  return (
    <section className="historical-chart-panel">
      <h3>{title}</h3>
      <div className="historical-chart-canvas">
        {loading ? (
          <StockDataLoading label={`Loading ${periodLabel} history...`} />
        ) : data.length ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart
              data={data}
              margin={{ top: 12, right: 18, left: 6, bottom: 4 }}
            >
              <CartesianGrid stroke="#273244" />
              <XAxis dataKey="period" />
              <YAxis tickFormatter={formatter} width={58} />
              <Tooltip
                content={(
                  <OverviewChartTooltip
                    formatter={formatter}
                    valueLabel={valueLabel}
                    symbol={symbol}
                    color={color}
                  />
                )}
              />
              <Line
                type="monotone"
                dataKey={dataKey}
                stroke={color}
                strokeWidth={3}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="historical-chart-empty">No {periodLabel} history available.</div>
        )}
      </div>
    </section>
  );
}

function App() {
  const latestStockRequest = useRef(0);
  const stockRetryTimerRef = useRef(null);
  const stockMemoryCacheRef = useRef(new Map());
  const stockChartMemoryCacheRef = useRef(new Map());
  const stockSidecarRequestRef = useRef("");
  const stockOverviewExtrasRequestRef = useRef("");
  const stockSearchBlurTimerRef = useRef(null);
  const latestComparisonRequest = useRef(0);
  const latestAiRequest = useRef(0);
  const latestEarningsCallRequest = useRef(0);
  const liveEarningsHydratedRef = useRef("");
  const initialSavedPricesLoaded = useRef(false);
  const firstStockLoadSettled = useRef(false);
  const previousMarketEventRef = useRef(null);
  const firedMarketEventsRef = useRef(new Set());
  const speechQueueRef = useRef([]);
  const speechIndexRef = useRef(0);
  const speechUtteranceRef = useRef(null);
  const initialSavedListsRef = useRef(null);
  const initialSavedUserRef = useRef(null);
  const initialSavedQuotesRef = useRef(null);
  if (!initialSavedListsRef.current) initialSavedListsRef.current = readSavedListsSnapshot();
  if (!initialSavedUserRef.current) initialSavedUserRef.current = readSavedUserSnapshot();
  if (!initialSavedQuotesRef.current) initialSavedQuotesRef.current = readSavedQuoteSnapshot();
  const [showAuth, setShowAuth] = useState(false);
  const [authPrompt, setAuthPrompt] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  const [marketEventToast, setMarketEventToast] = useState(null);
  const googleButtonRef = useRef(null);
  const [isGoogleButtonReady, setIsGoogleButtonReady] = useState(false);
const [isLogin, setIsLogin] = useState(true);

const [username, setUsername] = useState("");

const [email, setEmail] = useState("");

const [password, setPassword] = useState("");
const [resetPassword, setResetPassword] = useState("");
const [isRecoveringPassword, setIsRecoveringPassword] = useState(false);
const [passwordResetToken, setPasswordResetToken] = useState("");
const [acceptedPolicies, setAcceptedPolicies] = useState(false);
const [activePolicyKey, setActivePolicyKey] = useState(null);
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

const handleSignOut = () => {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  setUser(null);
  setHasLoadedRemoteUserData(false);
  setWatchlist([]);
  setPortfolios([DEFAULT_PORTFOLIO]);
  setActivePortfolioId(DEFAULT_PORTFOLIO.id);
  setNamedWatchlists([]);
  setSavedProjections({});
  setAuthPrompt("");
  setAuthMessage("");
  setShowAuth(false);
};

const requireAuth = (message = "Log in or sign up to save this.") => {
  if (user) return true;
  setAuthPrompt(message);
  setAuthMessage("");
  setIsLogin(true);
  setIsRecoveringPassword(false);
  setShowAuth(true);
  return false;
};

const completeAuth = async (data, successMessage) => {
  if (data.user) {
    setHasLoadedRemoteUserData(false);
    setUser(data.user);
    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));
  }

  setShowAuth(false);
  setAuthPrompt("");
  setAuthMessage("");
  setIsRecoveringPassword(false);
  setPasswordResetToken("");
  setPassword("");
  setResetPassword("");
  setAcceptedPolicies(false);

  alert(successMessage);
  await loadUserData();
};

const handleAuth = async () => {

  try {
    if (!isLogin && !acceptedPolicies) {
      setAuthMessage("Please agree to the Terms, Privacy Policy, Cookie Policy, and Disclaimer before creating an account.");
      return;
    }

    setIsAuthSubmitting(true);

    const endpoint = isLogin
      ? `${API_URL}/api/login`
      : `${API_URL}/api/signup`;

    const body = isLogin
      ? {
          email,
          password,
        }
      : {
          username,
          email,
          password,
          acceptedPolicies,
          policyVersion: CURRENT_POLICY_VERSION,
        };

    const response = await axios.post(
      endpoint,
      body
    );

    await completeAuth(
      response.data,
      isLogin
        ? "Login successful"
        : "Account created"
    );

  } catch (err) {

    console.error(err);

    alert(
      err.response?.data?.error ||
      "Authentication failed"
    );
  } finally {
    setIsAuthSubmitting(false);
  }
};

const handleGoogleCredential = async (credential) => {
  try {
    if (!isLogin && !acceptedPolicies) {
      setAuthMessage("Please agree to the MrktRally policies before signing up with Google.");
      return;
    }

    setIsAuthSubmitting(true);
    const response = await axios.post(`${API_URL}/api/google-login`, {
      credential,
      acceptedPolicies,
      policyVersion: CURRENT_POLICY_VERSION,
      mode: isLogin ? "login" : "signup"
    });
    await completeAuth(response.data, "Google sign-in successful");
  } catch (err) {
    console.error(err);
    const errorData = err.response?.data || {};
    if (errorData.needsSignup) {
      setIsLogin(false);
      setAcceptedPolicies(false);
      setAuthMessage(errorData.error || "No account found. Please create an account first.");
      return;
    }
    alert(errorData.error || "Google sign-in failed");
  } finally {
    setIsAuthSubmitting(false);
  }
};

const handleForgotPassword = async () => {
  try {
    setIsAuthSubmitting(true);
    setAuthMessage("Sending reset link...");
    const response = await axios.post(`${API_URL}/api/forgot-password`, {
      email
    }, {
      timeout: 15000
    });
    setAuthMessage(
      response.data.resetLink
        ? `Reset link created: ${response.data.resetLink}`
        : response.data.emailFailureHint
          ? response.data.emailFailureHint
        : response.data.emailError
          ? response.data.emailError
        : response.data.emailSent === false
          ? "Password reset email is not configured yet. Add Resend or SMTP settings in Render, then try again."
        : response.data.message || "If that email is on MrktRally, a reset link will be sent."
    );
  } catch (err) {
    console.error(err);
    setAuthMessage(
      err.code === "ECONNABORTED"
        ? "Password reset request timed out. Check the email sender settings in Render, then try again."
        : err.response?.data?.error || "Password reset request failed"
    );
  } finally {
    setIsAuthSubmitting(false);
  }
};

const handleResetPassword = async () => {
  try {
    setIsAuthSubmitting(true);
    const response = await axios.post(`${API_URL}/api/reset-password`, {
      email,
      token: passwordResetToken,
      password: resetPassword
    });
    await completeAuth(response.data, "Password reset successful");
  } catch (err) {
    console.error(err);
    alert(err.response?.data?.error || "Password reset failed");
  } finally {
    setIsAuthSubmitting(false);
  }
};

useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("resetToken");
  const resetEmail = params.get("email");
  if (!token) return;

  setPasswordResetToken(token);
  setEmail(resetEmail || "");
  setIsLogin(true);
  setIsRecoveringPassword(true);
  setShowAuth(true);
  setAuthPrompt("Enter a new password to finish recovering your account.");
  setAuthMessage("");

  params.delete("resetToken");
  params.delete("email");
  const nextQuery = params.toString();
  window.history.replaceState(
    {},
    "",
    `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}${window.location.hash}`
  );
}, []);

useEffect(() => {
  const controller = new AbortController();
  const warmupTimer = window.setTimeout(() => {
    axios.get(`${API_URL}/api/warmup`, {
      params: { source: "client" },
      signal: controller.signal,
      timeout: 3500
    }).catch(() => {});
  }, 500);

  return () => {
    window.clearTimeout(warmupTimer);
    controller.abort();
  };
}, []);

useEffect(() => {
  if (!GOOGLE_CLIENT_ID) return;
  if (window.google?.accounts?.id) return;
  if (document.querySelector("script[src='https://accounts.google.com/gsi/client']")) return;

  const script = document.createElement("script");
  script.src = "https://accounts.google.com/gsi/client";
  script.async = true;
  script.defer = true;
  document.body.appendChild(script);
}, [GOOGLE_CLIENT_ID]);

useEffect(() => {
  if (!showAuth || isRecoveringPassword || !GOOGLE_CLIENT_ID || !googleButtonRef.current) return;
  setIsGoogleButtonReady(false);

  const renderGoogleButton = () => {
    if (!window.google?.accounts?.id || !googleButtonRef.current) return;
    googleButtonRef.current.innerHTML = "";
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: (response) => handleGoogleCredential(response.credential)
    });
    window.google.accounts.id.renderButton(googleButtonRef.current, {
      theme: "filled_black",
      size: "large",
      type: "standard",
      shape: "rectangular",
      width: 330,
      text: "continue_with"
    });
    setIsGoogleButtonReady(true);
  };

  if (window.google?.accounts?.id) {
    renderGoogleButton();
    return;
  }

  const existingScript = document.querySelector("script[src='https://accounts.google.com/gsi/client']");
  if (existingScript) {
    existingScript.addEventListener("load", renderGoogleButton, { once: true });
    return;
  }

  const script = document.createElement("script");
  script.src = "https://accounts.google.com/gsi/client";
  script.async = true;
  script.defer = true;
  script.addEventListener("load", renderGoogleButton, { once: true });
  document.body.appendChild(script);
}, [showAuth, isLogin, isRecoveringPassword, GOOGLE_CLIENT_ID, acceptedPolicies]);




const [user, setUser] =
  useState(() => initialSavedUserRef.current);
const [hasLoadedSavedLists, setHasLoadedSavedLists] =
  useState(true);
const [hasLoadedRemoteUserData, setHasLoadedRemoteUserData] =
  useState(false);
const [hasMeaningfulSavedLists, setHasMeaningfulSavedLists] =
  useState(() => {
    const savedLists = initialSavedListsRef.current;
    return Boolean(
      savedLists.watchlist.length ||
      hasPortfolioPositions(savedLists.portfolios) ||
      savedLists.namedWatchlists.some((list) => (list.symbols || []).length) ||
      Object.keys(savedLists.projections || {}).length ||
      savedLists.profileSettings.watchlistTapeMoves
    );
  });
  useEffect(() => {

  if (initialSavedUserRef.current) {
    loadUserData();
  }

}, []);

  const [ticker, setTicker] =
  useState("NVDA");

  const [searchInput, setSearchInput] =
    useState("NVDA");
  const [stockSearchSuggestions, setStockSearchSuggestions] =
    useState([]);
  const [isStockSearchSuggesting, setIsStockSearchSuggesting] =
    useState(false);
  const [showStockSearchSuggestions, setShowStockSearchSuggestions] =
    useState(false);
  const [activePage, setActivePage] =
    useState("home");
  const [savedProjections, setSavedProjections] =
    useState(() => initialSavedListsRef.current.projections);

  let [stockData, setStockData] =
    useState(null);
  const loadedStockSymbol = stockData?.symbol || null;
  const [stockOverviewExtrasExhaustedSymbol, setStockOverviewExtrasExhaustedSymbol] =
    useState("");

  const [isStockLoading, setIsStockLoading] =
    useState(false);

  const [stockChartRange, setStockChartRange] =
    useState("1D");

  const [financialChartMode, setFinancialChartMode] =
    useState("annual");

  const [financialChartRange, setFinancialChartRange] =
    useState("5");

  const [epsChartShareBasis, setEpsChartShareBasis] =
    useState("diluted");

  const [stockChartData, setStockChartData] =
    useState([]);

  const [stockChartMeta, setStockChartMeta] =
    useState(null);

  const [isStockChartLoading, setIsStockChartLoading] =
    useState(false);

  const [stockChartError, setStockChartError] =
    useState("");

  const [aiAnalysis, setAiAnalysis] =
    useState(null);

  const [isAiLoading, setIsAiLoading] =
    useState(false);

  const [mrRallyMessages, setMrRallyMessages] =
    useState([
      {
        role: "assistant",
        content: "Ask me about a stock, valuation, earnings, estimates, margins, or risks. I’ll start with MrktRally’s data and look outside only when we don’t have enough."
      }
    ]);

  const [mrRallyInput, setMrRallyInput] =
    useState("");

  const [isMrRallyLoading, setIsMrRallyLoading] =
    useState(false);

  const [earningsCall, setEarningsCall] =
    useState(null);

  const [companyDocuments, setCompanyDocuments] =
    useState(null);

  const [activeCompanyDocumentTab, setActiveCompanyDocumentTab] =
    useState("results");

  const [isCompanyDocumentsLoading, setIsCompanyDocumentsLoading] =
    useState(false);

  const [selectedTranscriptPeriod, setSelectedTranscriptPeriod] =
    useState("");

  const [transcriptPeriodOptions, setTranscriptPeriodOptions] =
    useState([]);

  const [isTranscriptPeriodsLoading, setIsTranscriptPeriodsLoading] =
    useState(false);

  const [isEarningsCallLoading, setIsEarningsCallLoading] =
    useState(false);

  const [isSpeechPlaying, setIsSpeechPlaying] =
    useState(false);

  const [isSpeechPaused, setIsSpeechPaused] =
    useState(false);

  const [speechRate, setSpeechRate] =
    useState(1);

  const [speechError, setSpeechError] =
    useState("");

   const [watchlist, setWatchlist] =
  useState(() => initialSavedListsRef.current.watchlist);

  const [watchlistTapeMoves, setWatchlistTapeMoves] =
  useState(() => {
    const savedValue = initialSavedListsRef.current.profileSettings.watchlistTapeMoves;
    return typeof savedValue === "boolean"
      ? savedValue
      : localStorage.getItem("mrktrallyWatchlistTapeMoves") === "true";
  });

  const [newTicker, setNewTicker] =
  useState("");

  const [namedWatchlists, setNamedWatchlists] =
  useState(() => initialSavedListsRef.current.namedWatchlists);

  const [newWatchlistName, setNewWatchlistName] =
  useState("");

  const [namedTickerInputs, setNamedTickerInputs] =
  useState({});

  const [portfolios, setPortfolios] =
  useState(() => initialSavedListsRef.current.portfolios);

  const [activePortfolioId, setActivePortfolioId] =
  useState(() => initialSavedListsRef.current.activePortfolioId);

  const [newPortfolioName, setNewPortfolioName] =
  useState("");

  const activePortfolio = portfolios.find(
    (item) => item.id === activePortfolioId
  ) || portfolios[0] || DEFAULT_PORTFOLIO;

  const portfolio = activePortfolio.positions || [];
  const portfolioCash = Number.isFinite(Number(activePortfolio.cash))
    ? Math.max(0, Number(activePortfolio.cash))
    : 0;

  const setPortfolio = (nextPositions) => {
    setPortfolios((items) => items.map((item) => {
      if (item.id !== activePortfolio.id) return item;
      const positions = typeof nextPositions === "function"
        ? nextPositions(item.positions || [])
        : nextPositions;
      return { ...item, positions };
    }));
  };

  const updatePortfolioPosition = (positionIndex, field, value) => {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) return;

    setPortfolio((positions) =>
      positions.map((position, index) =>
        index === positionIndex
          ? { ...position, [field]: number }
          : position
      )
    );
  };

  const updateActivePortfolioCash = (value) => {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) return;
    setPortfolios((items) => items.map((item) =>
      item.id === activePortfolio.id
        ? { ...item, cash: number }
        : item
    ));
  };

  const removePortfolioPosition = (positionId, fallbackIndex) => {
    setPortfolio((positions) =>
      positions.filter((position, index) =>
        positionId ? position.id !== positionId : index !== fallbackIndex
      )
    );
  };

  const [portfolioPrices, setPortfolioPrices] =
    useState(() => initialSavedQuotesRef.current.prices);

  const [savedSymbolDetails, setSavedSymbolDetails] =
    useState(() => initialSavedQuotesRef.current.details);

  const [marketIndices, setMarketIndices] =
    useState(() => {
      try {
        const cached = JSON.parse(localStorage.getItem(MARKET_INDICES_STORAGE_KEY) || "[]");
        return Array.isArray(cached) ? cached : [];
      } catch {
        return [];
      }
    });

  const [isMarketLoading, setIsMarketLoading] =
    useState(() => !marketIndices.length);

  const [broadMarketMovers, setBroadMarketMovers] =
    useState({ gainers: [], losers: [], updatedAt: null });

  const [isBroadMarketMoversLoading, setIsBroadMarketMoversLoading] =
    useState(false);

  const [topTradedStocks, setTopTradedStocks] =
    useState({ stocks: [], updatedAt: null });

  const [isTopTradedStocksLoading, setIsTopTradedStocksLoading] =
    useState(false);

  const [etfSearchInput, setEtfSearchInput] =
    useState("SPY");
  const [etfSearchSuggestions, setEtfSearchSuggestions] =
    useState([]);
  const [isEtfSearchSuggesting, setIsEtfSearchSuggesting] =
    useState(false);
  const [showEtfSearchSuggestions, setShowEtfSearchSuggestions] =
    useState(false);

  const [etfTicker, setEtfTicker] =
    useState("SPY");

  const [etfData, setEtfData] =
    useState(null);

  const [isEtfLoading, setIsEtfLoading] =
    useState(false);

  const [etfError, setEtfError] =
    useState("");

  const [etfChartRange, setEtfChartRange] =
    useState("1Y");

  const [etfChartData, setEtfChartData] =
    useState({ points: [], latest: null });

  const [isEtfChartLoading, setIsEtfChartLoading] =
    useState(false);

  const [etfChartError, setEtfChartError] =
    useState("");

  const [cryptoSearchInput, setCryptoSearchInput] =
    useState("BTCUSD");

  const [cryptoSearchSuggestions, setCryptoSearchSuggestions] =
    useState([]);

  const [isCryptoSearchSuggesting, setIsCryptoSearchSuggesting] =
    useState(false);

  const [showCryptoSearchSuggestions, setShowCryptoSearchSuggestions] =
    useState(false);

  const [cryptoSymbol, setCryptoSymbol] =
    useState("BTCUSD");

  const [cryptoData, setCryptoData] =
    useState(null);

  const [isCryptoLoading, setIsCryptoLoading] =
    useState(false);

  const [cryptoError, setCryptoError] =
    useState("");

  const [cryptoChartRange, setCryptoChartRange] =
    useState("1D");

  const [cryptoChartData, setCryptoChartData] =
    useState({ points: [], latest: null });

  const [isCryptoChartLoading, setIsCryptoChartLoading] =
    useState(false);

  const [cryptoChartError, setCryptoChartError] =
    useState("");

  const [forexSearchInput, setForexSearchInput] =
    useState("EURUSD");

  const [forexSearchSuggestions, setForexSearchSuggestions] =
    useState([]);

  const [isForexSearchSuggesting, setIsForexSearchSuggesting] =
    useState(false);

  const [showForexSearchSuggestions, setShowForexSearchSuggestions] =
    useState(false);

  const [forexSymbol, setForexSymbol] =
    useState("EURUSD");

  const [forexData, setForexData] =
    useState(null);

  const [isForexLoading, setIsForexLoading] =
    useState(false);

  const [forexError, setForexError] =
    useState("");

  const [forexChartRange, setForexChartRange] =
    useState("1D");

  const [forexChartData, setForexChartData] =
    useState({ points: [], latest: null });

  const [isForexChartLoading, setIsForexChartLoading] =
    useState(false);

  const [forexChartError, setForexChartError] =
    useState("");

  const [commoditySearchInput, setCommoditySearchInput] =
    useState("GCUSD");

  const [commoditySymbol, setCommoditySymbol] =
    useState("GCUSD");

  const [commodityData, setCommodityData] =
    useState(null);

  const [isCommodityLoading, setIsCommodityLoading] =
    useState(false);

  const [commodityError, setCommodityError] =
    useState("");

  const [commodityChartRange, setCommodityChartRange] =
    useState("1Y");

  const [commodityChartData, setCommodityChartData] =
    useState({ points: [], latest: null });

  const [isCommodityChartLoading, setIsCommodityChartLoading] =
    useState(false);

  const [commodityChartError, setCommodityChartError] =
    useState("");

  const [screenerFilters, setScreenerFilters] =
    useState(DEFAULT_SCREENER_FILTERS);

  const [appliedScreenerFilters, setAppliedScreenerFilters] =
    useState(DEFAULT_SCREENER_FILTERS);

  const [screenerResults, setScreenerResults] =
    useState([]);

  const [isScreenerLoading, setIsScreenerLoading] =
    useState(false);

  const [screenerError, setScreenerError] =
    useState("");

  const [screenerUpdatedAt, setScreenerUpdatedAt] =
    useState(null);

  const [screenerOptions, setScreenerOptions] =
    useState({ sectors: [], industries: [], exchanges: [], countries: [] });

  const [financialStatementInput, setFinancialStatementInput] =
    useState("NVDA");

  const [financialStatementTicker, setFinancialStatementTicker] =
    useState("NVDA");

  const [financialStatementType, setFinancialStatementType] =
    useState("income");

  const [financialStatementPeriod, setFinancialStatementPeriod] =
    useState("annual");

  const [financialStatementRange, setFinancialStatementRange] =
    useState("5");

  const [financialStatementData, setFinancialStatementData] =
    useState(null);

  const [isFinancialStatementLoading, setIsFinancialStatementLoading] =
    useState(false);

  const [financialStatementError, setFinancialStatementError] =
    useState("");

  const [fundamentalChartInput, setFundamentalChartInput] =
    useState("NVDA");

  const [fundamentalChartTickers, setFundamentalChartTickers] =
    useState(["NVDA"]);

  const [fundamentalChartPeriod, setFundamentalChartPeriod] =
    useState("annual");

  const [fundamentalChartRange, setFundamentalChartRange] =
    useState("5");

  const [selectedFundamentalIndicators, setSelectedFundamentalIndicators] =
    useState(DEFAULT_FUNDAMENTAL_INDICATORS);

  const [fundamentalMetricSearch, setFundamentalMetricSearch] =
    useState("");

  const [isFundamentalFocusMode, setIsFundamentalFocusMode] =
    useState(false);

  const [activeFundamentalIndicatorGroup, setActiveFundamentalIndicatorGroup] =
    useState("income");

  const [fundamentalChartData, setFundamentalChartData] =
    useState(null);

  const [fundamentalHoveredPoint, setFundamentalHoveredPoint] =
    useState(null);

  const [maximizedFundamentalChartKey, setMaximizedFundamentalChartKey] =
    useState("");

  const [isFundamentalChartLoading, setIsFundamentalChartLoading] =
    useState(false);

  const [fundamentalChartError, setFundamentalChartError] =
    useState("");

  const [marketClockNow, setMarketClockNow] =
    useState(() => new Date());

  const [portfolioTicker, setPortfolioTicker] =
    useState("");

  const [portfolioShares, setPortfolioShares] =
    useState("");

  const [portfolioCost, setPortfolioCost] =
    useState("");

  const [earnings, setEarnings] =
  useState({ days: [] });

  const [calendarDataCache, setCalendarDataCache] =
    useState({});

  const [isEarningsLoading, setIsEarningsLoading] =
  useState(false);

  const [calendarMode, setCalendarMode] =
    useState("earnings");

  const [selectedCalendarEvent, setSelectedCalendarEvent] =
    useState(null);

  const [calendarSearchInput, setCalendarSearchInput] =
    useState("");

  const [calendarSearchSuggestions, setCalendarSearchSuggestions] =
    useState([]);

  const [isCalendarSearchSuggesting, setIsCalendarSearchSuggesting] =
    useState(false);

  const [showCalendarSearchSuggestions, setShowCalendarSearchSuggestions] =
    useState(false);

  const [calendarEarningsReports, setCalendarEarningsReports] =
    useState({});

  const [loadingCalendarReportSymbol, setLoadingCalendarReportSymbol] =
    useState("");

  const [selectedLiveEarningsEvent, setSelectedLiveEarningsEvent] =
    useState(null);

  const [liveEarningsResults, setLiveEarningsResults] =
    useState({});

  const [loadingLiveEarningsSymbol, setLoadingLiveEarningsSymbol] =
    useState("");

  const [earningsWeekStart, setEarningsWeekStart] =
  useState(() => getWeekStartIso());

  const [selectedEarningsDate, setSelectedEarningsDate] =
  useState(() => toLocalIsoDate(new Date()));

  const [treasuryRates, setTreasuryRates] =
    useState({ rows: [], latest: null });

  const [isTreasuryRatesLoading, setIsTreasuryRatesLoading] =
    useState(false);

  const [treasuryRatesError, setTreasuryRatesError] =
    useState("");

  const [generalNews, setGeneralNews] =
    useState({ articles: [] });

  const [isGeneralNewsLoading, setIsGeneralNewsLoading] =
    useState(false);

  const [generalNewsError, setGeneralNewsError] =
    useState("");

  const [stockNews, setStockNews] =
    useState({ articles: [] });

  const [isStockNewsLoading, setIsStockNewsLoading] =
    useState(false);

    const [compareTickers, setCompareTickers] =
  useState(["AAPL", "MSFT", "NVDA"]);

  const [compareData, setCompareData] =
    useState([]);

  const [similarCompanies, setSimilarCompanies] =
    useState([]);

  const [isSimilarCompaniesLoading, setIsSimilarCompaniesLoading] =
    useState(false);

useEffect(() => {
  const query = searchInput.trim();
  const canSuggest =
    ["overview", "projections"].includes(activePage) &&
    query.length >= 2;

  if (!canSuggest) {
    setStockSearchSuggestions([]);
    setIsStockSearchSuggesting(false);
    return undefined;
  }

  let isActive = true;
  const timer = window.setTimeout(async () => {
    try {
      setIsStockSearchSuggesting(true);
      const { data } = await axios.get(`${API_URL}/api/search-stocks`, {
        params: { q: query },
        timeout: 4500
      });
      if (!isActive) return;
      setStockSearchSuggestions(Array.isArray(data?.results) ? data.results : []);
    } catch (error) {
      if (isActive) setStockSearchSuggestions([]);
    } finally {
      if (isActive) setIsStockSearchSuggesting(false);
    }
  }, 180);

  return () => {
    isActive = false;
    window.clearTimeout(timer);
  };
}, [searchInput, activePage]);

useEffect(() => {
  const query = etfSearchInput.trim();
  const canSuggest = activePage === "etfs" && query.length >= 2;

  if (!canSuggest) {
    setEtfSearchSuggestions([]);
    setIsEtfSearchSuggesting(false);
    return undefined;
  }

  let isActive = true;
  const timer = window.setTimeout(async () => {
    try {
      setIsEtfSearchSuggesting(true);
      const { data } = await axios.get(`${API_URL}/api/search-stocks`, {
        params: { q: query, includeFunds: true, fundsOnly: true },
        timeout: 4500
      });
      if (!isActive) return;
      setEtfSearchSuggestions(Array.isArray(data?.results) ? data.results : []);
    } catch (error) {
      if (isActive) setEtfSearchSuggestions([]);
    } finally {
      if (isActive) setIsEtfSearchSuggesting(false);
    }
  }, 180);

  return () => {
    isActive = false;
    window.clearTimeout(timer);
  };
}, [etfSearchInput, activePage]);

useEffect(() => {
  const query = calendarSearchInput.trim();
  const canSuggest = activePage === "earnings-calendar" && calendarMode === "earnings" && query.length >= 2;

  if (!canSuggest) {
    setCalendarSearchSuggestions([]);
    setIsCalendarSearchSuggesting(false);
    return undefined;
  }

  let isActive = true;
  const timer = window.setTimeout(async () => {
    try {
      setIsCalendarSearchSuggesting(true);
      const { data } = await axios.get(`${API_URL}/api/search-stocks`, {
        params: { q: query },
        timeout: 4500
      });
      if (!isActive) return;
      setCalendarSearchSuggestions(Array.isArray(data?.results) ? data.results : []);
    } catch (error) {
      if (isActive) setCalendarSearchSuggestions([]);
    } finally {
      if (isActive) setIsCalendarSearchSuggesting(false);
    }
  }, 180);

  return () => {
    isActive = false;
    window.clearTimeout(timer);
  };
}, [calendarSearchInput, activePage, calendarMode]);

useEffect(() => {
  const query = cryptoSearchInput.trim();
  if (activePage !== "crypto" || query.length < 1) {
    setCryptoSearchSuggestions([]);
    setIsCryptoSearchSuggesting(false);
    return undefined;
  }

  let isActive = true;
  const timer = window.setTimeout(async () => {
    try {
      setIsCryptoSearchSuggesting(true);
      const { data } = await axios.get(`${API_URL}/api/crypto-search`, {
        params: { q: query },
        timeout: 4500
      });
      if (!isActive) return;
      setCryptoSearchSuggestions(Array.isArray(data?.results) ? data.results : []);
    } catch (error) {
      if (isActive) setCryptoSearchSuggestions([]);
    } finally {
      if (isActive) setIsCryptoSearchSuggesting(false);
    }
  }, 160);

  return () => {
    isActive = false;
    window.clearTimeout(timer);
  };
}, [cryptoSearchInput, activePage]);

useEffect(() => {
  const query = forexSearchInput.trim();
  if (activePage !== "forex" || query.length < 1) {
    setForexSearchSuggestions([]);
    setIsForexSearchSuggesting(false);
    return undefined;
  }

  let isActive = true;
  const timer = window.setTimeout(async () => {
    try {
      setIsForexSearchSuggesting(true);
      const { data } = await axios.get(`${API_URL}/api/forex-search`, {
        params: { q: query },
        timeout: 4500
      });
      if (!isActive) return;
      setForexSearchSuggestions(Array.isArray(data?.results) ? data.results : []);
    } catch (error) {
      if (isActive) setForexSearchSuggestions([]);
    } finally {
      if (isActive) setIsForexSearchSuggesting(false);
    }
  }, 160);

  return () => {
    isActive = false;
    window.clearTimeout(timer);
  };
}, [forexSearchInput, activePage]);


  

useEffect(() => {
  localStorage.setItem(
    "mrktrallyWatchlistTapeMoves",
    watchlistTapeMoves ? "true" : "false"
  );
}, [watchlistTapeMoves]);


  /*
    SAVE WATCHLIST
  */


useEffect(() => {
  let isActive = true;
  let liveRefreshTimer;
  let passiveRefreshTimer;
  let closeRefreshTimer;
  const topWatchlistSymbols = [...new Set(watchlist
    .map((symbol) => String(symbol || "").trim().toUpperCase())
    .filter(Boolean))];
  const passiveSymbols = [...new Set([
    ...portfolios.flatMap((item) =>
      (item.positions || []).map((position) => position.symbol)
    )
  ]
    .map((symbol) => String(symbol || "").trim().toUpperCase())
    .filter((symbol) => symbol && !topWatchlistSymbols.includes(symbol)))];

  const refreshTopWatchlistPrices = async () => {
    if (!isActive) return;
    refreshTopWatchlistMarketPrices(topWatchlistSymbols);
    liveRefreshTimer = window.setTimeout(
      refreshTopWatchlistPrices,
      5 * 60 * 1000
    );
  };

  const refreshPassivePrices = async () => {
    if (!isActive) return;
    loadSavedPrices(passiveSymbols);
    passiveRefreshTimer = window.setTimeout(
      refreshPassivePrices,
      30 * 60 * 1000
    );
  };

  const loadInitialPrices = () => {
    if (!initialSavedPricesLoaded.current) {
      initialSavedPricesLoaded.current = true;
      loadSavedPrices(passiveSymbols);
      refreshTopWatchlistMarketPrices(topWatchlistSymbols);
      window.setTimeout(() => {
        if (!isActive) return;
        refreshTopWatchlistMarketPrices(topWatchlistSymbols);
      }, 1200);
    } else {
      loadSavedPrices(passiveSymbols);
      refreshTopWatchlistMarketPrices(topWatchlistSymbols);
    }
  };

  loadInitialPrices();
  liveRefreshTimer = window.setTimeout(refreshTopWatchlistPrices, 5 * 60 * 1000);
  passiveRefreshTimer = window.setTimeout(refreshPassivePrices, 30 * 60 * 1000);
  closeRefreshTimer = window.setInterval(() => {
    if (getMarketClock(new Date()).tone !== "open") {
      loadTopWatchlistClosePrices(topWatchlistSymbols);
    }
  }, 60 * 1000);
  return () => {
    isActive = false;
    window.clearTimeout(liveRefreshTimer);
    window.clearTimeout(passiveRefreshTimer);
    window.clearInterval(closeRefreshTimer);
  };
}, [watchlist, portfolios]);

useEffect(() => {
  let isActive = true;
  let refreshTimer;
  let hasLoadedIndices = marketIndices.length > 0;

  const loadMarketIndices = async () => {
    let nextRefreshMs = 8 * 1000;
    if (!hasLoadedIndices) {
      setIsMarketLoading(true);
    }
    try {
      const response = await axios.get(`${API_URL}/api/market-indices`, {
        timeout: 3500,
      });
      if (isActive) {
        const indices = response.data.indices || [];
        if (indices.length) {
          hasLoadedIndices = true;
          setMarketIndices((previousIndices) => {
            const previousByKey = new Map(previousIndices.map((index) => [index.key, index]));
            const indicesByKey = new Map(indices.map((index) => [index.key, index]));
            const ordered = MARKET_INDEX_ORDER
              .map((item) => {
                const freshIndex = indicesByKey.get(item.key);
                const previousIndex = previousByKey.get(item.key);
                return {
                  ...item,
                  ...(previousIndex || {}),
                  ...(freshIndex || {}),
                  futures: null
                };
              });
            localStorage.setItem(MARKET_INDICES_STORAGE_KEY, JSON.stringify(ordered));
            return ordered;
          });
          setIsMarketLoading(false);
          nextRefreshMs = response.data?.stale || response.data?.refreshing ? 15000 : 30 * 1000;
        } else {
          nextRefreshMs = 15000;
          setIsMarketLoading(true);
        }
      }
    } catch (error) {
      console.error("Market indices failed", error);
      nextRefreshMs = hasLoadedIndices ? 30000 : 15000;
    } finally {
      if (isActive) {
        refreshTimer = window.setTimeout(loadMarketIndices, nextRefreshMs);
      }
    }
  };

  loadMarketIndices();
  return () => {
    isActive = false;
    window.clearTimeout(refreshTimer);
  };
}, []);

useEffect(() => {
  if (activePage !== "market-overview") return;

  let isActive = true;
  let refreshTimer;

  const loadTopTradedStocks = async () => {
    if (!topTradedStocks.stocks.length) {
      setIsTopTradedStocksLoading(true);
    }
    let nextRefreshMs = 2 * 60 * 1000;
    try {
      const response = await axios.get(`${API_URL}/api/top-traded-stocks`, {
        timeout: 8500,
      });
      if (isActive) {
        const stocks = Array.isArray(response.data?.stocks) ? response.data.stocks.slice(0, 10) : [];
        setTopTradedStocks({
          stocks,
          updatedAt: response.data?.updatedAt || null
        });
        nextRefreshMs = stocks.length ? 2 * 60 * 1000 : 12000;
      }
    } catch (error) {
      console.error("Top traded stocks failed", error);
      nextRefreshMs = 12000;
    } finally {
      if (isActive) {
        setIsTopTradedStocksLoading(false);
        refreshTimer = window.setTimeout(loadTopTradedStocks, nextRefreshMs);
      }
    }
  };

  loadTopTradedStocks();

  return () => {
    isActive = false;
    window.clearTimeout(refreshTimer);
  };
}, [activePage]);

useEffect(() => {
  if (activePage !== "etfs" || !etfTicker) return;

  let isActive = true;
  let startTimer;

  const loadEtfData = async () => {
    setIsEtfLoading(true);
    setEtfError("");

    try {
      const response = await axios.get(`${API_URL}/api/etf/${etfTicker}`, { timeout: 8500 });
      if (!isActive) return;
      setEtfData(response.data);
    } catch (error) {
      console.error("Fund data failed", error);
      if (!isActive) return;
      setEtfError("Fund data is not available yet for that ticker.");
    } finally {
      if (isActive) setIsEtfLoading(false);
    }
  };

  startTimer = window.setTimeout(loadEtfData, 0);

  return () => {
    isActive = false;
    window.clearTimeout(startTimer);
  };
}, [activePage, etfTicker]);

useEffect(() => {
  if (activePage !== "etfs" || !etfTicker) return;

  let isActive = true;

  const loadEtfChart = async () => {
    setIsEtfChartLoading(true);
    setEtfChartError("");

    try {
      const response = await axios.get(
        `${API_URL}/api/price-history/${encodeURIComponent(etfTicker)}`,
        {
          params: { range: etfChartRange },
          timeout: etfChartRange === "1D" ? 6000 : 7000
        }
      );
      if (!isActive) return;
      setEtfChartData(response.data || { points: [], latest: null });
      if (response.data?.unavailable) {
        setEtfChartError(response.data.error || "FMP price chart is not available right now.");
      }
    } catch (error) {
      console.error("Fund chart failed", error);
      if (!isActive) return;
      setEtfChartError("Price chart is not available yet for that fund.");
    } finally {
      if (isActive) setIsEtfChartLoading(false);
    }
  };

  loadEtfChart();

  return () => {
    isActive = false;
  };
}, [activePage, etfTicker, etfChartRange]);

useEffect(() => {
  if (activePage !== "crypto" || !cryptoSymbol) return;

  let isActive = true;

  const loadCryptoData = async () => {
    setIsCryptoLoading(true);
    setCryptoError("");

    try {
      const response = await axios.get(`${API_URL}/api/crypto/${encodeURIComponent(cryptoSymbol)}`, { timeout: 7000 });
      if (!isActive) return;
      setCryptoData(response.data);
    } catch (error) {
      console.error("Crypto data failed", error);
      if (!isActive) return;
      setCryptoError("Crypto data is not available yet for that symbol.");
    } finally {
      if (isActive) setIsCryptoLoading(false);
    }
  };

  loadCryptoData();

  return () => {
    isActive = false;
  };
}, [activePage, cryptoSymbol]);

useEffect(() => {
  if (activePage !== "crypto" || !cryptoSymbol) return;

  let isActive = true;

  const loadCryptoChart = async () => {
    setIsCryptoChartLoading(true);
    setCryptoChartError("");

    try {
      const response = await axios.get(
        `${API_URL}/api/crypto-price-history/${encodeURIComponent(cryptoSymbol)}`,
        {
          params: { range: cryptoChartRange },
          timeout: cryptoChartRange === "1D" ? 7000 : 8500
        }
      );
      if (!isActive) return;
      setCryptoChartData(response.data || { points: [], latest: null });
      if (response.data?.unavailable) {
        setCryptoChartError(response.data.error || "FMP price chart is not available right now.");
      }
    } catch (error) {
      console.error("Crypto chart failed", error);
      if (!isActive) return;
      setCryptoChartError("Price chart is not available yet for that crypto.");
    } finally {
      if (isActive) setIsCryptoChartLoading(false);
    }
  };

  loadCryptoChart();

  return () => {
    isActive = false;
  };
}, [activePage, cryptoSymbol, cryptoChartRange]);

useEffect(() => {
  if (activePage !== "forex" || !forexSymbol) return;

  let isActive = true;

  const loadForexData = async () => {
    setIsForexLoading(true);
    setForexError("");

    try {
      const response = await axios.get(`${API_URL}/api/forex/${encodeURIComponent(forexSymbol)}`, { timeout: 7000 });
      if (!isActive) return;
      setForexData(response.data);
    } catch (error) {
      console.error("Forex data failed", error);
      if (!isActive) return;
      setForexError("FOREX data is not available yet for that pair.");
    } finally {
      if (isActive) setIsForexLoading(false);
    }
  };

  loadForexData();

  return () => {
    isActive = false;
  };
}, [activePage, forexSymbol]);

useEffect(() => {
  if (activePage !== "forex" || !forexSymbol) return;

  let isActive = true;

  const loadForexChart = async () => {
    setIsForexChartLoading(true);
    setForexChartError("");

    try {
      const response = await axios.get(
        `${API_URL}/api/forex-price-history/${encodeURIComponent(forexSymbol)}`,
        {
          params: { range: forexChartRange },
          timeout: forexChartRange === "1D" ? 7000 : 8500
        }
      );
      if (!isActive) return;
      setForexChartData(response.data || { points: [], latest: null });
      if (response.data?.unavailable) {
        setForexChartError(response.data.error || "FMP price chart is not available right now.");
      }
    } catch (error) {
      console.error("Forex chart failed", error);
      if (!isActive) return;
      setForexChartError("Price chart is not available yet for that FOREX pair.");
    } finally {
      if (isActive) setIsForexChartLoading(false);
    }
  };

  loadForexChart();

  return () => {
    isActive = false;
  };
}, [activePage, forexSymbol, forexChartRange]);

useEffect(() => {
  if (activePage !== "commodities" || !commoditySymbol) return;

  let isActive = true;

  const loadCommodityData = async () => {
    setIsCommodityLoading(true);
    setCommodityError("");

    try {
      const response = await axios.get(`${API_URL}/api/commodities/${encodeURIComponent(commoditySymbol)}`);
      if (!isActive) return;
      setCommodityData(response.data);
    } catch (error) {
      console.error("Commodity data failed", error);
      if (!isActive) return;
      setCommodityError("Commodity data is not available yet for that symbol.");
    } finally {
      if (isActive) setIsCommodityLoading(false);
    }
  };

  loadCommodityData();

  return () => {
    isActive = false;
  };
}, [activePage, commoditySymbol]);

useEffect(() => {
  if (activePage !== "commodities" || !commoditySymbol) return;

  let isActive = true;

  const loadCommodityChart = async () => {
    setIsCommodityChartLoading(true);
    setCommodityChartError("");

    try {
      const response = await axios.get(
        `${API_URL}/api/commodity-price-history/${encodeURIComponent(commoditySymbol)}`,
        { params: { range: commodityChartRange } }
      );
      if (!isActive) return;
      setCommodityChartData(response.data || { points: [], latest: null });
    } catch (error) {
      console.error("Commodity chart failed", error);
      if (!isActive) return;
      setCommodityChartError("Price chart is not available yet for that commodity.");
    } finally {
      if (isActive) setIsCommodityChartLoading(false);
    }
  };

  loadCommodityChart();

  return () => {
    isActive = false;
  };
}, [activePage, commoditySymbol, commodityChartRange]);

useEffect(() => {
  if (activePage !== "stock-screener") return;

  let isActive = true;

  const loadStockScreener = async () => {
    setIsScreenerLoading(true);
    setScreenerError("");

    try {
      const response = await axios.get(`${API_URL}/api/stock-screener`, {
        params: appliedScreenerFilters,
        timeout: 25000
      });
      if (!isActive) return;
      setScreenerResults(Array.isArray(response.data?.results) ? response.data.results : []);
      setScreenerUpdatedAt(response.data?.updatedAt || null);
    } catch (error) {
      console.error("Stock screener failed", error);
      if (!isActive) return;
      setScreenerError("Stock screener data is not available yet.");
      setScreenerResults([]);
    } finally {
      if (isActive) setIsScreenerLoading(false);
    }
  };

  loadStockScreener();

  return () => {
    isActive = false;
  };
}, [activePage, appliedScreenerFilters]);

useEffect(() => {
  if (activePage !== "stock-screener") return;
  if (
    screenerOptions.sectors.length ||
    screenerOptions.industries.length ||
    screenerOptions.exchanges.length ||
    screenerOptions.countries.length
  ) return;

  let isActive = true;

  const loadScreenerOptions = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/stock-screener/options`, {
        timeout: 15000
      });
      if (!isActive) return;
      setScreenerOptions({
        sectors: Array.isArray(response.data?.sectors) ? response.data.sectors : [],
        industries: Array.isArray(response.data?.industries) ? response.data.industries : [],
        exchanges: Array.isArray(response.data?.exchanges) ? response.data.exchanges : [],
        countries: Array.isArray(response.data?.countries) ? response.data.countries : []
      });
    } catch (error) {
      console.error("Stock screener options failed", error);
    }
  };

  loadScreenerOptions();

  return () => {
    isActive = false;
  };
}, [activePage, screenerOptions]);

useEffect(() => {
  if (activePage !== "financial-statements" || !financialStatementTicker) return;

  let isActive = true;

  const loadFinancialStatements = async () => {
    setIsFinancialStatementLoading(true);
    setFinancialStatementError("");

    try {
      const response = await axios.get(`${API_URL}/api/financial-statements/${financialStatementTicker}`, {
        params: {
          statement: financialStatementType,
          period: financialStatementPeriod,
          limit: rangeLimitForPeriod("max", financialStatementPeriod)
        },
        timeout: 9000
      });
      if (!isActive) return;
      setFinancialStatementData(response.data);
    } catch (error) {
      console.error("Financial statements failed", error);
      if (!isActive) return;
      setFinancialStatementError("Financial statements are not available yet for that ticker.");
      setFinancialStatementData(null);
    } finally {
      if (isActive) setIsFinancialStatementLoading(false);
    }
  };

  loadFinancialStatements();

  return () => {
    isActive = false;
  };
}, [activePage, financialStatementTicker, financialStatementType, financialStatementPeriod]);

useEffect(() => {
  if (activePage !== "fundamental-charts" || !fundamentalChartTickers.length) return;

  let isActive = true;

  const statementTypes = ["income", "balance", "cashflow"];
  const periodLimit = rangeLimitForPeriod("max", fundamentalChartPeriod);

  const statementToPeriodMap = (statementData) => {
    const map = new Map();
    const periods = Array.isArray(statementData?.periods) ? statementData.periods : [];
    periods.forEach((period, index) => {
      const key = period.date || period.label || period.key || String(index);
      map.set(key, {
        key,
        label: period.label || period.date || period.key || "Period",
        date: period.date || null,
        currency: period.currency || null,
        values: {}
      });
    });

    (statementData?.rows || []).forEach((row) => {
      (row.values || []).forEach((value, index) => {
        const period = periods[index];
        const key = period?.date || period?.label || period?.key || String(index);
        if (!map.has(key)) {
          map.set(key, {
            key,
            label: period?.label || period?.date || period?.key || "Period",
            date: period?.date || null,
            currency: period?.currency || null,
            values: {}
          });
        }
        map.get(key).values[row.key] = value;
      });
    });

    return map;
  };

  const loadTickerFundamentals = async (symbol) => {
    const statementRequests = statementTypes.map((statement) =>
      axios.get(`${API_URL}/api/financial-statements/${symbol}`, {
        params: {
          statement,
          period: fundamentalChartPeriod,
          limit: periodLimit
        },
        timeout: 12000
      })
        .then((response) => [statement, response.data])
        .catch((error) => {
          console.error(`Fundamental ${statement} statement failed`, symbol, error);
          return [statement, null];
        })
    );
    const metricRequest = axios.get(`${API_URL}/api/fundamental-metrics/${symbol}`, {
        params: {
          period: fundamentalChartPeriod,
          limit: periodLimit
        },
        timeout: 12000
      })
        .then((response) => ["metrics", response.data])
        .catch((error) => {
        console.error("Fundamental key metrics failed", symbol, error);
        return ["metrics", null];
      });

    const statementEntries = await Promise.all([...statementRequests, metricRequest]);
    const statements = Object.fromEntries(statementEntries);
    const periodMaps = Object.fromEntries(statementEntries.map(([statement, data]) => [
      statement,
      statementToPeriodMap(data)
    ]));

    const allPeriodKeys = new Set();
    Object.values(periodMaps).forEach((map) => {
      map.forEach((_, key) => allPeriodKeys.add(key));
    });

    const periods = [...allPeriodKeys]
      .map((key) => {
        const income = periodMaps.income.get(key);
        const balance = periodMaps.balance.get(key);
        const cashflow = periodMaps.cashflow.get(key);
        const metrics = periodMaps.metrics.get(key);
        const firstPeriod = income || balance || cashflow || metrics;
        return {
          key,
          label: firstPeriod?.label || key,
          date: firstPeriod?.date || null,
          currency: firstPeriod?.currency || null,
          income: income?.values || {},
          balance: balance?.values || {},
          cashflow: cashflow?.values || {},
          metrics: metrics?.values || {}
        };
      })
      .sort((a, b) => {
        const dateA = a.date ? new Date(`${a.date}T12:00:00`).getTime() : 0;
        const dateB = b.date ? new Date(`${b.date}T12:00:00`).getTime() : 0;
        if (dateA && dateB) return dateA - dateB;
        return String(a.label).localeCompare(String(b.label));
      });

    return {
      symbol,
      statements,
      periods,
      updatedAt: new Date().toISOString()
    };
  };

  const loadFundamentalCharts = async () => {
    setIsFundamentalChartLoading(true);
    setFundamentalChartError("");

    try {
      const results = await Promise.all(fundamentalChartTickers.map(loadTickerFundamentals));
      if (!isActive) return;
      setFundamentalChartData({
        tickers: results,
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error("Fundamental charts failed", error);
      if (!isActive) return;
      setFundamentalChartError("Fundamental chart data is not available yet.");
      setFundamentalChartData(null);
    } finally {
      if (isActive) setIsFundamentalChartLoading(false);
    }
  };

  loadFundamentalCharts();

  return () => {
    isActive = false;
  };
}, [activePage, fundamentalChartTickers, fundamentalChartPeriod]);

useEffect(() => {
  if (!maximizedFundamentalChartKey) return;
  const previousOverflow = document.body.style.overflow;
  const handleKeyDown = (event) => {
    if (event.key === "Escape") setMaximizedFundamentalChartKey("");
  };
  document.body.style.overflow = "hidden";
  window.addEventListener("keydown", handleKeyDown);
  return () => {
    document.body.style.overflow = previousOverflow;
    window.removeEventListener("keydown", handleKeyDown);
  };
}, [maximizedFundamentalChartKey]);

useEffect(() => {
  if (activePage !== "market-overview") return;

  let isActive = true;
  let refreshTimer;
  let startTimer;

  const loadBroadMarketMovers = async () => {
    if (!broadMarketMovers.gainers.length && !broadMarketMovers.losers.length) {
      setIsBroadMarketMoversLoading(true);
    }
    let nextRefreshMs = 2 * 60 * 1000;
    try {
      const response = await axios.get(`${API_URL}/api/market-movers`, {
        timeout: 9000,
      });
      if (isActive) {
        const gainers = Array.isArray(response.data?.gainers) ? response.data.gainers : [];
        const losers = Array.isArray(response.data?.losers) ? response.data.losers : [];
        nextRefreshMs = gainers.length || losers.length ? 2 * 60 * 1000 : 8000;
        setBroadMarketMovers({
          gainers,
          losers,
          updatedAt: response.data?.updatedAt || null
        });
      }
    } catch (error) {
      console.error("Market movers failed", error);
      nextRefreshMs = 10000;
    } finally {
      if (isActive) {
        setIsBroadMarketMoversLoading(false);
        refreshTimer = window.setTimeout(loadBroadMarketMovers, nextRefreshMs);
      }
    }
  };

  startTimer = window.setTimeout(loadBroadMarketMovers, 0);

  return () => {
    isActive = false;
    window.clearTimeout(startTimer);
    window.clearTimeout(refreshTimer);
  };
}, [activePage]);

useEffect(() => {
  const timer = window.setInterval(() => {
    setMarketClockNow(new Date());
  }, 1000);

  return () => window.clearInterval(timer);
}, []);

useEffect(() => {
  const currentSnapshot = getMarketEventSnapshot(marketClockNow);
  const previousSnapshot = previousMarketEventRef.current;
  previousMarketEventRef.current = currentSnapshot;

  if (!previousSnapshot) return;

  const showMarketEvent = (eventKey) => {
    const eventId = `${currentSnapshot.sessionKey}-${eventKey}`;
    if (firedMarketEventsRef.current.has(eventId)) return;
    firedMarketEventsRef.current.add(eventId);
    setMarketEventToast({
      id: `${eventId}-${Date.now()}`,
      ...MARKET_EVENT_TOASTS[eventKey]
    });
  };

  if (previousSnapshot.status !== "open" && currentSnapshot.status === "open") {
    showMarketEvent("open");
  }

  if (previousSnapshot.status === "open" && currentSnapshot.status === "closed") {
    showMarketEvent("close");
  }

  if (currentSnapshot.status === "open") {
    if (
      previousSnapshot.secondsToClose > 60 * 60 &&
      currentSnapshot.secondsToClose <= 60 * 60
    ) {
      showMarketEvent("oneHour");
    }

    if (
      previousSnapshot.secondsToClose > 2 * 60 &&
      currentSnapshot.secondsToClose <= 2 * 60
    ) {
      showMarketEvent("twoMinutes");
    }
  }
}, [marketClockNow]);

useEffect(() => {
  if (!marketEventToast) return undefined;
  const timer = window.setTimeout(() => {
    setMarketEventToast(null);
  }, 8500);

  return () => window.clearTimeout(timer);
}, [marketEventToast]);

useEffect(() => {
  let isActive = true;
  let refreshTimer;
  let retryTimer;

  const scheduleRetry = (attempt, quick = false) => {
    if (!isActive) return;
    const retryDelay = quick
      ? Math.min(3500, 800 + attempt * 700)
      : Math.min(10000, 1500 + attempt * 1500);
    if (retryTimer) window.clearTimeout(retryTimer);
    retryTimer = window.setTimeout(() => {
      loadPriceHistory(false, attempt + 1);
    }, retryDelay);
  };

  const loadPriceHistory = async (showLoading = true, attempt = 0) => {
    if (!ticker || activePage !== "overview") return;
    const cacheKey = `${ticker}:${stockChartRange}`;
    const cachedChart = stockChartMemoryCacheRef.current.get(cacheKey);
    const cachedChartIsFresh = Boolean(
      cachedChart?.points?.length &&
      (stockChartRange !== "1D" || Date.now() - (cachedChart.cachedAt || 0) < 15000)
    );
    if (showLoading) {
      setIsStockChartLoading(true);
      setStockChartError("");
      if (cachedChartIsFresh) {
        setStockChartData(cachedChart.points);
        setStockChartMeta(cachedChart.latest || null);
      } else {
        setStockChartData([]);
        setStockChartMeta(null);
      }
    }

    let keepLoading = false;

    try {
      const response = await axios.get(
        `${API_URL}/api/price-history/${ticker}`,
        {
          params: {
            range: stockChartRange
          },
          timeout: stockChartRange === "1D" ? 8000 : 10000
        }
      );

      if (!isActive) return;

      const points = response.data.points || [];
      const latest = response.data.latest || null;
      if (stockChartRange === "1D") {
        applyChartLatestToSavedPrice(ticker, latest, {
          marketType: "stock",
          source: response.data?.source || "FMP 5-minute chart"
        });
      }
      if (response.data.unavailable) {
        if (cachedChartIsFresh) {
          setStockChartData(cachedChart.points);
        } else {
          setStockChartData([]);
          keepLoading = attempt < 8;
        }
        setStockChartMeta(latest);
        setStockChartError(cachedChartIsFresh
          ? "Chart history is refreshing..."
          : response.data.error || "Chart history is still loading..."
        );
        scheduleRetry(attempt);
        return;
      }
      const isFallbackHistory =
        (
          response.data.stale ||
          response.data.refreshing ||
          response.data.unavailable
        ) && (
          response.data.interval === "fallback" ||
          response.data.interval === "quote" ||
          /quote fallback/i.test(String(response.data.source || "")) ||
          points.some((point) => point?.isFallback) ||
          (
            stockChartRange === "1D" &&
            points.length <= 2
          )
        );

      if (isFallbackHistory) {
        setStockChartMeta(latest);
        if (cachedChartIsFresh) {
          setStockChartData(cachedChart.points);
          setStockChartError("Chart history is refreshing...");
        } else {
          setStockChartData([]);
          setStockChartError("Chart history is loading...");
          keepLoading = true;
        }
        scheduleRetry(attempt, true);
        return;
      }

      if (points.length) {
        stockChartMemoryCacheRef.current.set(cacheKey, {
          points,
          latest,
          updatedAt: response.data.updatedAt,
          cachedAt: Date.now()
        });
      }
      setStockChartData(points);
      setStockChartMeta(response.data.latest || null);
      setStockChartError(response.data.stale ? "Chart history is refreshing..." : "");
      if (response.data.stale) {
        scheduleRetry(attempt);
      }
    } catch (error) {
      console.error("Price history failed", error);
      if (isActive) {
        const hasCachedChart = cachedChartIsFresh;
        setStockChartError(
          hasCachedChart
            ? "Chart history is refreshing..."
            : attempt < 4
              ? "Chart history is still loading..."
              : "Still trying to load chart history..."
        );
        keepLoading = !hasCachedChart && attempt < 4;
        scheduleRetry(attempt);
      }
    } finally {
      if (isActive) {
        setIsStockChartLoading(keepLoading);
      }
    }
  };

  loadPriceHistory(true);
  refreshTimer = window.setInterval(() => {
    if (getMarketClock(new Date()).tone === "open") {
      loadPriceHistory(false);
    }
  }, stockChartRange === "1D" ? 30000 : 60000);

  return () => {
    isActive = false;
    window.clearInterval(refreshTimer);
    if (retryTimer) window.clearTimeout(retryTimer);
  };
}, [ticker, stockChartRange, activePage]);

  /*
    LOAD STOCK WHEN TICKER CHANGES
  */

  useEffect(() => {
    if (stockRetryTimerRef.current) {
      window.clearTimeout(stockRetryTimerRef.current);
      stockRetryTimerRef.current = null;
    }
    const requestId = ++latestStockRequest.current;
    const cachedStock = stockMemoryCacheRef.current.get(ticker) || null;
    latestAiRequest.current += 1;
    latestEarningsCallRequest.current += 1;
    stockSidecarRequestRef.current = "";
    stockOverviewExtrasRequestRef.current = "";
    setStockData(cachedStock);
    if (cachedStock) firstStockLoadSettled.current = true;
    setAiAnalysis(null);
    setEarningsCall(null);
    setCompanyDocuments(null);
    setSimilarCompanies([]);
    setActiveCompanyDocumentTab("results");
    setTranscriptPeriodOptions([]);
    setSelectedTranscriptPeriod("");
    window.speechSynthesis?.cancel();
    setIsSpeechPlaying(false);
    setIsSpeechPaused(false);
    setSpeechError("");
    setIsStockLoading(!cachedStock);
    loadSavedPrices([ticker], 0, { live: true });
    loadStock(ticker, 0, requestId);

  }, [ticker]);

  useEffect(() => {
    const symbol = String(ticker || "").trim().toUpperCase();
    if (activePage !== "overview" || !symbol) return;
    const currentSymbol = String(stockData?.symbol || loadedStockSymbol || "").trim().toUpperCase();
    if (!currentSymbol || currentSymbol !== symbol) return;
    const requestKey = symbol;
    if (stockOverviewExtrasRequestRef.current === requestKey) return;
    stockOverviewExtrasRequestRef.current = requestKey;
    setStockOverviewExtrasExhaustedSymbol((current) => current === symbol ? "" : current);

    let isActive = true;
    let retryTimer;
    const loadOverviewExtras = async (attempt = 0) => {
      try {
        const response = await axios.get(`${API_URL}/api/stock-overview-extras/${symbol}`, {
          timeout: 6500
        });
        if (!isActive) return;
        const patch = response.data || {};
        let mergedSnapshot = null;
        setStockData((current) => {
          if (!current || String(current.symbol || "").toUpperCase() !== symbol) return current;
          const merged = stabilizeRefreshingStockData(current, {
            ...current,
            ...patch,
            refreshing: current.refreshing
          });
          stockMemoryCacheRef.current.set(symbol, merged);
          mergedSnapshot = merged;
          return merged;
        });
        const shouldRetry = shouldRetryOverviewExtras(mergedSnapshot || patch, attempt);
        if (isActive && shouldRetry) {
          retryTimer = window.setTimeout(
            () => loadOverviewExtras(attempt + 1),
            Math.min(10000, 900 + attempt * 450)
          );
        } else if (isActive && !hasCompleteMetricCardVersions(mergedSnapshot || patch)) {
          setStockOverviewExtrasExhaustedSymbol(symbol);
        }
      } catch (error) {
        console.error("Stock overview extras failed", error);
        if (isActive && attempt < 12) {
          retryTimer = window.setTimeout(
            () => loadOverviewExtras(attempt + 1),
            1000 + attempt * 500
          );
        } else if (isActive) {
          setStockOverviewExtrasExhaustedSymbol(symbol);
        }
      }
    };
    const timer = window.setTimeout(() => loadOverviewExtras(0), 0);

    return () => {
      isActive = false;
      window.clearTimeout(timer);
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, [
    ticker,
    loadedStockSymbol,
    activePage,
    stockData?.symbol
  ]);

  useEffect(() => () => {
    if (stockRetryTimerRef.current) {
      window.clearTimeout(stockRetryTimerRef.current);
    }
  }, []);

  useEffect(() => {
    const symbol = String(ticker || "").trim().toUpperCase();
    if (activePage !== "overview" || !symbol || isStockLoading) return;
    const currentSymbol = String(stockData?.symbol || loadedStockSymbol || "").trim().toUpperCase();
    if (currentSymbol && currentSymbol !== symbol) return;
    const requestKey = `${symbol}:${financialChartMode}`;
    if (stockSidecarRequestRef.current === requestKey) return;
    stockSidecarRequestRef.current = requestKey;
    let isActive = true;
    let retryTimer;
    const mergeSidecarPatch = (patch = {}) => {
      if (!isActive || !patch || typeof patch !== "object") return;
      let mergedSnapshot = null;
      setStockData((current) => {
        if (!current || (current.symbol && String(current.symbol).toUpperCase() !== symbol)) return current;
        const mergedAnalystEstimates = chooseRicherAnalystEstimates(
          current.analystEstimates,
          patch.analystEstimates
        );
        const merged = stabilizeRefreshingStockData(current, {
          ...current,
          ...patch,
          analystEstimates: mergedAnalystEstimates,
          analystEstimatesSources: {
            ...(current.analystEstimatesSources || {}),
            ...(patch.analystEstimatesSources || {})
          },
          refreshing: current.refreshing
        });
        stockMemoryCacheRef.current.set(symbol, merged);
        mergedSnapshot = merged;
        return merged;
      });
      return mergedSnapshot;
    };
    const loadSidecar = async (attempt = 0) => {
      try {
        const response = await axios.get(`${API_URL}/api/stock-sidecars/${symbol}`, {
          timeout: 3200
        });
        const merged = mergeSidecarPatch(response.data || {});
        if (isActive && shouldRetrySidecarData(merged || response.data || {}, attempt)) {
          retryTimer = window.setTimeout(
            () => loadSidecar(attempt + 1),
            850 + attempt * 450
          );
        }
      } catch (error) {
        console.error("Stock sidecars failed", error);
        if (isActive && attempt < 4) {
          retryTimer = window.setTimeout(
            () => loadSidecar(attempt + 1),
            1000 + attempt * 500
          );
        }
      }
    };
    const timer = window.setTimeout(() => loadSidecar(0), 0);

    return () => {
      isActive = false;
      window.clearTimeout(timer);
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, [ticker, loadedStockSymbol, activePage, isStockLoading, stockData?.symbol, financialChartMode]);

  useEffect(() => () => {
    window.speechSynthesis?.cancel();
  }, []);

  useEffect(() => {
    if (activePage !== "overview" || !loadedStockSymbol || loadedStockSymbol !== ticker || isStockLoading) return;
    let isActive = true;
    let retryTimer;

    const loadCompanyDocuments = (attempt = 0) => {
      if (!isActive) return;
      let willRetry = false;
      setIsCompanyDocumentsLoading(true);
      axios.get(`${API_URL}/api/company-documents/${ticker}${attempt > 0 ? "?refresh=1" : ""}`, { timeout: 45000 })
        .then((response) => {
          if (isActive) {
            if (!response.data?.available && attempt < 3) {
              willRetry = true;
              retryTimer = window.setTimeout(
                () => loadCompanyDocuments(attempt + 1),
                Math.min(10000, 1600 + attempt * 2200)
              );
              return;
            }
            setCompanyDocuments(response.data);
          }
        })
        .catch((error) => {
          console.error("Company documents failed", error);
          if (!isActive) return;
          if (attempt < 5) {
            willRetry = true;
            retryTimer = window.setTimeout(
              () => loadCompanyDocuments(attempt + 1),
              Math.min(12000, 1800 + attempt * 1800)
            );
            return;
          }
          setCompanyDocuments({
            available: false,
            loadingFailed: true
          });
        })
        .finally(() => {
          if (isActive && !willRetry) {
            setIsCompanyDocumentsLoading(false);
          }
        });
    };

    const startTimer = window.setTimeout(loadCompanyDocuments, 3600);

    return () => {
      isActive = false;
      window.clearTimeout(startTimer);
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, [ticker, loadedStockSymbol, isStockLoading, activePage]);

  useEffect(() => {
    if (activePage !== "overview" || !loadedStockSymbol || loadedStockSymbol !== ticker || isStockLoading) return;
    let isActive = true;
    let retryTimer;
    setIsTranscriptPeriodsLoading(true);

    const loadEarningsCallPeriods = (attempt = 0) => {
      if (!isActive) return;
      let willRetry = false;
      axios.get(`${API_URL}/api/earnings-call-periods/${ticker}`, { timeout: 35000 })
        .then((response) => {
          if (!isActive) return;
          const periods = normalizeTranscriptPeriodOptions(response.data?.periods || []);
          if (!periods.length && attempt < 4) {
            willRetry = true;
            retryTimer = window.setTimeout(
              () => loadEarningsCallPeriods(attempt + 1),
              Math.min(12000, 1800 + attempt * 2200)
            );
            return;
          }
          setTranscriptPeriodOptions(periods);
          setSelectedTranscriptPeriod((current) =>
            periods.some((period) => period.value === current)
              ? current
              : periods[0]?.value || ""
          );
          if (!periods.length) {
            setEarningsCall({
              available: false,
              message: "No conference call transcripts are available for this ticker yet."
            });
          }
        })
        .catch((error) => {
          console.error("Earnings call periods failed", error);
          if (!isActive) return;
          if (attempt < 4) {
            willRetry = true;
            retryTimer = window.setTimeout(
              () => loadEarningsCallPeriods(attempt + 1),
              Math.min(12000, 1800 + attempt * 2200)
            );
            return;
          }
          setTranscriptPeriodOptions([]);
          setSelectedTranscriptPeriod("");
          setEarningsCall({
            available: false,
            message: "Conference call options are temporarily unavailable."
          });
        })
        .finally(() => {
          if (isActive && !willRetry) setIsTranscriptPeriodsLoading(false);
        });
    };

    const startTimer = window.setTimeout(loadEarningsCallPeriods, 2600);

    return () => {
      isActive = false;
      window.clearTimeout(startTimer);
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, [ticker, loadedStockSymbol, isStockLoading, activePage]);

  useEffect(() => {
    if (activePage !== "overview" || !loadedStockSymbol || loadedStockSymbol !== ticker || isStockLoading || isTranscriptPeriodsLoading) return;
    const requestId = ++latestEarningsCallRequest.current;
    const selectedPeriod = transcriptPeriodOptions.find((period) => period.value === selectedTranscriptPeriod);
    if (!selectedPeriod) {
      setIsEarningsCallLoading(false);
      if (!transcriptPeriodOptions.length) {
        setEarningsCall({
          available: false,
          message: "No conference call transcripts are available for this ticker yet."
        });
      }
      return;
    }
    const delay = 100;
    const timer = window.setTimeout(() => {
      setIsEarningsCallLoading(true);

      const loadSelectedEarningsCall = (attempt = 0) => {
        axios.get(`${API_URL}/api/earnings-call/${ticker}`, {
          params: {
            year: selectedPeriod.year,
            quarter: selectedPeriod.quarter,
            attempt
          },
          timeout: 50000
        })
          .then((response) => {
            if (requestId !== latestEarningsCallRequest.current) return;
            const data = response.data || {};
            const hasTranscript = Boolean(data.transcript?.length || data.transcriptUrl);
            if (!hasTranscript && attempt < 2) {
              window.setTimeout(() => {
                if (requestId === latestEarningsCallRequest.current) {
                  loadSelectedEarningsCall(attempt + 1);
                }
              }, 1200 + attempt * 1800);
              return;
            }
            setEarningsCall(data);
            setIsEarningsCallLoading(false);
          })
          .catch((error) => {
            console.error("Earnings call failed", error);
            if (requestId !== latestEarningsCallRequest.current) return;
            if (attempt < 2) {
              window.setTimeout(() => {
                if (requestId === latestEarningsCallRequest.current) {
                  loadSelectedEarningsCall(attempt + 1);
                }
              }, 1200 + attempt * 1800);
              return;
            }
            setEarningsCall({ available: false });
            setIsEarningsCallLoading(false);
          });
      };

      loadSelectedEarningsCall();
      });

    return () => window.clearTimeout(timer);
  }, [ticker, loadedStockSymbol, isStockLoading, isTranscriptPeriodsLoading, selectedTranscriptPeriod, transcriptPeriodOptions, activePage]);

  useEffect(() => {
    if (activePage !== "overview" || !stockData?.price || stockData.symbol !== ticker) return;

    const requestId = ++latestAiRequest.current;
    const timer = window.setTimeout(() => {
      setIsAiLoading(true);

      axios.get(`${API_URL}/api/ai-analysis/${ticker}`)
        .then((response) => {
          if (requestId === latestAiRequest.current) {
            setAiAnalysis(response.data);
          }
        })
        .catch((error) => console.error("AI analysis failed", error))
        .finally(() => {
          if (requestId === latestAiRequest.current) {
            setIsAiLoading(false);
          }
        });
    }, 4800);

    return () => window.clearTimeout(timer);
  }, [ticker, stockData?.price, stockData?.updatedAt, activePage]);

  useEffect(() => {
    if (activePage !== "overview" || !loadedStockSymbol || loadedStockSymbol !== ticker || isStockLoading) return;

    let isActive = true;
    let retryTimer;

    const loadSimilarCompanies = (attempt = 0) => {
      if (!isActive) return;
      let willRetry = false;
      setIsSimilarCompaniesLoading(true);

      axios.get(`${API_URL}/api/similar-companies/${ticker}`, { timeout: 18000 })
        .then((response) => {
          if (!isActive) return;
          const companies = response.data?.companies || [];
          if (!companies.length && attempt < 5) {
            willRetry = true;
            retryTimer = window.setTimeout(
              () => loadSimilarCompanies(attempt + 1),
              Math.min(8000, 1000 + attempt * 1300)
            );
            return;
          }
          setSimilarCompanies(companies);
        })
        .catch((error) => {
          console.error("Similar companies failed", error);
          if (!isActive) return;
          if (attempt < 5) {
            willRetry = true;
            retryTimer = window.setTimeout(
              () => loadSimilarCompanies(attempt + 1),
              Math.min(9000, 1200 + attempt * 1400)
            );
            return;
          }
          setSimilarCompanies([]);
        })
        .finally(() => {
          if (isActive && !willRetry) {
            setIsSimilarCompaniesLoading(false);
          }
        });
    };

    const startTimer = window.setTimeout(loadSimilarCompanies, 1800);

    return () => {
      isActive = false;
      window.clearTimeout(startTimer);
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, [ticker, loadedStockSymbol, isStockLoading, activePage]);

  /*
    LOAD EARNINGS ON START
  */

  useEffect(() => {
    if (activePage !== "earnings-calendar") return;

    const timer = window.setTimeout(
      () => loadEarnings(earningsWeekStart, calendarMode),
      0
    );

    return () => window.clearTimeout(timer);

  }, [activePage, earningsWeekStart, calendarMode]);

  useEffect(() => {
    if (activePage !== "earnings-calendar" || calendarMode !== "live-earnings" || !selectedLiveEarningsEvent?.symbol) return;
    const symbol = String(selectedLiveEarningsEvent.symbol || "").trim().toUpperCase();
    const currentResult = liveEarningsResults[symbol];
    if (currentResult?.status === "reported") return;
    const timer = window.setInterval(() => {
      loadLiveEarningsResult(selectedLiveEarningsEvent);
    }, 60 * 1000);
    return () => window.clearInterval(timer);
  }, [activePage, calendarMode, selectedLiveEarningsEvent, liveEarningsResults]);

  useEffect(() => {
    if (activePage !== "earnings-calendar" || calendarMode !== "live-earnings") return;
    const today = toLocalIsoDate(new Date());
    const todayEvents = getUsLiveEarningsEvents((earnings?.days || []).find((day) => day.date === today));
    if (!selectedLiveEarningsEvent?.symbol && todayEvents[0]?.symbol) {
      openLiveEarningsEvent(todayEvents[0]);
    }
    const symbols = todayEvents
      .map((event) => String(event?.symbol || "").trim().toUpperCase())
      .filter(Boolean);
    const hydrateKey = `${today}:${symbols.join(",")}`;
    if (!symbols.length || liveEarningsHydratedRef.current === hydrateKey) return;
    liveEarningsHydratedRef.current = hydrateKey;
    symbols.forEach((symbol, index) => {
      const event = todayEvents.find((item) => String(item?.symbol || "").trim().toUpperCase() === symbol);
      window.setTimeout(() => loadLiveEarningsResult(event, { silent: true }), index * 900);
    });
  }, [activePage, calendarMode, earnings]);

  useEffect(() => {
    if (activePage !== "treasury-rates") return;

    let isActive = true;
    const loadTreasuryRates = async () => {
      try {
        setIsTreasuryRatesLoading(true);
        setTreasuryRatesError("");
        const response = await axios.get(`${API_URL}/api/treasury-rates`, {
          params: { _: Date.now() },
          timeout: 9000
        });
        if (!isActive) return;
        setTreasuryRates(response.data || { rows: [], latest: null });
      } catch (err) {
        if (!isActive) return;
        console.error(err);
        setTreasuryRatesError("Treasury rates are not available yet.");
      } finally {
        if (isActive) setIsTreasuryRatesLoading(false);
      }
    };

    loadTreasuryRates();
    return () => {
      isActive = false;
    };
  }, [activePage]);

  useEffect(() => {
    if (activePage !== "news") return;

    let isActive = true;
    const loadGeneralNews = async () => {
      try {
        setIsGeneralNewsLoading(true);
        setGeneralNewsError("");
        const response = await axios.get(`${API_URL}/api/news`, {
          params: { limit: 36, _: Date.now() },
          timeout: 9000
        });
        if (!isActive) return;
        setGeneralNews(response.data || { articles: [] });
      } catch (err) {
        if (!isActive) return;
        console.error(err);
        setGeneralNewsError("News is not available yet.");
      } finally {
        if (isActive) setIsGeneralNewsLoading(false);
      }
    };

    loadGeneralNews();
    return () => {
      isActive = false;
    };
  }, [activePage]);

  useEffect(() => {
    if (activePage !== "overview" || !loadedStockSymbol || loadedStockSymbol !== ticker || isStockLoading) return;

    let isActive = true;
    setStockNews({ articles: [] });
    const timer = window.setTimeout(async () => {
      try {
        setIsStockNewsLoading(true);
        const response = await axios.get(`${API_URL}/api/news`, {
          params: { symbol: ticker, limit: 12, _: Date.now() },
          timeout: 9000
        });
        if (!isActive) return;
        setStockNews(response.data || { articles: [] });
      } catch (err) {
        if (!isActive) return;
        console.error("Stock news failed", err);
        setStockNews({ articles: [] });
      } finally {
        if (isActive) setIsStockNewsLoading(false);
      }
    }, 800);

    return () => {
      isActive = false;
      window.clearTimeout(timer);
    };
  }, [ticker, loadedStockSymbol, isStockLoading, activePage]);

  /*
    LOAD PORTFOLIO PRICES
  */



  /*
    LOAD COMPARISON STOCKS
  */

  useEffect(() => {
    const requestId = ++latestComparisonRequest.current;
    loadComparisonStocks(0, requestId);

  }, [compareTickers]);

  /*
    LOAD SINGLE STOCK
  */

  const loadStock = async (
    symbol = ticker,
    attempt = 0,
    requestId = Date.now()
  ) => {

    if (requestId !== latestStockRequest.current) return;

    const scheduleRetry = (delay) => {
      if (requestId !== latestStockRequest.current) return;
      if (stockRetryTimerRef.current) {
        window.clearTimeout(stockRetryTimerRef.current);
      }
      stockRetryTimerRef.current = window.setTimeout(
        () => loadStock(symbol, attempt + 1, requestId),
        delay
      );
    };

    try {
      const response =
        await axios.get(
          `${API_URL}/api/stock/${symbol}`,
          {
            params: { mode: financialChartMode },
            timeout: 9000
          }
        );

      if (requestId !== latestStockRequest.current) {
        return;
      }

      if (
        response.data.status === "pending"
      ) {
        const hasCachedStock = stockMemoryCacheRef.current.has(symbol);
        const shouldBlockForPending = !hasCachedStock && attempt < 8;
        setIsStockLoading(shouldBlockForPending);
        if (!hasCachedStock && !shouldBlockForPending) {
          setStockData((current) => current || {
            symbol,
            ticker: symbol,
            name: symbol,
            isPlaceholder: true,
            status: "pending",
            stockLoadError: "Still trying to load stock data."
          });
          firstStockLoadSettled.current = true;
        }
        const retryDelay = attempt < 10
          ? 650
          : Math.min(3500, 900 + (attempt - 10) * 150);
        scheduleRetry(retryDelay);

        return;
      }

      const previousStock =
        stockMemoryCacheRef.current.get(symbol) ||
        (stockData?.symbol === symbol || stockData?.ticker === symbol ? stockData : null);
      const hadCachedStock = stockMemoryCacheRef.current.has(symbol);
      const stableResponse = stabilizeRefreshingStockData(previousStock, response.data);
      stockMemoryCacheRef.current.set(symbol, stableResponse);
      setStockData(stableResponse);
      setIsStockLoading(false);
      firstStockLoadSettled.current = true;

      const needsFreshHistory =
        response.data.financialHistoryVersion !== FINANCIAL_HISTORY_VERSION ||
        !hasCompleteCoreChartData(stableResponse);
      const isQuarterlyView = financialChartMode === "quarterly";
      const needsInterimHistory =
        isQuarterlyView &&
        attempt < 40 &&
        countInterimRows(stableResponse.revenueData || []) < MIN_USABLE_INTERIM_HISTORY_ROWS;
      const needsQuarterlyHistory =
        isQuarterlyView &&
        attempt < 40 &&
        (
          response.data.interimHistoryVersion !== INTERIM_HISTORY_VERSION ||
          stableResponse.interimHistoryVersion !== INTERIM_HISTORY_VERSION ||
          countInterimRows(stableResponse.revenueData || []) < MIN_USABLE_INTERIM_HISTORY_ROWS
        );
      const needsExtendedHistory =
        attempt < 12 &&
        !stableResponse.financialHistoryCheckedAt &&
        !hasExtendedHistoricalChartData(stableResponse);
      const needsNewStockWarmup =
        (!hadCachedStock || attempt < 30) &&
        shouldKeepWarmingNewStock(stableResponse);
      const needsBackendRefresh =
        attempt < 30 &&
        Boolean(response.data?.refreshing);
      const shouldContinueStockWarmup =
        needsBackendRefresh ||
        needsNewStockWarmup ||
        needsFreshHistory ||
        needsInterimHistory ||
        needsQuarterlyHistory ||
        needsExtendedHistory;

      if (
        shouldContinueStockWarmup &&
        (
          needsFreshHistory ||
          needsInterimHistory ||
          needsQuarterlyHistory ||
          needsExtendedHistory ||
          needsNewStockWarmup ||
          needsBackendRefresh
        ) &&
        attempt < 90
      ) {
        const retryDelay =
          attempt < 10
            ? 900
            : attempt < 24
              ? 1200
              : 1400;
        scheduleRetry(retryDelay);
      }

      setPortfolioPrices((prev) => {
        if (watchlist.includes(symbol) && isChartQuoteDetail(savedSymbolDetails[symbol])) {
          return prev;
        }
        return {
          ...prev,
          [symbol]: stableResponse.price,
        };
      });

    } catch (error) {

      console.error(error);
      if (requestId !== latestStockRequest.current) return;

      if (error.response?.status === 400 || error.response?.status === 404) {
        setIsStockLoading(false);
        firstStockLoadSettled.current = true;
        return;
      }

      const hasCachedStock = stockMemoryCacheRef.current.has(symbol);
      const shouldBlockForError = !hasCachedStock && attempt < 8;
      setIsStockLoading(shouldBlockForError);
      if (!hasCachedStock && !shouldBlockForError) {
        setStockData((current) => current || {
          symbol,
          ticker: symbol,
          name: symbol,
          isPlaceholder: true,
          stockLoadError: "Still trying to load stock data."
        });
        firstStockLoadSettled.current = true;
      }
      scheduleRetry(Math.min(5000, 1000 + attempt * 350));

    }
  };

useEffect(() => {

  if (!hasLoadedSavedLists) return;

  const profileSettings = {
    watchlistTapeMoves
  };
  const hasSavedContent = Boolean(
    watchlist.length ||
    hasPortfolioPositions(portfolios) ||
    namedWatchlists.some((list) => (list.symbols || []).length)
    || Object.keys(savedProjections || {}).length ||
    profileSettings.watchlistTapeMoves
  );

  if (hasSavedContent) {
    setHasMeaningfulSavedLists(true);
  }

  localStorage.setItem(
    SAVED_LISTS_STORAGE_KEY,
    JSON.stringify({
      userId: getUserStorageId(user),
      savedAt: new Date().toISOString(),
      watchlist,
      portfolios,
      activePortfolioId,
      namedWatchlists,
      projections: savedProjections,
      profileSettings,
    })
  );

  if (!user || !hasLoadedRemoteUserData) return;

  const saveData = async () => {

    try {

      await axios.post(

    `${API_URL}/api/save-data`,

        {
          watchlist,
          portfolio,
          portfolios,
          activePortfolioId,
          namedWatchlists,
          projections: savedProjections,
          profileSettings,
        },
        {
          headers: {
            Authorization:
              `Bearer ${localStorage.getItem("token")}`,
          },
        }
      );

      console.log("Saved successfully");

    } catch (err) {

      console.error(
        "Save failed",
        err
      );

    }
  };

  const timeout =
    setTimeout(saveData, 1000);

  return () =>
    clearTimeout(timeout);

}, [watchlist, portfolios, activePortfolioId, namedWatchlists, savedProjections, watchlistTapeMoves, user, hasLoadedSavedLists, hasLoadedRemoteUserData]);
       
  
const loadUserData = async () => {
  try {
    const token = localStorage.getItem("token");
    let localSavedLists = {};
    try {
      localSavedLists = JSON.parse(
        localStorage.getItem(SAVED_LISTS_STORAGE_KEY) || "{}"
      );
    } catch (error) {
      console.error("Local saved lists read failed", error);
    }

    const response = await axios.get(
      `${API_URL}/api/user-data`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const remoteWatchlist = response.data.watchlist || [];
    const remotePortfolios = Array.isArray(response.data.portfolios) && response.data.portfolios.length
      ? response.data.portfolios
      : [{
          ...DEFAULT_PORTFOLIO,
          positions: response.data.portfolio || []
        }];
    const savedUser = JSON.parse(localStorage.getItem("user") || "null");
    const localBelongsToUser =
      Boolean(localSavedLists.userId) &&
      localSavedLists.userId === getUserStorageId(savedUser);
    const mergedWatchlist = localBelongsToUser && Array.isArray(localSavedLists.watchlist)
      ? normalizeSymbolList(localSavedLists.watchlist)
      : normalizeSymbolList([
          ...(localSavedLists.watchlist || []),
          ...remoteWatchlist
        ]);
    const mergedPortfolios = localBelongsToUser && Array.isArray(localSavedLists.portfolios)
      ? normalizePortfolios(localSavedLists.portfolios)
      : mergePortfolios(
          localSavedLists.portfolios || [],
          remotePortfolios
        );
    const mergedNamedWatchlists = localBelongsToUser && Array.isArray(localSavedLists.namedWatchlists)
      ? mergeNamedWatchlists(localSavedLists.namedWatchlists, [])
      : mergeNamedWatchlists(
          localSavedLists.namedWatchlists || [],
          response.data.namedWatchlists || []
        );
    const mergedProjections = {
      ...normalizeStockProjections(response.data.projections || {}),
      ...normalizeStockProjections(localSavedLists.projections || {})
    };
    const profileSettings = {
      ...(response.data.profileSettings || {}),
      ...(localSavedLists.profileSettings || {})
    };
    const preferredActivePortfolioId =
      localSavedLists.activePortfolioId ||
      response.data.activePortfolioId ||
      mergedPortfolios[0].id;
    const savedActivePortfolioId = mergedPortfolios.some(
      (item) => item.id === preferredActivePortfolioId
    )
      ? preferredActivePortfolioId
      : mergedPortfolios[0].id;

    setWatchlist(mergedWatchlist);
    setPortfolios(mergedPortfolios);
    setActivePortfolioId(savedActivePortfolioId);
    setNamedWatchlists(mergedNamedWatchlists);
    setSavedProjections(mergedProjections);
    if (typeof profileSettings.watchlistTapeMoves === "boolean") {
      setWatchlistTapeMoves(profileSettings.watchlistTapeMoves);
    }
    setHasMeaningfulSavedLists(
      Boolean(
        mergedWatchlist.length ||
        hasPortfolioPositions(mergedPortfolios) ||
        mergedNamedWatchlists.some((list) => (list.symbols || []).length) ||
        Object.keys(mergedProjections).length ||
        profileSettings.watchlistTapeMoves
      )
    );

    console.log("Loaded user data");
  } catch (err) {
    console.error(err);
  } finally {
    setHasLoadedSavedLists(true);
    setHasLoadedRemoteUserData(true);
  }
};
    
  /*
    LOAD EARNINGS
  */

  const loadEarnings = async (weekStart, mode = calendarMode) => {

    try {
      const requestMode = mode === "live-earnings" ? "earnings" : mode;
      const requestStart = mode === "live-earnings" ? getWeekStartIso(toLocalIsoDate(new Date())) : weekStart;
      const cacheKey = `${mode}:${requestStart}`;
      const cachedCalendar = calendarDataCache[cacheKey];
      const cachedCalendarHasEvents = cachedCalendar?.days?.some((day) => day.events?.length);
      if (cachedCalendarHasEvents) {
        setEarnings(cachedCalendar);
      }
      setIsEarningsLoading(true);
      setSelectedEarningsDate(mode === "live-earnings" ? toLocalIsoDate(new Date()) : weekStart);

      const earningsRes =
        await axios.get(

    `${API_URL}/api/calendar-events`,
          { params: { type: requestMode, start: requestStart, _: Date.now() }, timeout: 9000 }
        );

      const calendar = {
        ...(earningsRes.data || { days: [] }),
        type: mode,
        sourceType: requestMode
      };
      setEarnings(calendar);
      if ((calendar.days || []).some((day) => day.events?.length)) {
        setCalendarDataCache((cache) => ({
          ...cache,
          [cacheKey]: calendar
        }));
      }
      const availableDates = (calendar.days || []).map((day) => day.date);
      setSelectedEarningsDate((current) => {
        const today = toLocalIsoDate(new Date());
        const firstEventDate = availableDates.find((date) =>
          calendar.days.find((day) => day.date === date)?.events?.length
        );
        const currentDay = calendar.days.find((day) => day.date === current);
        if (mode === "live-earnings") return today;
        if (mode !== "earnings" && currentDay && !currentDay.events?.length && firstEventDate) {
          return firstEventDate;
        }
        if (availableDates.includes(current)) return current;
        if (availableDates.includes(today)) return today;
        return firstEventDate || availableDates[0] || weekStart;
      });

    } catch (err) {

      console.error(err);

    } finally {

      setIsEarningsLoading(false);

    }
  };

  const openCalendarEarningsReport = async (event) => {
    const symbol = String(event?.symbol || "").trim().toUpperCase();
    if (!symbol) return;
    setSelectedCalendarEvent(event);
    if (calendarEarningsReports[symbol]?.rows?.length) return;
    try {
      setLoadingCalendarReportSymbol(symbol);
      const response = await axios.get(
        `${API_URL}/api/earnings-report/${encodeURIComponent(symbol)}`,
        { params: { limit: 16 } }
      );
      setCalendarEarningsReports((reports) => ({
        ...reports,
        [symbol]: response.data || { symbol, rows: [] }
      }));
    } catch (err) {
      console.error(err);
      setCalendarEarningsReports((reports) => ({
        ...reports,
        [symbol]: { symbol, rows: [] }
      }));
    } finally {
      setLoadingCalendarReportSymbol("");
    }
  };

  const openLiveEarningsEvent = async (event) => {
    const symbol = String(event?.symbol || "").trim().toUpperCase();
    if (!symbol) return;
    setSelectedLiveEarningsEvent(event);
    await loadLiveEarningsResult(event);
  };

  const loadLiveEarningsResult = async (event, options = {}) => {
    const symbol = String(event?.symbol || "").trim().toUpperCase();
    if (!symbol) return;
    try {
      if (!options.silent) setLoadingLiveEarningsSymbol(symbol);
      const response = await axios.get(
        `${API_URL}/api/live-earnings/${encodeURIComponent(symbol)}`,
        {
          params: {
            date: event.date,
            epsEstimate: event.epsEstimate,
            revenueEstimate: event.revenueEstimate,
            _: Date.now()
          },
          timeout: 14000
        }
      );
      setLiveEarningsResults((results) => ({
        ...results,
        [symbol]: response.data || { symbol, status: "watching" }
      }));
    } catch (err) {
      console.error("Live earnings result failed", err);
      setLiveEarningsResults((results) => ({
        ...results,
        [symbol]: {
          symbol,
          status: "error",
          message: "Live earnings actuals are temporarily unavailable.",
          epsEstimate: event.epsEstimate,
          revenueEstimate: event.revenueEstimate,
          sources: []
        }
      }));
    } finally {
      if (!options.silent) setLoadingLiveEarningsSymbol("");
    }
  };

  /*
    LOAD PORTFOLIO PRICE
  */

  const applyPricePayload = (receivedPrices = {}, receivedDetails = {}, options = {}) => {
    const stockMarketIsOpen = getMarketClock(new Date()).tone === "open";
    const shouldPreserveChartPrice = (symbol) =>
      options.preserveTopWatchlistChartPrices &&
      watchlist.includes(symbol) &&
      (getMarketSymbolType(symbol) !== "stock" || stockMarketIsOpen) &&
      isChartQuoteDetail(savedSymbolDetails[symbol]) &&
      !isChartQuoteDetail(receivedDetails[symbol]);
    const acceptedPrices = {};
    const acceptedDetails = {};
    Object.entries(receivedPrices).forEach(([symbol, price]) => {
      if (!shouldPreserveChartPrice(symbol)) acceptedPrices[symbol] = price;
    });
    Object.entries(receivedDetails).forEach(([symbol, detail]) => {
      if (!shouldPreserveChartPrice(symbol)) acceptedDetails[symbol] = detail;
    });
    mergeSavedQuoteSnapshot(acceptedPrices, acceptedDetails);
    setSavedSymbolDetails((prev) => {
      const next = { ...prev };
      Object.entries(acceptedDetails).forEach(([symbol, detail]) => {
        const hasPercentChange = Object.prototype.hasOwnProperty.call(detail || {}, "percentChange");
        const hasChange = Object.prototype.hasOwnProperty.call(detail || {}, "change");
        next[symbol] = {
          ...prev[symbol],
          ...detail,
          percentChange: hasPercentChange
            ? (isNumber(detail?.percentChange) ? detail.percentChange : null)
            : prev[symbol]?.percentChange,
          change: hasChange
            ? (isNumber(detail?.change) ? detail.change : null)
            : prev[symbol]?.change
        };
      });
      return next;
    });
    setPortfolioPrices((prev) => {
      return { ...prev, ...acceptedPrices };
    });
  };

  const applyChartLatestToSavedPrice = (symbol, latest, fallbackDetails = {}) => {
    const cleanSymbol = String(symbol || "").trim().toUpperCase();
    if (!cleanSymbol || !isNumber(latest?.price)) return;
    applyPricePayload(
      { [cleanSymbol]: latest.price },
      {
        [cleanSymbol]: {
          ...fallbackDetails,
          change: latest.change,
          percentChange: latest.percentChange,
          previousClose: latest.previousClose,
          price: latest.price,
          source: fallbackDetails.source || "FMP 5-minute chart"
        }
      }
    );
  };

  const loadTopWatchlistChartPrices = async (symbols, attempt = 0) => {
    const cleanSymbols = [...new Set((symbols || [])
      .map((symbol) => String(symbol || "").trim().toUpperCase())
      .filter(Boolean))];
    if (!cleanSymbols.length) return;
    const retrySymbols = [];

    await Promise.all(cleanSymbols.map(async (symbol) => {
      const marketType = getMarketSymbolType(symbol);
      const endpoint = marketType === "crypto"
        ? `${API_URL}/api/crypto-price-history/${encodeURIComponent(symbol)}`
        : marketType === "forex"
          ? `${API_URL}/api/forex-price-history/${encodeURIComponent(symbol)}`
          : `${API_URL}/api/price-history/${encodeURIComponent(symbol)}`;
      try {
        const response = await axios.get(endpoint, {
          params: { range: "1D" },
          timeout: 8000
        });
        const latest = response.data?.latest;
        if (isNumber(latest?.price)) {
          applyChartLatestToSavedPrice(symbol, latest, {
            marketType,
            source: response.data?.source || "FMP 5-minute chart"
          });
        }
        if (response.data?.stale || response.data?.refreshing || !isNumber(latest?.price)) {
          retrySymbols.push(symbol);
        }
      } catch (error) {
        retrySymbols.push(symbol);
      }
    }));

    if (retrySymbols.length && attempt < 8) {
      window.setTimeout(
        () => loadTopWatchlistChartPrices(retrySymbols, attempt + 1),
        Math.min(60 * 1000, 5000 + attempt * 5000)
      );
    }
  };

  const loadTopWatchlistClosePrices = (symbols) => {
    const cleanSymbols = [...new Set((symbols || [])
      .map((symbol) => String(symbol || "").trim().toUpperCase())
      .filter((symbol) => symbol && getMarketSymbolType(symbol) === "stock"))];
    if (!cleanSymbols.length) return;
    loadSavedPrices(cleanSymbols, 0, { live: true, allowTopWatchlistQuoteOverwrite: true });
  };

  const refreshTopWatchlistMarketPrices = (symbols) => {
    const cleanSymbols = [...new Set((symbols || [])
      .map((symbol) => String(symbol || "").trim().toUpperCase())
      .filter(Boolean))];
    if (!cleanSymbols.length) return;
    const stockMarketIsOpen = getMarketClock(new Date()).tone === "open";
    const chartSymbols = cleanSymbols.filter((symbol) =>
      getMarketSymbolType(symbol) !== "stock" || stockMarketIsOpen
    );
    const closeSymbols = stockMarketIsOpen
      ? []
      : cleanSymbols.filter((symbol) => getMarketSymbolType(symbol) === "stock");
    loadTopWatchlistChartPrices(chartSymbols);
    loadTopWatchlistClosePrices(closeSymbols);
  };

  const loadSavedPrices = async (symbols, attempt = 0, options = {}) => {
    if (!symbols.length) return;
    const cleanSymbols = [...new Set(symbols
      .map((symbol) => String(symbol || "").trim().toUpperCase())
      .filter(Boolean))];
    if (!cleanSymbols.length) return;
    const maxAttempts = options.live ? 18 : 8;
    const retryDelay = Math.min(
      options.live ? 60 * 1000 : 90 * 1000,
      4000 + attempt * (options.live ? 3500 : 6000)
    );

    try {
      const symbolChunks = chunkSymbols(cleanSymbols, options.live ? 8 : 12);
      const receivedPrices = {};
      const receivedDetails = {};
      let anyChunkRefreshing = false;

      for (const symbolChunk of symbolChunks) {
        try {
          const response = await axios.get(
            `${API_URL}/api/prices`,
            {
              params: {
                symbols: symbolChunk.join(","),
                live: options.live ? "1" : undefined
              },
              timeout: options.live ? 10000 : 7000
            }
          );
          if (response.data?.refreshing) anyChunkRefreshing = true;
          const chunkPrices = response.data?.prices || {};
          const chunkDetails = response.data?.details || {};
          Object.assign(receivedPrices, chunkPrices);
          Object.assign(receivedDetails, chunkDetails);
          applyPricePayload(chunkPrices, chunkDetails, {
            preserveTopWatchlistChartPrices: !options.allowTopWatchlistQuoteOverwrite
          });
        } catch (chunkError) {
          if (attempt < maxAttempts) {
            window.setTimeout(
              () => loadSavedPrices(symbolChunk, attempt + 1, options),
              retryDelay
            );
          } else {
            console.error(chunkError);
          }
        }
      }

      const missingSymbols = cleanSymbols.filter(
        (symbol) =>
          !isNumber(receivedPrices[symbol]) ||
          !isNumber(receivedDetails[symbol]?.percentChange)
      );

      if (missingSymbols.length && attempt < maxAttempts) {
        window.setTimeout(
          () => loadSavedPrices(missingSymbols, attempt + 1, options),
          retryDelay
        );
      } else if (anyChunkRefreshing && attempt < maxAttempts) {
        window.setTimeout(
          () => loadSavedPrices(cleanSymbols, attempt + 1, options),
          retryDelay
        );
      }

    } catch (err) {
      if (attempt < maxAttempts) {
        window.setTimeout(() => loadSavedPrices(cleanSymbols, attempt + 1, options), retryDelay);
      } else {
        console.error(err);
      }

    }
  };

  const loadPortfolioPrice = async (symbol) => {
    await loadSavedPrices([symbol]);
  };

  /*
    LOAD COMPARISON STOCKS
  */

  const loadComparisonStocks = async (
    attempt = 0,
    requestId = latestComparisonRequest.current
  ) => {

    try {

      if (!compareTickers.length) {
        setCompareData([]);
        return;
      }

      const results =
        await Promise.all(

          compareTickers.map(async (symbol) => {

            try {
              const res = await axios.get(
                `${API_URL}/api/stock/${symbol}`
              );

              return res.data.status === "pending"
                ? { symbol, name: `Loading ${symbol}...`, status: "pending" }
                : res.data;
            } catch (error) {
              console.error(error);
              return { symbol, name: `Loading ${symbol}...`, status: "pending" };
            }

          })
        );

      if (requestId !== latestComparisonRequest.current) return;

      setCompareData(results);

      const needsRefresh = results.some((stock) =>
        stock.status === "pending" ||
        stock.refreshing ||
        !isNumber(stock.forwardPE) ||
        !isNumber(stock.priceToSales) ||
        !isNumber(stock.totalCash) ||
        !isNumber(stock.totalDebt) ||
        !isNumber(stock.fiftyTwoWeekHigh) ||
        !isNumber(stock.fiftyTwoWeekLow)
      );

      if (needsRefresh && attempt < 30) {
        setTimeout(
          () => loadComparisonStocks(attempt + 1, requestId),
          1000
        );
      }

    } catch (err) {

      console.error(err);

    }
  };

  const addComparisonTicker = (rawSymbol) => {
    const symbol = String(rawSymbol || "").trim().toUpperCase();
    if (!symbol) return false;
    if (warnStockOnlySymbol(symbol)) return false;
    if (compareTickers.includes(symbol)) return true;

    latestComparisonRequest.current += 1;
    setCompareData((items) =>
      items.some((item) => item.symbol === symbol)
        ? items
        : [...items, { symbol, name: `Loading ${symbol}...`, status: "pending" }]
    );
    setCompareTickers((items) =>
      items.includes(symbol) ? items : [...items, symbol]
    );
    return true;
  };

  const removeComparisonTicker = (symbol) => {
    latestComparisonRequest.current += 1;
    setCompareData((items) => items.filter((item) => item.symbol !== symbol));
    setCompareTickers((items) => items.filter((item) => item !== symbol));
  };

if (!stockData) {
  const fastDetails = savedSymbolDetails[ticker] || {};
  stockData = {
    name: fastDetails.name || (isStockLoading ? `Loading ${ticker}...` : ticker),
    symbol: ticker,
    logo: fastDetails.logo || null,
    price: portfolioPrices[ticker],
    change: fastDetails.change,
    percentChange: fastDetails.percentChange,
    revenueData: [],
    isPlaceholder: true
  };
}

const financialHistory =
  stockData?.revenueData || [];
const revenueHistorySource =
  buildChartRows(stockData?.revenueHistory || [], "revenue");

const allRevenueHistory =
  mergeChartRows(
    [
      ...buildChartRows(financialHistory, "revenue"),
      ...revenueHistorySource,
    ],
    "revenue"
  );
const revenueHistory = filterRowsByHistoryRange(
  filterChartRowsByMode(allRevenueHistory, financialChartMode),
  financialChartRange,
  financialChartMode
);

const allEarningsHistory =
  buildChartRows(financialHistory, "earnings");
const earningsHistory = filterRowsByHistoryRange(
  filterChartRowsByMode(allEarningsHistory, financialChartMode),
  financialChartRange,
  financialChartMode
);

const allEpsHistory =
  buildEpsChartRows(financialHistory, epsChartShareBasis);
const epsHistory = filterRowsByHistoryRange(
  filterChartRowsByMode(allEpsHistory, financialChartMode),
  financialChartRange,
  financialChartMode
);
const epsChartLabel = epsChartShareOption(epsChartShareBasis).label;
const epsBeatMissBaseRows = Array.isArray(stockData?.epsBeatMiss)
  ? stockData.epsBeatMiss
  : [];
const revenueGrowthRows = filterRowsByHistoryRange(
  buildAnnualGrowthRows(allRevenueHistory, "revenue"),
  financialChartRange,
  "annual"
);
const earningsGrowthRows = filterRowsByHistoryRange(
  buildAnnualGrowthRows(allEarningsHistory, "earnings"),
  financialChartRange,
  "annual"
);
const epsGrowthRows = filterRowsByHistoryRange(
  buildAnnualGrowthRows(allEpsHistory, "eps"),
  financialChartRange,
  "annual"
);
const currentChartYear = new Date().getFullYear();
const currentPoint = (key, value, transform = (item) => item) =>
  isNumber(value)
    ? [{
        year: currentChartYear,
        period: "Current",
        isInterim: true,
        isCurrent: true,
        [key]: transform(value),
      }]
    : [];
const chartRowsWithCurrentFallback = (rows, key, value, transform) =>
  rows.length ? rows : currentPoint(key, value, transform);
const chartRowsWithCurrentFallbackForMode = (rows, key, value, transform) =>
  financialChartMode === "quarterly"
    ? rows
    : chartRowsWithCurrentFallback(rows, key, value, transform);
const operatingCashflowHistory =
  chartRowsWithCurrentFallbackForMode(
    filterRowsByHistoryRange(
      filterChartRowsByMode(buildChartRows(financialHistory, "operatingCashflow"), financialChartMode),
      financialChartRange,
      financialChartMode
    ),
    "operatingCashflow",
    stockData?.operatingCashflow,
    (value) => value / 1e9
  );
const freeCashflowHistory =
  chartRowsWithCurrentFallbackForMode(
    filterRowsByHistoryRange(
      filterChartRowsByMode(buildChartRows(financialHistory, "freeCashflow"), financialChartMode),
      financialChartRange,
      financialChartMode
    ),
    "freeCashflow",
    stockData?.freeCashflow,
    (value) => value / 1e9
  );
const latestChartMetricDollars = (rows, key) => {
  const latest = [...(rows || [])]
    .filter((row) => isNumber(row?.[key]))
    .sort((a, b) => {
      const yearDiff = Number(a.year || 0) - Number(b.year || 0);
      if (yearDiff !== 0) return yearDiff;
      if (Boolean(a.isInterim) !== Boolean(b.isInterim)) {
        return a.isInterim ? 1 : -1;
      }
      return String(a.period || "").localeCompare(String(b.period || ""));
    })
    .at(-1);

  return latest ? latest[key] * 1e9 : null;
};
const latestFreeCashflowFromChart = latestChartMetricDollars(
  freeCashflowHistory,
  "freeCashflow"
);
const latestOperatingCashflowFromChart = latestChartMetricDollars(
  operatingCashflowHistory,
  "operatingCashflow"
);
const latestQuarterlyMetricValue = (rows, key) => {
  const latest = [...(rows || [])]
    .filter((row) => row?.isInterim && isNumber(row?.[key]))
    .sort((a, b) => {
      const yearDiff = Number(a.year || 0) - Number(b.year || 0);
      if (yearDiff !== 0) return yearDiff;
      return String(a.period || "").localeCompare(String(b.period || ""));
    })
    .at(-1);
  return latest ? latest[key] : null;
};
const latestQuarterlyFreeCashflowFromChart = latestQuarterlyMetricValue(
  freeCashflowHistory,
  "freeCashflow"
);
const latestQuarterlyOperatingCashflowFromChart = latestQuarterlyMetricValue(
  operatingCashflowHistory,
  "operatingCashflow"
);
const latestFreeCashflowMetricValue =
  isNumber(latestQuarterlyFreeCashflowFromChart)
    ? latestQuarterlyFreeCashflowFromChart * 1e9
    : isNumber(stockData?.freeCashflow)
      ? stockData.freeCashflow
      : latestFreeCashflowFromChart;
const latestOperatingCashflowMetricValue =
  isNumber(latestQuarterlyOperatingCashflowFromChart)
    ? latestQuarterlyOperatingCashflowFromChart * 1e9
    : isNumber(stockData?.operatingCashflow)
      ? stockData.operatingCashflow
      : latestOperatingCashflowFromChart;
const sharesOutstandingHistory =
  chartRowsWithCurrentFallbackForMode(
    filterRowsByHistoryRange(
      filterChartRowsByMode(buildChartRows(financialHistory, "weightedAverageShares"), financialChartMode),
      financialChartRange,
      financialChartMode
    ),
    "weightedAverageShares",
    firstNumber(stockData?.weightedAverageShares, stockData?.sharesOutstanding)
  );
const historicalPeHistoryBase = (stockData?.historicalPe || [])
  .map((row) => ({ ...row, period: row.period || String(row.year) }))
  .filter((row) =>
    row?.year &&
    (row.isInterim || row.isCurrent || row.year <= new Date().getFullYear() + 2) &&
    isNumber(row.pe)
  );
const annualHistoricalPeHistoryBase = filterChartRowsByMode(historicalPeHistoryBase, "annual");
const historicalPeHistory =
  filterRowsByHistoryRange(annualHistoricalPeHistoryBase, financialChartRange, "annual");
const allMarginHistory = (stockData?.marginHistory || [])
  .map((row) => ({ ...row, period: row.period || String(row.year) }))
  .filter((row) =>
    row?.year &&
    (row.isInterim || row.year <= new Date().getFullYear())
  );
const marginHistoryFromFinancials = (financialHistory || [])
  .map((row) => ({
    year: row.year,
    period: row.period || String(row.year),
    isInterim: Boolean(row.isInterim),
    isCurrent: Boolean(row.isCurrent),
    grossMargin: calculateMarginPercent(row.grossProfit, row.revenue),
    operatingMargin: calculateMarginPercent(row.operatingIncome, row.revenue),
    profitMargin: calculateMarginPercent(row.earnings, row.revenue),
    source: row.source
  }))
  .filter((row) =>
    row.year &&
    !row.isCurrent &&
    (
      isNumber(row.grossMargin) ||
      isNumber(row.operatingMargin) ||
      isNumber(row.profitMargin)
    )
  );
const mergedMarginHistory = mergeMultiMetricRows(
  [
    ...marginHistoryFromFinancials,
    ...allMarginHistory
  ],
  ["grossMargin", "operatingMargin", "profitMargin"]
);
const latestQuarterlyGrossMarginFromChart = latestQuarterlyMetricValue(
  mergedMarginHistory,
  "grossMargin"
);
const latestQuarterlyOperatingMarginFromChart = latestQuarterlyMetricValue(
  mergedMarginHistory,
  "operatingMargin"
);
const latestQuarterlyProfitMarginFromChart = latestQuarterlyMetricValue(
  mergedMarginHistory,
  "profitMargin"
);
const latestGrossMarginMetricValue = isNumber(latestQuarterlyGrossMarginFromChart)
  ? latestQuarterlyGrossMarginFromChart
  : null;
const latestOperatingMarginMetricValue = isNumber(latestQuarterlyOperatingMarginFromChart)
  ? latestQuarterlyOperatingMarginFromChart
  : null;
const latestProfitMarginMetricValue = isNumber(latestQuarterlyProfitMarginFromChart)
  ? latestQuarterlyProfitMarginFromChart
  : null;
const visibleMarginHistory = filterRowsByHistoryRange(
  filterChartRowsByMode(mergedMarginHistory, financialChartMode),
  financialChartRange,
  financialChartMode
);
const marginChartRowsWithFallback = (rows, key, value) =>
  financialChartMode === "quarterly"
    ? rows
    : chartRowsWithCurrentFallback(rows, key, value);
const grossMarginHistory = marginChartRowsWithFallback(
  visibleMarginHistory.filter((row) => isNumber(row.grossMargin)),
  "grossMargin",
  stockData?.grossMargins
);
const operatingMarginHistory = marginChartRowsWithFallback(
  visibleMarginHistory.filter((row) => isNumber(row.operatingMargin)),
  "operatingMargin",
  stockData?.operatingMargins
);
const profitMarginHistory = marginChartRowsWithFallback(
  visibleMarginHistory.filter((row) => isNumber(row.profitMargin)),
  "profitMargin",
  stockData?.profitMargins
);

const hasCompleteVisibleCoreChartData = hasCompleteCoreChartData(stockData || {});
const hasRealHistoryRows = (rows = []) =>
  rows.filter((row) => !row?.isCurrent).length >= 2;
const hasEnoughQuarterlyCoreRows = (rows = []) =>
  financialChartMode !== "quarterly" ||
  rows.filter((row) => !row?.isCurrent).length >= MIN_DISPLAY_INTERIM_HISTORY_ROWS;
const hasEnoughVisibleHistoryRows = (rows = []) =>
  rows.filter((row) => !row?.isCurrent).length >= (
    financialChartMode === "quarterly" ? 2 : 2
  );
const isAnnualHistoryRefreshPending =
  isStockLoading ||
  stockData?.financialHistoryVersion !== FINANCIAL_HISTORY_VERSION ||
  (
    !stockData?.financialHistoryCheckedAt &&
    (
      stockData?.refreshing ||
      stockData?.financialHistoryVersion !== FINANCIAL_HISTORY_VERSION
    )
  );
const currentInterimHistoryRowCount = countInterimRows(stockData?.revenueData || []);
const hasCheckedInterimHistory =
  stockData?.interimHistoryVersion === INTERIM_HISTORY_VERSION &&
  Boolean(stockData?.interimHistoryCheckedAt);
const isQuarterlyHistoryRefreshPending =
  isStockLoading ||
  (!hasCheckedInterimHistory && stockData?.interimHistoryVersion !== INTERIM_HISTORY_VERSION) ||
  (!hasCheckedInterimHistory && stockData?.refreshing && currentInterimHistoryRowCount < MIN_USABLE_INTERIM_HISTORY_ROWS) ||
  (
    !hasCheckedInterimHistory &&
    !stockData?.interimHistoryCheckedAt &&
    (
      stockData?.refreshing ||
      stockData?.interimHistoryVersion !== INTERIM_HISTORY_VERSION
    )
  );
const isHistoryRefreshPending =
  financialChartMode === "quarterly"
    ? isQuarterlyHistoryRefreshPending
    : isAnnualHistoryRefreshPending;
const shouldShowCoreHistoryLoading = (rows = []) =>
  !hasEnoughVisibleHistoryRows(rows) ||
  !hasEnoughQuarterlyCoreRows(rows);
const shouldShowHistoryLoading = (rows = []) =>
  !hasEnoughVisibleHistoryRows(rows) && isHistoryRefreshPending;
const shouldShowAnnualHistoryLoading = (rows = []) =>
  !hasRealHistoryRows(rows) && isAnnualHistoryRefreshPending;
const readyHistoryRows = (rows = []) =>
  hasEnoughVisibleHistoryRows(rows) ? rows : [];

const refreshQuarterlyChartHistory = () => {
  setFinancialChartMode("quarterly");
  const symbol = String(ticker || stockData?.symbol || "").trim().toUpperCase();
  if (!symbol) return;

  const hasWeakQuarterlyRows =
    stockData?.interimHistoryVersion !== INTERIM_HISTORY_VERSION ||
    countInterimRows(stockData?.revenueData || []) < MIN_USABLE_INTERIM_HISTORY_ROWS;
  if (!hasWeakQuarterlyRows) return;

  if (stockRetryTimerRef.current) {
    window.clearTimeout(stockRetryTimerRef.current);
    stockRetryTimerRef.current = null;
  }
  const requestId = ++latestStockRequest.current;
  loadStock(symbol, 0, requestId);
};

const estimateFromHistoryYear = (year, fallback = {}) => {
  const row = financialHistory.find(
    (item) => Number(item?.year) === year
  );

  if (!row) return fallback;

  return {
    fiscalYear: Number(row.year),
    label: `${row.year} Fiscal Year`,
    isActual: true,
    revenue: isNumber(row.revenue) ? row.revenue * 1e9 : fallback.revenue,
    earnings: isNumber(row.earnings) ? row.earnings * 1e9 : fallback.earnings,
    eps: isNumber(row.eps) ? row.eps : fallback.eps,
    ebitda: isNumber(row.ebitda) ? row.ebitda * 1e9 : fallback.ebitda,
    ebit: isNumber(row.ebit) ? row.ebit * 1e9 : fallback.ebit,
    sgaExpense: isNumber(row.sgaExpense) ? row.sgaExpense * 1e9 : fallback.sgaExpense
  };
};

const latestCompletedEstimateYear = [...financialHistory]
  .filter((row) =>
    Number.isFinite(Number(row?.year)) &&
    !row?.isInterim &&
    !row?.isCurrent &&
    Number(row.year) <= new Date().getFullYear() &&
    (isNumber(row.revenue) || isNumber(row.earnings) || isNumber(row.eps))
  )
  .sort((a, b) => Number(a.year) - Number(b.year))
  .at(-1)?.year;
const previousYearLabel = latestCompletedEstimateYear
  ? `${latestCompletedEstimateYear} Fiscal Year`
  : "Previous Year";
const previousYearEstimate = estimateFromHistoryYear(
  latestCompletedEstimateYear,
  stockData?.analystEstimates?.currentYear
);
const nextQuarterSource =
  stockData?.analystEstimates?.nextQuarter || {};
const nextQuarterEstimate = {
  revenue: isNumber(nextQuarterSource.revenue) ? nextQuarterSource.revenue : null,
  eps: isNumber(nextQuarterSource.eps) ? nextQuarterSource.eps : null,
  date: nextQuarterSource.date || null,
  fiscalQuarter: nextQuarterSource.fiscalQuarter || null,
  source: nextQuarterSource.source || null
};
const epsBeatMissRows = mergeUpcomingEpsBeatMissEstimate(
  epsBeatMissBaseRows,
  nextQuarterEstimate
);
const nextQuarterDate = nextQuarterEstimate.date
  ? new Date(`${nextQuarterEstimate.date}T12:00:00`)
  : null;
const nextQuarterDateLabel =
  nextQuarterDate && !Number.isNaN(nextQuarterDate.getTime())
    ? nextQuarterDate.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric"
    })
    : null;
const currentYearEstimate =
  stockData?.analystEstimates?.currentYear || {};
const nextYearSource =
  stockData?.analystEstimates?.nextYear || {};
const nextYearEstimate = {
  revenue: isNumber(nextYearSource.revenue) ? nextYearSource.revenue : null,
  earnings: isNumber(nextYearSource.earnings) ? nextYearSource.earnings : null,
  eps: isNumber(nextYearSource.eps) ? nextYearSource.eps : null,
  ebitda: isNumber(nextYearSource.ebitda) ? nextYearSource.ebitda : null,
  ebit: isNumber(nextYearSource.ebit) ? nextYearSource.ebit : null,
  sgaExpense: isNumber(nextYearSource.sgaExpense) ? nextYearSource.sgaExpense : null,
  fiscalYear: isNumber(nextYearSource.fiscalYear) ? nextYearSource.fiscalYear : null,
  numAnalystsRevenue: isNumber(nextYearSource.numAnalystsRevenue) ? nextYearSource.numAnalystsRevenue : null,
  numAnalystsEps: isNumber(nextYearSource.numAnalystsEps) ? nextYearSource.numAnalystsEps : null
};
const normalizeEstimateYear = (estimate = {}, fallback = {}) => ({
  fiscalYear: isNumber(estimate.fiscalYear) ? estimate.fiscalYear : fallback.fiscalYear,
  label: isNumber(estimate.fiscalYear)
    ? `${estimate.fiscalYear} Fiscal Year`
    : fallback.label || "Fiscal Year",
  revenue: isNumber(estimate.revenue) ? estimate.revenue : fallback.revenue ?? null,
  earnings: isNumber(estimate.earnings) ? estimate.earnings : fallback.earnings ?? null,
  eps: isNumber(estimate.eps) ? estimate.eps : fallback.eps ?? null,
  ebitda: isNumber(estimate.ebitda) ? estimate.ebitda : fallback.ebitda ?? null,
  ebit: isNumber(estimate.ebit) ? estimate.ebit : fallback.ebit ?? null,
  sgaExpense: isNumber(estimate.sgaExpense) ? estimate.sgaExpense : fallback.sgaExpense ?? null,
  numAnalystsRevenue: isNumber(estimate.numAnalystsRevenue) ? estimate.numAnalystsRevenue : null,
  numAnalystsEps: isNumber(estimate.numAnalystsEps) ? estimate.numAnalystsEps : null,
  source: estimate.source || fallback.source || null,
  isActual: Boolean(fallback.isActual)
});
const estimateFutureYearSources = Array.isArray(stockData?.analystEstimates?.futureYears)
  ? stockData.analystEstimates.futureYears
  : [];
const estimateFutureYears = estimateFutureYearSources
  .map((estimate) => normalizeEstimateYear(estimate))
  .filter((estimate) =>
    isNumber(estimate.fiscalYear) &&
    (
      isNumber(estimate.revenue) ||
      isNumber(estimate.earnings) ||
      isNumber(estimate.eps) ||
      isNumber(estimate.ebitda) ||
      isNumber(estimate.ebit) ||
      isNumber(estimate.sgaExpense)
    )
  )
  .sort((a, b) => a.fiscalYear - b.fiscalYear);
const estimateCurrentYearCard = normalizeEstimateYear(
  estimateFutureYears[0] || currentYearEstimate,
  currentYearEstimate
);
const estimateNextYearCard = normalizeEstimateYear(
  estimateFutureYears[1] || nextYearEstimate,
  nextYearEstimate
);
const estimateYearCards = [
  normalizeEstimateYear(previousYearEstimate, {
    fiscalYear: Number(latestCompletedEstimateYear),
    label: previousYearLabel,
    isActual: true
  }),
  ...(
    estimateFutureYears.length
      ? estimateFutureYears
      : [estimateCurrentYearCard, estimateNextYearCard].filter((estimate) =>
          isNumber(estimate.revenue) || isNumber(estimate.earnings) || isNumber(estimate.eps)
        )
  )
].filter((estimate, index, rows) =>
  (isNumber(estimate.fiscalYear) || index === 0) &&
  rows.findIndex((row) =>
    row.fiscalYear === estimate.fiscalYear &&
    Boolean(row.isActual) === Boolean(estimate.isActual)
  ) === index
);
const estimateMetricConfig = [
  { key: "revenue", label: "Revenue", format: formatEstimateMoney },
  { key: "earnings", label: "Net Income", format: formatEstimateMoney },
  { key: "eps", label: "EPS", format: formatEstimateEps },
  { key: "ebitda", label: "EBITDA Avg", format: formatEstimateMoney },
  { key: "ebit", label: "EBIT Avg", format: formatEstimateMoney },
  { key: "sgaExpense", label: "SG&A Expense Avg", format: formatEstimateMoney }
];
const estimateGrowthCells = estimateYearCards.slice(1).flatMap((estimate, index) => {
  const previousEstimate = estimateYearCards[index];
  return estimateMetricConfig.map((metric) => ({
    key: `${estimate.fiscalYear}-${metric.key}`,
    year: estimate.fiscalYear,
    metricKey: metric.key,
    metricLabel: metric.label,
    label: `${estimate.fiscalYear || "Future"} ${metric.label} Growth`,
    value: calculateEstimateGrowth(estimate[metric.key], previousEstimate?.[metric.key]),
    period: `${estimate.fiscalYear || "Future"} estimate vs. ${
      previousEstimate?.isActual
        ? `${previousEstimate.fiscalYear} actual`
        : `${previousEstimate?.fiscalYear || "prior year"} estimate`
    }`
  }));
});
const estimateGrowthRows = estimateMetricConfig.map((metric) => ({
  key: metric.key,
  label: `${metric.label} Growth`,
  cells: estimateGrowthCells.filter((cell) => cell.metricKey === metric.key)
}));
const availableFundamentalIndicatorGroups = FUNDAMENTAL_CHART_INDICATOR_GROUPS
  .map((group) => ({
    ...group,
    indicators: group.indicators
  }))
  .filter((group) => group.indicators.length);
const activeFundamentalIndicatorGroupDetails =
  availableFundamentalIndicatorGroups.find((group) => group.id === activeFundamentalIndicatorGroup) ||
  availableFundamentalIndicatorGroups[0] ||
  null;
const normalizedFundamentalMetricSearch = fundamentalMetricSearch.trim().toLowerCase();
const searchedFundamentalIndicators = normalizedFundamentalMetricSearch
  ? FUNDAMENTAL_CHART_INDICATORS.filter((indicator) =>
      [
        indicator.label,
        indicator.groupLabel,
        indicator.field,
        indicator.key,
        ...(indicator.aliases || [])
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedFundamentalMetricSearch))
    ).slice(0, 16)
  : [];
const selectedFundamentalIndicatorDetails = selectedFundamentalIndicators
  .map((key) => FUNDAMENTAL_CHART_INDICATORS.find((indicator) => indicator.key === key))
  .filter(Boolean);
const getFundamentalIndicatorValue = (period, indicator, previousPeriod = null) => {
  if (!period || !indicator) return null;
  if (indicator.growthOf) {
    const currentValue = period[indicator.growthOf.source]?.[indicator.growthOf.field];
    const previousValue = previousPeriod?.[indicator.growthOf.source]?.[indicator.growthOf.field];
    if (!isNumber(currentValue) || !isNumber(previousValue) || previousValue === 0) return null;
    return ((currentValue - previousValue) / Math.abs(previousValue)) * 100;
  }
  if (typeof indicator.calculate === "function") {
    return indicator.calculate(period);
  }
  const value = period[indicator.source]?.[indicator.field] ?? null;
  if (!isNumber(value) && Array.isArray(indicator.aliases)) {
    for (const alias of indicator.aliases) {
      const aliasValue = period[indicator.source]?.[alias];
      if (isNumber(aliasValue)) {
        return indicator.scalePercent ? normalizePercentMetric(aliasValue) : aliasValue;
      }
    }
  }
  if (!isNumber(value) && indicator.source === "metrics") {
    const fallbackValue = calculateFundamentalMetricFallback(period, indicator.field);
    if (isNumber(fallbackValue)) {
      return indicator.scalePercent ? normalizePercentMetric(fallbackValue) : fallbackValue;
    }
  }
  if (indicator.scalePercent && isNumber(value)) {
    return normalizePercentMetric(value);
  }
  return value;
};
const fundamentalChartSeries = selectedFundamentalIndicatorDetails.map((indicator) => {
  const rowMap = new Map();
  const latestValues = [];

  (fundamentalChartData?.tickers || []).forEach((tickerResult) => {
    let latestValue = null;
    let latestPeriod = null;

    const visibleTickerPeriods = filterRowsByHistoryRange(
      tickerResult.periods || [],
      fundamentalChartRange,
      fundamentalChartPeriod
    );

    visibleTickerPeriods.forEach((period, index) => {
      const previousPeriod = visibleTickerPeriods[index - 1] ||
        (tickerResult.periods || [])[(tickerResult.periods || []).findIndex((item) => item.key === period.key) - 1] ||
        null;
      const value = getFundamentalIndicatorValue(period, indicator, previousPeriod);
      if (!isNumber(value)) return;
      const comparablePeriod = comparableFundamentalPeriod(period, fundamentalChartPeriod);
      const periodKey = comparablePeriod.key;
      if (!rowMap.has(periodKey)) {
        rowMap.set(periodKey, {
          periodKey,
          period: comparablePeriod.label,
          date: period.date || null,
          sortValue: comparablePeriod.sortValue
        });
      }
      rowMap.get(periodKey)[tickerResult.symbol] = value;
      latestValue = value;
      latestPeriod = comparablePeriod.label;
    });

    latestValues.push({
      symbol: tickerResult.symbol,
      value: latestValue,
      period: latestPeriod
    });
  });

  const rows = [...rowMap.values()].sort((a, b) => {
    if (a.sortValue !== undefined && b.sortValue !== undefined && a.sortValue !== b.sortValue) {
      return a.sortValue - b.sortValue;
    }
    const dateA = a.date ? new Date(`${a.date}T12:00:00`).getTime() : 0;
    const dateB = b.date ? new Date(`${b.date}T12:00:00`).getTime() : 0;
    if (dateA && dateB) return dateA - dateB;
    return String(a.period).localeCompare(String(b.period));
  });

  return {
    indicator,
    rows,
    latestValues
  };
});

const maximizedFundamentalChart = maximizedFundamentalChartKey
  ? fundamentalChartSeries.find((series) => series.indicator.key === maximizedFundamentalChartKey)
  : null;
const combinedFundamentalChartRows = (() => {
  const rowMap = new Map();
  fundamentalChartSeries.forEach((series) => {
    series.rows.forEach((row) => {
      if (!rowMap.has(row.periodKey)) {
        rowMap.set(row.periodKey, {
          periodKey: row.periodKey,
          period: row.period,
          date: row.date || null,
          sortValue: row.sortValue
        });
      }
      const next = rowMap.get(row.periodKey);
      fundamentalChartTickers.forEach((symbol) => {
        if (isNumber(row[symbol])) {
          next[`${symbol}__${series.indicator.key}`] = row[symbol];
        }
      });
    });
  });

  return [...rowMap.values()].sort((a, b) => {
    if (a.sortValue !== undefined && b.sortValue !== undefined && a.sortValue !== b.sortValue) {
      return a.sortValue - b.sortValue;
    }
    const dateA = a.date ? new Date(`${a.date}T12:00:00`).getTime() : 0;
    const dateB = b.date ? new Date(`${b.date}T12:00:00`).getTime() : 0;
    if (dateA && dateB) return dateA - dateB;
    return String(a.period).localeCompare(String(b.period));
  });
})();
const combinedFundamentalChartLines = fundamentalChartSeries.flatMap((series, metricIndex) =>
  fundamentalChartTickers.map((symbol, symbolIndex) => ({
    key: `${symbol}__${series.indicator.key}`,
    symbol,
    indicator: series.indicator,
    label: `${symbol} · ${series.indicator.label}`,
    color: PORTFOLIO_COLORS[(metricIndex * Math.max(fundamentalChartTickers.length, 1) + symbolIndex) % PORTFOLIO_COLORS.length]
  }))
);

const getFundamentalCompanyMeta = (symbol) => {
  const cleanSymbol = String(symbol || "").trim().toUpperCase();
  const details = savedSymbolDetails[cleanSymbol] || {};
  return {
    symbol: cleanSymbol,
    name: details.name || cleanSymbol,
    logo: getDisplayCompanyLogoUrl(cleanSymbol, details.logo)
  };
};

const renderFundamentalChartCompanies = (prefix = "chart") => (
  <div className="fundamental-chart-card-companies" aria-label="Companies shown on this chart">
    {fundamentalChartTickers.map((symbol, index) => {
      const company = getFundamentalCompanyMeta(symbol);
      const color = PORTFOLIO_COLORS[index % PORTFOLIO_COLORS.length];
      return (
        <span className="fundamental-chart-card-company" key={`${prefix}-company-${symbol}`}>
          <span className="fundamental-chart-card-logo" style={{ "--series-color": color }} aria-hidden="true">
            {company.logo ? (
              <img
                src={company.logo}
                alt=""
                loading="lazy"
                decoding="async"
                crossOrigin="anonymous"
                onLoad={(event) => handleCompanyLogoLoad(event)}
                onError={(event) => handleCompanyLogoError(event, company.symbol)}
              />
            ) : (
              company.symbol.slice(0, 1)
            )}
          </span>
          <span>
            <strong>{company.symbol}</strong>
            <small>{company.name}</small>
          </span>
        </span>
      );
    })}
  </div>
);

const renderFundamentalChartBrand = () => (
  <div className="fundamental-chart-card-brand" aria-label="Powered by MrktRally">
    <img src="/mrktrally-icon.png" alt="" />
    <span>Powered by <strong>MrktRally</strong></span>
  </div>
);

const renderFundamentalLineChart = (series, height = 320) => (
  <ResponsiveContainer width="100%" height={height}>
    <LineChart
      data={series.rows}
      margin={{ top: 12, right: 18, left: 8, bottom: 8 }}
    >
      <CartesianGrid stroke="#1f2937" strokeDasharray="4 4" />
      <XAxis
        dataKey="period"
        tick={{ fill: "#94a3b8", fontSize: 12 }}
        minTickGap={18}
      />
      <YAxis
        tick={{ fill: "#94a3b8", fontSize: 12 }}
        tickFormatter={(value) => formatFundamentalAxisValue(value, series.indicator)}
        width={76}
      />
      <Tooltip
        shared={false}
        content={(
          <FundamentalChartTooltip
            indicator={series.indicator}
            hoveredPoint={fundamentalHoveredPoint}
          />
        )}
      />
      {fundamentalChartTickers.map((symbol, index) => {
        const color = PORTFOLIO_COLORS[index % PORTFOLIO_COLORS.length];
        return (
          <Line
            key={`${series.indicator.key}-${symbol}`}
            type="monotone"
            dataKey={symbol}
            stroke={color}
            strokeWidth={2.4}
            dot={(props) => renderFundamentalChartDot(props, {
              indicator: series.indicator,
              symbol,
              color
            })}
            activeDot={(props) => renderFundamentalChartDot(props, {
              indicator: series.indicator,
              symbol,
              color,
              active: true
            })}
            connectNulls
          />
        );
      })}
    </LineChart>
  </ResponsiveContainer>
);
const renderCombinedFundamentalLineChart = (height = 560) => (
  <ResponsiveContainer width="100%" height={height}>
    <LineChart
      data={combinedFundamentalChartRows}
      margin={{ top: 14, right: 22, left: 8, bottom: 8 }}
    >
      <CartesianGrid stroke="#1f2937" strokeDasharray="4 4" />
      <XAxis
        dataKey="period"
        tick={{ fill: "#94a3b8", fontSize: 12 }}
        minTickGap={18}
      />
      <YAxis
        tick={{ fill: "#94a3b8", fontSize: 12 }}
        tickFormatter={formatLargeNumber}
        width={82}
      />
      <Tooltip
        content={<CombinedFundamentalChartTooltip lines={combinedFundamentalChartLines} />}
      />
      {combinedFundamentalChartLines.map((line) => (
        <Line
          key={line.key}
          type="monotone"
          dataKey={line.key}
          name={line.key}
          stroke={line.color}
          strokeWidth={2.2}
          dot={false}
          activeDot={{ r: 5, fill: "#08111f", stroke: line.color, strokeWidth: 2 }}
          connectNulls
        />
      ))}
    </LineChart>
  </ResponsiveContainer>
);
const renderFundamentalChartDot = (props, options = {}) => {
  const { cx, cy, value, payload } = props || {};
  const { indicator, symbol, color, active = false } = options;
  if (!isNumber(cx) || !isNumber(cy) || !isNumber(value) || !indicator || !symbol) return null;

  const period = payload?.period || payload?.periodKey || "";
  const point = {
    indicatorKey: indicator.key,
    period,
    periodKey: payload?.periodKey || period,
    symbol,
    value,
    color
  };

  return (
    <circle
      cx={cx}
      cy={cy}
      r={active ? 7 : 4}
      fill="#08111f"
      stroke={color}
      strokeWidth={active ? 3 : 2}
      tabIndex={0}
      role="img"
      aria-label={`${symbol} ${indicator.label} ${period}: ${formatFundamentalChartValue(value, indicator)}`}
      onFocus={() => setFundamentalHoveredPoint(point)}
      onMouseEnter={() => setFundamentalHoveredPoint(point)}
    />
  );
};
const projectionEstimateGrowthByYear = estimateYearCards.slice(1).reduce((items, estimate, index) => {
  const projectionYear = PROJECTION_YEARS[index];
  const previousEstimate = estimateYearCards[index];
  if (!projectionYear || !previousEstimate) return items;
  return {
    ...items,
    [projectionYear]: {
      revenue: calculateEstimateGrowth(estimate.revenue, previousEstimate.revenue),
      earnings: calculateEstimateGrowth(estimate.earnings, previousEstimate.earnings)
    }
  };
}, {});
const currentYearRevenueGrowth = calculateEstimateGrowth(
  estimateCurrentYearCard?.revenue,
  previousYearEstimate?.revenue
);
const currentYearEarningsGrowth = calculateEstimateGrowth(
  estimateCurrentYearCard?.earnings,
  previousYearEstimate?.earnings
);
const projectionSymbol = String(stockData?.symbol || ticker || "").toUpperCase();
const projectionSettingsByCase =
  savedProjections[projectionSymbol] ||
  Object.fromEntries(
    PROJECTION_CASES.map((projectionCase) => [
      projectionCase.id,
      createProjectionCaseSettings()
    ])
  );
const updateProjectionSetting = (caseId, key, year, value) => {
  setSavedProjections((items) => {
    const symbolCases = items[projectionSymbol] || {};

    return {
      ...items,
      [projectionSymbol]: {
        ...symbolCases,
        [caseId]: {
          ...normalizeProjectionCaseSettings(symbolCases[caseId]),
          [key]: {
            ...(symbolCases[caseId]?.[key] || {}),
            [year]: value
          }
        }
      }
    };
  });
};
const getProjectionInputValue = (caseId, key, year) => {
  const caseSettings = normalizeProjectionCaseSettings(projectionSettingsByCase[caseId]);
  const savedValue = caseSettings?.[key]?.[year];
  if (savedValue !== undefined) return savedValue;

  if (key === "revenueGrowth" && isNumber(projectionEstimateGrowthByYear[year]?.revenue)) {
    return projectionEstimateGrowthByYear[year].revenue.toFixed(2);
  }

  if (key === "netIncomeGrowth" && isNumber(projectionEstimateGrowthByYear[year]?.earnings)) {
    return projectionEstimateGrowthByYear[year].earnings.toFixed(2);
  }

  return getProjectionAssumptionValue(caseSettings, key, year);
};
const projectionSharesHistoryRows = buildChartRows(financialHistory, "weightedAverageShares");
const latestQuarterlySharesOutstandingFromChart = latestQuarterlyMetricValue(
  projectionSharesHistoryRows,
  "weightedAverageShares"
);
const latestSharesOutstandingFromChart = [...projectionSharesHistoryRows]
  .filter((row) => isNumber(row?.weightedAverageShares))
  .sort((a, b) => {
    const yearDiff = Number(a.year || 0) - Number(b.year || 0);
    if (yearDiff !== 0) return yearDiff;
    return String(a.period || "").localeCompare(String(b.period || ""), undefined, { numeric: true });
  })
  .at(-1)?.weightedAverageShares;
const projectionShareBaseMillions = firstNumber(
  latestQuarterlySharesOutstandingFromChart,
  latestSharesOutstandingFromChart,
  stockData?.weightedAverageShares,
  stockData?.sharesOutstanding
);
const projectionShareBase =
  isNumber(projectionShareBaseMillions) && projectionShareBaseMillions > 0
    ? projectionShareBaseMillions * 1000000
    : isNumber(estimateCurrentYearCard?.earnings) && isNumber(estimateCurrentYearCard?.eps) && estimateCurrentYearCard.eps !== 0
      ? estimateCurrentYearCard.earnings / estimateCurrentYearCard.eps
      : null;
const buildProjectionRows = (caseId) => PROJECTION_YEARS.reduce((rows, year) => {
  const previousRow = rows.at(-1);
  const isBaseYear = year === PROJECTION_YEARS[0];
  const revenueGrowthRate = isBaseYear
    ? null
    : parseInputPercent(getProjectionInputValue(caseId, "revenueGrowth", year)) ?? 0;
  const netIncomeGrowthRate = isBaseYear
    ? null
    : parseInputPercent(getProjectionInputValue(caseId, "netIncomeGrowth", year)) ?? 0;
  const sharesGrowthRate = isBaseYear
    ? parseInputPercent(getProjectionInputValue(caseId, "sharesGrowth", year)) ?? 0
    : parseInputPercent(getProjectionInputValue(caseId, "sharesGrowth", year)) ?? 0;
  const baseRevenueOverride = parseProjectionMoneyInput(getProjectionInputValue(caseId, "revenue", year));
  const baseNetIncomeOverride = parseProjectionMoneyInput(getProjectionInputValue(caseId, "netIncome", year));
  const baseSharesOverride = parseProjectionSharesInput(getProjectionInputValue(caseId, "shares", year));
  const hasBaseNetIncomeOverride = baseNetIncomeOverride !== null;
  const hasBaseSharesOverride = baseSharesOverride !== null;
  const revenue = isBaseYear
    ? firstNumber(baseRevenueOverride, estimateCurrentYearCard?.revenue)
    : isNumber(previousRow?.revenue)
      ? previousRow.revenue * (1 + revenueGrowthRate)
      : null;
  const netIncome = isBaseYear
    ? firstNumber(baseNetIncomeOverride, estimateCurrentYearCard?.earnings)
    : isNumber(previousRow?.netIncome)
      ? projectNetIncomeWithGrowth(previousRow.netIncome, netIncomeGrowthRate)
      : null;
  const shares = isBaseYear
    ? firstNumber(baseSharesOverride, projectionShareBase)
    : isNumber(previousRow?.shares)
      ? previousRow.shares * (1 + sharesGrowthRate)
      : null;
  const eps = isBaseYear && isNumber(estimateCurrentYearCard?.eps) && !hasBaseNetIncomeOverride && !hasBaseSharesOverride
    ? estimateCurrentYearCard.eps
    : isNumber(netIncome) && isNumber(shares) && shares !== 0
      ? netIncome / shares
      : null;
  const lowPe = parseInputNumber(getProjectionInputValue(caseId, "lowPe", year));
  const highPe = parseInputNumber(getProjectionInputValue(caseId, "highPe", year));
  const lowPrice = isNumber(eps) && isNumber(lowPe) ? eps * lowPe : null;
  const highPrice = isNumber(eps) && isNumber(highPe) ? eps * highPe : null;
  const currentPrice = stockData?.price;

  rows.push({
    year,
    revenue,
    revenueGrowth: isBaseYear ? currentYearRevenueGrowth : revenueGrowthRate * 100,
    netIncome,
    netIncomeGrowth: isBaseYear ? currentYearEarningsGrowth : netIncomeGrowthRate * 100,
    netIncomeMargin: isNumber(netIncome) && isNumber(revenue) && revenue !== 0
      ? (netIncome / revenue) * 100
      : null,
    shares,
    sharesGrowth: sharesGrowthRate * 100,
    eps,
    lowPe,
    highPe,
    lowPrice,
    highPrice,
    lowReturn: isNumber(lowPrice) && isNumber(currentPrice) && currentPrice > 0
      ? ((lowPrice / currentPrice) - 1) * 100
      : null,
    highReturn: isNumber(highPrice) && isNumber(currentPrice) && currentPrice > 0
      ? ((highPrice / currentPrice) - 1) * 100
      : null
  });

  return rows;
}, []);
const projectionYearsToTerminal = PROJECTION_YEARS.at(-1) - PROJECTION_YEARS[0];
const projectionCases = PROJECTION_CASES.map((projectionCase) => {
  const rows = buildProjectionRows(projectionCase.id);
  const terminalRow = rows.at(-1) || {};

  return {
    ...projectionCase,
    rows,
    lowCagr: isNumber(terminalRow.lowReturn) && projectionYearsToTerminal > 0
      ? terminalRow.lowReturn / projectionYearsToTerminal
      : null,
    highCagr: isNumber(terminalRow.highReturn) && projectionYearsToTerminal > 0
      ? terminalRow.highReturn / projectionYearsToTerminal
      : null
  };
});
const areEstimatesRefreshing =
  (isStockLoading ||
    stockData?.financialHistoryVersion !== FINANCIAL_HISTORY_VERSION ||
    stockData?.estimateDataVersion !== STOCK_ESTIMATE_VERSION) &&
  (
    !isNumber(nextQuarterEstimate?.revenue) ||
    !isNumber(nextQuarterEstimate?.eps) ||
    !isNumber(currentYearEstimate?.revenue) ||
    !isNumber(currentYearEstimate?.eps) ||
    !isNumber(nextYearEstimate?.revenue) ||
    !isNumber(nextYearEstimate?.eps)
  );
const isNextQuarterRefreshing =
  (isStockLoading ||
    stockData?.refreshing ||
    stockData?.estimateDataVersion !== STOCK_ESTIMATE_VERSION ||
    !stockData?.quarterEstimateCheckedAt) &&
  (
    !isNumber(nextQuarterEstimate?.revenue) ||
    !isNumber(nextQuarterEstimate?.eps) ||
    !nextQuarterDateLabel
  );
const hasUsableMetricSnapshot =
  !stockData?.isPlaceholder &&
  (
    isNumber(stockData?.marketCap) ||
    isNumber(stockData?.pe) ||
    isNumber(stockData?.forwardPE) ||
    isNumber(stockData?.forwardPS) ||
    isNumber(stockData?.priceToSales) ||
    isNumber(stockData?.priceToBook) ||
    isNumber(stockData?.priceToFreeCashflow) ||
    isNumber(stockData?.priceToOperatingCashflow) ||
    isNumber(stockData?.totalCash) ||
    isNumber(stockData?.totalDebt) ||
    isNumber(stockData?.cashAndCashEquivalents) ||
    isNumber(stockData?.netCash) ||
    isNumber(stockData?.netCashPerShare) ||
    isNumber(stockData?.equityBookValue) ||
    isNumber(stockData?.bookValuePerShare) ||
    isNumber(stockData?.workingCapital) ||
    isNumber(stockData?.revenueGrowth) ||
    isNumber(stockData?.earningsGrowth) ||
    isNumber(stockData?.grossMargins) ||
    isNumber(stockData?.profitMargins) ||
    isNumber(stockData?.revenuePerEmployee) ||
    isNumber(stockData?.profitsPerEmployee) ||
    isNumber(stockData?.employeeCount) ||
    isNumber(stockData?.fiftyTwoWeekHigh) ||
    isNumber(stockData?.fiftyTwoWeekLow) ||
    isNumber(latestFreeCashflowFromChart) ||
    isNumber(latestOperatingCashflowFromChart)
  );
const isInitialStockLoad = isStockLoading && (!stockData?.symbol || stockData?.isPlaceholder);
const hasOverviewExtrasExhausted =
  stockOverviewExtrasExhaustedSymbol &&
  stockOverviewExtrasExhaustedSymbol === String(stockData?.symbol || ticker || "").trim().toUpperCase();
const hasCurrentFmpValuationMetrics = stockData?.valuationMetricsVersion === VALUATION_METRICS_VERSION;
const hasCurrentFmpBalanceMetrics = stockData?.balanceSheetMetricsVersion === BALANCE_SHEET_METRICS_VERSION;
const hasValuationMetricRequestFinished = hasValuationMetricRequestSettled(stockData || {});
const hasBalanceSheetMetricRequestFinished = hasBalanceSheetMetricRequestSettled(stockData || {});
const areValuationMetricsRefreshing =
  !hasOverviewExtrasExhausted &&
  (isInitialStockLoad || !hasValuationMetricRequestFinished);
const isBalanceSheetMetricsRefreshing =
  !hasOverviewExtrasExhausted &&
  (isInitialStockLoad || !hasBalanceSheetMetricRequestFinished);
const areMetricsRefreshing =
  !hasOverviewExtrasExhausted &&
  (isInitialStockLoad ||
    (!hasUsableMetricSnapshot &&
      (!hasValuationMetricRequestFinished || !hasBalanceSheetMetricRequestFinished)
    )
  );
const isProfileMetricsRefreshing =
  !hasOverviewExtrasExhausted &&
  (isInitialStockLoad || !hasProfileMetricSnapshot(stockData || {}));
const isShareFloatMetricsRefreshing =
  !hasOverviewExtrasExhausted &&
  (isInitialStockLoad || !hasShareFloatMetricSnapshot(stockData || {}));
const shouldShowHistoricalPeLoading = (rows = []) =>
  !hasRealHistoryRows(rows) &&
  (
    isInitialStockLoad ||
    (!stockData?.historicalPeCheckedAt && stockData?.refreshing)
  );
const stockValue = (value) =>
  areMetricsRefreshing && (value === "N/A" || value === null || value === undefined)
    ? "Loading..."
    : value;
const metricValue = (value) =>
  areMetricsRefreshing && (value === "N/A" || value === null || value === undefined)
    ? "Loading..."
    : stockValue(value);
const balanceSheetValue = (value) =>
  (areMetricsRefreshing || isBalanceSheetMetricsRefreshing) &&
  (value === "N/A" || value === null || value === undefined)
    ? "Loading..."
    : stockValue(value);
const profileMetricValue = (value) =>
  isProfileMetricsRefreshing && (value === "N/A" || value === null || value === undefined)
    ? "Loading..."
    : stockValue(value);
const shareFloatMetricValue = (value) =>
  isShareFloatMetricsRefreshing && (value === "N/A" || value === null || value === undefined)
    ? "Loading..."
    : stockValue(value);
const hasMetricCardValue = (value) =>
  isNumber(value) || (typeof value === "string" && value.trim() && value !== "N/A");
const shouldRenderMetricCard = (value) =>
  hasMetricCardValue(value) ||
  areMetricsRefreshing ||
  areValuationMetricsRefreshing ||
  isBalanceSheetMetricsRefreshing;
const fmpMetricValue = (value) =>
  hasCurrentFmpValuationMetrics || hasMetricCardValue(value) ? value : null;
const fmpBalanceValue = (value) =>
  hasCurrentFmpBalanceMetrics || hasMetricCardValue(value) ? value : null;
const metricCardItems = [
  { label: "Market Cap", raw: stockData.marketCap, value: metricValue(formatBillions(stockData.marketCap)) },
  { label: "Beta", raw: stockData.beta, value: metricValue(formatPlain(stockData.beta)) },
  { label: "Volume", raw: stockData.volume, value: metricValue(formatLargeNumber(stockData.volume)) },
  { label: "Last Dividend", raw: stockData.lastDividend, value: metricValue(formatPrice(stockData.lastDividend)) },
  { label: "50-Day Avg", raw: stockData.priceAvg50, value: metricValue(formatPrice(stockData.priceAvg50)) },
  { label: "200-Day Avg", raw: stockData.priceAvg200, value: metricValue(formatPrice(stockData.priceAvg200)) },
  { label: "Cash & ST Investments", raw: fmpBalanceValue(stockData.cashAndCashEquivalents ?? stockData.totalCash), value: balanceSheetValue(formatBillions(fmpBalanceValue(stockData.cashAndCashEquivalents ?? stockData.totalCash))) },
  { label: "Total Debt", raw: fmpBalanceValue(stockData.totalDebt), value: balanceSheetValue(formatBillions(fmpBalanceValue(stockData.totalDebt))) },
  { label: "Net Cash", raw: fmpBalanceValue(stockData.netCash), value: balanceSheetValue(formatBillions(fmpBalanceValue(stockData.netCash))) },
  { label: "Net Cash / Share", raw: fmpBalanceValue(stockData.netCashPerShare), value: balanceSheetValue(formatPrice(fmpBalanceValue(stockData.netCashPerShare))) },
  { label: "Equity Book Value", raw: fmpBalanceValue(stockData.equityBookValue), value: balanceSheetValue(formatBillions(fmpBalanceValue(stockData.equityBookValue))) },
  { label: "Book Value / Share", raw: fmpMetricValue(stockData.bookValuePerShare), value: metricValue(formatPrice(fmpMetricValue(stockData.bookValuePerShare))) },
  { label: "Working Capital", raw: fmpBalanceValue(stockData.workingCapital), value: balanceSheetValue(formatBillions(fmpBalanceValue(stockData.workingCapital))) },
  { label: "TTM P/E", raw: fmpMetricValue(stockData.pe), value: metricValue(formatPlain(fmpMetricValue(stockData.pe))) },
  { label: "Forward P/E", raw: fmpMetricValue(stockData.forwardPE), value: metricValue(formatPlain(fmpMetricValue(stockData.forwardPE))) },
  { label: "Forward P/S", raw: fmpMetricValue(stockData.forwardPS), value: metricValue(formatPlain(fmpMetricValue(stockData.forwardPS))) },
  { label: "PEG Ratio TTM", raw: fmpMetricValue(stockData.pegRatio), value: metricValue(formatPlain(fmpMetricValue(stockData.pegRatio))) },
  { label: "Forward PEG", raw: fmpMetricValue(stockData.forwardPegRatio), value: metricValue(formatPlain(fmpMetricValue(stockData.forwardPegRatio))) },
  { label: "Price-to-Sales", raw: fmpMetricValue(stockData.priceToSales), value: metricValue(formatPlain(fmpMetricValue(stockData.priceToSales))) },
  { label: "Price-to-Book", raw: fmpMetricValue(stockData.priceToBook), value: metricValue(formatPlain(fmpMetricValue(stockData.priceToBook))) },
  { label: "Price / Fair Value", raw: fmpMetricValue(stockData.priceToFairValue), value: metricValue(formatPlain(fmpMetricValue(stockData.priceToFairValue))) },
  { label: "P/TBV Ratio", raw: fmpMetricValue(stockData.priceToTangibleBook), value: metricValue(formatPlain(fmpMetricValue(stockData.priceToTangibleBook))) },
  { label: "P/FCF Ratio", raw: fmpMetricValue(stockData.priceToFreeCashflow), value: metricValue(formatPlain(fmpMetricValue(stockData.priceToFreeCashflow))) },
  { label: "P/OCF Ratio", raw: fmpMetricValue(stockData.priceToOperatingCashflow), value: metricValue(formatPlain(fmpMetricValue(stockData.priceToOperatingCashflow))) },
  { label: "Enterprise Value", raw: fmpMetricValue(stockData.enterpriseValue), value: metricValue(formatBillions(fmpMetricValue(stockData.enterpriseValue))) },
  { label: "EV / Sales", raw: fmpMetricValue(stockData.evToSales), value: metricValue(formatPlain(fmpMetricValue(stockData.evToSales))) },
  { label: "EV / EBITDA", raw: fmpMetricValue(stockData.evToEbitda), value: metricValue(formatPlain(fmpMetricValue(stockData.evToEbitda))) },
  { label: "EV / OCF", raw: fmpMetricValue(stockData.evToOperatingCashflow), value: metricValue(formatPlain(fmpMetricValue(stockData.evToOperatingCashflow))) },
  { label: "EV / FCF", raw: fmpMetricValue(stockData.evToFreeCashflow), value: metricValue(formatPlain(fmpMetricValue(stockData.evToFreeCashflow))) },
  { label: "Net Debt / EBITDA", raw: fmpMetricValue(stockData.netDebtToEbitda), value: metricValue(formatPlain(fmpMetricValue(stockData.netDebtToEbitda))) },
  { label: "FCF Yield", raw: fmpMetricValue(stockData.fcfYield), value: metricValue(formatPercent(fmpMetricValue(stockData.fcfYield))) },
  { label: "Earnings Yield", raw: fmpMetricValue(stockData.earningsYield), value: metricValue(formatPercent(fmpMetricValue(stockData.earningsYield))) },
  { label: "Graham Number", raw: fmpMetricValue(stockData.grahamNumber), value: metricValue(formatPrice(fmpMetricValue(stockData.grahamNumber))) },
  { label: "Graham Net-Net", raw: fmpMetricValue(stockData.grahamNetNet), value: metricValue(formatPrice(fmpMetricValue(stockData.grahamNetNet))) },
  { label: "Previous Year Revenue Growth", raw: fmpMetricValue(stockData.revenueGrowth), value: metricValue(formatPercent(fmpMetricValue(stockData.revenueGrowth))) },
  { label: "Previous Year Earnings Growth", raw: fmpMetricValue(stockData.earningsGrowth), value: metricValue(formatPercent(fmpMetricValue(stockData.earningsGrowth))) },
  { label: "Previous Year FCF Growth", raw: fmpMetricValue(stockData.freeCashflowGrowth), value: metricValue(formatPercent(fmpMetricValue(stockData.freeCashflowGrowth))) },
  { label: "Previous Year OCF Growth", raw: fmpMetricValue(stockData.operatingCashflowGrowth), value: metricValue(formatPercent(fmpMetricValue(stockData.operatingCashflowGrowth))) },
  { label: "Previous Year EBITDA Growth", raw: fmpMetricValue(stockData.ebitdaGrowth), value: metricValue(formatPercent(fmpMetricValue(stockData.ebitdaGrowth))) },
  { label: "Previous Year Debt Growth", raw: fmpMetricValue(stockData.debtGrowth), value: metricValue(formatPercent(fmpMetricValue(stockData.debtGrowth))) },
  { label: "3Y Revenue / Share Growth", raw: fmpMetricValue(stockData.threeYearRevenueGrowthPerShare), value: metricValue(formatPercent(fmpMetricValue(stockData.threeYearRevenueGrowthPerShare))) },
  { label: "5Y Revenue / Share Growth", raw: fmpMetricValue(stockData.fiveYearRevenueGrowthPerShare), value: metricValue(formatPercent(fmpMetricValue(stockData.fiveYearRevenueGrowthPerShare))) },
  { label: "3Y Net Income / Share Growth", raw: fmpMetricValue(stockData.threeYearNetIncomeGrowthPerShare), value: metricValue(formatPercent(fmpMetricValue(stockData.threeYearNetIncomeGrowthPerShare))) },
  { label: "5Y Net Income / Share Growth", raw: fmpMetricValue(stockData.fiveYearNetIncomeGrowthPerShare), value: metricValue(formatPercent(fmpMetricValue(stockData.fiveYearNetIncomeGrowthPerShare))) },
  {
    label: "Shares Outstanding",
    raw: stockData.sharesOutstanding,
    value: metricValue(stockData.sharesOutstanding ? `${(stockData.sharesOutstanding / 1000).toFixed(2)}B` : "N/A")
  },
  { label: "Employee Count", raw: fmpMetricValue(stockData.employeeCount), value: metricValue(formatSharesCount(fmpMetricValue(stockData.employeeCount))) },
  { label: "Revenue / Share", raw: fmpMetricValue(stockData.revenuePerShare), value: metricValue(formatPrice(fmpMetricValue(stockData.revenuePerShare))) },
  { label: "Net Income / Share", raw: fmpMetricValue(stockData.netIncomePerShare), value: metricValue(formatPrice(fmpMetricValue(stockData.netIncomePerShare))) },
  { label: "Cash / Share", raw: fmpMetricValue(stockData.cashPerShare), value: metricValue(formatPrice(fmpMetricValue(stockData.cashPerShare))) },
  { label: "FCF / Share", raw: fmpMetricValue(stockData.freeCashflowPerShare), value: metricValue(formatPrice(fmpMetricValue(stockData.freeCashflowPerShare))) },
  { label: "OCF / Share", raw: fmpMetricValue(stockData.operatingCashflowPerShare), value: metricValue(formatPrice(fmpMetricValue(stockData.operatingCashflowPerShare))) },
  { label: "Tangible Book / Share", raw: fmpMetricValue(stockData.tangibleBookValuePerShare), value: metricValue(formatPrice(fmpMetricValue(stockData.tangibleBookValuePerShare))) },
  { label: "Revenue / Employee", raw: fmpMetricValue(stockData.revenuePerEmployee), value: metricValue(formatLargeDollars(fmpMetricValue(stockData.revenuePerEmployee))) },
  { label: "Profit / Employee", raw: fmpMetricValue(stockData.profitsPerEmployee), value: metricValue(formatLargeDollars(fmpMetricValue(stockData.profitsPerEmployee))) },
  {
    label: stockData.isFinancialCompany ? "Net Interest Revenue Mix" : "Gross Margin",
    raw: stockData.isFinancialCompany ? stockData.bankMetrics?.netInterestRevenueMix : latestGrossMarginMetricValue,
    value: metricValue(formatPercent(stockData.isFinancialCompany ? stockData.bankMetrics?.netInterestRevenueMix : latestGrossMarginMetricValue))
  },
  {
    label: stockData.isFinancialCompany ? "Pre-Tax Margin" : "Operating Margin",
    raw: stockData.isFinancialCompany ? stockData.bankMetrics?.preTaxMargin : latestOperatingMarginMetricValue,
    value: metricValue(formatPercent(stockData.isFinancialCompany ? stockData.bankMetrics?.preTaxMargin : latestOperatingMarginMetricValue))
  },
  { label: "Profit Margin", raw: latestProfitMarginMetricValue, value: metricValue(formatPercent(latestProfitMarginMetricValue)) },
  { label: "Pretax Margin", raw: fmpMetricValue(stockData.pretaxMargin), value: metricValue(formatPercent(fmpMetricValue(stockData.pretaxMargin))) },
  { label: "EBITDA Margin", raw: fmpMetricValue(stockData.ebitdaMargin), value: metricValue(formatPercent(fmpMetricValue(stockData.ebitdaMargin))) },
  { label: "EBIT Margin", raw: fmpMetricValue(stockData.ebitMargin), value: metricValue(formatPercent(fmpMetricValue(stockData.ebitMargin))) },
  { label: "FCF Margin", raw: fmpMetricValue(stockData.fcfMargin), value: metricValue(formatPercent(fmpMetricValue(stockData.fcfMargin))) },
  { label: "Bottom Line Margin", raw: fmpMetricValue(stockData.bottomLineProfitMargin), value: metricValue(formatPercent(fmpMetricValue(stockData.bottomLineProfitMargin))) },
  { label: "Continuing Ops Margin", raw: fmpMetricValue(stockData.continuousOperationsProfitMargin), value: metricValue(formatPercent(fmpMetricValue(stockData.continuousOperationsProfitMargin))) },
  { label: "OCF / Sales", raw: fmpMetricValue(stockData.operatingCashflowSalesRatio), value: metricValue(formatPercent(fmpMetricValue(stockData.operatingCashflowSalesRatio))) },
  { label: "FCF / OCF", raw: fmpMetricValue(stockData.freeCashflowOperatingCashflowRatio), value: metricValue(formatPercent(fmpMetricValue(stockData.freeCashflowOperatingCashflowRatio))) },
  { label: "ROE", raw: fmpMetricValue(stockData.returnOnEquity), value: metricValue(formatPercent(fmpMetricValue(stockData.returnOnEquity))) },
  { label: "ROA", raw: fmpMetricValue(stockData.returnOnAssets), value: metricValue(formatPercent(fmpMetricValue(stockData.returnOnAssets))) },
  { label: "Operating ROA", raw: fmpMetricValue(stockData.operatingReturnOnAssets), value: metricValue(formatPercent(fmpMetricValue(stockData.operatingReturnOnAssets))) },
  { label: "ROIC", raw: fmpMetricValue(stockData.returnOnInvestedCapital), value: metricValue(formatPercent(fmpMetricValue(stockData.returnOnInvestedCapital))) },
  { label: "ROCE", raw: fmpMetricValue(stockData.returnOnCapitalEmployed), value: metricValue(formatPercent(fmpMetricValue(stockData.returnOnCapitalEmployed))) },
  { label: "Return on Tangible Assets", raw: fmpMetricValue(stockData.returnOnTangibleAssets), value: metricValue(formatPercent(fmpMetricValue(stockData.returnOnTangibleAssets))) },
  { label: "Current Ratio", raw: fmpMetricValue(stockData.currentRatio), value: metricValue(formatPlain(fmpMetricValue(stockData.currentRatio))) },
  { label: "Quick Ratio", raw: fmpMetricValue(stockData.quickRatio), value: metricValue(formatPlain(fmpMetricValue(stockData.quickRatio))) },
  { label: "Cash Ratio", raw: fmpMetricValue(stockData.cashRatio), value: metricValue(formatPlain(fmpMetricValue(stockData.cashRatio))) },
  { label: "Debt / Equity", raw: fmpMetricValue(stockData.debtToEquity), value: metricValue(formatPlain(fmpMetricValue(stockData.debtToEquity))) },
  { label: "Debt / Assets", raw: fmpMetricValue(stockData.debtToAssets), value: metricValue(formatPercent(fmpMetricValue(stockData.debtToAssets))) },
  { label: "Debt / Capital", raw: fmpMetricValue(stockData.debtToCapital), value: metricValue(formatPercent(fmpMetricValue(stockData.debtToCapital))) },
  { label: "Debt / Market Cap", raw: fmpMetricValue(stockData.debtToMarketCap), value: metricValue(formatPercent(fmpMetricValue(stockData.debtToMarketCap))) },
  { label: "LT Debt / Capital", raw: fmpMetricValue(stockData.longTermDebtToCapital), value: metricValue(formatPercent(fmpMetricValue(stockData.longTermDebtToCapital))) },
  { label: "Financial Leverage", raw: fmpMetricValue(stockData.financialLeverage), value: metricValue(formatPlain(fmpMetricValue(stockData.financialLeverage))) },
  { label: "Interest Coverage", raw: fmpMetricValue(stockData.interestCoverage), value: metricValue(formatPlain(fmpMetricValue(stockData.interestCoverage))) },
  { label: "Debt Service Coverage", raw: fmpMetricValue(stockData.debtServiceCoverage), value: metricValue(formatPlain(fmpMetricValue(stockData.debtServiceCoverage))) },
  { label: "OCF Coverage", raw: fmpMetricValue(stockData.operatingCashflowCoverage), value: metricValue(formatPlain(fmpMetricValue(stockData.operatingCashflowCoverage))) },
  { label: "Short-Term OCF Coverage", raw: fmpMetricValue(stockData.shortTermOperatingCashflowCoverage), value: metricValue(formatPlain(fmpMetricValue(stockData.shortTermOperatingCashflowCoverage))) },
  { label: "OCF Ratio", raw: fmpMetricValue(stockData.operatingCashflowRatio), value: metricValue(formatPlain(fmpMetricValue(stockData.operatingCashflowRatio))) },
  { label: "Solvency Ratio", raw: fmpMetricValue(stockData.solvencyRatio), value: metricValue(formatPlain(fmpMetricValue(stockData.solvencyRatio))) },
  { label: "Interest Debt / Share", raw: fmpMetricValue(stockData.interestDebtPerShare), value: metricValue(formatPrice(fmpMetricValue(stockData.interestDebtPerShare))) },
  { label: "Dividend Yield TTM", raw: fmpMetricValue(stockData.dividendYieldTtm), value: metricValue(formatPercent(fmpMetricValue(stockData.dividendYieldTtm))) },
  { label: "Dividend Payout Ratio", raw: fmpMetricValue(stockData.dividendPayoutRatio), value: metricValue(formatPercent(fmpMetricValue(stockData.dividendPayoutRatio))) },
  { label: "Dividend / Share", raw: fmpMetricValue(stockData.dividendPerShare), value: metricValue(formatPrice(fmpMetricValue(stockData.dividendPerShare))) },
  { label: "Income Quality", raw: fmpMetricValue(stockData.incomeQuality), value: metricValue(formatPlain(fmpMetricValue(stockData.incomeQuality))) },
  { label: "Asset Turnover", raw: fmpMetricValue(stockData.assetTurnover), value: metricValue(formatPlain(fmpMetricValue(stockData.assetTurnover))) },
  { label: "Fixed Asset Turnover", raw: fmpMetricValue(stockData.fixedAssetTurnover), value: metricValue(formatPlain(fmpMetricValue(stockData.fixedAssetTurnover))) },
  { label: "Inventory Turnover", raw: fmpMetricValue(stockData.inventoryTurnover), value: metricValue(formatPlain(fmpMetricValue(stockData.inventoryTurnover))) },
  { label: "Receivables Turnover", raw: fmpMetricValue(stockData.receivablesTurnover), value: metricValue(formatPlain(fmpMetricValue(stockData.receivablesTurnover))) },
  { label: "Payables Turnover", raw: fmpMetricValue(stockData.payablesTurnover), value: metricValue(formatPlain(fmpMetricValue(stockData.payablesTurnover))) },
  { label: "Working Capital Turnover", raw: fmpMetricValue(stockData.workingCapitalTurnover), value: metricValue(formatPlain(fmpMetricValue(stockData.workingCapitalTurnover))) },
  { label: "Cash Conversion Cycle", raw: fmpMetricValue(stockData.cashConversionCycle), value: metricValue(formatPlain(fmpMetricValue(stockData.cashConversionCycle))) },
  { label: "Days Sales Outstanding", raw: fmpMetricValue(stockData.daysSalesOutstanding), value: metricValue(formatPlain(fmpMetricValue(stockData.daysSalesOutstanding))) },
  { label: "Days Payables Outstanding", raw: fmpMetricValue(stockData.daysPayablesOutstanding), value: metricValue(formatPlain(fmpMetricValue(stockData.daysPayablesOutstanding))) },
  { label: "Days Inventory Outstanding", raw: fmpMetricValue(stockData.daysInventoryOutstanding), value: metricValue(formatPlain(fmpMetricValue(stockData.daysInventoryOutstanding))) },
  { label: "Operating Cycle", raw: fmpMetricValue(stockData.operatingCycle), value: metricValue(formatPlain(fmpMetricValue(stockData.operatingCycle))) },
  { label: "Average Inventory", raw: fmpMetricValue(stockData.averageInventory), value: metricValue(formatLargeDollars(fmpMetricValue(stockData.averageInventory))) },
  { label: "Average Payables", raw: fmpMetricValue(stockData.averagePayables), value: metricValue(formatLargeDollars(fmpMetricValue(stockData.averagePayables))) },
  { label: "Average Receivables", raw: fmpMetricValue(stockData.averageReceivables), value: metricValue(formatLargeDollars(fmpMetricValue(stockData.averageReceivables))) },
  { label: "R&D / Revenue", raw: fmpMetricValue(stockData.rdToRevenue), value: metricValue(formatPercent(fmpMetricValue(stockData.rdToRevenue))) },
  { label: "SG&A / Revenue", raw: fmpMetricValue(stockData.sgaToRevenue), value: metricValue(formatPercent(fmpMetricValue(stockData.sgaToRevenue))) },
  { label: "Stock Comp / Revenue", raw: fmpMetricValue(stockData.stockBasedCompToRevenue), value: metricValue(formatPercent(fmpMetricValue(stockData.stockBasedCompToRevenue))) },
  { label: "Capex / Revenue", raw: fmpMetricValue(stockData.capexToRevenue), value: metricValue(formatPercent(fmpMetricValue(stockData.capexToRevenue))) },
  { label: "Capex / OCF", raw: fmpMetricValue(stockData.capexToOperatingCashflow), value: metricValue(formatPercent(fmpMetricValue(stockData.capexToOperatingCashflow))) },
  { label: "Capex / Depreciation", raw: fmpMetricValue(stockData.capexToDepreciation), value: metricValue(formatPercent(fmpMetricValue(stockData.capexToDepreciation))) },
  { label: "Capex / Share", raw: fmpMetricValue(stockData.capexPerShare), value: metricValue(formatPrice(fmpMetricValue(stockData.capexPerShare))) },
  { label: "Capex Coverage", raw: fmpMetricValue(stockData.capitalExpenditureCoverage), value: metricValue(formatPlain(fmpMetricValue(stockData.capitalExpenditureCoverage))) },
  { label: "Dividend + Capex Coverage", raw: fmpMetricValue(stockData.dividendPaidAndCapexCoverage), value: metricValue(formatPlain(fmpMetricValue(stockData.dividendPaidAndCapexCoverage))) },
  { label: "Effective Tax Rate", raw: fmpMetricValue(stockData.effectiveTaxRate), value: metricValue(formatPercent(fmpMetricValue(stockData.effectiveTaxRate))) },
  { label: "Tax Burden", raw: fmpMetricValue(stockData.taxBurden), value: metricValue(formatPlain(fmpMetricValue(stockData.taxBurden))) },
  { label: "Interest Burden", raw: fmpMetricValue(stockData.interestBurden), value: metricValue(formatPlain(fmpMetricValue(stockData.interestBurden))) },
  { label: "EBT / EBIT", raw: fmpMetricValue(stockData.ebtPerEbit), value: metricValue(formatPlain(fmpMetricValue(stockData.ebtPerEbit))) },
  { label: "Net Income / EBT", raw: fmpMetricValue(stockData.netIncomePerEbt), value: metricValue(formatPlain(fmpMetricValue(stockData.netIncomePerEbt))) },
  {
    label: stockData.isFinancialCompany ? "Annual Cash Change" : "Free Cash Flow",
    raw: stockData.isFinancialCompany ? stockData.bankMetrics?.annualCashChange : fmpMetricValue(latestFreeCashflowMetricValue),
    value: metricValue(formatBillions(stockData.isFinancialCompany ? stockData.bankMetrics?.annualCashChange : fmpMetricValue(latestFreeCashflowMetricValue)))
  },
  !stockData.isFinancialCompany && {
    label: "Operating Cash Flow",
    raw: fmpMetricValue(latestOperatingCashflowMetricValue),
    value: metricValue(formatBillions(fmpMetricValue(latestOperatingCashflowMetricValue)))
  },
  { label: "FCF to Equity", raw: fmpMetricValue(stockData.freeCashflowToEquity), value: metricValue(formatLargeDollars(fmpMetricValue(stockData.freeCashflowToEquity))) },
  { label: "FCF to Firm", raw: fmpMetricValue(stockData.freeCashflowToFirm), value: metricValue(formatLargeDollars(fmpMetricValue(stockData.freeCashflowToFirm))) },
  { label: "Invested Capital", raw: fmpMetricValue(stockData.investedCapital), value: metricValue(formatLargeDollars(fmpMetricValue(stockData.investedCapital))) },
  { label: "Tangible Asset Value", raw: fmpMetricValue(stockData.tangibleAssetValue), value: metricValue(formatLargeDollars(fmpMetricValue(stockData.tangibleAssetValue))) },
  { label: "Net Current Asset Value", raw: fmpMetricValue(stockData.netCurrentAssetValue), value: metricValue(formatLargeDollars(fmpMetricValue(stockData.netCurrentAssetValue))) },
  { label: "Intangibles / Assets", raw: fmpMetricValue(stockData.intangiblesToTotalAssets), value: metricValue(formatPercent(fmpMetricValue(stockData.intangiblesToTotalAssets))) },
  { label: "Price Target", raw: fmpMetricValue(stockData.targetMean), value: metricValue(formatPrice(fmpMetricValue(stockData.targetMean))) },
  {
    label: "Analyst Rating",
    raw: fmpMetricValue(stockData.analystRatingText || stockData.recommendationKey),
    value: metricValue(fmpMetricValue(stockData.analystRatingText || stockData.recommendationKey) || "N/A")
  },
  {
    label: "52-Week Range",
    raw: isNumber(stockData.fiftyTwoWeekLow) && isNumber(stockData.fiftyTwoWeekHigh) ? `${stockData.fiftyTwoWeekLow}-${stockData.fiftyTwoWeekHigh}` : null,
    className: "metric-range-card",
    valueClassName: "card-range-value",
    value: isNumber(stockData.fiftyTwoWeekLow) && isNumber(stockData.fiftyTwoWeekHigh) ? (
      <>
        <span>{formatPrice(stockData.fiftyTwoWeekLow)}</span>
        <span className="card-range-divider">to</span>
        <span>{formatPrice(stockData.fiftyTwoWeekHigh)}</span>
      </>
    ) : metricValue("N/A")
  },
  { label: "Float Shares", raw: stockData.floatShares, value: shareFloatMetricValue(formatSharesCount(stockData.floatShares)) },
  { label: "Free Float Shares", raw: stockData.freeFloatShares, value: shareFloatMetricValue(formatSharesCount(stockData.freeFloatShares)) },
  { label: "Industry", raw: stockData.industry, className: "metric-text-card", value: profileMetricValue(stockData.industry || "N/A") },
  { label: "CEO", raw: stockData.ceo, className: "metric-text-card", value: profileMetricValue(stockData.ceo || "N/A") },
  { label: "Country", raw: stockData.country, className: "metric-text-card", value: profileMetricValue(stockData.country || "N/A") },
  { label: "Exchange", raw: stockData.exchange, className: "metric-text-card", value: profileMetricValue(stockData.exchange || "N/A") }
].filter(Boolean);
const companyExecutives = Array.isArray(stockData.executives)
  ? stockData.executives.filter((executive) => executive?.name).slice(0, 10)
  : [];
const hasCompanyProfileSection = Boolean(stockData.description) || companyExecutives.length > 0;
const metricGroupConfig = [
  {
    key: "profile",
    title: "Company Profile",
    labels: new Set([
      "Market Cap",
      "Beta",
      "Volume",
      "Last Dividend",
      "50-Day Avg",
      "200-Day Avg",
      "Shares Outstanding",
      "Float Shares",
      "Free Float Shares",
      "Employee Count",
      "Industry",
      "CEO",
      "Country",
      "Exchange",
      "52-Week Range"
    ])
  },
  {
    key: "valuation",
    title: "Valuation",
    labels: new Set([
      "TTM P/E",
      "Forward P/E",
      "Forward P/S",
      "PEG Ratio TTM",
      "Forward PEG",
      "Price-to-Sales",
      "Price-to-Book",
      "Price / Fair Value",
      "P/TBV Ratio",
      "P/FCF Ratio",
      "P/OCF Ratio",
      "Enterprise Value",
      "EV / Sales",
      "EV / EBITDA",
      "EV / OCF",
      "EV / FCF",
      "Net Debt / EBITDA",
      "FCF Yield",
      "Earnings Yield",
      "Graham Number",
      "Graham Net-Net"
    ])
  },
  {
    key: "balance",
    title: "Balance Sheet",
    labels: new Set([
      "Cash & ST Investments",
      "Total Debt",
      "Net Cash",
      "Net Cash / Share",
      "Equity Book Value",
      "Book Value / Share",
      "Working Capital",
      "Invested Capital",
      "Tangible Asset Value",
      "Net Current Asset Value",
      "Intangibles / Assets",
      "Average Inventory",
      "Average Payables",
      "Average Receivables"
    ])
  },
  {
    key: "perShare",
    title: "Per Share",
    labels: new Set([
      "Revenue / Share",
      "Net Income / Share",
      "Cash / Share",
      "FCF / Share",
      "OCF / Share",
      "Tangible Book / Share",
      "Interest Debt / Share",
      "Dividend / Share",
      "Capex / Share"
    ])
  },
  {
    key: "liquidity",
    title: "Liquidity & Solvency",
    labels: new Set([
      "Current Ratio",
      "Quick Ratio",
      "Cash Ratio",
      "Debt / Equity",
      "Debt / Assets",
      "Debt / Capital",
      "Debt / Market Cap",
      "LT Debt / Capital",
      "Financial Leverage",
      "Interest Coverage",
      "Debt Service Coverage",
      "OCF Coverage",
      "Short-Term OCF Coverage",
      "OCF Ratio",
      "Solvency Ratio"
    ])
  },
  {
    key: "profitability",
    title: "Profitability",
    labels: new Set([
      "Gross Margin",
      "Operating Margin",
      "Net Interest Revenue Mix",
      "Pre-Tax Margin",
      "Profit Margin",
      "Pretax Margin",
      "EBITDA Margin",
      "EBIT Margin",
      "FCF Margin",
      "Bottom Line Margin",
      "Continuing Ops Margin",
      "OCF / Sales",
      "FCF / OCF",
      "ROE",
      "ROA",
      "Operating ROA",
      "ROIC",
      "ROCE",
      "Return on Tangible Assets",
      "Dividend Yield TTM",
      "Dividend Payout Ratio",
      "Income Quality",
      "Tax Burden",
      "Interest Burden",
      "EBT / EBIT",
      "Net Income / EBT"
    ])
  },
  {
    key: "growth",
    title: "Growth",
    labels: new Set([
      "Previous Year Revenue Growth",
      "Previous Year Earnings Growth",
      "Previous Year FCF Growth",
      "Previous Year OCF Growth",
      "Previous Year EBITDA Growth",
      "Previous Year Debt Growth",
      "3Y Revenue / Share Growth",
      "5Y Revenue / Share Growth",
      "3Y Net Income / Share Growth",
      "5Y Net Income / Share Growth",
      "Revenue / Employee",
      "Profit / Employee"
    ])
  },
  {
    key: "efficiency",
    title: "Efficiency",
    labels: new Set([
      "Asset Turnover",
      "Fixed Asset Turnover",
      "Inventory Turnover",
      "Receivables Turnover",
      "Payables Turnover",
      "Working Capital Turnover",
      "Cash Conversion Cycle",
      "Days Sales Outstanding",
      "Days Payables Outstanding",
      "Days Inventory Outstanding",
      "Operating Cycle",
      "R&D / Revenue",
      "SG&A / Revenue",
      "Stock Comp / Revenue",
      "Capex / Revenue",
      "Capex / OCF",
      "Capex / Depreciation",
      "Capex Coverage",
      "Dividend + Capex Coverage",
      "Effective Tax Rate"
    ])
  },
  {
    key: "cashflow",
    title: "Cash Flow & Analyst",
    labels: new Set([
      "Free Cash Flow",
      "Operating Cash Flow",
      "Annual Cash Change",
      "FCF to Equity",
      "FCF to Firm",
      "Price Target",
      "Analyst Rating"
    ])
  }
];
const renderedMetricCards = metricCardItems;
const groupedMetricCards = metricGroupConfig
  .map((group) => ({
    ...group,
    items: renderedMetricCards.filter((item) => group.labels.has(item.label))
  }))
  .filter((group) => group.items.length);
const groupedMetricLabels = new Set(groupedMetricCards.flatMap((group) => group.items.map((item) => item.label)));
const ungroupedMetricCards = renderedMetricCards.filter((item) => !groupedMetricLabels.has(item.label));
const estimateValue = (value) =>
  (isInitialStockLoad || areEstimatesRefreshing) && (value === "N/A" || value === null || value === undefined)
    ? "Loading..."
    : stockValue(value);
const nextQuarterValue = (value) =>
  (isInitialStockLoad || isNextQuarterRefreshing) && (value === "N/A" || value === null || value === undefined)
    ? "Loading..."
    : stockValue(value);
const analystUpdateRows = stockData.analystUpdates || [];
const institutionalHolderRows = getCurrentInstitutionalHolderRows(stockData.institutionalHolders);
const hasLegacyInstitutionalHolderRows =
  (stockData.institutionalHolders || []).some((row) => isLegacyInstitutionalHolderRow(row));
const insiderMoveRows = stockData.insiderTransactions || [];
const isAnalystUpdatesLoading =
  (isInitialStockLoad || stockData?.refreshing) &&
  !stockData?.analystUpdatesCheckedAt &&
  !analystUpdateRows.length;
const isInstitutionalHoldersLoading =
  !institutionalHolderRows.length &&
  (
    hasLegacyInstitutionalHolderRows ||
    (
      (isInitialStockLoad || stockData?.refreshing) &&
      !stockData?.institutionalHoldersCheckedAt
    )
  );
const isInsiderMovesLoading =
  (isInitialStockLoad || stockData?.refreshing) &&
  !stockData?.insiderTransactionsCheckedAt &&
  !insiderMoveRows.length;
const displayedCalendar = earnings?.type === calendarMode
  ? earnings
  : { type: calendarMode, weekStart: earningsWeekStart, weekEnd: shiftIsoDate(earningsWeekStart, 6), days: [] };
const displayedCalendarDays = displayedCalendar?.days || [];
const selectedEarningsDay = displayedCalendarDays.find(
  (day) => day.date === selectedEarningsDate
) || { date: selectedEarningsDate, events: [] };
const activeCalendarConfig = CALENDAR_MODES.find((mode) => mode.id === calendarMode) || CALENDAR_MODES[0];
const selectedCalendarSymbol = String(selectedCalendarEvent?.symbol || "").toUpperCase();
const selectedCalendarReport = selectedCalendarSymbol
  ? calendarEarningsReports[selectedCalendarSymbol] || { symbol: selectedCalendarSymbol, rows: [] }
  : null;
const liveEarningsToday = toLocalIsoDate(new Date());
const liveEarningsDay = displayedCalendarDays.find((day) => day.date === liveEarningsToday) || { date: liveEarningsToday, events: [] };
const liveEarningsEvents = calendarMode === "live-earnings" ? getUsLiveEarningsEvents(liveEarningsDay) : [];
const selectedLiveEarningsSymbol = String(selectedLiveEarningsEvent?.symbol || "").toUpperCase();
const selectedLiveEarningsResult = selectedLiveEarningsSymbol
  ? liveEarningsResults[selectedLiveEarningsSymbol] || {
      symbol: selectedLiveEarningsSymbol,
      status: "watching",
      epsEstimate: selectedLiveEarningsEvent?.epsEstimate,
      revenueEstimate: selectedLiveEarningsEvent?.revenueEstimate,
      sources: []
    }
  : null;
const earningsWeekLabel = displayedCalendar?.weekStart && displayedCalendar?.weekEnd
  ? `${new Date(`${displayedCalendar.weekStart}T12:00:00`).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric"
    })} - ${new Date(`${displayedCalendar.weekEnd}T12:00:00`).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric"
    })}`
  : "This week";
const earningsSnapshotDays = calendarMode === "earnings"
  ? displayedCalendarDays
      .filter((day) => {
        const weekday = new Date(`${day.date}T12:00:00`).getDay();
        return day.events?.length || (weekday >= 1 && weekday <= 5);
      })
      .map((day) => {
        const date = new Date(`${day.date}T12:00:00`);
        const visibleEvents = [...(day.events || [])]
          .filter((event) => event?.symbol)
          .slice(0, 20);
        return {
          date: day.date,
          weekday: date.toLocaleDateString(undefined, { weekday: "long" }),
          shortDate: date.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
          events: visibleEvents
        };
      })
  : [];
const earningsSnapshotWeekdays = earningsSnapshotDays
  .filter((day) => {
    const weekday = new Date(`${day.date}T12:00:00`).getDay();
    return weekday >= 1 && weekday <= 5;
  })
  .slice(0, 5);
const getCanvasImageUrls = (src) => {
  if (!src || typeof src !== "string") return [];
  if (src.startsWith("/")) return [src];
  const apiRoot = String(API_URL || "").replace(/\/$/, "");
  const proxyBase = apiRoot.endsWith("/api") ? apiRoot : `${apiRoot}/api`;

  try {
    const sourceUrl = new URL(src, window.location.origin);
    const apiUrl = new URL(proxyBase, window.location.origin);
    const apiPath = apiUrl.pathname.replace(/\/$/, "");
    if (sourceUrl.origin === apiUrl.origin && sourceUrl.pathname.startsWith(apiPath)) {
      return [src];
    }
  } catch {
    // Keep proxy/direct fallback for malformed external URLs.
  }

  const proxyUrl = `${proxyBase}/image-proxy?url=${encodeURIComponent(src)}`;
  return [proxyUrl, src].filter((url, index, list) => url && list.indexOf(url) === index);
};
const loadCanvasImageFromUrl = async (imageUrl) => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 4500);

  try {
    const response = await fetch(imageUrl, {
      cache: "force-cache",
      signal: controller.signal
    });
    if (!response.ok) return null;
    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    if (contentType && !contentType.includes("image") && !contentType.includes("octet-stream")) return null;
    const blob = await response.blob();
    if (!blob.size) return null;
    const objectUrl = URL.createObjectURL(blob);
    const image = new Image();
    image.decoding = "async";
    image.src = objectUrl;
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
    });
    return image;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
};
const loadCanvasImage = async (src) => {
  if (!src || typeof window === "undefined") return null;

  for (const imageUrl of getCanvasImageUrls(src)) {
    const image = await loadCanvasImageFromUrl(imageUrl);
    if (image) return image;
  }
  return null;
};
const loadFirstCanvasImage = async (urls) => {
  const candidates = [...new Set((Array.isArray(urls) ? urls : [urls]).filter(Boolean))];
  for (let index = 0; index < candidates.length; index += 4) {
    const images = await Promise.all(candidates.slice(index, index + 4).map((url) => loadCanvasImage(url)));
    const image = images.find(Boolean);
    if (image) return image;
  }
  return null;
};
const getProviderLogoFromRecord = (record = {}) => (
  record.logo ||
  record.logoUrl ||
  record.image ||
  record.companyLogo ||
  record.companyImage ||
  record.profileImage ||
  record.profile?.image ||
  record.company?.image ||
  ""
);
const getWeeklyBoardLogoCandidates = (symbol, providerLogo = "") => {
  const cleanSymbol = String(symbol || "").trim().toUpperCase();
  if (!cleanSymbol) return [];
  const apiRoot = String(API_URL || "").replace(/\/$/, "");
  const apiBase = apiRoot.endsWith("/api") ? apiRoot : `${apiRoot}/api`;
  const symbolVariants = [...new Set([
    cleanSymbol,
    cleanSymbol.replace(/\./g, "-"),
    cleanSymbol.replace(/-/g, "."),
    cleanSymbol.replace(/[.-]/g, ""),
    cleanSymbol.split(".")[0],
    cleanSymbol.split("-")[0]
  ].map((value) => String(value || "").replace(/[^A-Z0-9.-]/g, "")).filter(Boolean))];
  const proxyLogoUrls = symbolVariants.map((variant) => `${apiBase}/company-logo/${encodeURIComponent(variant)}`);
  return [
    ...proxyLogoUrls,
    providerLogo,
    ...getCompanyLogoCandidates(cleanSymbol, providerLogo)
  ].filter((url, index, list) => url && list.indexOf(url) === index);
};
const downloadWeeklyEarningsImage = async () => {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const posterDays = earningsSnapshotWeekdays;
  if (!posterDays.length) return;

  if (document.fonts?.ready) {
    await document.fonts.ready.catch(() => null);
  }

  const canvas = document.createElement("canvas");
  const scale = 2;
  const width = 1800;
  const height = 1080;
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(scale, scale);

  const drawRoundRect = (x, y, w, h, r) => {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  };
  const fillRoundRect = (x, y, w, h, r, fillStyle, strokeStyle = null) => {
    drawRoundRect(x, y, w, h, r);
    ctx.fillStyle = fillStyle;
    ctx.fill();
    if (strokeStyle) {
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  };
  const drawFittedText = (text, x, y, maxWidth, {
    fontSize = 16,
    fontWeight = 700,
    color = "#e5f4ff",
    align = "left",
    minFontSize = 9
  } = {}) => {
    const value = String(text || "").trim();
    if (!value) return;
    let size = fontSize;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.fillStyle = color;
    ctx.font = `${fontWeight} ${size}px Inter, Arial, sans-serif`;
    while (size > minFontSize && ctx.measureText(value).width > maxWidth) {
      size -= 1;
      ctx.font = `${fontWeight} ${size}px Inter, Arial, sans-serif`;
    }
    if (ctx.measureText(value).width <= maxWidth) {
      ctx.fillText(value, x, y);
      return;
    }
    let clipped = value;
    while (clipped.length > 2 && ctx.measureText(`${clipped}...`).width > maxWidth) {
      clipped = clipped.slice(0, -1);
    }
    ctx.fillText(`${clipped}...`, x, y);
  };
  const drawWrappedText = (text, x, y, maxWidth, lineHeight, maxLines, options = {}) => {
    const words = String(text || "").trim().split(/\s+/).filter(Boolean);
    const lines = [];
    let current = "";
    ctx.font = `${options.fontWeight || 700} ${options.fontSize || 11}px Inter, Arial, sans-serif`;
    words.forEach((word) => {
      const next = current ? `${current} ${word}` : word;
      if (ctx.measureText(next).width <= maxWidth) {
        current = next;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    });
    if (current) lines.push(current);
    lines.slice(0, maxLines).forEach((line, index) => {
      const suffix = index === maxLines - 1 && lines.length > maxLines ? "..." : "";
      drawFittedText(`${line}${suffix}`, x, y + index * lineHeight, maxWidth, options);
    });
  };
  const drawImageContained = (image, x, y, size) => {
    if (!image) return false;
    const ratio = Math.min(size / image.width, size / image.height);
    const drawWidth = image.width * ratio;
    const drawHeight = image.height * ratio;
    ctx.drawImage(image, x + (size - drawWidth) / 2, y + (size - drawHeight) / 2, drawWidth, drawHeight);
    return true;
  };
  const drawFallbackLogo = (symbol, x, y, size) => {
    fillRoundRect(x, y, size, size, 8, "#f8fafc", "rgba(17, 24, 39, 0.18)");
    drawFittedText(symbol.slice(0, 4), x + size / 2, y + size / 2, size - 6, {
      fontSize: symbol.length > 3 ? 10 : 14,
      fontWeight: 900,
      color: "#0f172a",
      align: "center",
      minFontSize: 8
    });
  };

  const logoEntries = [];
  posterDays.forEach((day) => {
    day.events.slice(0, 20).forEach((event) => {
      const symbol = String(event.symbol || "").toUpperCase();
      const logoUrls = getWeeklyBoardLogoCandidates(symbol, getProviderLogoFromRecord(event));
      if (symbol && logoUrls.length) logoEntries.push([symbol, logoUrls]);
    });
  });
  logoEntries.push(["MRKTRALLY", "/mrktrally-icon.png"]);
  const logoMap = new Map();
  await Promise.allSettled(
    [...new Map(logoEntries).entries()].map(async ([symbol, logoUrls]) => {
      const image = await loadFirstCanvasImage(logoUrls);
      if (image) logoMap.set(symbol, image);
    })
  );

  const background = ctx.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, "#02070d");
  background.addColorStop(0.42, "#071522");
  background.addColorStop(1, "#02050b");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  const leftGlow = ctx.createRadialGradient(210, 120, 30, 210, 120, 560);
  leftGlow.addColorStop(0, "rgba(20, 184, 166, 0.34)");
  leftGlow.addColorStop(1, "rgba(20, 184, 166, 0)");
  ctx.fillStyle = leftGlow;
  ctx.fillRect(0, 0, width, height);

  const rightGlow = ctx.createRadialGradient(width - 300, 300, 40, width - 300, 300, 620);
  rightGlow.addColorStop(0, "rgba(37, 99, 235, 0.28)");
  rightGlow.addColorStop(1, "rgba(37, 99, 235, 0)");
  ctx.fillStyle = rightGlow;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(34, 211, 238, 0.07)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= width; x += 88) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += 78) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(34, 211, 238, 0.035)";
  ctx.font = "900 230px Inter, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("MRKTRALLY", width / 2, height / 2 + 50);

  fillRoundRect(28, 166, width - 56, height - 248, 18, "rgba(7, 16, 28, 0.88)", "rgba(56, 189, 248, 0.42)");
  ctx.strokeStyle = "rgba(45, 212, 191, 0.9)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(40, 166);
  ctx.lineTo(width - 40, 166);
  ctx.stroke();

  const brandLogo = logoMap.get("MRKTRALLY");
  fillRoundRect(44, 32, 70, 70, 14, "#050b14", "rgba(45, 212, 191, 0.42)");
  drawImageContained(brandLogo, 53, 41, 52);
  drawFittedText("MrktRally", 130, 66, 300, {
    fontSize: 36,
    fontWeight: 900,
    color: "#f8fafc"
  });
  drawFittedText("WEEKLY EARNINGS BOARD", width / 2, 42, 520, {
    fontSize: 30,
    fontWeight: 900,
    color: "#5eead4",
    align: "center"
  });
  drawFittedText(`Top earnings for the week of ${earningsWeekLabel}`, width / 2, 76, 620, {
    fontSize: 17,
    fontWeight: 800,
    color: "#e5f4ff",
    align: "center"
  });
  drawFittedText("A compact daily board of the most important reports from the calendar above.", width / 2, 104, 740, {
    fontSize: 15,
    fontWeight: 700,
    color: "#94a3b8",
    align: "center"
  });

  const boardX = 28;
  const boardY = 166;
  const boardW = width - 56;
  const boardH = height - 248;
  const colW = boardW / 5;
  const headerH = 54;
  const rowH = (boardH - headerH) / 10;

  posterDays.forEach((day, dayIndex) => {
    const x = boardX + dayIndex * colW;
    ctx.strokeStyle = "rgba(56, 189, 248, 0.18)";
    ctx.lineWidth = 1;
    if (dayIndex > 0) {
      ctx.beginPath();
      ctx.moveTo(x, boardY);
      ctx.lineTo(x, boardY + boardH);
      ctx.stroke();
    }

    drawFittedText(day.weekday, x + colW / 2, boardY + 18, colW - 22, {
      fontSize: 17,
      fontWeight: 900,
      color: "#f8fafc",
      align: "center"
    });
    drawFittedText(day.shortDate, x + colW / 2, boardY + 42, colW - 22, {
      fontSize: 11,
      fontWeight: 900,
      color: "#7dd3fc",
      align: "center"
    });

    const leftEvents = day.events.slice(0, 10);
    const rightEvents = day.events.slice(10, 20);
    [leftEvents, rightEvents].forEach((events, sideIndex) => {
      const sideX = x + sideIndex * (colW / 2);
      events.forEach((event, rowIndex) => {
        const symbol = String(event.symbol || "").toUpperCase();
        const company = event.company || event.name || symbol;
        const cap = isNumber(event.marketCap)
          ? formatCalendarMoney(event.marketCap)
          : isNumber(event.revenueEstimate)
            ? formatCalendarMoney(event.revenueEstimate)
            : "Pending";
        const cellX = sideX + 8;
        const cellY = boardY + headerH + rowIndex * rowH + 6;
        const cellW = colW / 2 - 16;
        const cellH = rowH - 9;
        const logoSize = Math.min(38, cellH - 16);

        ctx.save();
        drawRoundRect(cellX, cellY, cellW, cellH, 8);
        ctx.clip();
        const cellGradient = ctx.createLinearGradient(cellX, cellY, cellX + cellW, cellY + cellH);
        cellGradient.addColorStop(0, rowIndex % 2 === 0 ? "rgba(13, 148, 136, 0.18)" : "rgba(15, 23, 42, 0.82)");
        cellGradient.addColorStop(1, "rgba(15, 23, 42, 0.9)");
        ctx.fillStyle = cellGradient;
        ctx.fillRect(cellX, cellY, cellW, cellH);
        ctx.restore();
        ctx.strokeStyle = "rgba(56, 189, 248, 0.18)";
        ctx.lineWidth = 1;
        drawRoundRect(cellX, cellY, cellW, cellH, 8);
        ctx.stroke();

        const logoX = cellX + 7;
        const logoY = cellY + (cellH - logoSize) / 2;
        fillRoundRect(logoX, logoY, logoSize, logoSize, 8, "#050b14", "rgba(45, 212, 191, 0.35)");
        const logoImage = logoMap.get(symbol);
        if (!drawImageContained(logoImage, logoX + 4, logoY + 4, logoSize - 8)) {
          drawFallbackLogo(symbol, logoX, logoY, logoSize);
        }

        const textX = logoX + logoSize + 7;
        const textW = cellX + cellW - textX - 5;
        drawFittedText(symbol, textX, cellY + 16, textW, {
          fontSize: 14,
          fontWeight: 900,
          color: "#67e8f9"
        });
        drawWrappedText(company, textX, cellY + 33, textW, 11, 2, {
          fontSize: 9,
          fontWeight: 800,
          color: "#dbeafe",
          minFontSize: 8
        });
        drawFittedText(cap, textX, cellY + cellH - 9, textW, {
          fontSize: 9,
          fontWeight: 900,
          color: "#94a3b8"
        });
      });
    });
  });

  drawFittedText("mrktrally.com", 42, height - 38, 300, {
    fontSize: 13,
    fontWeight: 800,
    color: "#e5f4ff"
  });
  drawFittedText("Built from the visible MrktRally earnings calendar", width - 42, height - 38, 520, {
    fontSize: 13,
    fontWeight: 800,
    color: "#94a3b8",
    align: "right"
  });

  const safeWeekLabel = earningsWeekLabel.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  const downloadCanvas = (targetCanvas) => {
    const link = document.createElement("a");
    link.download = `mrktrally-earnings-${safeWeekLabel || "week"}.png`;
    link.href = targetCanvas.toDataURL("image/png");
    link.click();
  };

  try {
    downloadCanvas(canvas);
  } catch {
    const fallbackCanvas = document.createElement("canvas");
    fallbackCanvas.width = canvas.width;
    fallbackCanvas.height = canvas.height;
    const fallbackCtx = fallbackCanvas.getContext("2d");
    if (!fallbackCtx) return;
    fallbackCtx.drawImage(canvas, 0, 0);
    downloadCanvas(fallbackCanvas);
  }
};
const latestTreasuryRates = treasuryRates?.latest || treasuryRates?.rows?.[0] || null;
const previousTreasuryRates = treasuryRates?.rows?.[1] || null;
const portfolioStockAllocationData = portfolio.map((position, index) => {
  const currentPrice = portfolioPrices[position.symbol];
  const allocationPrice = isNumber(currentPrice) && currentPrice > 0
    ? currentPrice
    : Number(position.avgCost) || 0;
  return {
    key: `${position.symbol}-${position.avgCost}-${index}`,
    name: position.symbol,
    value: allocationPrice * Number(position.shares || 0)
  };
}).filter((position) => position.value > 0)
  .sort((a, b) => b.value - a.value);
const portfolioAllocationData = [
  ...portfolioStockAllocationData,
  ...(portfolioCash > 0
    ? [{
        key: "portfolio-cash",
        name: "Cash",
        value: portfolioCash
      }]
    : [])
].sort((a, b) => b.value - a.value);
const totalPortfolioValue = portfolioAllocationData.reduce(
  (total, position) => total + position.value,
  0
);
const totalPortfolioStockValue = portfolioStockAllocationData.reduce(
  (total, position) => total + position.value,
  0
);
const totalPortfolioCostBasis = portfolio.reduce(
  (total, position) =>
    total + (Number(position.avgCost) || 0) * (Number(position.shares) || 0),
  0
);
const totalPortfolioProfit = totalPortfolioStockValue - totalPortfolioCostBasis;
const totalPortfolioPerformance = totalPortfolioCostBasis > 0
  ? (totalPortfolioProfit / totalPortfolioCostBasis) * 100
  : null;
const buildPortfolioExposureData = (field, fallbackLabel) => {
  const exposureMap = new Map();
  portfolio.forEach((position) => {
    const symbol = String(position.symbol || "").toUpperCase();
    const details = savedSymbolDetails[symbol] || {};
    const currentPrice = portfolioPrices[symbol];
    const allocationPrice = isNumber(currentPrice) && currentPrice > 0
      ? currentPrice
      : Number(position.avgCost) || 0;
    const value = allocationPrice * Number(position.shares || 0);
    if (value <= 0) return;
    const label = String(details[field] || "").trim() || fallbackLabel;
    exposureMap.set(label, (exposureMap.get(label) || 0) + value);
  });
  return [...exposureMap.entries()]
    .map(([name, value], index) => ({
      key: `${field}-${name}-${index}`,
      name,
      value
    }))
    .sort((a, b) => b.value - a.value);
};
const portfolioCountryData = buildPortfolioExposureData("country", "Unknown Country");
const portfolioIndustryData = buildPortfolioExposureData("industry", "Unknown Industry");
const renderPortfolioPiePanel = (title, data, emptyText) => {
  const panelTotal = data.reduce((total, item) => total + item.value, 0);
  return (
  <div className="portfolio-visual-panel">
    <h3>{title}</h3>
    {data.length ? (
      <>
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={56}
              outerRadius={98}
              paddingAngle={2}
              stroke="none"
              isAnimationActive
              animationBegin={0}
              animationDuration={260}
              animationEasing="ease-out"
            >
              {data.map((item, index) => (
                <Cell
                  key={item.key}
                  fill={PORTFOLIO_COLORS[index % PORTFOLIO_COLORS.length]}
                />
              ))}
            </Pie>
            <Tooltip formatter={(value) => formatPortfolioCurrency(Number(value))} />
          </PieChart>
        </ResponsiveContainer>
        <div className="allocation-legend">
            {data.map((item, index) => (
              <div className="allocation-legend-row" key={item.key}>
              <span
                className="allocation-swatch"
                style={{ background: PORTFOLIO_COLORS[index % PORTFOLIO_COLORS.length] }}
              />
                <strong>{item.name}</strong>
                <span>
                  {panelTotal > 0
                    ? `${((item.value / panelTotal) * 100).toFixed(1)}%`
                    : "0.0%"}
                </span>
              </div>
          ))}
        </div>
      </>
    ) : (
      <div className="portfolio-visual-empty">{emptyText}</div>
    )}
  </div>
  );
};
const primaryResultDocuments = companyDocuments?.resultDocuments || [];
const resultDocumentCards = (
  primaryResultDocuments.length
    ? primaryResultDocuments
    : [companyDocuments?.filings?.earningsRelease]
).filter((document, index, documents) =>
  document?.url &&
  documents.findIndex((item) => item?.url === document.url) === index
);
const exhibitDocumentCards = [
  companyDocuments?.filings?.earningsRelease,
  companyDocuments?.filings?.latest8K,
  ...(companyDocuments?.earningsExhibits || [])
].filter((document, index, documents) =>
  document?.url &&
  documents.findIndex((item) => item?.url === document.url) === index
);
const allSecDocumentCards = (companyDocuments?.allSecFilings || [])
  .filter((document) => document?.url || document?.indexUrl);
const companyDocumentCards = [
  companyDocuments?.filings?.tenK,
  companyDocuments?.filings?.tenQ,
  companyDocuments?.filings?.earningsRelease,
  companyDocuments?.filings?.latest8K,
  ...(companyDocuments?.resultDocuments || []),
  ...(companyDocuments?.earningsExhibits || []),
  ...allSecDocumentCards
].filter((document, index, documents) =>
  (document?.url || document?.indexUrl) &&
  documents.findIndex((item) => (item?.url || item?.indexUrl) === (document.url || document.indexUrl)) === index
);
const activeCompanyDocumentCards =
  activeCompanyDocumentTab === "results"
    ? resultDocumentCards
    : activeCompanyDocumentTab === "current"
      ? [
          ...exhibitDocumentCards,
          ...allSecDocumentCards.filter((document) => document.category === "current")
        ].filter((document, index, documents) =>
          (document?.url || document?.indexUrl) &&
          documents.findIndex((item) => (item?.url || item?.indexUrl) === (document.url || document.indexUrl)) === index
        )
      : activeCompanyDocumentTab === "all"
        ? companyDocumentCards
        : allSecDocumentCards.filter((document) => document.category === activeCompanyDocumentTab);

const stopComputerRead = () => {
  window.speechSynthesis?.cancel();
  speechQueueRef.current = [];
  speechIndexRef.current = 0;
  speechUtteranceRef.current = null;
  setIsSpeechPlaying(false);
  setIsSpeechPaused(false);
};

const playComputerRead = () => {
  if (!("speechSynthesis" in window)) {
    setSpeechError("Computer-read audio is not supported by this browser.");
    return;
  }
  setSpeechError("");
  if (isSpeechPlaying && isSpeechPaused) {
    window.speechSynthesis.resume();
    setIsSpeechPaused(false);
    return;
  }
  if (isSpeechPlaying) return;

  const queue = (earningsCall?.transcript || []).flatMap((section) =>
    splitForSpeech(`${section.speaker}. ${section.text}`)
  );
  if (!queue.length) return;

  window.speechSynthesis.cancel();
  speechQueueRef.current = queue;
  speechIndexRef.current = 0;
  setIsSpeechPlaying(true);
  setIsSpeechPaused(false);

  const speakNext = () => {
    const nextText = speechQueueRef.current[speechIndexRef.current];
    if (!nextText) {
      stopComputerRead();
      return;
    }
    speechIndexRef.current += 1;
    const utterance = new SpeechSynthesisUtterance(nextText);
    utterance.rate = speechRate;
    utterance.onend = speakNext;
    utterance.onerror = (event) => {
      if (event.error !== "canceled" && event.error !== "interrupted") {
        stopComputerRead();
      }
    };
    speechUtteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  };
  speakNext();
};

const pauseComputerRead = () => {
  if (!isSpeechPlaying) return;
  if (isSpeechPaused) {
    window.speechSynthesis.resume();
    setIsSpeechPaused(false);
  } else {
    window.speechSynthesis.pause();
    setIsSpeechPaused(true);
  }
};

const marketSignal = getMarketSignal(marketIndices);
const marketClock = getMarketClock(marketClockNow);
const displayedStockPrice = stockChartMeta?.price ?? stockData?.price;
const afterHoursTrade = stockData?.afterHoursTrade;
const hasAfterHoursTrade = isNumber(afterHoursTrade?.price);
const afterHoursBaseline = isNumber(displayedStockPrice)
  ? displayedStockPrice
  : isNumber(stockData?.regularClose)
    ? stockData.regularClose
    : isNumber(afterHoursTrade?.regularClose)
      ? afterHoursTrade.regularClose
      : null;
const afterHoursChange = isNumber(afterHoursTrade?.price) && isNumber(afterHoursBaseline)
  ? afterHoursTrade.price - afterHoursBaseline
  : null;
const afterHoursPercentChange = isNumber(afterHoursChange) && afterHoursBaseline > 0
  ? (afterHoursChange / afterHoursBaseline) * 100
  : null;
const formatAfterHoursTimestamp = (value) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "";
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
};
const normalizeRevenueSegmentPanel = (source, fallbackTitle) => {
  const rows = Array.isArray(source?.segments) ? source.segments : [];
  const total = rows.reduce((sum, item) => sum + (isNumber(item.value) ? item.value : 0), 0);
  if (!rows.length || total <= 0) return null;
  const topRows = rows.slice(0, 7);
  const otherValue = rows.slice(7).reduce((sum, item) => sum + (isNumber(item.value) ? item.value : 0), 0);
  const segments = otherValue > 0
    ? [...topRows, { label: "Other", value: otherValue }]
    : topRows;
  return {
    title: fallbackTitle,
    fiscalYear: source.fiscalYear,
    date: source.date,
    currency: source.currency,
    total,
    segments
  };
};
const revenueSegmentPanels = [
  normalizeRevenueSegmentPanel(stockData?.revenueProductSegments, "Product Revenue Mix"),
  normalizeRevenueSegmentPanel(stockData?.revenueGeographicSegments, "Geographic Revenue Mix")
].filter(Boolean);
const displayedMarketIndices = MARKET_INDEX_ORDER.map((item) => ({
  ...item,
  ...(marketIndices.find((index) => index.key === item.key) || {})
}));
const etfStats = etfData?.stats || {};
const etfProfile = etfData?.profile || {};
const topEtfHoldings = etfData?.holdings || [];
const etfChartPoints = Array.isArray(etfChartData?.points) ? etfChartData.points : [];
const etfChartLatest = etfChartData?.latest || {};
const displayedEtfPrice = isNumber(etfChartLatest?.price) ? etfChartLatest.price : etfData?.price;
const displayedEtfPercentChange = isNumber(etfChartLatest?.percentChange)
  ? etfChartLatest.percentChange
  : etfData?.percentChange;
const isMutualFundView = /mutual fund/i.test(String(etfData?.type || etfProfile.assetClass || ""));
const cryptoChartPoints = Array.isArray(cryptoChartData?.points) ? cryptoChartData.points : [];
const cryptoChartLatest = cryptoChartData?.latest || {};
const displayedCryptoPrice = isNumber(cryptoChartLatest?.price) ? cryptoChartLatest.price : cryptoData?.price;
const displayedCryptoPercentChange = isNumber(cryptoChartLatest?.percentChange)
  ? cryptoChartLatest.percentChange
  : cryptoData?.changePercentage;
const forexChartPoints = Array.isArray(forexChartData?.points) ? forexChartData.points : [];
const forexChartLatest = forexChartData?.latest || {};
const displayedForexPrice = isNumber(forexChartLatest?.price) ? forexChartLatest.price : forexData?.price;
const displayedForexPercentChange = isNumber(forexChartLatest?.percentChange)
  ? forexChartLatest.percentChange
  : forexData?.changePercentage;
const commodityChartPoints = Array.isArray(commodityChartData?.points) ? commodityChartData.points : [];
const commodityChartLatest = commodityChartData?.latest || {};
const displayedCommodityPrice = isNumber(commodityChartLatest?.price) ? commodityChartLatest.price : commodityData?.price;
const displayedCommodityPercentChange = isNumber(commodityChartLatest?.percentChange)
  ? commodityChartLatest.percentChange
  : commodityData?.changePercentage;
const commodityCards = [
  { label: "Price", value: formatPrice(displayedCommodityPrice) },
  { label: "Change", value: isNumber(commodityData?.change) ? formatPrice(commodityData.change) : "N/A" },
  { label: "Change %", value: formatSignedPercent(displayedCommodityPercentChange) },
  { label: "Volume", value: isNumber(commodityData?.volume) ? commodityData.volume.toLocaleString() : "N/A" },
  { label: "Day Low", value: formatPrice(commodityData?.dayLow) },
  { label: "Day High", value: formatPrice(commodityData?.dayHigh) },
  { label: "Year Low", value: formatPrice(commodityData?.yearLow) },
  { label: "Year High", value: formatPrice(commodityData?.yearHigh) },
  { label: "50 Day Avg", value: formatPrice(commodityData?.priceAvg50) },
  { label: "200 Day Avg", value: formatPrice(commodityData?.priceAvg200) },
  { label: "Open", value: formatPrice(commodityData?.open) },
  { label: "Previous Close", value: formatPrice(commodityData?.previousClose) },
  { label: "Currency", value: commodityData?.currency || "N/A" },
  { label: "Trade Month", value: commodityData?.tradeMonth || "N/A" }
];
const cryptoCards = [
  { label: "Price", value: formatPrice(displayedCryptoPrice) },
  { label: "Change", value: isNumber(cryptoData?.change) ? formatPrice(cryptoData.change) : "N/A" },
  { label: "Change %", value: formatSignedPercent(displayedCryptoPercentChange) },
  { label: "Volume", value: isNumber(cryptoData?.volume) ? cryptoData.volume.toLocaleString() : "N/A" },
  { label: "Market Cap", value: formatLargeDollars(cryptoData?.marketCap) },
  { label: "Day Low", value: formatPrice(cryptoData?.dayLow) },
  { label: "Day High", value: formatPrice(cryptoData?.dayHigh) },
  { label: "Year Low", value: formatPrice(cryptoData?.yearLow) },
  { label: "Year High", value: formatPrice(cryptoData?.yearHigh) },
  { label: "50 Day Avg", value: formatPrice(cryptoData?.priceAvg50) },
  { label: "200 Day Avg", value: formatPrice(cryptoData?.priceAvg200) },
  { label: "Open", value: formatPrice(cryptoData?.open) },
  { label: "Previous Close", value: formatPrice(cryptoData?.previousClose) },
  { label: "ICO Date", value: cryptoData?.icoDate || "N/A" },
  { label: "Circulating Supply", value: isNumber(cryptoData?.circulatingSupply) ? cryptoData.circulatingSupply.toLocaleString() : "N/A" },
  { label: "Total Supply", value: isNumber(cryptoData?.totalSupply) ? cryptoData.totalSupply.toLocaleString() : "N/A" }
];
const forexCards = [
  { label: "Price", value: formatPlain(displayedForexPrice) },
  { label: "Change", value: isNumber(forexData?.change) ? formatPlain(forexData.change) : "N/A" },
  { label: "Change %", value: formatSignedPercent(displayedForexPercentChange) },
  { label: "Volume", value: isNumber(forexData?.volume) ? forexData.volume.toLocaleString() : "N/A" },
  { label: "Day Low", value: formatPlain(forexData?.dayLow) },
  { label: "Day High", value: formatPlain(forexData?.dayHigh) },
  { label: "Year Low", value: formatPlain(forexData?.yearLow) },
  { label: "Year High", value: formatPlain(forexData?.yearHigh) },
  { label: "50 Day Avg", value: formatPlain(forexData?.priceAvg50) },
  { label: "200 Day Avg", value: formatPlain(forexData?.priceAvg200) },
  { label: "Exchange", value: forexData?.exchange || "FOREX" },
  { label: "Open", value: formatPlain(forexData?.open) },
  { label: "Previous Close", value: formatPlain(forexData?.previousClose) },
  { label: "From", value: forexData?.fromCurrency || "N/A" },
  { label: "To", value: forexData?.toCurrency || "N/A" }
];
const etfOverviewCards = [
  { label: "Assets", value: formatLargeDollars(etfStats.assets) },
  { label: "Expense Ratio", value: formatPercent(etfStats.expenseRatio) },
  { label: "P/E Ratio", value: formatPlain(etfStats.peRatio) },
  { label: "Shares Out", value: formatSharesCount(etfStats.sharesOutstanding) },
  { label: "Dividend (ttm)", value: formatPrice(etfStats.dividend) },
  { label: "Dividend Yield", value: formatPercent(etfStats.dividendYield) },
  { label: "Ex-Dividend", value: etfStats.exDividendDate || "N/A" },
  { label: "Payout Frequency", value: etfStats.payoutFrequency || "N/A" },
  { label: "Payout Ratio", value: formatPercent(etfStats.payoutRatio) },
  { label: "Volume", value: isNumber(etfStats.volume) ? etfStats.volume.toLocaleString() : "N/A" },
  { label: "Open", value: formatPrice(etfStats.open) },
  { label: "Previous Close", value: formatPrice(etfStats.previousClose) },
  { label: "Day's Range", value: etfStats.dayRange || "N/A" },
  { label: "52-Week Low", value: formatPrice(etfStats.fiftyTwoWeekLow) },
  { label: "52-Week High", value: formatPrice(etfStats.fiftyTwoWeekHigh) },
  { label: "Beta", value: formatPlain(etfStats.beta) },
  { label: "Holdings", value: isNumber(etfStats.holdingsCount) ? etfStats.holdingsCount.toLocaleString() : "N/A" },
  { label: "Top 10 Weight", value: formatPercent(etfStats.top10Percent) },
  { label: "Inception", value: etfStats.inceptionDate || "N/A" },
  isNumber(etfStats.bondDuration) ? { label: "Bond Duration", value: formatPlain(etfStats.bondDuration) } : null,
  isNumber(etfStats.bondMaturity) ? { label: "Bond Maturity", value: formatPlain(etfStats.bondMaturity) } : null
].filter(Boolean);
const fundOverviewCards = [
  { label: "NAV / Price", value: formatPrice(etfData?.price) },
  { label: "Daily Move", value: formatSignedPercent(etfData?.percentChange) },
  { label: "Previous NAV", value: formatPrice(etfStats.previousClose) },
  { label: "Fund Assets", value: formatLargeDollars(etfStats.assets) },
  { label: "Expense Ratio", value: formatPercent(etfStats.expenseRatio) },
  { label: "YTD Return", value: formatPercent(etfStats.ytdReturn) },
  { label: "1-Year Return", value: formatPercent(etfStats.oneYearReturn) },
  { label: "5-Year Return", value: formatPercent(etfStats.fiveYearReturn) },
  { label: "52W Range", value: `${formatPrice(etfStats.fiftyTwoWeekLow)} - ${formatPrice(etfStats.fiftyTwoWeekHigh)}` },
  { label: "Holdings", value: isNumber(etfStats.holdingsCount) ? etfStats.holdingsCount.toLocaleString() : "N/A" },
  { label: "Top 10 Weight", value: formatPercent(etfStats.top10Percent) },
  { label: "Turnover", value: formatPercent(etfStats.turnover) },
  { label: "Dividend Yield", value: formatPercent(etfStats.dividendYield) },
  { label: "Dividend (ttm)", value: formatPlain(etfStats.dividend) },
  { label: "Dividend Growth", value: formatPercent(etfStats.dividendGrowth) },
  { label: "Beta (5Y)", value: formatPlain(etfStats.beta) },
  { label: "Ex-Dividend", value: etfStats.exDividendDate || "N/A" },
  { label: "Inception", value: etfStats.inceptionDate || "N/A" },
  { label: "Min Investment", value: isNumber(etfStats.minimumInitialInvestment) ? formatLargeDollars(etfStats.minimumInitialInvestment) : "N/A" },
  { label: "Fund Type", value: etfData?.type || etfProfile.assetClass || "N/A" },
  { label: "Category", value: etfProfile.category || "N/A" },
  { label: "Pricing", value: etfStats.pricingFrequency || "N/A" },
  { label: "Last Priced", value: etfStats.lastTradeDate || "N/A" },
  { label: "Exchange", value: etfProfile.exchange || "N/A" },
  etfStats.shareClass ? { label: "Share Class", value: etfStats.shareClass } : null,
  etfStats.distributionFrequency ? { label: "Distribution", value: etfStats.distributionFrequency } : null
].filter(Boolean);
const etfProfileItems = isMutualFundView
  ? [
      { label: "Exchange", value: etfProfile.exchange },
      { label: "Provider", value: etfProfile.provider },
      { label: "Category", value: etfProfile.category },
      { label: "Asset Class", value: etfProfile.assetClass },
      { label: "Source", value: etfData?.source }
    ]
  : [
      { label: "Provider", value: etfProfile.provider },
      { label: "Category", value: etfProfile.category },
      { label: "Asset Class", value: etfProfile.assetClass },
      { label: "Index", value: etfProfile.indexTracked }
    ];
const hasEtfBreakdownData = [etfData?.sectors, etfData?.countries, etfData?.assetAllocation]
  .some((rows) => Array.isArray(rows) && rows.length);
const renderEtfExposureBars = (title, rows = []) => (
  <div className="etf-panel">
    <h3>{title}</h3>
    {rows.length ? (
      <div className="etf-exposure-list">
        {rows.slice(0, 12).map((row) => (
          <div className="etf-exposure-row" key={row.name}>
            <div>
              <span>{row.name}</span>
              <strong>{formatPercent(row.weight)}</strong>
            </div>
            <div className="etf-exposure-track">
              <span style={{ width: `${Math.max(2, Math.min(100, row.weight || 0))}%` }} />
            </div>
          </div>
        ))}
      </div>
    ) : (
      <div className="etf-empty">No breakdown available yet.</div>
    )}
  </div>
);
const renderMarketMoverPanel = (title, rows, tone, scope, isLoading = false) => (
  <section className={`market-movers-panel mover-${tone}`} key={`${scope}-${title}`}>
    <div className="market-movers-heading">
      <span>{title}</span>
      <strong>{scope}</strong>
    </div>
    {rows.length ? (
      rows.map((company) => (
        <button
          className="market-mover-row"
          key={`${scope}-${title}-${company.symbol}`}
          type="button"
          onClick={() => {
            setSearchInput(company.symbol);
            setTicker(company.symbol);
            setActivePage("overview");
          }}
        >
          <span>
            <strong>{company.symbol}</strong>
            <small>{company.name}</small>
          </span>
          <em>{formatSignedPercent(company.percentChange)}</em>
        </button>
      ))
    ) : (
      <div className="market-movers-empty">{isLoading ? "Loading movers..." : "No movers available yet."}</div>
    )}
  </section>
);

const renderTopTradedStocks = () => (
  <section className="top-traded-overview" aria-labelledby="top-traded-overview-title">
    <div className="market-movers-block-heading">
      <span id="top-traded-overview-title">Top Traded Stocks</span>
      {topTradedStocks.updatedAt && (
        <strong>
          Updated {new Date(topTradedStocks.updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
        </strong>
      )}
    </div>
    <div className="top-traded-list">
      {topTradedStocks.stocks.length ? topTradedStocks.stocks.slice(0, 10).map((stock) => (
        <button
          className="top-traded-row"
          key={`top-traded-${stock.symbol}`}
          type="button"
          onClick={() => {
            setSearchInput(stock.symbol);
            setTicker(stock.symbol);
            setActivePage("overview");
          }}
        >
          <span>
            <strong>{stock.symbol}</strong>
            <small>{stock.name}</small>
          </span>
          <em>{formatLargeNumber(stock.volume)}</em>
          <b className={isNumber(stock.percentChange) && stock.percentChange < 0 ? "negative-text" : "positive-text"}>
            {formatSignedPercent(stock.percentChange)}
          </b>
        </button>
      )) : (
        <div className="market-movers-empty">
          {isTopTradedStocksLoading ? "Loading top traded stocks..." : "No top traded stocks available yet."}
        </div>
      )}
    </div>
  </section>
);

const renderOverviewSectionGuide = () => (
  <aside className="overview-section-guide" aria-label="Stock overview page guide">
    <div className="overview-section-guide-handle" aria-hidden="true">
      <span />
    </div>
    <div className="overview-section-guide-panel">
      <div className="overview-section-guide-heading">
        <span>MrktRally Guide</span>
        <strong>{stockData.symbol || ticker}</strong>
      </div>
      <nav>
        {STOCK_OVERVIEW_SECTIONS.map((section) => (
          <button
            key={section.id}
            type="button"
            onClick={() => {
              document.getElementById(section.id)?.scrollIntoView({
                behavior: "smooth",
                block: "start"
              });
            }}
          >
            <span className="overview-section-guide-icon">
              {renderOverviewGuideIcon(section.icon)}
            </span>
            <strong>{section.label}</strong>
          </button>
        ))}
      </nav>
    </div>
  </aside>
);

const marketOverviewStrip = (
  <div className="market-strip" aria-label="Market index snapshot">
    <div className={`market-signal ${marketSignal.tone}`}>
      <span>{marketSignal.label}</span>
    </div>

    <div className={`market-countdown ${marketClock.tone}`}>
      <span>{marketClock.label}</span>
      <strong>{marketClock.value}</strong>
    </div>

    <div className="market-index-grid">
      {displayedMarketIndices.map((index) => (
          <div className={`market-index-card ${getMarketIndexTone(index.percentChange)}`} key={index.key}>
            <span className="market-index-label">{index.label}</span>
            <strong>{isNumber(index.price) ? formatIndexPrice(index.price) : "Loading"}</strong>
            <span className={`market-index-change ${
              index.percentChange > 0
                ? "positive"
                : index.percentChange < 0
                  ? "negative"
                  : "neutral"
            }`}>
              {isNumber(index.percentChange)
                ? `${index.percentChange > 0 ? "+" : ""}${index.percentChange.toFixed(2)}%`
                : isMarketLoading ? "Loading" : "--"}
            </span>
          </div>
        ))}
    </div>
  </div>
);

const sendMrRallyMessage = async (event) => {
  event.preventDefault();
  const message = mrRallyInput.trim();
  if (!message || isMrRallyLoading) return;

  const outgoingMessages = [
    ...mrRallyMessages,
    { role: "user", content: message }
  ];
  setMrRallyMessages(outgoingMessages);
  setMrRallyInput("");
  setIsMrRallyLoading(true);

  try {
    const response = await axios.post(
      `${API_URL}/api/mr-rally-chat`,
      {
        message,
        ticker,
        history: mrRallyMessages
      },
      { timeout: 20000 }
    );

    setMrRallyMessages([
      ...outgoingMessages,
      {
        role: "assistant",
        content: response.data.answer || "I could not find enough reliable data to answer that yet."
      }
    ]);
  } catch (error) {
    console.error("Mr. Rally chat failed", error);
    const status = error.response?.status;
    const backendMessage = error.response?.data?.error;
    const timeoutMessage = error.code === "ECONNABORTED"
      ? "Mr. Rally took too long to answer. Try a shorter question or ask again."
      : null;
    const failureMessage = backendMessage
      || timeoutMessage
      || (status ? `Mr. Rally request failed with status ${status}.` : "I’m having trouble reaching the stock data right now. Try again in a moment.");
    setMrRallyMessages([
      ...outgoingMessages,
      {
        role: "assistant",
        content: failureMessage
      }
    ]);
  } finally {
    setIsMrRallyLoading(false);
  }
};

const mrRallySection = (
  <section className="chart-section mr-rally-section" id="mr-rally">
    <div className="mr-rally-heading">
      <div className="mr-rally-brand">
        <img src="/mr-rally-mascot.png" alt="Mr. Rally" />
        <div>
          <h2 className="section-title">Mr. Rally</h2>
          <p>Ask about valuation, estimates, debt, margins, risks, or any ticker. Mr. Rally answers the question directly and reaches outside only when MrktRally does not have the data.</p>
        </div>
      </div>
      <span className="mr-rally-status">{isMrRallyLoading ? "Thinking" : "Ready"}</span>
    </div>

    <div className="mr-rally-chat">
      <div className="mr-rally-messages" aria-live="polite">
        {mrRallyMessages.map((message, index) => (
          <div
          className={`mr-rally-message ${message.role}`}
          key={`${message.role}-${index}`}
        >
          <span>
            {message.role === "assistant" && <img src="/mr-rally-mascot.png" alt="" />}
            {message.role === "user" ? "You" : "Mr. Rally"}
          </span>
          <p>{message.content}</p>
        </div>
      ))}
      {isMrRallyLoading && (
        <div className="mr-rally-message assistant">
          <span><img src="/mr-rally-mascot.png" alt="" />Mr. Rally</span>
          <p>Checking the data...</p>
        </div>
      )}
      </div>

      <form className="mr-rally-form" onSubmit={sendMrRallyMessage}>
        <textarea
        value={mrRallyInput}
        onChange={(event) => setMrRallyInput(event.target.value)}
        placeholder={`Try: What is ${ticker}'s forward P/E? How much debt does HD have? What are AMD's biggest risks?`}
        rows={3}
      />
        <button type="submit" disabled={!mrRallyInput.trim() || isMrRallyLoading}>
          Ask Mr. Rally
        </button>
      </form>
    </div>
  </section>
);

const comparisonMetricGroupsForStock = (stock = {}) => [
  {
    title: "Snapshot",
    metrics: [
      { label: "Market Cap", value: formatBillions(stock.marketCap) },
      { label: "Beta", value: formatPlain(stock.beta) },
      { label: "Volume", value: formatLargeNumber(stock.volume) },
      { label: "Last Dividend", value: formatPrice(stock.lastDividend) },
      { label: "50-Day Avg", value: formatPrice(stock.priceAvg50) },
      { label: "200-Day Avg", value: formatPrice(stock.priceAvg200) },
      { label: "Price Target", value: formatPrice(stock.targetMean) },
      { label: "Analyst Rating", value: stock.analystRatingText || stock.recommendationKey || "N/A" },
      { label: "Dividend Yield", value: formatDividendYield(stock.dividendYield) },
      {
        label: "52-Week Range",
        value: isNumber(stock.fiftyTwoWeekLow) && isNumber(stock.fiftyTwoWeekHigh)
          ? `${formatPrice(stock.fiftyTwoWeekLow)} to ${formatPrice(stock.fiftyTwoWeekHigh)}`
          : "N/A"
      }
    ]
  },
  {
    title: "Valuation",
    metrics: [
      { label: "TTM P/E", value: formatPlain(stock.pe) },
      { label: "Forward P/E", value: formatPlain(stock.forwardPE) },
      { label: "Forward P/S", value: formatPlain(stock.forwardPS) },
      { label: "PEG Ratio TTM", value: formatPlain(stock.pegRatio) },
      { label: "Forward PEG", value: formatPlain(stock.forwardPegRatio) },
      { label: "Price-to-Sales", value: formatPlain(stock.priceToSales) },
      { label: "Price-to-Book", value: formatPlain(stock.priceToBook) },
      { label: "Price / Fair Value", value: formatPlain(stock.priceToFairValue) },
      { label: "P/TBV Ratio", value: formatPlain(stock.priceToTangibleBook) },
      { label: "P/FCF Ratio", value: formatPlain(stock.priceToFreeCashflow) },
      { label: "P/OCF Ratio", value: formatPlain(stock.priceToOperatingCashflow) },
      { label: "Enterprise Value", value: formatBillions(stock.enterpriseValue) },
      { label: "EV / Sales", value: formatPlain(stock.evToSales) },
      { label: "EV / EBITDA", value: formatPlain(stock.evToEbitda) },
      { label: "EV / OCF", value: formatPlain(stock.evToOperatingCashflow) },
      { label: "EV / FCF", value: formatPlain(stock.evToFreeCashflow) },
      { label: "Net Debt / EBITDA", value: formatPlain(stock.netDebtToEbitda) },
      { label: "FCF Yield", value: formatPercent(stock.fcfYield) },
      { label: "Earnings Yield", value: formatPercent(stock.earningsYield) },
      { label: "Graham Number", value: formatPrice(stock.grahamNumber) },
      { label: "Graham Net-Net", value: formatPrice(stock.grahamNetNet) }
    ]
  },
  {
    title: "Growth",
    metrics: [
      { label: "Previous Year Revenue Growth", value: formatPercent(stock.revenueGrowth) },
      { label: "Previous Year Earnings Growth", value: formatPercent(stock.earningsGrowth) },
      { label: "Previous Year FCF Growth", value: formatPercent(stock.freeCashflowGrowth) },
      { label: "Previous Year OCF Growth", value: formatPercent(stock.operatingCashflowGrowth) },
      { label: "Previous Year EBITDA Growth", value: formatPercent(stock.ebitdaGrowth) },
      { label: "Previous Year Debt Growth", value: formatPercent(stock.debtGrowth) },
      { label: "3Y Revenue / Share Growth", value: formatPercent(stock.threeYearRevenueGrowthPerShare) },
      { label: "5Y Revenue / Share Growth", value: formatPercent(stock.fiveYearRevenueGrowthPerShare) },
      { label: "3Y Net Income / Share Growth", value: formatPercent(stock.threeYearNetIncomeGrowthPerShare) },
      { label: "5Y Net Income / Share Growth", value: formatPercent(stock.fiveYearNetIncomeGrowthPerShare) }
    ]
  },
  {
    title: "Balance Sheet",
    metrics: [
      { label: "Cash & Equivalents", value: formatBillions(stock.cashAndCashEquivalents ?? stock.totalCash) },
      { label: "Total Debt", value: formatBillions(stock.totalDebt) },
      { label: "Net Cash", value: formatBillions(stock.netCash) },
      { label: "Net Cash / Share", value: formatPrice(stock.netCashPerShare) },
      { label: "Equity Book Value", value: formatBillions(stock.equityBookValue) },
      { label: "Book Value / Share", value: formatPrice(stock.bookValuePerShare) },
      { label: "Working Capital", value: formatBillions(stock.workingCapital) },
      { label: "Invested Capital", value: formatLargeDollars(stock.investedCapital) },
      { label: "Tangible Asset Value", value: formatLargeDollars(stock.tangibleAssetValue) },
      { label: "Net Current Asset Value", value: formatLargeDollars(stock.netCurrentAssetValue) },
      { label: "Intangibles / Assets", value: formatPercent(stock.intangiblesToTotalAssets) }
    ]
  },
  {
    title: "Per Share & Scale",
    metrics: [
      { label: "Shares Outstanding", value: isNumber(stock.sharesOutstanding) ? `${(stock.sharesOutstanding / 1000).toFixed(2)}B` : "N/A" },
      { label: "Float Shares", value: formatSharesCount(stock.floatShares) },
      { label: "Free Float Shares", value: formatSharesCount(stock.freeFloatShares) },
      { label: "Employee Count", value: formatSharesCount(stock.employeeCount) },
      { label: "Revenue / Share", value: formatPrice(stock.revenuePerShare) },
      { label: "Net Income / Share", value: formatPrice(stock.netIncomePerShare) },
      { label: "Cash / Share", value: formatPrice(stock.cashPerShare) },
      { label: "FCF / Share", value: formatPrice(stock.freeCashflowPerShare) },
      { label: "OCF / Share", value: formatPrice(stock.operatingCashflowPerShare) },
      { label: "Tangible Book / Share", value: formatPrice(stock.tangibleBookValuePerShare) },
      { label: "Revenue / Employee", value: formatLargeDollars(stock.revenuePerEmployee) },
      { label: "Profit / Employee", value: formatLargeDollars(stock.profitsPerEmployee) }
    ]
  },
  {
    title: "Profitability",
    metrics: [
      { label: stock.isFinancialCompany ? "Net Interest Revenue Mix" : "Gross Margin", value: formatPercent(stock.isFinancialCompany ? stock.bankMetrics?.netInterestRevenueMix : stock.grossMargins) },
      { label: stock.isFinancialCompany ? "Pre-Tax Margin" : "Operating Margin", value: formatPercent(stock.isFinancialCompany ? stock.bankMetrics?.preTaxMargin : stock.operatingMargins) },
      { label: "Profit Margin", value: formatPercent(stock.profitMargins) },
      { label: "Pretax Margin", value: formatPercent(stock.pretaxMargin) },
      { label: "EBITDA Margin", value: formatPercent(stock.ebitdaMargin) },
      { label: "EBIT Margin", value: formatPercent(stock.ebitMargin) },
      { label: "FCF Margin", value: formatPercent(stock.fcfMargin) },
      { label: "Bottom Line Margin", value: formatPercent(stock.bottomLineProfitMargin) },
      { label: "Continuing Ops Margin", value: formatPercent(stock.continuousOperationsProfitMargin) },
      { label: "OCF / Sales", value: formatPercent(stock.operatingCashflowSalesRatio) },
      { label: "FCF / OCF", value: formatPercent(stock.freeCashflowOperatingCashflowRatio) },
      { label: "ROE", value: formatPercent(stock.returnOnEquity) },
      { label: "ROA", value: formatPercent(stock.returnOnAssets) },
      { label: "Operating ROA", value: formatPercent(stock.operatingReturnOnAssets) },
      { label: "ROIC", value: formatPercent(stock.returnOnInvestedCapital) },
      { label: "ROCE", value: formatPercent(stock.returnOnCapitalEmployed) },
      { label: "Return on Tangible Assets", value: formatPercent(stock.returnOnTangibleAssets) },
      { label: "WACC", value: formatPercent(stock.weightedAverageCostOfCapital) }
    ]
  },
  {
    title: "Liquidity & Efficiency",
    metrics: [
      { label: "Current Ratio", value: formatPlain(stock.currentRatio) },
      { label: "Quick Ratio", value: formatPlain(stock.quickRatio) },
      { label: "Cash Ratio", value: formatPlain(stock.cashRatio) },
      { label: "Debt / Equity", value: formatPlain(stock.debtToEquity) },
      { label: "Debt / Assets", value: formatPercent(stock.debtToAssets) },
      { label: "Debt / Capital", value: formatPercent(stock.debtToCapital) },
      { label: "Debt / Market Cap", value: formatPercent(stock.debtToMarketCap) },
      { label: "LT Debt / Capital", value: formatPercent(stock.longTermDebtToCapital) },
      { label: "Financial Leverage", value: formatPlain(stock.financialLeverage) },
      { label: "Interest Coverage", value: formatPlain(stock.interestCoverage) },
      { label: "Debt Service Coverage", value: formatPlain(stock.debtServiceCoverage) },
      { label: "OCF Coverage", value: formatPlain(stock.operatingCashflowCoverage) },
      { label: "Short-Term OCF Coverage", value: formatPlain(stock.shortTermOperatingCashflowCoverage) },
      { label: "OCF Ratio", value: formatPlain(stock.operatingCashflowRatio) },
      { label: "Solvency Ratio", value: formatPlain(stock.solvencyRatio) },
      { label: "Interest Debt / Share", value: formatPrice(stock.interestDebtPerShare) },
      { label: "Income Quality", value: formatPlain(stock.incomeQuality) },
      { label: "Asset Turnover", value: formatPlain(stock.assetTurnover) },
      { label: "Fixed Asset Turnover", value: formatPlain(stock.fixedAssetTurnover) },
      { label: "Inventory Turnover", value: formatPlain(stock.inventoryTurnover) },
      { label: "Receivables Turnover", value: formatPlain(stock.receivablesTurnover) },
      { label: "Payables Turnover", value: formatPlain(stock.payablesTurnover) },
      { label: "Working Capital Turnover", value: formatPlain(stock.workingCapitalTurnover) },
      { label: "Cash Conversion Cycle", value: formatPlain(stock.cashConversionCycle) },
      { label: "Days Sales Outstanding", value: formatPlain(stock.daysSalesOutstanding) },
      { label: "Days Payables Outstanding", value: formatPlain(stock.daysPayablesOutstanding) },
      { label: "Days Inventory Outstanding", value: formatPlain(stock.daysInventoryOutstanding) },
      { label: "Operating Cycle", value: formatPlain(stock.operatingCycle) }
    ]
  },
  {
    title: "Cash Flow & Capital",
    metrics: [
      { label: stock.isFinancialCompany ? "Annual Cash Change" : "Free Cash Flow", value: formatBillions(stock.isFinancialCompany ? stock.bankMetrics?.annualCashChange : stock.freeCashflow) },
      ...(!stock.isFinancialCompany ? [{ label: "Operating Cash Flow", value: formatBillions(stock.operatingCashflow) }] : []),
      { label: "FCF to Equity", value: formatLargeDollars(stock.freeCashflowToEquity) },
      { label: "FCF to Firm", value: formatLargeDollars(stock.freeCashflowToFirm) },
      { label: "Average Inventory", value: formatLargeDollars(stock.averageInventory) },
      { label: "Average Payables", value: formatLargeDollars(stock.averagePayables) },
      { label: "Average Receivables", value: formatLargeDollars(stock.averageReceivables) },
      { label: "R&D / Revenue", value: formatPercent(stock.rdToRevenue) },
      { label: "SG&A / Revenue", value: formatPercent(stock.sgaToRevenue) },
      { label: "Stock Comp / Revenue", value: formatPercent(stock.stockBasedCompToRevenue) },
      { label: "Capex / Revenue", value: formatPercent(stock.capexToRevenue) },
      { label: "Capex / OCF", value: formatPercent(stock.capexToOperatingCashflow) },
      { label: "Capex / Depreciation", value: formatPercent(stock.capexToDepreciation) },
      { label: "Capex / Share", value: formatPrice(stock.capexPerShare) },
      { label: "Capex Coverage", value: formatPlain(stock.capitalExpenditureCoverage) },
      { label: "Dividend + Capex Coverage", value: formatPlain(stock.dividendPaidAndCapexCoverage) },
      { label: "Dividend Yield TTM", value: formatPercent(stock.dividendYieldTtm) },
      { label: "Dividend Payout Ratio", value: formatPercent(stock.dividendPayoutRatio) },
      { label: "Dividend / Share", value: formatPrice(stock.dividendPerShare) },
      { label: "Effective Tax Rate", value: formatPercent(stock.effectiveTaxRate) },
      { label: "Tax Burden", value: formatPlain(stock.taxBurden) },
      { label: "Interest Burden", value: formatPlain(stock.interestBurden) },
      { label: "EBT / EBIT", value: formatPlain(stock.ebtPerEbit) },
      { label: "Net Income / EBT", value: formatPlain(stock.netIncomePerEbt) }
    ]
  },
  {
    title: "Profile",
    metrics: [
      { label: "Industry", value: stock.industry || "N/A" },
      { label: "CEO", value: stock.ceo || "N/A" },
      { label: "Country", value: stock.country || "N/A" },
      { label: "Exchange", value: stock.exchange || "N/A" }
    ]
  }
];

const comparisonSection = (
  <section className="comparison-page" id="comparison">
    <div className="financial-statement-hero comparison-hero">
      <div>
        <span className="home-feature-label">Side-by-Side Research</span>
        <h2>Compare</h2>
        <p>Line companies up across valuation, growth, profitability, balance sheet strength, cash flow, and profile data in one organized view.</p>
      </div>
      <span className="market-overview-updated">
        {compareData.length} selected
      </span>
    </div>

  <div className="comparison-controls">

    <input
      className="portfolio-input"
      placeholder="Add comparison ticker"
      onKeyDown={(e) => {

        if (e.key === "Enter") {

          if (addComparisonTicker(e.target.value)) {
            e.target.value = "";
          }
        }
      }}
    />

  </div>

    <div className="comparison-grid">


  {compareData.map((stock) => (

    <div
      key={stock.symbol}
      className="comparison-card"
    >

      <button
        className="remove-position"
        onClick={() => removeComparisonTicker(stock.symbol)}
      >
        Remove
      </button>

      <div className="comparison-symbol">
        {stock.symbol}
      </div>

      <div className="comparison-name">
        {stock.name}
      </div>

      <div className="comparison-price">
        {formatPrice(stock.price)}
      </div>

      {comparisonMetricGroupsForStock(stock).map((group) => (
        <div className="comparison-metric-group" key={group.title}>
          <h4>{group.title}</h4>
          <div className="comparison-stat-grid">
            {group.metrics.map((metric) => (
              <div className="comparison-stat" key={metric.label}>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
              </div>
            ))}
          </div>
        </div>
      ))}

    </div>

  ))}

    </div>

  </section>
);

const selectStockSearchSuggestion = (item, destinationPage = "overview") => {
  const symbol = normalizeStockSearchSymbol(item?.symbol);
  if (!symbol) return;
  if (warnStockOnlySymbol(symbol)) return;

  setSearchInput(symbol);
  setStockSearchSuggestions([]);
  setShowStockSearchSuggestions(false);
  setActivePage(destinationPage);

  if (symbol !== ticker) {
    setTicker(symbol);
    return;
  }

  if (stockRetryTimerRef.current) {
    window.clearTimeout(stockRetryTimerRef.current);
    stockRetryTimerRef.current = null;
  }
  const requestId = ++latestStockRequest.current;
  const cachedStock = stockMemoryCacheRef.current.get(symbol) || null;
  setStockData(cachedStock);
  setIsStockLoading(!cachedStock);
  loadStock(symbol, 0, requestId);
};

const searchEtfSymbol = (symbol) => {
  const cleanSymbol = String(symbol || "").trim().toUpperCase();
  if (!cleanSymbol) return;
  setEtfSearchInput(cleanSymbol);
  setEtfSearchSuggestions([]);
  setShowEtfSearchSuggestions(false);
  setEtfData(null);
  setEtfError("");
  setEtfChartData({ points: [], latest: null });
  setEtfChartError("");
  setIsEtfLoading(true);
  setEtfTicker(cleanSymbol);
};

const resolveEtfSearchInputToSymbol = async () => {
  const value = etfSearchInput.trim();
  if (!value) return "";
  const normalizedValue = value.toUpperCase();
  const exactSuggestion = etfSearchSuggestions.find(
    (item) => String(item.symbol || "").toUpperCase() === normalizedValue
  );
  if (exactSuggestion?.symbol) return String(exactSuggestion.symbol).toUpperCase();
  if (etfSearchSuggestions[0]?.symbol) return String(etfSearchSuggestions[0].symbol).toUpperCase();

  try {
    const { data } = await axios.get(`${API_URL}/api/search-stocks`, {
      params: { q: value, includeFunds: true, fundsOnly: true },
      timeout: 4500
    });
    const results = Array.isArray(data?.results) ? data.results : [];
    const exactResult = results.find(
      (item) => String(item.symbol || "").toUpperCase() === normalizedValue
    );
    return String((exactResult || results[0])?.symbol || "").toUpperCase();
  } catch (error) {
    console.error("ETF search lookup failed", error);
  }

  return "";
};

const selectEtfSearchSuggestion = (item) => {
  const symbol = String(item?.symbol || "").trim().toUpperCase();
  if (!symbol) return;
  searchEtfSymbol(symbol);
};

const renderEtfSearchSuggestions = () => {
  const shouldShow =
    showEtfSearchSuggestions &&
    etfSearchInput.trim().length >= 2 &&
    (etfSearchSuggestions.length || isEtfSearchSuggesting);

  if (!shouldShow) return null;

  return (
    <div className="stock-search-suggestions" role="listbox">
      {isEtfSearchSuggesting && !etfSearchSuggestions.length ? (
        <div className="stock-search-suggestion muted">Searching...</div>
      ) : (
        etfSearchSuggestions.map((item) => {
          const logoUrl = getDisplayCompanyLogoUrl(item.symbol, item.logo);
          return (
            <button
              type="button"
              className="stock-search-suggestion"
              key={`etf-${item.symbol}-${item.exchange || ""}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectEtfSearchSuggestion(item)}
            >
              <span className={`stock-search-logo-shell${logoUrl ? " has-logo" : ""}`} aria-hidden="true">
                <span>{getLogoFallbackText(item.symbol)}</span>
                {logoUrl && (
                  <img
                    src={logoUrl}
                    data-provider-logo={item.logo || ""}
                    alt=""
                    crossOrigin="anonymous"
                    onLoad={(event) => handleCompanyLogoLoad(event)}
                    onError={(event) => handleCompanyLogoError(event, item.symbol)}
                  />
                )}
              </span>
              <span className="stock-search-suggestion-copy">
                <strong>{item.symbol}</strong>
                <em>{item.name}</em>
              </span>
              {item.exchange && <small>{item.exchange}</small>}
            </button>
          );
        })
      )}
    </div>
  );
};

const openStockOverviewSymbol = (symbol) => {
  const cleanSymbol = normalizeStockSearchSymbol(symbol);
  if (!cleanSymbol) return;
  if (warnStockOnlySymbol(cleanSymbol)) return;

  setSearchInput(cleanSymbol);
  setStockSearchSuggestions([]);
  setShowStockSearchSuggestions(false);
  setActivePage("overview");

  if (cleanSymbol !== ticker) {
    setTicker(cleanSymbol);
    return;
  }

  if (stockRetryTimerRef.current) {
    window.clearTimeout(stockRetryTimerRef.current);
    stockRetryTimerRef.current = null;
  }
  const requestId = ++latestStockRequest.current;
  const cachedStock = stockMemoryCacheRef.current.get(cleanSymbol) || null;
  setStockData(cachedStock);
  setIsStockLoading(!cachedStock);
  loadStock(cleanSymbol, 0, requestId);
};

const openGuestMarketTapeItem = (item) => {
  const symbol = String(item?.symbol || "").trim().toUpperCase();
  if (!symbol) return;
  if (item.type === "crypto") {
    activateCryptoSymbol(symbol);
    setActivePage("crypto");
    return;
  }
  if (item.type === "forex") {
    activateForexSymbol(symbol);
    setActivePage("forex");
    return;
  }
  openStockOverviewSymbol(symbol);
};

const getMarketSymbolType = (symbol) => {
  const cleanSymbol = String(symbol || "").trim().toUpperCase();
  if (isCryptoPairSymbol(cleanSymbol)) return "crypto";
  if (isForexPairSymbol(cleanSymbol)) return "forex";
  return "stock";
};

const openWatchlistSymbol = (symbol) => {
  const cleanSymbol = String(symbol || "").trim().toUpperCase();
  if (!cleanSymbol) return;
  const marketType = getMarketSymbolType(cleanSymbol);
  if (marketType === "crypto") {
    activateCryptoSymbol(cleanSymbol);
    setActivePage("crypto");
    return;
  }
  if (marketType === "forex") {
    activateForexSymbol(cleanSymbol);
    setActivePage("forex");
    return;
  }
  openStockOverviewSymbol(cleanSymbol);
};

const getAlternativeMarketIcon = (symbol, marketType) => {
  const cleanSymbol = String(symbol || "").trim().toUpperCase();
  if (marketType === "crypto") {
    return CRYPTO_TAPE_ICONS[cleanSymbol] || cleanSymbol.replace(/(USDT|USDC|USD|EUR|BTC|ETH)$/, "").slice(0, 3);
  }
  if (marketType === "forex") {
    return FOREX_TAPE_ICONS[cleanSymbol] || `${cleanSymbol.slice(0, 3)}/${cleanSymbol.slice(3, 6)}`;
  }
  return getLogoFallbackText(cleanSymbol);
};

const getForexCurrencyFlag = (currencyCode) => {
  const flags = {
    USD: "🇺🇸",
    EUR: "🇪🇺",
    GBP: "🇬🇧",
    JPY: "🇯🇵",
    CHF: "🇨🇭",
    AUD: "🇦🇺",
    CAD: "🇨🇦",
    NZD: "🇳🇿"
  };
  return flags[String(currencyCode || "").toUpperCase()] || "";
};

const renderMarketLogoMark = (symbol, marketType) => {
  const cleanSymbol = String(symbol || "").trim().toUpperCase();
  return (
  <span className={`market-logo-mark market-logo-mark-${marketType} market-logo-mark-${cleanSymbol.toLowerCase()}`}>
    {marketType === "forex" ? (
      <span className="market-logo-forex-flags" aria-hidden="true">
        <span>{getForexCurrencyFlag(cleanSymbol.slice(0, 3)) || cleanSymbol.slice(0, 1)}</span>
        <span>{getForexCurrencyFlag(cleanSymbol.slice(3, 6)) || cleanSymbol.slice(3, 4)}</span>
      </span>
    ) : (
      getAlternativeMarketIcon(cleanSymbol, marketType)
    )}
  </span>
  );
};

const getMarketLogoUrl = (symbol, marketType) => {
  const cleanSymbol = String(symbol || "").trim().toUpperCase();
  if (marketType === "stock") {
    return getDisplayCompanyLogoUrl(cleanSymbol, savedSymbolDetails[cleanSymbol]?.logo);
  }
  if (marketType === "crypto") {
    return getCryptoLogoCandidates(cleanSymbol, savedSymbolDetails[cleanSymbol]?.logo)[0] || "";
  }
  return "";
};

const formatWatchlistMarketPrice = (symbol, marketType) => {
  const value = portfolioPrices[String(symbol || "").trim().toUpperCase()];
  if (!isNumber(value)) return "--";
  if (marketType === "forex") return formatPlain(value);
  return formatPrice(value);
};

const resolveSearchInputToSymbol = async (rawInput) => {
  const value = String(rawInput || "").trim();
  if (!value) return "";
  const normalizedValue = normalizeStockSearchSymbol(value);
  const exactSuggestion = stockSearchSuggestions.find(
    (item) => normalizeStockSearchSymbol(item.symbol) === normalizedValue
  );
  if (exactSuggestion?.symbol) return normalizeStockSearchSymbol(exactSuggestion.symbol);
  if (stockSearchSuggestions[0]?.symbol) return normalizeStockSearchSymbol(stockSearchSuggestions[0].symbol);
  if (/^[A-Z0-9.-]{1,12}$/.test(normalizedValue) && !/\s/.test(value)) return normalizedValue;

  try {
    const { data } = await axios.get(`${API_URL}/api/search-stocks`, {
      params: { q: value },
      timeout: 4500
    });
    const firstMatch = Array.isArray(data?.results) ? data.results[0] : null;
    if (firstMatch?.symbol) return String(firstMatch.symbol).toUpperCase();
  } catch (error) {
    console.error("Stock search lookup failed", error);
  }

  return normalizedValue;
};

const renderStockSearchSuggestions = (destinationPage = "overview") => {
  const shouldShow =
    showStockSearchSuggestions &&
    searchInput.trim().length >= 2 &&
    (stockSearchSuggestions.length || isStockSearchSuggesting);

  if (!shouldShow) return null;

  return (
    <div className="stock-search-suggestions" role="listbox">
      {isStockSearchSuggesting && !stockSearchSuggestions.length ? (
        <div className="stock-search-suggestion muted">Searching...</div>
      ) : (
        stockSearchSuggestions.map((item) => {
          const logoUrl = getDisplayCompanyLogoUrl(item.symbol, item.logo);
          return (
            <button
              type="button"
              className="stock-search-suggestion"
              key={`${item.symbol}-${item.exchange || ""}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectStockSearchSuggestion(item, destinationPage)}
            >
              <span className={`stock-search-logo-shell${logoUrl ? " has-logo" : ""}`} aria-hidden="true">
                <span>{getLogoFallbackText(item.symbol)}</span>
                {logoUrl && (
                  <img
                    src={logoUrl}
                    data-provider-logo={item.logo || ""}
                    alt=""
                    crossOrigin="anonymous"
                    onLoad={(event) => handleCompanyLogoLoad(event)}
                    onError={(event) => handleCompanyLogoError(event, item.symbol)}
                  />
                )}
              </span>
              <span className="stock-search-suggestion-copy">
                <strong>{item.symbol}</strong>
                <em>{item.name}</em>
              </span>
              {item.exchange && <small>{item.exchange}</small>}
            </button>
          );
        })
      )}
    </div>
  );
};

const openCalendarSearchResult = async (item) => {
  const symbol = normalizeStockSearchSymbol(item?.symbol);
  if (!symbol || warnStockOnlySymbol(symbol)) return;
  const event = {
    symbol,
    company: item.name || symbol,
    logo: getDisplayCompanyLogoUrl(symbol, item.logo)
  };
  setCalendarSearchInput(symbol);
  setCalendarSearchSuggestions([]);
  setShowCalendarSearchSuggestions(false);
  setCalendarMode("earnings");
  await openCalendarEarningsReport(event);
};

const handleCalendarSearchSubmit = async (event) => {
  event.preventDefault();
  const value = calendarSearchInput.trim();
  if (!value) return;
  const normalizedValue = normalizeStockSearchSymbol(value);
  const exactSuggestion = calendarSearchSuggestions.find(
    (item) => normalizeStockSearchSymbol(item.symbol) === normalizedValue
  );
  const selectedSuggestion = exactSuggestion || calendarSearchSuggestions[0];
  if (selectedSuggestion?.symbol) {
    await openCalendarSearchResult(selectedSuggestion);
    return;
  }
  try {
    const { data } = await axios.get(`${API_URL}/api/search-stocks`, {
      params: { q: value },
      timeout: 4500
    });
    const firstMatch = Array.isArray(data?.results) ? data.results[0] : null;
    if (firstMatch?.symbol) await openCalendarSearchResult(firstMatch);
  } catch (error) {
    console.error("Calendar earnings search failed", error);
  }
};

const renderCalendarSearchSuggestions = () => {
  const shouldShow =
    showCalendarSearchSuggestions &&
    calendarSearchInput.trim().length >= 2 &&
    (calendarSearchSuggestions.length || isCalendarSearchSuggesting);

  if (!shouldShow) return null;

  return (
    <div className="stock-search-suggestions calendar-search-suggestions" role="listbox">
      {isCalendarSearchSuggesting && !calendarSearchSuggestions.length ? (
        <div className="stock-search-suggestion muted">Searching stocks...</div>
      ) : (
        calendarSearchSuggestions.map((item) => {
          const logoUrl = getDisplayCompanyLogoUrl(item.symbol, item.logo);
          return (
            <button
              type="button"
              className="stock-search-suggestion"
              key={`calendar-${item.symbol}-${item.exchange || ""}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => openCalendarSearchResult(item)}
            >
              <span className={`stock-search-logo-shell${logoUrl ? " has-logo" : ""}`} aria-hidden="true">
                <span>{getLogoFallbackText(item.symbol)}</span>
                {logoUrl && (
                  <img
                    src={logoUrl}
                    data-provider-logo={item.logo || ""}
                    alt=""
                    crossOrigin="anonymous"
                    onLoad={(event) => handleCompanyLogoLoad(event)}
                    onError={(event) => handleCompanyLogoError(event, item.symbol)}
                  />
                )}
              </span>
              <span className="stock-search-suggestion-copy">
                <strong>{item.symbol}</strong>
                <em>{item.name}</em>
              </span>
              {item.exchange && <small>{item.exchange}</small>}
            </button>
          );
        })
      )}
    </div>
  );
};

const activateCryptoSymbol = (symbol) => {
  const cleanSymbol = String(symbol || "").trim().toUpperCase();
  if (!cleanSymbol) return;
  setCryptoSearchInput(cleanSymbol);
  setCryptoSearchSuggestions([]);
  setShowCryptoSearchSuggestions(false);
  setCryptoData(null);
  setCryptoError("");
  setCryptoChartData({ points: [], latest: null });
  setCryptoChartError("");
  setIsCryptoLoading(true);
  setCryptoSymbol(cleanSymbol);
};

const activateForexSymbol = (symbol) => {
  const cleanSymbol = String(symbol || "").trim().toUpperCase();
  if (!cleanSymbol) return;
  setForexSearchInput(cleanSymbol);
  setForexSearchSuggestions([]);
  setShowForexSearchSuggestions(false);
  setForexData(null);
  setForexError("");
  setForexChartData({ points: [], latest: null });
  setForexChartError("");
  setIsForexLoading(true);
  setForexSymbol(cleanSymbol);
};

const renderAlternativeMarketSuggestions = (items, isLoading, show, inputValue, onSelect, loadingLabel, marketType = "") => {
  const shouldShow = show && inputValue.trim().length >= 1 && (items.length || isLoading);
  if (!shouldShow) return null;
  return (
    <div className="stock-search-suggestions alternative-search-suggestions" role="listbox">
      {isLoading && !items.length ? (
        <div className="stock-search-suggestion muted">{loadingLabel}</div>
      ) : (
        items.map((item) => {
          const resolvedMarketType = item.type || marketType;
          const isForexSuggestion = resolvedMarketType === "forex";
          return (
            <button
              type="button"
              className="stock-search-suggestion"
              key={`${resolvedMarketType || "market"}-${item.symbol}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onSelect(item.symbol)}
            >
              <span className={`stock-search-logo-shell${isForexSuggestion ? " forex-search-logo-shell" : ""}${item.logo && !isForexSuggestion ? " has-logo" : ""}`} aria-hidden="true">
                {isForexSuggestion ? (
                  renderMarketLogoMark(item.symbol, "forex")
                ) : (
                  <>
                    <span>{getLogoFallbackText(item.symbol)}</span>
                    {item.logo && (
                      <img
                        src={resolvedMarketType === "crypto" ? getCryptoLogoCandidates(item.symbol, item.logo)[0] : item.logo}
                        data-provider-logo={item.logo || ""}
                        alt=""
                        onError={(event) => {
                          if (resolvedMarketType === "crypto") {
                            handleCryptoLogoError(event, item.symbol);
                            return;
                          }
                          event.currentTarget.style.display = "none";
                        }}
                      />
                    )}
                  </>
                )}
              </span>
              <span className="stock-search-suggestion-copy">
                <strong>{item.symbol}</strong>
                <em>{item.name}</em>
              </span>
              {item.fromCurrency && item.toCurrency ? (
                <small>{item.fromCurrency}/{item.toCurrency}</small>
              ) : item.exchange ? (
                <small>{item.exchange}</small>
              ) : null}
            </button>
          );
        })
      )}
    </div>
  );
};

const updateScreenerFilter = (key, value) => {
  setScreenerFilters((previous) => ({
    ...previous,
    [key]: value
  }));
};

const screenerNumberInput = (key, label, placeholder = "Any") => (
  <label className="screener-filter" key={key}>
    <span>{label}</span>
    <input
      type="number"
      inputMode="decimal"
      value={screenerFilters[key]}
      onChange={(event) => updateScreenerFilter(key, event.target.value)}
      placeholder={placeholder}
    />
  </label>
);

const screenerSelectInput = (key, label, options) => (
  <label className="screener-filter" key={key}>
    <span>{label}</span>
    <select
      value={screenerFilters[key]}
      onChange={(event) => updateScreenerFilter(key, event.target.value)}
    >
      <option value="">Any</option>
      {[...new Set([screenerFilters[key], ...options].filter(Boolean))].map((option) => (
        <option key={`${key}-${option}`} value={option}>
          {option}
        </option>
      ))}
    </select>
  </label>
);

const submitStockScreener = (event) => {
  event.preventDefault();
  setAppliedScreenerFilters({ ...screenerFilters });
};

const resetStockScreener = () => {
  setScreenerFilters(DEFAULT_SCREENER_FILTERS);
  setAppliedScreenerFilters(DEFAULT_SCREENER_FILTERS);
};

const handleFinancialStatementSearch = async (event) => {
  event.preventDefault();
  const value = financialStatementInput.trim();
  if (!value) return;
  let symbol = value.toUpperCase();
  if (warnStockOnlySymbol(symbol)) return;
  if (!/^[A-Z0-9.-]{1,12}$/.test(symbol) || /\s/.test(value)) {
    try {
      const { data } = await axios.get(`${API_URL}/api/search-stocks`, {
        params: { q: value },
        timeout: 4500
      });
      const firstMatch = Array.isArray(data?.results) ? data.results[0] : null;
      if (firstMatch?.symbol) symbol = String(firstMatch.symbol).toUpperCase();
    } catch (error) {
      console.error("Financial statement search lookup failed", error);
    }
  }
  if (!symbol) return;
  if (warnStockOnlySymbol(symbol)) return;
  setFinancialStatementInput(symbol);
  setFinancialStatementTicker(symbol);
};

const handleFundamentalChartTickerAdd = async (event) => {
  event.preventDefault();
  const rawValues = fundamentalChartInput
    .split(/[,;\n]/)
    .map((value) => value.trim())
    .filter(Boolean);
  if (!rawValues.length) return;

  const resolvedSymbols = await Promise.all(rawValues.map(async (value) => {
    const directSymbol = value.toUpperCase();
    if (/^[A-Z0-9.-]{1,12}$/.test(directSymbol) && !/\s/.test(value)) {
      return directSymbol;
    }
    return resolveSearchInputToSymbol(value);
  }));

  const nextSymbols = [
    ...fundamentalChartTickers,
    ...resolvedSymbols
      .map((symbol) => String(symbol || "").toUpperCase())
      .filter((symbol) => /^[A-Z0-9.-]{1,12}$/.test(symbol) && !isBlockedStockOnlySymbol(symbol))
  ];
  const blockedSymbol = resolvedSymbols
    .map((symbol) => String(symbol || "").toUpperCase())
    .find((symbol) => isBlockedStockOnlySymbol(symbol));
  if (blockedSymbol) warnStockOnlySymbol(blockedSymbol);

  setFundamentalChartTickers([...new Set(nextSymbols)].slice(0, 20));
  setFundamentalChartInput("");
};

const removeFundamentalChartTicker = (symbol) => {
  setFundamentalChartTickers((current) =>
    current.filter((item) => item !== symbol)
  );
};

const openFundamentalChartsForTicker = (symbol) => {
  const cleanSymbol = String(symbol || "").trim().toUpperCase();
  if (warnStockOnlySymbol(cleanSymbol)) return;
  if (/^[A-Z0-9.-]{1,12}$/.test(cleanSymbol)) {
    setFundamentalChartTickers((current) =>
      [...new Set([cleanSymbol, ...current])].slice(0, 20)
    );
    setFundamentalChartInput("");
  }
  setActivePage("fundamental-charts");
};

const toggleFundamentalIndicator = (indicatorKey) => {
  setSelectedFundamentalIndicators((current) =>
    current.includes(indicatorKey)
      ? current.filter((key) => key !== indicatorKey)
      : [...current, indicatorKey]
  );
};

const addFundamentalIndicator = (indicatorKey) => {
  if (!indicatorKey) return;
  setSelectedFundamentalIndicators((current) =>
    current.includes(indicatorKey) ? current : [...current, indicatorKey]
  );
};

const selectFundamentalIndicatorGroup = (groupId) => {
  const group = availableFundamentalIndicatorGroups.find((item) => item.id === groupId);
  if (!group) return;
  setSelectedFundamentalIndicators((current) => [
    ...new Set([
      ...current,
      ...group.indicators.map((indicator) => indicator.key)
    ])
  ]);
};

const renderHistoryRangeToggle = (value, onChange, ariaLabel = "History range") => (
  <div className="history-range-toggle" role="tablist" aria-label={ariaLabel}>
    {FUNDAMENTAL_HISTORY_RANGES.map((range) => (
      <button
        key={range.id}
        type="button"
        className={value === range.id ? "active" : ""}
        onClick={() => onChange(range.id)}
      >
        {range.label}
      </button>
    ))}
  </div>
);

const visibleFinancialStatementData = filterFinancialStatementByHistoryRange(
  financialStatementData,
  financialStatementRange,
  financialStatementPeriod
);

const handleStockSearchSubmit = async (event, destinationPage = "overview") => {
  event.preventDefault();
  const symbol = await resolveSearchInputToSymbol(searchInput);
  if (!symbol) return;
  if (warnStockOnlySymbol(symbol)) return;

  setActivePage(destinationPage);
  setSearchInput(symbol);
  setShowStockSearchSuggestions(false);
  setStockSearchSuggestions([]);

  if (symbol !== ticker) {
    setTicker(symbol);
    return;
  }

  if (stockRetryTimerRef.current) {
    window.clearTimeout(stockRetryTimerRef.current);
    stockRetryTimerRef.current = null;
  }
  const requestId = ++latestStockRequest.current;
  const cachedStock = stockMemoryCacheRef.current.get(symbol) || null;
  setStockData(cachedStock);
  setIsStockLoading(!cachedStock);
  loadStock(symbol, 0, requestId);
};

const openPage = (page) => {
  if (page === "watchlists") return;
  if (typeof page === "string" && page.startsWith("policy:")) {
    setActivePolicyKey(page.replace("policy:", ""));
    return;
  }
  setActivePage(page);
  window.scrollTo({ top: 0, behavior: "smooth" });
};


const isWatchlistTapeMoving = user && watchlistTapeMoves && watchlist.length > 1;
const topWatchlistItems = isWatchlistTapeMoving
  ? [...watchlist, ...watchlist]
  : watchlist;
 

return (

  <div className="app">

    {marketEventToast && (
      <div className={`market-event-toast ${marketEventToast.tone}`} role="status" aria-live="polite">
        <div className="market-event-burst" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="market-event-content">
          <span className="market-event-kicker">MrktRally alert</span>
          <strong>{marketEventToast.title}</strong>
          <p>{marketEventToast.message}</p>
        </div>
        <button
          type="button"
          className="market-event-close"
          aria-label="Dismiss market alert"
          onClick={() => setMarketEventToast(null)}
        >
          ×
        </button>
      </div>
    )}

    {/* TOP WATCHLIST BAR */}

    <div className={`top-watchlist ${user ? "" : "top-watchlist-guest"}`}>

      {!user && (
        <button
          type="button"
          className="top-watchlist-brand"
          onClick={() => setActivePage("home")}
          aria-label="Go to MrktRally home"
        >
          <img src="/mrktrally-icon.png" alt="" />
          <span>MrktRally</span>
        </button>
      )}

      {!user && (
        <div className="guest-market-tape" aria-label="Explore popular markets">
          <div className="guest-market-tape-track">
            {[...GUEST_MARKET_TAPE_ITEMS, ...GUEST_MARKET_TAPE_ITEMS].map((item, index) => (
              <button
                type="button"
                key={`${item.type}-${item.symbol}-${index}`}
                onClick={() => openGuestMarketTapeItem(item)}
              >
                <span className={`guest-market-tape-logo ${item.type}${getMarketLogoUrl(item.symbol, item.type) ? " has-logo" : ""}`} aria-hidden="true">
                  {getMarketLogoUrl(item.symbol, item.type) ? (
                    <>
                    <img
                      src={getMarketLogoUrl(item.symbol, item.type)}
                      alt=""
                      loading="eager"
                      decoding="async"
                      crossOrigin="anonymous"
                      onLoad={(event) => {
                        if (item.type === "stock") handleCompanyLogoLoad(event);
                      }}
                      onError={(event) => {
                        if (item.type === "stock") {
                          handleCompanyLogoError(event, item.symbol);
                          return;
                        }
                        if (item.type === "crypto") {
                          handleCryptoLogoError(event, item.symbol);
                          return;
                        }
                        event.currentTarget.style.display = "none";
                      }}
                    />
                    {item.type === "crypto" || item.type === "forex" ? renderMarketLogoMark(item.symbol, item.type) : null}
                    </>
                  ) : renderMarketLogoMark(item.symbol, item.type)}
                </span>
                <span className="guest-market-tape-symbol">{item.symbol}</span>
                <em>{item.label}</em>
                <strong>{item.type}</strong>
              </button>
            ))}
          </div>
        </div>
      )}

      {user && (
        <>
          <div className="watchlist-label">Watchlist</div>

          <div className={`watchlist-scroll ${isWatchlistTapeMoving ? "watchlist-scroll-moving" : ""}`}>

            <div className={isWatchlistTapeMoving ? "watchlist-scroll-motion-window" : "watchlist-scroll-static-window"}>
              <div className="watchlist-scroll-track">
            {topWatchlistItems.map((item, index) => {
              const marketType = getMarketSymbolType(item);
              const logoUrl = getMarketLogoUrl(item, marketType);
              return (

              <div
                key={`${item}-${index}`}
                className={`watchlist-stock watchlist-stock-${marketType}`}
                onClick={() => openWatchlistSymbol(item)}
              >

                <span className={`watch-logo-shell${logoUrl ? " has-logo" : ""}`} aria-hidden="true">
                  <span className={`watch-logo-fallback watch-logo-fallback-${marketType}`}>
                    {renderMarketLogoMark(item, marketType)}
                  </span>
                  {logoUrl && (
                    <img
                      className="watch-logo"
                      src={logoUrl}
                      alt=""
                      loading="eager"
                      decoding="async"
                      crossOrigin="anonymous"
                      onLoad={(event) => {
                        if (marketType === "stock") handleCompanyLogoLoad(event);
                      }}
                      onError={(event) => {
                        if (marketType === "stock") {
                          handleCompanyLogoError(event, item);
                          return;
                        }
                        if (marketType === "crypto") {
                          handleCryptoLogoError(event, item);
                          return;
                        }
                        event.currentTarget.style.display = "none";
                      }}
                    />
                  )}
                </span>

                <span className="watch-symbol">
                  {item}
                </span>

                <span className="watch-price">
                  {formatWatchlistMarketPrice(item, marketType)}
                </span>

                <span className={`watch-session-change ${
                  savedSymbolDetails[item]?.percentChange > 0
                    ? "watch-positive"
                    : savedSymbolDetails[item]?.percentChange < 0
                      ? "watch-negative"
                      : "watch-neutral"
                }`}>
                  {isNumber(savedSymbolDetails[item]?.percentChange)
                    ? `${savedSymbolDetails[item].percentChange > 0 ? "+" : ""}${savedSymbolDetails[item].percentChange.toFixed(2)}%`
                    : "--"}
                </span>

                <button
                  className="watch-remove"
                  onClick={(e) => {

                    e.stopPropagation();

                    setWatchlist((items) =>
                      items.filter(
                        (t) => t !== item
                      )
                    );
                  }}
                >
                  ×
                </button>

              </div>

            );
            })}
              </div>
            </div>

            <input
              className="watchlist-add-input"
              placeholder="+ Add"
              value={newTicker}
              onChange={(e) =>
                setNewTicker(
                  e.target.value.toUpperCase()
                )
              }
              onKeyDown={(e) => {

                if (
                  e.key === "Enter" &&
                  newTicker
                ) {
                  const symbol = String(newTicker || "").trim().toUpperCase();

                  if (
                    /^[A-Z0-9.-]{1,12}$/.test(symbol) &&
                    !watchlist.includes(
                      symbol
                    )
                  ) {

                    setWatchlist([
                      ...watchlist,
                      symbol,
                    ]);
                  }

                  setNewTicker("");
                }
              }}
            />

          </div>
        </>
      )}

      <button
        className={`auth-top-button ${user ? "signout" : ""}`}
        onClick={() => {
          if (user) {
            handleSignOut();
            return;
          }
          setAuthPrompt("");
          setShowAuth(true);
        }}
        title={user ? `Sign out ${user.username}` : "Login or create an account"}
      >
        {user ? `Sign Out (${user.username})` : "Login / Signup"}
      </button>

    </div>

    <nav className="section-tabs" aria-label="MrktRally pages">
      {[
        ["home", "Home"],
        ["overview", "Stock Overview"],
        ["financial-statements", "Financial Statements"],
        ["fundamental-charts", "Fundamental Charts"],
        ["projections", "Projections"],
        ["comparison", "Compare"],
        ["stock-screener", "Stock Screener"],
        ["market-overview", "Market Overview"],
        ["etfs", "ETF Overview"],
        ["portfolio", "Portfolio"],
        ["earnings-calendar", "Calendar"],
        ["treasury-rates", "Treasury Rates"],
        ["crypto", "Crypto Center"],
        ["forex", "FOREX Overview"],
        ["news", "News"],
        ["profile", "Profile"]
      ].map(([page, label]) => (
        <button
          key={page}
          type="button"
          className={activePage === page ? "active" : ""}
          onClick={() => openPage(page)}
        >
          {label}
        </button>
      ))}
    </nav>

    {/* MAIN */}

    <div className="main">

    {activePage === "home" && (
    <>
      <section className="welcome-hero" id="home" aria-labelledby="welcome-title">
        <div className="welcome-hero-content">
          <div className="welcome-kicker">Market research, focused</div>
          <div className="welcome-title-row">
            <h1 id="welcome-title">Welcome to MrktRally</h1>
            <img
              className="welcome-logo"
              src="/mrktrally-icon.png"
              alt="MrktRally logo"
            />
          </div>
          <p>Track companies, study the numbers, and keep your market view in one place.</p>
          <div className="welcome-actions">
            <button className="welcome-action" type="button" onClick={() => openPage("overview")}>
              Explore the market
            </button>
            {!user && (
              <button
                className="welcome-action welcome-auth-action"
                type="button"
                onClick={() => {
                  setAuthPrompt("");
                  setAuthMessage("");
                  setIsLogin(true);
                  setIsRecoveringPassword(false);
                  setShowAuth(true);
                }}
              >
                Login / Sign Up
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="home-features" aria-labelledby="home-features-title">
        <div className="home-features-heading">
          <div className="welcome-kicker">Built for sharper research</div>
          <h2 id="home-features-title">Move from market idea to full company view.</h2>
          <p>
            MrktRally keeps the tools you use most close together, so you can move through a stock without losing the thread.
          </p>
        </div>

        <div className="home-feature-grid">
          {HOME_FEATURES.map((feature, index) => (
            <button
              className="home-feature-card"
              key={`${feature.label}-${index}`}
              type="button"
              onClick={() => openPage(feature.id)}
            >
              <span className={`home-feature-mark mark-${index % 8}`} aria-hidden="true">
                {renderHomeFeatureIcon(feature.icon)}
              </span>
              <span className="home-feature-copy">
                <span className="home-feature-label">{feature.label}</span>
                <strong>{feature.title}</strong>
                <span>{feature.text}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="home-product-tour" aria-labelledby="home-tour-title">
        <div className="home-tour-heading">
          <div className="welcome-kicker">See the whole terminal</div>
          <h2 id="home-tour-title">Every page has a job. Together, they make the research flow.</h2>
          <p>
            Scroll through the full MrktRally stack, from market overview to company research, statements, charts,
            portfolio tools, calendars, crypto, forex, and news.
          </p>
        </div>

        <div className="home-tour-stack">
          {HOME_TOUR_SECTIONS.map((section, index) => (
            <article className="home-tour-card" key={section.label}>
              <button
                className="home-tour-copy"
                type="button"
                onClick={() => openPage(section.id)}
              >
                <span className="home-tour-number">{String(index + 1).padStart(2, "0")}</span>
                <span className="home-tour-icon" aria-hidden="true">
                  {renderHomeFeatureIcon(section.icon)}
                </span>
                <span className="home-tour-text">
                  <span className="home-feature-label">{section.eyebrow}</span>
                  <strong>{section.title}</strong>
                  <span>{section.text}</span>
                </span>
                <span className="home-tour-bullets">
                  {section.bullets.map((bullet) => (
                    <span key={bullet}>{bullet}</span>
                  ))}
                </span>
              </button>
              {renderHomeTourSnapshot(section.snapshot)}
            </article>
          ))}
        </div>
      </section>

      <section className="home-rally-footer" aria-labelledby="home-rally-title">
        <div className="home-rally-signal" aria-hidden="true">
          {[18, 34, 28, 52, 44, 68, 58, 80, 72].map((height, index) => (
            <span key={`rally-footer-bar-${index}`} style={{ "--bar-height": `${height}%` }} />
          ))}
        </div>
        <div className="home-rally-content">
          <div className="home-rally-brand">
            <div className="home-rally-brand-row">
              <img src="/mrktrally-icon.png" alt="MrktRally logo" />
              <strong>MrktRally<span aria-label="trademark">™</span></strong>
            </div>
            <div className="home-rally-badge">Built for focused market research</div>
            <p>Market data by FMP</p>
            <p>Earnings calls and ETFs by Stock Analysis</p>
            <a
              className="home-rally-contact"
              href="mailto:mrktrally@gmail.com?subject=MrktRally%20Support"
            >
              Contact us
            </a>
            <p className="home-rally-copyright">© 2026 MrktRally. All rights reserved.</p>
          </div>

          <div className="home-rally-link-grid">
            {HOME_FOOTER_GROUPS.map((group) => (
              <div className="home-rally-link-group" key={group.title}>
                <h3>{group.title}</h3>
                {group.links.map(([page, label, mode]) => (
                  <button
                    key={`${group.title}-${label}`}
                    type="button"
                    onClick={() => {
                      if (mode) setCalendarMode(mode);
                      openPage(page);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
        <h2 id="home-rally-title" className="home-rally-word">TOGETHER WE RALLY</h2>
      </section>
    </>
    )}

    {activePage === "market-overview" && (
      <section className="market-overview-page" id="market-overview" aria-labelledby="market-overview-title">
        <div className="section-heading-row market-overview-heading">
          <div>
            <div className="welcome-kicker">Market dashboard</div>
            <h2 id="market-overview-title">Market Overview</h2>
            <p>Track the major indexes, the next market session, broad-market movers, and the most actively traded stocks.</p>
          </div>
          {broadMarketMovers.updatedAt && (
            <span className="market-overview-updated">
              Updated {new Date(broadMarketMovers.updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </span>
          )}
        </div>

        {marketOverviewStrip}

        <section className="market-movers-block" aria-labelledby="market-movers-overview-title">
          <div className="market-movers-block-heading">
            <span id="market-movers-overview-title">Entire Market Movers</span>
            {broadMarketMovers.updatedAt && (
              <strong>
                Updated {new Date(broadMarketMovers.updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
              </strong>
            )}
          </div>
          <div className="market-movers-grid">
            {renderMarketMoverPanel("Top Gainers", broadMarketMovers.gainers || [], "positive", "All Stocks", isBroadMarketMoversLoading)}
            {renderMarketMoverPanel("Top Losers", broadMarketMovers.losers || [], "negative", "All Stocks", isBroadMarketMoversLoading)}
          </div>
        </section>
        {renderTopTradedStocks()}
      </section>
    )}


    {activePage === "etfs" && (
      <section className="etf-page" id="etfs" aria-labelledby="etf-page-title">
        <div className="etf-heading-row">
          <div>
            <span className="home-feature-label">ETF & Fund Research</span>
            <h2 id="etf-page-title">ETF Overview</h2>
            <p>Search an ETF, mutual fund, or similar fund ticker to review price, profile, costs, yield, exposure, and holdings when available.</p>
          </div>
          <form
            className="etf-search"
            onSubmit={async (event) => {
              event.preventDefault();
              const symbol = await resolveEtfSearchInputToSymbol();
              if (!symbol) {
                setEtfError("Search an ETF or fund ticker.");
                return;
              }
              searchEtfSymbol(symbol);
            }}
          >
            <input
              value={etfSearchInput}
              onChange={(event) => {
                setEtfSearchInput(event.target.value.toUpperCase());
                setShowEtfSearchSuggestions(true);
              }}
              onFocus={() => setShowEtfSearchSuggestions(true)}
              onBlur={() => window.setTimeout(() => setShowEtfSearchSuggestions(false), 120)}
              placeholder="Search ETF or fund ticker"
              aria-label="Search ETF or fund ticker"
            />
            <button type="submit">{isEtfLoading ? "Loading..." : "Search Fund"}</button>
            {renderEtfSearchSuggestions()}
          </form>
        </div>

        {isEtfLoading && !etfData ? (
          <div className="heatmap-loading">Loading {etfTicker} fund data...</div>
        ) : etfError ? (
          <div className="heatmap-loading">{etfError}</div>
        ) : etfData ? (
          <>
            <div className="etf-hero-panel">
              <div className="etf-hero-main">
                <span className={`etf-hero-logo-shell${getDisplayCompanyLogoUrl(etfData.symbol, etfData.logo) ? " has-logo" : ""}`} aria-hidden="true">
                  <span className="etf-hero-logo-fallback">
                    {getLogoFallbackText(etfData.symbol)}
                  </span>
                  {getDisplayCompanyLogoUrl(etfData.symbol, etfData.logo) && (
                    <img
                      src={getDisplayCompanyLogoUrl(etfData.symbol, etfData.logo)}
                      data-provider-logo={etfData.logo || ""}
                      alt=""
                      loading="eager"
                      decoding="async"
                      crossOrigin="anonymous"
                      onLoad={(event) => handleCompanyLogoLoad(event)}
                      onError={(event) => handleCompanyLogoError(event, etfData.symbol)}
                    />
                  )}
                </span>
                <span className="etf-symbol">{etfData.symbol}</span>
                <h3>{etfData.name}</h3>
                {etfData.type && <strong className="etf-type-badge">{etfData.type}</strong>}
                <p>{etfData.description || "Fund profile and holdings data from the latest available source."}</p>
              </div>
              <div className="etf-price-card">
                <span>{isMutualFundView ? "NAV / Price" : "Price"}</span>
                <strong>{formatPrice(displayedEtfPrice)}</strong>
                <em className={isNumber(displayedEtfPercentChange) && displayedEtfPercentChange < 0 ? "red" : "green"}>
                  {formatSignedPercent(displayedEtfPercentChange)}
                </em>
              </div>
            </div>

            <div className="etf-panel etf-price-chart-panel">
              <div className="etf-panel-heading etf-chart-heading">
                <div>
                  <h3>{etfData.symbol} Price Chart</h3>
                  <span>
                    {isNumber(etfChartLatest?.price)
                      ? `${formatPrice(etfChartLatest.price)} ${formatSignedPercent(etfChartLatest.percentChange)}`
                      : "Latest price history"}
                  </span>
                </div>
                <div className="etf-chart-controls" role="group" aria-label="ETF chart range">
                  {ETF_CHART_RANGES.map((range) => (
                    <button
                      key={range}
                      type="button"
                      className={etfChartRange === range ? "active" : ""}
                      onClick={() => setEtfChartRange(range)}
                    >
                      {range}
                    </button>
                  ))}
                </div>
              </div>
              <div className="etf-chart-canvas">
                {isEtfChartLoading && !etfChartPoints.length ? (
                  <StockDataLoading label="Loading fund price chart..." />
                ) : etfChartPoints.length ? (
                  <ResponsiveContainer width="100%" height={330}>
                    <LineChart
                      data={etfChartPoints}
                      margin={{ top: 18, right: 22, left: 4, bottom: 8 }}
                    >
                      <defs>
                        <linearGradient id="etfPriceLineGradient" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#38bdf8" />
                          <stop offset="55%" stopColor="#60a5fa" />
                          <stop offset="100%" stopColor="#34d399" />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="#223049" strokeDasharray="3 3" />
                      <XAxis
                        dataKey="time"
                        tickFormatter={(value) => formatStockChartAxisLabel(value, etfChartRange)}
                        stroke="#8ea0bd"
                        tick={{ fill: "#9ca3af", fontSize: 12 }}
                        minTickGap={28}
                      />
                      <YAxis
                        domain={["auto", "auto"]}
                        tickFormatter={(value) => `$${Number(value).toFixed(value >= 100 ? 0 : 2)}`}
                        stroke="#8ea0bd"
                        tick={{ fill: "#9ca3af", fontSize: 12 }}
                        width={72}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "#0b1220",
                          border: "1px solid #2b3a55",
                          borderRadius: "12px",
                          color: "#f8fafc"
                        }}
                        labelFormatter={(value) => formatStockChartTooltipLabel(value, etfChartRange)}
                        formatter={(value) => [formatPrice(value), "Price"]}
                      />
                      <Line
                        key={`${etfData.symbol}-${etfChartRange}-${etfChartPoints.length}-${etfChartPoints[0]?.time || ""}`}
                        type="monotone"
                        dataKey="price"
                        stroke="url(#etfPriceLineGradient)"
                        strokeWidth={3}
                        dot={false}
                        isAnimationActive
                        animationDuration={700}
                        activeDot={{
                          r: 5,
                          stroke: "#f8fafc",
                          strokeWidth: 2,
                          fill: "#38bdf8"
                        }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="historical-chart-empty">
                    {etfChartError || "No price history available yet."}
                  </div>
                )}
              </div>
            </div>

            <div className="etf-stat-grid">
              {(isMutualFundView ? fundOverviewCards : etfOverviewCards).map((card) => (
                <div key={card.label}>
                  <span>{card.label}</span>
                  <strong>{card.value}</strong>
                </div>
              ))}
            </div>

            <div className="etf-profile-strip">
              {etfProfileItems.map((item) => (
                <span key={item.label}>
                  <strong>{item.label}</strong>
                  {item.value || "N/A"}
                </span>
              ))}
            </div>

            {(!isMutualFundView || hasEtfBreakdownData) && (
              <div className="etf-breakdown-grid">
                {(!isMutualFundView || etfData.sectors?.length) && renderEtfExposureBars("Sector Exposure", etfData.sectors)}
                {(!isMutualFundView || etfData.countries?.length) && renderEtfExposureBars("Country Exposure", etfData.countries)}
                {(!isMutualFundView || etfData.assetAllocation?.length) && renderEtfExposureBars("Asset Mix", etfData.assetAllocation)}
              </div>
            )}

            {(!isMutualFundView || topEtfHoldings.length > 0) && (
            <div className="etf-panel etf-holdings-panel">
              <div className="etf-panel-heading">
                <h3>Top Holdings</h3>
                <span>{etfData.holdingsAsOf ? `As of ${etfData.holdingsAsOf}` : "Latest available"}</span>
              </div>
              {topEtfHoldings.length ? (
                <div className="etf-holdings-table">
                  <div className="etf-holdings-header">
                    <span>#</span>
                    <span>Ticker</span>
                    <span>Name</span>
                    <span>Weight</span>
                    <span>Shares</span>
                  </div>
                  {topEtfHoldings.map((holding, index) => (
                    <button
                      className="etf-holding-row"
                      type="button"
                      key={`${holding.symbol}-${index}`}
                      onClick={() => {
                        if (!holding.symbol) return;
                        setSearchInput(holding.symbol);
                        setTicker(holding.symbol);
                        setActivePage("overview");
                      }}
                    >
                      <span>{holding.rank || index + 1}</span>
                      <strong>{holding.symbol || "N/A"}</strong>
                      <span>{holding.name}</span>
                      <span>{formatPercent(holding.weight)}</span>
                      <span>{isNumber(holding.shares) ? holding.shares.toLocaleString() : "N/A"}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="etf-empty">No holdings available yet.</div>
              )}
            </div>
            )}
          </>
        ) : (
          <div className="heatmap-loading">Search an ETF to get started.</div>
        )}
      </section>
    )}

    {activePage === "crypto" && (
      <section className="etf-page alternative-market-page" id="crypto" aria-labelledby="crypto-page-title">
        <div className="etf-heading-row">
          <div>
            <span className="home-feature-label">Digital Asset Research</span>
            <h2 id="crypto-page-title">Crypto Center</h2>
            <p>Search a cryptocurrency pair to review price, market cap, supply, volume, ranges, averages, and chart history.</p>
          </div>
          <form
            className="etf-search"
            onSubmit={(event) => {
              event.preventDefault();
              const exactSuggestion = cryptoSearchSuggestions.find(
                (item) => String(item.symbol || "").toUpperCase() === cryptoSearchInput.trim().toUpperCase()
              );
              const selectedSuggestion = exactSuggestion || cryptoSearchSuggestions[0];
              activateCryptoSymbol(selectedSuggestion?.symbol || cryptoSearchInput);
            }}
          >
            <div className="stock-search-field alternative-search-field">
              <input
                value={cryptoSearchInput}
                onChange={(event) => {
                  setCryptoSearchInput(event.target.value.toUpperCase());
                  setShowCryptoSearchSuggestions(true);
                }}
                onFocus={() => setShowCryptoSearchSuggestions(true)}
                onBlur={() => window.setTimeout(() => setShowCryptoSearchSuggestions(false), 160)}
                placeholder="Search crypto pair, ex. BTCUSD"
                aria-label="Search crypto pair"
              />
              {renderAlternativeMarketSuggestions(
                cryptoSearchSuggestions,
                isCryptoSearchSuggesting,
                showCryptoSearchSuggestions,
                cryptoSearchInput,
                activateCryptoSymbol,
                "Searching crypto...",
                "crypto"
              )}
            </div>
            <button type="submit">{isCryptoLoading ? "Loading..." : "Search Crypto"}</button>
          </form>
        </div>

        <div className="market-quick-picks" aria-label="Popular cryptocurrencies">
          {CRYPTO_QUICK_PICKS.map((item) => (
            <button
              key={item.symbol}
              type="button"
              className={cryptoSymbol === item.symbol ? "active" : ""}
              onClick={() => activateCryptoSymbol(item.symbol)}
            >
              <strong>{item.symbol}</strong>
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        {isCryptoLoading && !cryptoData ? (
          <div className="heatmap-loading">Loading {cryptoSymbol} crypto data...</div>
        ) : cryptoError ? (
          <div className="heatmap-loading">{cryptoError}</div>
        ) : cryptoData ? (
          <>
            <div className="etf-hero-panel">
              <div className="etf-hero-main">
                {cryptoData.logo ? (
                  <span className="etf-hero-logo-shell crypto-logo-shell has-logo" aria-hidden="true">
                    <img
                      src={getCryptoLogoCandidates(cryptoData.symbol, cryptoData.logo)[0] || cryptoData.logo}
                      data-provider-logo={cryptoData.logo || ""}
                      alt=""
                      loading="eager"
                      decoding="async"
                      onError={(event) => {
                        handleCryptoLogoError(event, cryptoData.symbol);
                      }}
                    />
                    {renderMarketLogoMark(cryptoData.symbol, "crypto")}
                  </span>
                ) : (
                  <span className="asset-symbol-orb crypto-orb" aria-hidden="true">{cryptoData.symbol?.slice(0, 3)}</span>
                )}
                <span className="etf-symbol">{cryptoData.symbol}</span>
                <h3>{cryptoData.name}</h3>
                <strong className="etf-type-badge">Cryptocurrency</strong>
                <p>Track the latest quote, market cap, supply, trading range, averages, and chart history for this digital asset.</p>
              </div>
              <div className="etf-price-card">
                <span>Price</span>
                <strong>{formatPrice(displayedCryptoPrice)}</strong>
                <em className={isNumber(displayedCryptoPercentChange) && displayedCryptoPercentChange < 0 ? "red" : "green"}>
                  {formatSignedPercent(displayedCryptoPercentChange)}
                </em>
              </div>
            </div>

            <div className="etf-panel etf-price-chart-panel">
              <div className="etf-panel-heading etf-chart-heading">
                <div>
                  <h3>{cryptoData.symbol} Price Chart</h3>
                  <span>
                    {isNumber(cryptoChartLatest?.price)
                      ? `${formatPrice(cryptoChartLatest.price)} ${formatSignedPercent(cryptoChartLatest.percentChange)}`
                      : "Latest price history"}
                  </span>
                </div>
                <div className="etf-chart-controls" role="group" aria-label="Crypto chart range">
                  {ETF_CHART_RANGES.map((range) => (
                    <button
                      key={range}
                      type="button"
                      className={cryptoChartRange === range ? "active" : ""}
                      onClick={() => setCryptoChartRange(range)}
                    >
                      {range}
                    </button>
                  ))}
                </div>
              </div>
              <div className="etf-chart-canvas">
                {isCryptoChartLoading && !cryptoChartPoints.length ? (
                  <StockDataLoading label="Loading crypto price chart..." />
                ) : cryptoChartPoints.length ? (
                  <ResponsiveContainer width="100%" height={330}>
                    <LineChart data={cryptoChartPoints} margin={{ top: 18, right: 22, left: 4, bottom: 8 }}>
                      <defs>
                        <linearGradient id="cryptoPriceLineGradient" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#22d3ee" />
                          <stop offset="55%" stopColor="#3b82f6" />
                          <stop offset="100%" stopColor="#34d399" />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="#223049" strokeDasharray="3 3" />
                      <XAxis
                        dataKey="time"
                        tickFormatter={(value) => formatStockChartAxisLabel(value, cryptoChartRange)}
                        stroke="#8ea0bd"
                        tick={{ fill: "#9ca3af", fontSize: 12 }}
                        minTickGap={28}
                      />
                      <YAxis
                        domain={["auto", "auto"]}
                        tickFormatter={(value) => `$${Number(value).toFixed(value >= 100 ? 0 : 2)}`}
                        stroke="#8ea0bd"
                        tick={{ fill: "#9ca3af", fontSize: 12 }}
                        width={78}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "#0b1220",
                          border: "1px solid #2b3a55",
                          borderRadius: "12px",
                          color: "#f8fafc"
                        }}
                        labelFormatter={(value) => formatStockChartTooltipLabel(value, cryptoChartRange)}
                        formatter={(value) => [formatPrice(value), "Price"]}
                      />
                      <Line
                        key={`${cryptoData.symbol}-${cryptoChartRange}-${cryptoChartPoints.length}-${cryptoChartPoints[0]?.time || ""}`}
                        type="monotone"
                        dataKey="price"
                        stroke="url(#cryptoPriceLineGradient)"
                        strokeWidth={3}
                        dot={false}
                        isAnimationActive
                        animationDuration={700}
                        activeDot={{ r: 5, stroke: "#f8fafc", strokeWidth: 2, fill: "#22d3ee" }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="historical-chart-empty">
                    {cryptoChartError || "No price history available yet."}
                  </div>
                )}
              </div>
            </div>

            <div className="etf-stat-grid">
              {cryptoCards.map((card) => (
                <div key={card.label}>
                  <span>{card.label}</span>
                  <strong>{card.value}</strong>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="heatmap-loading">Search a crypto pair to get started.</div>
        )}
      </section>
    )}

    {activePage === "forex" && (
      <section className="etf-page alternative-market-page" id="forex" aria-labelledby="forex-page-title">
        <div className="etf-heading-row">
          <div>
            <span className="home-feature-label">Currency Market Research</span>
            <h2 id="forex-page-title">FOREX Overview</h2>
            <p>Search a currency pair to review price, change, volume, ranges, averages, exchange, open, previous close, and chart history.</p>
          </div>
          <form
            className="etf-search"
            onSubmit={(event) => {
              event.preventDefault();
              const exactSuggestion = forexSearchSuggestions.find(
                (item) => String(item.symbol || "").toUpperCase() === forexSearchInput.trim().toUpperCase()
              );
              const selectedSuggestion = exactSuggestion || forexSearchSuggestions[0];
              activateForexSymbol(selectedSuggestion?.symbol || forexSearchInput);
            }}
          >
            <div className="stock-search-field alternative-search-field">
              <input
                value={forexSearchInput}
                onChange={(event) => {
                  setForexSearchInput(event.target.value.toUpperCase());
                  setShowForexSearchSuggestions(true);
                }}
                onFocus={() => setShowForexSearchSuggestions(true)}
                onBlur={() => window.setTimeout(() => setShowForexSearchSuggestions(false), 160)}
                placeholder="Search forex pair, ex. EURUSD"
                aria-label="Search forex pair"
              />
              {renderAlternativeMarketSuggestions(
                forexSearchSuggestions,
                isForexSearchSuggesting,
                showForexSearchSuggestions,
                forexSearchInput,
                activateForexSymbol,
                "Searching FOREX...",
                "forex"
              )}
            </div>
            <button type="submit">{isForexLoading ? "Loading..." : "Search FOREX"}</button>
          </form>
        </div>

        <div className="market-quick-picks" aria-label="Popular forex pairs">
          {FOREX_QUICK_PICKS.map((item) => (
            <button
              key={item.symbol}
              type="button"
              className={forexSymbol === item.symbol ? "active" : ""}
              onClick={() => activateForexSymbol(item.symbol)}
            >
              <strong>{item.symbol}</strong>
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        {isForexLoading && !forexData ? (
          <div className="heatmap-loading">Loading {forexSymbol} FOREX data...</div>
        ) : forexError ? (
          <div className="heatmap-loading">{forexError}</div>
        ) : forexData ? (
          <>
            <div className="etf-hero-panel">
              <div className="etf-hero-main">
                <span className="etf-hero-logo-shell forex-logo-shell" aria-hidden="true">
                  {renderMarketLogoMark(forexData.symbol, "forex")}
                </span>
                <span className="etf-symbol">{forexData.symbol}</span>
                <h3>{forexData.name}</h3>
                <strong className="etf-type-badge">FOREX</strong>
                <p>Track the latest currency quote, trading range, moving averages, volume, open, previous close, and chart history.</p>
              </div>
              <div className="etf-price-card">
                <span>Price</span>
                <strong>{formatPlain(displayedForexPrice)}</strong>
                <em className={isNumber(displayedForexPercentChange) && displayedForexPercentChange < 0 ? "red" : "green"}>
                  {formatSignedPercent(displayedForexPercentChange)}
                </em>
              </div>
            </div>

            <div className="etf-panel etf-price-chart-panel">
              <div className="etf-panel-heading etf-chart-heading">
                <div>
                  <h3>{forexData.symbol} Price Chart</h3>
                  <span>
                    {isNumber(forexChartLatest?.price)
                      ? `${formatPlain(forexChartLatest.price)} ${formatSignedPercent(forexChartLatest.percentChange)}`
                      : "Latest price history"}
                  </span>
                </div>
                <div className="etf-chart-controls" role="group" aria-label="FOREX chart range">
                  {ETF_CHART_RANGES.map((range) => (
                    <button
                      key={range}
                      type="button"
                      className={forexChartRange === range ? "active" : ""}
                      onClick={() => setForexChartRange(range)}
                    >
                      {range}
                    </button>
                  ))}
                </div>
              </div>
              <div className="etf-chart-canvas">
                {isForexChartLoading && !forexChartPoints.length ? (
                  <StockDataLoading label="Loading FOREX price chart..." />
                ) : forexChartPoints.length ? (
                  <ResponsiveContainer width="100%" height={330}>
                    <LineChart data={forexChartPoints} margin={{ top: 18, right: 22, left: 4, bottom: 8 }}>
                      <defs>
                        <linearGradient id="forexPriceLineGradient" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#34d399" />
                          <stop offset="55%" stopColor="#22d3ee" />
                          <stop offset="100%" stopColor="#60a5fa" />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="#223049" strokeDasharray="3 3" />
                      <XAxis
                        dataKey="time"
                        tickFormatter={(value) => formatStockChartAxisLabel(value, forexChartRange)}
                        stroke="#8ea0bd"
                        tick={{ fill: "#9ca3af", fontSize: 12 }}
                        minTickGap={28}
                      />
                      <YAxis
                        domain={["auto", "auto"]}
                        tickFormatter={(value) => Number(value).toFixed(value >= 10 ? 2 : 5)}
                        stroke="#8ea0bd"
                        tick={{ fill: "#9ca3af", fontSize: 12 }}
                        width={82}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "#0b1220",
                          border: "1px solid #2b3a55",
                          borderRadius: "12px",
                          color: "#f8fafc"
                        }}
                        labelFormatter={(value) => formatStockChartTooltipLabel(value, forexChartRange)}
                        formatter={(value) => [formatPlain(value), "Price"]}
                      />
                      <Line
                        key={`${forexData.symbol}-${forexChartRange}-${forexChartPoints.length}-${forexChartPoints[0]?.time || ""}`}
                        type="monotone"
                        dataKey="price"
                        stroke="url(#forexPriceLineGradient)"
                        strokeWidth={3}
                        dot={false}
                        isAnimationActive
                        animationDuration={700}
                        activeDot={{ r: 5, stroke: "#f8fafc", strokeWidth: 2, fill: "#34d399" }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="historical-chart-empty">
                    {forexChartError || "No price history available yet."}
                  </div>
                )}
              </div>
            </div>

            <div className="etf-stat-grid">
              {forexCards.map((card) => (
                <div key={card.label}>
                  <span>{card.label}</span>
                  <strong>{card.value}</strong>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="heatmap-loading">Search a FOREX pair to get started.</div>
        )}
      </section>
    )}


    {activePage === "commodities" && (
      <section className="etf-page commodities-page" id="commodities" aria-labelledby="commodities-page-title">
        <div className="etf-heading-row">
          <div>
            <span className="home-feature-label">Commodity Research</span>
            <h2 id="commodities-page-title">Commodities Overview</h2>
            <p>Choose a commodity to review price, range, volume, averages, currency, trade month, and chart history.</p>
          </div>
        </div>
        <div className="commodity-picker" aria-label="Commodity symbols">
          {COMMODITY_GROUPS.map((group) => (
            <div className="commodity-picker-group" key={group.title}>
              <h3>{group.title}</h3>
              <div className="commodity-quick-picks">
                {group.items.map((item) => (
                  <button
                    type="button"
                    key={item.symbol}
                    className={commoditySymbol === item.symbol ? "active" : ""}
                    onClick={() => {
                      setCommoditySearchInput(item.symbol);
                      setCommodityData(null);
                      setCommodityError("");
                      setCommodityChartData({ points: [], latest: null });
                      setCommodityChartError("");
                      setIsCommodityLoading(true);
                      setCommoditySymbol(item.symbol);
                    }}
                  >
                    <span>{item.label}</span>
                    <strong>{item.symbol}</strong>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {isCommodityLoading && !commodityData ? (
          <div className="heatmap-loading">Loading {commoditySymbol} commodity data...</div>
        ) : commodityError ? (
          <div className="heatmap-loading">{commodityError}</div>
        ) : commodityData ? (
          <>
            <div className="etf-hero-panel commodities-hero-panel">
              <div>
                <span className="etf-symbol">{commodityData.symbol}</span>
                <h3>{commodityData.name}</h3>
                <strong className="etf-type-badge">Commodity</strong>
                <p>Review the latest quote, trading range, moving averages, volume, and chart history for this commodity.</p>
              </div>
              <div className="etf-price-card">
                <span>Price</span>
                <strong>{formatPrice(displayedCommodityPrice)}</strong>
                <em className={isNumber(displayedCommodityPercentChange) && displayedCommodityPercentChange < 0 ? "red" : "green"}>
                  {formatSignedPercent(displayedCommodityPercentChange)}
                </em>
              </div>
            </div>

            <div className="etf-panel etf-price-chart-panel">
              <div className="etf-panel-heading etf-chart-heading">
                <div>
                  <h3>{commodityData.symbol} Price Chart</h3>
                  <span>
                    {isNumber(commodityChartLatest?.price)
                      ? `${formatPrice(commodityChartLatest.price)} ${formatSignedPercent(commodityChartLatest.percentChange)}`
                      : "Latest price history"}
                  </span>
                </div>
                <div className="etf-chart-controls" role="group" aria-label="Commodity chart range">
                  {ETF_CHART_RANGES.map((range) => (
                    <button
                      key={range}
                      type="button"
                      className={commodityChartRange === range ? "active" : ""}
                      onClick={() => setCommodityChartRange(range)}
                    >
                      {range}
                    </button>
                  ))}
                </div>
              </div>
              <div className="etf-chart-canvas">
                {isCommodityChartLoading && !commodityChartPoints.length ? (
                  <StockDataLoading label="Loading commodity price chart..." />
                ) : commodityChartPoints.length ? (
                  <ResponsiveContainer width="100%" height={330}>
                    <LineChart
                      data={commodityChartPoints}
                      margin={{ top: 18, right: 22, left: 4, bottom: 8 }}
                    >
                      <defs>
                        <linearGradient id="commodityPriceLineGradient" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#38bdf8" />
                          <stop offset="55%" stopColor="#60a5fa" />
                          <stop offset="100%" stopColor="#34d399" />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="#223049" strokeDasharray="3 3" />
                      <XAxis
                        dataKey="time"
                        tickFormatter={(value) => formatStockChartAxisLabel(value, commodityChartRange)}
                        stroke="#8ea0bd"
                        tick={{ fill: "#9ca3af", fontSize: 12 }}
                        minTickGap={28}
                      />
                      <YAxis
                        domain={["auto", "auto"]}
                        tickFormatter={(value) => `$${Number(value).toFixed(value >= 100 ? 0 : 2)}`}
                        stroke="#8ea0bd"
                        tick={{ fill: "#9ca3af", fontSize: 12 }}
                        width={72}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "#0b1220",
                          border: "1px solid #2b3a55",
                          borderRadius: "12px",
                          color: "#f8fafc"
                        }}
                        labelFormatter={(value) => formatStockChartTooltipLabel(value, commodityChartRange)}
                        formatter={(value) => [formatPrice(value), "Price"]}
                      />
                      <Line
                        key={`${commodityData.symbol}-${commodityChartRange}-${commodityChartPoints.length}-${commodityChartPoints[0]?.time || ""}`}
                        type="monotone"
                        dataKey="price"
                        stroke="url(#commodityPriceLineGradient)"
                        strokeWidth={3}
                        dot={false}
                        isAnimationActive
                        animationDuration={700}
                        activeDot={{
                          r: 5,
                          stroke: "#f8fafc",
                          strokeWidth: 2,
                          fill: "#38bdf8"
                        }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="historical-chart-empty">
                    {commodityChartError || "No price history available yet."}
                  </div>
                )}
              </div>
            </div>

            <div className="etf-stat-grid commodity-stat-grid">
              {commodityCards.map((card) => (
                <div key={card.label}>
                  <span>{card.label}</span>
                  <strong>{card.value}</strong>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="heatmap-loading">Search a commodity symbol to get started.</div>
        )}
      </section>
    )}


    {activePage === "stock-screener" && (
      <section className="stock-screener-page" id="stock-screener" aria-labelledby="stock-screener-title">
        <div className="section-heading-row market-overview-heading screener-heading">
          <div>
            <div className="welcome-kicker">Find Market Ideas</div>
            <h2 id="stock-screener-title">Stock Screener</h2>
            <p>Filter active stocks, ETFs, and funds by size, price, sector, industry, dividend, volume, exchange, and country.</p>
          </div>
          {screenerUpdatedAt && (
            <span className="market-overview-updated">
              Updated {new Date(screenerUpdatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </span>
          )}
        </div>

        <form className="screener-panel" onSubmit={submitStockScreener}>
          <div className="screener-filter-grid">
            {screenerNumberInput("marketCapMoreThan", "Market Cap More Than", "1000000000")}
            {screenerNumberInput("marketCapLowerThan", "Market Cap Lower Than")}
            {screenerNumberInput("priceMoreThan", "Price More Than")}
            {screenerNumberInput("priceLowerThan", "Price Lower Than")}
            {screenerNumberInput("betaMoreThan", "Beta More Than")}
            {screenerNumberInput("betaLowerThan", "Beta Lower Than")}
            {screenerNumberInput("dividendMoreThan", "Current Dividend More Than")}
            {screenerNumberInput("dividendLowerThan", "Current Dividend Lower Than")}
            {screenerNumberInput("volumeMoreThan", "Volume More Than")}
            {screenerNumberInput("volumeLowerThan", "Volume Lower Than")}
            {screenerSelectInput("sector", "Sector", screenerOptions.sectors)}
            {screenerSelectInput("industry", "Industry", screenerOptions.industries)}
            {screenerSelectInput("exchange", "Exchange", screenerOptions.exchanges)}
            {screenerSelectInput("country", "Country", screenerOptions.countries)}
            <label className="screener-filter">
              <span>Asset Type</span>
              <select
                value={screenerFilters.assetType}
                onChange={(event) => updateScreenerFilter("assetType", event.target.value)}
              >
                <option value="all">All</option>
                <option value="stocks">Stocks Only</option>
                <option value="etfs">ETFs Only</option>
                <option value="funds">Funds Only</option>
              </select>
            </label>
            <label className="screener-filter">
              <span>Limit</span>
              <select
                value={screenerFilters.limit}
                onChange={(event) => updateScreenerFilter("limit", event.target.value)}
              >
                <option value="25">25</option>
                <option value="50">50</option>
                <option value="75">75</option>
                <option value="100">100</option>
              </select>
            </label>
          </div>

          <div className="screener-actions">
            <button type="submit" className="stock-search-button">
              {isScreenerLoading ? "Loading..." : "Run Screener"}
            </button>
            <button type="button" className="screener-reset-button" onClick={resetStockScreener}>
              Reset
            </button>
          </div>
        </form>

        <div className="screener-results-panel">
          <div className="screener-results-heading">
            <span>{isScreenerLoading ? "Loading screener..." : `${screenerResults.length} results found`}</span>
            <strong>{screenerFilters.assetType === "all" ? "Stocks, ETFs & Funds" : screenerFilters.assetType}</strong>
          </div>

          {screenerError ? (
            <div className="heatmap-loading">{screenerError}</div>
          ) : isScreenerLoading && !screenerResults.length ? (
            <div className="heatmap-loading">Loading stock screener...</div>
          ) : screenerResults.length ? (
            <div className="screener-table-wrap">
              <table className="screener-table">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Type</th>
                    <th>Company</th>
                    <th>Market Cap</th>
                    <th>Price</th>
                    <th>Sector</th>
                    <th>Industry</th>
                    <th>Beta</th>
                    <th>Current Dividend</th>
                    <th>Volume</th>
                    <th>Exchange</th>
                  </tr>
                </thead>
                <tbody>
                  {screenerResults.map((row) => {
                    const logoUrl = getDisplayCompanyLogoUrl(row.symbol, row.logo);
                    return (
                    <tr
                      key={`${row.symbol}-${row.exchange}`}
                      onClick={() => {
                        const type = String(row.assetType || "").toLowerCase();
                        if (row.isEtf || row.isFund || type === "etf" || type === "fund") {
                          setEtfSearchInput(row.symbol);
                          setEtfTicker(row.symbol);
                          setActivePage("etfs");
                          return;
                        }
                        setSearchInput(row.symbol);
                        setTicker(row.symbol);
                        setActivePage("overview");
                      }}
                    >
                      <td>
                        <span className="screener-symbol-cell">
                          <span className={`stock-search-logo-shell${logoUrl ? " has-logo" : ""}`} aria-hidden="true">
                            <span>{getLogoFallbackText(row.symbol)}</span>
                            {logoUrl && (
                              <img
                                src={logoUrl}
                                data-provider-logo={row.logo || ""}
                                alt=""
                                crossOrigin="anonymous"
                                onLoad={(event) => handleCompanyLogoLoad(event)}
                                onError={(event) => handleCompanyLogoError(event, row.symbol)}
                              />
                            )}
                          </span>
                          <strong>{row.symbol}</strong>
                        </span>
                      </td>
                      <td>{row.assetType || "Stock"}</td>
                      <td>{row.companyName}</td>
                      <td>{formatLargeDollars(row.marketCap)}</td>
                      <td>{formatPrice(row.price)}</td>
                      <td>{row.sector || "N/A"}</td>
                      <td>{row.industry || "N/A"}</td>
                      <td>{formatPlain(row.beta)}</td>
                      <td>{formatPrice(row.currentDividend ?? row.lastDividend ?? row.dividend)}</td>
                      <td>{formatLargeNumber(row.volume)}</td>
                      <td>{row.exchange || "N/A"}</td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="heatmap-loading">No stocks match those filters yet.</div>
          )}
        </div>
      </section>
    )}


    {activePage === "news" && (
      <section className="news-page" id="news" aria-labelledby="news-page-title">
        <div className="financial-statement-hero">
          <div>
            <span className="home-feature-label">General News</span>
            <h2 id="news-page-title">News</h2>
            <p>Follow the latest market headlines and see what is moving across companies, sectors, and the broader market.</p>
          </div>
          {generalNews?.updatedAt && (
            <span className="market-overview-updated">
              Updated {new Date(generalNews.updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </span>
          )}
        </div>

        {generalNewsError ? (
          <div className="heatmap-loading">{generalNewsError}</div>
        ) : isGeneralNewsLoading && !generalNews?.articles?.length ? (
          <div className="heatmap-loading">Loading latest news...</div>
        ) : generalNews?.articles?.length ? (
          <div className="news-card-grid">
            {generalNews.articles.map((article) => (
              <a
                className="news-card"
                key={article.id || article.url}
                href={article.url}
                target="_blank"
                rel="noreferrer"
              >
                {article.image && <img src={article.image} alt="" loading="lazy" />}
                <span className="news-card-source">
                  {article.publisher || article.site || "News Source"}
                  {article.symbol ? ` · ${article.symbol}` : ""}
                </span>
                <strong>{article.title}</strong>
                {article.text && <p>{article.text}</p>}
                <small>{formatNewsDate(article.publishedDate)}</small>
              </a>
            ))}
          </div>
        ) : (
          <div className="heatmap-loading">No general news is available yet.</div>
        )}
      </section>
    )}


    {activePage === "profile" && (
      <section className="profile-page" id="profile" aria-labelledby="profile-title">
        <div className="section-heading-row market-overview-heading">
          <div>
            <div className="welcome-kicker">Account center</div>
            <h2 id="profile-title">Profile</h2>
            <p>Manage your MrktRally account details and set the site up like an app on your phone.</p>
          </div>
          {user && <span className="market-overview-updated">Signed in</span>}
        </div>

        <div className="profile-grid">
          <article className="profile-card">
            <div className="home-feature-label">Account</div>
            <h3>Your Login</h3>
            {user ? (
              <div className="profile-account-list">
                <div>
                  <span>Username</span>
                  <strong>{user.username || "MrktRally user"}</strong>
                </div>
                <div>
                  <span>Email</span>
                  <strong>{user.email || "No email saved"}</strong>
                </div>
              </div>
            ) : (
              <p>Log in or create an account to see your profile details.</p>
            )}
            <button
              type="button"
              className="profile-action-button"
              onClick={() => {
                setEmail(user?.email || email || "");
                setIsLogin(true);
                setIsRecoveringPassword(true);
                setPasswordResetToken("");
                setAuthPrompt("Send yourself a secure reset link if you need to change your password.");
                setAuthMessage("");
                setShowAuth(true);
              }}
            >
              Reset Password
            </button>
          </article>

          <article className="profile-card profile-settings-card">
            <div className="home-feature-label">Top bar</div>
            <h3>Watchlist Tape</h3>
            <p>Choose whether your saved top watchlist stays still or moves like a market tape.</p>
            <label className="profile-toggle-row">
              <span>
                <strong>Move my watchlist tape</strong>
                <em>Your saved symbols scroll across the top bar and pause when you hover.</em>
              </span>
              <input
                type="checkbox"
                checked={watchlistTapeMoves}
                onChange={(event) => setWatchlistTapeMoves(event.target.checked)}
              />
              <span className="profile-toggle-switch" aria-hidden="true" />
            </label>
          </article>

          <article className="profile-card profile-install-card">
            <div className="home-feature-label">Mobile setup</div>
            <h3>Add MrktRally to Your iPhone Home Screen</h3>
            <ol className="profile-steps">
              <li>Open Safari on your iPhone and go to mrktrally.com.</li>
              <li>Go to the page you want MrktRally to open to, usually Home or Stock Overview.</li>
              <li>Tap the share button at the bottom of Safari. It looks like a square with an arrow pointing up.</li>
              <li>Scroll through the share menu and tap Add to Home Screen.</li>
              <li>Keep the name as MrktRally, or rename it if you want.</li>
              <li>Tap Add in the top-right corner. MrktRally will appear on your home screen like an app.</li>
              <li>Next time, open MrktRally from that icon for a cleaner app-style experience.</li>
            </ol>
            <p>
              Safari is usually the best option on iPhone. If you use Chrome, tap the share icon or three-dot menu and look for Add to Home Screen.
            </p>
          </article>

          <article className="profile-card profile-policy-card">
            <div className="home-feature-label">Policies</div>
            <h3>MrktRally Policies</h3>
            <div className="profile-policy-links">
              {["terms", "privacy", "cookies", "disclaimer"].map((policyKey) => (
                <button
                  key={policyKey}
                  type="button"
                  onClick={() => setActivePolicyKey(policyKey)}
                >
                  {POLICY_CONTENT[policyKey].title}
                </button>
              ))}
            </div>
            <p>New account signups record policy agreement on the user account with policy version {CURRENT_POLICY_VERSION}.</p>
          </article>
        </div>
      </section>
    )}


    {activePage === "financial-statements" && (
      <section className="financial-statements-page" id="financial-statements" aria-labelledby="financial-statements-title">
        <div className="financial-statement-hero">
          <div>
            <span className="home-feature-label">Financial Statements</span>
            <h2 id="financial-statements-title">Financial Statements</h2>
            <p>Search a company and review income statement, balance sheet, and cash flow lines across the latest annual or quarterly periods.</p>
          </div>
          {financialStatementData?.updatedAt && (
            <span className="market-overview-updated">
              Updated {new Date(financialStatementData.updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </span>
          )}
        </div>

        <form className="financial-statement-toolbar" onSubmit={handleFinancialStatementSearch}>
          <label className="financial-statement-search">
            <input
              value={financialStatementInput}
              onChange={(event) => setFinancialStatementInput(event.target.value)}
              placeholder="Search NVDA, Apple, Nike..."
            />
          </label>
          <button type="submit" className="stock-search-button">
            {isFinancialStatementLoading ? "Loading..." : "Search"}
          </button>
        </form>

        <div className="financial-statement-controls">
          <div className="company-document-tabs" role="tablist" aria-label="Statement type">
            {FINANCIAL_STATEMENT_TYPES.map((statement) => (
              <button
                key={statement.id}
                type="button"
                className={financialStatementType === statement.id ? "active" : ""}
                onClick={() => setFinancialStatementType(statement.id)}
              >
                {statement.label}
              </button>
            ))}
          </div>
          <div className="financial-statement-period-toggle" role="tablist" aria-label="Statement period">
            {FINANCIAL_STATEMENT_PERIODS.map((period) => (
              <button
                key={period.id}
                type="button"
                className={financialStatementPeriod === period.id ? "active" : ""}
                onClick={() => setFinancialStatementPeriod(period.id)}
              >
                {period.label}
              </button>
            ))}
          </div>
          {renderHistoryRangeToggle(
            financialStatementRange,
            setFinancialStatementRange,
            "Financial statement history range"
          )}
        </div>

        <div className="financial-statement-table-panel">
          <div className="screener-results-heading">
            <span>
              {isFinancialStatementLoading
                ? "Loading statement..."
                : `${financialStatementTicker} ${financialStatementData?.statementLabel || "Financial Statement"}`}
            </span>
            <strong>
              {financialStatementRange === "max"
                ? "Max history"
                : `Last ${financialStatementRange} years`}
            </strong>
          </div>

          {financialStatementError ? (
            <div className="heatmap-loading">{financialStatementError}</div>
          ) : isFinancialStatementLoading && !financialStatementData ? (
            <div className="heatmap-loading">Loading financial statements...</div>
          ) : visibleFinancialStatementData?.rows?.length ? (
            <div className="financial-statement-table-wrap">
              <table className="financial-statement-table">
                <thead>
                  <tr>
                    <th>Breakdown</th>
                    {visibleFinancialStatementData.periods.map((period) => (
                      <th key={period.key}>
                        <span>{period.label}</span>
                        {period.date && <small>{formatShortDate(period.date)}</small>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleFinancialStatementData.rows.map((row) => (
                    <tr key={row.key}>
                      <th>{row.label}</th>
                      {row.values.map((value, index) => (
                        <td key={`${row.key}-${visibleFinancialStatementData.periods[index]?.key || index}`}>
                          {formatStatementValue(value, row)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="heatmap-loading">No financial statement data is available for this ticker yet.</div>
          )}
        </div>
      </section>
    )}


    {activePage === "fundamental-charts" && (
      <section className="fundamental-charts-page" id="fundamental-charts" aria-labelledby="fundamental-charts-title">
        <div className="financial-statement-hero">
          <div>
            <span className="home-feature-label">Fundamental Charts</span>
            <h2 id="fundamental-charts-title">Fundamental Charts</h2>
            <p>Choose stocks and indicators, then chart the annual or quarterly fundamentals we have from income statements, balance sheets, cash flow statements, and derived ratios.</p>
          </div>
          {fundamentalChartData?.updatedAt && (
            <span className="market-overview-updated">
              Updated {new Date(fundamentalChartData.updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </span>
          )}
        </div>

        <div className="fundamental-builder-panel">
          <form className="financial-statement-toolbar fundamental-ticker-toolbar" onSubmit={handleFundamentalChartTickerAdd}>
            <label className="financial-statement-search">
              <input
                value={fundamentalChartInput}
                onChange={(event) => setFundamentalChartInput(event.target.value)}
                placeholder="Add tickers or names: NVDA, AMD, Apple..."
              />
            </label>
            <button type="submit" className="stock-search-button">
              Add
            </button>
          </form>

          <div className="fundamental-chip-row" aria-label="Selected tickers">
            {fundamentalChartTickers.map((symbol) => (
              <button
                key={symbol}
                type="button"
                className="fundamental-chip"
                onClick={() => removeFundamentalChartTicker(symbol)}
                title={`Remove ${symbol}`}
              >
                {symbol}
                <span>×</span>
              </button>
            ))}
            {!fundamentalChartTickers.length && (
              <span className="fundamental-empty-note">Add at least one ticker to start charting.</span>
            )}
          </div>

          <div className="financial-statement-period-toggle fundamental-period-toggle" role="tablist" aria-label="Fundamental chart period">
            {FINANCIAL_STATEMENT_PERIODS.map((period) => (
              <button
                key={period.id}
                type="button"
                className={fundamentalChartPeriod === period.id ? "active" : ""}
                onClick={() => setFundamentalChartPeriod(period.id)}
              >
                {period.label}
              </button>
            ))}
          </div>

          {renderHistoryRangeToggle(
            fundamentalChartRange,
            setFundamentalChartRange,
            "Fundamental chart history range"
          )}

          <div className="fundamental-view-toggle" role="group" aria-label="Fundamental chart layout">
            <button
              type="button"
              className={!isFundamentalFocusMode ? "active" : ""}
              onClick={() => setIsFundamentalFocusMode(false)}
            >
              Grid
            </button>
            <button
              type="button"
              className={isFundamentalFocusMode ? "active" : ""}
              onClick={() => setIsFundamentalFocusMode(true)}
            >
              Big Chart
            </button>
          </div>
        </div>

        <div className="fundamental-indicator-panel">
          <div className="fundamental-indicator-sidebar" aria-label="Indicator groups">
            {availableFundamentalIndicatorGroups.map((group) => (
              <button
                key={group.id}
                type="button"
                className={activeFundamentalIndicatorGroupDetails?.id === group.id ? "active" : ""}
                onClick={() => setActiveFundamentalIndicatorGroup(group.id)}
              >
                <span>{group.label}</span>
                <strong>{group.indicators.length}</strong>
              </button>
            ))}
          </div>

          <div className="fundamental-indicator-options">
            <div className="fundamental-indicator-heading">
              <div>
                <span>Indicators</span>
                <strong>
                  {activeFundamentalIndicatorGroupDetails?.label || "Indicators"}
                </strong>
              </div>
              <div className="fundamental-indicator-actions">
                <button
                  type="button"
                  onClick={() => selectFundamentalIndicatorGroup(activeFundamentalIndicatorGroupDetails?.id)}
                >
                  Select Group
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedFundamentalIndicators([])}
                >
                  Reset
                </button>
              </div>
            </div>

            <div className="fundamental-metric-search">
              <input
                value={fundamentalMetricSearch}
                onChange={(event) => setFundamentalMetricSearch(event.target.value)}
                placeholder="Search metrics: revenue, ROIC, free cash flow..."
                aria-label="Search fundamental chart metrics"
              />
              {normalizedFundamentalMetricSearch && (
                <div className="fundamental-metric-suggestions">
                  {searchedFundamentalIndicators.length ? (
                    searchedFundamentalIndicators.map((indicator) => (
                      <button
                        key={`metric-search-${indicator.key}`}
                        type="button"
                        className={selectedFundamentalIndicators.includes(indicator.key) ? "selected" : ""}
                        onClick={() => {
                          addFundamentalIndicator(indicator.key);
                          setActiveFundamentalIndicatorGroup(indicator.groupId);
                        }}
                      >
                        <span>{indicator.label}</span>
                        <small>{indicator.groupLabel}</small>
                      </button>
                    ))
                  ) : (
                    <span>No matching metrics</span>
                  )}
                </div>
              )}
            </div>

            <div className="fundamental-indicator-grid">
              {(activeFundamentalIndicatorGroupDetails?.indicators || []).map((indicator) => (
                <button
                  key={indicator.key}
                  type="button"
                  className={selectedFundamentalIndicators.includes(indicator.key) ? "selected" : ""}
                  onClick={() => toggleFundamentalIndicator(indicator.key)}
                >
                  {indicator.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {fundamentalChartError ? (
          <div className="heatmap-loading">{fundamentalChartError}</div>
        ) : isFundamentalChartLoading && !fundamentalChartData ? (
          <div className="heatmap-loading">Loading fundamental charts...</div>
        ) : selectedFundamentalIndicatorDetails.length ? (
          <>
            {isFundamentalFocusMode ? (
              <div className="fundamental-chart-card fundamental-chart-card-wide">
                <div className="fundamental-chart-card-header">
                  <div>
                    <span>Combined Chart</span>
                    <h3>Selected Metrics</h3>
                  </div>
                  <div className="fundamental-chart-card-actions">
                    <strong>
                      {selectedFundamentalIndicatorDetails.length} metrics · {fundamentalChartTickers.length} companies
                    </strong>
                  </div>
                </div>
                <div className="fundamental-chart-card-meta">
                  {renderFundamentalChartCompanies("combined")}
                  {renderFundamentalChartBrand()}
                </div>

                {combinedFundamentalChartRows.length ? (
                  <>
                    {renderCombinedFundamentalLineChart()}
                    <div className="fundamental-combined-legend">
                      {combinedFundamentalChartLines.map((line) => (
                        <span key={`legend-${line.key}`} style={{ "--series-color": line.color }}>
                          {line.label}
                        </span>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="heatmap-loading">No data yet for these selected metrics.</div>
                )}
              </div>
            ) : (
              <>
                <div className="fundamental-chart-grid">
                  {fundamentalChartSeries.map((series) => (
                    <div className="fundamental-chart-card" key={series.indicator.key}>
                      <div className="fundamental-chart-card-header">
                        <div>
                          <span>{series.indicator.groupLabel}</span>
                          <h3>{series.indicator.label}</h3>
                        </div>
                        <div className="fundamental-chart-card-actions">
                          <strong>
                            {historyRangeLabel(fundamentalChartRange)} · {fundamentalChartPeriod === "annual" ? "Annual" : "Quarterly"}
                          </strong>
                          <button
                            type="button"
                            className="fundamental-chart-maximize"
                            aria-label={`Maximize ${series.indicator.label} chart`}
                            title={`Maximize ${series.indicator.label}`}
                            onClick={() => setMaximizedFundamentalChartKey(series.indicator.key)}
                          >
                            <span aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                      <div className="fundamental-chart-card-meta">
                        {renderFundamentalChartCompanies(series.indicator.key)}
                        {renderFundamentalChartBrand()}
                      </div>

                      {series.rows.length ? (
                        renderFundamentalLineChart(series)
                      ) : (
                        <div className="heatmap-loading">No data yet for this indicator.</div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="financial-statement-table-panel">
                  <div className="screener-results-heading">
                    <span>Latest Selected Fundamentals</span>
                    <strong>
                      {historyRangeLabel(fundamentalChartRange)} · {fundamentalChartPeriod === "annual" ? "Latest annual period" : "Latest quarter"}
                    </strong>
                  </div>
                  <div className="financial-statement-table-wrap">
                    <table className="financial-statement-table fundamental-summary-table">
                      <thead>
                        <tr>
                          <th>Indicator</th>
                          {fundamentalChartTickers.map((symbol) => (
                            <th key={symbol}>{symbol}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {fundamentalChartSeries.map((series) => (
                          <tr key={`summary-${series.indicator.key}`}>
                            <th>{series.indicator.label}</th>
                            {fundamentalChartTickers.map((symbol) => {
                              const latest = series.latestValues.find((value) => value.symbol === symbol);
                              return (
                                <td key={`${series.indicator.key}-${symbol}`}>
                                  <span>{formatFundamentalChartValue(latest?.value, series.indicator)}</span>
                                  {latest?.period && <small>{latest.period}</small>}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </>
        ) : (
          <div className="heatmap-loading">Select at least one indicator to build charts.</div>
        )}
      </section>
    )}


    {maximizedFundamentalChart?.rows?.length ? createPortal(
      <div className="fundamental-chart-modal" role="dialog" aria-modal="true" aria-labelledby="fundamental-chart-modal-title">
        <div className="fundamental-chart-modal-panel">
          <div className="fundamental-chart-modal-header">
            <div>
              <span className="home-feature-label">{maximizedFundamentalChart.indicator.groupLabel}</span>
              <h2 id="fundamental-chart-modal-title">{maximizedFundamentalChart.indicator.label}</h2>
              <p>
                Showing {maximizedFundamentalChart.indicator.label} · {historyRangeLabel(fundamentalChartRange)} · {fundamentalChartPeriod === "annual" ? "Annual" : "Quarterly"}
              </p>
            </div>
            <div className="fundamental-chart-modal-header-actions">
              <div className="fundamental-chart-modal-brand" aria-label="Powered by MrktRally">
                <img src="/mrktrally-icon.png" alt="" />
                <span>Powered by <strong>MrktRally</strong></span>
              </div>
              <button
                type="button"
                className="fundamental-chart-modal-close"
                aria-label="Close maximized chart"
                title="Close"
                onClick={() => setMaximizedFundamentalChartKey("")}
              >
                ×
              </button>
            </div>
          </div>

          <div className="fundamental-chart-modal-companies" aria-label="Companies shown on this chart">
            {fundamentalChartTickers.map((symbol, index) => {
              const company = getFundamentalCompanyMeta(symbol);
              const color = PORTFOLIO_COLORS[index % PORTFOLIO_COLORS.length];
              return (
                <div className="fundamental-chart-modal-company" key={`modal-company-${symbol}`}>
                  <span className="fundamental-chart-modal-logo" style={{ "--series-color": color }} aria-hidden="true">
                    {company.logo ? (
                      <img
                        src={company.logo}
                        alt=""
                        loading="eager"
                        decoding="async"
                        crossOrigin="anonymous"
                        onLoad={(event) => handleCompanyLogoLoad(event)}
                        onError={(event) => handleCompanyLogoError(event, company.symbol)}
                      />
                    ) : (
                      company.symbol.slice(0, 1)
                    )}
                  </span>
                  <span>
                    <strong>{company.symbol}</strong>
                    <small>{company.name}</small>
                  </span>
                </div>
              );
            })}
          </div>

          <div className="fundamental-chart-modal-chart">
            {renderFundamentalLineChart(maximizedFundamentalChart, "100%")}
          </div>
        </div>
      </div>,
      document.body
    ) : null}


    {activePage === "treasury-rates" && (
      <section className="treasury-rates-page" id="treasury-rates" aria-labelledby="treasury-rates-title">
        <div className="financial-statement-hero">
          <div>
            <span className="home-feature-label">Treasury Rates</span>
            <h2 id="treasury-rates-title">Treasury Rates</h2>
            <p>Review the latest U.S. Treasury yield curve from 1 month through 30 years, plus recent daily history.</p>
          </div>
          {treasuryRates?.updatedAt && (
            <span className="market-overview-updated">
              Updated {new Date(treasuryRates.updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </span>
          )}
        </div>

        {treasuryRatesError ? (
          <div className="heatmap-loading">{treasuryRatesError}</div>
        ) : isTreasuryRatesLoading && !latestTreasuryRates ? (
          <div className="heatmap-loading">Loading treasury rates...</div>
        ) : latestTreasuryRates ? (
          <>
            <div className="treasury-rate-grid">
              {TREASURY_RATE_TERMS.map((term) => {
                const currentRate = latestTreasuryRates?.[term.key];
                const previousRate = previousTreasuryRates?.[term.key];
                const change = isNumber(currentRate) && isNumber(previousRate)
                  ? currentRate - previousRate
                  : null;
                return (
                  <div className="treasury-rate-card" key={term.key}>
                    <span>{term.label}</span>
                    <strong>{formatTreasuryRate(currentRate)}</strong>
                    <small className={isNumber(change) ? (change >= 0 ? "green" : "red") : ""}>
                      {isNumber(change) ? `${change >= 0 ? "+" : ""}${(change * 100).toFixed(0)} bps vs prior` : "No prior move"}
                    </small>
                  </div>
                );
              })}
            </div>

            <div className="financial-statement-table-panel">
              <div className="screener-results-heading">
                <span>Recent Treasury Rate History</span>
                <strong>{latestTreasuryRates.date ? `Latest ${formatShortDate(latestTreasuryRates.date)}` : "Latest available"}</strong>
              </div>
              <div className="financial-statement-table-wrap">
                <table className="financial-statement-table treasury-rates-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      {TREASURY_RATE_TERMS.map((term) => (
                        <th key={term.key}>{term.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(treasuryRates.rows || []).map((row) => (
                      <tr key={row.date}>
                        <th>{formatShortDate(row.date)}</th>
                        {TREASURY_RATE_TERMS.map((term) => (
                          <td key={`${row.date}-${term.key}`}>{formatTreasuryRate(row[term.key])}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          <div className="heatmap-loading">No treasury rate data is available yet.</div>
        )}
      </section>
    )}


    {/* SEARCH */}
    {activePage === "overview" && (
    <>
{renderOverviewSectionGuide()}

<section className="etf-page stock-overview-page-shell" id="overview" aria-labelledby="stock-overview-title">
  <div className="etf-heading-row">
    <div>
      <span className="home-feature-label">Company Research</span>
      <h2 id="stock-overview-title">Stock Overview</h2>
      <p>
        Search a company and review pricing, financial charts, metrics, estimates, peer comps,
        AI analysis, transcripts, filings, and news in one focused research view.
      </p>
    </div>
    <form
      className="etf-search stock-overview-search"
      onSubmit={handleStockSearchSubmit}
    >
      <div className="stock-search-field alternative-search-field">
        <input
          value={searchInput}
          onChange={(e) => {
            setSearchInput(e.target.value);
            setShowStockSearchSuggestions(true);
          }}
          onFocus={() => {
            if (stockSearchBlurTimerRef.current) {
              window.clearTimeout(stockSearchBlurTimerRef.current);
              stockSearchBlurTimerRef.current = null;
            }
            setShowStockSearchSuggestions(true);
          }}
          onBlur={() => {
            stockSearchBlurTimerRef.current = window.setTimeout(() => {
              setShowStockSearchSuggestions(false);
            }, 140);
          }}
          placeholder="Search ticker or company..."
          autoComplete="off"
        />
        {renderStockSearchSuggestions("overview")}
      </div>

      <button type="submit">
        {isStockLoading ? "Loading..." : "Search Stock"}
      </button>
    </form>
  </div>

  <div className="market-quick-picks stock-quick-picks" aria-label="Popular stocks">
    {STOCK_QUICK_PICKS.map((item) => (
      <button
        key={item.symbol}
        type="button"
        className={String(ticker || stockData.symbol || "").toUpperCase() === item.symbol ? "active" : ""}
        onClick={() => openStockOverviewSymbol(item.symbol)}
      >
        <span>{item.symbol}</span>
        <small>{item.label}</small>
      </button>
    ))}
  </div>

  <div className="etf-hero-panel stock-overview-hero-panel">
    <div className="etf-hero-main">
      {(ticker || stockData.symbol) && (
        <span
          className="etf-hero-logo-shell stock-hero-logo-shell"
          aria-hidden="true"
        >
          <img
            key={ticker}
            src={getDisplayCompanyLogoUrl(stockData.symbol || ticker, stockData.logo || savedSymbolDetails[ticker]?.logo)}
            data-provider-logo={stockData.logo || savedSymbolDetails[ticker]?.logo || ""}
            alt=""
            loading="eager"
            decoding="async"
            crossOrigin="anonymous"
            onLoad={(event) => handleCompanyLogoLoad(event)}
            onError={(event) => handleCompanyLogoError(event, ticker)}
          />
        </span>
      )}
      <span className="etf-symbol">{stockData.symbol || ticker}</span>
      <h3>{stockData.name || savedSymbolDetails[ticker]?.name || ticker}</h3>
      <strong className="etf-type-badge">Public company</strong>
      <p>
        Track the latest quote, chart history, financials, valuation, estimates, filings,
        transcripts, market news, and company-specific research in one page.
      </p>
    </div>
    <div className="etf-price-card stock-overview-price-card">
      <span>Price</span>
      <strong>{formatPrice(displayedStockPrice)}</strong>
      {isNumber(stockChartMeta?.percentChange) && (
        <em className={stockChartMeta.percentChange >= 0 ? "positive-text" : "negative-text"}>
          {formatSignedPercent(stockChartMeta.percentChange)}
        </em>
      )}
      {hasAfterHoursTrade ? (
        <small className="stock-hero-after-hours">
          {afterHoursTrade.label || "After Hours"} {formatPrice(afterHoursTrade.price)}
          {isNumber(afterHoursPercentChange) ? ` ${formatSignedPercent(afterHoursPercentChange)}` : ""}
        </small>
      ) : null}
    </div>
  </div>
</section>
        {/* LIVE STOCK CHART */}

<div className="chart-section native-stock-chart-section" id="price-chart">

  <div className="stock-chart-header">
    <div>
      <h2 className="section-title">
        MrktRally Price Chart
      </h2>
      <div className="stock-chart-meta">
        <span>{ticker}</span>
        <strong>{formatPrice(displayedStockPrice)}</strong>
        {isNumber(stockChartMeta?.percentChange) && (
          <span className={stockChartMeta.percentChange >= 0 ? "stock-chart-change positive-text" : "stock-chart-change negative-text"}>
            {stockChartMeta.percentChange >= 0 ? "+" : ""}
            {stockChartMeta.percentChange.toFixed(2)}%
          </span>
        )}
      </div>
    </div>

    <div className="stock-chart-range-tabs">
      {STOCK_CHART_RANGES.map((range) => (
        <button
          key={range}
          type="button"
          className={stockChartRange === range ? "active" : ""}
          onClick={() => setStockChartRange(range)}
        >
          {range}
        </button>
      ))}
    </div>
  </div>

  <div className="native-stock-chart-card">
    {isStockChartLoading ? (
      <StockDataLoading label="Loading price history..." />
    ) : stockChartData.length ? (
      <ResponsiveContainer width="100%" height={460}>
        <LineChart
          data={stockChartData}
          margin={{
            top: 18,
            right: 24,
            left: 6,
            bottom: 12
          }}
        >
          <defs>
            <linearGradient id="priceLineGradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="55%" stopColor="#60a5fa" />
              <stop offset="100%" stopColor="#34d399" />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#223049" strokeDasharray="3 3" />
          <XAxis
            dataKey="time"
            tickFormatter={(value) => formatStockChartAxisLabel(value, stockChartRange)}
            stroke="#8ea0bd"
            tick={{ fill: "#9ca3af", fontSize: 12 }}
            minTickGap={28}
          />
          <YAxis
            domain={["auto", "auto"]}
            tickFormatter={(value) => `$${Number(value).toFixed(value >= 100 ? 0 : 2)}`}
            stroke="#8ea0bd"
            tick={{ fill: "#9ca3af", fontSize: 12 }}
            width={74}
          />
          <Tooltip
            contentStyle={{
              background: "#0b1220",
              border: "1px solid #2b3a55",
              borderRadius: "12px",
              color: "#f8fafc"
            }}
            labelFormatter={(value) => formatStockChartTooltipLabel(value, stockChartRange)}
            formatter={(value) => [formatPrice(value), "Price"]}
          />
          <Line
            key={`${ticker}-${stockChartRange}-${stockChartData.length}-${stockChartData[0]?.time || ""}-${stockChartData[stockChartData.length - 1]?.time || ""}`}
            type="monotone"
            dataKey="price"
            stroke="url(#priceLineGradient)"
            strokeWidth={3}
            dot={false}
            isAnimationActive
            animationBegin={80}
            animationDuration={900}
            animationEasing="ease-out"
            activeDot={{
              r: 5,
              stroke: "#f8fafc",
              strokeWidth: 2,
              fill: "#38bdf8"
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    ) : (
      <div className="historical-chart-empty">
        {stockChartError || "No chart history available yet."}
      </div>
    )}
  </div>

</div>
{/* AI ANALYSIS */}

<div className="chart-section research-section ai-stock-section" id="ai-analysis">

  <h2 className="section-title">
    AI Stock Analysis
  </h2>

  <div className="ai-analysis-box">
    {isAiLoading && !aiAnalysis ? (
      <div className="ai-text">Building analysis...</div>
    ) : aiAnalysis?.verdict && aiAnalysis?.stockAnalysis ? (
      <>
        <div className={`ai-brief-hero ${String(aiAnalysis.verdict.stance || "").toLowerCase()}`}>
          <div>
            <span className="ai-kicker">MrktRally research brief</span>
            <div className="ai-sentiment">
              {aiAnalysis.verdict.stance} · {aiAnalysis.verdict.score}/100
            </div>
          </div>
          <div className="ai-score-ring">
            <strong>{aiAnalysis.verdict.score}</strong>
            <span>score</span>
          </div>
        </div>

        <p className="ai-text">{aiAnalysis.verdict.summary}</p>

        <div className="ai-analysis-grid ai-analysis-grid-dense">
          <div className="ai-card">
            <h3 className="ai-title">Valuation</h3>
            <ul className="ai-list">
              {aiAnalysis.stockAnalysis.valuation.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <div className="ai-card">
            <h3 className="ai-title">Financial Quality</h3>
            <ul className="ai-list">
              {aiAnalysis.stockAnalysis.financialQuality.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          {aiAnalysis.stockAnalysis.balanceSheet?.length ? (
            <div className="ai-card">
              <h3 className="ai-title">Balance Sheet</h3>
              <ul className="ai-list">
                {aiAnalysis.stockAnalysis.balanceSheet.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {aiAnalysis.stockAnalysis.returnsAndEfficiency?.length ? (
            <div className="ai-card">
              <h3 className="ai-title">Returns & Efficiency</h3>
              <ul className="ai-list">
                {aiAnalysis.stockAnalysis.returnsAndEfficiency.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {aiAnalysis.stockAnalysis.estimateSetup?.length ? (
            <div className="ai-card">
              <h3 className="ai-title">Estimate Setup</h3>
              <ul className="ai-list">
                {aiAnalysis.stockAnalysis.estimateSetup.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="ai-card bullish-card">
            <h3 className="ai-title">Catalysts</h3>
            <ul className="ai-list">
              {aiAnalysis.stockAnalysis.catalysts.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <div className="ai-card bearish-card">
            <h3 className="ai-title">Risks</h3>
            <ul className="ai-list">
              {aiAnalysis.stockAnalysis.risks.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="ai-analysis-grid ai-scenario-grid">
          {aiAnalysis.stockAnalysis.scenarios.map((scenario) => (
            <div className="ai-card" key={scenario.label}>
              <h3 className="ai-title">{scenario.label} Case</h3>
              <div className="comparison-price">{formatPrice(scenario.price)}</div>
              <p className="ai-text">{scenario.detail}</p>
            </div>
          ))}
        </div>
      </>
    ) : (
      <div className="ai-text">Analysis is temporarily unavailable.</div>
    )}

  </div>

</div>
{/* AI EARNINGS TRANSCRIPT ANALYSIS */}

<div className="chart-section research-section ai-earnings-section">

  <h2 className="section-title">
    AI Earnings Call Analysis
  </h2>

  <div className="ai-earnings-panel">
    {isAiLoading && !aiAnalysis ? (
      <div className="ai-card"><p className="ai-text">Reviewing earnings data...</p></div>
    ) : aiAnalysis?.earningsAnalysis ? (
      <>
        <div className="ai-earnings-hero">
          <div>
            <span className="ai-earnings-kicker">MrktRally earnings brief</span>
            <h3>{aiAnalysis.earningsAnalysis.period}</h3>
            <p>{aiAnalysis.earningsAnalysis.summary}</p>
          </div>
          <div className="ai-earnings-gauges">
            <div className="ai-earnings-gauge">
              <strong>{aiAnalysis.earningsAnalysis.confidence}</strong>
              <span>confidence</span>
            </div>
            <div className="ai-earnings-gauge caution">
              <strong>{aiAnalysis.earningsAnalysis.caution}</strong>
              <span>caution</span>
            </div>
          </div>
        </div>

        <div className="ai-earnings-grid">
          <div className="ai-card earnings-readout-card">
            <h3 className="ai-title">Reported Highlights</h3>
            <ul className="ai-list">
              {aiAnalysis.earningsAnalysis.highlights.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <div className="ai-card bullish-card earnings-signal-card">
            <h3 className="ai-title">Positive Signals</h3>
            <ul className="ai-list">
              {aiAnalysis.earningsAnalysis.positives.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <div className="ai-card bearish-card earnings-signal-card">
            <h3 className="ai-title">Pressure Points</h3>
            <ul className="ai-list">
              {aiAnalysis.earningsAnalysis.risks.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <div className="ai-card ai-momentum-card">
            <h3 className="ai-title">Earnings Momentum</h3>
            <div className="sentiment-row">
              <div className="sentiment-label">Confidence</div>
              <div className="sentiment-bar">
                <div
                  className="sentiment-fill positive"
                  style={{ width: `${aiAnalysis.earningsAnalysis.confidence}%` }}
                />
              </div>
            </div>
            <div className="sentiment-row">
              <div className="sentiment-label">Caution</div>
              <div className="sentiment-bar">
                <div
                  className="sentiment-fill negative"
                  style={{ width: `${aiAnalysis.earningsAnalysis.caution}%` }}
                />
              </div>
            </div>
          </div>

          <div className="ai-card earnings-outlook-card">
            <h3 className="ai-title">Consensus Outlook</h3>
            <p className="ai-text">{aiAnalysis.earningsAnalysis.outlook}</p>
          </div>

          <div className="ai-card management-questions-card">
            <h3 className="ai-title">Questions for Management</h3>
            <ul className="ai-list">
              {aiAnalysis.earningsAnalysis.questions.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </>
    ) : (
      <div className="ai-card"><p className="ai-text">Earnings analysis is temporarily unavailable.</p></div>
    )}

  </div>

</div>
{/* EARNINGS CALL TRANSCRIPTS */}

<div className="chart-section research-section earnings-call-section" id="earnings-calls">

  <h2 className="section-title">
    Earnings Call Transcript
  </h2>

  <div className="earnings-call-panel">
    <div className="transcript-toolbar">
      <label htmlFor="transcript-period">
        Quarter
      </label>
      <select
        id="transcript-period"
        value={selectedTranscriptPeriod}
        disabled={isTranscriptPeriodsLoading || !transcriptPeriodOptions.length}
        onChange={(event) => {
          stopComputerRead();
          setEarningsCall(null);
          setSelectedTranscriptPeriod(event.target.value);
        }}
      >
        {isTranscriptPeriodsLoading ? (
          <option value="">Loading calls...</option>
        ) : transcriptPeriodOptions.length ? transcriptPeriodOptions.map((period) => (
          <option key={period.value} value={period.value}>
            {period.label}
          </option>
        )) : (
          <option value="">No calls found</option>
        )}
      </select>
    </div>

    {isTranscriptPeriodsLoading || isEarningsCallLoading || (!earningsCall && stockData?.refreshing) ? (
      <div className="earnings-call-empty">Loading earnings calls...</div>
    ) : earningsCall?.available && (earningsCall?.transcript?.length || earningsCall?.transcriptUrl) ? (
      <>
        <div className="earnings-call-header">
          <div>
            <div className="earnings-call-title">
              {earningsCall.title || `${ticker} earnings call`}
            </div>
            <div className="earnings-call-meta">
              {[earningsCall.fiscalPeriod, earningsCall.fiscalYear, earningsCall.date]
                .filter(Boolean)
                .join(" • ")}
            </div>
          </div>
        </div>

        {earningsCall.audioUrl ? (
          <div className="earnings-call-audio">
            <div>
              <span>Earnings Call Audio</span>
              <small>Conference call replay</small>
            </div>
            <audio controls preload="none" src={earningsCall.audioUrl}>
              Your browser does not support earnings call audio.
            </audio>
          </div>
        ) : null}

        {earningsCall.transcript?.length ? (
          <div className="transcript-reader">
            <div className="transcript-content">
              {earningsCall.transcript.map((section) => (
                  <div className="transcript-section" key={section.id}>
                    <div className="transcript-speaker">
                      {section.speaker}
                    </div>
                    <p>{section.text}</p>
                  </div>
              ))}
            </div>
          </div>
        ) : earningsCall.transcriptUrl ? (
          <iframe
            className="transcript-frame"
            title={`${ticker} earnings call transcript`}
            src={earningsCall.transcriptUrl}
          />
        ) : (
          <div className="earnings-call-empty">
            Transcript is not available for this ticker yet.
          </div>
        )}
      </>
    ) : (
      <div className="earnings-call-empty">
        {earningsCall?.message || "Earnings call transcript is not available for this ticker yet."}
      </div>
    )}
  </div>

</div>
{/* REVENUE CHART */}

<div className="chart-section" id="financials">

  <div className="chart-section-header">
    <h2 className="section-title">
      Revenue Chart
    </h2>

    <div className="chart-mode-toggle" aria-label="Financial chart period">
      <button
        className={`chart-mode-button ${financialChartMode === "annual" ? "active" : ""}`}
        type="button"
        onClick={() => setFinancialChartMode("annual")}
      >
        Annual
      </button>
      <button
        className={`chart-mode-button ${financialChartMode === "quarterly" ? "active" : ""}`}
        type="button"
        onClick={refreshQuarterlyChartHistory}
      >
        Quarterly
      </button>
    </div>

    {renderHistoryRangeToggle(
      financialChartRange,
      setFinancialChartRange,
      "Stock overview chart history range"
    )}
  </div>

<div className="chart-box">

    {shouldShowCoreHistoryLoading(revenueHistory) ? (

  <StockDataLoading label="Loading revenue history..." />

) : revenueHistory.length ? (

  <>
<ResponsiveContainer
  width="100%"
  height={400}
>

      <BarChart
        data={revenueHistory}
        margin={{
          top: 16,
          right: 24,
          left: 16,
          bottom: 8,
        }}
      >

        <CartesianGrid
          stroke="#1f2937"
        />

        <XAxis dataKey="period" />

        <YAxis
  tickFormatter={(value) =>
    formatChartBillions(value)
  }
/>

        <Tooltip
          content={(
            <OverviewChartTooltip
              formatter={formatChartBillions}
              valueLabel="Revenue"
              symbol={ticker}
              color="#3b82f6"
            />
          )}
/>

        <Bar
          dataKey="revenue"
          fill="#3b82f6"
          radius={[6, 6, 0, 0]}
        />

      </BarChart>

    </ResponsiveContainer>

    {financialChartMode === "annual" && (
      <ChartGrowthStrip
        label="Revenue growth"
        rows={revenueGrowthRows}
      />
    )}
  </>

  ) : (

    <p
      style={{
        color: "#9ca3af",
        padding: "40px",
      }}
    >
      No revenue history available.
    </p>

  )}

</div>

</div>

{/* NET INCOME */}
<div className="chart-section">

  <h2 className="section-title">
    Net Income Chart
  </h2>

  <div className="chart-box">

    {shouldShowCoreHistoryLoading(earningsHistory) ? (

      <StockDataLoading label="Loading net income history..." />

    ) : earningsHistory.length ? (

      <>
      <ResponsiveContainer
        width="100%"
        height={400}
      >

        <LineChart
          data={earningsHistory}
          margin={{
            top: 16,
            right: 24,
            left: 16,
            bottom: 8,
          }}
        >

          <CartesianGrid stroke="#1f2937" />

          <XAxis dataKey="period" />

          <YAxis
            tickFormatter={(value) =>
              formatChartBillions(value)
            }
          />

          <Tooltip
            content={(
              <OverviewChartTooltip
                formatter={formatChartBillions}
                valueLabel="Net Income"
                symbol={ticker}
                color="#22c55e"
              />
            )}
          />

          <Line
            type="monotone"
            dataKey="earnings"
            stroke="#22c55e"
            strokeWidth={4}
            connectNulls
            dot={{ r: 4 }}
            activeDot={{ r: 6 }}
          />

        </LineChart>

      </ResponsiveContainer>

      {financialChartMode === "annual" && (
        <ChartGrowthStrip
          label="Net income growth"
          rows={earningsGrowthRows}
        />
      )}
      </>

    ) : (

      <p
        style={{
          color: "#9ca3af",
          padding: "40px",
        }}
      >
        No net income history available.
      </p>

    )}

  </div>

</div>

{/* EPS */}

<div className="chart-section">

  <div className="chart-section-header">
    <h2 className="section-title">
      {epsChartLabel} Chart
    </h2>

    <div className="chart-mode-toggle" aria-label="EPS chart share basis">
      {EPS_CHART_SHARE_OPTIONS.map((option) => (
        <button
          key={option.id}
          className={`chart-mode-button ${epsChartShareBasis === option.id ? "active" : ""}`}
          type="button"
          onClick={() => setEpsChartShareBasis(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  </div>

  <div className="chart-box">

    {shouldShowCoreHistoryLoading(epsHistory) ? (

      <StockDataLoading label="Loading EPS history..." />

    ) : epsHistory.length ? (

      <>
      <ResponsiveContainer
        width="100%"
        height={400}
      >

        <LineChart
          data={epsHistory}
          margin={{
            top: 16,
            right: 24,
            left: 16,
            bottom: 8,
          }}
        >

          <CartesianGrid stroke="#1f2937" />

          <XAxis dataKey="period" />

          <YAxis
            tickFormatter={(value) =>
              formatChartEps(value)
            }
          />

          <Tooltip
            content={(
              <OverviewChartTooltip
                formatter={formatChartEps}
                valueLabel={epsChartLabel}
                symbol={ticker}
                color="#f59e0b"
              />
            )}
          />

          <Line
            type="monotone"
            dataKey="eps"
            stroke="#f59e0b"
            strokeWidth={4}
            connectNulls
            dot={{ r: 4 }}
            activeDot={{ r: 6 }}
          />

        </LineChart>

      </ResponsiveContainer>

      {financialChartMode === "annual" && (
        <ChartGrowthStrip
          label="EPS growth"
          rows={epsGrowthRows}
        />
      )}
      </>

    ) : (

      <p
        style={{
          color: "#9ca3af",
          padding: "40px",
        }}
      >
        No EPS history available.
      </p>

    )}

  </div>

</div>

<div className="historical-chart-grid">
  <HistoricalLineChart
    title="Historical Year-End P/E"
    data={historicalPeHistory}
    dataKey="pe"
    color="#60a5fa"
    formatter={(value) => `${Number(value).toFixed(1)}x`}
    valueLabel="P/E"
    symbol={ticker}
    loading={shouldShowHistoricalPeLoading(historicalPeHistory)}
    mode="annual"
  />
  <HistoricalLineChart
    title={stockData.isFinancialCompany ? "Net Interest Revenue Mix" : "Gross Margin History"}
    data={readyHistoryRows(grossMarginHistory)}
    dataKey="grossMargin"
    color="#a78bfa"
    formatter={(value) => `${Number(value).toFixed(1)}%`}
    valueLabel={stockData.isFinancialCompany ? "Net Interest Revenue Mix" : "Gross Margin"}
    symbol={ticker}
    loading={shouldShowHistoryLoading(grossMarginHistory)}
    mode={financialChartMode}
  />
  <HistoricalLineChart
    title={stockData.isFinancialCompany ? "Pre-Tax Margin History" : "Operating Margin History"}
    data={readyHistoryRows(operatingMarginHistory)}
    dataKey="operatingMargin"
    color="#f59e0b"
    formatter={(value) => `${Number(value).toFixed(1)}%`}
    valueLabel={stockData.isFinancialCompany ? "Pre-Tax Margin" : "Operating Margin"}
    symbol={ticker}
    loading={shouldShowHistoryLoading(operatingMarginHistory)}
    mode={financialChartMode}
  />
  <HistoricalLineChart
    title="Profit Margin History"
    data={readyHistoryRows(profitMarginHistory)}
    dataKey="profitMargin"
    color="#34d399"
    formatter={(value) => `${Number(value).toFixed(1)}%`}
    valueLabel="Profit Margin"
    symbol={ticker}
    loading={shouldShowHistoryLoading(profitMarginHistory)}
    mode={financialChartMode}
  />
  <HistoricalLineChart
    title="Operating Cash Flow History"
    data={readyHistoryRows(operatingCashflowHistory)}
    dataKey="operatingCashflow"
    color="#22d3ee"
    formatter={formatChartBillions}
    valueLabel="Operating Cash Flow"
    symbol={ticker}
    loading={shouldShowHistoryLoading(operatingCashflowHistory)}
    mode={financialChartMode}
  />
  <HistoricalLineChart
    title="Free Cash Flow History"
    data={readyHistoryRows(freeCashflowHistory)}
    dataKey="freeCashflow"
    color="#14b8a6"
    formatter={formatChartBillions}
    valueLabel="Free Cash Flow"
    symbol={ticker}
    loading={shouldShowHistoryLoading(freeCashflowHistory)}
    mode={financialChartMode}
  />
  <HistoricalLineChart
    title="Weighted Avg Shares History"
    data={readyHistoryRows(sharesOutstandingHistory)}
    dataKey="weightedAverageShares"
    color="#f472b6"
    formatter={formatSharesMillions}
    valueLabel="Weighted Avg Shares"
    loading={shouldShowHistoryLoading(sharesOutstandingHistory)}
    mode={financialChartMode}
  />
  <div className="historical-chart-panel fundamental-chart-callout">
    <svg className="fundamental-chart-callout-art" viewBox="0 0 760 300" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="fundamentalCalloutLine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#14b8a6" />
          <stop offset="55%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#2563eb" />
        </linearGradient>
        <linearGradient id="fundamentalCalloutBars" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.36" />
          <stop offset="100%" stopColor="#0f172a" stopOpacity="0.08" />
        </linearGradient>
      </defs>
      <g className="callout-grid">
        {[80, 160, 240, 320, 400, 480, 560, 640].map((x) => (
          <line key={`x-${x}`} x1={x} y1="28" x2={x} y2="266" />
        ))}
        {[64, 112, 160, 208, 256].map((y) => (
          <line key={`y-${y}`} x1="54" y1={y} x2="710" y2={y} />
        ))}
      </g>
      <g className="callout-bars">
        {[86, 128, 96, 162, 118, 194, 138, 214, 166].map((height, index) => {
          const x = 74 + index * 70;
          return <rect key={`bar-${x}`} x={x} y={260 - height} width="34" height={height} rx="6" />;
        })}
      </g>
      <polyline
        className="callout-line-shadow"
        points="58,224 138,190 218,204 298,142 378,156 458,104 538,122 618,72 704,94"
      />
      <polyline
        className="callout-line"
        points="58,224 138,190 218,204 298,142 378,156 458,104 538,122 618,72 704,94"
      />
      {[["58", "224"], ["138", "190"], ["218", "204"], ["298", "142"], ["378", "156"], ["458", "104"], ["538", "122"], ["618", "72"], ["704", "94"]].map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} className="callout-dot" cx={cx} cy={cy} r="5" />
      ))}
    </svg>
    <div className="fundamental-chart-callout-content">
      <span className="home-feature-label">More Charting</span>
      <h3>For more charts, go to the Fundamental Charts page.</h3>
      <p>Compare companies, choose indicators, and switch between annual or quarterly views.</p>
      <button
        type="button"
        className="fundamental-chart-callout-button"
        onClick={() => openFundamentalChartsForTicker(stockData.symbol || ticker)}
      >
        Open Fundamental Charts
      </button>
    </div>
  </div>
</div>

        {/* METRICS */}

   <div className="metrics-groups section-anchor" id="metrics">
    {groupedMetricCards.map((group) => (
      <section className="metric-group" key={group.key}>
        <div className="metric-group-heading">
          <h3>{group.title}</h3>
          <span>{group.items.length} metrics</span>
        </div>
        <div className="grid metric-group-grid">
          {group.items.map((item) => (
            <div key={item.label} className={`card ${item.className || ""}`.trim()}>
              <div className="card-title">
                {item.label}
              </div>
              <div className={`card-value ${item.valueClassName || ""}`.trim()}>
                {item.value}
              </div>
            </div>
          ))}
        </div>
      </section>
    ))}
    {ungroupedMetricCards.length > 0 && (
      <section className="metric-group">
        <div className="metric-group-heading">
          <h3>Other Metrics</h3>
          <span>{ungroupedMetricCards.length} metrics</span>
        </div>
        <div className="grid metric-group-grid">
          {ungroupedMetricCards.map((item) => (
            <div key={item.label} className={`card ${item.className || ""}`.trim()}>
              <div className="card-title">
                {item.label}
              </div>
              <div className={`card-value ${item.valueClassName || ""}`.trim()}>
                {item.value}
              </div>
            </div>
          ))}
        </div>
      </section>
    )}
  </div>

  {hasCompanyProfileSection && (
    <section className="company-profile-panel">
      {stockData.description && (
        <div className="company-description-block">
          <div className="section-heading-row company-profile-heading">
            <div>
              <span className="home-feature-label">Company Profile</span>
            </div>
            {stockData.website && (
              <a href={stockData.website} target="_blank" rel="noreferrer">
                Website
              </a>
            )}
          </div>
          <p>{stockData.description}</p>
        </div>
      )}

      {companyExecutives.length > 0 && (
        <div className="company-executives-block">
          <div className="section-heading-row company-profile-heading">
            <div>
              <span className="home-feature-label">Leadership</span>
            </div>
          </div>
          <div className="company-executives-table-wrap">
            <table className="company-executives-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Title</th>
                  <th>Pay</th>
                  <th>Year Born</th>
                </tr>
              </thead>
              <tbody>
                {companyExecutives.map((executive, index) => (
                  <tr key={`${executive.name}-${index}`}>
                    <td>{executive.name}</td>
                    <td>{executive.title || "N/A"}</td>
                    <td>{isNumber(executive.pay) ? formatLargeDollars(executive.pay) : "N/A"}</td>
                    <td>{executive.yearBorn || "N/A"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )}

  <div className="grid" style={{ display: "none" }} aria-hidden="true">

  <div className="card">
    <div className="card-title">
      Market Cap
    </div>

    <div className="card-value">
{metricValue(formatBillions(stockData.marketCap))}
    </div>
  </div>

  <div className="card">
    <div className="card-title">
      Cash & Equivalents
    </div>

    <div className="card-value">
{balanceSheetValue(formatBillions(stockData.cashAndCashEquivalents ?? stockData.totalCash))}
    </div>
  </div>

  <div className="card">
    <div className="card-title">
      Total Debt
    </div>

    <div className="card-value">
{balanceSheetValue(formatBillions(stockData.totalDebt))}
    </div>
  </div>

  <div className="card">
    <div className="card-title">
      Net Cash
    </div>

    <div className="card-value">
{balanceSheetValue(formatBillions(stockData.netCash))}
    </div>
  </div>

  <div className="card">
    <div className="card-title">
      Net Cash / Share
    </div>

    <div className="card-value">
{balanceSheetValue(formatPrice(stockData.netCashPerShare))}
    </div>
  </div>

  <div className="card">
    <div className="card-title">
      Equity Book Value
    </div>

    <div className="card-value">
{balanceSheetValue(formatBillions(stockData.equityBookValue))}
    </div>
  </div>

  <div className="card">
    <div className="card-title">
      Book Value / Share
    </div>

    <div className="card-value">
{balanceSheetValue(formatPrice(stockData.bookValuePerShare))}
    </div>
  </div>

  <div className="card">
    <div className="card-title">
      Working Capital
    </div>

    <div className="card-value">
{balanceSheetValue(formatBillions(stockData.workingCapital))}
    </div>
  </div>

  <div className="card">
    <div className="card-title">
      TTM P/E
    </div>

    <div className="card-value">
      {metricValue(formatPlain(stockData.pe))}
    </div>
  </div>

  <div className="card">
    <div className="card-title">
      Forward P/E
    </div>

    <div className="card-value">
      {metricValue(formatPlain(stockData.forwardPE))}
    </div>
  </div>

  <div className="card">
    <div className="card-title">
      Forward P/S
    </div>

    <div className="card-value">
      {metricValue(formatPlain(stockData.forwardPS))}
    </div>
  </div>

  <div className="card">
    <div className="card-title">
      PEG Ratio TTM
    </div>

    <div className="card-value">
      {metricValue(formatPlain(stockData.pegRatio))}
    </div>
  </div>

  <div className="card">
    <div className="card-title">
      Price-to-Sales
    </div>

    <div className="card-value">
      {metricValue(formatPlain(stockData.priceToSales))}
    </div>
  </div>

  <div className="card">
    <div className="card-title">
      Price-to-Book
    </div>

    <div className="card-value">
      {metricValue(formatPlain(stockData.priceToBook))}
    </div>
  </div>

  <div className="card">
    <div className="card-title">
      P/TBV Ratio
    </div>

    <div className="card-value">
      {metricValue(formatPlain(stockData.priceToTangibleBook))}
    </div>
  </div>

  <div className="card">
    <div className="card-title">
      P/FCF Ratio
    </div>

    <div className="card-value">
      {metricValue(formatPlain(stockData.priceToFreeCashflow))}
    </div>
  </div>

  <div className="card">
    <div className="card-title">
      P/OCF Ratio
    </div>

    <div className="card-value">
      {metricValue(formatPlain(stockData.priceToOperatingCashflow))}
    </div>
  </div>

  <div className="card">
    <div className="card-title">
      Previous Year Revenue Growth
    </div>

    <div className="card-value">
{metricValue(formatPercent(stockData.revenueGrowth))}
    </div>
  </div>

  <div className="card">
    <div className="card-title">
      Previous Year Earnings Growth
    </div>

    <div className="card-value">
{metricValue(formatPercent(stockData.earningsGrowth))}
    </div>
  </div>

  <div className="card">
    <div className="card-title">
      Shares Outstanding
    </div>

    <div className="card-value">
{metricValue(stockData.sharesOutstanding
  ? `${(stockData.sharesOutstanding / 1000).toFixed(2)}B`
  : "N/A")}
    </div>
  </div>

  <div className="card">
    <div className="card-title">
      Employee Count
    </div>

    <div className="card-value">
{metricValue(formatSharesCount(stockData.employeeCount))}
    </div>
  </div>

  <div className="card">
    <div className="card-title">
      Revenue / Employee
    </div>

    <div className="card-value">
{metricValue(formatLargeDollars(stockData.revenuePerEmployee))}
    </div>
  </div>

  <div className="card">
    <div className="card-title">
      Profit / Employee
    </div>

    <div className="card-value">
{metricValue(formatLargeDollars(stockData.profitsPerEmployee))}
    </div>
  </div>

  <div className="card">
    <div className="card-title">
      {stockData.isFinancialCompany ? "Net Interest Revenue Mix" : "Gross Margin"}
    </div>

    <div className="card-value">
{metricValue(formatPercent(
  stockData.isFinancialCompany
    ? stockData.bankMetrics?.netInterestRevenueMix
    : stockData.grossMargins
))}
    </div>
  </div>

  <div className="card">
    <div className="card-title">
      {stockData.isFinancialCompany ? "Pre-Tax Margin" : "Operating Margin"}
    </div>

    <div className="card-value">
{metricValue(formatPercent(
  stockData.isFinancialCompany
    ? stockData.bankMetrics?.preTaxMargin
    : stockData.operatingMargins
))}
    </div>
  </div>

  <div className="card">
    <div className="card-title">
      Profit Margin
    </div>

    <div className="card-value">
{metricValue(formatPercent(stockData.profitMargins))}
    </div>
  </div>

  <div className="card">
    <div className="card-title">
      Pretax Margin
    </div>

    <div className="card-value">
{metricValue(formatPercent(stockData.pretaxMargin))}
    </div>
  </div>

  <div className="card">
    <div className="card-title">
      EBITDA Margin
    </div>

    <div className="card-value">
{metricValue(formatPercent(stockData.ebitdaMargin))}
    </div>
  </div>

  <div className="card">
    <div className="card-title">
      EBIT Margin
    </div>

    <div className="card-value">
{metricValue(formatPercent(stockData.ebitMargin))}
    </div>
  </div>

  <div className="card">
    <div className="card-title">
      FCF Margin
    </div>

    <div className="card-value">
{metricValue(formatPercent(stockData.fcfMargin))}
    </div>
  </div>

  <div className="card">
    <div className="card-title">
      ROE
    </div>

    <div className="card-value">
{metricValue(formatPercent(stockData.returnOnEquity))}
    </div>
  </div>

  <div className="card">
    <div className="card-title">
      ROA
    </div>

    <div className="card-value">
{metricValue(formatPercent(stockData.returnOnAssets))}
    </div>
  </div>

  <div className="card">
    <div className="card-title">
      ROIC
    </div>

    <div className="card-value">
{metricValue(formatPercent(stockData.returnOnInvestedCapital))}
    </div>
  </div>

  <div className="card">
    <div className="card-title">
      ROCE
    </div>

    <div className="card-value">
{metricValue(formatPercent(stockData.returnOnCapitalEmployed))}
    </div>
  </div>

  <div className="card">
    <div className="card-title">
      WACC
    </div>

    <div className="card-value">
{metricValue(formatPercent(stockData.weightedAverageCostOfCapital))}
    </div>
  </div>

  <div className="card">
    <div className="card-title">
      {stockData.isFinancialCompany ? "Annual Cash Change" : "Free Cash Flow"}
    </div>

    <div className="card-value">
{metricValue(formatBillions(
  stockData.isFinancialCompany
    ? stockData.bankMetrics?.annualCashChange
    : latestFreeCashflowMetricValue
))}
    </div>
  </div>

  {!stockData.isFinancialCompany && (
  <div className="card">
    <div className="card-title">
      Operating Cash Flow
    </div>

    <div className="card-value">
{metricValue(formatBillions(latestOperatingCashflowMetricValue))}
    </div>
  </div>
  )}

  <div className="card">
    <div className="card-title">
      Price Target
    </div>

    <div className="card-value">
{metricValue(formatPrice(stockData.targetMean))}
    </div>
  </div>

  <div className="card">
    <div className="card-title">
      Analyst Rating
    </div>

    <div className="card-value">
      {metricValue(stockData.analystRatingText || stockData.recommendationKey || "N/A")}
    </div>
  </div>

  <div className="card metric-range-card">
    <div className="card-title">
      52-Week Range
    </div>

    <div className="card-value card-range-value">
{isNumber(stockData.fiftyTwoWeekLow) && isNumber(stockData.fiftyTwoWeekHigh) ? (
  <>
    <span>{formatPrice(stockData.fiftyTwoWeekLow)}</span>
    <span className="card-range-divider">to</span>
    <span>{formatPrice(stockData.fiftyTwoWeekHigh)}</span>
  </>
) : (
  metricValue("N/A")
)}
    </div>
  </div>

</div>
{/* Analyst Estimates */}

<section className="analyst-estimates-panel section-anchor" id="analyst-estimates">
  <div className="analyst-estimates-header">
    <span>Forward Model</span>
    <h2>Analyst Estimates</h2>
  </div>

  <div className="estimate-card-grid">
    {estimateYearCards.map((estimate) => (
      <article
        className={`estimate-year-card ${estimate.isActual ? "estimate-year-card-actual" : ""}`}
        key={`${estimate.isActual ? "actual" : "estimate"}-${estimate.fiscalYear || estimate.label}`}
      >
        <div className="estimate-year-card-header">
          <h3>{estimate.label || `${estimate.fiscalYear} Fiscal Year`}</h3>
          {estimate.isActual ? (
            <span>Reported</span>
          ) : (
            <span>
              {[
                isNumber(estimate.numAnalystsRevenue) ? `${estimate.numAnalystsRevenue} rev` : null,
                isNumber(estimate.numAnalystsEps) ? `${estimate.numAnalystsEps} EPS` : null
              ].filter(Boolean).join(" / ") || "Estimate"}
            </span>
          )}
        </div>

        <div className="estimate-year-card-rows">
          {estimateMetricConfig.map((metric) => (
            <div className="estimate-year-row" key={`${estimate.fiscalYear}-${metric.key}`}>
              <span>{metric.label}</span>
              <strong>{estimateValue(metric.format(estimate[metric.key]))}</strong>
            </div>
          ))}
        </div>
      </article>
    ))}

    <article className="estimate-year-card estimate-quarter-card">
      <div className="estimate-year-card-header">
        <h3>Next Quarter</h3>
        <span>{nextQuarterEstimate?.fiscalQuarter || "Upcoming"}</span>
      </div>
      <div className="estimate-year-card-rows">
        <div className="estimate-year-row">
          <span>Revenue</span>
          <strong>{nextQuarterValue(formatEstimateMoney(nextQuarterEstimate?.revenue))}</strong>
        </div>
        <div className="estimate-year-row">
          <span>EPS</span>
          <strong>{nextQuarterValue(formatEstimateEps(nextQuarterEstimate?.eps))}</strong>
        </div>
        <div className="estimate-year-row">
          <span>Report</span>
          <strong>{nextQuarterValue(nextQuarterDateLabel || nextQuarterEstimate?.fiscalQuarter || "N/A")}</strong>
        </div>
      </div>
    </article>
  </div>

  <div className="estimate-growth-matrix">
    {estimateGrowthRows.map((row) => (
      <div className="estimate-growth-row" key={row.key}>
        <div className="estimate-growth-row-label">{row.label}</div>
        <div className="estimate-growth-row-cells">
          {row.cells.map((growth) => (
            <div className="estimate-growth-card" key={growth.key}>
              <span className="estimate-growth-label">{growth.year}</span>
              <strong className={!isNumber(growth.value) ? "estimate-growth-unavailable" : growth.value >= 0 ? "estimate-growth-positive" : "estimate-growth-negative"}>
                {estimateValue(formatPercent(growth.value))}
              </strong>
              <span className="estimate-growth-period">{growth.period}</span>
            </div>
          ))}
        </div>
      </div>
    ))}
  </div>

  <div className="market-intel-grid">
    <DataMiniTable
      title="Analyst Updates"
      subtitle="Latest firm actions from available market sources"
      emptyText="No recent analyst rows found yet."
      loading={isAnalystUpdatesLoading}
      rows={analystUpdateRows}
      columns={[
        { key: "firm", label: "Institution" },
        { key: "latestRating", label: "Latest Rating" },
        {
          key: "priceTarget",
          label: "Price Target",
          render: (row) => formatPrice(row.priceTarget)
        },
        {
          key: "date",
          label: "Date",
          render: (row) => row.date || "N/A"
        }
      ]}
    />

    <DataMiniTable
      title="Insider Tracker"
      subtitle="Latest insider moves"
      emptyText="No recent insider rows found yet."
      loading={isInsiderMovesLoading}
      rows={insiderMoveRows}
      columns={[
        { key: "filerName", label: "Insider" },
        { key: "transaction", label: "Action" },
        {
          key: "shares",
          label: "Shares",
          render: (row) => formatSharesCount(row.shares)
        },
        {
          key: "date",
          label: "Date",
          render: (row) => row.date || "N/A"
        }
      ]}
    />
  </div>

  {revenueSegmentPanels.length ? (
    <div className="revenue-segments-section section-anchor" id="revenue-segments">
      <div className="revenue-segments-header">
        <div>
          <span className="similar-companies-kicker">Revenue Segments</span>
          <h2 className="section-title">Revenue Mix</h2>
        </div>
        <span className="revenue-segments-context">Latest annual segment data</span>
      </div>

      <div className="revenue-segments-grid">
        {revenueSegmentPanels.map((panel) => (
          <article className="revenue-segment-card" key={panel.title}>
            <div className="revenue-segment-card-heading">
              <div>
                <h3>{panel.title}</h3>
                <span>
                  {[
                    panel.fiscalYear ? `FY ${panel.fiscalYear}` : null,
                    panel.currency || null
                  ].filter(Boolean).join(" • ") || "Latest annual"}
                </span>
              </div>
              <strong>{formatLargeDollars(panel.total)}</strong>
            </div>

            <div className="revenue-segment-body">
              <div className="revenue-segment-chart" aria-label={`${panel.title} chart`}>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={panel.segments}
                      dataKey="value"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      innerRadius={58}
                      outerRadius={92}
                      paddingAngle={2}
                      stroke="none"
                      isAnimationActive={false}
                      animationDuration={0}
                    >
                      {panel.segments.map((segment, index) => (
                        <Cell
                          key={`${panel.title}-${segment.label}`}
                          fill={PORTFOLIO_COLORS[index % PORTFOLIO_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value, name) => [formatLargeDollars(Number(value)), name]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="revenue-segment-legend">
                {panel.segments.map((segment, index) => (
                  <div className="revenue-segment-row" key={`${panel.title}-${segment.label}`}>
                    <span
                      className="allocation-swatch"
                      style={{ background: PORTFOLIO_COLORS[index % PORTFOLIO_COLORS.length] }}
                    />
                    <strong>{segment.label}</strong>
                    <span>{`${((segment.value / panel.total) * 100).toFixed(1)}%`}</span>
                    <em>{formatLargeDollars(segment.value)}</em>
                  </div>
                ))}
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  ) : null}

</section>

{/* SIMILAR COMPANIES */}

<section className="similar-companies-section section-anchor" id="similar-companies">
  <div className="similar-companies-header">
    <div>
      <span className="similar-companies-kicker">Industry Peers</span>
      <h2 className="section-title">Similar Companies</h2>
    </div>
    {similarCompanies[0]?.industry && (
      <span className="similar-companies-context">
        {similarCompanies[0].industry}
      </span>
    )}
  </div>

  {isSimilarCompaniesLoading && !similarCompanies.length ? (
    <StockDataLoading label="Loading similar companies..." />
  ) : similarCompanies.length ? (
    <div className="similar-company-grid">
      {similarCompanies.map((company) => (
        <button
          key={company.symbol}
          type="button"
          className="similar-company-card"
          onClick={() => {
            setSearchInput(company.symbol);
            setTicker(company.symbol);
            setActivePage("overview");
          }}
        >
          <span className="similar-company-symbol">
            {company.symbol}
          </span>
          <strong>
            {company.name || company.symbol}
          </strong>
          <div className="similar-company-meta">
            {[company.sector, company.industry].filter(Boolean).join(" • ")}
          </div>
          <div className="similar-company-stats">
            <span>{formatPrice(company.price)}</span>
            <span className={isNumber(company.percentChange) ? company.percentChange >= 0 ? "positive" : "negative" : ""}>
              {formatPercent(company.percentChange)}
            </span>
            <span>
              {isNumber(company.forwardPE) ? `${company.forwardPE.toFixed(1)}x Fwd P/E` : "Fwd P/E N/A"}
            </span>
          </div>
        </button>
      ))}
    </div>
  ) : (
    <div className="similar-companies-empty">
      Similar companies are not available for this ticker yet.
    </div>
  )}
</section>

{/* COMPANY DOCUMENTS */}

<section className="chart-section company-documents-section" id="company-documents">

  <div className="company-documents-heading">
    <div>
      <h2 className="section-title">
        Company Documents
      </h2>
    </div>
    {companyDocuments?.updatedAt && (
      <span className="company-documents-updated">
        Updated {new Date(companyDocuments.updatedAt).toLocaleString()}
      </span>
    )}
  </div>

  <div className="company-documents-panel">
    <div className="company-document-tabs" role="tablist" aria-label="Company documents">
      {COMPANY_DOCUMENT_TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={activeCompanyDocumentTab === tab.id ? "active" : ""}
          onClick={() => setActiveCompanyDocumentTab(tab.id)}
        >
          {tab.label}
          {companyDocuments?.filingCounts?.[tab.id] ? (
            <span>{companyDocuments.filingCounts[tab.id]}</span>
          ) : null}
        </button>
      ))}
    </div>

    {companyDocuments?.allSecFilings?.length ? (
      <div className="company-documents-summary">
        <strong>{companyDocuments.allSecFilings.length}</strong>
        <span>recent SEC filings organized from EDGAR for {companyDocuments.companyName || ticker}</span>
      </div>
    ) : null}

    {isCompanyDocumentsLoading && !companyDocuments || (!companyDocuments && stockData?.refreshing) ? (
      <StockDataLoading label="Loading company documents..." />
    ) : !companyDocuments?.available ? (
      <div className="company-documents-empty">
        Company documents are not available for this ticker yet.
      </div>
    ) : activeCompanyDocumentCards.length ? (
      <div className="company-document-grid">
        {activeCompanyDocumentCards.map((document) => (
          <a
            className={`company-document-card ${
              activeCompanyDocumentTab === "results" || activeCompanyDocumentTab === "exhibits"
                ? "earnings-release-card"
                : ""
            }`}
            key={`${document.form || document.type || "document"}-${document.url}`}
            href={document.url || document.indexUrl}
            target="_blank"
            rel="noreferrer"
          >
            <span>{document.form || document.type || document.source || "Document"}</span>
            <strong>{document.title}</strong>
            <small>
              {[document.categoryLabel, document.reportDate ? `Report ${document.reportDate}` : null, document.filingDate ? `Filed ${document.filingDate}` : null, document.items ? `Items ${document.items}` : null, document.source]
                .filter(Boolean)
                .join(" • ")}
            </small>
          </a>
        ))}
      </div>
    ) : (
      <div className="company-documents-empty">
        No matching company documents are available for this ticker yet.
      </div>
    )}
  </div>

</section>

<section className="stock-news-section section-anchor" id="stock-news">
  <div className="similar-companies-header">
    <div>
      <span className="similar-companies-kicker">Stock News</span>
      <h2 className="section-title">{ticker} News</h2>
    </div>
    {stockNews?.updatedAt && (
      <span className="similar-companies-context">
        Updated {new Date(stockNews.updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
      </span>
    )}
  </div>

  {isStockNewsLoading && !stockNews?.articles?.length ? (
    <StockDataLoading label="Loading stock news..." />
  ) : stockNews?.articles?.length ? (
    <div className="news-card-grid stock-news-grid">
      {stockNews.articles.map((article) => (
        <a
          className="news-card"
          key={article.id || article.url}
          href={article.url}
          target="_blank"
          rel="noreferrer"
        >
          {article.image && <img src={article.image} alt="" loading="lazy" />}
          <span className="news-card-source">
            {article.publisher || article.site || "News Source"}
            {article.symbol ? ` · ${article.symbol}` : ""}
          </span>
          <strong>{article.title}</strong>
          {article.text && <p>{article.text}</p>}
          <small>{formatNewsDate(article.publishedDate)}</small>
        </a>
      ))}
    </div>
  ) : (
    <div className="similar-companies-empty">
      No recent stock news is available for this ticker yet.
    </div>
  )}
</section>

    </>
    )}

{/* STOCK PROJECTIONS */}

{activePage === "projections" && (
<>
<div className="financial-statement-hero projections-page-hero">
  <div>
    <span className="home-feature-label">Scenario Model</span>
    <h2 id="projections-page-title">Projections</h2>
    <p>
      Build bear, base, and bull cases with editable growth, margin, valuation, and return
      assumptions for the company you are researching.
    </p>
  </div>
  <span className="market-overview-updated">Editable cases</span>
</div>

<form className="topbar page-searchbar" onSubmit={(event) => handleStockSearchSubmit(event, "projections")}>
  <div className="stock-search-field">
  <input
    className="search"
    value={searchInput}
    onChange={(event) => {
      setSearchInput(event.target.value);
      setShowStockSearchSuggestions(true);
    }}
    onFocus={() => {
      if (stockSearchBlurTimerRef.current) {
        window.clearTimeout(stockSearchBlurTimerRef.current);
        stockSearchBlurTimerRef.current = null;
      }
      setShowStockSearchSuggestions(true);
    }}
    onBlur={() => {
      stockSearchBlurTimerRef.current = window.setTimeout(() => {
        setShowStockSearchSuggestions(false);
      }, 140);
    }}
    placeholder="Search ticker or company for projections..."
    autoComplete="off"
  />
  {renderStockSearchSuggestions("projections")}
  </div>
  <button className="stock-search-button" type="submit">
    Search
  </button>
  {isStockLoading && (
    <span className="page-search-loading">Loading...</span>
  )}
</form>

<section className="projections-section section-anchor" id="projections">
  <div className="projections-header">
    <div>
      <span className="projections-kicker">Scenario Model</span>
      <h2 className="section-title">Stock Projections</h2>
    </div>
    <div className="projections-company">
      {(stockData.logo || stockData.symbol || ticker) && (
        <img
          src={getDisplayCompanyLogoUrl(stockData.symbol || ticker, stockData.logo)}
          data-provider-logo={stockData.logo || ""}
          alt={`${stockData.symbol || ticker} logo`}
          crossOrigin="anonymous"
          onLoad={(event) => handleCompanyLogoLoad(event)}
          onError={(event) => handleCompanyLogoError(event, stockData.symbol || ticker)}
        />
      )}
      <div>
        <strong>{stockData.symbol || ticker}</strong>
        <span>{stockValue(formatPrice(stockData.price))}</span>
      </div>
    </div>
  </div>

  <div className="projection-save-note">Saved automatically for {projectionSymbol || "this stock"}.</div>

  <div className="projection-case-stack">
    {projectionCases.map((projectionCase) => (
      <div className={`projection-case projection-case-${projectionCase.id}`} key={projectionCase.id}>
        <h3>{projectionCase.label}</h3>
        <div className="projections-table-wrap">
          <table className="projections-table">
            <thead>
              <tr>
                <th>Metric</th>
                {projectionCase.rows.map((row) => (
                  <th key={row.year}>{row.year}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th>Revenue</th>
                {projectionCase.rows.map((row) => (
                  <td key={row.year}>
                    {row.year === PROJECTION_YEARS[0] ? (
                      <input
                        value={getProjectionInputValue(projectionCase.id, "revenue", row.year)}
                        onChange={(event) => updateProjectionSetting(projectionCase.id, "revenue", row.year, event.target.value)}
                        placeholder={formatProjectionMoney(row.revenue)}
                        inputMode="decimal"
                        title="Enter dollars in millions, like 1 for $1M or 1000 for $1B. You can also use 1M or 1B."
                        aria-label={`${projectionCase.label} ${row.year} revenue`}
                      />
                    ) : (
                      estimateValue(formatEstimateMoney(row.revenue))
                    )}
                  </td>
                ))}
              </tr>
              <tr className="projection-assumption-row">
                <th>Revenue Growth</th>
                {projectionCase.rows.map((row) => (
                  <td key={row.year}>
                    {row.year === PROJECTION_YEARS[0] ? (
                      <input
                        value={getProjectionInputValue(projectionCase.id, "revenueGrowth", row.year)}
                        onChange={(event) => updateProjectionSetting(projectionCase.id, "revenueGrowth", row.year, event.target.value)}
                        placeholder={isNumber(row.revenueGrowth) ? row.revenueGrowth.toFixed(2) : "N/A"}
                        inputMode="decimal"
                        aria-label={`${projectionCase.label} ${row.year} revenue growth`}
                      />
                    ) : (
                      <input
                        value={getProjectionInputValue(projectionCase.id, "revenueGrowth", row.year)}
                        onChange={(event) => updateProjectionSetting(projectionCase.id, "revenueGrowth", row.year, event.target.value)}
                        inputMode="decimal"
                        aria-label={`${projectionCase.label} ${row.year} revenue growth`}
                      />
                    )}
                  </td>
                ))}
              </tr>
              <tr>
                <th>Net Income</th>
                {projectionCase.rows.map((row) => (
                  <td key={row.year}>
                    {row.year === PROJECTION_YEARS[0] ? (
                      <input
                        value={getProjectionInputValue(projectionCase.id, "netIncome", row.year)}
                        onChange={(event) => updateProjectionSetting(projectionCase.id, "netIncome", row.year, event.target.value)}
                        placeholder={formatProjectionMoney(row.netIncome)}
                        inputMode="decimal"
                        title="Enter dollars in millions, like 1 for $1M or 1000 for $1B. You can also use 1M or 1B."
                        aria-label={`${projectionCase.label} ${row.year} net income`}
                      />
                    ) : (
                      estimateValue(formatEstimateMoney(row.netIncome))
                    )}
                  </td>
                ))}
              </tr>
              <tr className="projection-assumption-row">
                <th>NI Growth</th>
                {projectionCase.rows.map((row) => (
                  <td key={row.year}>
                    <input
                      value={getProjectionInputValue(projectionCase.id, "netIncomeGrowth", row.year)}
                      onChange={(event) => updateProjectionSetting(projectionCase.id, "netIncomeGrowth", row.year, event.target.value)}
                      placeholder={isNumber(row.netIncomeGrowth) ? row.netIncomeGrowth.toFixed(2) : "N/A"}
                      inputMode="decimal"
                      aria-label={`${projectionCase.label} ${row.year} net income growth`}
                    />
                  </td>
                ))}
              </tr>
              <tr className="projection-assumption-row">
                <th>NI Margin</th>
                {projectionCase.rows.map((row) => (
                  <td key={row.year}>{estimateValue(formatPercent(row.netIncomeMargin))}</td>
                ))}
              </tr>
              <tr>
                <th>Weighted Avg Shares</th>
                {projectionCase.rows.map((row) => (
                  <td key={row.year}>
                    {row.year === PROJECTION_YEARS[0] ? (
                      <input
                        value={getProjectionInputValue(projectionCase.id, "shares", row.year)}
                        onChange={(event) => updateProjectionSetting(projectionCase.id, "shares", row.year, event.target.value)}
                        placeholder={formatProjectionShares(row.shares)}
                        inputMode="decimal"
                        title="Enter shares in millions, like 402, or use 402M / 402000000."
                        aria-label={`${projectionCase.label} ${row.year} shares outstanding`}
                      />
                    ) : (
                      isNumber(row.shares)
                        ? formatProjectionShares(row.shares)
                        : estimateValue("N/A")
                    )}
                  </td>
                ))}
              </tr>
              <tr className="projection-assumption-row">
                <th>Shares Growth</th>
                {projectionCase.rows.map((row) => (
                  <td key={row.year}>
                    {row.year === PROJECTION_YEARS[0] ? (
                      <input
                        value={getProjectionInputValue(projectionCase.id, "sharesGrowth", row.year)}
                        onChange={(event) => updateProjectionSetting(projectionCase.id, "sharesGrowth", row.year, event.target.value)}
                        placeholder={isNumber(row.sharesGrowth) ? row.sharesGrowth.toFixed(2) : "0"}
                        inputMode="decimal"
                        aria-label={`${projectionCase.label} ${row.year} shares growth`}
                      />
                    ) : (
                      <input
                        value={getProjectionInputValue(projectionCase.id, "sharesGrowth", row.year)}
                        onChange={(event) => updateProjectionSetting(projectionCase.id, "sharesGrowth", row.year, event.target.value)}
                        inputMode="decimal"
                        aria-label={`${projectionCase.label} ${row.year} shares growth`}
                      />
                    )}
                  </td>
                ))}
              </tr>
              <tr>
                <th>EPS</th>
                {projectionCase.rows.map((row) => (
                  <td key={row.year}>{estimateValue(formatEstimateEps(row.eps))}</td>
                ))}
              </tr>
              <tr className="projection-input-row">
                <th>Low P/E</th>
                {projectionCase.rows.map((row) => (
                  <td key={row.year}>
                    <input
                      value={getProjectionInputValue(projectionCase.id, "lowPe", row.year)}
                      onChange={(event) => updateProjectionSetting(projectionCase.id, "lowPe", row.year, event.target.value)}
                      inputMode="decimal"
                      aria-label={`${projectionCase.label} ${row.year} low PE`}
                    />
                  </td>
                ))}
              </tr>
              <tr className="projection-input-row">
                <th>High P/E</th>
                {projectionCase.rows.map((row) => (
                  <td key={row.year}>
                    <input
                      value={getProjectionInputValue(projectionCase.id, "highPe", row.year)}
                      onChange={(event) => updateProjectionSetting(projectionCase.id, "highPe", row.year, event.target.value)}
                      inputMode="decimal"
                      aria-label={`${projectionCase.label} ${row.year} high PE`}
                    />
                  </td>
                ))}
              </tr>
              <tr className="projection-output-row">
                <th>Low Price</th>
                {projectionCase.rows.map((row) => (
                  <td key={row.year}>{estimateValue(formatPrice(row.lowPrice))}</td>
                ))}
              </tr>
              <tr className="projection-output-row">
                <th>High Price</th>
                {projectionCase.rows.map((row) => (
                  <td key={row.year}>{estimateValue(formatPrice(row.highPrice))}</td>
                ))}
              </tr>
              <tr className="projection-output-row">
                <th>Low Return</th>
                {projectionCase.rows.map((row) => (
                  <td key={row.year}>{estimateValue(formatPercent(row.lowReturn))}</td>
                ))}
              </tr>
              <tr className="projection-output-row">
                <th>High Return</th>
                {projectionCase.rows.map((row) => (
                  <td key={row.year}>{estimateValue(formatPercent(row.highReturn))}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        <div className="projection-cagr-grid">
          <div>
            <span>Low CAGR</span>
            <strong>{estimateValue(formatPercent(projectionCase.lowCagr))}</strong>
          </div>
          <div>
            <span>High CAGR</span>
            <strong>{estimateValue(formatPercent(projectionCase.highCagr))}</strong>
          </div>
        </div>
      </div>
    ))}
  </div>
</section>
    </>
    )}

{activePage === "comparison" && comparisonSection}

{/* PORTFOLIO TRACKER */}

{activePage === "portfolio" && (
<>
<div className="financial-statement-hero portfolio-hero">
  <div>
    <span className="home-feature-label">Portfolio Control Room</span>
    <h2>Portfolio</h2>
    <p>Track positions, value, profit and loss, allocation, country exposure, and industry mix from one portfolio workspace.</p>
  </div>
  <span className="market-overview-updated">
    {portfolio.length} positions
  </span>
</div>

<div className="portfolio-section" id="portfolio">

  <div className="portfolio-heading-row">
    <h2 className="section-title">
      Portfolio Tracker
    </h2>
    <form
      className="portfolio-create"
      onSubmit={(event) => {
        event.preventDefault();
        if (!requireAuth("Log in or sign up to create and save portfolios.")) {
          return;
        }
        const name = newPortfolioName.trim();
        if (!name || portfolios.length >= 20) return;
        const id = globalThis.crypto?.randomUUID?.() || `portfolio-${Date.now()}`;
        setPortfolios((items) => [...items, { id, name, cash: 0, positions: [] }]);
        setActivePortfolioId(id);
        setNewPortfolioName("");
      }}
    >
      <input
        value={newPortfolioName}
        onFocus={(event) => {
          if (!user) {
            event.currentTarget.blur();
            requireAuth("Log in or sign up to create and save portfolios.");
          }
        }}
        onChange={(event) => setNewPortfolioName(event.target.value)}
        placeholder="New portfolio name"
        maxLength={60}
      />
      <button type="submit" disabled={!newPortfolioName.trim() || portfolios.length >= 20}>
        Create
      </button>
    </form>
  </div>

  <div className="portfolio-tabs" role="tablist" aria-label="Portfolios">
    {portfolios.map((item) => (
      <button
        key={item.id}
        type="button"
        role="tab"
        aria-selected={item.id === activePortfolio.id}
        className={item.id === activePortfolio.id ? "active" : ""}
        onClick={() => setActivePortfolioId(item.id)}
      >
        {item.name}
      </button>
    ))}
  </div>

  <div className="portfolio-active-controls">
    <label>
      Portfolio name
      <input
        value={activePortfolio.name}
        maxLength={60}
        onChange={(event) => setPortfolios((items) => items.map((item) =>
          item.id === activePortfolio.id
            ? { ...item, name: event.target.value }
            : item
        ))}
      />
    </label>
    <button
      type="button"
      className="portfolio-delete"
      onClick={() => {
        const isOnlyPortfolio = portfolios.length <= 1;
        const message = isOnlyPortfolio
          ? `Clear ${activePortfolio.name} and reset this portfolio?`
          : `Delete ${activePortfolio.name} and all of its positions?`;
        if (!window.confirm(message)) return;
        if (isOnlyPortfolio) {
          const resetPortfolio = { ...DEFAULT_PORTFOLIO, cash: 0, positions: [] };
          setPortfolios([resetPortfolio]);
          setActivePortfolioId(resetPortfolio.id);
          return;
        }
        const targetId = activePortfolio.id || activePortfolioId;
        const remaining = portfolios.filter((item) => item.id !== targetId);
        const nextPortfolios = remaining.length === portfolios.length
          ? portfolios.filter((item) => item.id !== activePortfolioId)
          : remaining;
        if (!nextPortfolios.length) {
          const resetPortfolio = { ...DEFAULT_PORTFOLIO, cash: 0, positions: [] };
          setPortfolios([resetPortfolio]);
          setActivePortfolioId(resetPortfolio.id);
          return;
        }
        setPortfolios(nextPortfolios);
        setActivePortfolioId(nextPortfolios[0].id);
      }}
    >
      Delete Portfolio
    </button>
  </div>

<div className="portfolio-add">

  <input
    className="portfolio-input"
    placeholder="Ticker"
    value={portfolioTicker}
    onFocus={(event) => {
      if (!user) {
        event.currentTarget.blur();
        requireAuth("Log in or sign up to add stocks to your portfolio.");
      }
    }}
    onChange={(e) =>
      setPortfolioTicker(
        e.target.value.toUpperCase()
      )
    }
  />

  <input
    className="portfolio-input"
    placeholder="Shares"
    value={portfolioShares}
    onFocus={(event) => {
      if (!user) {
        event.currentTarget.blur();
        requireAuth("Log in or sign up to add stocks to your portfolio.");
      }
    }}
    onChange={(e) =>
      setPortfolioShares(
        e.target.value
      )
    }
  />

  <input
    className="portfolio-input"
    placeholder="Avg Cost"
    value={portfolioCost}
    onFocus={(event) => {
      if (!user) {
        event.currentTarget.blur();
        requireAuth("Log in or sign up to add stocks to your portfolio.");
      }
    }}
    onChange={(e) =>
      setPortfolioCost(
        e.target.value
      )
    }
  />

  <button
  className="portfolio-btn"
  onClick={async () => {
    if (!requireAuth("Log in or sign up to add stocks to your portfolio.")) {
      return;
    }

    const shares = Number(portfolioShares);
    const avgCost = Number(portfolioCost);
    const symbol = String(portfolioTicker || "").trim().toUpperCase();
    if (warnStockOnlySymbol(symbol)) return;
    if (
      symbol &&
      Number.isFinite(shares) && shares > 0 &&
      Number.isFinite(avgCost) && avgCost >= 0
    ) {

      await loadPortfolioPrice(
        symbol
      );

      const newPosition = {
        id: globalThis.crypto?.randomUUID?.() || `position-${Date.now()}`,
        symbol,
        shares,
        avgCost,
      };

      setPortfolio((prev) => [
        ...prev,
        newPosition,
      ]);

      setPortfolioTicker("");
      setPortfolioShares("");
      setPortfolioCost("");
    }
  }}
>
  Add
</button>

</div>
  <div className="portfolio-table">

    <div className="portfolio-header">

      <span>Ticker</span>
      <span>Shares</span>
      <span>Avg Cost</span>
      <span>Current</span>
      <span>Value</span>
      <span>P/L</span>
      <span>Actions</span>

    </div>


{portfolio.map((position, positionIndex) => {

  const current =
    portfolioPrices[position.symbol] || 0;

  const value =
    current * position.shares;

  const cost =
    position.avgCost * position.shares;

  const profit =
    value - cost;

  const profitPercent =
    cost > 0 ? (profit / cost) * 100 : 0;

  return (

    <div
      key={position.id || `${position.symbol}-${positionIndex}`}
      className="portfolio-row"
    >

      <span className="portfolio-company">
        <span className={`portfolio-logo-shell${(position.symbol || savedSymbolDetails[position.symbol]?.logo) ? " has-logo" : ""}`} aria-hidden="true">
          <span className="portfolio-logo-fallback">
            {position.symbol.slice(0, 1)}
          </span>
          {(position.symbol || savedSymbolDetails[position.symbol]?.logo) && (
            <img
              className="portfolio-logo"
              src={getDisplayCompanyLogoUrl(position.symbol, savedSymbolDetails[position.symbol]?.logo)}
              data-provider-logo={savedSymbolDetails[position.symbol]?.logo || ""}
              alt=""
              crossOrigin="anonymous"
              onLoad={(event) => handleCompanyLogoLoad(event)}
              onError={(event) =>
                handleCompanyLogoError(event, position.symbol)
              }
            />
          )}
        </span>
        <strong>{position.symbol}</strong>
      </span>

      <span>
        <input
          className="portfolio-edit-input"
          type="number"
          min="0"
          step="any"
          value={position.shares}
          aria-label={`${position.symbol} shares`}
          onChange={(event) =>
            updatePortfolioPosition(positionIndex, "shares", event.target.value)
          }
        />
      </span>

      <span>
        <input
          className="portfolio-edit-input"
          type="number"
          min="0"
          step="any"
          value={position.avgCost}
          aria-label={`${position.symbol} average cost`}
          onChange={(event) =>
            updatePortfolioPosition(positionIndex, "avgCost", event.target.value)
          }
        />
      </span>

      <span>{formatPortfolioCurrency(current)}</span>

      <span>{formatPortfolioCurrency(value)}</span>

      <span
        className={`portfolio-return ${
          profit >= 0
            ? "green"
            : "red"
        }`}
      >
        <strong>{formatPortfolioCurrency(profit)}</strong>
        <small>
          {profitPercent >= 0 ? "+" : ""}{profitPercent.toFixed(2)}%
        </small>
      </span>

      <button
  className="remove-position"
  onClick={() => {
    removePortfolioPosition(position.id, positionIndex);

  }}
>
  Remove
</button>

    </div>

  );
})}

    <div className="portfolio-row portfolio-cash-row">
      <span className="portfolio-company">
        <span className="portfolio-cash-logo" aria-hidden="true">$</span>
        <strong>Cash</strong>
      </span>
      <span className="portfolio-muted-cell">-</span>
      <span className="portfolio-muted-cell">-</span>
      <span className="portfolio-muted-cell">Cash balance</span>
      <span>{formatPortfolioCurrency(portfolioCash)}</span>
      <span className="portfolio-return neutral">
        <strong>Excluded</strong>
        <small>from performance</small>
      </span>
      <span>
        <input
          className="portfolio-edit-input portfolio-cash-input"
          type="number"
          min="0"
          step="any"
          value={portfolioCash}
          aria-label="Portfolio cash"
          onChange={(event) => updateActivePortfolioCash(event.target.value)}
        />
      </span>
    </div>

    <div className="portfolio-summary-strip">
      <div>
        <span>Total Portfolio Value</span>
        <strong>{formatPortfolioCurrency(totalPortfolioValue)}</strong>
      </div>
      <div>
        <span>Total Portfolio Performance</span>
        <strong className={totalPortfolioProfit >= 0 ? "green" : "red"}>
          {totalPortfolioPerformance === null
            ? "N/A"
            : `${totalPortfolioPerformance >= 0 ? "+" : ""}${totalPortfolioPerformance.toFixed(2)}%`}
        </strong>
        <small>{formatPortfolioCurrency(totalPortfolioProfit)} on stock positions</small>
      </div>
    </div>

  </div>
</div>

{/* PORTFOLIO PERFORMANCE */}

<div className="chart-section portfolio-performance-section">

  <h2 className="section-title">
    {activePortfolio.name} Performance
  </h2>

  <div className="portfolio-visual-grid">
    <div className="portfolio-visual-panel">
      <h3>Portfolio Allocation</h3>
      {portfolioAllocationData.length ? (
        <>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={portfolioAllocationData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={62}
                outerRadius={108}
                paddingAngle={2}
                stroke="none"
                isAnimationActive
                animationBegin={0}
                animationDuration={260}
                animationEasing="ease-out"
              >
                {portfolioAllocationData.map((position, index) => (
                  <Cell
                    key={position.key}
                    fill={PORTFOLIO_COLORS[index % PORTFOLIO_COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip formatter={(value) => formatPortfolioCurrency(Number(value))} />
            </PieChart>
          </ResponsiveContainer>
          <div className="allocation-legend">
            {portfolioAllocationData.map((position, index) => (
              <div className="allocation-legend-row" key={position.key}>
                <span
                  className="allocation-swatch"
                  style={{ background: PORTFOLIO_COLORS[index % PORTFOLIO_COLORS.length] }}
                />
                <strong>{position.name}</strong>
                <span>
                  {totalPortfolioValue > 0
                    ? `${((position.value / totalPortfolioValue) * 100).toFixed(1)}%`
                    : "0.0%"}
                </span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="portfolio-visual-empty">Add a position to see portfolio allocation.</div>
      )}
    </div>

    <div className="portfolio-visual-panel">
      <h3>Gain / Loss by Position</h3>
      {portfolio.length ? (
        <ResponsiveContainer width="100%" height={400}>
          <BarChart
            data={portfolio.map((position) => {
              const current = portfolioPrices[position.symbol] || 0;
              const value = current * position.shares;
              const cost = position.avgCost * position.shares;
              return {
                symbol: position.symbol,
                gain: Number((value - cost).toFixed(2))
              };
            })}
          >
            <CartesianGrid stroke="#1f2937" />
            <XAxis dataKey="symbol" />
            <YAxis />
            <Tooltip
              formatter={(value) => {
                const numericValue = Number(value);
                return [
                  formatPortfolioCurrency(numericValue),
                  numericValue >= 0 ? "Gain" : "Loss"
                ];
              }}
            />
            <Bar dataKey="gain" radius={[6, 6, 0, 0]}>
              {portfolio.map((position) => {
                const current = portfolioPrices[position.symbol] || 0;
                const value = current * position.shares;
                const cost = position.avgCost * position.shares;
                const profit = value - cost;
                return (
                  <Cell
                    key={`${position.symbol}-${position.avgCost}`}
                    fill={profit >= 0 ? "#22c55e" : "#ef4444"}
                  />
                );
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div className="portfolio-visual-empty">Add a position to see performance.</div>
      )}
    </div>

    {renderPortfolioPiePanel(
      "Country Breakdown",
      portfolioCountryData,
      "Add a position to see country exposure."
    )}

    {renderPortfolioPiePanel(
      "Industry Breakdown",
      portfolioIndustryData,
      "Add a position to see industry exposure."
    )}
  </div>

</div>
{/* NAMED WATCHLISTS */}
    </>
    )}

{activePage === "watchlists" && (
<section className="named-watchlists-page" id="watchlists">
  <div className="financial-statement-hero watchlists-hero">
    <div>
      <span className="home-feature-label">Research Radar</span>
      <h2>Watchlists</h2>
      <p>Build focused lists of companies, monitor live prices, and jump back into research when a ticker starts moving.</p>
    </div>
    <span className="market-overview-updated">
      {namedWatchlists.length} lists
    </span>
  </div>
  <div className="chart-section named-watchlists-section">
  <div className="named-watchlists-heading">
    <h2 className="section-title">Watchlists</h2>
    <form
      className="named-watchlist-create"
      onSubmit={(event) => {
        event.preventDefault();
        if (!requireAuth("Log in or sign up to create and save watchlists.")) {
          return;
        }
        const name = newWatchlistName.trim();
        if (!name) return;
        const id = globalThis.crypto?.randomUUID?.() || `watchlist-${Date.now()}`;
        setNamedWatchlists((lists) => [...lists, { id, name, symbols: [] }]);
        setNewWatchlistName("");
      }}
    >
      <input
        value={newWatchlistName}
        onFocus={(event) => {
          if (!user) {
            event.currentTarget.blur();
            requireAuth("Log in or sign up to create and save watchlists.");
          }
        }}
        onChange={(event) => setNewWatchlistName(event.target.value)}
        placeholder="New watchlist name"
        maxLength={60}
      />
      <button type="submit" aria-label="Create watchlist" title="Create watchlist">+</button>
    </form>
  </div>

  {namedWatchlists.length ? (
    <div className="named-watchlists-grid">
      {namedWatchlists.map((list) => (
        <article className="named-watchlist-card" key={list.id}>
          <div className="named-watchlist-card-header">
            <input
              className="named-watchlist-name"
              value={list.name}
              maxLength={60}
              aria-label="Watchlist name"
              onChange={(event) => setNamedWatchlists((lists) =>
                lists.map((item) => item.id === list.id
                  ? { ...item, name: event.target.value }
                  : item
                )
              )}
            />
            <button
              className="named-watchlist-delete"
              type="button"
              aria-label={`Delete ${list.name}`}
              title="Delete watchlist"
              onClick={() => setNamedWatchlists((lists) =>
                lists.filter((item) => item.id !== list.id)
              )}
            >
              ×
            </button>
          </div>

          <div className="named-watchlist-symbols">
            {(list.symbols || []).map((symbol) => {
              const marketType = getMarketSymbolType(symbol);
              const logoUrl = getMarketLogoUrl(symbol, marketType);
              return (
                <div className={`named-watchlist-row named-watchlist-row-${marketType}`} key={symbol}>
                  <button
                    className="named-watchlist-open"
                    type="button"
                    onClick={() => {
                      openWatchlistSymbol(symbol);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    <span className="named-watchlist-identity">
                      <span className={`named-watchlist-logo-shell${logoUrl ? " has-logo" : ""}`} aria-hidden="true">
                        <span className={`named-watchlist-logo-fallback named-watchlist-logo-fallback-${marketType}`}>
                          {renderMarketLogoMark(symbol, marketType)}
                        </span>
                        {logoUrl && (
                          <img
                            className="named-watchlist-logo"
                            src={logoUrl}
                            alt=""
                            crossOrigin="anonymous"
                            onLoad={(event) => {
                              if (marketType === "stock") handleCompanyLogoLoad(event);
                            }}
                            onError={(event) => {
                              if (marketType === "stock") {
                                handleCompanyLogoError(event, symbol);
                                return;
                              }
                              if (marketType === "crypto") {
                                handleCryptoLogoError(event, symbol);
                                return;
                              }
                              event.currentTarget.style.display = "none";
                            }}
                          />
                        )}
                      </span>
                      <strong>{symbol}</strong>
                    </span>
                    <span className="named-watchlist-quote">
                      <span className="named-watchlist-price">
                        {formatWatchlistMarketPrice(symbol, marketType)}
                      </span>
                      <span className={`named-watchlist-change ${
                        savedSymbolDetails[symbol]?.percentChange > 0
                          ? "watch-positive"
                          : savedSymbolDetails[symbol]?.percentChange < 0
                            ? "watch-negative"
                            : "watch-neutral"
                      }`}>
                        {isNumber(savedSymbolDetails[symbol]?.percentChange)
                          ? `${savedSymbolDetails[symbol].percentChange > 0 ? "+" : ""}${savedSymbolDetails[symbol].percentChange.toFixed(2)}%`
                          : "--"}
                      </span>
                    </span>
                  </button>
                  <button
                    className="named-watchlist-remove"
                    type="button"
                    aria-label={`Remove ${symbol} from ${list.name}`}
                    title="Remove ticker"
                    onClick={() => setNamedWatchlists((lists) =>
                      lists.map((item) => item.id === list.id
                        ? { ...item, symbols: (item.symbols || []).filter((itemSymbol) => itemSymbol !== symbol) }
                        : item
                      )
                    )}
                  >
                    ×
                  </button>
                </div>
              );
            })}
            {!list.symbols?.length && (
              <div className="named-watchlist-empty">No tickers added.</div>
            )}
          </div>

          <form
            className="named-watchlist-add"
            onSubmit={(event) => {
              event.preventDefault();
              if (!requireAuth("Log in or sign up to add stocks to your watchlists.")) {
                return;
              }
              const symbol = String(namedTickerInputs[list.id] || "").trim().toUpperCase();
              if (!symbol || !/^[A-Z0-9.-]{1,12}$/.test(symbol)) return;
              setNamedWatchlists((lists) => lists.map((item) =>
                item.id === list.id && !item.symbols.includes(symbol)
                  ? { ...item, symbols: [...item.symbols, symbol] }
                  : item
              ));
              setNamedTickerInputs((inputs) => ({ ...inputs, [list.id]: "" }));
            }}
          >
            <input
              value={namedTickerInputs[list.id] || ""}
              onFocus={(event) => {
                if (!user) {
                  event.currentTarget.blur();
                  requireAuth("Log in or sign up to add stocks to your watchlists.");
                }
              }}
              onChange={(event) => setNamedTickerInputs((inputs) => ({
                ...inputs,
                [list.id]: event.target.value.toUpperCase()
              }))}
              placeholder="Add ticker"
              maxLength={12}
            />
            <button type="submit" aria-label={`Add ticker to ${list.name}`} title="Add ticker">+</button>
          </form>
        </article>
      ))}
    </div>
  ) : (
    <div className="named-watchlists-empty">Create a watchlist to organize stocks.</div>
  )}
  </div>
</section>
)}

{/* LIVE EARNINGS CALENDAR */}

{activePage === "earnings-calendar" && (
<section className="calendar-page" id="earnings-calendar">
  <div className="financial-statement-hero calendar-hero">
    <div>
      <span className="home-feature-label">Market Schedule</span>
      <h2>Calendar</h2>
      <p>Track upcoming earnings, dividends, and IPOs by week with estimates, payout details, offering data, and company context.</p>
    </div>
    <span className="market-overview-updated">
      {isEarningsLoading ? "Refreshing" : `Updated ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`}
    </span>
  </div>

<div className="chart-section calendar-bottom-section">

  <div className="calendar-heading-row">
    <div>
      <span className="home-feature-label">{activeCalendarConfig.label}</span>
      <h2 className="section-title">
        {activeCalendarConfig.label} Calendar
      </h2>
    </div>
    <div className="calendar-week-controls">
      <button
        type="button"
        aria-label="Previous week"
        title="Previous week"
        onClick={() => setEarningsWeekStart(shiftIsoDate(earningsWeekStart, -7))}
      >
        &lt;
      </button>
      <button
        className="calendar-today-button"
        type="button"
        onClick={() => setEarningsWeekStart(getWeekStartIso())}
      >
        This week
      </button>
      <button
        type="button"
        aria-label="Next week"
        title="Next week"
        onClick={() => setEarningsWeekStart(shiftIsoDate(earningsWeekStart, 7))}
      >
        &gt;
      </button>
    </div>
  </div>

  <div className={`earnings-calendar calendar-mode-${calendarMode}`}>
    <div className="calendar-mode-toggle" role="tablist" aria-label="Calendar type">
      {CALENDAR_MODES.map((mode) => (
        <button
          key={mode.id}
          type="button"
          className={calendarMode === mode.id ? "active" : ""}
          onClick={() => setCalendarMode(mode.id)}
        >
          {mode.label}
        </button>
      ))}
    </div>
    {calendarMode === "earnings" && (
      <form className="calendar-earnings-search" onSubmit={handleCalendarSearchSubmit}>
        <div className="stock-search-field calendar-search-field">
          <input
            className="search"
            value={calendarSearchInput}
            onChange={(event) => {
              setCalendarSearchInput(event.target.value.toUpperCase());
              setShowCalendarSearchSuggestions(true);
            }}
            onFocus={() => setShowCalendarSearchSuggestions(true)}
            onBlur={() => window.setTimeout(() => setShowCalendarSearchSuggestions(false), 160)}
            placeholder="Search any stock earnings history"
            aria-label="Search stock earnings history"
          />
          {renderCalendarSearchSuggestions()}
        </div>
        <button type="submit" className="stock-search-button">
          Search Earnings
        </button>
      </form>
    )}
    <div className="calendar-week-label">{earningsWeekLabel}</div>

    {calendarMode === "live-earnings" ? (
      <div className="live-earnings-panel">
        <div className="live-earnings-intro">
          <div>
            <span className="home-feature-label">Primary-source actuals</span>
            <h3>Live Earnings</h3>
            <p>Choose a company reporting today. Actuals are pulled from SEC filings or earnings release documents once they appear.</p>
          </div>
          <span>{formatShortDate(liveEarningsToday)}</span>
        </div>

        {isEarningsLoading && !liveEarningsEvents.length ? (
          <div className="calendar-empty">Loading today&apos;s earnings reporters...</div>
        ) : liveEarningsEvents.length ? (
          <div className="live-earnings-layout">
            <div className="live-earnings-list">
              {liveEarningsEvents.map((event, eventIndex) => {
                const symbol = String(event.symbol || "").toUpperCase();
                const result = liveEarningsResults[symbol];
                const hasLiveActuals = isNumber(result?.epsActual) || isNumber(result?.revenueActual);
                return (
                  <button
                    className={`live-earnings-item${selectedLiveEarningsSymbol === symbol ? " active" : ""}`}
                    key={`live-${liveEarningsToday}-${symbol}-${eventIndex}`}
                    type="button"
                    onClick={() => openLiveEarningsEvent(event)}
                  >
                    <span className={`calendar-company-logo-shell${symbol ? " has-logo" : ""}`} aria-hidden="true">
                      <span className="calendar-company-logo-fallback">
                        {symbol.slice(0, 1)}
                      </span>
                      {symbol && (
                        <img
                          className="calendar-company-logo"
                          src={getDisplayCompanyLogoUrl(symbol, event.logo)}
                          data-provider-logo={event.logo || ""}
                          alt=""
                          crossOrigin="anonymous"
                          onLoad={(event) => handleCompanyLogoLoad(event)}
                          onError={(imageEvent) => handleCompanyLogoError(imageEvent, symbol)}
                        />
                      )}
                    </span>
                    <span>
                      <strong>{symbol}</strong>
                      <small>{event.company || "Company"}</small>
                    </span>
                    <em className={hasLiveActuals ? "reported" : ""}>
                      {hasLiveActuals ? "Reported" : result ? "Waiting" : "Checking"}
                    </em>
                  </button>
                );
              })}
            </div>

            <div className="live-earnings-detail">
              {selectedLiveEarningsEvent ? (
                <>
                  <div className="live-earnings-detail-head">
                    <div>
                      <span className="home-feature-label">{selectedLiveEarningsResult?.status === "reported" ? "Actuals found" : "Watching release"}</span>
                      <h3>{selectedLiveEarningsSymbol}</h3>
                      <p>{selectedLiveEarningsEvent.company || selectedLiveEarningsResult?.company || selectedLiveEarningsSymbol}</p>
                    </div>
                    <div className="live-earnings-price">
                      <strong>{formatPrice(selectedLiveEarningsResult?.price)}</strong>
                      <span className={selectedLiveEarningsResult?.percentChange >= 0 ? "green" : "red"}>
                        {formatCalendarSignedPercent(selectedLiveEarningsResult?.percentChange)}
                      </span>
                      {selectedLiveEarningsResult?.extendedHours?.price && (
                        <small>
                          {selectedLiveEarningsResult.extendedHours.label || "Extended"} {formatPrice(selectedLiveEarningsResult.extendedHours.price)}
                        </small>
                      )}
                    </div>
                  </div>

                  <div className="live-earnings-metrics">
                    <article>
                      <span>Revenue estimate</span>
                      <strong>{formatCalendarMoney(selectedLiveEarningsResult?.revenueEstimate, "No estimate")}</strong>
                      <small>Consensus estimate</small>
                    </article>
                    <article>
                      <span>Revenue actual</span>
                      <strong>{formatCalendarMoney(selectedLiveEarningsResult?.revenueActual, "Waiting")}</strong>
                      <small className={selectedLiveEarningsResult?.revenueSurprisePercent >= 0 ? "green" : "red"}>
                        {formatCalendarSignedPercent(selectedLiveEarningsResult?.revenueSurprisePercent, "Beat/miss pending")}
                      </small>
                    </article>
                    <article>
                      <span>EPS estimate</span>
                      <strong>{formatCalendarEps(selectedLiveEarningsResult?.epsEstimate, "No estimate")}</strong>
                      <small>Consensus estimate</small>
                    </article>
                    <article>
                      <span>EPS actual</span>
                      <strong>{formatCalendarEps(selectedLiveEarningsResult?.epsActual, "Waiting")}</strong>
                      <small className={selectedLiveEarningsResult?.epsSurprisePercent >= 0 ? "green" : "red"}>
                        {formatCalendarSignedPercent(selectedLiveEarningsResult?.epsSurprisePercent, "Beat/miss pending")}
                      </small>
                    </article>
                  </div>

                  <div className="live-earnings-sources">
                    <div>
                      <strong>{loadingLiveEarningsSymbol === selectedLiveEarningsSymbol ? "Checking primary sources..." : selectedLiveEarningsResult?.message || "Waiting for earnings release documents."}</strong>
                    </div>
                    {selectedLiveEarningsResult?.sources?.length ? (
                      selectedLiveEarningsResult.sources.map((source, index) => (
                        <a key={`${source.url}-${index}`} href={source.url} target="_blank" rel="noreferrer">
                          {source.title || source.source || "Source document"}
                        </a>
                      ))
                    ) : null}
                  </div>
                </>
              ) : (
                <div className="calendar-empty">Select a company reporting today to watch for primary-source actuals.</div>
              )}
            </div>
          </div>
        ) : (
          <div className="calendar-empty">No earnings reporters are listed for today.</div>
        )}
      </div>
    ) : (
      <>
    <div className="calendar-date-strip">
      {displayedCalendarDays.map((day) => {
        const date = new Date(`${day.date}T12:00:00`);
        const isToday = day.date === toLocalIsoDate(new Date());
        return (
          <button
            className={`calendar-date-button${day.date === selectedEarningsDate ? " selected" : ""}${isToday ? " today" : ""}`}
            key={day.date}
            type="button"
            onClick={() => setSelectedEarningsDate(day.date)}
          >
            <span>{date.toLocaleDateString(undefined, { weekday: "short" })}</span>
            <strong>{date.getDate()}</strong>
            <small>
              {day.events?.length || 0} {calendarMode === "earnings" ? "reports" : calendarMode === "economic" ? "releases" : calendarMode}
            </small>
          </button>
        );
      })}
    </div>

    {isEarningsLoading && selectedEarningsDay.events?.length ? (
      <div className="calendar-refreshing-pill">Refreshing latest {activeCalendarConfig.label.toLowerCase()} data...</div>
    ) : null}

    {isEarningsLoading && !selectedEarningsDay.events?.length ? (
      <div className="calendar-empty">Loading {activeCalendarConfig.label.toLowerCase()} calendar...</div>
    ) : selectedEarningsDay.events?.length ? (
      <div className="calendar-company-list" key={selectedEarningsDate}>
        <div className={`calendar-company-header calendar-company-header-${calendarMode}`}>
          {calendarMode === "earnings" ? (
            <>
              <span>Company</span>
              <span>Revenue estimate</span>
              <span>EPS estimate</span>
              <span>Market cap</span>
            </>
          ) : calendarMode === "dividends" ? (
            <>
              <span>Symbol</span>
              <span>Date</span>
              <span>Record date</span>
              <span>Payment date</span>
              <span>Declaration date</span>
              <span>Adj dividend</span>
              <span>Yield</span>
              <span>Frequency</span>
            </>
          ) : calendarMode === "economic" ? (
            <>
              <span>Event</span>
              <span>Country</span>
              <span>Currency</span>
              <span>Previous</span>
              <span>Estimate</span>
              <span>Actual</span>
              <span>Change</span>
              <span>Impact</span>
              <span>Change %</span>
              <span>Unit</span>
            </>
          ) : (
            <>
              <span>Symbol</span>
              <span>Date</span>
              <span>Company</span>
              <span>Exchange</span>
              <span>Actions</span>
              <span>Shares</span>
              <span>Price range</span>
              <span>Market cap</span>
            </>
          )}
        </div>
        {selectedEarningsDay.events.map((event, eventIndex) => (
          <button
            className={`calendar-company-row calendar-company-row-${calendarMode}`}
            key={`${selectedEarningsDate}-${event.symbol || event.event || "event"}-${eventIndex}`}
            type="button"
            onClick={() => {
              if (calendarMode === "earnings") {
                openCalendarEarningsReport(event);
                return;
              }
              if (calendarMode === "economic") return;
              if (!event.symbol) return;
              setSearchInput(event.symbol);
              setTicker(event.symbol);
              setActivePage("overview");
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          >
            <span className="calendar-company-name">
              {calendarMode === "economic" ? (
                <span className="calendar-company-copy calendar-economic-copy">
                  <strong>{event.event || "Economic release"}</strong>
                  <small>{formatShortDate(event.date)}</small>
                </span>
              ) : (
                <span className="calendar-company-identity">
                  <span className={`calendar-company-logo-shell${(event.symbol || event.logo) ? " has-logo" : ""}`} aria-hidden="true">
                    <span className="calendar-company-logo-fallback">
                      {event.symbol.slice(0, 1)}
                    </span>
                    {(event.symbol || event.logo) && (
                      <img
                        className="calendar-company-logo"
                        src={getDisplayCompanyLogoUrl(event.symbol, event.logo)}
                        data-provider-logo={event.logo || ""}
                        alt=""
                        crossOrigin="anonymous"
                        onLoad={(event) => handleCompanyLogoLoad(event)}
                        onError={(imageEvent) =>
                          handleCompanyLogoError(imageEvent, event.symbol)
                        }
                      />
                    )}
                  </span>
                  <span className="calendar-company-copy">
                    <strong>{event.symbol}</strong>
                    <small>{event.company}</small>
                    {calendarMode === "earnings" && event.fiscalQuarter && (
                      <em>{event.fiscalQuarter}</em>
                    )}
                  </span>
                </span>
              )}
            </span>
            {calendarMode === "earnings" ? (
              <>
                <strong data-label="Revenue est.">{formatCalendarMoney(event.revenueEstimate, "No estimate")}</strong>
                <strong data-label="EPS est.">{formatCalendarEps(event.epsEstimate, "No estimate")}</strong>
                <span data-label="Market cap">{formatCalendarMoney(event.marketCap)}</span>
              </>
            ) : calendarMode === "dividends" ? (
              <>
                <span data-label="Date">{formatShortDate(event.date)}</span>
                <span data-label="Record date">{formatShortDate(event.recordDate)}</span>
                <span data-label="Payment date">{formatShortDate(event.paymentDate)}</span>
                <span data-label="Declaration date">{formatShortDate(event.declarationDate)}</span>
                <strong data-label="Adj dividend">{formatCalendarEps(event.adjDividend)}</strong>
                <strong data-label="Yield">{formatCalendarPercent(event.dividendYield)}</strong>
                <span data-label="Frequency">{event.frequency || "N/A"}</span>
              </>
            ) : calendarMode === "economic" ? (
              <>
                <span data-label="Country">{event.country || "N/A"}</span>
                <span data-label="Currency">{event.currency || "N/A"}</span>
                <span data-label="Previous">{formatCalendarValue(event.previous, event.unit)}</span>
                <span data-label="Estimate">{formatCalendarValue(event.estimate, event.unit)}</span>
                <strong data-label="Actual">{formatCalendarValue(event.actual, event.unit)}</strong>
                <span data-label="Change">{formatCalendarValue(event.change, event.unit)}</span>
                <strong data-label="Impact">{event.impact || "N/A"}</strong>
                <span data-label="Change %">{formatCalendarSignedPercent(event.changePercentage)}</span>
                <span data-label="Unit">{event.unit || "N/A"}</span>
              </>
            ) : (
              <>
                <span data-label="Date">{formatShortDate(event.date)}</span>
                <span data-label="Company">{event.company || event.symbol}</span>
                <span data-label="Exchange">{event.exchange || "N/A"}</span>
                <strong data-label="Actions">{event.actions || "N/A"}</strong>
                <span data-label="Shares">{formatCalendarShares(event.shares)}</span>
                <span data-label="Price range">{event.priceRange || "N/A"}</span>
                <span data-label="Market cap">{formatCalendarMoney(event.marketCap)}</span>
              </>
            )}
          </button>
        ))}
      </div>
    ) : (
      <div className="calendar-empty">No {activeCalendarConfig.label.toLowerCase()} events are scheduled for this date.</div>
    )}
      </>
    )}

    {calendarMode === "earnings" && selectedCalendarEvent && (
      <div
        className="calendar-report-overlay"
        role="dialog"
        aria-modal="true"
        aria-label={`${selectedCalendarEvent.symbol} earnings report`}
        onClick={() => setSelectedCalendarEvent(null)}
      >
        <div
          className="calendar-report-panel"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="calendar-report-heading">
            <div className="calendar-report-title">
              <span
                className={`calendar-report-logo-shell${getDisplayCompanyLogoUrl(selectedCalendarEvent.symbol, selectedCalendarEvent.logo) ? " has-logo" : ""}`}
                aria-hidden="true"
              >
                <span className="calendar-company-logo-fallback">
                  {getLogoFallbackText(selectedCalendarEvent.symbol)}
                </span>
                {getDisplayCompanyLogoUrl(selectedCalendarEvent.symbol, selectedCalendarEvent.logo) && (
                  <img
                    className="calendar-company-logo"
                    src={getDisplayCompanyLogoUrl(selectedCalendarEvent.symbol, selectedCalendarEvent.logo)}
                    data-provider-logo={selectedCalendarEvent.logo || ""}
                    alt=""
                    crossOrigin="anonymous"
                    onLoad={(event) => handleCompanyLogoLoad(event)}
                    onError={(event) => handleCompanyLogoError(event, selectedCalendarEvent.symbol)}
                  />
                )}
              </span>
              <div>
                <span className="home-feature-label">Earnings Report</span>
                <h3>{selectedCalendarEvent.symbol}</h3>
                <p>{selectedCalendarEvent.company}</p>
              </div>
            </div>
            <div className="calendar-report-heading-actions">
              <div className="calendar-report-brand" aria-label="Powered by MrktRally">
                <img src="/mrktrally-icon.png" alt="" />
                <span>Powered by <strong>MrktRally</strong></span>
              </div>
              <button
                type="button"
                aria-label="Close earnings report"
                onClick={() => setSelectedCalendarEvent(null)}
              >
                Close
              </button>
            </div>
          </div>

          {loadingCalendarReportSymbol === selectedCalendarSymbol && !selectedCalendarReport?.rows?.length ? (
            <div className="calendar-empty">Loading earnings report...</div>
          ) : selectedCalendarReport?.rows?.length ? (
            <div className="calendar-report-table">
              <div className="calendar-report-table-header">
                <span>Symbol</span>
                <span>Date</span>
                <span>EPS actual</span>
                <span>EPS estimated</span>
                <span>Revenue actual</span>
                <span>Revenue estimated</span>
              </div>
              {selectedCalendarReport.rows.map((row, rowIndex) => (
                <div className="calendar-report-table-row" key={`${row.symbol}-${row.date}-${rowIndex}`}>
                  <strong>{row.symbol}</strong>
                  <span>{formatShortDate(row.date)}</span>
                  <span>
                    {formatCalendarEps(row.epsActual)}
                    <small className={isNumber(row.epsSurprisePercent) ? (row.epsSurprisePercent >= 0 ? "green" : "red") : ""}>
                      {formatCalendarSignedPercent(row.epsSurprisePercent)}
                    </small>
                  </span>
                  <span>{formatCalendarEps(row.epsEstimated)}</span>
                  <span>
                    {formatCalendarMoney(row.revenueActual)}
                    <small className={isNumber(row.revenueSurprisePercent) ? (row.revenueSurprisePercent >= 0 ? "green" : "red") : ""}>
                      {formatCalendarSignedPercent(row.revenueSurprisePercent)}
                    </small>
                  </span>
                  <span>{formatCalendarMoney(row.revenueEstimated)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="calendar-empty">No earnings report rows available yet.</div>
          )}
        </div>
      </div>
    )}
  </div>

  {calendarMode === "earnings" && (
    <section className="earnings-week-snapshot" aria-label="Top earnings snapshot">
      <div className="earnings-week-snapshot-header">
        <div className="earnings-week-brand">
          <img src="/mrktrally-icon.png" alt="MrktRally logo" />
          <span>MrktRally</span>
        </div>
        <div>
          <span className="home-feature-label">Weekly earnings board</span>
          <h3>Top earnings for the week of {earningsWeekLabel}</h3>
          <p>A compact daily board of the most important reports from the calendar above.</p>
        </div>
        <button
          className="earnings-week-export-button"
          type="button"
          onClick={downloadWeeklyEarningsImage}
        >
          Save Weekly Image
        </button>
      </div>

      <div className="earnings-week-snapshot-board">
        {earningsSnapshotWeekdays.map((day) => (
          <article className="earnings-snapshot-day" key={`snapshot-${day.date}`}>
            <div className="earnings-snapshot-day-head">
              <div>
                <strong>{day.weekday}</strong>
                <span>{day.shortDate}</span>
              </div>
            </div>

            <div className="earnings-snapshot-list">
              {day.events.length ? (
                day.events.map((event, eventIndex) => {
                  const symbol = String(event.symbol || "").toUpperCase();
                  return (
                    <button
                      className="earnings-snapshot-company"
                      key={`${day.date}-${symbol}-${eventIndex}`}
                      type="button"
                      onClick={() => openCalendarEarningsReport(event)}
                    >
                      <span className={`earnings-snapshot-logo-shell${symbol ? " has-logo" : ""}`} aria-hidden="true">
                        <span className="earnings-snapshot-logo-fallback">
                          {symbol.slice(0, 1)}
                        </span>
                        {symbol && (
                          <img
                            className="earnings-snapshot-logo"
                            src={getDisplayCompanyLogoUrl(symbol, event.logo)}
                            data-provider-logo={event.logo || ""}
                            alt=""
                            crossOrigin="anonymous"
                            onLoad={(event) => handleCompanyLogoLoad(event)}
                            onError={(imageEvent) =>
                              handleCompanyLogoError(imageEvent, symbol)
                            }
                          />
                        )}
                      </span>
                      <span className="earnings-snapshot-copy">
                        <strong>{symbol}</strong>
                        <small>{event.company || "Company"}</small>
                      </span>
                      <span className="earnings-snapshot-meta">
                        {isNumber(event.marketCap)
                          ? formatCalendarMoney(event.marketCap)
                          : isNumber(event.revenueEstimate)
                            ? formatCalendarMoney(event.revenueEstimate)
                            : "Est. pending"}
                      </span>
                    </button>
                  );
                })
              ) : (
                <div className="earnings-snapshot-empty">No major reports listed yet.</div>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  )}

</div>
</section>
)}


{/* MR. RALLY CHAT */}

{false && activePage === "mr-rally" && mrRallySection}


{/* AUTH POPUP */}

{showAuth && createPortal((

  <div className="auth-overlay">

    <div className="auth-box">

      <h2>
        {isRecoveringPassword
          ? "Reset Password"
          : isLogin
            ? "Login"
            : "Create Account"}
      </h2>

      {authPrompt && (
        <div className="auth-required-message">
          {authPrompt}
        </div>
      )}

      {authMessage && (
        <div className="auth-required-message">
          {authMessage}
        </div>
      )}

      {!isLogin && !isRecoveringPassword && (
        <input
          placeholder="Username"
          value={username}
          onChange={(e) =>
            setUsername(e.target.value)
          }
        />
      )}

      <input
        placeholder="Email"
        value={email}
        onChange={(e) =>
          setEmail(e.target.value)
        }
      />

      {isRecoveringPassword && passwordResetToken ? (
        <input
          type="password"
          placeholder="New password"
          value={resetPassword}
          onChange={(e) =>
            setResetPassword(e.target.value)
          }
        />
      ) : !isRecoveringPassword ? (
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) =>
            setPassword(e.target.value)
          }
        />
      ) : null}

      {!isLogin && !isRecoveringPassword && (
        <label className="auth-policy-agreement">
          <input
            type="checkbox"
            checked={acceptedPolicies}
            onChange={(event) => setAcceptedPolicies(event.target.checked)}
          />
          <span>
            I agree to MrktRally's{" "}
            <button type="button" onClick={() => setActivePolicyKey("terms")}>Terms</button>,{" "}
            <button type="button" onClick={() => setActivePolicyKey("privacy")}>Privacy Policy</button>,{" "}
            <button type="button" onClick={() => setActivePolicyKey("cookies")}>Cookie Policy</button>, and{" "}
            <button type="button" onClick={() => setActivePolicyKey("disclaimer")}>Disclaimer</button>.
          </span>
        </label>
      )}

      <button
        disabled={isAuthSubmitting}
        onClick={
          isRecoveringPassword
            ? passwordResetToken
              ? handleResetPassword
              : handleForgotPassword
            : handleAuth
        }
      >
        {isAuthSubmitting
          ? "Working..."
          : isRecoveringPassword
          ? passwordResetToken
            ? "Reset Password"
            : "Send Reset Link"
          : isLogin
            ? "Login"
            : "Create Account"}
      </button>

      {!isRecoveringPassword && (
        <>
          {GOOGLE_CLIENT_ID ? (
            <div
              className={`google-auth-button ${!isLogin && !acceptedPolicies ? "google-auth-button-disabled" : ""}`}
            >
              <div
                className="google-auth-official-button"
                ref={googleButtonRef}
              />
              {!isGoogleButtonReady && (
                <button
                  type="button"
                  className="google-auth-fallback-button"
                  disabled={!isLogin && !acceptedPolicies}
                  onClick={() => setAuthMessage("Google sign-in is loading. Try again in a moment.")}
                >
                  <span aria-hidden="true">G</span>
                  Continue with Google
                </button>
              )}
            </div>
          ) : (
            <div className="auth-required-message">
              Google sign-in needs a Google Client ID added first.
            </div>
          )}

          {!isLogin && !acceptedPolicies && GOOGLE_CLIENT_ID && (
            <div className="auth-required-message">
              Check the policy agreement before using Google sign up.
            </div>
          )}

          {isLogin && (
            <p
              className="auth-switch"
              onClick={() => {
                setIsRecoveringPassword(true);
                setPasswordResetToken("");
                setAuthPrompt("");
                setAuthMessage("");
              }}
            >
              Forgot password?
            </p>
          )}
        </>
      )}

      <p
        className="auth-switch"
        onClick={() => {
          setIsLogin(!isLogin);
          setIsRecoveringPassword(false);
          setPasswordResetToken("");
          setAcceptedPolicies(false);
          setAuthPrompt("");
          setAuthMessage("");
        }}
      >
        {isRecoveringPassword
          ? "Back to login"
          : isLogin
            ? "Need an account? Sign up"
            : "Already have an account? Login"}
      </p>

      <button
        className="auth-secondary-button"
        onClick={() => {
          setShowAuth(false);
          setAuthPrompt("");
          setAuthMessage("");
        }}
      >
        Close
      </button>

    </div>

  </div>

), document.body)}

{activePolicyKey && POLICY_CONTENT[activePolicyKey] && createPortal((
  <div className="policy-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="policy-modal-title">
    <div className="policy-modal">
      <button
        type="button"
        className="policy-modal-close"
        aria-label="Close policy"
        onClick={() => setActivePolicyKey(null)}
      >
        ×
      </button>
      <div className="welcome-kicker">MrktRally Policies</div>
      <h2 id="policy-modal-title">{POLICY_CONTENT[activePolicyKey].title}</h2>
      <p className="policy-modal-intro">{POLICY_CONTENT[activePolicyKey].intro}</p>
      <div className="policy-modal-sections">
        {POLICY_CONTENT[activePolicyKey].sections.map((section) => (
          <article key={section.title}>
            <h3>{section.title}</h3>
            <p>{section.text}</p>
          </article>
        ))}
      </div>
      <p className="policy-modal-version">Policy version {CURRENT_POLICY_VERSION}</p>
    </div>
  </div>
), document.body)}

</div>
</div>

);
}

export default App;
