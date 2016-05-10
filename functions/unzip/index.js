var AWS = require('aws-sdk'); 


exports.handle = function(e, ctx) {
 
  ctx.succeed({ hello: 'world' });

  console.log('processing event: %j', e);
  
};