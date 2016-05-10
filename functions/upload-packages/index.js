var AWS = require('aws-sdk'); 

exports.handler = function(e, ctx) {
  var s3 = new AWS.S3();

  var params = {
    Bucket: 'blog.datacamp.com', 
    EncodingType: 'url'
  };

  s3.listObjects(params, function(err, data) {
    if (err) {
      console.log(err, err.stack); // an error occurred
    }
    else {
      console.log(data);
      ctx.succeed({ hello: 'world' });
    }
  });
  console.log('processing event: %j', e);
  
};