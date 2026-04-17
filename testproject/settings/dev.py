"""
Django dev settings – chỉ dùng khi chạy local / development.
KHÔNG dùng file này trên production.
"""

from .base import *  # noqa: F401, F403

# Khoá bí mật chỉ dành cho local – thay bằng biến môi trường trên production
SECRET_KEY = 'django-insecure-u&jkqs3-syp$t+0$ud&vb$8!@t5ium7+i4w3@0$k-v$&azbd^b'

DEBUG = True

ALLOWED_HOSTS = []

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}
