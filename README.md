# Still Whaling 🐋
**Note:** vibe-coded project with minimal review - J.Cz 

Interactive visualization of global whaling data from the [IWC (International Whaling Commission)](https://iwc.int/management-and-conservation/whaling/total-catches).

**See who's still whaling.**

## Features

- 🗺️ **Interactive world map** - Countries colored by total whale catches
- 📈 **Timeline** - See the global decline (and holdouts) over time
- ⏱️ **Time scrubber** - Drag to any year, watch the map evolve
- 🎯 **Hover interactions** - Highlight a country to see its share in the timeline
- 🐳 **Species filters** - Filter by whale species

## Tech Stack

- **Data Processing**: Python + Pandas (runs in Docker or with uv)
- **Frontend**: Vite + TypeScript + D3.js (runs in Docker)
- **Map**: D3.js with TopoJSON world map
- **Deployment**: Docker Compose + Ansible

**Everything runs in Docker - no npm/node/python required on host!**

## Setup

### 1. Process the data

**First, download the IWC dataset:**
1. Download the Excel file from [IWC Total Catches Database](https://iwc.int/management-and-conservation/whaling/total-catches)
2. Place it in the `data/` directory (e.g., `data/iwc_catches.xlsx`)
3. The file is gitignored and won't be committed to the repo

**Then process it:**

**Option A: Run in Docker (recommended)**
```bash
docker-compose run --rm process-data
```

**Option B: Run locally with uv**
```bash
uv run python data/process_data.py
```

This will generate `public/data/whaling_data.json` for the frontend.

### 2. Run locally (all in Docker)

```bash
docker-compose up
```

Access at `http://localhost:8081` (nginx proxies to Vite dev server).

If you want to test the production build locally you can still run:

```bash
docker compose up -d --build site
```

**Note:** Everything runs in Docker - no npm/node required on your machine!

### 3. Run tests

```bash
docker-compose run --rm test
```

Tests verify:
- Site loads and JavaScript executes
- Data loads correctly
- Map renders and colors countries
- Interactive elements work

## Deployment

### Deploy to production (bluh server)

```bash
cd ansible
ansible-playbook deploy.yml
```

The site will be available at `https://stillwhaling.janczechowski.com` after DNS is configured.

See `ansible/README.md` for details.

## Data Source

**IWC data is not included in this repository due to license uncertainty.**

Data source: [IWC Total Catches Database](https://iwc.int/management-and-conservation/whaling/total-catches)

To use this project:
1. Download the dataset from the IWC website (Excel format)
2. Place it in the `data/` directory (e.g., `data/iwc_catches.xlsx`) - this file is gitignored
3. Run `docker-compose run --rm process-data` (or `uv run python data/process_data.py`) to generate `public/data/whaling_data.json`

## TODO

- [ ] Add whale species silhouette SVGs for filter buttons
- [ ] Add country flag icons
- [ ] Mobile responsive design
- [ ] Share/embed functionality
