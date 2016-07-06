var AWS = require('aws-sdk'); 
var ecs = new AWS.ECS({apiVersion: '2014-11-13'});


exports.handle = function(e, ctx) {
  
 var params = {
    taskDefinition: 'rdoc-ecs-worker',
    count: 1,
    cluster: 'awseb-rdocsv2-workers-rgpnb8ixt5'
  };

  ecs.runTask(params, function (err, data) {
    if (err) {
      console.warn('error: ', 'Error while starting task: ' + err);
      ctx.fail('An error has occurred: ' + err);
    }
    else {
      console.info('Task started: ' + JSON.stringify(data.tasks));
      ctx.succeed('Successfully started task');
    }
  });

};

