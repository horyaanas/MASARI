#!/bin/bash
# Start Next.js dev server in a fully detached way
cd /home/z/my-project
pkill -f "next dev" 2>/dev/null
sleep 2

# Use nohup + & + disown
nohup npx next dev --turbopack --port 3000 > /tmp/next-dev.log 2>&1 &
DEV_PID=$!
echo "Started dev server with PID: $DEV_PID"
echo "$DEV_PID" > /tmp/next-dev.pid

# Wait for the server to be ready
for i in $(seq 1 30); do
  STATUS=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 3 http://localhost:3000/ 2>/dev/null)
  if [ "$STATUS" = "200" ]; then
    echo "Server ready at attempt $i (HTTP $STATUS)"
    break
  fi
  sleep 1
done

# Final status
STATUS=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 3 http://localhost:3000/ 2>/dev/null)
echo "Final HTTP status: $STATUS"

# Verify process is alive
if kill -0 $DEV_PID 2>/dev/null; then
  echo "Process $DEV_PID is alive"
else
  echo "Process $DEV_PID died"
fi
