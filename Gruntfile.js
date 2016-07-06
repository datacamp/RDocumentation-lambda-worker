module.exports = function(grunt) {
  grunt.loadNpmTasks('grunt-aws-lambda');
  grunt.initConfig({
    lambda_invoke: {
      default: {
        options: {
          handler: 'handle',
          file_name: 'functions/start-worker/index.js',
          event: 'functions/start-worker/test_event.json'
        },
      },
    }
  });

  grunt.registerTask('check', ['jscs']);

  grunt.registerTask('run', ['lambda_invoke']);

  grunt.registerTask('build', ['lambda_package']);

  grunt.registerTask('deploy', ['build', 'lambda_deploy']);
};