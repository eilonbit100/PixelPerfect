create or replace function public.bootstrap_current_user(_full_name text default null) returns jsonb language plpgsql security definer set search_path=public as $$
declare _uid uuid := auth.uid(); _email text := lower(auth.jwt()->>'email'); _name text; _m uuid;
  _org uuid := '00000000-0000-0000-0000-00000000a001';
begin
  if _uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  _name := coalesce(nullif(trim(_full_name),''), nullif(auth.jwt()->'user_metadata'->>'full_name',''), nullif(auth.jwt()->'user_metadata'->>'name',''), split_part(_email,'@',1));
  insert into public.profiles(id, full_name) values (_uid, _name) on conflict (id) do nothing;
  if exists (select 1 from public.organization_members where user_id=_uid) then return jsonb_build_object('status','existing'); end if;

  -- claim a pending invitation for this verified email
  update public.organization_members set user_id=_uid, status='ACTIVE', joined_at=now()
    where id = (select id from public.organization_members where user_id is null and status='INVITED' and lower(invited_email)=_email
                and id <> '00000000-0000-0000-0000-00000000c001' order by created_at limit 1)
    returning id into _m;
  if _m is not null then return jsonb_build_object('status','invited'); end if;

  if not exists (select 1 from public.organizations where id=_org) then return jsonb_build_object('status','no_org'); end if;
  update public.organization_members set user_id=_uid, status='ACTIVE', joined_at=now(), display_name=_name, invited_email=_email
    where id='00000000-0000-0000-0000-00000000c001' and user_id is null returning id into _m;
  if _m is not null then return jsonb_build_object('status','owner'); end if;
  insert into public.organization_members(organization_id, user_id, display_name, invited_email, role, status, joined_at)
  values (_org, _uid, _name, _email, 'EMPLOYEE', 'ACTIVE', now()) returning id into _m;
  insert into public.member_branch_access(organization_member_id, branch_id) values (_m, '00000000-0000-0000-0000-00000000b001');
  return jsonb_build_object('status','employee');
end $$;
revoke execute on function public.bootstrap_current_user(text) from public, anon;
grant execute on function public.bootstrap_current_user(text) to authenticated;