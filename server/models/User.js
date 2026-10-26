// A student who can log in.
// We never store the real password, only its bcrypt hash.

const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true }, // bcrypt hash, not the plain password
  },
  { timestamps: true } // adds createdAt and updatedAt automatically
);

module.exports = mongoose.model("User", userSchema);
