# Postman run guide for API testing demo

## Files
- Collection: postman/API_Testing_Demo_5_10_Min.postman_collection.json
- Environment: postman/API_Testing_Local.postman_environment.json

## Setup
1. Start Django server on local machine.
2. Import collection and environment into Postman.
3. Select environment API Testing Local.
4. Make sure users already exist by running:

python manage.py shell < seed_users.py

## Suggested run order for 5 minute demo
- 01 Unauthorized stories list should return 401
- 02 Get author JWT token
- 03 Author creates story should return 201
- 04 v1 stories should not include ai_summary
- 05 v2 stories should include ai_summary

## Suggested run order for 10 minute demo
- Run all requests from 01 to 09 in sequence.

## What each request proves
- 01 proves auth is enforced and 401 format is normalized.
- 03 proves happy path create for author role.
- 04 and 05 prove v1 and v2 schema difference for versioning.
- 07 proves authorization by role with 403.
- 08 and 09 prove 400 and 404 are standardized.

## Speaker notes
- Highlight that tests assert both status code and response contract.
- Highlight that negative tests are as important as happy path.
- Highlight that API versioning allows backward compatibility.
