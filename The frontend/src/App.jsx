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
import axios from "axios";
const API_URL =
  import.meta.env.VITE_API_URL ||
  "https://investment-terminal-jtng.onrender.com";

import "./App.css";
function App() {
  const latestStockRequest = useRef(0);
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

  const [portfolio, setPortfolio] =
  useState([]);

  const [portfolioPrices, setPortfolioPrices] =
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


  watchlist.forEach((symbol) => {
    loadPortfolioPrice(symbol);
  });

}, [watchlist]);


  /*
    SAVE PORTFOLIO
  */

  useEffect(() => {


  }, [portfolio]);

  /*
    LOAD STOCK WHEN TICKER CHANGES
  */

  useEffect(() => {
    const requestId = ++latestStockRequest.current;
    latestAiRequest.current += 1;
    latestEarningsCallRequest.current += 1;
    setStockData(null);
    setAiAnalysis(null);
    setEarningsCall(null);
    setTranscriptSearch("");
    window.speechSynthesis?.cancel();
    setIsSpeechPlaying(false);
    setIsSpeechPaused(false);
    setSpeechError("");
    setIsStockLoading(true);
    loadStock(ticker, 0, requestId);

  }, [ticker]);

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

  useEffect(() => {
    const symbol =
      searchInput.trim().toUpperCase();

    if (!symbol || symbol === ticker) {
      return;
    }

    const timeout =
      setTimeout(() => {
        setTicker(symbol);
      }, 300);

    return () =>
      clearTimeout(timeout);
  }, [searchInput, ticker]);

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

    try {
      const response =
        await axios.get(
          `${API_URL}/api/stock/${symbol}`
        );
console.log(response.data);
      if (requestId !== latestStockRequest.current) {
        return;
      }

      if (
        response.data.status === "pending"
      ) {
        if (attempt >= 12) {
          setIsStockLoading(false);
          return;
        }

        setTimeout(
          () =>
            loadStock(
              symbol,
              attempt + 1,
              requestId
            ),
          750
        );

        return;
      }

      setStockData(response.data);
      setIsStockLoading(false);

      if (response.data.refreshing && attempt < 30) {
        setTimeout(
          () => loadStock(symbol, attempt + 1, requestId),
          1000
        );
      }

      setPortfolioPrices((prev) => ({
        ...prev,
        [symbol]: response.data.price,
      }));

    } catch (error) {

      console.error(error);
      if (requestId !== latestStockRequest.current) return;

      if (attempt < 6) {
        setTimeout(
          () => loadStock(symbol, attempt + 1, requestId),
          1000
        );
      } else {
        setIsStockLoading(false);
      }

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

}, [watchlist, portfolio, user]);
       
  
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
    setPortfolio(response.data.portfolio || []);

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

  const loadPortfolioPrice = async (symbol) => {

    try {

      const response =
        await axios.get(
          `${API_URL}/api/stock/${symbol}`
        );

      setPortfolioPrices((prev) => ({
        ...prev,
        [symbol]: response.data.price,
      }));

    } catch (err) {

      console.error(err);

    }
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
  stockData = {
    name: isStockLoading
      ? `Loading ${ticker}...`
      : ticker,
    symbol: ticker,
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

            <span className="watch-symbol">
              {item}
            </span>

            <span className="watch-price">
              $
              {portfolioPrices[item]
                ?.toFixed(2) || "--"}
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

    </div>

    <nav className="section-tabs" aria-label="Page sections">
      <a href="#overview">Overview</a>
      <a href="#ai-analysis">AI Analysis</a>
      <a href="#financials">Financials</a>
      <a href="#metrics">Metrics</a>
      <a href="#portfolio">Portfolio</a>
      <a href="#comparison">Compare</a>
      <a href="#earnings-calendar">Calendar</a>
    </nav>

    {/* MAIN */}

    <div className="main" id="overview">



    {/* SEARCH */}

<div className="topbar">

  <input
    className="search"
    value={searchInput}
    onChange={(e) =>
      setSearchInput(
        e.target.value.toUpperCase()
      )
    }
    onKeyDown={(e) => {
      if (e.key === "Enter") {
        const symbol =
          searchInput.trim().toUpperCase();

        if (symbol) {
          setTicker(symbol);
        }
      }
    }}
    placeholder="Search ticker..."
  />

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

  <button
    className="portfolio-btn"
    onClick={() =>
      setShowAuth(true)
    }
  >
    {user ? user.username : "Login / Signup"}
  </button>

</div>
        {/* HEADER */}

        <div className="stock-header">

          <div className="stock-name">
            {stockData.name}
          </div>

          <div className="stock-price">
            $
            {stockData.price?.toFixed(2)}
          </div>

          <div className="stock-change">
            {stockData.symbol}
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

<div className="chart-section" id="ai-analysis">

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

<div className="chart-section">

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

<div className="chart-section">

  <h2 className="section-title">
    Earnings Call Audio & Transcript
  </h2>

  <div className="earnings-call-panel">
    {isEarningsCallLoading ? (
      <div className="earnings-call-empty">Loading latest recording...</div>
    ) : earningsCall?.available ? (
      <>
        <div className="earnings-call-header">
          <div>
            <div className="earnings-call-title">{earningsCall.title}</div>
            <div className="earnings-call-meta">
              {[earningsCall.fiscalPeriod, earningsCall.fiscalYear]
                .filter(Boolean)
                .join(" ")}
              {earningsCall.date
                ? ` · ${new Date(earningsCall.date).toLocaleDateString()}`
                : ""}
            </div>
          </div>
          <div className="earnings-call-provider">{earningsCall.provider}</div>
        </div>

        {earningsCall.audioUrl ? (
          <audio
            className="earnings-audio-player"
            controls
            preload="metadata"
            src={earningsCall.audioUrl}
          >
            Your browser does not support audio playback.
          </audio>
        ) : earningsCall.computerReadAudio && earningsCall.transcript?.length ? (
          <div className="computer-audio-player">
            <div className="computer-audio-label">
              Computer-read earnings call transcript
            </div>
            <div className="computer-audio-controls">
              <button type="button" onClick={playComputerRead}>
                {isSpeechPlaying && !isSpeechPaused ? "Playing" : "Play"}
              </button>
              <button type="button" onClick={pauseComputerRead} disabled={!isSpeechPlaying}>
                {isSpeechPaused ? "Resume" : "Pause"}
              </button>
              <button type="button" onClick={stopComputerRead} disabled={!isSpeechPlaying}>
                Stop
              </button>
              <label className="speech-rate-control">
                Speed
                <input
                  type="range"
                  min="0.75"
                  max="1.5"
                  step="0.25"
                  value={speechRate}
                  onChange={(event) => setSpeechRate(Number(event.target.value))}
                />
                <span>{speechRate.toFixed(2)}x</span>
              </label>
            </div>
            {speechError && <div className="computer-audio-error">{speechError}</div>}
          </div>
        ) : null}

        {earningsCall.transcript?.length ? (
          <div className="transcript-reader">
            <input
              className="transcript-search"
              type="search"
              value={transcriptSearch}
              onChange={(event) => setTranscriptSearch(event.target.value)}
              placeholder="Search transcript"
            />
            <div className="transcript-content">
              {filteredTranscript.map((section) => (
                <div className="transcript-section" key={section.id}>
                  <div className="transcript-speaker">
                    {section.speaker}
                    {section.session ? ` · ${section.session}` : ""}
                  </div>
                  <p>{section.text}</p>
                </div>
              ))}
              {!filteredTranscript.length && (
                <div className="earnings-call-empty">No transcript matches found.</div>
              )}
            </div>
          </div>
        ) : earningsCall.transcriptUrl ? (
          <iframe
            className="transcript-frame"
            title={`${ticker} earnings call transcript`}
            src={earningsCall.transcriptUrl}
          />
        ) : (
          <div className="earnings-call-empty">Transcript unavailable for this recording.</div>
        )}
      </>
    ) : (
      <div className="earnings-call-empty">
        {earningsCall?.reason === "alpha_key_missing"
          ? "The transcript source is not connected on the backend."
          : earningsCall?.reason === "alpha_key_invalid"
            ? "The transcript API key was rejected."
            : earningsCall?.reason === "alpha_daily_limit"
              ? "The free transcript source reached its daily request limit."
              : earningsCall?.reason === "alpha_plan_restricted"
                ? "The transcript endpoint is not included with this API plan."
              : earningsCall?.reason === "alpha_quarter_unavailable"
                ? `No transcript was found for ${earningsCall.requestedFiscalPeriod || "the latest quarter"}.`
                : "The earnings call transcript source is temporarily unavailable."}
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

{revenueHistory.length ? (

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

    {earningsHistory.length ? (

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

    {epsHistory.length ? (

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
        {/* METRICS */}

   <div className="grid section-anchor" id="metrics">

  <div className="card">
    <div className="card-title">
      Market Cap
    </div>

    <div className="card-value">
{formatBillions(stockData.marketCap)}
    </div>
  </div>

  <div className="card">
    <div className="card-title">
      Current P/E
    </div>

    <div className="card-value">
      {formatPlain(stockData.pe)}
    </div>
  </div>

  <div className="card">
    <div className="card-title">
      Forward P/E
    </div>

    <div className="card-value">
      {formatPlain(stockData.forwardPE)}
    </div>
  </div>

  <div className="card">
    <div className="card-title">
      Revenue Growth
    </div>

    <div className="card-value">
{formatPercent(stockData.revenueGrowth)}
    </div>
  </div>

  <div className="card">
    <div className="card-title">
      Earnings Growth
    </div>

    <div className="card-value">
{formatPercent(stockData.earningsGrowth)}
    </div>
  </div>

  <div className="card">
    <div className="card-title">
      Shares Outstanding
    </div>

    <div className="card-value">
{stockData.sharesOutstanding
  ? `${(stockData.sharesOutstanding / 1000).toFixed(2)}B`
  : "N/A"}
    </div>
  </div>

  <div className="card">
    <div className="card-title">
      {stockData.isFinancialCompany ? "Net Interest Revenue Mix" : "Gross Margin"}
    </div>

    <div className="card-value">
{formatPercent(
  stockData.isFinancialCompany
    ? stockData.bankMetrics?.netInterestRevenueMix
    : stockData.grossMargins
)}
    </div>
  </div>

  <div className="card">
    <div className="card-title">
      {stockData.isFinancialCompany ? "Pre-Tax Margin" : "Operating Margin"}
    </div>

    <div className="card-value">
{formatPercent(
  stockData.isFinancialCompany
    ? stockData.bankMetrics?.preTaxMargin
    : stockData.operatingMargins
)}
    </div>
  </div>

  <div className="card">
    <div className="card-title">
      Profit Margin
    </div>

    <div className="card-value">
{formatPercent(stockData.profitMargins)}
    </div>
  </div>

  <div className="card">
    <div className="card-title">
      {stockData.isFinancialCompany ? "Annual Cash Change" : "Free Cash Flow"}
    </div>

    <div className="card-value">
{formatBillions(
  stockData.isFinancialCompany
    ? stockData.bankMetrics?.annualCashChange
    : stockData.freeCashflow
)}
    </div>
  </div>

  <div className="card">
    <div className="card-title">
      Price Target
    </div>

    <div className="card-value">
{formatPrice(stockData.targetMean)}
    </div>
  </div>

  <div className="card">
    <div className="card-title">
      Analyst Rating
    </div>

    <div className="card-value">
      {stockData.recommendationKey || "N/A"}
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
    gridTemplateColumns: "1fr 1fr",
    gap: "80px",
    maxWidth: "900px",
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
            {formatEstimateMoney(
              previousYearEstimate?.revenue
            )}
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
            {formatEstimateMoney(
              previousYearEstimate?.earnings
            )}
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
            {formatEstimateEps(
              previousYearEstimate?.eps
            )}
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
            {formatEstimateMoney(
              currentYearEstimate?.revenue
            )}
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
            {formatEstimateMoney(
              currentYearEstimate?.earnings
            )}
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
            {formatEstimateEps(
              currentYearEstimate?.eps
            )}
          </span>
        </div>

      </div>

    </div>

  </div>

</div>

{/* PORTFOLIO TRACKER */}

<div className="portfolio-section" id="portfolio">

  <h2 className="section-title">
    Portfolio Tracker
  </h2>
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

    if (
      portfolioTicker &&
      portfolioShares &&
      portfolioCost
    ) {

      await loadPortfolioPrice(
        portfolioTicker
      );

      const newPosition = {
        symbol: portfolioTicker,
        shares: Number(portfolioShares),
        avgCost: Number(portfolioCost),
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


{portfolio.map((position) => {

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
      key={`${position.symbol}-${position.avgCost}`}
      className="portfolio-row"
    >

      <span>{position.symbol}</span>

      <span>{position.shares}</span>

      <span>{formatPortfolioCurrency(Number(position.avgCost))}</span>

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

    setPortfolio(
      portfolio.filter(
        (_, index) =>
          index !==
          portfolio.findIndex(
            (p) =>
              p.symbol === position.symbol &&
              p.avgCost === position.avgCost
          )
      )
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

<div className="chart-section">

  <h2 className="section-title">
    Portfolio Performance
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

{/* LIVE EARNINGS CALENDAR */}

<div className="chart-section" id="earnings-calendar">

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
              <strong>{event.symbol}</strong>
              <small>{event.company}</small>
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
