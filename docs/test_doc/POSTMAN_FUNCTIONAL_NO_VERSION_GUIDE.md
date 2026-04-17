# Postman functional test guide (no API versioning)

## Files to import
- Collection: postman/API_Functional_Test_No_Version.postman_collection.json
- Environment: postman/API_Functional_Local.postman_environment.json

## Scope
This script does not test API versioning. It only validates normal business features:
- JWT login
- Story CRUD for author role
- Chapter workflow submit and approve
- Reader permission behavior
- Soft delete and restore story

## Preconditions
1. Django server is running on http://127.0.0.1:8000
2. Demo accounts are available:
- author1 / author123
- editor1 / editor123
- reader1 / reader123

## Run order
Run requests from 01 to 13 in order.

## Expected summary
- 401 for anonymous access
- 200 for token requests
- 201 for story and chapter creation
- 200 for submit and approve workflow
- 403 when reader tries to create story
- 204 then 200 for soft delete and restore

## Quick presentation flow (5-7 min)
- 01 -> 05: security and create story
- 07 -> 09: chapter workflow author to editor
- 10 -> 11: permission check for reader
- 12 -> 13: soft delete and restore
