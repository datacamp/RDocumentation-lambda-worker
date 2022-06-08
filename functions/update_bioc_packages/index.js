var AWS = require('aws-sdk'); 
var Promise = require('bluebird');
var sqs = new AWS.SQS({region: 'us-west-1'});
var s3 = new AWS.S3({region: 'us-east-1'});
var GitHubApi = require('github');
var _ = require('lodash');

var SQS_QUEUE_URL = process.env.SQS_QUEUE_URL;

var github = new GitHubApi({
    //debug: true,
    protocol: 'https',
    host: 'api.github.com',
    headers: {
        'user-agent': 'Lamdba-updater' // GitHub is happy with a unique user agent
    },
    Promise: Promise
});

var getNewPackages = function(last_update) {
  console.info('Fetching package list');
  
  var query = function(page) {
    return github.repos.getForUser({
      user: 'Bioconductor-mirror',
      per_page: 100,
      page: page || 1
    }).then(function(response) {
      console.log(page);
      var items = _.toArray(_.omit(response, 'meta'));
      if(github.hasNextPage(response)) {
        return query(page + 1).then(function(r) {
          return r.concat(items);
        });
      } else return items;
    });
  };
  


  return query(1).filter(function(repo) {
    var pushed_at = new Date(repo.pushed_at);
    return pushed_at > last_update;
  });

};

var getBranches = function(user, repo) {
  return github.repos.getBranches({ 
    user: user, 
    repo:repo
  }).then(function(response) {
    return _.toArray(_.omit(response, 'meta'));
  });

};


var sendMessage = function(body, callback) {
  console.log('Sending job');
  var params = {
    MessageBody: JSON.stringify(body),
    QueueUrl: SQS_QUEUE_URL
  };
  sqs.sendMessage(params, function(err, data) {
    callback(err, data);
  });
};

var getState = function(callback) {
  var params = {
    Bucket: 'assets.rdocumentation.org',
    Key: 'rpackages/update_bioc_packages.state.json',
  };
  s3.getObject(params, function(err, data) {
    var state = JSON.parse(data.Body);
    callback(err, state);
  });
};

var putState = function(state, callback) {
  var params = {
    Bucket: 'assets.rdocumentation.org',
    Key: 'rpackages/update_github_packages.state.json',
    Body: JSON.stringify(state)
  };
  s3.putObject(params, callback);
};

exports.handle = function(e, ctx) {
  var now = new Date();
  var state;

  var reposPromise = Promise.promisify(getState)().then(function(_state) {
    state = _state;
    var lastUpdate = new Date(state.last_update);
    github.authenticate({
      type: 'oauth',
      token: state.GITHUB_TOKEN
    });
    return getNewPackages(lastUpdate);
  });

  reposPromise.map(function(repo) {
    return getBranches(repo.owner.login, repo.name)
    .filter(function(branch) {
      return /release-(([0-9]+\.?)+)/.test(branch.name);
    })
    .map(function(branch) {
      var version = branch.name.match(/release-(([0-9]+\.?)+)/)[1];
      var job = {
        name: repo.name,
        version: version,
        repoType: 'bioconductor',
        path: 'https://api.github.com/repos/' + repo.full_name + '/tarball/' + branch.name,
      };
      return job;
    }).map(function(job) {
      return Promise.promisify(sendMessage)(job);
    });

  }, {concurrency: 3}).then(function() {
    state.last_update = now;
    return Promise.promisify(putState)(state);
  }).then(function(){
    return ctx.succeed();
  }).catch(function(err){
    console.log(err);
    return ctx.fail();
  });

};

