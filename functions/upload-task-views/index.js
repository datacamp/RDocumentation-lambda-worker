
var Promise = require('bluebird');
var rp = require('request-promise');
var cheerio = require('cheerio'); // Basically jQuery for node.js


var getCRANViewsDocument = function() {
  var url = "https://cran.r-project.org/web/views/";

  var transformFn = function (body) {
    return cheerio.load(body);
  };

  var viewsOptions = {
    transform: transformFn,
    uri: url 
  };

  return rp(viewsOptions)
    .then(function ($) {
      var views = [];
      $('table[summary="CRAN Task Views"] tr td:first-child a').each(function(i, elem) {
        var name = $(this).text();
        var taskUrl = url + $(this).attr('href');
        views.push({name: name, url: taskUrl});
      });

      return Promise.map(views, function(view) {
        var taskOptions = {
          transform: transformFn,
          uri: view.url 
        };

        return rp(taskOptions).then(function($) {
          var packages = [];
          $('body > ul').first().each(function(i, elem) {
            $(this).find('li a').each(function(i, elem) {
              var packageName = $(this).text();
              packages.push(packageName);
            });
          });
          return packages;
        }).then(function(packages) {

          var body = {
            name: view.name,
            url: view.url,
            packages: packages
          };

          var options = {
            method: 'POST',
            uri: 'https://rdocs-v2.herokuapp.com/api/taskviews',
            body: body,
            json: true, // Automatically stringifies the body to JSON
            resolveWithFullResponse: true   
          };

          return rp(options).then(function(res) {
            return res.statusCode;
          });
        });
      });
      
    })
    .catch(function (err) {
       console.log(err);
    });
};

exports.handle = function(e, ctx) {
  
  getCRANViewsDocument().then(function(res) {
    console.info(res);
    ctx.succeed();
  }).catch(function (err) {
    ctx.fail(err);
  });

};