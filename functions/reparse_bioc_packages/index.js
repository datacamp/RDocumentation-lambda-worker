var AWS = require('aws-sdk');
var Promise = require('bluebird');
var sqs = new AWS.SQS({region: 'us-west-1'});
var s3 = new AWS.S3({region: 'us-east-1'});
var rp = require('request-promise');
var GitHubApi = require('github');
var _ = require('lodash');

var github = new GitHubApi({
    //debug: true,
    protocol: 'https',
    host: 'api.github.com',
    headers: {
        'user-agent': 'Lamdba-updater' // GitHub is happy with a unique user agent
    },
    Promise: Promise
});

var sendMessage = function(body, callback) {
  console.log("Sending job");
  var params = {
    MessageBody: JSON.stringify(body),
    QueueUrl: 'https://sqs.us-west-1.amazonaws.com/352211034136/RdocRWorkerQueue'
  };
  sqs.sendMessage(params, function(err, data) {
    callback(err, data);
  });
};

var getState = function(callback) {
  var params = {
    Bucket: 'assets.rdocumentation.org',
    Key: 'rpackages/continuous-parser.state.json',
  };
  s3.getObject(params, function(err, data) {
    var state = JSON.parse(data.Body);
    callback(err, state);
  });
};

var getOutdatedPackages = function(parserVersion) {
  var url = 'https://rdocumentation.org/api/packages';
  var limit = 100;
  
  var options = {
    uri: url,
    qs: {
      "parser_version": { "$lt": parserVersion},
      "type_id": 2,
      "sort": "popularity",
      limit
    },
    json: true,
  };

  return rp(options);

};

var getBranches = function(owner, repo) {
  return github.repos.getBranches({ 
    owner: owner, 
    repo:repo
  }).then(function(response) {
    return response.data;
  });

};

var compareVersions = function(order, property) {
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

exports.handle = function(e, ctx) {
  Promise.promisify(getState)().then(function(state) {
    var currentParserVersion = state.parser_version; 
    github.authenticate({
      type: 'oauth',
      token: state.GITHUB_TOKEN
    });

    return getOutdatedPackages(currentParserVersion);
  })
  .map(function(package) {      
    return getBranches('Bioconductor-mirror', package.name)
      .filter(function(branch) {
        return /release-(([0-9]+\.?)+)/.test(branch.name);
      })
      .map(function(branch) {
        branch.version = branch.name.match(/release-(([0-9]+\.?)+)/)[1];
        return branch;
      }).then(function(branches){
        var branch = branches.sort(compareVersions('desc', 'version'))[0];
        var job = {
          name: package.name,
          version: branch.version,
          repoType: 'bioconductor',
          path: `https://api.github.com/repos/Bioconductor-mirror/${package.name}/tarball/${branch.name}`,
        };
        return Promise.promisify(sendMessage)(job);
    })   
  })
  .then(function(){
    return ctx.succeed();
  }).catch(function(err){
    console.log(err);
    return ctx.fail();
  });

};
