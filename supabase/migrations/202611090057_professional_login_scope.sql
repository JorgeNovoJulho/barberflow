-- Professional logins are separate per shop. General delegated access (without
-- a professional profile) retains its existing behavior.
create unique index barberflow_professional_login_email
  on barberflow_private.team_access (email)
  where professional_id is not null and revoked_at is null;

create unique index barberflow_professional_login_user
  on barberflow_private.team_access (user_id)
  where professional_id is not null and revoked_at is null and user_id is not null;
