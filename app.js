var createError = require("http-errors");
var express = require("express");
var path = require("path");
var cookieParser = require("cookie-parser");
var logger = require("morgan");
var cors = require("cors");
const passport = require('passport');
const { swaggerUi, swaggerSpec } = require("./swagger");

// Passport configuration
require('./config/passport');

var indexRouter = require("./routes/index");
var usersRouter = require("./routes/users");
var aiRouter = require("./routes/ai");
var authRouter = require("./routes/auth");
var blogsRouter = require("./routes/blogs");

var app = express();

// view engine setup
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "jade");

// Enable CORS
app.use(cors());
app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Initialize Passport
app.use(passport.initialize());

// Swagger UI
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Routes
app.use("/", indexRouter);
app.use("/users", usersRouter);
app.use("/api/ai", aiRouter);
app.use("/api/auth", authRouter);
app.use("/api/blogs", blogsRouter);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get("env") === "development" ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render("error");
});

module.exports = app;
