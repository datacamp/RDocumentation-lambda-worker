FROM rocker/hadleyverse:latest


ADD . /ecs-worker

WORKDIR /ecs-worker

RUN Rscript scripts/install.R

VOLUME /ecs-worker/scripts

VOLUME /ecs-worker/packages

VOLUME /ecs-worker/jsons

CMD ["bash", "run.sh"]