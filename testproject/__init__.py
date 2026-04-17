try:
    from .celery import app as celery_app
    __all__ = ('celery_app',)
except (ImportError, ModuleNotFoundError):
    # Celery is optional - only required when running worker
    pass
