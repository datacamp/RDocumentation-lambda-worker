library("aws.sqs")

getMessages <- function() {
  receive_msg("RdocRWorkerQueue", wait = 20) 
}
