alter table moderation_escalations
  drop constraint moderation_escalations_proposed_action_check,
  add constraint moderation_escalations_proposed_action_check
    check (proposed_action in ('WARN', 'LOCK', 'HIDE'));
