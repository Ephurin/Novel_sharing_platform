-- Retain topic IDs, dates, comments, and historical novel references.
insert into discussion_categories (slug, name, sort_order, is_active, post_admin_only)
values
  ('thao-luan-chung', 'Thảo luận chung', 10, true, false),
  ('goc-tac-gia', 'Góc tác giả', 30, true, false),
  ('hoi-dap', 'Hỏi đáp', 40, true, false),
  ('thong-bao-cong-dong', 'Thông báo cộng đồng', 60, true, true)
on conflict (slug) do nothing;

update discussion_topics as topic
set category_id = destination.category_id
from discussion_categories as source
cross join discussion_categories as destination
where topic.category_id = source.category_id
  and source.slug in ('thao-luan-truyen', 'gop-y-tac-pham')
  and destination.slug = 'thao-luan-chung';

update discussion_categories
set is_active = false, updated_at = now()
where slug in ('thao-luan-truyen', 'gop-y-tac-pham') and is_active;

update discussion_categories
set is_active = true,
    post_admin_only = (slug = 'thong-bao-cong-dong'),
    updated_at = now()
where slug in ('thao-luan-chung', 'goc-tac-gia', 'hoi-dap', 'thong-bao-cong-dong')
  and (not is_active or post_admin_only is distinct from (slug = 'thong-bao-cong-dong'));
