const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const status = require("./status");

const app = express();
app.use(bodyParser.json());

app.all("*", function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "X-Requested-With");
  res.header("Access-Control-Allow-Methods", "PUT,POST,GET,DELETE,OPTIONS");
  next();
});

app.use(express.static(path.resolve(__dirname, "../front-end/build")));

app.post("/config", (req, res) => {
  debugger;
  status.saveConfig(req.body);
  res.json({ state: "success" });
});

app.get("/config", (req, res) => {
  res.json(status.config);
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../front-end/build/index.html"));
});

module.exports = app;