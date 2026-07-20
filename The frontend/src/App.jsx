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

const HOME_FEATURES = [
  {
    id: "market-overview",
    icon: "market",
    label: "Market Overview",
    title: "See the whole market first",
    text: "Check the major indexes, market clock, and a heat map view of leading S&P 500 companies before diving into one stock."
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
    title: "Keep ideas close",
    text: "Save companies you want to monitor and jump back into research quickly when a stock starts moving."
  },
  {
    id: "earnings-calendar",
    icon: "calendar",
    label: "Calendar",
    title: "Know what reports next",
    text: "Use the earnings calendar to see upcoming reports, expected EPS, expected revenue, and recent market events."
  },
  {
    id: "overview",
    icon: "documents",
    label: "Documents",
    title: "Read the actual company releases",
    text: "Open the latest 10-K, 10-Q, earnings release, income statement, balance sheet, and cash flow documents from the stock page."
  },
  {
    id: "mr-rally",
    icon: "mr-rally",
    label: "Mr. Rally",
    title: "Ask questions while you research",
    text: "Use the built-in stock chat to ask about companies, filings, earnings, metrics, risks, and the data behind the business."
  }
];

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

const formatPlain = (value) =>
  isNumber(value) ? value.toFixed(2) : "N/A";

const formatPrice = (value) =>
  isNumber(value) ? `$${value.toFixed(2)}` : "N/A";

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

const formatIndexPrice = (value) =>
  isNumber(value) ? value.toLocaleString(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }) : "--";

const formatSignedPercent = (value) =>
  isNumber(value) ? `${value > 0 ? "+" : ""}${value.toFixed(2)}%` : "--";

const getExtendedHoursQuote = (...sources) => {
  for (const source of sources) {
    const extendedHours = source?.extendedHours;
    const quote = extendedHours?.active || extendedHours?.afterHours || extendedHours?.preMarket;
    if (isNumber(quote?.price)) {
      const previousClose = isNumber(quote.previousClose)
        ? quote.previousClose
        : null;
      const change = previousClose
        ? quote.price - previousClose
        : quote.change;
      const percentChange = previousClose
        ? (change / previousClose) * 100
        : quote.percentChange;

      return {
        ...quote,
        change,
        percentChange,
      };
    }
  }

  return null;
};

const chunkSymbols = (symbols, size = 10) => {
  const chunks = [];
  for (let index = 0; index < symbols.length; index += size) {
    chunks.push(symbols.slice(index, index + size));
  }
  return chunks;
};

const STOCK_CHART_RANGES = ["1D", "1W", "1M", "1Y", "YTD", "5Y", "10Y", "MAX"];

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

const getHeatMapTone = (percentChange) => {
  if (!isNumber(percentChange)) return "heat-neutral";
  if (percentChange >= 0.05) return "heat-positive";
  if (percentChange <= -0.05) return "heat-negative";
  return "heat-neutral";
};

const getHeatMapTileStyle = (company = {}) => {
  const percentChange = isNumber(company.percentChange) ? company.percentChange : 0;
  const intensity = Math.min(Math.abs(percentChange) / 4, 1);
  const green = `rgba(16, 185, 129, ${0.26 + intensity * 0.58})`;
  const red = `rgba(244, 63, 94, ${0.24 + intensity * 0.6})`;
  const neutral = "rgba(17, 24, 39, 0.92)";
  const weight = isNumber(company.weight) ? company.weight : 1;

  return {
    flex: `${Math.max(1, Math.min(weight, 8))} 1 ${Math.max(98, Math.min(260, weight * 38))}px`,
    background: percentChange > 0.05
      ? `linear-gradient(135deg, ${green}, rgba(6, 78, 59, 0.92))`
      : percentChange < -0.05
        ? `linear-gradient(135deg, ${red}, rgba(88, 28, 46, 0.92))`
        : `linear-gradient(135deg, ${neutral}, rgba(15, 23, 42, 0.95))`
  };
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

const parseInputPercent = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number / 100 : null;
};

const parseInputNumber = (value) => {
  if (String(value ?? "").trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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

const formatChartTooltipName = (period, valueLabel) =>
  `${valueLabel} ${formatChartPeriodLabel(period)}`;

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
      [key]: isNumber(item[key])
        ? item[key]
        : null,
    }))
    .filter((item) =>
      item.year &&
      item[key] !== null &&
      (item.isInterim || item.year <= new Date().getFullYear())
    );

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
  "priceToSales",
  "priceToBook",
  "revenueGrowth",
  "earningsGrowth",
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
  return valueCount + countInterimRows(realRows) * 3 + realRows.length;
};

const chooseRicherRows = (previousRows, incomingRows, keys) => {
  if (!Array.isArray(previousRows) || !previousRows.length) return incomingRows;
  if (!Array.isArray(incomingRows) || !incomingRows.length) return previousRows;
  return chartRowsScore(incomingRows, keys) >= chartRowsScore(previousRows, keys)
    ? incomingRows
    : previousRows;
};

const hasMarketActivityData = (stock = {}) =>
  (Array.isArray(stock.analystUpdates) && stock.analystUpdates.length > 0) ||
  (Array.isArray(stock.institutionalHolders) && stock.institutionalHolders.length > 0) ||
  (Array.isArray(stock.insiderTransactions) && stock.insiderTransactions.length > 0);

const hasMarketActivityLoaded = (stock = {}) =>
  Boolean(stock.analystUpdatesCheckedAt || (Array.isArray(stock.analystUpdates) && stock.analystUpdates.length)) &&
  Boolean(stock.institutionalHoldersCheckedAt || (Array.isArray(stock.institutionalHolders) && stock.institutionalHolders.length)) &&
  Boolean(stock.insiderTransactionsCheckedAt || (Array.isArray(stock.insiderTransactions) && stock.insiderTransactions.length));

const hasAnyOverviewMetricData = (stock = {}) =>
  isNumber(stock.marketCap) ||
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
    "revenueGrowth",
    "earningsGrowth",
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
    (isNumber(estimates.currentYear?.revenue) || isNumber(estimates.currentYear?.eps)) &&
    (isNumber(estimates.nextYear?.revenue) || isNumber(estimates.nextYear?.eps))
  );
};

const historicalFieldCount = (rows = [], field) =>
  (Array.isArray(rows) ? rows : [])
    .filter((row) => !row?.isCurrent && isNumber(row?.[field]))
    .length;

const hasExtendedHistoricalChartData = (stock = {}) => {
  const revenueData = stock.revenueData || [];
  const marginHistory = stock.marginHistory || [];
  const historicalPe = stock.historicalPe || [];
  const hasCashFlowHistory =
    historicalFieldCount(revenueData, "operatingCashflow") >= 2 ||
    historicalFieldCount(revenueData, "freeCashflow") >= 2;
  const hasMarginHistory =
    historicalFieldCount(marginHistory, "grossMargin") >= 2 ||
    historicalFieldCount(marginHistory, "operatingMargin") >= 2 ||
    historicalFieldCount(marginHistory, "profitMargin") >= 2 ||
    stock.isFinancialCompany;

  return (
    historicalFieldCount(historicalPe, "pe") >= 2 &&
    hasCashFlowHistory &&
    hasMarginHistory
  );
};

const shouldKeepWarmingNewStock = (stock = {}) =>
  !hasCompleteCoreChartData(stock) ||
  !hasExtendedHistoricalChartData(stock);

const stabilizeRefreshingStockData = (previous, incoming) => {
  if (
    !previous ||
    !incoming?.refreshing ||
    String(previous.ticker || previous.symbol || "").toUpperCase() !==
      String(incoming.ticker || incoming.symbol || "").toUpperCase() ||
    !hasStableChartData(previous)
  ) {
    return incoming;
  }

  const stable = { ...incoming };
  CHART_STABLE_FIELDS.forEach((field) => {
    if (previous[field] !== undefined && previous[field] !== null) {
      stable[field] = previous[field];
    }
  });
  stable.revenueData = chooseRicherRows(previous.revenueData, incoming.revenueData, [
    "revenue",
    "earnings",
    "eps",
    "operatingCashflow",
    "freeCashflow",
    "sharesOutstanding"
  ]);
  stable.revenueHistory = chooseRicherRows(previous.revenueHistory, incoming.revenueHistory, [
    "revenue",
    "earnings",
    "eps"
  ]);
  stable.marginHistory = chooseRicherRows(previous.marginHistory, incoming.marginHistory, [
    "grossMargin",
    "operatingMargin",
    "profitMargin"
  ]);
  stable.historicalPe = chooseRicherRows(previous.historicalPe, incoming.historicalPe, ["pe"]);
  if (Array.isArray(previous.epsBeatMiss) && previous.epsBeatMiss.length && (!Array.isArray(incoming.epsBeatMiss) || incoming.epsBeatMiss.length < previous.epsBeatMiss.length)) {
    stable.epsBeatMiss = previous.epsBeatMiss;
  }
  ["analystUpdates", "institutionalHolders", "insiderTransactions"].forEach((field) => {
    if (
      Array.isArray(previous[field]) &&
      previous[field].length &&
      (!Array.isArray(incoming[field]) || !incoming[field].length)
    ) {
      stable[field] = previous[field];
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
  if (absolute >= 1e9) return `${sign}$${(absolute / 1e9).toFixed(1)}B`;
  if (absolute >= 1e6) return `${sign}$${(absolute / 1e6).toFixed(1)}M`;
  return `${sign}$${absolute.toLocaleString()}`;
};

const formatCalendarEps = (value, missingLabel = "N/A") =>
  isNumber(value) ? `${value < 0 ? "-" : ""}$${Math.abs(value).toFixed(2)}` : missingLabel;

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
  positions: []
};
const SAVED_LISTS_STORAGE_KEY = "mrktrally-saved-lists";
const MARKET_INDICES_STORAGE_KEY = "mrktrally-market-indices";
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

const getUserStorageId = (user) =>
  String(user?._id || user?.id || "");

const normalizePortfolios = (items = []) => {
  if (!Array.isArray(items) || !items.length) return [];
  return items.map((item, index) => ({
    id: String(item?.id || `portfolio-${index}`),
    name: String(item?.name || `Portfolio ${index + 1}`),
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
import axios from "axios";
const API_URL =
  import.meta.env.VITE_API_URL ||
  "https://investment-terminal-jtng.onrender.com";
const FINANCIAL_HISTORY_VERSION = 153;
const STOCK_ESTIMATE_VERSION = 18;
const INTERIM_HISTORY_VERSION = 5;
const VALUATION_METRICS_VERSION = 2;
const BALANCE_SHEET_METRICS_VERSION = 9;
const MIN_USABLE_INTERIM_HISTORY_ROWS = 8;
const MIN_DISPLAY_INTERIM_HISTORY_ROWS = 4;

const getDefaultCompanyLogoUrl = (symbol) => {
  const safeSymbol = encodeURIComponent(String(symbol || "").trim().toUpperCase());
  return safeSymbol
    ? `https://static2.finnhub.io/file/publicdatany/finnhubimage/stock_logo/${safeSymbol}.png`
    : null;
};

const handleCompanyLogoError = (event, symbol) => {
  const image = event.currentTarget;
  const safeSymbol = encodeURIComponent(String(symbol || "").trim().toUpperCase());
  const fallbackUrls = [
    `https://financialmodelingprep.com/image-stock/${safeSymbol}.png`,
    `https://assets.parqet.com/logos/symbol/${safeSymbol}?format=png`
  ];
  const stage = Number(image.dataset.logoFallbackStage || 0);

  if (fallbackUrls[stage]) {
    image.dataset.logoFallbackStage = String(stage + 1);
    image.src = fallbackUrls[stage];
    return;
  }

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

const formatSignedEpsSurprise = (value) => {
  if (!isNumber(value)) return "-";
  const sign = value < 0 ? "-" : "+";
  return `${sign}$${Math.abs(value).toFixed(2)}`;
};

function EpsBeatMissChart({ rows = [] }) {
  const [selectedIndex, setSelectedIndex] = useState(null);
  const chartRows = rows
    .filter((row) => isNumber(row?.estimate) || isNumber(row?.actual))
    .slice(-5);
  if (!chartRows.length) return null;
  const surpriseValueFor = (row) =>
    isNumber(row.surprise)
      ? row.surprise
      : isNumber(row.actual) && isNumber(row.estimate)
        ? row.actual - row.estimate
        : null;

  const values = chartRows
    .flatMap((row) => [row.estimate, row.actual])
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
  const referenceEstimate = chartRows.at(-1)?.estimate;
  const selectedRow = chartRows[selectedIndex] || null;
  const selectedSurprise = selectedRow ? surpriseValueFor(selectedRow) : null;

  return (
    <div className="eps-beat-miss-card">
      <div className="eps-beat-miss-header">
        <div>
          <h3>EPS Beat / Miss</h3>
          <span>
            {formatEpsBeatMissLabel(chartRows.at(-1))} estimate {formatEstimateEps(referenceEstimate)}
          </span>
        </div>
        <span className="eps-beat-miss-mode">Normalized EPS</span>
      </div>

      <svg className="eps-beat-miss-plot" viewBox="0 0 100 62" role="img" aria-label="Normalized EPS beat miss chart">
        {[0, 1, 2, 3].map((line) => {
          const y = 10 + line * 12;
          return <line key={line} x1="3" x2="97" y1={y} y2={y} className="eps-beat-miss-grid" />;
        })}
        {isNumber(referenceEstimate) && (
          <line x1="3" x2="97" y1={yFor(referenceEstimate)} y2={yFor(referenceEstimate)} className="eps-beat-miss-reference" />
        )}
        {chartRows.map((row, index) => {
          const x = xFor(index);
          const estimateY = yFor(row.estimate);
          const actualValue = row.actual;
          const actualY = yFor(actualValue);
          const surprise = surpriseValueFor(row);
          const missed = isNumber(surprise) ? surprise < 0 : false;
          const isSelected = selectedIndex === index;
          return (
            <g key={`${row.period || index}-${index}`}>
              {isNumber(row.estimate) && (
                <circle
                  cx={x}
                  cy={estimateY}
                  r="1.65"
                  className="eps-estimate-dot"
                  role="button"
                  tabIndex="0"
                  aria-label={`${formatEpsBeatMissLabel(row)} EPS estimate ${formatEstimateEps(row.estimate)}`}
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
                  aria-label={`${formatEpsBeatMissLabel(row)} actual EPS ${formatEstimateEps(actualValue)}`}
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
          return (
            <div key={`${row.period || index}-label`} className="eps-beat-miss-label">
              <span>{formatEpsBeatMissLabel(row)}</span>
              {isNumber(surprise) ? (
                <strong className={isMiss ? "miss" : "beat"}>
                  {isMiss ? "Missed" : "Beat"} {formatSignedEpsSurprise(surprise)}
                </strong>
              ) : (
                <strong className="upcoming">-</strong>
              )}
              <small>{formatEpsBeatMissDate(row.period)}</small>
            </div>
          );
        })}
      </div>
      {selectedRow && (
        <div className="eps-beat-miss-detail">
          <strong>{formatEpsBeatMissLabel(selectedRow)}</strong>
          <span>Actual {isNumber(selectedRow.actual) ? formatEstimateEps(selectedRow.actual) : "N/A"}</span>
          <span>Estimate {isNumber(selectedRow.estimate) ? formatEstimateEps(selectedRow.estimate) : "N/A"}</span>
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
                labelFormatter={formatChartPeriodLabel}
                formatter={(value, name, props) => [
                  formatter(value),
                  formatChartTooltipName(props?.payload?.period, valueLabel)
                ]}
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
  const latestComparisonRequest = useRef(0);
  const latestAiRequest = useRef(0);
  const latestEarningsCallRequest = useRef(0);
  const initialSavedPricesLoaded = useRef(false);
  const firstStockLoadSettled = useRef(false);
  const previousMarketEventRef = useRef(null);
  const firedMarketEventsRef = useRef(new Set());
  const speechQueueRef = useRef([]);
  const speechIndexRef = useRef(0);
  const speechUtteranceRef = useRef(null);
  const [showAuth, setShowAuth] = useState(false);
  const [authPrompt, setAuthPrompt] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  const [marketEventToast, setMarketEventToast] = useState(null);
  const googleButtonRef = useRef(null);
const [isLogin, setIsLogin] = useState(true);

const [username, setUsername] = useState("");

const [email, setEmail] = useState("");

const [password, setPassword] = useState("");
const [resetPassword, setResetPassword] = useState("");
const [isRecoveringPassword, setIsRecoveringPassword] = useState(false);
const [passwordResetToken, setPasswordResetToken] = useState("");
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

const handleSignOut = () => {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  setUser(null);
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

  alert(successMessage);
  await loadUserData();
};

const handleAuth = async () => {

  try {
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
    setIsAuthSubmitting(true);
    const response = await axios.post(`${API_URL}/api/google-login`, {
      credential
    });
    await completeAuth(response.data, "Google sign-in successful");
  } catch (err) {
    console.error(err);
    alert(err.response?.data?.error || "Google sign-in failed");
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
    });
    setAuthMessage(
      response.data.resetLink
        ? `Reset link created: ${response.data.resetLink}`
        : response.data.emailError
          ? response.data.emailError
        : response.data.emailSent === false
          ? "Password reset email is not configured yet. Add Resend or SMTP settings in Render, then try again."
        : response.data.message || "If that email is on MrktRally, a reset link will be sent."
    );
  } catch (err) {
    console.error(err);
    alert(err.response?.data?.error || "Password reset request failed");
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
  if (!showAuth || !isLogin || isRecoveringPassword || !GOOGLE_CLIENT_ID || !googleButtonRef.current) return;

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
}, [showAuth, isLogin, isRecoveringPassword, GOOGLE_CLIENT_ID]);




const [user, setUser] =
  useState(null);
const [hasLoadedSavedLists, setHasLoadedSavedLists] =
  useState(false);
const [hasMeaningfulSavedLists, setHasMeaningfulSavedLists] =
  useState(false);
  useEffect(() => {

  const savedUser =
    localStorage.getItem("user");

  try {
    const savedLists = JSON.parse(
      localStorage.getItem(SAVED_LISTS_STORAGE_KEY) || "{}"
    );
    if (Array.isArray(savedLists.watchlist)) {
      setWatchlist(savedLists.watchlist);
    }
    if (Array.isArray(savedLists.portfolios) && savedLists.portfolios.length) {
      setPortfolios(normalizePortfolios(savedLists.portfolios));
    }
    if (savedLists.activePortfolioId) {
      setActivePortfolioId(savedLists.activePortfolioId);
    }
    if (Array.isArray(savedLists.namedWatchlists)) {
      setNamedWatchlists(savedLists.namedWatchlists);
    }
    setSavedProjections(normalizeStockProjections(savedLists.projections || {}));
    setHasMeaningfulSavedLists(
      Boolean(
        (savedLists.watchlist || []).length ||
        hasPortfolioPositions(savedLists.portfolios || []) ||
        (savedLists.namedWatchlists || []).some((list) => (list.symbols || []).length) ||
        Object.keys(savedLists.projections || {}).length
      )
    );
  } catch (error) {
    console.error("Saved lists restore failed", error);
  } finally {
    setHasLoadedSavedLists(true);
  }

  if (savedUser) {

    setUser(
      JSON.parse(savedUser)
    );

    loadUserData();
  }

}, []);

  const [ticker, setTicker] =
  useState("NVDA");

  const [searchInput, setSearchInput] =
    useState("NVDA");
  const [activePage, setActivePage] =
    useState("home");
  const [savedProjections, setSavedProjections] =
    useState({});

  let [stockData, setStockData] =
    useState(null);
  const loadedStockSymbol = stockData?.symbol || null;

  const [isStockLoading, setIsStockLoading] =
    useState(false);

  const [stockChartRange, setStockChartRange] =
    useState("1D");

  const [financialChartMode, setFinancialChartMode] =
    useState("annual");

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
  useState([]);

  const [newTicker, setNewTicker] =
  useState("");

  const [namedWatchlists, setNamedWatchlists] =
  useState([]);

  const [newWatchlistName, setNewWatchlistName] =
  useState("");

  const [namedTickerInputs, setNamedTickerInputs] =
  useState({});

  const [portfolios, setPortfolios] =
  useState([DEFAULT_PORTFOLIO]);

  const [activePortfolioId, setActivePortfolioId] =
  useState(DEFAULT_PORTFOLIO.id);

  const [newPortfolioName, setNewPortfolioName] =
  useState("");

  const activePortfolio = portfolios.find(
    (item) => item.id === activePortfolioId
  ) || portfolios[0] || DEFAULT_PORTFOLIO;

  const portfolio = activePortfolio.positions || [];

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

  const removePortfolioPosition = (positionId, fallbackIndex) => {
    setPortfolio((positions) =>
      positions.filter((position, index) =>
        positionId ? position.id !== positionId : index !== fallbackIndex
      )
    );
  };

  const [portfolioPrices, setPortfolioPrices] =
    useState({});

  const [savedSymbolDetails, setSavedSymbolDetails] =
    useState({});

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

  const [marketHeatmap, setMarketHeatmap] =
    useState({ companies: [], sectors: [], updatedAt: null });

  const [isMarketHeatmapLoading, setIsMarketHeatmapLoading] =
    useState(true);

  const [broadMarketMovers, setBroadMarketMovers] =
    useState({ gainers: [], losers: [], updatedAt: null });

  const [isBroadMarketMoversLoading, setIsBroadMarketMoversLoading] =
    useState(false);

  const [etfSearchInput, setEtfSearchInput] =
    useState("SPY");

  const [etfTicker, setEtfTicker] =
    useState("SPY");

  const [etfData, setEtfData] =
    useState(null);

  const [isEtfLoading, setIsEtfLoading] =
    useState(false);

  const [etfError, setEtfError] =
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

  const [isEarningsLoading, setIsEarningsLoading] =
  useState(false);

  const [earningsWeekStart, setEarningsWeekStart] =
  useState(() => getWeekStartIso());

  const [selectedEarningsDate, setSelectedEarningsDate] =
  useState(() => toLocalIsoDate(new Date()));

    const [compareTickers, setCompareTickers] =
  useState(["AAPL", "MSFT", "NVDA"]);

  const [compareData, setCompareData] =
    useState([]);

  const [similarCompanies, setSimilarCompanies] =
    useState([]);

  const [isSimilarCompaniesLoading, setIsSimilarCompaniesLoading] =
    useState(false);


  

  /*
    SAVE WATCHLIST
  */


useEffect(() => {
  let isActive = true;
  let refreshTimer;
  const symbols = [...new Set([
    ...watchlist,
    ...portfolios.flatMap((item) =>
      (item.positions || []).map((position) => position.symbol)
    ),
    ...namedWatchlists.flatMap((list) => list.symbols || [])
  ].map((symbol) => String(symbol || "").trim().toUpperCase()).filter(Boolean))];

  const refreshPrices = async () => {
    if (!isActive) return;
    const marketIsOpen = getMarketClock(new Date()).tone === "open";
    if (!initialSavedPricesLoaded.current) {
      initialSavedPricesLoaded.current = true;
      loadSavedPrices(symbols, 0, { live: false });
      window.setTimeout(() => {
        if (isActive) loadSavedPrices(symbols, 0, { live: true });
      }, 1800);
    } else {
      loadSavedPrices(symbols, 0, { live: true });
    }
    refreshTimer = window.setTimeout(
      refreshPrices,
      marketIsOpen ? 20 * 1000 : 2 * 60 * 1000
    );
  };

  refreshPrices();
  return () => {
    isActive = false;
    window.clearTimeout(refreshTimer);
  };
}, [watchlist, portfolios, namedWatchlists]);

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
              .map((item) => ({
                ...item,
                ...(previousByKey.get(item.key) || {}),
                ...(indicesByKey.get(item.key) || {})
              }));
            localStorage.setItem(MARKET_INDICES_STORAGE_KEY, JSON.stringify(ordered));
            return ordered;
          });
          setIsMarketLoading(false);
          nextRefreshMs = response.data?.stale || response.data?.refreshing ? 3500 : 8 * 1000;
        } else {
          nextRefreshMs = 2500;
          setIsMarketLoading(true);
        }
      }
    } catch (error) {
      console.error("Market indices failed", error);
      nextRefreshMs = hasLoadedIndices ? 5000 : 2200;
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
  let isActive = true;
  let refreshTimer;
  let startTimer;

  const loadMarketHeatmap = async () => {
    if (!(marketHeatmap.companies || []).length) {
      setIsMarketHeatmapLoading(true);
    }
    let nextRefreshMs = 90 * 1000;
    try {
      const response = await axios.get(`${API_URL}/api/market-heatmap`, {
        timeout: 6500,
      });
      if (isActive) {
        const companies = Array.isArray(response.data?.companies) ? response.data.companies : [];
        const hasMissingQuotes = companies.some((company) =>
          !isNumber(company.price) || !isNumber(company.percentChange)
        );
        nextRefreshMs = hasMissingQuotes || response.data?.refreshing ? 4000 : 90 * 1000;
        setMarketHeatmap((previous) => {
          if (!companies.length && (previous.companies || []).length) return previous;
          return {
            companies,
            sectors: Array.isArray(response.data?.sectors) ? response.data.sectors : [],
            updatedAt: response.data?.updatedAt || null
          };
        });
      }
    } catch (error) {
      console.error("Market heat map failed", error);
      nextRefreshMs = 5000;
    } finally {
      if (isActive) {
        setIsMarketHeatmapLoading(false);
        refreshTimer = window.setTimeout(loadMarketHeatmap, nextRefreshMs);
      }
    }
  };

  const initialDelayMs = activePage === "market-overview" ? 0 : 9000;
  startTimer = window.setTimeout(loadMarketHeatmap, initialDelayMs);

  return () => {
    isActive = false;
    window.clearTimeout(startTimer);
    window.clearTimeout(refreshTimer);
  };
}, [activePage]);

useEffect(() => {
  if (!etfTicker) return;

  let isActive = true;
  let startTimer;

  const loadEtfData = async () => {
    setIsEtfLoading(true);
    setEtfError("");

    try {
      const response = await axios.get(`${API_URL}/api/etf/${etfTicker}`);
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

  const initialDelayMs = activePage === "etfs" ? 0 : 11000;
  startTimer = window.setTimeout(loadEtfData, initialDelayMs);

  return () => {
    isActive = false;
    window.clearTimeout(startTimer);
  };
}, [activePage, etfTicker]);

useEffect(() => {
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

  const initialDelayMs = activePage === "market-overview" ? 0 : 13000;
  startTimer = window.setTimeout(loadBroadMarketMovers, initialDelayMs);

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
    if (!ticker) return;
    const cacheKey = `${ticker}:${stockChartRange}`;
    const cachedChart = stockChartMemoryCacheRef.current.get(cacheKey);
    if (showLoading) {
      setIsStockChartLoading(true);
      setStockChartError("");
      if (cachedChart?.points?.length) {
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
            range: stockChartRange,
            fast: stockChartRange === "1D" && attempt === 0 ? "1" : undefined
          },
          timeout: stockChartRange === "1D" ? 6500 : 9000
        }
      );

      if (!isActive) return;

      const points = response.data.points || [];
      const latest = response.data.latest || null;
      const isFallbackHistory =
        response.data.stale && response.data.interval === "fallback";

      if (isFallbackHistory) {
        setStockChartMeta(latest);
        if (cachedChart?.points?.length) {
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
          updatedAt: response.data.updatedAt
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
        const hasCachedChart = Boolean(cachedChart?.points?.length);
        setStockChartError(
          hasCachedChart
            ? "Chart history is refreshing..."
            : attempt < 6
              ? "Chart history is still loading..."
              : "Still trying to load chart history..."
        );
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
}, [ticker, stockChartRange]);

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

  useEffect(() => () => {
    if (stockRetryTimerRef.current) {
      window.clearTimeout(stockRetryTimerRef.current);
    }
  }, []);

  useEffect(() => () => {
    window.speechSynthesis?.cancel();
  }, []);

  useEffect(() => {
    if (!loadedStockSymbol || loadedStockSymbol !== ticker || isStockLoading) return;
    let isActive = true;
    let retryTimer;

    const loadCompanyDocuments = (attempt = 0) => {
      if (!isActive) return;
      let willRetry = false;
      setIsCompanyDocumentsLoading(true);
      axios.get(`${API_URL}/api/company-documents/${ticker}`, { timeout: 45000 })
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

    const startTimer = window.setTimeout(loadCompanyDocuments, 1800);

    return () => {
      isActive = false;
      window.clearTimeout(startTimer);
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, [ticker, loadedStockSymbol, isStockLoading]);

  useEffect(() => {
    if (!loadedStockSymbol || loadedStockSymbol !== ticker || isStockLoading) return;
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

    const startTimer = window.setTimeout(loadEarningsCallPeriods, 1400);

    return () => {
      isActive = false;
      window.clearTimeout(startTimer);
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, [ticker, loadedStockSymbol, isStockLoading]);

  useEffect(() => {
    if (!loadedStockSymbol || loadedStockSymbol !== ticker || isStockLoading || isTranscriptPeriodsLoading) return;
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
  }, [ticker, loadedStockSymbol, isStockLoading, isTranscriptPeriodsLoading, selectedTranscriptPeriod, transcriptPeriodOptions]);

  useEffect(() => {
    if (!stockData?.price || stockData.symbol !== ticker) return;

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
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [ticker, stockData?.price, stockData?.updatedAt]);

  useEffect(() => {
    if (!loadedStockSymbol || loadedStockSymbol !== ticker || isStockLoading) return;

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

    const startTimer = window.setTimeout(loadSimilarCompanies, 1000);

    return () => {
      isActive = false;
      window.clearTimeout(startTimer);
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, [ticker, loadedStockSymbol, isStockLoading]);

  /*
    LOAD EARNINGS ON START
  */

  useEffect(() => {

    const timer = window.setTimeout(
      () => loadEarnings(earningsWeekStart),
      firstStockLoadSettled.current ? 250 : 2200
    );

    return () => window.clearTimeout(timer);

  }, [earningsWeekStart]);

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
          { timeout: 15000 }
        );

      if (requestId !== latestStockRequest.current) {
        return;
      }

      if (
        response.data.status === "pending"
      ) {
        setIsStockLoading(!stockMemoryCacheRef.current.has(symbol));
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
      const needsInterimHistory =
        attempt < 40 &&
        countInterimRows(stableResponse.revenueData || []) < MIN_USABLE_INTERIM_HISTORY_ROWS;
      const needsQuarterlyHistory =
        attempt < 40 &&
        (
          response.data.interimHistoryVersion !== INTERIM_HISTORY_VERSION ||
          stableResponse.interimHistoryVersion !== INTERIM_HISTORY_VERSION ||
          countInterimRows(stableResponse.revenueData || []) < MIN_USABLE_INTERIM_HISTORY_ROWS
        );
      const needsExtendedHistory =
        attempt < 40 &&
        !hasExtendedHistoricalChartData(stableResponse);
      const hasCurrentValuationMetrics =
        stableResponse.valuationMetricsVersion === VALUATION_METRICS_VERSION;
      const hasCurrentBalanceSheetMetrics =
        stableResponse.balanceSheetMetricsVersion === BALANCE_SHEET_METRICS_VERSION;
      const needsMoreMetricCards =
        attempt < 35 &&
        (
          !hasCurrentValuationMetrics ||
          overviewMetricCount(stableResponse) < 24
        );
      const needsNewStockWarmup =
        (!hadCachedStock || attempt < 30) &&
        shouldKeepWarmingNewStock(stableResponse);
      const needsMarketActivity =
        attempt < 25 &&
        !hasMarketActivityLoaded(stableResponse);
      const needsAnnualEstimates =
        attempt < 30 &&
        (
          stableResponse.estimateDataVersion !== STOCK_ESTIMATE_VERSION ||
          !hasAnnualEstimateData(stableResponse)
        );
      const needsQuarterEstimate =
        attempt < 30 &&
        !hasNextQuarterData(stableResponse);
      const needsBalanceSheetMetrics =
        attempt < 35 &&
        (
          !hasCurrentBalanceSheetMetrics ||
          !stableResponse.balanceSheetCheckedAt
        );
      const shouldContinueStockWarmup =
        needsNewStockWarmup ||
        needsFreshHistory ||
        needsInterimHistory ||
        needsQuarterlyHistory ||
        needsExtendedHistory ||
        needsMoreMetricCards ||
        needsMarketActivity ||
        needsAnnualEstimates ||
        needsQuarterEstimate ||
        needsBalanceSheetMetrics;

      if (
        shouldContinueStockWarmup &&
        (
          needsFreshHistory ||
          needsInterimHistory ||
          needsQuarterlyHistory ||
          needsExtendedHistory ||
          needsMoreMetricCards ||
          needsMarketActivity ||
          needsAnnualEstimates ||
          needsQuarterEstimate ||
          needsBalanceSheetMetrics ||
          needsNewStockWarmup
        ) &&
        attempt < 90
      ) {
        const retryDelay =
          attempt < 10
            ? 350
          : attempt < 18
              ? 550
            : (needsMarketActivity || needsBalanceSheetMetrics) && attempt < 28
              ? 900
              : attempt < 40
                ? 1300
                : 2500;
        scheduleRetry(retryDelay);
      }

      setPortfolioPrices((prev) => ({
        ...prev,
        [symbol]: stableResponse.price,
      }));

    } catch (error) {

      console.error(error);
      if (requestId !== latestStockRequest.current) return;

      if (error.response?.status === 400 || error.response?.status === 404) {
        setIsStockLoading(false);
        firstStockLoadSettled.current = true;
        return;
      }

      setIsStockLoading(!stockMemoryCacheRef.current.has(symbol));
      scheduleRetry(Math.min(5000, 1000 + attempt * 350));

    }
  };

useEffect(() => {

  if (!hasLoadedSavedLists) return;

  const hasSavedContent = Boolean(
    watchlist.length ||
    hasPortfolioPositions(portfolios) ||
    namedWatchlists.some((list) => (list.symbols || []).length)
    || Object.keys(savedProjections || {}).length
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
    })
  );

  if (!user || (!hasSavedContent && !hasMeaningfulSavedLists)) return;

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

}, [watchlist, portfolios, activePortfolioId, namedWatchlists, savedProjections, user, hasLoadedSavedLists]);
       
  
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
    setHasMeaningfulSavedLists(
      Boolean(
        mergedWatchlist.length ||
        hasPortfolioPositions(mergedPortfolios) ||
        mergedNamedWatchlists.some((list) => (list.symbols || []).length) ||
        Object.keys(mergedProjections).length
      )
    );

    console.log("Loaded user data");
  } catch (err) {
    console.error(err);
  } finally {
    setHasLoadedSavedLists(true);
  }
};
    
  /*
    LOAD EARNINGS
  */

  const loadEarnings = async (weekStart) => {

    try {
      setIsEarningsLoading(true);

      const earningsRes =
        await axios.get(

    `${API_URL}/api/earnings`,
          { params: { start: weekStart } }
        );

      const calendar = earningsRes.data || { days: [] };
      setEarnings(calendar);
      const availableDates = (calendar.days || []).map((day) => day.date);
      setSelectedEarningsDate((current) => {
        const today = toLocalIsoDate(new Date());
        if (availableDates.includes(current)) return current;
        if (availableDates.includes(today)) return today;
        return availableDates.find((date) =>
          calendar.days.find((day) => day.date === date)?.events?.length
        ) || availableDates[0] || weekStart;
      });

    } catch (err) {

      console.error(err);

    } finally {

      setIsEarningsLoading(false);

    }
  };

  /*
    LOAD PORTFOLIO PRICE
  */

  const loadSavedPrices = async (symbols, attempt = 0, options = {}) => {
    if (!symbols.length) return;

    const applyPricePayload = (receivedPrices = {}, receivedDetails = {}) => {
      setPortfolioPrices((prev) => ({ ...prev, ...receivedPrices }));
      setSavedSymbolDetails((prev) => {
        const next = { ...prev };
        Object.entries(receivedDetails).forEach(([symbol, detail]) => {
          next[symbol] = {
            ...prev[symbol],
            ...detail,
            percentChange: isNumber(detail?.percentChange)
              ? detail.percentChange
              : prev[symbol]?.percentChange,
            change: isNumber(detail?.change)
              ? detail.change
              : prev[symbol]?.change
          };
        });
        return next;
      });
    };

    try {
      const symbolChunks = chunkSymbols(symbols, options.live ? 8 : 12);
      const receivedPrices = {};
      const receivedDetails = {};

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
          const chunkPrices = response.data?.prices || {};
          const chunkDetails = response.data?.details || {};
          Object.assign(receivedPrices, chunkPrices);
          Object.assign(receivedDetails, chunkDetails);
          applyPricePayload(chunkPrices, chunkDetails);
        } catch (chunkError) {
          if (attempt < 2) {
            window.setTimeout(
              () => loadSavedPrices(symbolChunk, attempt + 1, options),
              5000
            );
          } else {
            console.error(chunkError);
          }
        }
      }

      const missingSymbols = symbols.filter(
        (symbol) =>
          !isNumber(receivedPrices[symbol]) ||
          !isNumber(receivedDetails[symbol]?.percentChange)
      );

      if (missingSymbols.length && attempt < 2) {
        window.setTimeout(
          () => loadSavedPrices(missingSymbols, attempt + 1, options),
          4000
        );
      }

    } catch (err) {
      if (attempt < 2) {
        window.setTimeout(() => loadSavedPrices(symbols, attempt + 1, options), 8000);
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
const revenueHistory = filterChartRowsByMode(allRevenueHistory, financialChartMode);

const allEarningsHistory =
  buildChartRows(financialHistory, "earnings");
const earningsHistory = filterChartRowsByMode(allEarningsHistory, financialChartMode);

const allEpsHistory =
  buildChartRows(financialHistory, "eps");
const epsHistory = filterChartRowsByMode(allEpsHistory, financialChartMode);
const epsBeatMissRows = Array.isArray(stockData?.epsBeatMiss)
  ? stockData.epsBeatMiss
  : [];
const revenueGrowthRows = buildAnnualGrowthRows(allRevenueHistory, "revenue");
const earningsGrowthRows = buildAnnualGrowthRows(allEarningsHistory, "earnings");
const epsGrowthRows = buildAnnualGrowthRows(allEpsHistory, "eps");
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
    filterChartRowsByMode(buildChartRows(financialHistory, "operatingCashflow"), financialChartMode),
    "operatingCashflow",
    stockData?.operatingCashflow,
    (value) => value / 1e9
  );
const freeCashflowHistory =
  chartRowsWithCurrentFallbackForMode(
    filterChartRowsByMode(buildChartRows(financialHistory, "freeCashflow"), financialChartMode),
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
const sharesOutstandingHistory =
  chartRowsWithCurrentFallbackForMode(
    filterChartRowsByMode(buildChartRows(financialHistory, "sharesOutstanding"), financialChartMode),
    "sharesOutstanding",
    stockData?.sharesOutstanding
  );
const historicalPeHistoryBase = (stockData?.historicalPe || [])
  .map((row) => ({ ...row, period: row.period || String(row.year) }))
  .filter((row) =>
    row?.year &&
    (row.isInterim || row.isCurrent || row.year <= new Date().getFullYear()) &&
    isNumber(row.pe)
  );
const annualHistoricalPeHistoryBase = filterChartRowsByMode(historicalPeHistoryBase, "annual");
const historicalPeHistory =
  chartRowsWithCurrentFallback(annualHistoricalPeHistoryBase, "pe", stockData?.pe);
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
const visibleMarginHistory = filterChartRowsByMode(mergedMarginHistory, financialChartMode);
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
const isQuarterlyHistoryRefreshPending =
  isStockLoading ||
  stockData?.interimHistoryVersion !== INTERIM_HISTORY_VERSION ||
  (stockData?.refreshing && currentInterimHistoryRowCount < MIN_USABLE_INTERIM_HISTORY_ROWS) ||
  (
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
    revenue: isNumber(row.revenue) ? row.revenue * 1e9 : fallback.revenue,
    earnings: isNumber(row.earnings) ? row.earnings * 1e9 : fallback.earnings,
    eps: isNumber(row.eps) ? row.eps : fallback.eps
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
  fiscalQuarter: nextQuarterSource.fiscalQuarter || null
};
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
  eps: isNumber(nextYearSource.eps) ? nextYearSource.eps : null
};
const currentYearRevenueGrowth = calculateEstimateGrowth(
  currentYearEstimate?.revenue,
  previousYearEstimate?.revenue
);
const currentYearEarningsGrowth = calculateEstimateGrowth(
  currentYearEstimate?.earnings,
  previousYearEstimate?.earnings
);
const nextYearRevenueGrowth = calculateEstimateGrowth(
  nextYearEstimate?.revenue,
  currentYearEstimate?.revenue
);
const nextYearEarningsGrowth = calculateEstimateGrowth(
  nextYearEstimate?.earnings,
  currentYearEstimate?.earnings
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

  if (key === "revenueGrowth" && year === 2027 && isNumber(nextYearRevenueGrowth)) {
    return nextYearRevenueGrowth.toFixed(2);
  }

  if (key === "netIncomeGrowth" && year === 2027 && isNumber(nextYearEarningsGrowth)) {
    return nextYearEarningsGrowth.toFixed(2);
  }

  return getProjectionAssumptionValue(caseSettings, key, year);
};
const projectionShareBase =
  isNumber(stockData?.sharesOutstanding) && stockData.sharesOutstanding > 0
    ? stockData.sharesOutstanding * 1000000
    : isNumber(currentYearEstimate?.earnings) && isNumber(currentYearEstimate?.eps) && currentYearEstimate.eps !== 0
      ? currentYearEstimate.earnings / currentYearEstimate.eps
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
  const baseRevenueOverride = parseInputNumber(getProjectionInputValue(caseId, "revenue", year));
  const baseNetIncomeOverride = parseInputNumber(getProjectionInputValue(caseId, "netIncome", year));
  const baseSharesOverride = parseInputNumber(getProjectionInputValue(caseId, "shares", year));
  const revenue = isBaseYear
    ? firstNumber(baseRevenueOverride, currentYearEstimate?.revenue)
    : isNumber(previousRow?.revenue)
      ? previousRow.revenue * (1 + revenueGrowthRate)
      : null;
  const netIncome = isBaseYear
    ? firstNumber(baseNetIncomeOverride, currentYearEstimate?.earnings)
    : isNumber(previousRow?.netIncome)
      ? previousRow.netIncome * (1 + netIncomeGrowthRate)
      : null;
  const shares = isBaseYear
    ? firstNumber(baseSharesOverride, projectionShareBase)
    : isNumber(previousRow?.shares)
      ? previousRow.shares * (1 + sharesGrowthRate)
      : null;
  const eps = isBaseYear && isNumber(currentYearEstimate?.eps)
    ? currentYearEstimate.eps
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
    stockData?.estimateDataVersion !== STOCK_ESTIMATE_VERSION ||
    !stockData?.quarterEstimateCheckedAt) &&
  !stockData?.quarterEstimateCheckedAt &&
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
const areMetricsRefreshing =
  isInitialStockLoad ||
  (isStockLoading && !hasUsableMetricSnapshot);
const stockValue = (value) =>
  areMetricsRefreshing && (value === "N/A" || value === null || value === undefined)
    ? "Loading..."
    : value;
const metricValue = (value) =>
  areMetricsRefreshing && (value === "N/A" || value === null || value === undefined)
    ? "Loading..."
    : stockValue(value);
const isBalanceSheetMetricsRefreshing =
  isInitialStockLoad ||
  (isStockLoading && !hasUsableMetricSnapshot && !stockData?.balanceSheetCheckedAt);
const balanceSheetValue = (value) =>
  (areMetricsRefreshing || isBalanceSheetMetricsRefreshing) &&
  (value === "N/A" || value === null || value === undefined)
    ? "Loading..."
    : stockValue(value);
const estimateValue = (value) =>
  (isInitialStockLoad || areEstimatesRefreshing) && (value === "N/A" || value === null || value === undefined)
    ? "Loading..."
    : stockValue(value);
const nextQuarterValue = (value) =>
  (isInitialStockLoad || isNextQuarterRefreshing) && (value === "N/A" || value === null || value === undefined)
    ? "Loading..."
    : stockValue(value);
const analystUpdateRows = stockData.analystUpdates || [];
const institutionalHolderRows = stockData.institutionalHolders || [];
const insiderMoveRows = stockData.insiderTransactions || [];
const isAnalystUpdatesLoading =
  (isInitialStockLoad || stockData?.refreshing) &&
  !stockData?.analystUpdatesCheckedAt &&
  !analystUpdateRows.length;
const isInstitutionalHoldersLoading =
  (isInitialStockLoad || stockData?.refreshing) &&
  !stockData?.institutionalHoldersCheckedAt &&
  !institutionalHolderRows.length;
const isInsiderMovesLoading =
  (isInitialStockLoad || stockData?.refreshing) &&
  !stockData?.insiderTransactionsCheckedAt &&
  !insiderMoveRows.length;
const selectedEarningsDay = (earnings?.days || []).find(
  (day) => day.date === selectedEarningsDate
) || { date: selectedEarningsDate, events: [] };
const earningsWeekLabel = earnings?.weekStart && earnings?.weekEnd
  ? `${new Date(`${earnings.weekStart}T12:00:00`).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric"
    })} - ${new Date(`${earnings.weekEnd}T12:00:00`).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric"
    })}`
  : "This week";
const portfolioAllocationData = portfolio.map((position, index) => {
  const currentPrice = portfolioPrices[position.symbol];
  const allocationPrice = isNumber(currentPrice) && currentPrice > 0
    ? currentPrice
    : Number(position.avgCost) || 0;
  return {
    key: `${position.symbol}-${position.avgCost}-${index}`,
    name: position.symbol,
    value: allocationPrice * Number(position.shares || 0)
  };
}).filter((position) => position.value > 0);
const totalPortfolioValue = portfolioAllocationData.reduce(
  (total, position) => total + position.value,
  0
);
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
const showExtendedMarketData = marketClock.tone !== "open";
const activeExtendedHours = getExtendedHoursQuote(
  stockData,
  savedSymbolDetails[ticker]
);
const displayedStockPrice = stockChartMeta?.price ?? stockData?.price;
const displayedMarketIndices = MARKET_INDEX_ORDER.map((item) => ({
  ...item,
  ...(marketIndices.find((index) => index.key === item.key) || {})
}));
const heatmapCompanies = marketHeatmap.companies || [];
const heatmapSectors = marketHeatmap.sectors || [];
const heatmapMovers = heatmapCompanies
  .filter((company) => isNumber(company.percentChange))
  .sort((a, b) => b.percentChange - a.percentChange);
const heatmapTopGainers = heatmapMovers.slice(0, 6);
const heatmapTopLosers = [...heatmapMovers].reverse().slice(0, 6);
const heatmapSectorGroups = heatmapSectors.map((sector) => ({
  ...sector,
  id: `heatmap-sector-${String(sector.name || "other").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
  companies: heatmapCompanies
    .filter((company) => (company.sector || "Other") === sector.name)
    .sort((a, b) => {
      const weightDiff = (b.weight || 1) - (a.weight || 1);
      if (weightDiff !== 0) return weightDiff;
      return String(a.symbol).localeCompare(String(b.symbol));
    })
})).filter((sector) => sector.companies.length);
const etfStats = etfData?.stats || {};
const etfProfile = etfData?.profile || {};
const topEtfHoldings = etfData?.holdings || [];
const isMutualFundView = /mutual fund/i.test(String(etfData?.type || etfProfile.assetClass || ""));
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
            {showExtendedMarketData && index.futures && (
              <span className="market-index-futures">
                <span>Futures</span>
                <strong>{formatIndexPrice(index.futures.price)}</strong>
                <em className={
                  index.futures.percentChange >= 0
                    ? "positive-text"
                    : "negative-text"
                }>
                  {formatSignedPercent(index.futures.percentChange)}
                </em>
              </span>
            )}
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

const comparisonMetricsForStock = (stock = {}) => [
  { label: "Market Cap", value: formatBillions(stock.marketCap) },
  { label: "Cash & Equivalents", value: formatBillions(stock.cashAndCashEquivalents ?? stock.totalCash) },
  { label: "Total Debt", value: formatBillions(stock.totalDebt) },
  { label: "Net Cash", value: formatBillions(stock.netCash) },
  { label: "Net Cash / Share", value: formatPrice(stock.netCashPerShare) },
  { label: "Equity Book Value", value: formatBillions(stock.equityBookValue) },
  { label: "Book Value / Share", value: formatPrice(stock.bookValuePerShare) },
  { label: "Working Capital", value: formatBillions(stock.workingCapital) },
  { label: "Current P/E", value: formatPlain(stock.pe) },
  { label: "Forward P/E", value: formatPlain(stock.forwardPE) },
  { label: "Forward P/S", value: formatPlain(stock.forwardPS) },
  { label: "PEG Ratio", value: formatPlain(stock.pegRatio) },
  { label: "Price-to-Sales", value: formatPlain(stock.priceToSales) },
  { label: "Price-to-Book", value: formatPlain(stock.priceToBook) },
  { label: "P/TBV Ratio", value: formatPlain(stock.priceToTangibleBook) },
  { label: "P/FCF Ratio", value: formatPlain(stock.priceToFreeCashflow) },
  { label: "P/OCF Ratio", value: formatPlain(stock.priceToOperatingCashflow) },
  { label: "Revenue Growth", value: formatPercent(stock.revenueGrowth) },
  { label: "Earnings Growth", value: formatPercent(stock.earningsGrowth) },
  {
    label: "Shares Outstanding",
    value: isNumber(stock.sharesOutstanding) ? `${(stock.sharesOutstanding / 1000).toFixed(2)}B` : "N/A"
  },
  { label: "Employee Count", value: formatSharesCount(stock.employeeCount) },
  { label: "Revenue / Employee", value: formatLargeDollars(stock.revenuePerEmployee) },
  { label: "Profit / Employee", value: formatLargeDollars(stock.profitsPerEmployee) },
  {
    label: stock.isFinancialCompany ? "Net Interest Revenue Mix" : "Gross Margin",
    value: formatPercent(stock.isFinancialCompany ? stock.bankMetrics?.netInterestRevenueMix : stock.grossMargins)
  },
  {
    label: stock.isFinancialCompany ? "Pre-Tax Margin" : "Operating Margin",
    value: formatPercent(stock.isFinancialCompany ? stock.bankMetrics?.preTaxMargin : stock.operatingMargins)
  },
  { label: "Profit Margin", value: formatPercent(stock.profitMargins) },
  { label: "Pretax Margin", value: formatPercent(stock.pretaxMargin) },
  { label: "EBITDA Margin", value: formatPercent(stock.ebitdaMargin) },
  { label: "EBIT Margin", value: formatPercent(stock.ebitMargin) },
  { label: "FCF Margin", value: formatPercent(stock.fcfMargin) },
  { label: "ROE", value: formatPercent(stock.returnOnEquity) },
  { label: "ROA", value: formatPercent(stock.returnOnAssets) },
  { label: "ROIC", value: formatPercent(stock.returnOnInvestedCapital) },
  { label: "ROCE", value: formatPercent(stock.returnOnCapitalEmployed) },
  { label: "WACC", value: formatPercent(stock.weightedAverageCostOfCapital) },
  {
    label: stock.isFinancialCompany ? "Annual Cash Change" : "Free Cash Flow",
    value: formatBillions(stock.isFinancialCompany ? stock.bankMetrics?.annualCashChange : stock.freeCashflow)
  },
  ...(!stock.isFinancialCompany
    ? [{ label: "Operating Cash Flow", value: formatBillions(stock.operatingCashflow) }]
    : []),
  { label: "Price Target", value: formatPrice(stock.targetMean) },
  { label: "Analyst Rating", value: stock.analystRatingText || stock.recommendationKey || "N/A" },
  { label: "Dividend Yield", value: formatDividendYield(stock.dividendYield) },
  {
    label: "52-Week Range",
    value: isNumber(stock.fiftyTwoWeekLow) && isNumber(stock.fiftyTwoWeekHigh)
      ? `${formatPrice(stock.fiftyTwoWeekLow)} to ${formatPrice(stock.fiftyTwoWeekHigh)}`
      : "N/A"
  }
];

const comparisonSection = (
  <div className="chart-section" id="comparison">

    <h2 className="section-title">
      Multi-Stock Comparison
    </h2>
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

      {comparisonMetricsForStock(stock).map((metric) => (
        <div className="comparison-stat" key={metric.label}>
          <span>{metric.label}</span>
          <strong>{metric.value}</strong>
        </div>
      ))}

    </div>

  ))}

    </div>

  </div>
);

const handleStockSearchSubmit = (event, destinationPage = "overview") => {
  event.preventDefault();
  const symbol = searchInput.trim().toUpperCase();
  if (!symbol) return;

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

const openPage = (page) => {
  setActivePage(page);
  window.scrollTo({ top: 0, behavior: "smooth" });
};


 

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

    <div className="top-watchlist">

      <div className="watchlist-label">Watchlist</div>

      <div className="watchlist-scroll">

        {watchlist.map((item) => (

          <div
            key={item}
            className="watchlist-stock"
            onClick={() => {
              setSearchInput(item);
              setTicker(item);
              setActivePage("overview");
            }}
          >

            <span className="watch-logo-shell" aria-hidden="true">
              <span className="watch-logo-fallback">{item.slice(0, 1)}</span>
              <img
                className="watch-logo"
                src={savedSymbolDetails[item]?.logo || getDefaultCompanyLogoUrl(item)}
                alt=""
                onError={(event) => handleCompanyLogoError(event, item)}
              />
            </span>

            <span className="watch-symbol">
              {item}
            </span>

            <span className="watch-price">
              $
              {portfolioPrices[item]
                ?.toFixed(2) || "--"}
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

        ))}

        <input
          className="watchlist-add-input"
          placeholder="+ Add"
          value={newTicker}
          onFocus={(event) => {
            if (!user) {
              event.currentTarget.blur();
              requireAuth("Log in or sign up to add stocks to your watchlist.");
            }
          }}
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
              if (!requireAuth("Log in or sign up to add stocks to your watchlist.")) {
                return;
              }

              if (
                !watchlist.includes(
                  newTicker
                )
              ) {

                setWatchlist([
                  ...watchlist,
                  newTicker,
                ]);
              }

              setNewTicker("");
            }
          }}
        />

      </div>

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
        ["projections", "Projections"],
        ["comparison", "Compare"],
        ["portfolio", "Portfolio"],
        ["watchlists", "Watchlists"],
        ["etfs", "ETF Overview"],
        ["earnings-calendar", "Calendar"],
        ["market-overview", "Market Overview"],
        ["mr-rally", "Mr. Rally"]
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
    </>
    )}

    {activePage === "market-overview" && (
      <section className="market-overview-page" id="market-overview" aria-labelledby="market-overview-title">
        <div className="section-heading-row market-overview-heading">
          <div>
            <div className="welcome-kicker">Market dashboard</div>
            <h2 id="market-overview-title">Market Overview</h2>
            <p>Track the major indexes, the next market session, and where leadership is moving across the S&P 500.</p>
          </div>
          {marketHeatmap.updatedAt && (
            <span className="market-overview-updated">
              Updated {new Date(marketHeatmap.updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </span>
          )}
        </div>

        {marketOverviewStrip}

        <section className="sp500-heatmap-section" aria-labelledby="sp500-heatmap-title">
          <div className="heatmap-header">
            <div>
              <span className="home-feature-label">S&P 500 Heat Map</span>
              <h3 id="sp500-heatmap-title">Sector leadership at a glance</h3>
            </div>
            <div className="heatmap-legend" aria-label="Heat map color legend">
              <span className="legend-down">Down</span>
              <span className="legend-flat">Flat</span>
              <span className="legend-up">Up</span>
            </div>
          </div>

          {isMarketHeatmapLoading && !heatmapCompanies.length ? (
            <div className="heatmap-loading">Loading market map...</div>
          ) : heatmapCompanies.length ? (
            <>
              <div className="heatmap-sector-summary">
                {heatmapSectors.map((sector) => (
                  <button
                    className={`heatmap-sector-pill ${getHeatMapTone(sector.averagePercentChange)}`}
                    key={sector.name}
                    type="button"
                    onClick={() => {
                      const id = `heatmap-sector-${String(sector.name || "other").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
                      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                    }}
                  >
                    {sector.name}
                    <strong>{formatSignedPercent(sector.averagePercentChange)}</strong>
                  </button>
                ))}
              </div>
              <div className="sp500-heatmap-grid">
                {heatmapSectorGroups.map((sector) => (
                  <section className="heatmap-sector-block" id={sector.id} key={sector.name}>
                    <div className="heatmap-sector-title">
                      <span>{sector.name}</span>
                      <strong>{formatSignedPercent(sector.averagePercentChange)}</strong>
                      <small>{sector.count} stocks</small>
                    </div>
                    <div className="heatmap-sector-tiles">
                      {sector.companies.map((company) => (
                        <button
                          className={`sp500-heatmap-tile ${getHeatMapTone(company.percentChange)}`}
                          key={company.symbol}
                          type="button"
                          style={getHeatMapTileStyle(company)}
                          onClick={() => {
                            setSearchInput(company.symbol);
                            setTicker(company.symbol);
                            setActivePage("overview");
                          }}
                          title={`${company.name} ${isNumber(company.percentChange) ? formatSignedPercent(company.percentChange) : "Loading"}`}
                        >
                          <span className="heatmap-symbol">{company.symbol}</span>
                          <span className="heatmap-name">{company.name}</span>
                          <strong>{isNumber(company.percentChange) ? formatSignedPercent(company.percentChange) : "Loading"}</strong>
                          <small>{isNumber(company.price) ? formatPrice(company.price) : "Loading"}</small>
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
              <div className="market-movers-grid">
                {renderMarketMoverPanel("Top Gainers", heatmapTopGainers, "positive", "S&P 500", isMarketHeatmapLoading)}
                {renderMarketMoverPanel("Top Losers", heatmapTopLosers, "negative", "S&P 500", isMarketHeatmapLoading)}
              </div>
              <div className="market-movers-block">
                <div className="market-movers-block-heading">
                  <span>Entire Market Movers</span>
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
              </div>
            </>
          ) : (
            <div className="heatmap-loading">Market map is loading. Try again in a moment.</div>
          )}
        </section>
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
            onSubmit={(event) => {
              event.preventDefault();
              const symbol = etfSearchInput.trim().toUpperCase();
              if (!symbol) return;
              setEtfData(null);
              setEtfError("");
              setIsEtfLoading(true);
              setEtfTicker(symbol);
            }}
          >
            <input
              value={etfSearchInput}
              onChange={(event) => setEtfSearchInput(event.target.value.toUpperCase())}
              placeholder="Search ETF or fund ticker"
              aria-label="Search ETF or fund ticker"
            />
            <button type="submit">{isEtfLoading ? "Loading..." : "Search Fund"}</button>
          </form>
        </div>

        {isEtfLoading && !etfData ? (
          <div className="heatmap-loading">Loading {etfTicker} fund data...</div>
        ) : etfError ? (
          <div className="heatmap-loading">{etfError}</div>
        ) : etfData ? (
          <>
            <div className="etf-hero-panel">
              <div>
                <span className="etf-symbol">{etfData.symbol}</span>
                <h3>{etfData.name}</h3>
                {etfData.type && <strong className="etf-type-badge">{etfData.type}</strong>}
                <p>{etfData.description || "Fund profile and holdings data from the latest available source."}</p>
              </div>
              <div className="etf-price-card">
                <span>{isMutualFundView ? "NAV / Price" : "Price"}</span>
                <strong>{formatPrice(etfData.price)}</strong>
                <em className={isNumber(etfData.percentChange) && etfData.percentChange < 0 ? "red" : "green"}>
                  {formatSignedPercent(etfData.percentChange)}
                </em>
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


    {/* SEARCH */}
    {activePage === "overview" && (
    <>

<form
  className="topbar"
  id="overview"
  onSubmit={handleStockSearchSubmit}
>

  <input
    className="search"
    value={searchInput}
    onChange={(e) =>
      setSearchInput(
        e.target.value.toUpperCase()
      )
    }
    placeholder="Search ticker..."
  />

  <button className="stock-search-button" type="submit">
    Search
  </button>

  {isStockLoading && (
    <span
      style={{
        color: "#9ca3af",
        fontSize: "14px",
      }}
    >
      Loading...
    </span>
  )}

</form>
        {/* HEADER */}

        <div className="stock-header">

          {(stockData.logo || savedSymbolDetails[ticker]?.logo) && (
            <img
              key={ticker}
              className="stock-company-logo"
              src={stockData.logo || savedSymbolDetails[ticker]?.logo}
              alt={`${stockData.name} logo`}
              onError={(event) => handleCompanyLogoError(event, ticker)}
            />
          )}

          <div className="stock-header-copy">
            <div className="stock-name">
              {stockData.name}
            </div>

            <div className="stock-price">
              {isNumber(displayedStockPrice)
                ? `$${displayedStockPrice.toFixed(2)}`
                : "--"}
            </div>

            {showExtendedMarketData && activeExtendedHours && (
              <div className="extended-hours-quote">
                <span>{activeExtendedHours.label}</span>
                <strong>{formatPrice(activeExtendedHours.price)}</strong>
                <em className={
                  activeExtendedHours.percentChange >= 0
                    ? "positive-text"
                    : "negative-text"
                }>
                  {formatSignedPercent(activeExtendedHours.percentChange)}
                </em>
              </div>
            )}

            <div className="stock-change">
              {stockData.symbol}
            </div>
          </div>

        </div>
        {/* LIVE STOCK CHART */}

<div className="chart-section native-stock-chart-section">

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
        <div className="ai-sentiment">
          {aiAnalysis.verdict.stance} · {aiAnalysis.verdict.score}/100
        </div>

        <p className="ai-text">{aiAnalysis.verdict.summary}</p>

        <div className="ai-analysis-grid">
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

        <div className="ai-analysis-grid">
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

  <div className="ai-analysis-grid">
    {isAiLoading && !aiAnalysis ? (
      <div className="ai-card"><p className="ai-text">Reviewing earnings data...</p></div>
    ) : aiAnalysis?.earningsAnalysis ? (
      <>
        <div className="ai-card">
          <h3 className="ai-title">Latest Earnings Readout</h3>
          <p className="ai-text">{aiAnalysis.earningsAnalysis.period}</p>
          <p className="ai-text">{aiAnalysis.earningsAnalysis.summary}</p>
        </div>

        <div className="ai-card">
          <h3 className="ai-title">Reported Highlights</h3>
          <ul className="ai-list">
            {aiAnalysis.earningsAnalysis.highlights.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        <div className="ai-card bullish-card">
          <h3 className="ai-title">Positive Signals</h3>
          <ul className="ai-list">
            {aiAnalysis.earningsAnalysis.positives.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        <div className="ai-card bearish-card">
          <h3 className="ai-title">Pressure Points</h3>
          <ul className="ai-list">
            {aiAnalysis.earningsAnalysis.risks.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        <div className="ai-card">
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

        <div className="ai-card">
          <h3 className="ai-title">Consensus Outlook</h3>
          <p className="ai-text">{aiAnalysis.earningsAnalysis.outlook}</p>
        </div>

        <div className="ai-card">
          <h3 className="ai-title">Questions for Management</h3>
          <ul className="ai-list">
            {aiAnalysis.earningsAnalysis.questions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
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
            {period.label}{period.provider ? ` · ${period.provider}` : ""}
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
          <div className="earnings-call-provider">
            {earningsCall.provider}
          </div>
        </div>

        {earningsCall.audioUrl ? (
          <div className="earnings-call-audio">
            <div>
              <span>Earnings Call Audio</span>
              <small>{earningsCall.provider ? `${earningsCall.provider} audio` : "Audio replay"}</small>
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
  labelFormatter={formatChartPeriodLabel}
  formatter={(value, name, props) => [
    formatChartBillions(value),
    formatChartTooltipName(props?.payload?.period, "Revenue")
  ]}
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
            labelFormatter={formatChartPeriodLabel}
            formatter={(value, name, props) => [
              formatChartBillions(value),
              formatChartTooltipName(props?.payload?.period, "Net Income")
            ]}
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

  <h2 className="section-title">
    EPS Chart
  </h2>

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
            labelFormatter={formatChartPeriodLabel}
            formatter={(value, name, props) => [
              formatChartEps(value),
              formatChartTooltipName(props?.payload?.period, "EPS")
            ]}
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

      <EpsBeatMissChart rows={epsBeatMissRows} />

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
    data={readyHistoryRows(historicalPeHistory)}
    dataKey="pe"
    color="#60a5fa"
    formatter={(value) => `${Number(value).toFixed(1)}x`}
    valueLabel="P/E"
    loading={shouldShowAnnualHistoryLoading(historicalPeHistory)}
    mode="annual"
  />
  <HistoricalLineChart
    title={stockData.isFinancialCompany ? "Net Interest Revenue Mix" : "Gross Margin History"}
    data={readyHistoryRows(grossMarginHistory)}
    dataKey="grossMargin"
    color="#a78bfa"
    formatter={(value) => `${Number(value).toFixed(1)}%`}
    valueLabel={stockData.isFinancialCompany ? "Net Interest Revenue Mix" : "Gross Margin"}
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
    loading={shouldShowHistoryLoading(freeCashflowHistory)}
    mode={financialChartMode}
  />
  <HistoricalLineChart
    title="Shares Outstanding History"
    data={readyHistoryRows(sharesOutstandingHistory)}
    dataKey="sharesOutstanding"
    color="#f472b6"
    formatter={formatSharesMillions}
    valueLabel="Shares"
    loading={shouldShowHistoryLoading(sharesOutstandingHistory)}
    mode={financialChartMode}
  />
</div>

        {/* METRICS */}

   <div className="grid section-anchor" id="metrics">

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
      Current P/E
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
      PEG Ratio
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
      Revenue Growth
    </div>

    <div className="card-value">
{metricValue(formatPercent(stockData.revenueGrowth))}
    </div>
  </div>

  <div className="card">
    <div className="card-title">
      Earnings Growth
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
    : latestFreeCashflowFromChart
))}
    </div>
  </div>

  {!stockData.isFinancialCompany && (
  <div className="card">
    <div className="card-title">
      Operating Cash Flow
    </div>

    <div className="card-value">
{metricValue(formatBillions(latestOperatingCashflowFromChart))}
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

<div
  style={{
    marginTop: "40px",
    padding: "30px",
    background: "#0b1117",
    borderRadius: "18px",
    border: "1px solid #1f2937",
    color: "white",
  }}
>

<h2
  style={{
    color: "white",
    fontSize: "24px",
    fontWeight: "700",
    marginBottom: "20px",
  }}
>
  Analyst Estimates
</h2>

  <div
  style={{
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "24px",
    maxWidth: "1100px",
    margin: "0 auto",
  }}
>

    {/* Previous Year */}
    <div
  style={{
    padding: "20px",
    borderRadius: "14px",
    background: "#111827",
    border: "1px solid #1f2937",
  }}
>

      <h3 className="text-lg font-semibold mb-3">
        {previousYearLabel}
      </h3>

      <div className="space-y-2">

        <div
  style={{
    display: "flex",
    justifyContent: "space-between",
    gap: "20px",
    marginBottom: "10px",
  }}
>
          <span>Revenue</span>

          <span>
            {estimateValue(formatEstimateMoney(
              previousYearEstimate?.revenue
            ))}
          </span>
        </div>

        <div
  style={{
    display: "flex",
    justifyContent: "space-between",
    gap: "20px",
    marginBottom: "10px",
  }}
>
          <span>Net Income</span>

          <span>
            {estimateValue(formatEstimateMoney(
              previousYearEstimate?.earnings
            ))}
          </span>
        </div>

<div
  style={{
    display: "flex",
    justifyContent: "space-between",
    gap: "20px",
    marginBottom: "10px",
  }}
>
          <span>EPS</span>

          <span>
            {estimateValue(formatEstimateEps(
              previousYearEstimate?.eps
            ))}
          </span>
        </div>

      </div>

    </div>

    {/* Next Quarter */}
    <div
  style={{
    padding: "20px",
    borderRadius: "14px",
    background: "#111827",
    border: "1px solid #1f2937",
  }}
>

      <h3 className="text-lg font-semibold mb-3">
        Next Quarter
      </h3>

      <div className="space-y-2">

<div
  style={{
    display: "flex",
    justifyContent: "space-between",
    gap: "20px",
    marginBottom: "10px",
  }}
>
          <span>Revenue</span>

          <span>
            {nextQuarterValue(formatEstimateMoney(
              nextQuarterEstimate?.revenue
            ))}
          </span>
        </div>

<div
  style={{
    display: "flex",
    justifyContent: "space-between",
    gap: "20px",
    marginBottom: "10px",
  }}
>
          <span>EPS</span>

          <span>
            {nextQuarterValue(formatEstimateEps(
              nextQuarterEstimate?.eps
            ))}
          </span>
        </div>

<div
  style={{
    display: "flex",
    justifyContent: "space-between",
    gap: "20px",
    marginBottom: "10px",
  }}
>
          <span>Report</span>

          <span>
            {nextQuarterValue(nextQuarterDateLabel || nextQuarterEstimate?.fiscalQuarter || "N/A")}
          </span>
        </div>

      </div>

    </div>

    {/* Current Year */}
    <div
  style={{
    padding: "20px",
    borderRadius: "14px",
    background: "#111827",
    border: "1px solid #1f2937",
  }}
>

      <h3 className="text-lg font-semibold mb-3">
        Current Year
      </h3>

      <div className="space-y-2">

<div
  style={{
    display: "flex",
    justifyContent: "space-between",
    gap: "20px",
    marginBottom: "10px",
  }}
>
          <span>Revenue</span>

          <span>
            {estimateValue(formatEstimateMoney(
              currentYearEstimate?.revenue
            ))}
          </span>
        </div>

<div
  style={{
    display: "flex",
    justifyContent: "space-between",
    gap: "20px",
    marginBottom: "10px",
  }}
>
          <span>Net Income</span>

          <span>
            {estimateValue(formatEstimateMoney(
              currentYearEstimate?.earnings
            ))}
          </span>
        </div>

<div
  style={{
    display: "flex",
    justifyContent: "space-between",
    gap: "20px",
    marginBottom: "10px",
  }}
>
          <span>EPS</span>

          <span>
            {estimateValue(formatEstimateEps(
              currentYearEstimate?.eps
            ))}
          </span>
        </div>

      </div>

    </div>

    {/* Next Year */}
    <div
  style={{
    padding: "20px",
    borderRadius: "14px",
    background: "#111827",
    border: "1px solid #1f2937",
  }}
>

      <h3 className="text-lg font-semibold mb-3">
        Next Year
      </h3>

      <div className="space-y-2">

<div
  style={{
    display: "flex",
    justifyContent: "space-between",
    gap: "20px",
    marginBottom: "10px",
  }}
>
          <span>Revenue</span>

          <span>
            {estimateValue(formatEstimateMoney(
              nextYearEstimate?.revenue
            ))}
          </span>
        </div>

<div
  style={{
    display: "flex",
    justifyContent: "space-between",
    gap: "20px",
    marginBottom: "10px",
  }}
>
          <span>Net Income</span>

          <span>
            {estimateValue(formatEstimateMoney(
              nextYearEstimate?.earnings
            ))}
          </span>
        </div>

<div
  style={{
    display: "flex",
    justifyContent: "space-between",
    gap: "20px",
    marginBottom: "10px",
  }}
>
          <span>EPS</span>

          <span>
            {estimateValue(formatEstimateEps(
              nextYearEstimate?.eps
            ))}
          </span>
        </div>

      </div>

    </div>

  </div>

  <div className="estimate-growth-grid">
    <div className="estimate-growth-card">
      <span className="estimate-growth-label">Current Year Revenue Growth</span>
      <strong className={!isNumber(currentYearRevenueGrowth) ? "estimate-growth-unavailable" : currentYearRevenueGrowth >= 0 ? "estimate-growth-positive" : "estimate-growth-negative"}>
        {estimateValue(formatPercent(currentYearRevenueGrowth))}
      </strong>
      <span className="estimate-growth-period">Current estimate vs. {previousYearLabel} actual</span>
    </div>

    <div className="estimate-growth-card">
      <span className="estimate-growth-label">Current Year Earnings Growth</span>
      <strong className={!isNumber(currentYearEarningsGrowth) ? "estimate-growth-unavailable" : currentYearEarningsGrowth >= 0 ? "estimate-growth-positive" : "estimate-growth-negative"}>
        {estimateValue(formatPercent(currentYearEarningsGrowth))}
      </strong>
      <span className="estimate-growth-period">Current estimate vs. {previousYearLabel} actual</span>
    </div>

    <div className="estimate-growth-card">
      <span className="estimate-growth-label">Next Year Revenue Growth</span>
      <strong className={!isNumber(nextYearRevenueGrowth) ? "estimate-growth-unavailable" : nextYearRevenueGrowth >= 0 ? "estimate-growth-positive" : "estimate-growth-negative"}>
        {estimateValue(formatPercent(nextYearRevenueGrowth))}
      </strong>
      <span className="estimate-growth-period">Next estimate vs. current estimate</span>
    </div>

    <div className="estimate-growth-card">
      <span className="estimate-growth-label">Next Year Earnings Growth</span>
      <strong className={!isNumber(nextYearEarningsGrowth) ? "estimate-growth-unavailable" : nextYearEarningsGrowth >= 0 ? "estimate-growth-positive" : "estimate-growth-negative"}>
        {estimateValue(formatPercent(nextYearEarningsGrowth))}
      </strong>
      <span className="estimate-growth-period">Next estimate vs. current estimate</span>
    </div>
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
      title="Top Institutional Holders"
      subtitle="Latest reported institutional holders"
      emptyText="No recent holder rows found yet."
      loading={isInstitutionalHoldersLoading}
      rows={institutionalHolderRows}
      columns={[
        { key: "institution", label: "Institution" },
        {
          key: "shares",
          label: "Shares",
          render: (row) => formatSharesCount(row.shares)
        },
        {
          key: "percentHeld",
          label: "% Held",
          render: (row) => formatPercent(isNumber(row.percentHeld) && Math.abs(row.percentHeld) <= 1 ? row.percentHeld * 100 : row.percentHeld)
        },
        {
          key: "value",
          label: "Value",
          render: (row) => formatLargeDollars(row.value)
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

</div>

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
    </>
    )}

{/* STOCK PROJECTIONS */}

{activePage === "projections" && (
<>
<form className="topbar page-searchbar" onSubmit={(event) => handleStockSearchSubmit(event, "projections")}>
  <input
    className="search"
    value={searchInput}
    onChange={(event) => setSearchInput(event.target.value.toUpperCase())}
    placeholder="Search ticker for projections..."
  />
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
      {stockData.logo && (
        <img
          src={stockData.logo}
          alt={`${stockData.symbol || ticker} logo`}
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
                        placeholder={isNumber(row.revenue) ? formatEstimateMoney(row.revenue) : "N/A"}
                        inputMode="decimal"
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
                        placeholder={isNumber(row.netIncome) ? formatEstimateMoney(row.netIncome) : "N/A"}
                        inputMode="decimal"
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
                    {row.year === PROJECTION_YEARS[0] ? (
                      estimateValue(formatPercent(row.netIncomeGrowth))
                    ) : (
                      <input
                        value={getProjectionInputValue(projectionCase.id, "netIncomeGrowth", row.year)}
                        onChange={(event) => updateProjectionSetting(projectionCase.id, "netIncomeGrowth", row.year, event.target.value)}
                        inputMode="decimal"
                        aria-label={`${projectionCase.label} ${row.year} net income growth`}
                      />
                    )}
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
                <th>Shares Outstanding</th>
                {projectionCase.rows.map((row) => (
                  <td key={row.year}>
                    {row.year === PROJECTION_YEARS[0] ? (
                      <input
                        value={getProjectionInputValue(projectionCase.id, "shares", row.year)}
                        onChange={(event) => updateProjectionSetting(projectionCase.id, "shares", row.year, event.target.value)}
                        placeholder={isNumber(row.shares) ? row.shares.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "N/A"}
                        inputMode="decimal"
                        aria-label={`${projectionCase.label} ${row.year} shares outstanding`}
                      />
                    ) : (
                      isNumber(row.shares)
                        ? row.shares.toLocaleString(undefined, { maximumFractionDigits: 0 })
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
        setPortfolios((items) => [...items, { id, name, positions: [] }]);
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
      disabled={portfolios.length <= 1}
      onClick={() => {
        if (portfolios.length <= 1) return;
        if (!window.confirm(`Delete ${activePortfolio.name} and all of its positions?`)) return;
        const remaining = portfolios.filter((item) => item.id !== activePortfolio.id);
        setPortfolios(remaining);
        setActivePortfolioId(remaining[0].id);
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
    if (
      portfolioTicker &&
      Number.isFinite(shares) && shares > 0 &&
      Number.isFinite(avgCost) && avgCost >= 0
    ) {

      await loadPortfolioPrice(
        portfolioTicker
      );

      const newPosition = {
        id: globalThis.crypto?.randomUUID?.() || `position-${Date.now()}`,
        symbol: portfolioTicker,
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
        <span className="portfolio-logo-shell" aria-hidden="true">
          <span className="portfolio-logo-fallback">
            {position.symbol.slice(0, 1)}
          </span>
          {savedSymbolDetails[position.symbol]?.logo && (
            <img
              className="portfolio-logo"
              src={savedSymbolDetails[position.symbol].logo}
              alt=""
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
            <Tooltip formatter={(value) => formatPortfolioCurrency(Number(value))} />
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
  </div>

</div>
{/* NAMED WATCHLISTS */}
    </>
    )}

{activePage === "watchlists" && (
<section className="chart-section named-watchlists-section" id="watchlists">
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
            {(list.symbols || []).map((symbol) => (
              <div className="named-watchlist-row" key={symbol}>
                <button
                  className="named-watchlist-open"
                  type="button"
                  onClick={() => {
                    setSearchInput(symbol);
                    setTicker(symbol);
                    setActivePage("overview");
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  <span className="named-watchlist-identity">
                    <span className="named-watchlist-logo-shell" aria-hidden="true">
                      <span className="named-watchlist-logo-fallback">
                        {symbol.slice(0, 1)}
                      </span>
                      <img
                        className="named-watchlist-logo"
                        src={savedSymbolDetails[symbol]?.logo || getDefaultCompanyLogoUrl(symbol)}
                        alt=""
                        onError={(event) => handleCompanyLogoError(event, symbol)}
                      />
                    </span>
                    <strong>{symbol}</strong>
                  </span>
                  <span className="named-watchlist-quote">
                    <span className="named-watchlist-price">
                      {formatPrice(portfolioPrices[symbol])}
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
            ))}
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
              if (!symbol || !/^[A-Z0-9.-]{1,10}$/.test(symbol)) return;
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
              maxLength={10}
            />
            <button type="submit" aria-label={`Add ticker to ${list.name}`} title="Add ticker">+</button>
          </form>
        </article>
      ))}
    </div>
  ) : (
    <div className="named-watchlists-empty">Create a watchlist to organize stocks.</div>
  )}
</section>
)}

{/* LIVE EARNINGS CALENDAR */}

{activePage === "earnings-calendar" && (
<div className="chart-section calendar-bottom-section" id="earnings-calendar">

  <div className="calendar-heading-row">
    <h2 className="section-title">
      Earnings Calendar
    </h2>
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

  <div className="earnings-calendar">
    <div className="calendar-week-label">{earningsWeekLabel}</div>

    <div className="calendar-date-strip">
      {(earnings?.days || []).map((day) => {
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
            <small>{day.events?.length || 0} reports</small>
          </button>
        );
      })}
    </div>

    {isEarningsLoading ? (
      <div className="calendar-empty">Loading earnings calendar...</div>
    ) : selectedEarningsDay.events?.length ? (
      <div className="calendar-company-list">
        <div className="calendar-company-header">
          <span>Company</span>
          <span>Report time</span>
          <span>Revenue estimate</span>
          <span>EPS estimate</span>
          <span>Market cap</span>
        </div>
        {selectedEarningsDay.events.map((event) => (
          <button
            className="calendar-company-row"
            key={`${event.date}-${event.symbol}`}
            type="button"
            onClick={() => {
              setSearchInput(event.symbol);
              setTicker(event.symbol);
              setActivePage("overview");
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          >
            <span className="calendar-company-name">
              <span className="calendar-company-identity">
                <span className="calendar-company-logo-shell" aria-hidden="true">
                  <span className="calendar-company-logo-fallback">
                    {event.symbol.slice(0, 1)}
                  </span>
                  {event.logo && (
                    <img
                      className="calendar-company-logo"
                      src={event.logo}
                      alt=""
                      onError={(imageEvent) =>
                        handleCompanyLogoError(imageEvent, event.symbol)
                      }
                    />
                  )}
                </span>
                <span className="calendar-company-copy">
                  <strong>{event.symbol}</strong>
                  <small>{event.company}</small>
                </span>
              </span>
            </span>
            <span className="calendar-report-time">
              {event.reportTime}
              {event.fiscalQuarter && <small>{event.fiscalQuarter}</small>}
            </span>
            <strong data-label="Revenue est.">{formatCalendarMoney(event.revenueEstimate, "No estimate")}</strong>
            <strong data-label="EPS est.">{formatCalendarEps(event.epsEstimate, "No estimate")}</strong>
            <span data-label="Market cap">{formatCalendarMoney(event.marketCap)}</span>
          </button>
        ))}
      </div>
    ) : (
      <div className="calendar-empty">No major companies are scheduled for this date.</div>
    )}
  </div>


</div>
)}


{/* MR. RALLY CHAT */}

{activePage === "mr-rally" && mrRallySection}


{/* AUTH POPUP */}

{showAuth && (

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

      {isLogin && !isRecoveringPassword && (
        <>
          {GOOGLE_CLIENT_ID ? (
            <div className="google-auth-button" ref={googleButtonRef} />
          ) : (
            <div className="auth-required-message">
              Google sign-in needs a Google Client ID added first.
            </div>
          )}

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
        </>
      )}

      <p
        className="auth-switch"
        onClick={() => {
          setIsLogin(!isLogin);
          setIsRecoveringPassword(false);
          setPasswordResetToken("");
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
        }}
      >
        Close
      </button>

    </div>

  </div>

)}

</div>
</div>

);
}

export default App;
