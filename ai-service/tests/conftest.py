import os
import pytest

# Ensure unit tests that don't configure PLATFORM_SERVICE_TOKEN bypass auth by default via SERVICE_AUTH_DISABLED dev override.
os.environ.setdefault("SERVICE_AUTH_DISABLED", "true")
