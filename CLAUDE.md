# Sarah's Charting Tool — Developer Notes

## Version

The app version is defined at the top of `app.py`:

```python
VERSION = '1.6'
```

**Always bump this when shipping a meaningful update.** Increment the minor number (e.g. 1.6 → 1.7) for feature additions, and the major number for breaking changes.

## Stack

- Backend: Flask / Python / SQLite (`app.py`)
- Frontend: vanilla JS (`static/js/chart.js`), CSS (`static/css/chart.css`)
- Templates: Jinja2 (`templates/index.html`)
- Chart type definitions: JSON files in `data/templates/`

## Git

Push all changes to **both**:
- `main` (what Sarah pulls via the in-app Update button)
- `claude/fix-charting-permissions-jpvKK` (feature branch)
