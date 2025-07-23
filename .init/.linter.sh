#!/bin/bash
cd /home/kavia/workspace/code-generation/tic-tac-toe-ai-chat-challenge-07d2d35a/frontend_react
npm run build
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
   exit 1
fi

