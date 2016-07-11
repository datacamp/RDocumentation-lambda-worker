var AWS = require('aws-sdk'); 
var Promise = require('bluebird');
var sqs = new AWS.SQS({region: 'us-west-1'});
var GitHubApi = require('github');
var _ = require('lodash');
var rp = require('request-promise');
var cheerio = require('cheerio'); // Basically jQuery for node.js


var github = new GitHubApi({
    //debug: true,
    protocol: 'https',
    host: 'api.github.com',
    headers: {
        'user-agent': 'Lamdba-updater' // GitHub is happy with a unique user agent
    },
    Promise: Promise
});

var getDescription = function(repo_name) {
  var url = 'https://raw.githubusercontent.com/'+ repo_name + '/master/DESCRIPTION';
  return rp(url);
};

var getNewPackages = function(last_update) {
  console.info('Fetching package list');
  
  var query = function(page) {
    return github.search.repos({
      q: 'language:r+stars:>2',
      per_page: 100,
      page: page || 1
    }).then(function(response) {
      console.log(page);
      if(github.hasNextPage(response)) {
        return query(page + 1).then(function(r) {
          console.log(r);
          return r.concat(response.items);
        });
      } else return response.items;
    });
  };
  


  return query(1).filter(function(repo) {
    var created_at = new Date(repo.created_at);
    return created_at > last_update;
  });

};

var getAvailableCRANPackages = function() {
  var url = 'https://cran.r-project.org/web/packages/available_packages_by_name.html';

  var transformFn = function (body) {
    return cheerio.load(body);
  };

  var viewsOptions = {
    transform: transformFn,
    uri: url 
  };

  return rp(viewsOptions)
  .then(function ($) {
    var packages = [];
    $('table[summary="Available CRAN packages by name."] tr td:first-child a').each(function(i, elem) {
      var href = $(this).attr('href');
      var package_name = href.match(/packages\/(.*)\//)[1];
      packages.push(package_name.toLowerCase()); 
    });
    return packages;
  });


};

var getPackageVersionFromDescription = function (description) {
  var packageMatch = description.match(/^Package:\s*(.*)$/m);
  var versionMatch = description.match(/^Version:\s*(.*)$/m);
  
  if (packageMatch) {
    var package = packageMatch[1];
    var version = versionMatch ? versionMatch[1] : '0.0';
    if(package.length === 0) return null;
    else 
    return {
      package: package,
      version: version || '0.0'
    };
  } else return null;

};

var getReleases = function(repo) {
  var user = repo.owner.login;
  var name = repo.name;
  console.log(user);
  console.log(name);
  return github.repos.getReleases({ 
    user: user,
    repo: name,
    per_page: 100
  });
};

var sendMessage = function(body, callback) {
  console.log('Sending job');
  var params = {
    MessageBody: JSON.stringify(body),
    QueueUrl: 'https://sqs.us-west-1.amazonaws.com/352211034136/RdocRWorkerQueue'
  };
  sqs.sendMessage(params, function(err, data) {
    callback(err, data);
  });
};


exports.handle = function(e, ctx) {
  var lastUpdate = new Date('2010-01-01T00:00:00.000Z');
  var filterNull = function(x) { return x !== null };

  github.authenticate({
    type: 'oauth',
    token: '88be655dceae426f60bc489d5134c92be6689e57'
  });


  Promise.join(getAvailableCRANPackages(), getNewPackages(lastUpdate), function(available_packages, repos) {

    return Promise.map(repos, function(repo) {
      return getDescription(repo.full_name).then(function(description) {
        return {
          description: description,
          repo: repo
        };
      }).catch(function(err) {
        //description does not exists
        return null;
      });
    }).filter(filterNull).map(function(repo) { // we are left with repo who contains description
      var packageVersion = getPackageVersionFromDescription(repo.description);
      if (packageVersion === null) return null;
      else {
        return {
          packageVersion: packageVersion,
          repo: repo.repo,
          description: repo.description
        };
      }
    }).filter(filterNull).filter(function(repo) {
      //we only want the packages that are not already on CRAN
      return _.sortedLastIndexOf(available_packages, repo.packageVersion.package.toLowerCase()) === -1;
    }).map(function(repo) {
      return getReleases(repo.repo).then(function(releases) {
        var jobs = releases.map(function(release) {
          return { 
            path: release.tarball_url,
            name: repo.packageVersion.package,
            version: release.tag_name
          };
        });
        if (jobs.length === 0) {
          jobs.push({
            path: "https://api.github.com/repos/" + repo.repo.full_name + "/tarball",
            name: repo.packageVersion.package,
            version: repo.packageVersion.version
          });
        }
        return jobs;
      });
    }, {concurrency: 3});

    
  }).then(function(jobs){
    console.log(jobs);
    console.log(jobs.length);
    return ctx.succeed();
  }).catch(function(err){
    console.log(err);
    return ctx.fail();
  });

};

