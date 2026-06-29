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

const formatPercent = (value) =>
  isNumber(value) ? `${value.toFixed(1)}%` : "N/A";

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

const formatPlain = (value) =>
  isNumber(value) ? value.toFixed(2) : "N/A";

const formatPrice = (value) =>
  isNumber(value) ? `$${value.toFixed(2)}` : "N/A";

const formatIndexPrice = (value) =>
  isNumber(value) ? value.toLocaleString(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }) : "--";

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

const PROJECTION_YEARS = [2026, 2027, 2028, 2029, 2030];
const PROJECTION_CASES = [
  { id: "bull", label: "Bull Case" },
  { id: "base", label: "Base Case" },
  { id: "bear", label: "Bear Case" }
];
const DEFAULT_PROJECTION_ASSUMPTIONS = {
  revenueGrowth: "10",
  netIncomeGrowth: "10",
  sharesGrowth: "0",
  lowPe: "",
  highPe: ""
};

const getProjectionAssumptionValue = (settings, key, year) =>
  settings?.[key]?.[year] ?? DEFAULT_PROJECTION_ASSUMPTIONS[key] ?? "";

const createProjectionCaseSettings = () => ({
  revenueGrowth: {},
  netIncomeGrowth: {},
  sharesGrowth: {},
  lowPe: {},
  highPe: {}
});

const normalizeProjectionCaseSettings = (settings = {}) => ({
  revenueGrowth: settings.revenueGrowth || {},
  netIncomeGrowth: settings.netIncomeGrowth || {},
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

const isWeekdayMarketSession = (parts) => {
  const day = getEasternWeekday(parts);
  return day !== 0 && day !== 6;
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
  const close = getEasternDateAsUtc({ ...parts, hour: 16, minute: 0, second: 0 });
  const isTradingDay = isWeekdayMarketSession(parts);

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

  for (let offset = 1; offset <= 7; offset += 1) {
    const nextParts = addEasternCalendarDays(parts, offset);
    if (isWeekdayMarketSession(nextParts)) {
      const nextOpen = getEasternDateAsUtc({ ...nextParts, hour: 9, minute: 30, second: 0 });
      return {
        label: "Market opens in",
        value: formatCountdownDuration(nextOpen.getTime() - now.getTime()),
        tone: "closed",
      };
    }
  }

  return {
    label: "Market opens in",
    value: "--",
    tone: "closed",
  };
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

const buildChartRows = (rows, key) =>
  (rows || [])
    .map((item) => ({
      year: item.year,
      period: item.period || String(item.year),
      isInterim: Boolean(item.isInterim),
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
  { key: "nasdaq", label: "Nasdaq" }
];

const normalizeSymbolList = (symbols = []) =>
  [...new Set((Array.isArray(symbols) ? symbols : [])
    .map((symbol) => String(symbol || "").trim().toUpperCase())
    .filter(Boolean))];

const normalizePortfolios = (items = []) => {
  if (!Array.isArray(items) || !items.length) return [];
  return items.map((item, index) => ({
    id: String(item?.id || `portfolio-${index}`),
    name: String(item?.name || `Portfolio ${index + 1}`),
    positions: Array.isArray(item?.positions) ? item.positions : []
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
const FINANCIAL_HISTORY_VERSION = 95;

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

function HistoricalLineChart({ title, data, dataKey, color, formatter, valueLabel, loading = false }) {
  return (
    <section className="historical-chart-panel">
      <h3>{title}</h3>
      <div className="historical-chart-canvas">
        {loading ? (
          <StockDataLoading label="Loading annual history..." />
        ) : data.length ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart
              data={data}
              margin={{ top: 12, right: 18, left: 6, bottom: 4 }}
            >
              <CartesianGrid stroke="#273244" />
              <XAxis dataKey="period" />
              <YAxis tickFormatter={formatter} width={58} />
              <Tooltip formatter={(value) => [formatter(value), valueLabel]} />
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
          <div className="historical-chart-empty">No annual history available.</div>
        )}
      </div>
    </section>
  );
}

function App() {
  const latestStockRequest = useRef(0);
  const stockRetryTimerRef = useRef(null);
  const stockMemoryCacheRef = useRef(new Map());
  const latestComparisonRequest = useRef(0);
  const latestAiRequest = useRef(0);
  const latestEarningsCallRequest = useRef(0);
  const speechQueueRef = useRef([]);
  const speechIndexRef = useRef(0);
  const speechUtteranceRef = useRef(null);
  const [showAuth, setShowAuth] = useState(false);
const [isLogin, setIsLogin] = useState(true);

const [username, setUsername] = useState("");

const [email, setEmail] = useState("");

const [password, setPassword] = useState("");

const handleSignOut = () => {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  setUser(null);
  setWatchlist([]);
  setPortfolios([DEFAULT_PORTFOLIO]);
  setActivePortfolioId(DEFAULT_PORTFOLIO.id);
  setNamedWatchlists([]);
  setSavedProjections({});
  setShowAuth(false);
};

const handleAuth = async () => {

  try {

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

    if (response.data.user) {

      setUser(
        response.data.user
      );

      localStorage.setItem(
        "token",
        response.data.token
      );

      localStorage.setItem(
        "user",
        JSON.stringify(
          response.data.user
        )
      );
    }

    alert(
      isLogin
        ? "Login successful"
        : "Account created"
    );
setShowAuth(false);

await loadUserData();

  } catch (err) {

    console.error(err);

    alert(
      err.response?.data?.error ||
      "Authentication failed"
    );
  }
};




const [user, setUser] =
  useState(null);
const [hasLoadedSavedLists, setHasLoadedSavedLists] =
  useState(false);
const [hasMeaningfulSavedLists, setHasMeaningfulSavedLists] =
  useState(false);
  useEffect(() => {

  const savedUser =
    localStorage.getItem("user");

  if (savedUser) {

    setUser(
      JSON.parse(savedUser)
    );

    loadUserData();
  } else {
    try {
      const savedLists = JSON.parse(
        localStorage.getItem(SAVED_LISTS_STORAGE_KEY) || "{}"
      );
      if (Array.isArray(savedLists.watchlist)) {
        setWatchlist(savedLists.watchlist);
      }
      if (Array.isArray(savedLists.portfolios) && savedLists.portfolios.length) {
        setPortfolios(savedLists.portfolios);
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
  }

}, []);

  const [ticker, setTicker] =
  useState("NVDA");

  const [searchInput, setSearchInput] =
    useState("NVDA");
  const [savedProjections, setSavedProjections] =
    useState({});

  let [stockData, setStockData] =
    useState(null);
  const loadedStockSymbol = stockData?.symbol || null;

  const [isStockLoading, setIsStockLoading] =
    useState(false);

  const [stockChartRange, setStockChartRange] =
    useState("1D");

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

  const [earningsCall, setEarningsCall] =
    useState(null);

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
    useState(true);

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
  useState([]);

  const [compareData, setCompareData] =
    useState([]);


  

  /*
    SAVE WATCHLIST
  */


useEffect(() => {
  const symbols = [...new Set([
    ...watchlist,
    ...portfolios.flatMap((item) =>
      (item.positions || []).map((position) => position.symbol)
    ),
    ...namedWatchlists.flatMap((list) => list.symbols || [])
  ].map((symbol) => String(symbol || "").trim().toUpperCase()).filter(Boolean))];

  const refreshPrices = () => {
    loadSavedPrices(symbols);
  };

  refreshPrices();
  const refreshTimer = window.setInterval(refreshPrices, 60 * 1000);
  return () => window.clearInterval(refreshTimer);
}, [watchlist, portfolios, namedWatchlists]);

useEffect(() => {
  let isActive = true;

  const loadMarketIndices = async () => {
    setIsMarketLoading(true);
    try {
      const response = await axios.get(`${API_URL}/api/market-indices`, {
        timeout: 8000,
      });
      if (isActive) {
        const indices = response.data.indices || [];
        setMarketIndices(indices);
        if (indices.length) {
          localStorage.setItem(MARKET_INDICES_STORAGE_KEY, JSON.stringify(indices));
        }
      }
    } catch (error) {
      console.error("Market indices failed", error);
    } finally {
      if (isActive) {
        setIsMarketLoading(false);
      }
    }
  };

  loadMarketIndices();
  const refreshTimer = window.setInterval(loadMarketIndices, 60 * 1000);
  return () => {
    isActive = false;
    window.clearInterval(refreshTimer);
  };
}, []);

useEffect(() => {
  const timer = window.setInterval(() => {
    setMarketClockNow(new Date());
  }, 1000);

  return () => window.clearInterval(timer);
}, []);

useEffect(() => {
  let isActive = true;
  let refreshTimer;

  const loadPriceHistory = async (showLoading = true) => {
    if (!ticker) return;
    if (showLoading) {
      setIsStockChartLoading(true);
      setStockChartError("");
      setStockChartData([]);
      setStockChartMeta(null);
    }

    try {
      const response = await axios.get(
        `${API_URL}/api/price-history/${ticker}`,
        {
          params: { range: stockChartRange },
          timeout: 12000
        }
      );

      if (!isActive) return;

      setStockChartData(response.data.points || []);
      setStockChartMeta(response.data.latest || null);
      setStockChartError("");
    } catch (error) {
      console.error("Price history failed", error);
      if (isActive) {
        setStockChartError("Chart history is temporarily unavailable.");
      }
    } finally {
      if (isActive) {
        setIsStockChartLoading(false);
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
    setAiAnalysis(null);
    setEarningsCall(null);
    window.speechSynthesis?.cancel();
    setIsSpeechPlaying(false);
    setIsSpeechPaused(false);
    setSpeechError("");
    setIsStockLoading(!cachedStock);
    loadSavedPrices([ticker]);
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
    const requestId = ++latestEarningsCallRequest.current;
    setIsEarningsCallLoading(true);

    axios.get(`${API_URL}/api/earnings-call/${ticker}`)
      .then((response) => {
        if (requestId === latestEarningsCallRequest.current) {
          setEarningsCall(response.data);
        }
      })
      .catch((error) => {
        console.error("Earnings call failed", error);
        if (requestId === latestEarningsCallRequest.current) {
          setEarningsCall({ available: false });
        }
      })
      .finally(() => {
        if (requestId === latestEarningsCallRequest.current) {
          setIsEarningsCallLoading(false);
        }
      });
  }, [ticker, loadedStockSymbol, isStockLoading]);

  useEffect(() => {
    if (!stockData?.price || stockData.symbol !== ticker) return;

    const requestId = ++latestAiRequest.current;
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
  }, [ticker, stockData?.price, stockData?.updatedAt]);

  /*
    LOAD EARNINGS ON START
  */

  useEffect(() => {

    loadEarnings(earningsWeekStart);

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

      stockMemoryCacheRef.current.set(symbol, response.data);
      setStockData(response.data);
      setIsStockLoading(false);

      if (response.data.refreshing && attempt < 150) {
        scheduleRetry(attempt < 30 ? 1000 : 2500);
      }

      setPortfolioPrices((prev) => ({
        ...prev,
        [symbol]: response.data.price,
      }));

    } catch (error) {

      console.error(error);
      if (requestId !== latestStockRequest.current) return;

      if (error.response?.status === 400 || error.response?.status === 404) {
        setIsStockLoading(false);
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
    const mergedWatchlist = normalizeSymbolList([
      ...(localSavedLists.watchlist || []),
      ...remoteWatchlist
    ]);
    const mergedPortfolios = mergePortfolios(
      localSavedLists.portfolios || [],
      remotePortfolios
    );
    const mergedNamedWatchlists = mergeNamedWatchlists(
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

  const loadSavedPrices = async (symbols, attempt = 0) => {
    if (!symbols.length) return;

    try {

      const response =
        await axios.get(
          `${API_URL}/api/prices`,
          { params: { symbols: symbols.join(",") } }
        );

      const receivedPrices = response.data?.prices || {};
      const receivedDetails = response.data?.details || {};
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
      const missingSymbols = symbols.filter(
        (symbol) =>
          !isNumber(receivedPrices[symbol]) ||
          !isNumber(receivedDetails[symbol]?.percentChange)
      );

      if (missingSymbols.length && attempt < 40) {
        window.setTimeout(
          () => loadSavedPrices(missingSymbols, attempt + 1),
          1000
        );
      }

    } catch (err) {
      if (attempt < 6) {
        window.setTimeout(() => loadSavedPrices(symbols, attempt + 1), 1500);
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

if (!stockData) {
  const fastDetails = savedSymbolDetails[ticker] || {};
  stockData = {
    name: fastDetails.name || (isStockLoading ? `Loading ${ticker}...` : ticker),
    symbol: ticker,
    logo: fastDetails.logo || null,
    price: portfolioPrices[ticker],
    change: fastDetails.change,
    percentChange: fastDetails.percentChange,
    revenueData: []
  };
}

const financialHistory =
  stockData?.revenueData || [];
const revenueHistorySource =
  buildChartRows(stockData?.revenueHistory || [], "revenue");

const revenueHistory =
  mergeChartRows(
    [
      ...buildChartRows(financialHistory, "revenue"),
      ...revenueHistorySource,
    ],
    "revenue"
  );

const earningsHistory =
  buildChartRows(financialHistory, "earnings");

const epsHistory =
  buildChartRows(financialHistory, "eps");
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
const operatingCashflowHistory =
  chartRowsWithCurrentFallback(
    buildChartRows(financialHistory, "operatingCashflow"),
    "operatingCashflow",
    stockData?.operatingCashflow,
    (value) => value / 1e9
  );
const freeCashflowHistory =
  chartRowsWithCurrentFallback(
    buildChartRows(financialHistory, "freeCashflow"),
    "freeCashflow",
    stockData?.freeCashflow,
    (value) => value / 1e9
  );
const sharesOutstandingHistory =
  chartRowsWithCurrentFallback(
    buildChartRows(financialHistory, "sharesOutstanding"),
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
const historicalPeHistory =
  chartRowsWithCurrentFallback(historicalPeHistoryBase, "pe", stockData?.pe);
const annualMarginHistory = (stockData?.marginHistory || [])
  .map((row) => ({ ...row, period: row.period || String(row.year) }))
  .filter((row) =>
    row?.year &&
    (row.isInterim || row.year <= new Date().getFullYear())
  );
const grossMarginHistory = chartRowsWithCurrentFallback(
  annualMarginHistory.filter((row) => isNumber(row.grossMargin)),
  "grossMargin",
  stockData?.grossMargins
);
const operatingMarginHistory = chartRowsWithCurrentFallback(
  annualMarginHistory.filter((row) => isNumber(row.operatingMargin)),
  "operatingMargin",
  stockData?.operatingMargins
);
const profitMarginHistory = chartRowsWithCurrentFallback(
  annualMarginHistory.filter((row) => isNumber(row.profitMargin)),
  "profitMargin",
  stockData?.profitMargins
);

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
    ? 0
    : parseInputPercent(getProjectionInputValue(caseId, "sharesGrowth", year)) ?? 0;
  const revenue = isBaseYear
    ? (isNumber(currentYearEstimate?.revenue) ? currentYearEstimate.revenue : null)
    : isNumber(previousRow?.revenue)
      ? previousRow.revenue * (1 + revenueGrowthRate)
      : null;
  const netIncome = isBaseYear
    ? (isNumber(currentYearEstimate?.earnings) ? currentYearEstimate.earnings : null)
    : isNumber(previousRow?.netIncome)
      ? previousRow.netIncome * (1 + netIncomeGrowthRate)
      : null;
  const shares = isBaseYear
    ? projectionShareBase
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
const isStockRefreshing = stockData?.refreshing === true;
const areEstimatesRefreshing =
  isStockRefreshing &&
  stockData?.financialHistoryVersion !== FINANCIAL_HISTORY_VERSION;
const isInitialStockLoad = isStockLoading && !stockData?.symbol;
const stockValue = (value) =>
  isInitialStockLoad
    ? "Loading..."
    : value;
const estimateValue = (value) =>
  isInitialStockLoad && (value === "N/A" || value === null || value === undefined)
    ? "Loading..."
    : stockValue(value);
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
const displayedMarketIndices = MARKET_INDEX_ORDER.map((item) => ({
  ...item,
  ...(marketIndices.find((index) => index.key === item.key) || {})
}));

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

          const symbol =
            e.target.value.toUpperCase();

          if (
            symbol &&
            !compareTickers.includes(symbol)
          ) {

            setCompareTickers([
              ...compareTickers,
              symbol,
            ]);

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
        onClick={() =>
          setCompareTickers(
            compareTickers.filter(
              (t) => t !== stock.symbol
            )
          )
        }
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

      <div className="comparison-stat">
        <span>Market Cap</span>
  <strong>
    {formatBillions(stock.marketCap)}
  </strong>
      </div>

      <div className="comparison-stat">
        <span>Current P/E</span>
  <strong>
    {formatPlain(stock.pe)}
  </strong>
      </div>

      <div className="comparison-stat">
        <span>Forward P/E</span>
  <strong>
    {formatPlain(stock.forwardPE)}
  </strong>
      </div>

      <div className="comparison-stat">
        <span>Price-to-Sales</span>
  <strong>
    {formatPlain(stock.priceToSales)}
  </strong>
      </div>

      <div className="comparison-stat">
        <span>Price-to-Book</span>
  <strong>
    {formatPlain(stock.priceToBook)}
  </strong>
      </div>

      <div className="comparison-stat">
        <span>Revenue Growth</span>
  <strong>
    {formatPercent(stock.revenueGrowth)}
  </strong>
      </div>

      <div className="comparison-stat">
        <span>Earnings Growth</span>
  <strong>
    {formatPercent(stock.earningsGrowth)}
  </strong>
      </div>

      <div className="comparison-stat">
        <span>{stock.isFinancialCompany ? "Net Interest Revenue Mix" : "Gross Margin"}</span>
  <strong>
    {formatPercent(
      stock.isFinancialCompany
        ? stock.bankMetrics?.netInterestRevenueMix
        : stock.grossMargins
    )}
  </strong>
      </div>

      <div className="comparison-stat">
        <span>{stock.isFinancialCompany ? "Pre-Tax Margin" : "Operating Margin"}</span>
  <strong>
    {formatPercent(
      stock.isFinancialCompany
        ? stock.bankMetrics?.preTaxMargin
        : stock.operatingMargins
    )}
  </strong>
      </div>

      <div className="comparison-stat">
        <span>Profit Margin</span>
  <strong>
    {formatPercent(stock.profitMargins)}
  </strong>
      </div>

      <div className="comparison-stat">
        <span>{stock.isFinancialCompany ? "Annual Cash Change" : "Free Cash Flow"}</span>
  <strong>
    {formatBillions(
      stock.isFinancialCompany
        ? stock.bankMetrics?.annualCashChange
        : stock.freeCashflow
    )}
  </strong>
      </div>

      <div className="comparison-stat">
        <span>Price Target</span>
  <strong>
    {formatPrice(stock.targetMean)}
  </strong>
      </div>

      <div className="comparison-stat">
        <span>Analyst Rating</span>
  <strong>
    {stock.analystRatingText || stock.recommendationKey || "N/A"}
  </strong>
      </div>

      <div className="comparison-stat">
        <span>Dividend Yield</span>
        <strong>
          {formatDividendYield(stock.dividendYield)}
        </strong>
      </div>

      <div className="comparison-stat">
        <span>52W High</span>
        <strong>
          {formatPrice(stock.fiftyTwoWeekHigh)}
        </strong>
      </div>

      <div className="comparison-stat">
        <span>52W Low</span>
        <strong>
          {formatPrice(stock.fiftyTwoWeekLow)}
        </strong>
      </div>

    </div>

  ))}

    </div>

  </div>
);


 

return (

  <div className="app">

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
            }}
          >

            <span className="watch-logo-shell" aria-hidden="true">
              <span className="watch-logo-fallback">{item.slice(0, 1)}</span>
              {savedSymbolDetails[item]?.logo && (
              <img
                className="watch-logo"
                src={savedSymbolDetails[item].logo}
                alt=""
                onError={(event) => handleCompanyLogoError(event, item)}
              />
              )}
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

                setWatchlist(
                  watchlist.filter(
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
        onClick={() => user ? handleSignOut() : setShowAuth(true)}
        title={user ? `Sign out ${user.username}` : "Login or create an account"}
      >
        {user ? `Sign Out (${user.username})` : "Login / Signup"}
      </button>

    </div>

    <nav className="section-tabs" aria-label="Page sections">
      <a href="#home">Home</a>
      <a href="#overview">Overview</a>
      <a href="#financials">Financials</a>
      <a href="#metrics">Metrics</a>
      <a href="#comparison">Compare</a>
      <a href="#projections">Projections</a>
      <a href="#ai-analysis">AI Analysis</a>
      <a href="#earnings-calls">Transcript</a>
      <a href="#portfolio">Portfolio</a>
      <a href="#watchlists">Watchlists</a>
      <a href="#earnings-calendar">Calendar</a>
    </nav>

    {/* MAIN */}

    <div className="main">

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
        <a className="welcome-action" href="#overview">Explore the market</a>
      </div>
    </section>



    {/* SEARCH */}

<form
  className="topbar"
  id="overview"
  onSubmit={(event) => {
    event.preventDefault();
    const symbol = searchInput.trim().toUpperCase();
    if (!symbol) return;

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
  }}
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
              {isNumber(stockData.price)
                ? `$${stockData.price.toFixed(2)}`
                : "--"}
            </div>

            <div className="stock-change">
              {stockData.symbol}
            </div>
          </div>

        </div>

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
        {/* LIVE STOCK CHART */}

<div className="chart-section native-stock-chart-section">

  <div className="stock-chart-header">
    <div>
      <h2 className="section-title">
        MrktRally Price Chart
      </h2>
      <div className="stock-chart-meta">
        <span>{ticker}</span>
        <strong>{formatPrice(stockChartMeta?.price ?? stockData?.price)}</strong>
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
            type="monotone"
            dataKey="price"
            stroke="url(#priceLineGradient)"
            strokeWidth={3}
            dot={false}
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
    {isEarningsCallLoading ? (
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
        Earnings call transcript is not available for this ticker yet.
      </div>
    )}
  </div>

</div>
{/* REVENUE CHART */}

<div className="chart-section" id="financials">

  <h2 className="section-title">
    Revenue Chart
  </h2>

<div className="chart-box">

{isStockLoading || (isStockRefreshing && !revenueHistory.length) ? (

  <StockDataLoading label="Loading revenue history..." />

) : revenueHistory.length ? (

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
  formatter={(value) => [
    formatChartBillions(value),
    "Revenue"
  ]}
/>

        <Bar
          dataKey="revenue"
          fill="#3b82f6"
          radius={[6, 6, 0, 0]}
        />

      </BarChart>

    </ResponsiveContainer>

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

    {isStockLoading || (isStockRefreshing && !earningsHistory.length) ? (

      <StockDataLoading label="Loading net income history..." />

    ) : earningsHistory.length ? (

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
            formatter={(value) => [
              formatChartBillions(value),
              "Net Income"
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

    {isStockLoading || (isStockRefreshing && !epsHistory.length) ? (

      <StockDataLoading label="Loading EPS history..." />

    ) : epsHistory.length ? (

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
            formatter={(value) => [
              formatChartEps(value),
              "EPS"
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
    loading={isInitialStockLoad}
  />
  <HistoricalLineChart
    title={stockData.isFinancialCompany ? "Net Interest Revenue Mix" : "Gross Margin History"}
    data={grossMarginHistory}
    dataKey="grossMargin"
    color="#a78bfa"
    formatter={(value) => `${Number(value).toFixed(1)}%`}
    valueLabel={stockData.isFinancialCompany ? "Net Interest Revenue Mix" : "Gross Margin"}
    loading={isInitialStockLoad}
  />
  <HistoricalLineChart
    title={stockData.isFinancialCompany ? "Pre-Tax Margin History" : "Operating Margin History"}
    data={operatingMarginHistory}
    dataKey="operatingMargin"
    color="#f59e0b"
    formatter={(value) => `${Number(value).toFixed(1)}%`}
    valueLabel={stockData.isFinancialCompany ? "Pre-Tax Margin" : "Operating Margin"}
    loading={isInitialStockLoad}
  />
  <HistoricalLineChart
    title="Profit Margin History"
    data={profitMarginHistory}
    dataKey="profitMargin"
    color="#34d399"
    formatter={(value) => `${Number(value).toFixed(1)}%`}
    valueLabel="Profit Margin"
    loading={isInitialStockLoad}
  />
  <HistoricalLineChart
    title="Operating Cash Flow History"
    data={operatingCashflowHistory}
    dataKey="operatingCashflow"
    color="#22d3ee"
    formatter={formatChartBillions}
    valueLabel="Operating Cash Flow"
    loading={isInitialStockLoad}
  />
  <HistoricalLineChart
    title="Free Cash Flow History"
    data={freeCashflowHistory}
    dataKey="freeCashflow"
    color="#14b8a6"
    formatter={formatChartBillions}
    valueLabel="Free Cash Flow"
    loading={isInitialStockLoad}
  />
  <HistoricalLineChart
    title="Shares Outstanding History"
    data={sharesOutstandingHistory}
    dataKey="sharesOutstanding"
    color="#f472b6"
    formatter={formatSharesMillions}
    valueLabel="Shares"
    loading={isInitialStockLoad}
  />
</div>

        {/* METRICS */}

   <div className="grid section-anchor" id="metrics">

  <div className="card">
    <div className="card-title">
      Market Cap
    </div>

    <div className="card-value">
{stockValue(formatBillions(stockData.marketCap))}
    </div>
  </div>

  <div className="card">
    <div className="card-title">
      Current P/E
    </div>

    <div className="card-value">
      {stockValue(formatPlain(stockData.pe))}
    </div>
  </div>

  <div className="card">
    <div className="card-title">
      Forward P/E
    </div>

    <div className="card-value">
      {stockValue(formatPlain(stockData.forwardPE))}
    </div>
  </div>

  <div className="card">
    <div className="card-title">
      Price-to-Sales
    </div>

    <div className="card-value">
      {stockValue(formatPlain(stockData.priceToSales))}
    </div>
  </div>

  <div className="card">
    <div className="card-title">
      Price-to-Book
    </div>

    <div className="card-value">
      {stockValue(formatPlain(stockData.priceToBook))}
    </div>
  </div>

  <div className="card">
    <div className="card-title">
      Revenue Growth
    </div>

    <div className="card-value">
{stockValue(formatPercent(stockData.revenueGrowth))}
    </div>
  </div>

  <div className="card">
    <div className="card-title">
      Earnings Growth
    </div>

    <div className="card-value">
{stockValue(formatPercent(stockData.earningsGrowth))}
    </div>
  </div>

  <div className="card">
    <div className="card-title">
      Shares Outstanding
    </div>

    <div className="card-value">
{stockValue(stockData.sharesOutstanding
  ? `${(stockData.sharesOutstanding / 1000).toFixed(2)}B`
  : "N/A")}
    </div>
  </div>

  <div className="card">
    <div className="card-title">
      {stockData.isFinancialCompany ? "Net Interest Revenue Mix" : "Gross Margin"}
    </div>

    <div className="card-value">
{stockValue(formatPercent(
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
{stockValue(formatPercent(
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
{stockValue(formatPercent(stockData.profitMargins))}
    </div>
  </div>

  <div className="card">
    <div className="card-title">
      {stockData.isFinancialCompany ? "Annual Cash Change" : "Free Cash Flow"}
    </div>

    <div className="card-value">
{stockValue(formatBillions(
  stockData.isFinancialCompany
    ? stockData.bankMetrics?.annualCashChange
    : stockData.freeCashflow
))}
    </div>
  </div>

  {!stockData.isFinancialCompany && (
  <div className="card">
    <div className="card-title">
      Operating Cash Flow
    </div>

    <div className="card-value">
{stockValue(formatBillions(stockData.operatingCashflow))}
    </div>
  </div>
  )}

  <div className="card">
    <div className="card-title">
      Price Target
    </div>

    <div className="card-value">
{stockValue(formatPrice(stockData.targetMean))}
    </div>
  </div>

  <div className="card">
    <div className="card-title">
      Analyst Rating
    </div>

    <div className="card-value">
      {stockValue(stockData.analystRatingText || stockData.recommendationKey || "N/A")}
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

</div>

{/* STOCK PROJECTIONS */}

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
                  <td key={row.year}>{estimateValue(formatEstimateMoney(row.revenue))}</td>
                ))}
              </tr>
              <tr className="projection-assumption-row">
                <th>Revenue Growth</th>
                {projectionCase.rows.map((row) => (
                  <td key={row.year}>
                    {row.year === PROJECTION_YEARS[0] ? (
                      estimateValue(formatPercent(row.revenueGrowth))
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
                  <td key={row.year}>{estimateValue(formatEstimateMoney(row.netIncome))}</td>
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
                    {isNumber(row.shares)
                      ? row.shares.toLocaleString(undefined, { maximumFractionDigits: 0 })
                      : estimateValue("N/A")}
                  </td>
                ))}
              </tr>
              <tr className="projection-assumption-row">
                <th>Shares Growth</th>
                {projectionCase.rows.map((row) => (
                  <td key={row.year}>
                    {row.year === PROJECTION_YEARS[0] ? (
                      estimateValue(formatPercent(row.sharesGrowth))
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

{comparisonSection}

{/* PORTFOLIO TRACKER */}

<div className="portfolio-section" id="portfolio">

  <div className="portfolio-heading-row">
    <h2 className="section-title">
      Portfolio Tracker
    </h2>
    <form
      className="portfolio-create"
      onSubmit={(event) => {
        event.preventDefault();
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
    onChange={(e) =>
      setPortfolioCost(
        e.target.value
      )
    }
  />

  <button
  className="portfolio-btn"
  onClick={async () => {

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
      key={`${position.symbol}-${position.avgCost}-${positionIndex}`}
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

    setPortfolio((positions) =>
      positions.filter((_, index) => index !== positionIndex)
    );

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

<section className="chart-section named-watchlists-section" id="watchlists">
  <div className="named-watchlists-heading">
    <h2 className="section-title">Watchlists</h2>
    <form
      className="named-watchlist-create"
      onSubmit={(event) => {
        event.preventDefault();
        const name = newWatchlistName.trim();
        if (!name) return;
        const id = globalThis.crypto?.randomUUID?.() || `watchlist-${Date.now()}`;
        setNamedWatchlists((lists) => [...lists, { id, name, symbols: [] }]);
        setNewWatchlistName("");
      }}
    >
      <input
        value={newWatchlistName}
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
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  <span className="named-watchlist-identity">
                    <span className="named-watchlist-logo-shell" aria-hidden="true">
                      <span className="named-watchlist-logo-fallback">
                        {symbol.slice(0, 1)}
                      </span>
                      {savedSymbolDetails[symbol]?.logo && (
                      <img
                        className="named-watchlist-logo"
                        src={savedSymbolDetails[symbol].logo}
                        alt=""
                        onError={(event) => handleCompanyLogoError(event, symbol)}
                      />
                      )}
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
                      ? { ...item, symbols: item.symbols.filter((itemSymbol) => itemSymbol !== symbol) }
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

{/* LIVE EARNINGS CALENDAR */}

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


{/* AUTH POPUP */}

{showAuth && (

  <div className="auth-overlay">

    <div className="auth-box">

      <h2>
        {isLogin
          ? "Login"
          : "Create Account"}
      </h2>

      {!isLogin && (
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

      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) =>
          setPassword(e.target.value)
        }
      />

      <button onClick={handleAuth}>
        {isLogin
          ? "Login"
          : "Create Account"}
      </button>

      <p
        onClick={() =>
          setIsLogin(!isLogin)
        }
        style={{
          cursor: "pointer",
          marginTop: "10px",
        }}
      >
        {isLogin
          ? "Need an account? Sign up"
          : "Already have an account? Login"}
      </p>

      <button
        onClick={() =>
          setShowAuth(false)
        }
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
