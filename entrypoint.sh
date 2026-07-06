#!/bin/sh
set -e

echo "Starting Vane..."

cd /home/vane
exec node server.js