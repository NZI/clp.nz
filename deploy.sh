#!/bin/bash

set -o allexport
source .env
set +o allexport


if [ -f ./deploy/deploy.tgz ]; then
    rm ./deploy/deploy.tgz
fi

if yarn tsc; then
  pushd dist
    mv server.js api.clp.nz.js
    cp ../package.json .
    cp ../yarn.lock .
    tar czf ../deploy/deploy.tgz .
    date=$(date '+%Y-%m-%d-%H-%M-%S')

    ssh $MACHINE -p $MACHINE_PORT <<!
      mkdir -p dns/deploys/${date}
!
  popd
  scp -P$MACHINE_PORT -r deploy/deploy.tgz $MACHINE:dns/deploys/${date}/${date}.tgz

  ssh $MACHINE -p $MACHINE_PORT <<!
    pushd dns;
      pushd deploys/${date};
        tar xzf ${date}.tgz
        rm ${date}.tgz
        rm client.js
        npm install
      popd;

      ln -sfn deploys/${date} current
      pm2 restart api.clp.nz
    popd;
!

fi

