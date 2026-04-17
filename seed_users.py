from user_accounts.models import User, RoleChoices

USERS = [
    ("reader1", RoleChoices.READER, "reader1@example.com", "reader123"),
    ("author1", RoleChoices.AUTHOR, "author1@example.com", "author123"),
    ("editor1", RoleChoices.EDITOR, "editor1@example.com", "editor123"),
]

for username, role, email, pwd in USERS:
    user, created = User.objects.get_or_create(
        username=username,
        defaults={"email": email, "role": role},
    )
    user.role = role
    user.email = email
    user.set_password(pwd)
    user.save()
    print(f"Seeded user {username} with role {role} and password '{pwd}'")
