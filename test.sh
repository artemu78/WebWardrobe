#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}==========================================${NC}"
echo -e "${YELLOW}Running Backend Tests (Python)${NC}"
echo -e "${YELLOW}==========================================${NC}"

# Run Python tests
python3 -m unittest discover -s backend/tests
BACKEND_STATUS=$?

echo ""
echo -e "${YELLOW}==========================================${NC}"
echo -e "${YELLOW}Running Extension Tests (Node.js)${NC}"
echo -e "${YELLOW}==========================================${NC}"

EXTENSION_STATUS=0
if [ -d "extension" ]; then
    cd extension
    
    # Check if package.json exists
    if [ -f "package.json" ]; then
        # Check if 'test' script is the default placeholder
        # We use a loose grep to catch the standard default message
        if grep -q "Error: no test specified" package.json; then
            echo -e "${YELLOW}No tests configured in extension/package.json. Skipping.${NC}"
        else
            # Try running tests if they are defined
            npm test
            EXTENSION_STATUS=$?
        fi
    else
        echo -e "${RED}No package.json found in extension directory.${NC}"
        EXTENSION_STATUS=1
    fi
    cd ..
else
    echo -e "${RED}Directory 'extension' not found.${NC}"
    EXTENSION_STATUS=1
fi

echo ""
echo -e "${YELLOW}==========================================${NC}"
echo -e "${YELLOW}Summary${NC}"
echo -e "${YELLOW}==========================================${NC}"

EXIT_CODE=0

if [ $BACKEND_STATUS -eq 0 ]; then
    echo -e "Backend Tests: ${GREEN}PASSED${NC}"
else
    echo -e "Backend Tests: ${RED}FAILED${NC}"
    EXIT_CODE=1
fi

if [ $EXTENSION_STATUS -eq 0 ]; then
    echo -e "Extension Tests: ${GREEN}PASSED (or skipped)${NC}"
else
    echo -e "Extension Tests: ${RED}FAILED${NC}"
    EXIT_CODE=1
fi

exit $EXIT_CODE
