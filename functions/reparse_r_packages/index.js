var AWS = require('aws-sdk');
var Promise = require('bluebird');
var sqs = new AWS.SQS({region: 'us-west-1'});
var s3 = new AWS.S3({region: 'us-east-1'});
var rp = require('request-promise');

var createFileName = function(name, version) {
  return `${name}_${version}.tar.gz`;
}

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

var getDateString = function(date) {
  return date.toISOString().
    replace(/T/, ' ').      // replace T with a space
    replace(/\..+/, '');
}

var getOutdatedPackages = function(parserVersion) {
  var url = 'https://rdocumentation.org/api/packages';
  var limit = 100;
  
  var options = {
    uri: url,
    qs: {
      "parser_version": { "$lt": parserVersion},
      "type_id": 4,
      "sort": "popularity",
      limit
    },
    json: true,
  };

  return rp(options);

};

exports.handle = function(e, ctx) {
  Promise.promisify(getState)().then(function(state) {
    var currentParserVersion = state.parser_version;    

    return getOutdatedPackages(currentParserVersion).then(function(packages){
      return packages;
    }).map(function(package) {
      var p = {
        name: package.name,
        version: package.latest_version,
        path: `https://s3.amazonaws.com/assets.rdocumentation.org/rpackages/archived/${package.name}/${package.name}_${package.latest_version}.tar.gz`
      }
      return Promise.promisify(sendMessage)(p);
    })
  }).then(function(){
    return ctx.succeed();
  }).catch(function(err){
    console.log(err);
    return ctx.fail();
  });

};
