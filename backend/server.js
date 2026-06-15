require("dotenv").config();

const express = require("express");
const cors = require("cors");
const axios = require("axios");
const cheerio = require("cheerio");
const mongoose = require("mongoose");
const yahooFinance = require("yahoo-finance2").default || require("yahoo-finance2");

const app = express();
const cache = new Map();
 





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
    const ticker = req.params.ticker.toUpperCase();
if (!ticker) {
  return res.status(400).json({ error: "No ticker provided" });
}
    await new Promise(resolve =>
  setTimeout(resolve, 1000)
);

const quote = {
  symbol: ticker,
  longName: `${ticker} Inc.`,
  regularMarketPrice: 150,
  marketCap: 3000000000000,
};

const fundamentals = {
  price: {
    marketCap: 3000000000000,
  },

  summaryDetail: {
    trailingPE: 32,
    forwardPE: 25,
    fiftyTwoWeekHigh: 250,
    fiftyTwoWeekLow: 120,
    dividendYield: 0.01,
    beta: 1.1,
  },

  defaultKeyStatistics: {
    sharesOutstanding: 15000000000,
  },

  financialData: {
    revenueGrowth: 0.22,
    earningsGrowth: 0.35,
    grossMargins: 0.55,
    operatingMargins: 0.33,
    profitMargins: 0.28,
    freeCashflow: 95000000000,
    targetMeanPrice: 220,
    recommendationKey: "buy",
  },

  earningsTrend: {
    trend: [],
  },
};

const history = [
  { date: "2024-01", close: 120 },
  { date: "2024-02", close: 130 },
  { date: "2024-03", close: 125 },
  { date: "2024-04", close: 140 },
  { date: "2024-05", close: 150 },
];

const revenueData = [
  {
    year: 2022,
    revenue: 220,
    earnings: 55,
    eps: 4.2,
  },
  {
    year: 2023,
    revenue: 260,
    earnings: 72,
    eps: 5.1,
  },
  {
    year: 2024,
    revenue: 310,
    earnings: 95,
    eps: 6.4,
  },
  {
    year: 2025,
    revenue: 380,
    earnings: 120,
    eps: 7.8,
  },
];


    

    const trend = fundamentals.earningsTrend?.trend || [];

    const currentYearEstimate = trend.find((t) => t.period === "0y");
    const nextYearEstimate = trend.find((t) => t.period === "+1y");

    res.json({
      symbol: quote.symbol || ticker,
      name: quote.longName || quote.shortName || ticker,
      price: quote.regularMarketPrice || 0,

      marketCap:
        fundamentals.price?.marketCap || quote.marketCap || 0,

      pe: fundamentals.summaryDetail?.trailingPE || 0,
      forwardPE: fundamentals.summaryDetail?.forwardPE || 0,

      sharesOutstanding:
        fundamentals.defaultKeyStatistics?.sharesOutstanding || 0,

      revenueGrowth:
        fundamentals.financialData?.revenueGrowth || 0,

      earningsGrowth:
        fundamentals.financialData?.earningsGrowth || 0,

      grossMargins:
        fundamentals.financialData?.grossMargins || 0,

      operatingMargins:
        fundamentals.financialData?.operatingMargins || 0,

      profitMargins:
        fundamentals.financialData?.profitMargins || 0,

      freeCashflow:
        fundamentals.financialData?.freeCashflow || 0,

      targetMean:
        fundamentals.financialData?.targetMeanPrice || 0,

      recommendationKey:
        fundamentals.financialData?.recommendationKey || "hold",

      fiftyTwoWeekHigh:
        fundamentals.summaryDetail?.fiftyTwoWeekHigh || 0,

      fiftyTwoWeekLow:
        fundamentals.summaryDetail?.fiftyTwoWeekLow || 0,

      dividendYield:
        fundamentals.summaryDetail?.dividendYield || 0,

      beta: fundamentals.summaryDetail?.beta || 0,

      analystEstimates: {
        currentYear: {
          revenue:
            currentYearEstimate?.revenueEstimate?.avg || null,
          earnings:
            currentYearEstimate?.earningsEstimate?.avg || null,
        },
        nextYear: {
          revenue:
            nextYearEstimate?.revenueEstimate?.avg || null,
          earnings:
            nextYearEstimate?.earningsEstimate?.avg || null,
        },
      },

      revenueData,
      history,
    });

  } catch (err) {
    console.error("FULL ERROR:", err);

    res.status(500).json({
      error: err.message,
      stack: err.stack,
    });
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
const cached = cache.get(ticker);
if (cached && Date.now() - cached.time < 60000) {
  return res.json(cached.data);
}
const quote = await yahooFinance.quote(ticker);



      const analysis = `
${quote.longName} (${ticker})

Current Price:
$${quote.regularMarketPrice}

Market Cap:
$${(
        quote.marketCap / 1e12
      ).toFixed(2)}T

Forward PE:
${quote.forwardPE?.toFixed(2)}

Revenue Growth:
${(
        (quote.revenueGrowth || 0) * 100
      ).toFixed(1)}%

Rating:
${quote.recommendationKey}
`;

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

app.listen(PORT, () => {

  console.log(
    `Server running on port ${PORT}`
  );
});