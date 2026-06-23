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
  isNumber(value) ? `$${(value / 1e9).toFixed(1)}B` : "N/A";

const formatPlain = (value) =>
  isNumber(value) ? value.toFixed(2) : "N/A";

const formatPrice = (value) =>
  isNumber(value) ? `$${value.toFixed(2)}` : "N/A";

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
      [key]: isNumber(item[key])
        ? item[key]
        : null,
    }))
    .filter((item) =>
      item.year && item.year <= 2025 && item[key] !== null
    );

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
import axios from "axios";
const API_URL =
  import.meta.env.VITE_API_URL ||
  "https://investment-terminal-jtng.onrender.com";
const FINANCIAL_HISTORY_VERSION = 45;

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
              <XAxis dataKey="year" />
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
  useEffect(() => {

  const savedUser =
    localStorage.getItem("user");

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

  let [stockData, setStockData] =
    useState(null);
  const loadedStockSymbol = stockData?.symbol || null;

  const [isStockLoading, setIsStockLoading] =
    useState(false);

  const [aiAnalysis, setAiAnalysis] =
    useState(null);

  const [isAiLoading, setIsAiLoading] =
    useState(false);

  const [earningsCall, setEarningsCall] =
    useState(null);

  const [isEarningsCallLoading, setIsEarningsCallLoading] =
    useState(false);

  const [transcriptSearch, setTranscriptSearch] =
    useState("");

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
    setTranscriptSearch("");
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

      if (response.data.refreshing && attempt < 30) {
        scheduleRetry(1000);
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

  if (!user) return;

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

}, [watchlist, portfolios, activePortfolioId, namedWatchlists, user]);
       
  
const loadUserData = async () => {
  try {
    const token = localStorage.getItem("token");

    const response = await axios.get(
      `${API_URL}/api/user-data`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    setWatchlist(response.data.watchlist || []);
    const savedPortfolios = Array.isArray(response.data.portfolios) && response.data.portfolios.length
      ? response.data.portfolios
      : [{
          ...DEFAULT_PORTFOLIO,
          positions: response.data.portfolio || []
        }];
    const savedActivePortfolioId = savedPortfolios.some(
      (item) => item.id === response.data.activePortfolioId
    )
      ? response.data.activePortfolioId
      : savedPortfolios[0].id;
    setPortfolios(savedPortfolios);
    setActivePortfolioId(savedActivePortfolioId);
    setNamedWatchlists(response.data.namedWatchlists || []);

    console.log("Loaded user data");
  } catch (err) {
    console.error(err);
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
  revenueHistorySource.length
    ? revenueHistorySource
    : buildChartRows(financialHistory, "revenue");

const earningsHistory =
  buildChartRows(financialHistory, "earnings");

const epsHistory =
  buildChartRows(financialHistory, "eps");
const historicalPeHistory = (stockData?.historicalPe || [])
  .filter((row) => row?.year && row.year <= 2025 && isNumber(row.pe));
const annualMarginHistory = (stockData?.marginHistory || [])
  .filter((row) => row?.year && row.year <= 2025);
const grossMarginHistory = annualMarginHistory
  .filter((row) => isNumber(row.grossMargin));
const operatingMarginHistory = annualMarginHistory
  .filter((row) => isNumber(row.operatingMargin));
const profitMarginHistory = annualMarginHistory
  .filter((row) => isNumber(row.profitMargin));

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

const previousYearEstimate = estimateFromHistoryYear(
  2025,
  stockData?.analystEstimates?.currentYear
);
const currentYearEstimate =
  stockData?.analystEstimates?.nextYear || {};
const followingYearSource =
  stockData?.analystEstimates?.followingYear || {};
const followingYearEstimate = {
  revenue: isNumber(followingYearSource.revenue) ? followingYearSource.revenue : null,
  earnings: isNumber(followingYearSource.earnings) ? followingYearSource.earnings : null,
  eps: isNumber(followingYearSource.eps) ? followingYearSource.eps : null
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
  followingYearEstimate?.revenue,
  currentYearEstimate?.revenue
);
const nextYearEarningsGrowth = calculateEstimateGrowth(
  followingYearEstimate?.earnings,
  currentYearEstimate?.earnings
);
const isStockRefreshing = stockData?.refreshing === true;
const areEstimatesRefreshing =
  isStockRefreshing &&
  stockData?.financialHistoryVersion !== FINANCIAL_HISTORY_VERSION;
const stockValue = (value) =>
  isStockLoading || (isStockRefreshing && (value === "N/A" || value === null || value === undefined))
    ? "Loading..."
    : value;
const estimateValue = (value) =>
  areEstimatesRefreshing ? "Loading..." : stockValue(value);
const normalizedTranscriptSearch = transcriptSearch.trim().toLowerCase();
const filteredTranscript = (earningsCall?.transcript || []).filter((section) =>
  !normalizedTranscriptSearch ||
  section.speaker?.toLowerCase().includes(normalizedTranscriptSearch) ||
  section.text?.toLowerCase().includes(normalizedTranscriptSearch)
);
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
      <a href="#ai-analysis">AI Analysis</a>
      <a href="#earnings-calls">Earnings Calls</a>
      <a href="#portfolio">Portfolio</a>
      <a href="#watchlists">Watchlists</a>
      <a href="#earnings-calendar">Calendar</a>
    </nav>

    {/* MAIN */}

    <div className="main">

    <section className="welcome-hero" id="home" aria-labelledby="welcome-title">
      <div className="welcome-hero-content">
        <div className="welcome-kicker">Market research, focused</div>
        <h1 id="welcome-title">Welcome to MrktRally</h1>
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
        {/* LIVE STOCK CHART */}

<div className="chart-section">

  <h2 className="section-title">
    Live Stock Chart
  </h2>

  <div
    style={{
      background: "#111827",
      borderRadius: "16px",
      overflow: "hidden",
      padding: "10px",
      marginBottom: "30px",
    }}
  >

    <iframe
      title="TradingView Chart"

      src={`https://s.tradingview.com/widgetembed/?frameElementId=tradingview_chart&symbol=${ticker}&interval=D&hidesidetoolbar=1&symboledit=1&saveimage=0&toolbarbg=111827&studies=[]&theme=dark&style=1&timezone=America/New_York&withdateranges=1&hideideas=1`}

      width="100%"
      height="600"

      style={{
        border: "none",
        borderRadius: "12px",
      }}
    />

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
    Earnings Call Audio & Transcript
  </h2>

  <div className="earnings-call-panel">
    {isEarningsCallLoading ? (
      <div className="earnings-call-empty">Loading earnings calls...</div>
    ) : earningsCall?.embedUrl ? (
      <div className="earnings-site-viewport">
        <iframe
          className="earnings-site-frame"
          title={`${ticker} earnings calls`}
          src={earningsCall.embedUrl}
          loading="lazy"
          allow="autoplay; encrypted-media"
        />
      </div>
    ) : (
      <div className="earnings-call-empty">
        The embedded earnings-call site is temporarily unavailable.
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

        <XAxis dataKey="year" />

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

          <XAxis dataKey="year" />

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

          <XAxis dataKey="year" />

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
    loading={isStockLoading || (isStockRefreshing && !historicalPeHistory.length)}
  />
  <HistoricalLineChart
    title={stockData.isFinancialCompany ? "Net Interest Revenue Mix" : "Gross Margin History"}
    data={grossMarginHistory}
    dataKey="grossMargin"
    color="#a78bfa"
    formatter={(value) => `${Number(value).toFixed(1)}%`}
    valueLabel={stockData.isFinancialCompany ? "Net Interest Revenue Mix" : "Gross Margin"}
    loading={isStockLoading || (isStockRefreshing && !grossMarginHistory.length)}
  />
  <HistoricalLineChart
    title={stockData.isFinancialCompany ? "Pre-Tax Margin History" : "Operating Margin History"}
    data={operatingMarginHistory}
    dataKey="operatingMargin"
    color="#f59e0b"
    formatter={(value) => `${Number(value).toFixed(1)}%`}
    valueLabel={stockData.isFinancialCompany ? "Pre-Tax Margin" : "Operating Margin"}
    loading={isStockLoading || (isStockRefreshing && !operatingMarginHistory.length)}
  />
  <HistoricalLineChart
    title="Profit Margin History"
    data={profitMarginHistory}
    dataKey="profitMargin"
    color="#34d399"
    formatter={(value) => `${Number(value).toFixed(1)}%`}
    valueLabel="Profit Margin"
    loading={isStockLoading || (isStockRefreshing && !profitMarginHistory.length)}
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
      {stockValue(stockData.recommendationKey || "N/A")}
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
        Previous Year
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
              followingYearEstimate?.revenue
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
              followingYearEstimate?.earnings
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
              followingYearEstimate?.eps
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
      <span className="estimate-growth-period">Current estimate vs. 2025 actual</span>
    </div>

    <div className="estimate-growth-card">
      <span className="estimate-growth-label">Current Year Earnings Growth</span>
      <strong className={!isNumber(currentYearEarningsGrowth) ? "estimate-growth-unavailable" : currentYearEarningsGrowth >= 0 ? "estimate-growth-positive" : "estimate-growth-negative"}>
        {estimateValue(formatPercent(currentYearEarningsGrowth))}
      </strong>
      <span className="estimate-growth-period">Current estimate vs. 2025 actual</span>
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
{/* MULTI STOCK COMPARISON */}

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
  {stock.recommendationKey || "N/A"}
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
