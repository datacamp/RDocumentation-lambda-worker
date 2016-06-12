var AWS = require('aws-sdk'); 
var Promise = require('bluebird');
var request = require('request');
var config = require('./config/config.js');


var listJSONS = function(s3, bucket, prefix, cb) {
  var params = {
    Bucket: bucket,
    Prefix: prefix
  };
  s3.listObjects(params, cb);
};

var getJSON = function(s3, bucket, key, cb) {
  var params = {
    Bucket: bucket, /* required */
    Key: key, /* required */
    ResponseContentType: 'application/json'
  };
  s3.getObject(params, cb);
};

var postJSON= function(url, body, cb) {
  var options = {
    uri: url,
    method: 'POST',
    json: body
  };

  request(options, function (error, response, responseBody) {
    if (error) {
      console.log(error);
      cb(error);
    } else {
      if(response.statusCode !== 200 && response.statusCode !== 409) {
      //console.warn(url + ' ' + response.statusCode + '\n Body' + JSON.stringify(body) + '\nResponse' + JSON.stringify(response.toJSON()));
        
      }
      cb(null, {response: response, body: responseBody}); 
    }
  });
};


var syncDynamoDB = function(dynDB, item, value, callback) {
  var key = {
    PackageName : {S: item.name }
  };
  key[item.versionKey] = {S: item.version };
  var params = {
    TableName: item.dynDBTable,
    Key: key,
    AttributeUpdates: {
      SyncResult: {
        Action: 'PUT',
        Value: {N: '' + value}
      }
    }
  };
  dynDB.updateItem(params, callback);
};


exports.handle = function(e, ctx) {
  var s3 = new AWS.S3();

  var dynamodb = new AWS.DynamoDB({region: 'eu-west-1'});

  var eventBucketName = e.Records[0].s3.bucket.name;
  var eventObjectKey = e.Records[0].s3.object.key;

  var bucketName = 'assets.rdocumentation.org';

  var postURL = 'http://rdocs-v2.herokuapp.com/api/';

  Promise.promisify(getJSON)(s3, eventBucketName, eventObjectKey)
    .then(function(jsonFile) {
      var packagesToBeDone = JSON.parse(jsonFile.Body);
      return packagesToBeDone;
    }).then(function(packageList){
    return Promise.map(packageList, function(package) {
      var name = package.name;
      var version = package.version;
      var s3ZippedKey = package.s3ZippedKey;
      var descriptionJSON;
      console.info('====Start Processing: ' + name + '========='); 
      return Promise.promisify(listJSONS)(s3, bucketName, s3ZippedKey)
        .then(function(s3Result) {
          var descriptionIndex = s3Result.Contents.findIndex(function(item) {
            return item.Key.endsWith('/DESCRIPTION.json');
          });
          var description = s3Result.Contents[descriptionIndex];
          var topicList = s3Result.Contents.filter(function(item) {
            var notNEWS = !item.Key.endsWith('NEWS.json');
            var notDESCRIPTION = !item.Key.endsWith('DESCRIPTION.json');
            var inTopicFolder = /topics\/([^\/]*)\.json$/.test(item.Key);
            return notNEWS && notDESCRIPTION && inTopicFolder;
          });
          return Promise.promisify(getJSON)(s3, bucketName, description.Key)
            .then(function(object) {
              console.info('Description of ' + name + '-' + object.Body.toString('utf8')); 
              descriptionJSON = JSON.parse(object.Body.toString('utf8'));
              return Promise.promisify(postJSON)(postURL + 'versions', descriptionJSON);
            })
            .then(function(postDescriptionResult) {
              console.info('Result of post description of ' + name  + ' ' + postDescriptionResult.response.statusCode);
              if (postDescriptionResult.response.statusCode !== 200) {
                console.warn(name + '\n Body' + JSON.stringify(postDescriptionResult.body) + '\nResponse' + JSON.stringify(postDescriptionResult.response.toJSON()));
                return Promise.promisify(syncDynamoDB)(dynamodb, package, postDescriptionResult.response.statusCode);
              }
              else {
                return Promise.map(topicList, function(item) {
                  return Promise.promisify(getJSON)(s3, bucketName, item.Key)
                    .then(function(object) {
                      var url = postURL + 'packages/' + name + '/versions/' + descriptionJSON.Version + '/topics';
                      return Promise.promisify(postJSON)(url, JSON.parse(object.Body.toString('utf8')));
                    }); 
                }).then(function(postTopicsResult) {
                  var resultList = postTopicsResult.concat(postDescriptionResult);
                  var error = resultList.find(function(response) {
                    return response.response.statusCode !== 200 && response.response.statusCode !== 409;
                  });
                  var val = error ? 1000 + error.response.statusCode : 200;

                  console.info(name + '-' + version + ' ' + val);
                  return Promise.promisify(syncDynamoDB)(dynamodb, package, val);
                });
              }
            });
          
        })
        .then(function(dynDBResult) {
          return dynDBResult;
        })
        .catch(function(error) {
          return error;
        });
    }, {concurrency: 5})
    .then(function() {
      ctx.succeed();
    })
    .catch(function(error) {
      ctx.fail(error);
    });
    
  });
  
};