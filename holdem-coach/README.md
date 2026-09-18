# Holdem Coach (moved)

This copy under the East Canyon Resort repo is a **snapshot / mirror**.

## Dedicated repository (canonical)

- **Repo:** https://github.com/jbwings1/holdem-coach  
- **Clone:** `git clone https://github.com/jbwings1/holdem-coach.git`  
- **Live Pages URL:** https://jbwings1.github.io/holdem-coach/  

> **Pages note:** If the Pages URL 404s, enable it once under  
> https://github.com/jbwings1/holdem-coach/settings/pages → Source **GitHub Actions**  
> (or Deploy from branch **main** / folder **/**).

## Legacy path in this repo

The embedded web app remains at `holdem-coach/web/` for now so the old URL still works:

https://jbwings1.github.io/east-canyon-rv-site/holdem-coach/web/

Prefer the dedicated repo above for new work.

## Run locally (this tree)

```bash
cd holdem-coach/web
python3 -m http.server 8080 --bind 0.0.0.0
```

Open `http://localhost:8080`.
