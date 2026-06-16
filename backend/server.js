
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const axios = require("axios");
const cheerio = require("cheerio");
const mongoose = require("mongoose");

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const Stock = require("./models/Stock");
const User = require("./models/User");

const app = express();

// =========================
// BASIC SETUP
// =========================
app.use(cors({ origin: "*" }));
app.use(express.json());

app.use((req, res, next) => {
res.setHeader("Cache-Control", "no-store");
next();
});

// =========================
// DB CONNECTION
// =========================
mongoose
.connect(process.env.MONGO_URI)
.then(() => console.log("MongoDB connected"))
.catch(err => console.error(err));

// =========================
// AUTH MIDDLEWARE
// =========================
const authMiddleware = async (req, res, next) => {
try {
const token = req.headers.authorization?.split(" ")[1];
if (!token) return res.status(401).json({ error: "No token" });


const decoded = jwt.verify(token, process.env.JWT_SECRET);

req.user = await User.findById(decoded.id);
next();


} catch (err) {
return res.status(401).json({ error: "Invalid token" });
}
};


// =========================
// STOCK ROUTE DB ONLY
// =========================
app.get("/api/stock/:ticker", async (req, res) => {
  try {
    const ticker = req.params.ticker.toUpperCase();

    let stock = await Stock.findOne({ ticker });

    if (!stock) {
      await Stock.findOneAndUpdate(
        { ticker },
        {
          ticker,
          status: "pending",
          updatedAt: new Date()
        },
        { upsert: true }
      );

      return res.status(202).json({
        status: "loading",
        message: `${ticker} is being fetched. Try again in a few seconds.`
      });
    }

    res.json({
      ticker: stock.ticker,
      status: stock.status,
      ...stock.data,
      updatedAt: stock.updatedAt
    });

  } catch (err) {
    console.error("Stock fetch failed:", err.message);
    res.status(500).json({ error: "Stock fetch failed" });
  }
});
// =========================
// AI ANALYSIS (DB ONLY)
// =========================
app.get("/api/ai-analysis/:ticker", async (req, res) => {
try {
const ticker = req.params.ticker.toUpperCase();


const stock = await Stock.findOne({ ticker });

if (!stock) {
  return res.status(404).json({ error: "No stock data found" });
}

const analysis = `


${stock.ticker}

Price: $${stock.data?.price}

Market Cap: ${stock.data?.marketCap}

PE: ${stock.data?.pe}

Forward PE: ${stock.data?.forwardPE}

Revenue Growth: ${stock.data?.revenueGrowth}

Earnings Growth: ${stock.data?.earningsGrowth}
`;


res.json({ analysis });


} catch (err) {
console.error(err);
res.status(500).json({ error: "AI analysis failed" });
}
});

// =========================
// EARNINGS CALENDAR
// =========================
app.get("/api/earnings", async (req, res) => {
try {
const response = await axios.get(
"https://www.investing.com/earnings-calendar/",
{
timeout: 10000,
headers: {
"User-Agent":
"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
"Accept-Language": "en-US,en;q=0.9"
}
}
);


const $ = cheerio.load(response.data);
const earnings = [];

$("tr").each((_, el) => {
  const tds = $(el).find("td");
  if (tds.length < 8) return;

  const date = $(tds[0]).text().trim();
  const symbol = $(tds[1]).text().trim();
  const company = $(tds[2]).text().trim();
  const estimate = $(tds[7]).text().trim();

  if (symbol && company && date) {
    earnings.push({
      symbol,
      company,
      earningsDate: date,
      estimate: estimate || "N/A"
    });
  }
});

res.json(earnings.slice(0, 50));


} catch (err) {
console.error("Earnings error:", err.message);
res.json([]);
}
});

// =========================
// AUTH ROUTES
// =========================

// SIGNUP
app.post("/api/signup", async (req, res) => {
try {
const { username, email, password } = req.body;


const exists = await User.findOne({ email });
if (exists) return res.status(400).json({ error: "User exists" });

const hashed = await bcrypt.hash(password, 10);

const user = new User({
  username,
  email,
  password: hashed
});

await user.save();

const token = jwt.sign(
  { id: user._id },
  process.env.JWT_SECRET,
  { expiresIn: "7d" }
);

res.json({
  success: true,
  token,
  user
});


} catch (err) {
console.error(err);
res.status(500).json({ error: "Signup failed" });
}
});

// LOGIN
app.post("/api/login", async (req, res) => {
try {
const { email, password } = req.body;


const user = await User.findOne({ email });
if (!user) return res.status(400).json({ error: "Invalid credentials" });

const valid = await bcrypt.compare(password, user.password);
if (!valid) return res.status(400).json({ error: "Invalid credentials" });

const token = jwt.sign(
  { id: user._id },
  process.env.JWT_SECRET,
  { expiresIn: "7d" }
);

res.json({
  success: true,
  token,
  user
});


} catch (err) {
console.error(err);
res.status(500).json({ error: "Login failed" });
}
});

// SAVE USER DATA
app.post("/api/save-data", authMiddleware, async (req, res) => {
try {
const { watchlist, portfolio } = req.body;

req.user.watchlist = watchlist;
req.user.portfolio = portfolio;

await req.user.save();

res.json({ success: true });


} catch (err) {
res.status(500).json({ error: "Save failed" });
}
});

// GET USER DATA
app.get("/api/user-data", authMiddleware, async (req, res) => {
res.json({
watchlist: req.user.watchlist || [],
portfolio: req.user.portfolio || []
});
});

// =========================
// HEALTH
// =========================
app.get("/health", (req, res) => {
res.json({ status: "ok" });
});

// =========================
// START SERVER
// =========================
const PORT = process.env.PORT || 5001;

app.listen(PORT, () => {
console.log(`Server running on port ${PORT}`);
});
