require("dotenv").config();

const express = require("express");
const cors = require("cors");
const axios = require("axios");
const cheerio = require("cheerio");
const mongoose = require("mongoose");
const yahooFinance = require("yahoo-finance2").default || require("yahoo-finance2");
process.on("unhandledRejection", (err) => {
  console.error("Unhandled Rejection:", err);
});
// ==========================
// GLOBAL CACHE + THROTTLE
// ==========================

const requestQueue = new Map();

async function throttle(key, fn) {
  const last = requestQueue.get(key) || 0;
  const now = Date.now();

  const wait = Math.max(0, 1500 - (now - last));
  if (wait > 0) {
    await new Promise(res => setTimeout(res, wait));
  }

  requestQueue.set(key, Date.now());

  try {
    return await fn();
  } catch (err) {
    console.error(`Throttle error for ${key}:`, err.message);
    throw err;
  }
}
async function yahooSafeCall(key, fn, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await throttle(key, fn);
    } catch (err) {
      const msg = err?.message || "";

      if (
        msg.includes("Too Many Requests") ||
        msg.includes("rate") ||
        msg.includes("429")
      ) {
        await new Promise(res => setTimeout(res, 2000 * (i + 1)));
        continue;
      }

      throw err;
    }
  }

  throw new Error("Yahoo Finance failed after retries");
}
const app = express();

app.set("trust proxy", 1);
const cache = new Map();
const CACHE_TTL = 1000 * 60 * 10; // 10 minutes





app.use(cors({
origin: "*",
  credentials: true
}));

app.use(express.json());
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB connected");
  })
  .catch((err) => {
    console.error(err);
  });


/* =========================================
   STOCK DATA
========================================= */
app.get("/api/stock/:ticker", async (req, res) => {
  try {
    const ticker = req.params.ticker?.toUpperCase();
if (!ticker || ticker.length > 6) {
  return res.status(400).json({ error: "Invalid ticker" });
}

    // CACHE CHECK (FAST EXIT)
const cached = cache.get(`stock-${ticker}`);
if (cached && Date.now() - cached.time < CACHE_TTL) {
  return res.json(cached.data);
}

    // ======================
    // THROTTLED YAHOO CALLS
    // ======================
const quote = await yahooSafeCall(`quote-${ticker}`, () =>
  yahooFinance.quote(ticker)
);

const fundamentals = await yahooSafeCall(`summary-${ticker}`, () =>
  yahooFinance.quoteSummary(ticker, {
    modules: [
      "price",
      "summaryDetail",
      "defaultKeyStatistics",
      "financialData",
      "earningsTrend",
    ],
  })
);

    const historyRaw = await yahooSafeCall(`history-${ticker}`, () =>
      yahooFinance.historical(ticker, {
        period1: "2024-01-01",
        interval: "1mo",
      })
    );

    const history = historyRaw.map(item => ({
      date: item.date.toISOString().slice(0, 7),
      close: item.close,
    }));

const trend = fundamentals?.earningsTrend?.trend || [];

const currentYearEstimate = trend.find(t => t.period === "0y") || null;
const nextYearEstimate = trend.find(t => t.period === "+1y") || null;
    const data = {
      symbol: quote.symbol,
      name: quote.longName,
      price: quote.regularMarketPrice,

      marketCap: fundamentals.price?.marketCap || 0,
      pe: fundamentals.summaryDetail?.trailingPE || 0,
      forwardPE: fundamentals.summaryDetail?.forwardPE || 0,
      sharesOutstanding: fundamentals.defaultKeyStatistics?.sharesOutstanding || 0,

      revenueGrowth: fundamentals.financialData?.revenueGrowth || 0,
      earningsGrowth: fundamentals.financialData?.earningsGrowth || 0,

      grossMargins: fundamentals.financialData?.grossMargins || 0,
      operatingMargins: fundamentals.financialData?.operatingMargins || 0,
      profitMargins: fundamentals.financialData?.profitMargins || 0,

      freeCashflow: fundamentals.financialData?.freeCashflow || 0,
      targetMean: fundamentals.financialData?.targetMeanPrice || 0,
      recommendationKey: fundamentals.financialData?.recommendationKey || "hold",

      fiftyTwoWeekHigh: fundamentals.summaryDetail?.fiftyTwoWeekHigh || 0,
      fiftyTwoWeekLow: fundamentals.summaryDetail?.fiftyTwoWeekLow || 0,
      dividendYield: fundamentals.summaryDetail?.dividendYield || 0,
      beta: fundamentals.summaryDetail?.beta || 0,

analystEstimates: {
  currentYear: {
    revenue: currentYearEstimate?.revenueEstimate?.avg ?? null,
    earnings: currentYearEstimate?.earningsEstimate?.avg ?? null,
  },
  nextYear: {
    revenue: nextYearEstimate?.revenueEstimate?.avg ?? null,
    earnings: nextYearEstimate?.earningsEstimate?.avg ?? null,
  },
},

      history,
      revenueData: [
  { year: 2022, revenue: null, earnings: null, eps: null },
  { year: 2023, revenue: null, earnings: null, eps: null },
  { year: 2024, revenue: null, earnings: null, eps: null },
  { year: 2025, revenue: null, earnings: null, eps: null },
],
    };

    // ======================
    // SAVE CACHE
    // ======================
    cache.set(`stock-${ticker}`, {
      time: Date.now(),
      data,
    });

    return res.json(data);
  } catch (err) {
    console.error("STOCK ERROR:", err);
    return res.status(500).json({ error: err.message });
  }
});
/* =========================================
   AI ANALYSIS
========================================= */

app.get(
  "/api/ai-analysis/:ticker",
  async (req, res) => {

    try {

      const ticker =
        req.params.ticker.toUpperCase();

// CHECK CACHE FIRST
const cached = cache.get(`ai-${ticker}`);
if (cached && Date.now() - cached.time < 60000) {
  return res.json(cached.data);
}
const cachedStock = cache.get(`stock-${ticker}`);
const quote = cachedStock?.data
  ? cachedStock.data
  : await yahooSafeCall(`quote-${ticker}`, () => yahooFinance.quote(ticker));



      const analysis = `
${quote.longName} (${ticker})

Current Price:
$${quote.regularMarketPrice}

Market Cap:
$${((quote.marketCap || 0) / 1e12).toFixed(2)}T

Forward PE:
${quote.forwardPE?.toFixed(2)}

Revenue Growth:
${(
        (quote.revenueGrowth || 0) * 100
      ).toFixed(1)}%

Rating:
${quote.recommendationKey}
`;

cache.set(`ai-${ticker}`, {
  time: Date.now(),
  data: { analysis }
});

res.json({
  analysis,
});
    } catch (error) {

      console.error(error);

      res.status(500).json({
        error:
          "AI analysis failed",
      });
    }
  }
);




/* =========================================
   LIVE EARNINGS CALENDAR
========================================= */

app.get("/api/earnings", async (req, res) => {

  try {

    const response = await axios.get(
      "https://www.investing.com/earnings-calendar/",
      {
        timeout: 10000,

        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
          "Accept-Language":
            "en-US,en;q=0.9",
        },
      }
    );

    const $ = cheerio.load(response.data);

    const earnings = [];

    $("tr").each((i, el) => {

      const tds = $(el).find("td");

      if (tds.length < 8) {
        return;
      }

      const date =
        $(tds[0]).text().trim();

      const symbol =
        $(tds[1]).text().trim();

      const company =
        $(tds[2]).text().trim();

      const estimate =
        $(tds[7]).text().trim();

      if (
        symbol &&
        company &&
        date
      ) {

        earnings.push({
          symbol,
          company,
          earningsDate: date,
          estimate:
            estimate || "N/A",
        });
      }
    });

    console.log(
      "FINAL EARNINGS:",
      earnings.slice(0, 10)
    );

    res.json(
      earnings.slice(0, 50)
    );

  } catch (err) {

    console.error(
      "EARNINGS ERROR:",
      err.message
    );

    res.json([]);
  }
});

/*=========================================
   ROOT
========================================= */

app.get("/", (req, res) => {

  res.send(
    "Investment Terminal Backend Running"
  );
});
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});
/* =========================================
   AUTH ROUTES
========================================= */

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const User = require("./models/User");

/* =========================================
   AUTH MIDDLEWARE
========================================= */

const authMiddleware = async (
  req,
  res,
  next
) => {

  try {

    const token =
      req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        error: "No token",
      });
    }

    const decoded =
      jwt.verify(
        token,
        process.env.JWT_SECRET
      );

    req.user =
      await User.findById(
        decoded.id
      );

    next();

  } catch (err) {

    res.status(401).json({
      error: "Invalid token",
    });
  }
};

/* =========================================
   SIGNUP
========================================= */

app.post("/api/signup", async (req, res) => {

  try {

    const {
      username,
      email,
      password,
    } = req.body;

    const existingUser =
      await User.findOne({
        email,
      });

    if (existingUser) {
      return res.status(400).json({
        error: "User already exists",
      });
    }

    const hashedPassword =
      await bcrypt.hash(password, 10);

    const user =
      new User({
        username,
        email,
        password: hashedPassword,
      });

    await user.save();

    const token = jwt.sign(
      {
        id: user._id,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "7d",
      }
    );

    res.json({
      success: true,

      token,

      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        watchlist: user.watchlist,
        portfolio: user.portfolio,
      },
    });

  } catch (err) {

    console.error(err);

    res.status(500).json({
      error: "Signup failed",
    });
  }
});

/* =========================================
   LOGIN
========================================= */

app.post("/api/login", async (req, res) => {

  try {

    const {
      email,
      password,
    } = req.body;

    const user =
      await User.findOne({
        email,
      });

    if (!user) {
      return res.status(400).json({
        error: "Invalid credentials",
      });
    }

    const validPassword =
      await bcrypt.compare(
        password,
        user.password
      );

    if (!validPassword) {
      return res.status(400).json({
        error: "Invalid credentials",
      });
    }

    const token = jwt.sign(
      {
        id: user._id,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "7d",
      }
    );

    res.json({
      success: true,

      token,

      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        watchlist: user.watchlist,
        portfolio: user.portfolio,
      },
    });

  } catch (err) {

    console.error(err);

    res.status(500).json({
      error: "Login failed",
    });
  }
});

/* =========================================
   SAVE USER DATA
========================================= */

app.post(
  "/api/save-data",
  authMiddleware,
  async (req, res) => {

    try {

      const {
        watchlist,
        portfolio,
      } = req.body;

      req.user.watchlist =
        watchlist;

      req.user.portfolio =
        portfolio;
console.log(
  "Saving:",
  watchlist,
  portfolio
);
      await req.user.save();

      res.json({
        success: true,
      });

    } catch (err) {

      console.error(err);

      res.status(500).json({
        error: "Save failed",
      });
    }
  }
);

/* =========================================
   LOAD USER DATA
========================================= */

app.get(
  "/api/user-data",
  authMiddleware,
  async (req, res) => {

    res.json({
      watchlist:
        req.user.watchlist || [],

      portfolio:
        req.user.portfolio || [],
    });
  }
);


/* =========================================
   START SERVER
========================================= */

const PORT = process.env.PORT || 5001;
app.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});