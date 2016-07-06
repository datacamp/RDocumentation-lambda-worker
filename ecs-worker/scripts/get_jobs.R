
args <- commandArgs(trailingOnly = TRUE)

# test if there is at least one argument: if not, return an error
if (length(args)==0) {
  stop("At least one argument must be supplied (last_update date)", call.=FALSE)
}

last_update <- as.Date(args[1])
print(last_update)

new.packages.rds <- function(last_update){
  mytemp <- tempfile();
  download.file("http://cran.r-project.org/web/packages/packages.rds", mytemp);
  mydata <- as.data.frame(readRDS(mytemp), row.names=NA);
  mydata$Published <- as.Date(mydata[["Published"]]);

  #sort and get the fields you like:
  mydata <- mydata[order(mydata$Published),c("Package", "Version", "Published")];

  new <- mydata$Published > last_update

  mydata[new, ]
}

to_download = new.packages.rds(last_update)

options(timeout = 30)
f <- function(package, version) {

  print(package)
  package_file_name = paste(package, "_" ,version, ".tar.gz", sep="")

  package_path =  paste("packages/", package_file_name, sep="")

  file = paste("ftp://cran.r-project.org/pub/R/src/contrib/", package_file_name, sep="")

  skip_with_message = simpleError('not found')
  tryCatch(download.file(file, package_path), error = function(e) skip_with_message);

}

mapply(f, to_download$Package, to_download$Version)