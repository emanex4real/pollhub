#!/bin/sh
set -e
python -c "import app; app.init_db()"
exec gunicorn --bind 0.0.0.0:5000 --workers 2 app:app
