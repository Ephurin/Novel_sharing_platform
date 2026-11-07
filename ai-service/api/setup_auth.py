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

class SetupValidationRoute(APIRoute):
    def get_route_handler(self):
        original = super().get_route_handler()
        async def handler(request):
            try:
                return await original(request)
            except RequestValidationError as exc:
                body = exc.body
                versioned = isinstance(body, dict) and any(k in body for k in ('setup','contract_version','private_author_notes'))
                if self.path.endswith('/bootstrap/from-idea') and versioned:
                    return JSONResponse(status_code=422, content={'detail':{'code':'INVALID_SETUP_REQUEST'}})
                raise
        return handler
