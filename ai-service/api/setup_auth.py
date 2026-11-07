"""Setup-only trusted Gateway principal; never a browser author/role assertion."""
import hmac
from uuid import UUID
from fastapi import HTTPException


def setup_principal(request, service):
    if request is None:
        raise HTTPException(401, detail={'code':'SETUP_IDENTITY_REQUIRED'})
    settings = getattr(request.app.state, 'settings', None)
    expected = getattr(settings, 'platform_service_token', '')
    if not expected:
        raise HTTPException(503, detail={'code':'SERVICE_AUTH_NOT_CONFIGURED'})
    auth = request.headers.get('Authorization', '')
    token = auth[7:] if auth.startswith('Bearer ') else (request.headers.get('X-Service-Token') or request.headers.get('X-Internal-Service-Key'))
    if not token:
        raise HTTPException(401, detail={'code':'SERVICE_AUTH_REQUIRED'})
    if not hmac.compare_digest(token, expected):
        raise HTTPException(403, detail={'code':'SERVICE_AUTH_INVALID'})
    return identity_headers(request, service)


def identity_headers(request, service, *, optional=False):
    if request is None:
        return None
    if optional and not any(request.headers.get(k) is not None for k in ('X-Author-Id','X-User-Id','X-Actor-Id')):
        return None
    author, tenant = request.headers.get('X-Author-Id'), request.headers.get('X-Tenant-Id')
    if not author or not tenant:
        raise HTTPException(401, detail={'code':'SETUP_IDENTITY_REQUIRED'})
    try:
        author, tenant = str(UUID(author)), str(UUID(tenant))
        for name in ('X-User-Id', 'X-Actor-Id'):
            other = request.headers.get(name)
            if other is not None and str(UUID(other)) != author:
                raise HTTPException(403, detail={'code':'SETUP_IDENTITY_MISMATCH'})
    except ValueError:
        raise HTTPException(422, detail={'code':'INVALID_SCOPE_HEADER'}) from None
    try:
        service._scope(tenant)
    except PermissionError:
        raise HTTPException(403, detail={'code':'TENANT_SCOPE_MISMATCH'}) from None
    # No client-supplied ADMIN/role override. JWT/active-account/current novel
    # ownership are verified by Gateway; service credentials authenticate it.
    return tenant, author


# Pydantic's default error includes the rejected input object (and private
# notes). Redact only versioned setup admission errors; P1 DTOs stay unchanged.
from fastapi.routing import APIRoute
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

def contains_setup_input(body):
    pending = [body]
    while pending:
        item = pending.pop()
        if isinstance(item, dict):
            if any(k in item for k in ('setup', 'contract_version', 'private_author_notes', 'author_constraints')):
                return True
            pending.extend(item.values())
        elif isinstance(item, list):
            pending.extend(item)
    return False


class SetupValidationRoute(APIRoute):
    def get_route_handler(self):
        original = super().get_route_handler()
        async def handler(request):
            try:
                return await original(request)
            except RequestValidationError as exc:
                body = exc.body
                versioned = contains_setup_input(body)
                if self.path.endswith('/bootstrap/from-idea') and versioned:
                    return JSONResponse(status_code=422, content={'detail':{'code':'INVALID_SETUP_REQUEST'}})
                raise
        return handler
