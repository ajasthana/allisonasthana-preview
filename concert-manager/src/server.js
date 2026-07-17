require("dotenv").config();
const path = require("path");
const express = require("express");
const session = require("express-session");

const adminRoutes = require("./routes/admin");
const offerRoutes = require("./routes/offers");

const app = express();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "..", "public")));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev-only-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: "lax" },
  })
);

app.use("/offers", offerRoutes);
app.use("/", adminRoutes);

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Concert Manager listening on http://localhost:${port}`);
});
