library("jsonlite");
source("scripts/package.R")
source("scripts/sqs.R")

pruneNotRdFiles <- function(package_name) {
  package_path <- paste("packages/", package_name, "man", sep="/")
  files <- list.files(path=package_path, recursive=TRUE)
  for (filename in files) {
    if (!(endsWith(filename, ".Rd") || endsWith(filename, ".rd"))) {
      file.remove(filename)
    }
  }
}

main <- function() {
  messages <- getMessages()

  for (i in 1:nrow(messages)) {
    message <- as.list(messages[i, ])

    body <- fromJSON(message$Body)

    package_file_name <- paste(body$name, "_" , body$version, ".tar.gz", sep="")
    package_path <- paste("packages/", package_file_name, sep="")
    download(package_path, body$path)
    untar(package_path, exdir = "packages/")

  }
  
}

pruneNotRdFiles("tutorial");