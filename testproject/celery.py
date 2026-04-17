import os

from celery import Celery


os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'testproject.settings.dev')

app = Celery('testproject')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()