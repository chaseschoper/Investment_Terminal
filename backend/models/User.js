const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
  },

  email: {
    type: String,
    required: true,
    unique: true,
  },

  password: {
    type: String,
    default: "",
  },

  googleId: {
    type: String,
    default: "",
  },

  authProvider: {
    type: String,
    default: "password",
  },

  passwordResetToken: {
    type: String,
    default: "",
  },

  passwordResetExpires: {
    type: Date,
    default: null,
  },

  watchlist: {
    type: [String],
    default: [],
  },

  namedWatchlists: {
    type: Array,
    default: [],
  },

  portfolio: {
    type: Array,
    default: [],
  },

  portfolios: {
    type: Array,
    default: [],
  },

  activePortfolioId: {
    type: String,
    default: "",
  },

  projections: {
    type: Object,
    default: {},
  },
});

module.exports = mongoose.model(
  "User",
  UserSchema
);
