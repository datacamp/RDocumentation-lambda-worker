

last_update = as.Date("2016-07-01")


new.packages.rds <- function(){
  mytemp <- tempfile();
  download.file("http://cran.r-project.org/web/packages/packages.rds", mytemp);
  mydata <- as.data.frame(readRDS(mytemp), row.names=NA);
  mydata$Published <- as.Date(mydata[["Published"]]);

  #sort and get the fields you like:
  mydata <- mydata[order(mydata$Published),c("Package", "Version", "Published")];

  new <- mydata$Published > last_update

  mydata[new, ]
}

to_download = new.packages.rds()

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