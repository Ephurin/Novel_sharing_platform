from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import User, RoleChoices


# Ngày 5 - B3: Tuỳ biến Django Admin để quản lý role cho User
@admin.register(User)
class CustomUserAdmin(UserAdmin):
	# Hiển thị thêm cột role trong danh sách user
	list_display = (*UserAdmin.list_display, 'role')
	# Cho phép filter user theo role ở sidebar
	list_filter = (*UserAdmin.list_filter, 'role')

	# Thêm group "Role" vào form edit user
	fieldsets = (*UserAdmin.fieldsets, (
		'Role', {
			'fields': ('role',),
		},
	))

	# Thêm group "Role" vào form tạo user mới
	add_fieldsets = (*UserAdmin.add_fieldsets, (
		'Role', {
			'fields': ('role',),
		},
	))

