var config   = require('config');          // 定義
var asciify  = require('asciify');         // AA
var inquirer = require("inquirer");        // 対話
var client   = require('cheerio-httpcli'); // 通信
var async    = require('async');           // 同期処理
var fs       = require("fs");              // ファイル読み込み
var Mecab    = require('mecab-async');     // 形態素解析
var Table    = require('cli-table');       // テーブル
var mecab    = new Mecab();

var start = function () {
  asciiFunc(function () {
    promptFunc(function (type) {
      questionFunc(type, function (input) {
        var fetchFunc = getFetchFunc(type);
        fetchFunc(input, function (descriptions) {
          mecabFunc(descriptions, function (json) {
            tableFunc(json);
            fileFunc(json);
          });
        });
      });
    });
  });
};

var asciiFunc = function (callback) {
  asciify("Morphone", {font: "small"}, function(err, msg) {
    if(err) return;
    console.log(msg);
    callback();
  });
};

var promptFunc = function (callback) {
  inquirer.prompt([
    {
      type    : "list",
      name    : "type",
      message  : "What type do you choose",
      choices  : ["WebSite", "TextFile", "Description"],
      filter  : function(value) {
        return value.toLowerCase();
      }
    }],
    function(answer) {
      callback(answer.type);
    }
  );
};

var questionFunc = function (type, callback) {
  var questions = {
    website : {
      type      : "input",
      name      : "input",
      message    : "Please enter the url of the web site",
      validate  : function(value) {
        var word = value.trim();
        if (word) {
          return true;
        } else {
          return "The input content is incorrect";
        }
      }
    },
    textfile : {
      type      : "input",
      name      : "input",
      message    : "Please drag and drop text file",
      validate  : function(value) {
        var path = value.trim();
        if (path) {
          return true;
        } else {
          return "The input content is incorrect";
        }
      },
      filter  : function(value) {
        return value.trim();
      }
    },
    description : {
      type      : "input",
      name      : "input",
      message    : "Please enter a Google search word",
      validate  : function(value) {
        var word = value.trim();
        if (word) {
          return true;
        } else {
          return "The input content is incorrect";
        }
      }
    }
  };
  inquirer.prompt(questions[type], function(answer) {
    callback(answer.input);
  });
};

var getFetchFunc = function (type, callback) {
  if (type === "website") {
    return fetchWebSiteFunc;
  } else if (type === "textfile") {
    return fetchTextFileFunc;
  } else if (type === "description") {
    return fetchDescriptionFunc;
  }
};

var fetchWebSiteFunc = function (url, callback) {
  client.fetch(url, null, function (err, $, res) {
    $("body").find("script").remove();
    $("body").find("style").remove();
    callback($("body").text());
  });
};

var fetchTextFileFunc = function (path, callback) {
  fs.readFile(path, "utf8", function (err, text) {
      callback(text);
  });
};

var fetchDescriptionFunc = function (word, callback) {
  var descriptions = "";
  var fetches = [];

  var getFetchFunc = function (param) {
    return function (nextFetch) {
      client.fetch(config.description.url, param, function (err, $, res) {
        var $li = $('#ires li.g');
        $li.each(function (index) {
          var description = $(this).find('span.st').text();
          descriptions += description;
        });
        nextFetch();
      });
    };
  };

  for (var i = 0; i < config.description.maxPage; i++) {
    var fetch = getFetchFunc({q: word, start: i * 10});
    fetches.push(fetch);
  }

  async.waterfall(fetches, function() {
    callback(descriptions);
  });
};

var mecabFunc = function (text, callback) {
  var json = {};
  var mecabs = [];

  var getMecabFunc = function (text) {
    return function (nextMecab) {
      mecab.parse(text, function(err, result) {
        if (err) { throw err; }
        result.forEach(function(element){
          if (element[1] == '名詞') {
            var key = element[0].trim();
            if (json[key]) {
              json[key] = json[key] + 1;
            } else {
              json[key] = 1;
            }
          }
        });
        nextMecab();
      });
    };
  };

  var split = function (text, size) {
    var texts = [];
    var maxSize = Math.ceil(text.length / size);
    for (var i = 0; i < maxSize; i++) {
      var min = size * i;
      var max = size * (i + 1);
      texts.push(text.substring(min, max));
    }
    return texts;
  };

  var texts = split(text, config.common.maxSize);
  for (var i = 0; i < texts.length; i++) {
    mecabs.push(getMecabFunc(texts[i]));
  }

  async.waterfall(mecabs, function() {
    callback(json);
  });
};

var tableFunc = function (json) {
  var convert = function (json) {
    var array = [];
    for (var key in json) {
      array.push({
        "word": key,
        "number": json[key]
      });
    }
    return array.sort(function(a,b){
        return a.number - b.number;
    });
  };

  var createTable = function (data) {
    var table = new Table({
      head: ["名詞", "頻出回数"],
      colWidths: [20, 10]
    });
    for (var i = 0; i < data.length; i++) {
      table.push([data[i].word, data[i].number]);
    }
    console.log(table.toString());
  };
  createTable(convert(json));
};

var fileFunc = function (json) {
  var csv = "名詞,頻出回数\n";
  for (var key in json) {
    csv += key + "," + json[key] + "\n";
  }
  var name = "result" + getYYYYMMDDHHMMSS(new Date()) + ".csv";
  fs.appendFile(name, csv ,'utf8', function (err) {});
  console.log("\"" + name + "\" is created!");
};

var getYYYYMMDDHHMMSS = function (date) {
  function twoDigits(n) {
    return (n < 10 ? '0' : '') + n;
  }
  return date.getFullYear() +
        twoDigits(date.getMonth() + 1) +
        twoDigits(date.getDate()) +
        twoDigits(date.getHours()) +
        twoDigits(date.getMinutes()) +
        twoDigits(date.getSeconds());
};

start();  // 実行
