import { getPostgresPool } from '../../core/database/postgres.js';
import { createHash } from 'node:crypto';
import { getMongoDatabase } from '../../core/database/mongo.js';
import { findNovelById } from '../novels/novels.repository.js';
import { findChapterById } from '../novels/chapters.repository.js';
import { findCommentById, isCommentApproved, type CommentDocument } from './comments.repository.js';
import { authorizeComment, mutualIds, privateComment } from './comment-privacy.js';
import { createNotification } from './notifications.repository.js';

export async function notifyComment(comment: CommentDocument) {
  const novel=await findNovelById(comment.novelId);
  const chapter=comment.chapterId?await findChapterById(comment.chapterId):null;
  if(!novel||novel.status!=='PUBLISHED'||(comment.chapterId&&chapter?.status!=='PUBLISHED')||!isCommentApproved(comment)||comment.deletedAt)return;
  const root=comment.parentCommentId?await findCommentById(comment.parentCommentId):comment;
  if(!root||!isCommentApproved(root))return;
  const recipients=new Map<string,string>();
  if(privateComment(root)) {
    for(const userId of root.audience==='AUTHOR_PRIVATE'?[root.userId,novel.authorId]:[root.userId,...(root.recipientUserIds??[])]) recipients.set(userId,'PRIVATE_COMMENT');
  }else{
    const target=comment.parentCommentId?await findCommentById(comment.replyToCommentId??comment.parentCommentId):null;
    if(!comment.parentCommentId)recipients.set(novel.authorId,'READER_COMMENT');
    else if(target&&isCommentApproved(target)&&(target.commentId===root.commentId||target.parentCommentId===root.commentId))
      recipients.set(target.userId,comment.userId===novel.authorId?'AUTHOR_REPLY':'COMMENT_REPLY');
    const mutual=new Set(await mutualIds(comment.userId));
    for(const mention of comment.mentions??[]) if(mutual.has(mention.userId)&&!recipients.has(mention.userId))recipients.set(mention.userId,'COMMENT_MENTION');
  }
  recipients.delete(comment.userId);
  for(const [userId,type] of recipients){
    // Preserve delivery history from the old single-recipient notification key.
    const legacyId=createHash('sha256').update('comment:'+comment.commentId).digest('hex');
    if(await getMongoDatabase().collection('notifications').findOne({notificationId:legacyId,userId}))continue;
    const user=(await getPostgresPool().query("select role from users where user_id=$1 and status='ACTIVE' and deleted_at is null",[userId])).rows[0];
    if(!user)continue;
    if(privateComment(root)) {
      try{await authorizeComment(comment,{userId,role:user.role},true);}catch(error){
        if((error as {httpStatus?:number}).httpStatus===404)continue;
        // Access helpers deliberately hide unavailable content; database failures still retry.
        if((error as {code?:string}).code==='CONTENT_001')continue;
        throw error;
      }
    }
    const prefix=type==='COMMENT_REPLY'?'/public':'/reader';
    const base=comment.chapterId?prefix+'/chapters/'+comment.chapterId:prefix+'/novels/'+comment.novelId;
    const href=privateComment(root)?base+'?threadId='+root.commentId+'&commentId='+comment.commentId:
      type==='READER_COMMENT'?'/author/novels/'+novel.novelId+'/comments':base+'?commentId='+comment.commentId+'#reader-comments';
    await createNotification({eventKey:'comment:'+comment.commentId+':'+userId,userId,type,
      title:type==='AUTHOR_REPLY'?'Tác giả đã trả lời bình luận':type==='COMMENT_REPLY'?'Có trả lời bình luận mới':type==='COMMENT_MENTION'?'Bạn được nhắc trong bình luận':'Có bình luận mới',content:privateComment(root)?'Mở luồng để xem bình luận riêng.':novel.title,
      payload:{href,rootCommentId:root.commentId,commentId:comment.commentId,novelId:comment.novelId,chapterId:comment.chapterId}});
  }
}
