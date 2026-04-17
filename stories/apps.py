from django.apps import AppConfig


class StoriesConfig(AppConfig):
    name = 'stories'
    
    def ready(self):
        """Đăng ký signals khi app khởi động."""
        import stories.signals
