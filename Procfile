release: python django_backend/manage.py migrate --noinput && python django_backend/manage.py collectstatic --noinput
web: gunicorn --chdir django_backend --bind 0.0.0.0:$PORT club_backend.wsgi
