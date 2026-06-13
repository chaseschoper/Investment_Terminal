
require("dotenv").config();
console.log("MONGO =", process.env.MONGO_URI);
console.log("JWT =", process.env.JWT_SECRET);

const express = require("express");
const cors = require("cors");
const axios = require("axios");
const cheerio = require("cheerio");
const mongoose = require("mongoose");
const YahooFinance =
  require("yahoo-finance2").default;


const app = express();


app.use(cors());
app.use(express.json());
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB connected");
  })
  .catch((err) => {
    console.error(err);
  });

const yahooFinance =
  new YahooFinance({
    suppressNotices: [
      "yahooSurvey",
      "ripHistorical",
    ],
  });

/* =========================================
   STOCK DATA
========================================= */

app.get(
  "/api/stock/:ticker",
  async (req, res) => {
    try {
      const ticker =
        req.params.ticker.toUpperCase();

      console.log(
        "Loading ticker:",
        ticker
      );      // QUOTE
      const quote =
        await yahooFinance.quote(
          ticker
        );

      // PRICE HISTORY
      const chart =
        await yahooFinance.chart(
          ticker,
          {
            period1: new Date(
              "2023-01-01"
            ),

            period2: new Date(),

            interval: "1d",
          }
        );

      const history =
        chart.quotes || [];

      // FUNDAMENTALS
      const fundamentals =
        await yahooFinance.quoteSummary(
          ticker,
          {
modules: [
  "price",
  "financialData",
  "defaultKeyStatistics",
  "summaryDetail",
  "earningsTrend",
  "earnings",
]
          }
        );
const financialData =
  await yahooFinance.quoteSummary(
    ticker,
    {
      modules: [
        "incomeStatementHistory",
      ],
    }
  );

const statements =
  financialData
    ?.incomeStatementHistory
    ?.incomeStatementHistory ||
  financialData
    ?.incomeStatementHistory
    ?.incomeStatementHistoryQuarterly ||
  [];


/*
  HISTORICAL DATA
*/

const revenueData =
  statements
    .slice(0, 4)
    .reverse()
    .map((item, index) => {

      const revenue =
        (
          item.totalRevenue?.raw ||
          item.totalRevenue ||
          0
        ) / 1e9;

      const earnings =
        (
          item.netIncome?.raw ||
          item.netIncome ||
          0
        ) / 1e9;

      const shares =
        fundamentals
          .defaultKeyStatistics
          ?.sharesOutstanding || 1;

      const eps =
        (
          (
            item.netIncome?.raw ||
            item.netIncome ||
            0
          ) / shares
        );

      return {
        year: 2022 + index,

        revenue:
          Number(revenue.toFixed(1)),

        earnings:
          Number(earnings.toFixed(1)),

        eps:
          Number(eps.toFixed(2)),
      };
    });


/*
ANALYST ESTIMATES
*/

const trend =
  fundamentals.earningsTrend?.trend || [];

/*
CURRENT YEAR ESTIMATE
*/

const currentYearEstimate =
  trend.find(
    (t) => t.period === "0y"
  );

/*
NEXT YEAR ESTIMATE
*/

const nextYearEstimate =
  trend.find(
    (t) => t.period === "+1y"
  );
console.log(
  JSON.stringify(trend, null, 2)
);



const latest =
  revenueData[
    revenueData.length - 1
  ];



/*
RESPONSE
*/

res.json({
  symbol:
    quote.symbol || ticker,

  name:
    quote.longName ||
    quote.shortName ||
    ticker,

  price:
    quote.regularMarketPrice || 0,

  marketCap:
    fundamentals.price
      ?.marketCap ||
    quote.marketCap ||
    0,

  pe:
    fundamentals.summaryDetail
      ?.trailingPE || 0,

  forwardPE:
    fundamentals.summaryDetail
      ?.forwardPE || 0,

  sharesOutstanding:
    fundamentals.defaultKeyStatistics
      ?.sharesOutstanding ||
    0,

  revenueGrowth:
    fundamentals.financialData
      ?.revenueGrowth || 0,

  earningsGrowth:
    fundamentals.financialData
      ?.earningsGrowth || 0,

  grossMargins:
    fundamentals.financialData
      ?.grossMargins || 0,

  operatingMargins:
    fundamentals.financialData
      ?.operatingMargins || 0,

  profitMargins:
    fundamentals.financialData
      ?.profitMargins || 0,

  freeCashflow:
    fundamentals.financialData
      ?.freeCashflow || 0,

  targetMean:
    fundamentals.financialData
      ?.targetMeanPrice || 0,

  recommendationKey:
    fundamentals.financialData
      ?.recommendationKey ||
    "hold",

  fiftyTwoWeekHigh:
    fundamentals.summaryDetail
      ?.fiftyTwoWeekHigh || 0,

  fiftyTwoWeekLow:
    fundamentals.summaryDetail
      ?.fiftyTwoWeekLow || 0,

  dividendYield:
    fundamentals.summaryDetail
      ?.dividendYield || 0,

  beta:
    fundamentals.summaryDetail
      ?.beta || 0,
analystEstimates: {

  currentYear: {
    revenue:
      currentYearEstimate
        ?.revenueEstimate
        ?.avg || null,

    earnings:
      currentYearEstimate
        ?.earningsEstimate
        ?.avg || null,

    eps:
      currentYearEstimate
        ?.epsTrend
        ?.current || null,
  },

  nextYear: {
    revenue:
      nextYearEstimate
        ?.revenueEstimate
        ?.avg || null,

    earnings:
      nextYearEstimate
        ?.earningsEstimate
        ?.avg || null,

    eps:
      nextYearEstimate
        ?.epsTrend
        ?.current || null,
  },
},

revenueData: revenueData.map(
    (item) => ({
      ...item,

      revenueLabel:
        `$${item.revenue}B`,

      earningsLabel:
        `$${item.earnings}B`,

      epsLabel:
        `$${item.eps}`,
    })
  ),

  history: history.map(
    (item) => ({
      date:
        item.date
          .toISOString()
          .split("T")[0],

      close:
        item.close || 0,
    })
  ),
});



    } catch (err) {
      console.error(err);

      res.status(500).json({
        error:
          "Failed to fetch stock data",
      });
    }
  }
);


/* =========================================
   AI ANALYSIS
========================================= */

app.get(
  "/api/ai-analysis/:ticker",
  async (req, res) => {

    try {

      const ticker =
        req.params.ticker.toUpperCase();

      const quote =
        await yahooFinance.quote(
          ticker
        );

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

const PORT = 5001;

app.listen(PORT, () => {

  console.log(
    `Server running on port ${PORT}`
  );
});