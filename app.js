var request = require("request");
var cheerio = require("cheerio");
const filenamifyUrl = require("filenamify-url");
var fs = require("fs");
var express = require("express");

var MongoClient = require("mongodb").MongoClient;
var ObjectId = require("mongodb").ObjectId;

var bodyParser = require("body-parser");

var app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.use(function(req, res, next) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS, PUT, PATCH, DELETE"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-Requested-With,content-type"
  );
  res.setHeader("Access-Control-Allow-Credentials", true);
  next();
});

var port = Number(process.env.PORT || 3000);
const DB_URL = "mongodb://localhost:27017";

const DB_NAME = "twitter_node_db";
const COLLECTION_NAME = "tweets";

var keyWords1 = ["marrakech", "marrakesh"];
var keyWords2 = [
  "terrorisme",
  "terreur",
  "terroriste",
  "attentat",
  "civils",
  "militants",
  "actions",
  "terrorism",
  "terror",
  "terrorists",
  "violence",
  "fear",
  "attacks",
  "incidents",
  "crime",
  "criminel",
  "coupable",
  "Sécurité",
  "infraction",
  "offence",
  "risque",
  "menace",
  "safety",
  "risk",
  "security",
  "secure",
  "harm",
  "injury",
  "danger"
];

var REG1 = getRegExp(keyWords1);
var REG2 = getRegExp(keyWords2);

var MAXPAGES = 10000000;
var STARTURL = "/search?q=marrakech";
var BASEURL = "https://twitter.com";
var COEFF = 0.01;

var DATE_0 = new Date(2018, 0, 1).getTime();
var db;

app.get("/", function(req, res) {
  res.send("Up and running, By MedEM & Houaiss");
});

MongoClient.connect(
  DB_URL,
  function(err, client) {
    if (err) throw err;
    db = client.db(DB_NAME);
    createUniqueIndex(db);
    app.listen(port);
    console.log("Server running > ", "\nhttp://localhost:" + port);
    start();
  }
);

function start() {
  surf(BASEURL + STARTURL, 1, 0);
}

function surf(url, linkProb, count) {
  if (count < MAXPAGES) {
    console.log("SURF", {
      url,
      linkProb,
      count
    });
    request(url, (req, resp, body) => {
      if (!body) {
        console.error("Null ", url);
        return;
      }
      var $ = cheerio.load(body, {
        normalizeWhitespace: true
      });
      // var outNodes = $("a.js-action-profile")
      var outNodes = $("#timeline  a[href]")
        .map((i, el) => {
          return $(el).prop("href");
        })
        .get();
      outNodes = removeDuplicate(outNodes, url);

      console.log("outNodes", {
        count,
        total: outNodes.length
      });
      if (outNodes.length == 0) return;

      var tweets = $("div.content").toArray();
      console.log("Twits", {
        count,
        total: tweets.length
      });

      addToDB(tweets, $, url, linkProb, newLinkProb => {
        if (outNodes && outNodes.length > 0) {
          newLinkProb /= outNodes.length;
          var p = 1;
          count += Math.floor(newLinkProb / outNodes.length) + 1;
          do {
            var href = outNodes[Math.floor(Math.random() * outNodes.length)];
            if (href) {
              p -= newLinkProb;
              if (href.charAt(0) == "/")
                surf(BASEURL + href, newLinkProb, count);
            }
          } while (p > 0);
        }
      });
    });
  }
}

function addToDB(tweets, $, url, linkProb, cb) {
  if (tweets) {
    var s = 0;
    tweets.forEach((tweet, index, arr) => {
      var txt = $(tweets)
        .find("div.js-tweet-text-container > p")
        .text();
      var time = $(tweet)
        .find("div.stream-item-header > small > a > span")
        .attr("data-time-ms");
      //var weekNo = getWeekNumber(new Number(time));
      var d = new Date(time);
      var month = d.getFullYear() + "_" + d.getMonth();
      console.log(
        txt.toLowerCase().search(REG1),
        txt.toLowerCase().search(REG2)
      );
      if (
        txt.toLowerCase().search(REG1) > -1 &&
        txt.toLowerCase().search(REG2) > -1
      ) {
        s += COEFF;
        saveTweet(url, txt, time, month);
      }

      if (index == arr.length - 1) {
        cb(sigmoid(linkProb + s));
        return;
      }
    });
  } else {
    cb(linkProb);
  }
}

// function saveTweet(url, tweet) {
//   url = filenamifyUrl(url, { replacement: "_" });
//   console.log("TWIT ", __dirname + "/dl" + url);
//   fs.open(__dirname + "/dl/" + url, "a+", (err, fd) => {
//     if (err) throw err;
//     fs.appendFile(fd, tweet + "\n", "utf8", err => {
//       fs.close(fd, err => {
//         if (err) throw err;
//       });
//       if (err) throw err;
//     });
//   });
// }

function saveTweet(url, text, time, month) {
  //url = filenamifyUrl(url, { replacement: "_" });
  console.log("TWIT ", __dirname + "/dl" + url);
  insertRecord(
    COLLECTION_NAME,
    {
      text,
      url,
      time,
      month
    },
    data => {
      if (data)
        console.log("inserted", {
          url,
          month
        });
    }
  );
}

function sigmoid(x) {
  return 1 / (1 - Math.exp(-x));
}

function getRegExp(keywords) {
  var s = "(";
  for (let i = 0; i < keywords.length; i++) {
    const k = keywords[i];
    s += k;
    if (i < keywords.length - 1) s += "|";
    else s += ")";
  }
  return new RegExp(s);
}

function removeDuplicate(arr, currentUrl) {
  return arr.filter((item, i, arr) => {
    return arr.indexOf(item) == i && item != currentUrl;
  });
}

function insertRecord(entity, item, cb) {
  console.log("inserting", entity);
  db.collection(entity).insertOne(item, function(err, result) {
    if (err) return cb(false);
    else return cb(result.ops);
  });
}

function updateRecord(entity, item, query, cb) {
  console.log("updating", entity);
  db.collection(entity).updateOne(
    query,
    {
      $set: {
        item
      }
    },
    function(err, result) {
      if (err) {
        return insertRecord(entity, item, cb);
      } else return cb(result.insertedId);
    }
  );
}

function createUniqueIndex(db) {
  // Get the documents collection
  const collection = db.collection(COLLECTION_NAME);
  // Create the index
  collection.createIndex(
    {
      text: 1
    },
    {
      unique: true
    },
    function(err, result) {
      console.log(result);
    }
  );
}

function getWeekNumber(timestamp) {
  // Copy date so don't modify original
  var d = new Date(timestamp);
  // Set to nearest Thursday: current date + 4 - current day number
  // Make Sunday's day number 7
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  // Get first day of year
  var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  // Calculate full weeks to nearest Thursday
  var weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  // Return array of year and week number
  //console.log(weekNo);
  return weekNo;
}

app.post("/api/wake_app", function(req, res) {
  res.end();
  console.log("27 min more");
  const resp_url = req.body.resp_url;
  const host = "http://" + req.get("host");
  setTimeout(function() {
    wake_app(resp_url, host);
  }, 27 * 60 * 1000);
});

function wake_app(resp_url, host) {
  console.log("SEND REQ : ", resp_url, host);
  request.post(
    {
      url: resp_url + "/api/wake_app",
      form: {
        resp_url: host
      }
    },
    function(error, response, body) {
      console.log("send ", body);
    }
  );
}
