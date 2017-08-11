var AWS = require('aws-sdk');
var Promise = require('bluebird');
var sqs = new AWS.SQS({region: 'us-west-1'});
var s3 = new AWS.S3({region: 'us-east-1'});
var rp = require('request-promise');
var GitHubApi = require('github');
var _ = require('lodash');

exports.sendMessage = function(body, callback) {
  console.log("Sending job");
  //console.log(body);
  /*var params = {
    MessageBody: JSON.stringify(body),
    QueueUrl: 'https://sqs.us-west-1.amazonaws.com/352211034136/RdocRWorkerQueue'
  };
  sqs.sendMessage(params, function(err, data) {
    callback(err, data);
  });*/
  callback(null, "ok");
};

exports.getState = function(key, callback) {
  var params = {
    Bucket: 'assets.rdocumentation.org',
    Key: key,
  };
  s3.getObject(params, function(err, data) {
    var state = JSON.parse(data.Body);
    callback(err, state);
  });
};

exports.getOutdatedPackages = function(type_id, parserVersion) {
  //var url = 'https://rdocumentation.org/api/packages';
  //var limit = 100;
  var limit = 5;
  var url = 'http://localhost:1337/api/packages';
  
  var options = {
    uri: url,
    qs: {
      "parser_version": { "$lt": parserVersion},
      "type_id": type_id,
      "sort": "popularity",
      limit
    },
    json: true,
  };

  return rp(options);

};

exports.compareVersions = function(order, property) {
  const lower = order === 'asc' ? -1 : 1;
  const higher = order === 'asc' ? 1 : -1;
  return function (v1, v2) {
      
    if (_.isFunction(property)) {
      v1 = property(v1);
      v2 = property(v2);
    } else if (property){
      v1 = v1[property];
      v2 = v2[property];
    }
    const v1Components = v1.replace('-', '.').split('.');
    const v2Components = v2.replace('-', '.').split('.');
    let currentV1 = null;
    let currentV2 = null;
    while (true) { //only case where it continue is actually currentV1 === currentV2
      currentV1 = v1Components.shift();
      currentV2 = v2Components.shift();
      let compareValue
      if (currentV1 === undefined && currentV2 === undefined) return 0;
      if (currentV1 === undefined && currentV2 !== undefined) return lower;
      if (currentV1 !== undefined && currentV2 === undefined) return higher;
      compareValue = currentV1.localeCompare(currentV2, [], { numeric: true });
      if (compareValue !== 0) return compareValue < 0 ? lower : higher;
    }
  }
}

var github = new GitHubApi({
  //debug: true,
  protocol: 'https',
  host: 'api.github.com',
  headers: {
      'user-agent': 'Lamdba-updater' // GitHub is happy with a unique user agent
  },
  Promise: Promise
});

exports.github = github;

exports.githubAuth = function(token){
  github.authenticate({
    type: 'oauth',
    token: token
  });
}

exports.githubGetBranches = function(owner, repo) {
  return github.repos.getBranches({ 
    owner: owner, 
    repo:repo
  }).then(function(response) {
    return response.data;
  });

};