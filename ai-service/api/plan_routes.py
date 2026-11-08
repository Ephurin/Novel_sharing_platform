"""Owner-bound P2 plan API; internal repository consumers stay privileged."""
import uuid,hmac
from fastapi import APIRouter,Depends,Request,Response,HTTPException
from fastapi.routing import APIRoute
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy import select
from api.deps import get_narrative_repository
from api.plan_schemas import PlanEditCommand
from domain.errors import BootstrapConflictError
from infrastructure.database import session_scope
from infrastructure.orm_models import StoryPlanRecord


def principal(request,repo,*,missing_scope_probe=False):
    settings=request.app.state.settings
    token=getattr(settings,'platform_service_token','')
    supplied=request.headers.get('Authorization','')
    supplied=supplied[7:] if supplied.startswith('Bearer ') else request.headers.get('X-Service-Token') or request.headers.get('X-Internal-Service-Key')
    if not token:raise HTTPException(503,detail={'code':'SERVICE_AUTH_NOT_CONFIGURED'})
    if not supplied:raise HTTPException(401,detail={'code':'SERVICE_AUTH_REQUIRED'})
    if not hmac.compare_digest(token,supplied):raise HTTPException(403,detail={'code':'SERVICE_AUTH_INVALID'})
    if missing_scope_probe and not any(request.headers.get(k) for k in ('X-Author-Id','X-User-Id','X-Actor-Id')):
        try:tenant=str(uuid.UUID(request.headers['X-Tenant-Id']))
        except KeyError:raise HTTPException(401,detail={'code':'PLAN_IDENTITY_REQUIRED'}) from None
        except ValueError:raise HTTPException(422,detail={'code':'INVALID_PLAN_SCOPE'}) from None
        if tenant!=str(repo._tenant_id):raise HTTPException(403,detail={'code':'TENANT_SCOPE_MISMATCH'})
        return None
    try:
        author=str(uuid.UUID(request.headers['X-Author-Id']));tenant=str(uuid.UUID(request.headers['X-Tenant-Id']))
        if any(request.headers.get(k) is not None and str(uuid.UUID(request.headers[k]))!=author for k in ('X-User-Id','X-Actor-Id')):raise HTTPException(403,detail={'code':'PLAN_IDENTITY_MISMATCH'})
    except KeyError:raise HTTPException(401,detail={'code':'PLAN_IDENTITY_REQUIRED'}) from None
    except ValueError:raise HTTPException(422,detail={'code':'INVALID_PLAN_SCOPE'}) from None
    if not getattr(repo,'supports_plan_edit_v1',False):raise HTTPException(503,detail={'code':'PLAN_EDIT_REQUIRES_POSTGRES'})
    if tenant!=str(repo._tenant_id):raise HTTPException(403,detail={'code':'TENANT_SCOPE_MISMATCH'})
    return author


def legacy_scope(request,repo,novel_id=None,plan_id=None,active_only=False):
    # Legacy in-memory test/internal adapters have no P2 plan store; keep their contract.
    if not getattr(repo,'supports_plan_edit_v1',False):return
    author=principal(request,repo,missing_scope_probe=True)
    with session_scope(repo._session_factory) as session:
        query=select(StoryPlanRecord).where(StoryPlanRecord.tenant_id==repo._tenant_id)
        if novel_id is not None:query=query.where(StoryPlanRecord.novel_id==repo._novel_id(novel_id))
        if active_only:query=query.where(StoryPlanRecord.status=='active')
        if plan_id is not None:
            try:parsed_id=uuid.UUID(plan_id)
            except ValueError:raise HTTPException(422,detail={'code':'INVALID_PLAN_ID'}) from None
            query=query.where(StoryPlanRecord.id==parsed_id)
        rows=session.scalars(query).all()
        if author is None:
            if request.method=='PATCH' and plan_id is not None and not rows:raise HTTPException(404,detail={'code':'PLAN_NOT_FOUND'})
            raise HTTPException(401,detail={'code':'PLAN_IDENTITY_REQUIRED'})
        delegated = request.method=='GET' and request.headers.get('X-Gateway-Legacy-Plan-Read')=='admin' and rows and all((r.edit_metadata or {}).get('contract_version')!='plan-edit-v1' for r in rows)
        if (plan_id is not None and not rows) or (not delegated and any(str(r.created_by)!=author for r in rows)):raise HTTPException(404,detail={'code':'PLAN_NOT_FOUND'})
        if request.method in ('POST','PATCH') and any((r.edit_metadata or {}).get('contract_version')=='plan-edit-v1' for r in rows):raise HTTPException(409,detail={'code':'PLAN_EDIT_REQUIRES_CAS'})

class PlanValidationRoute(APIRoute):
    def get_route_handler(self):
        original=super().get_route_handler()
        async def handle(request):
            try:return await original(request)
            except RequestValidationError:return JSONResponse(status_code=422,content={'detail':{'code':'INVALID_PLAN_REQUEST'}})
        return handle

router=APIRouter(route_class=PlanValidationRoute)
@router.api_route('/story-plans/edit-v1/{novel_id}',methods=['GET','POST'])
def plans(novel_id:uuid.UUID,request:Request,response:Response,body:PlanEditCommand|None=None,repo=Depends(get_narrative_repository)):
    actor=principal(request,repo);response.headers['Cache-Control']='no-store'
    try:
        if request.method=='GET':data=repo.read_plans(str(novel_id),actor)
        else:
            if body is None:raise HTTPException(422,detail={'code':'INVALID_PLAN_REQUEST'})
            data=repo.edit_plan(str(novel_id),actor,body)
    except KeyError:raise HTTPException(404,detail={'code':'PLAN_NOT_FOUND'}) from None
    except BootstrapConflictError as e:raise HTTPException(409,detail={'code':e.code}) from None
    return {'data':data}

@router.get('/story-plans/edit-v1/{novel_id}/{plan_id}')
def snapshot(novel_id:uuid.UUID,plan_id:uuid.UUID,request:Request,response:Response,repo=Depends(get_narrative_repository)):
    actor=principal(request,repo);response.headers['Cache-Control']='no-store'
    try:return {'data':repo.read_plans(str(novel_id),actor,str(plan_id))}
    except KeyError:raise HTTPException(404,detail={'code':'PLAN_NOT_FOUND'}) from None


def guard_manual_autonomy(request,repo,novel_id,plan_id):
    if not getattr(repo,'supports_plan_edit_v1',False):return
    with session_scope(repo._session_factory) as session:
        row=session.execute(select(StoryPlanRecord.edit_metadata,StoryPlanRecord.created_by).where(
            *repo._scope(StoryPlanRecord,repo._novel_id(novel_id)),StoryPlanRecord.id==uuid.UUID(plan_id))).first()
    if row and (row[0] or {}).get('contract_version')=='plan-edit-v1':
        actor=principal(request,repo)
        if str(row[1])!=actor:raise HTTPException(404,detail={'code':'PLAN_NOT_FOUND'})
        raise HTTPException(409,detail={'code':'MANUAL_PLAN_AUTONOMY_NOT_AVAILABLE'})
