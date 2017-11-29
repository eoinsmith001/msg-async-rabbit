#!/bin/bash

pushd producer
./build.sh
popd
pushd consumer-foo
./build.sh
popd
pushd consumer-bar
./build.sh
popd
pushd consumer-all
./build.sh
popd
