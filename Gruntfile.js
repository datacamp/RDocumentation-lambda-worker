module.exports = function(grunt) {
  grunt.loadNpmTasks('grunt-aws-lambda');
  grunt.initConfig({
    lambda_invoke: {
      default: {
        options: {
          handler: 'handle',
          file_name: 'functions/update_github_packages/index.js',
          event: 'functions/update_github_packages/test_event.json'
        },
      },
    }
  });

  grunt.registerTask('check', ['jscs']);

  grunt.registerTask('run', ['lambda_invoke']);

  grunt.registerTask('build', ['lambda_package']);

  grunt.registerTask('deploy', ['build', 'lambda_deploy']);
};