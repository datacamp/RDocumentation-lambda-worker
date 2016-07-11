library("jsonlite");
source("scripts/package.R")
source("scripts/aws.R")

to_queue <- "RdocWorkerQueue";
queue <- create_queue(to_queue);
from_queue <- "RdocRWorkerQueue";
queue <- create_queue(from_queue);

pruneNotRdFiles <- function(package_name) {
  system(paste("./scripts/flatten_prune.sh ", package_name));
}

handle_package_version <- function(name, path) {
  print("Downloading tarball...");
  package_file_name <- paste(name, ".tar.gz", sep="");
  package_path <- paste("packages/", package_file_name, sep="");
  download(package_path, path);

  print("Untar tarball...");
  untar(package_path, exdir = "packages/");
  dir_name <- list.dirs("packages", recursive = FALSE);
  file.rename(dir_name, paste("packages", name, sep = "/"));


  pruneNotRdFiles(name);

  print("Parsing package...");
  process_package(name);

  print("Posting SQS jobs...");
  postDescriptionJob(to_queue, name);

  postTopicsJob(to_queue, name);

  print("Syncing S3..."); 
  syncS3(name);    

}

main <- function() {
  
  while(1) {
    print("Polling for messages...");
    messages <- getMessages(from_queue);
    if(nrow(messages) > 0) {

      for (i in 1:nrow(messages)) {
        message <- as.list(messages[i, ])

        body <- fromJSON(message$Body)


        result <- tryCatch({
            handle_package_version(body$name, body$path)
          }, 
          error = function(e) {
            error_body <- toString(list(error=e, package=body$name, version=body$version));
            error_queue <- "RdocRWorkerDeadQueue";
            error_q <- create_queue(error_queue);
            print("Posting error to dead letter queue"); 
            send_msg(error_queue, error_body);

          }, finally = {
            print("Cleaning files..."); 
            package_file_name <- paste(body$name, ".tar.gz", sep="");
            package_path <- paste("packages/", package_file_name, sep="");
            delete_files(package_path, body$name);

            print("Deleting job from SQS"); 
            delete_msg(from_queue, message$ReceiptHandle);
          }
        );

        if(inherits(result, "error")) next #continue
      } 
    }
    
  }

  
}

handle_package_version("ggthemeassist", "https://api.github.com/repos/calligross/ggthemeassist/tarball");
#main();

