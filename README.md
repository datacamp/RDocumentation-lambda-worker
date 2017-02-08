# RDocumentation-lambda-worker

Set up an AWS Lambda pipeline in Node.js that:
- Downloads all packages and their versions from CRAN.
- Parses the `.md` files to `JSON`.
- Uploads the parsed `.json` files to s3.
- Does an API call to the [rdocumentation-app](https://github.com/datacamp/rdocumentation-app) with the `JSON`.

# Installation

Use [apex](http://apex.run) command to deploy and invoke the lambda functions

Examples:
- `apex deploy unzip`
- `apex invoke unzip`
- `apex metrics unzip`

## License
See the [LICENSE](LICENSE.md) file for license rights and limitations (MIT).
