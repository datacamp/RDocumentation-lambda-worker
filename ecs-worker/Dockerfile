FROM rocker/hadleyverse:latest

RUN apt-get update && apt-get install -y python-pip groff-base
RUN pip install awscli

ENV LD_LIBRARY_PATH /usr/lib/R/library
ENV R_HOME /usr/lib/R/
ENV R_LIBS /usr/local/lib/R/site-library

WORKDIR /ecs-worker

ADD scripts/install.R /ecs-worker/scripts/install.R

RUN Rscript scripts/install.R

VOLUME /ecs-worker/scripts

ADD . /ecs-worker


RUN mkdir packages
VOLUME /ecs-worker/packages

RUN mkdir jsons
VOLUME /ecs-worker/jsons

CMD ["bash", "run.sh"]