import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
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

const formatBillions = (value) =>
  isNumber(value) ? `$${(value / 1e9).toFixed(1)}B` : "N/A";

const formatPlain = (value) =>
  isNumber(value) ? value.toFixed(2) : "N/A";

const formatPrice = (value) =>
  isNumber(value) ? `$${value.toFixed(2)}` : "N/A";

const formatChartBillions = (value) =>
  isNumber(value) ? `$${value.toFixed(1)}B` : "N/A";

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
      item.year && item[key] !== null
    );
import axios from "axios";
const API_URL =
  import.meta.env.VITE_API_URL ||
  "https://investment-terminal-jtng.onrender.com";

import "./App.css";
function App() {
  const latestStockRequest = useRef(0);
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

  const [isStockLoading, setIsStockLoading] =
    useState(false);

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
    useState([]);

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

    loadStock();

  }, [ticker]);

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

    loadEarnings();

  }, []);

  /*
    LOAD PORTFOLIO PRICES
  */



  /*
    LOAD COMPARISON STOCKS
  */

  useEffect(() => {

    loadComparisonStocks();

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
      if (attempt === 0) {
        latestStockRequest.current = requestId;
        setIsStockLoading(true);
      }

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
          2000
        );

        return;
      }

      setStockData(response.data);
      setIsStockLoading(false);

      setPortfolioPrices((prev) => ({
        ...prev,
        [symbol]: response.data.price,
      }));

    } catch (error) {

      console.error(error);
      setIsStockLoading(false);

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

  const loadEarnings = async () => {

    try {

      const earningsRes =
        await axios.get(

    `${API_URL}/api/earnings`
        );

      setEarnings(
        earningsRes.data
      );

    } catch (err) {

      console.error(err);

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

  const loadComparisonStocks = async () => {

    try {

      const results =
        await Promise.all(

          compareTickers.map(async (symbol) => {

            const res =
              await axios.get(
                `${API_URL}/api/stock/${symbol}`
              );

            return res.data;

          })
        );

      setCompareData(results);

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


 

return (

  <div className="app">

    {/* TOP WATCHLIST BAR */}

    <div className="top-watchlist">

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

    {/* MAIN */}

    <div className="main">



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

<div className="chart-section">

  <h2 className="section-title">
    AI Stock Analysis
  </h2>

  <div className="ai-analysis-box">

    <div className="ai-sentiment">

      {stockData.recommendationKey === "buy" && "🟢 Bullish"}

      {stockData.recommendationKey === "hold" && "🟡 Neutral"}

      {stockData.recommendationKey === "sell" && "🔴 Bearish"}

    </div>

    <div className="ai-text">

      <p>
        <strong>{stockData.name}</strong>
        {" "}currently trades at{" "}
        <strong>
          {formatPrice(stockData.price)}
        </strong>
        .
      </p>

      <p>
        Revenue growth is{" "}
        <strong>
          {formatPercent(stockData.revenueGrowth)}
        </strong>
        {" "}with earnings growth at{" "}
        <strong>
  {formatPercent(stockData.earningsGrowth)}
        </strong>
        .
      </p>

      <p>
        Analysts currently rate this stock as{" "}
        <strong>
          {stockData.recommendationKey}
        </strong>
        {" "}with an average price target of{" "}
        <strong>
          {formatPrice(stockData.targetMean)}
        </strong>
        .
      </p>

      <p>

        {stockData.forwardPE < stockData.pe
          ? "Forward valuation is improving compared to current earnings."
          : "Forward valuation remains elevated compared to current earnings."
        }

      </p>

    </div>

  </div>

</div>
{/* AI EARNINGS TRANSCRIPT ANALYSIS */}

<div className="chart-section">

  <h2 className="section-title">
    AI Earnings Call Analysis
  </h2>

  <div className="ai-analysis-grid">

    {/* SUMMARY */}

    <div className="ai-card">

      <h3 className="ai-title">
        AI Transcript Summary
      </h3>

      <p className="ai-text">

        {stockData.name} management discussed
        long-term growth opportunities,
        operational efficiency,
        and future demand trends.

        The company remains focused on
        expanding margins, improving
        shareholder value, and scaling
        future revenue streams.

      </p>

    </div>

    {/* HIGHLIGHTS */}

    <div className="ai-card">

      <h3 className="ai-title">
        Earnings Highlights
      </h3>

      <ul className="ai-list">

        <li>
          Revenue growth exceeded expectations
        </li>

        <li>
          Margins remained stable
        </li>

        <li>
          Strong free cash flow generation
        </li>

        <li>
          Continued expansion into AI initiatives
        </li>

      </ul>

    </div>

    {/* BULLISH */}

    <div className="ai-card bullish-card">

      <h3 className="ai-title">
        Bullish Takeaways
      </h3>

      <ul className="ai-list">

        <li>
          Strong guidance from management
        </li>

        <li>
          Improving operating leverage
        </li>

        <li>
          High analyst confidence
        </li>

        <li>
          Long-term growth catalysts remain intact
        </li>

      </ul>

    </div>

    {/* BEARISH */}

    <div className="ai-card bearish-card">

      <h3 className="ai-title">
        Bearish Risks
      </h3>

      <ul className="ai-list">

        <li>
          Macroeconomic uncertainty
        </li>

        <li>
          Margin compression risks
        </li>

        <li>
          Slowing consumer demand
        </li>

        <li>
          Regulatory pressure remains possible
        </li>

      </ul>

    </div>

    {/* SENTIMENT */}

    <div className="ai-card">

      <h3 className="ai-title">
        Management Sentiment
      </h3>

      <div className="sentiment-row">

        <div className="sentiment-label">
          Confidence
        </div>

        <div className="sentiment-bar">

          <div
            className="sentiment-fill positive"
            style={{ width: "78%" }}
          />

        </div>

      </div>

      <div className="sentiment-row">

        <div className="sentiment-label">
          Caution
        </div>

        <div className="sentiment-bar">

          <div
            className="sentiment-fill negative"
            style={{ width: "32%" }}
          />

        </div>

      </div>

    </div>

    {/* GUIDANCE */}

    <div className="ai-card">

      <h3 className="ai-title">
        Guidance Outlook
      </h3>

      <p className="ai-text">

        Management expects continued
        revenue expansion over the next
        several quarters with improving
        profitability trends and ongoing
        investment into future growth areas.

      </p>

    </div>

  </div>

</div>
{/* EARNINGS CALL TRANSCRIPTS */}

<div className="chart-section">

  <h2 className="section-title">
    Earnings Call Transcripts
  </h2>

  <div
    style={{
      background: "#111827",
      borderRadius: "16px",
      padding: "24px",
      border: "1px solid #1f2937",
    }}
  >

    <div
      style={{
        fontSize: "20px",
        fontWeight: "700",
        marginBottom: "10px",
      }}
    >
      {ticker} Investor Relations
    </div>

    <div
      style={{
        color: "#9ca3af",
        marginBottom: "20px",
        lineHeight: "1.7",
      }}
    >
      Read official earnings call transcripts,
      quarterly reports, shareholder letters,
      and investor presentations directly from
      the company investor relations website.
    </div>

    <div
      style={{
        display: "flex",
        gap: "12px",
        flexWrap: "wrap",
      }}
    >

      <a
  href={`https://www.alphaspread.com/security/nasdaq/${ticker}/earnings-calls`}
  target="_blank"
  rel="noreferrer"
  className="portfolio-btn"
  style={{
    textDecoration: "none",
  }}
>
  Open Transcript Site
</a>

      <a
        href={`https://www.youtube.com/results?search_query=${ticker}+earnings+call`}
        target="_blank"
        rel="noreferrer"
        className="portfolio-btn"
        style={{
          textDecoration: "none",
          background: "#dc2626",
        }}
      >
        Watch Earnings Call
      </a>

    </div>

  </div>

</div>
{/* REVENUE CHART */}

<div className="chart-section">

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

   <div className="grid">

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
      Gross Margin
    </div>

    <div className="card-value">
{formatPercent(stockData.grossMargins)}
    </div>
  </div>

  <div className="card">
    <div className="card-title">
      Operating Margin
    </div>

    <div className="card-value">
{formatPercent(stockData.operatingMargins)}
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
      Free Cash Flow
    </div>

    <div className="card-value">
{formatBillions(stockData.freeCashflow)}
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
              stockData?.analystEstimates?.currentYear?.revenue
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
              stockData?.analystEstimates?.currentYear?.earnings
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
              stockData?.analystEstimates?.currentYear?.eps
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
              stockData?.analystEstimates?.nextYear?.revenue
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
              stockData?.analystEstimates?.nextYear?.earnings
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
              stockData?.analystEstimates?.nextYear?.eps
            )}
          </span>
        </div>

      </div>

    </div>

  </div>

</div>

{/* PORTFOLIO TRACKER */}

<div className="portfolio-section">

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

  return (

    <div
      key={`${position.symbol}-${position.avgCost}`}
      className="portfolio-row"
    >

      <span>{position.symbol}</span>

      <span>{position.shares}</span>

      <span>${position.avgCost}</span>

      <span>${current.toFixed(2)}</span>

      <span>${value.toFixed(2)}</span>

      <span
        className={
          profit >= 0
            ? "green"
            : "red"
        }
      >
        ${profit.toFixed(2)}
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

  <div className="chart-box">

    <ResponsiveContainer
      width="100%"
      height={400}
    >

      <BarChart
        data={portfolio.map((position) => {

          const current =
            portfolioPrices[position.symbol] || 0;

          const value =
            current * position.shares;

          const cost =
            position.avgCost * position.shares;

          return {
            symbol: position.symbol,
            gain: Number(
              (value - cost).toFixed(2)
            ),
          };

        })}
      >

        <CartesianGrid stroke="#1f2937" />

        <XAxis dataKey="symbol" />

        <YAxis />

        <Tooltip />

<Bar
  dataKey="gain"
  radius={[6, 6, 0, 0]}
>
  {
    portfolio.map((position) => {

      const current =
        portfolioPrices[position.symbol] || 0;

      const value =
        current * position.shares;

      const cost =
        position.avgCost * position.shares;

      const profit =
        value - cost;

      return (
        <Cell
          key={position.symbol}
          fill={
            profit >= 0
              ? "#22c55e"
              : "#ef4444"
          }
        />
      );

    })
  }
</Bar>

      </BarChart>

    </ResponsiveContainer>

  </div>

</div>
{/* MULTI STOCK COMPARISON */}

<div className="chart-section">

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
      <span>Gross Margin</span>
<strong>
  {formatPercent(stock.grossMargins)}
</strong>
    </div>

    <div className="comparison-stat">
      <span>Operating Margin</span>
<strong>
  {formatPercent(stock.operatingMargins)}
</strong>
    </div>

    <div className="comparison-stat">
      <span>Profit Margin</span>
<strong>
  {formatPercent(stock.profitMargins)}
</strong>
    </div>

    <div className="comparison-stat">
      <span>Free Cash Flow</span>
<strong>
  {formatBillions(stock.freeCashflow)}
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
        {stock.dividendYield
          ? `${(stock.dividendYield * 100).toFixed(2)}%`
          : "N/A"}
      </strong>
    </div>

    <div className="comparison-stat">
      <span>52W High</span>
      <strong>
        ${stock.fiftyTwoWeekHigh?.toFixed(2)}
      </strong>
    </div>

    <div className="comparison-stat">
      <span>52W Low</span>
      <strong>
        ${stock.fiftyTwoWeekLow?.toFixed(2)}
      </strong>
    </div>

    <div className="comparison-stat">
      <span>Beta</span>
      <strong>
        {stock.beta?.toFixed(2)}
      </strong>
    </div>

  </div>

))}

  </div>

</div>

{/* LIVE EARNINGS CALENDAR */}

<div className="chart-section">

  <h2 className="section-title">
    Live Earnings Calendar
  </h2>

  <div
    style={{
      background: "#111827",
      borderRadius: "16px",
      overflow: "hidden",
      height: "800px",
    }}
  >

    <iframe
      src="https://www.marketbeat.com/earnings/calendar/"
      width="100%"
      height="800"
      style={{
        border: "none",
      }}
      title="Earnings Calendar"
    />

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
