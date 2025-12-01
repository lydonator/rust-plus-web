#!/bin/bash

# VPS Production Environment Check Script
# Run this on your VPS to verify production setup

echo "========================================"
echo "VPS Production Environment Check"
echo "========================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running on VPS (adjust this path to match your VPS)
EXPECTED_PATH="/home/web/apps/rust-plus-web"

echo "Current directory: $(pwd)"
echo ""

# Function to check if file exists
check_file() {
    if [ -f "$1" ]; then
        echo -e "${GREEN}✓${NC} $1 exists"
        return 0
    else
        echo -e "${RED}✗${NC} $1 NOT FOUND"
        return 1
    fi
}

# Function to check if directory exists
check_dir() {
    if [ -d "$1" ]; then
        echo -e "${GREEN}✓${NC} $1 exists"
        return 0
    else
        echo -e "${RED}✗${NC} $1 NOT FOUND"
        return 1
    fi
}

echo "=== Critical Environment Files ==="
check_file ".env.production"
check_file "cloud-shim/.env"
check_file "start-production.js"
check_file "ecosystem.config.js"
echo ""

echo "=== Required Scripts ==="
check_file "package.json"
check_file "next.config.ts"
echo ""

echo "=== Logs Directory ==="
check_dir "logs"
if [ ! -d "logs" ]; then
    echo -e "${YELLOW}  Creating logs directory...${NC}"
    mkdir -p logs
    echo -e "${GREEN}  ✓ Created logs directory${NC}"
fi
echo ""

echo "=== Node.js & PM2 ==="
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo -e "${GREEN}✓${NC} Node.js: $NODE_VERSION"
else
    echo -e "${RED}✗${NC} Node.js not found"
fi

if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    echo -e "${GREEN}✓${NC} npm: $NPM_VERSION"
else
    echo -e "${RED}✗${NC} npm not found"
fi

if command -v pm2 &> /dev/null; then
    PM2_VERSION=$(pm2 --version)
    echo -e "${GREEN}✓${NC} PM2: $PM2_VERSION"
else
    echo -e "${RED}✗${NC} PM2 not found"
fi
echo ""

echo "=== PM2 Running Processes ==="
if command -v pm2 &> /dev/null; then
    pm2 list
else
    echo -e "${RED}PM2 not installed${NC}"
fi
echo ""

echo "=== Environment File Contents Check ==="
if [ -f ".env.production" ]; then
    echo "Checking .env.production for required variables..."
    REQUIRED_VARS=(
        "NODE_ENV"
        "NEXT_PUBLIC_SUPABASE_URL"
        "NEXT_PUBLIC_SUPABASE_ANON_KEY"
        "SUPABASE_SERVICE_ROLE_KEY"
        "NEXT_PUBLIC_APP_URL"
        "NEXT_PUBLIC_SHIM_URL"
        "STEAM_API_KEY"
        "JWT_SECRET"
        "REDIS_URL"
    )

    for VAR in "${REQUIRED_VARS[@]}"; do
        if grep -q "^$VAR=" .env.production; then
            echo -e "${GREEN}  ✓${NC} $VAR is set"
        else
            echo -e "${RED}  ✗${NC} $VAR is MISSING"
        fi
    done
else
    echo -e "${RED}Cannot check - .env.production not found${NC}"
fi
echo ""

if [ -f "cloud-shim/.env" ]; then
    echo "Checking cloud-shim/.env for required variables..."
    REQUIRED_SHIM_VARS=(
        "NODE_ENV"
        "NEXT_PUBLIC_SUPABASE_URL"
        "SUPABASE_SERVICE_ROLE_KEY"
        "REDIS_URL"
    )

    for VAR in "${REQUIRED_SHIM_VARS[@]}"; do
        if grep -q "^$VAR=" cloud-shim/.env; then
            echo -e "${GREEN}  ✓${NC} $VAR is set"
        else
            echo -e "${RED}  ✗${NC} $VAR is MISSING"
        fi
    done
else
    echo -e "${RED}Cannot check - cloud-shim/.env not found${NC}"
fi
echo ""

echo "=== Dependencies Check ==="
if [ -d "node_modules" ]; then
    echo -e "${GREEN}✓${NC} node_modules exists"

    # Check if dotenv is installed
    if [ -d "node_modules/dotenv" ]; then
        echo -e "${GREEN}  ✓${NC} dotenv package installed"
    else
        echo -e "${RED}  ✗${NC} dotenv package NOT installed (run: npm install)"
    fi

    # Check if next is installed
    if [ -d "node_modules/next" ]; then
        echo -e "${GREEN}  ✓${NC} next package installed"
    else
        echo -e "${RED}  ✗${NC} next package NOT installed (run: npm install)"
    fi
else
    echo -e "${RED}✗${NC} node_modules NOT FOUND (run: npm install)"
fi

if [ -d "cloud-shim/node_modules" ]; then
    echo -e "${GREEN}✓${NC} cloud-shim/node_modules exists"
else
    echo -e "${RED}✗${NC} cloud-shim/node_modules NOT FOUND (run: cd cloud-shim && npm install)"
fi
echo ""

echo "=== Build Check ==="
if [ -d ".next" ]; then
    echo -e "${GREEN}✓${NC} .next build directory exists"
    NEXT_BUILD_DATE=$(stat -c %y .next 2>/dev/null || stat -f %Sm .next 2>/dev/null)
    echo "  Build date: $NEXT_BUILD_DATE"
else
    echo -e "${YELLOW}⚠${NC} .next build directory NOT FOUND (run: npm run build)"
fi
echo ""

echo "=== Redis Check ==="
if command -v redis-cli &> /dev/null; then
    if redis-cli ping &> /dev/null; then
        echo -e "${GREEN}✓${NC} Redis is running and responding"
    else
        echo -e "${RED}✗${NC} Redis is not responding"
    fi
else
    echo -e "${YELLOW}⚠${NC} redis-cli not found (cannot check Redis)"
fi
echo ""

echo "=== Git Repository Check ==="
if [ -d ".git" ]; then
    echo -e "${GREEN}✓${NC} Git repository initialized"
    CURRENT_BRANCH=$(git branch --show-current)
    LAST_COMMIT=$(git log -1 --format="%h - %s (%ar)")
    echo "  Current branch: $CURRENT_BRANCH"
    echo "  Last commit: $LAST_COMMIT"
else
    echo -e "${RED}✗${NC} Not a git repository"
fi
echo ""

echo "========================================"
echo "Summary"
echo "========================================"
echo ""

CRITICAL_MISSING=0

if [ ! -f ".env.production" ]; then
    echo -e "${RED}✗ CRITICAL: .env.production missing${NC}"
    CRITICAL_MISSING=1
fi

if [ ! -f "cloud-shim/.env" ]; then
    echo -e "${RED}✗ CRITICAL: cloud-shim/.env missing${NC}"
    CRITICAL_MISSING=1
fi

if [ ! -f "start-production.js" ]; then
    echo -e "${RED}✗ CRITICAL: start-production.js missing${NC}"
    CRITICAL_MISSING=1
fi

if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}⚠ WARNING: node_modules missing - run: npm install${NC}"
fi

if [ ! -d ".next" ]; then
    echo -e "${YELLOW}⚠ WARNING: .next build missing - run: npm run build${NC}"
fi

if [ $CRITICAL_MISSING -eq 0 ]; then
    echo -e "${GREEN}✓ All critical files present${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Ensure dependencies are installed: npm install && cd cloud-shim && npm install"
    echo "  2. Build Next.js app: npm run build"
    echo "  3. Start services: pm2 start ecosystem.config.js"
    echo "  4. Save PM2 state: pm2 save"
else
    echo -e "${RED}✗ Critical files missing - see VPS-DEPLOYMENT-NOTES.md${NC}"
fi

echo ""
