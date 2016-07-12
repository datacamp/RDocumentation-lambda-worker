var AWS = require('aws-sdk'); 
var JSFtp = require('jsftp');
var Promise = require('bluebird');
var sqs = new AWS.SQS({region: 'us-west-1'});
var s3 = new AWS.S3({region: 'us-east-1'});


var getNewPackages = function(ftp, dir, callback) {
  console.info('Fetching package list');
  ftp.ls(dir, function(err, res) {
    callback(err, res);
  });
};

var extractPackageInfo = function(filename) {
  var matches = filename.match(/(.*)_(.*)\.tar\.gz$/);
  return {
    name: matches[1],
    version: matches[2]
  };
};

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
    Key: 'rpackages/update_cran_packages.state.json',
  };
  s3.getObject(params, function(err, data) {
    var state = JSON.parse(data.Body);
    callback(err, state);
  });
};

var putState = function(state, callback) {
  var params = {
    Bucket: 'assets.rdocumentation.org',
    Key: 'rpackages/update_cran_packages.state.json',
    Body: JSON.stringify(state)
  };
  s3.putObject(params, callback);
};


exports.handle = function(e, ctx) {
  var ftp = new JSFtp({
    host: 'cran.r-project.org'
  });
  var now = new Date();
  var dir ='/pub/R/src/contrib/';

  Promise.promisify(getState)().then(function(state) {
    var lastUpdate = new Date(state.last_update);
    return Promise.promisify(getNewPackages)(ftp, dir).then(function(files) {
      console.log('Filtering new packages');
      var newPackages = files.filter(function(file) {
        var date = new Date(file.time);
        return date > lastUpdate && /.*\.tar\.gz$/.test(file.name);
      });

      console.log('Map packages to jobs');
      return newPackages.map(function(file) {
        var p = extractPackageInfo(file.name);
        p.path = 'ftp://cran.r-project.org/pub/R/src/contrib/' + file.name;
        return p;
      });
    }).map(function(package) {
      return Promise.promisify(sendMessage)(package);
    }).then(function() {
      state.last_update = now;
      return Promise.promisify(putState)(state);
    });
  }).then(function(){
    return ctx.succeed();
  }).catch(function(err){
    console.log(err);
    return ctx.fail();
  });

};

