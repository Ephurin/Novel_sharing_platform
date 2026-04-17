from django.contrib.auth.models import AbstractUser
from django.db import models


# Ngày 5 - B1: Định nghĩa các loại role dùng trong hệ thống
class RoleChoices(models.TextChoices):
    # Reader: chỉ được đọc nội dung đã duyệt
    READER = 'reader', 'Reader'
    # Author: được tạo / chỉnh sửa nội dung của chính mình
    AUTHOR = 'author', 'Author'
    # Editor: có quyền duyệt nội dung của Author
    EDITOR = 'editor', 'Editor'


# Ngày 5 - B2: Custom User kế thừa AbstractUser và thêm field role
class User(AbstractUser):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Field role lưu vai trò của user, mặc định là Reader
    role = models.CharField(
        max_length=20,
        choices=RoleChoices.choices,
        default=RoleChoices.READER,
    )

    def __str__(self):
        return self.username

    # Helper: dùng trong code để check nhanh từng loại role
    def is_reader(self):
        return self.role == RoleChoices.READER

    def is_author(self):
        return self.role == RoleChoices.AUTHOR

    def is_editor(self):
        return self.role == RoleChoices.EDITOR
