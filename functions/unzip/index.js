var AWS = require('aws-sdk'); 


exports.handle = function(e, ctx) {
  var s3 = new AWS.S3();


  var params = {
    Bucket: 'assets.rdocumentation.org', 
    EncodingType: 'url'
  };

  s3.listObjects(params, function(err, data) {
    if (err) {
      ctx.fail(err);
    }
    else {
      ctx.succeed(data);
    }
  });
  
};