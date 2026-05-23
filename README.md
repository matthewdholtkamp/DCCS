# DCCS/MSCoE Surgeon Operational Framework — GLWCH

Interactive operational framework for the Deputy Commander for Clinical Services (DCCS) and MSCoE Command Surgeon at General Leonard Wood Community Hospital, Fort Leonard Wood, MO.

## Overview

This site provides a streamlined **DCCS Operational Framework**: three phases, three LOEs, and service-line execution views available from the left sidebar. The top navigation also includes **Ask Dr. Holtkamp**, which reuses the shared BAND-AID 6 persona and Gemini Worker from the sibling `Bandaid6` repository while grounding answers in the current DCCS portal data.

### Service Lines
- Primary Care Service Line (PCSL)
- Surgical Services (3SL)
- Mental Health
- Emergency Department
- MSCoE Surgeon / Trainee Care Model

## Usage

Open `index.html` in any browser. For the Ask Dr. Holtkamp panel to reuse the local `Bandaid6` persona during development, serve the parent `Research AI` folder and open `/DCCS/`.

For local development:
```bash
# Python
cd ..
python3 -m http.server 8000
# open http://localhost:8000/DCCS/

# Node
npx serve .. -l 8000
# open the /DCCS/ path
```

## Deployment

Hosted on GitHub Pages. Push to `main` branch to deploy.

---

**LTC Matthew D. Holtkamp** — DCCS / MSCoE Command Surgeon  
**SSG Flor Holloway** — NCOIC / Executive Assistant
