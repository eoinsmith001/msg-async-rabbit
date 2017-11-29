#!/bin/bash
docker-compose stop
docker-compose rm -f -v
docker-compose up -d
