import { Router } from 'express';
import { z } from 'zod';
import { optionalAuth, requireAuth } from '../../core/security/auth.middleware.js';
import { successResponse } from '../../core/response/response.js';
import { authorizeComment, privateComment, privateCollection, unavailable } from './comment-privacy.js';
import { findCommentById } from './comments.repository.js';
import { listPrivate, privateReplies, presentPrivate } from './private-comments.service.js';
import { listCommentReplies, present } from './comments.service.js';
import { findNovelById } from '../novels/novels.repository.js';

export const commentThreadsRoutes=Router();
commentThreadsRoutes.use((_req,res,next)=>{res.setHeader('Cache-Control','private, no-store');next();});
const pagination=z.object({page:z.coerce.number().int().positive().default(1),limit:z.coerce.number().int().min(1).max(100).default(20)});
commentThreadsRoutes.get('/author-feedback',requireAuth,async(req,res,next)=>{
  try {
    const input=pagination.extend({box:z.enum(['sent','received']),novelId:z.string().uuid().optional(),chapterId:z.string().uuid().optional()}).parse(req.query);
    const filter:Record<string,unknown>={...(input.novelId?{novelId:input.novelId}:{}),...(input.chapterId?{chapterId:input.chapterId}:{})};
    if(input.box==='sent')filter.userId=req.auth!.userId;
    else {
      const {getPostgresPool}=await import('../../core/database/postgres.js');
      const owned=await getPostgresPool().query('select novel_id from novels where author_id=$1',[req.auth!.userId]);
      filter.novelId={$in:owned.rows.map(r=>r.novel_id).filter(id=>!input.novelId||input.novelId===id)};
    }
    const result=await listPrivate(req.auth,{...input,channel:'AUTHOR_PRIVATE'},filter);
    res.json(successResponse(result.data,result.meta));
  }catch(error){next(error);}
});
commentThreadsRoutes.get('/comments/:commentId/thread',optionalAuth,async(req,res,next)=>{
  try {
    const id=z.string().uuid().parse(req.params.commentId);
    const input=pagination.parse(req.query);
    const comment=await findCommentById(id);
    const root=await authorizeComment(comment,req.auth);
    const novel=await findNovelById(root.novelId);
    if(!novel||novel.status!=='PUBLISHED')return unavailable();
    let page=input.page;
    if(comment!.parentCommentId){
      const earlier=await privateCollection().countDocuments({parentCommentId:root.commentId,deletedAt:null,
        $and:[{$or:[{status:'APPROVED'},...(req.auth?[{userId:req.auth.userId,status:{$in:['PENDING_MODERATION','REJECTED'] as const}}]:[])]},
          {$or:[{createdAt:{$lt:comment!.createdAt}},{createdAt:comment!.createdAt,commentId:{$lt:id}}]}]});
      page=Math.floor(earlier/input.limit)+1;
    }
    const privateThread=privateComment(root);
    const rootResult=privateThread?await presentPrivate([root],1,{page:1,limit:1},req.auth!):await present({items:[root],totalItems:1},{page:1,limit:1},req.auth,novel);
    const replies=privateThread?await privateReplies(root.commentId,{...input,page},req.auth):await listCommentReplies(root.commentId,{...input,page},req.auth);
    res.json(successResponse({root:rootResult.data[0],replies:replies.data,focusCommentId:id,rootCommentId:root.commentId},replies.meta));
  }catch(error){next(error);}
});
