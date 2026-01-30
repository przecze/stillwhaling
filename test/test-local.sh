#!/bin/bash
# Quick local test - serves built files and runs basic checks

set -e

echo "🧪 Running local tests..."

# Check build exists
if [ ! -d "dist" ]; then
  echo "❌ dist/ not found. Run 'npm run build' first."
  exit 1
fi

# Check data exists
if [ ! -f "public/data/whaling_data.json" ]; then
  echo "❌ public/data/whaling_data.json not found. Run 'uv run python data/process_data.py' first."
  exit 1
fi

# Check HTML structure
if grep -q "Still Whaling" dist/index.html; then
  echo "✅ HTML structure looks good"
else
  echo "❌ HTML structure issue"
  exit 1
fi

# Check JS bundle exists
JS_COUNT=$(find dist/assets -name "*.js" 2>/dev/null | wc -l)
if [ "$JS_COUNT" -gt 0 ]; then
  echo "✅ JavaScript bundle found"
else
  echo "❌ JavaScript bundle missing"
  exit 1
fi

# Check data file is valid JSON
if python3 -m json.tool public/data/whaling_data.json > /dev/null 2>&1; then
  echo "✅ Data file is valid JSON"
else
  echo "❌ Data file is not valid JSON"
  exit 1
fi

echo ""
echo "✅ All local checks passed!"
echo "💡 For full browser tests, run: docker-compose up -d && docker-compose run --rm test"
