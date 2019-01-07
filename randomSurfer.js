var request = require("request");
var cheerio = require("cheerio");

module.exports = class RandomSurfer {
    startUrl;

    constructor(startUrl, coeff = 0.01, maxPages = 10) {
        this.startUrl = startUrl;
        this.maxPages = maxPages;
        this.coeff = coeff;

        this.start();
    }

    start() {
        console.log(this.startUrl, this.coeff, this.maxPages);
    }

    surf(url, linkProb, count) {
        request(url, (req, resp, body) => {
            var $ = cheerio.load(body, {
                normalizeWhitespace: true
            });
            var outNodes = $("a").toArray();

            var twits = $("").toArray();

            if (outNodes && outNodes.length > 0) {
                linkProb *= 1 / outNodes.length;
            }
        });
    }

    addToDB(twits, linkProb, cb) {
        if (twits) {
            var s = 0;
            twits.forEach((twit, index, arr) => {
                var txt = $(twit).text();
                if (txt.search("forex")) {
                    s += this.coeff;
                    this.saveTwit(txt);
                }

                if (index == arr.length - 1) {
                    cb(this.sigmoid(linkProb + s));
                    return;
                }
            });
        } else {
            cb(linkProb);
        }
    }

    saveTwit(twit) {
        console.log(twit);
    }

    sigmoid(x) {
        return 1 / (1 - Math.exp(-x));
    }
};