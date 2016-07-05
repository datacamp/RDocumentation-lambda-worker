FROM rocker/hadleyverse:latest

RUN apt-get update && apt-get install -y python-pip groff-base
RUN pip install awscli

ENV LD_LIBRARY_PATH /usr/lib/R/library
ENV R_HOME /usr/lib/R/
ENV R_LIBS /usr/local/lib/R/site-library

ADD . /ecs-worker

WORKDIR /ecs-worker

RUN Rscript scripts/install.R

VOLUME /ecs-worker/scripts

VOLUME /ecs-worker/packages

VOLUME /ecs-worker/jsons

CMD ["bash", "run.sh"]