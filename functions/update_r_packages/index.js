var AWS = require('aws-sdk'); 
var JSFtp = require('jsftp');
var Promise = require('bluebird');
var sqs = new AWS.SQS({region: 'us-west-1'});
var s3 = new AWS.S3({region: 'us-east-1'});
var fs = require('fs');
var targz = require('tar.gz');
var path = require('path');
var mkdirp = require('mkdirp');
var config = new AWS.Config();
var _s3 = require('s3');
var exec = require('child_process').exec;

var SQS_QUEUE_URL = process.env.SQS_QUEUE_URL;

var s3Client = _s3.createClient({
  s3Options: {
    region: 'us-east-1'
  },
});


var getNewPackages = function(ftp, dir, callback) {
  console.info('Fetching package list');
  ftp.ls(dir, function(err, res) {
    callback(err, res);
  });
};
  

var extractPackageInfo = function(filename) {
  var matches = filename.match(/.+\/(.*)_(.*)\.tar\.gz$/);
  return {
    name: matches[1],
    version: matches[2]
  };
};

var syncFolder = function(local, callback) {
  var params = {
    localDir: local,
    s3Params: {
      Bucket: 'assets.rdocumentation.org',
      Prefix: 'rpackages/archived',
      ACL: 'public-read'
    },
  };

  var basePath = 'https://s3.amazonaws.com/assets.rdocumentation.org/';
  var jobs = [];

  var uploader = s3Client.uploadDir(params);

  uploader.on('error', function(err) {
    callback(err);
  });

  uploader.on('fileUploadStart', function(path, key) {
    console.log('Started uploading ' + path);
    var job = extractPackageInfo(key);
    job.path = basePath + key;
    job.repoType = 'part_of_r';
    jobs.push(job);
  });

  uploader.on('end', function() {
    callback(null, jobs);
  });

};

var sendMessage = function(body, callback) {
  console.log("Sending job");
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
    Key: 'rpackages/update_r_packages.state.json',
  };
  s3.getObject(params, function(err, data) {
    var state = JSON.parse(data.Body);
    callback(err, state);
  });
};

var putState = function(state, callback) {
  var params = {
    Bucket: 'assets.rdocumentation.org',
    Key: 'rpackages/update_r_packages.state.json',
    Body: JSON.stringify(state)
  };
  s3.putObject(params, callback);
};


exports.handle = function(e, ctx) {
  var ftp = new JSFtp({
    host: 'cran.r-project.org'
  });
  var now = new Date();
  var dir ='/pub/R/src/base/R-3';

  Promise.promisify(getState)().then(function(state) {
    var lastUpdate = new Date(state.last_update);
    return Promise.promisify(getNewPackages)(ftp, dir).then(function(files) {
      console.log('Filtering new packages');
      var newPackages = files.filter(function(file) {
        var date = new Date(file.time);
        return date > lastUpdate && /R-([0-9]*\.)*tar\.gz$/.test(file.name);
      });
      return Promise.map(newPackages, function(package) {
        return new Promise(function (resolve, reject) {
          console.log('Downloading '+ package.name);
          ftp.get(dir + '/' + package.name, '/tmp/' + package.name, function(err) {
            if(err) reject(err);
            else resolve('/tmp/' + package.name);
          });
        });
      }, {concurrency: 1})
      .map(function(tarballPath) {
        console.log('Exctracting ' + tarballPath);
        return new Promise(function(resolve, reject) {
          exec('tar -xzf ' + tarballPath + ' -C /tmp', function(error, stdout, stderr) {
            if(error) return reject(stderr);
            console.log(stdout);
            console.log(stderr);
            resolve(tarballPath.substring(0, tarballPath.indexOf('.tar.gz')))
          });
        });
      }, {concurrency: 2}).map(function(dirPath) {
        var srcPath = dirPath + '/src/library';
        return Promise.promisify(fs.readdir)(srcPath).filter(function(file) {
          var filepath = path.join(srcPath, file);
          return fs.statSync(filepath).isDirectory()
            && ['Recommended', 'profile', 'translations'].indexOf(file) === -1;
          
        }).map(function(package) {
          var packagePath = path.join(srcPath, package);
          var descriptionPath = path.join(packagePath, 'DESCRIPTION.in');
          console.log('Compiling DESCRIPTION ' + descriptionPath);
          return Promise.promisify(fs.readFile)(descriptionPath, {encoding: 'utf-8'}).then(function(data) {
            var compiledDescriptionPath = path.join(packagePath, 'DESCRIPTION');
            var RVersion = dirPath.match(/\/R-(([0-9]*\.?)+)/)[1];
            var compiledDescription = data.replace(/@VERSION@/g, RVersion);
            return Promise.promisify(fs.writeFile)(compiledDescriptionPath, compiledDescription).then(function() {
              return Promise.promisify(mkdirp)(path.join('/tmp/compiled/', package));
            }).then(function() {
              return targz().compress(packagePath, path.join('/tmp/compiled/', package, package + '_' + RVersion + '.tar.gz'));
            });
          });
        });
      }, {concurrency: 2}).then(function(packages) {
        if(packages.length === 0) return [];
        console.log('Sync S3');
        return Promise.promisify(syncFolder)('/tmp/compiled/');
      }).map(function(job) {
        return Promise.promisify(sendMessage)(job);
      }).then(function() {
        var newState = state;
        newState.last_update = now.toISOString();
        return Promise.promisify(putState)(newState);
      });


      
    });
  }).then(function(){
    return ctx.succeed();
  }).catch(function(err){
    console.log(err);
    return ctx.fail();
  });

};

