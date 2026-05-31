


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."delete_calling_permanently"("row_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  delete from public.callings
  where id = row_id;

  if not found then
    raise exception 'No calling found for id %', row_id;
  end if;
end;
$$;


ALTER FUNCTION "public"."delete_calling_permanently"("row_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_calling_permanently_v2"("row_id" "uuid", "table_prefix" "text" DEFAULT 'prod'::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  table_name text;
  deleted_count integer;
BEGIN
  IF table_prefix NOT IN ('prod', 'train') THEN
    RAISE EXCEPTION 'Invalid table prefix: %. Must be prod or train', table_prefix;
  END IF;
  
  table_name := table_prefix || '_callings';
  
  EXECUTE format('DELETE FROM public.%I WHERE id = $1', table_name) USING row_id;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  IF deleted_count = 0 THEN
    RAISE EXCEPTION 'No calling found for id % in table %', row_id, table_name;
  END IF;
END;
$_$;


ALTER FUNCTION "public"."delete_calling_permanently_v2"("row_id" "uuid", "table_prefix" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_callings_permanently"("row_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  perform public.delete_calling_permanently(row_id);
end;
$$;


ALTER FUNCTION "public"."delete_callings_permanently"("row_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_auth_user_created_members"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_name text;
  v_email text;
  v_row_id uuid;
BEGIN
  v_email := nullif(new.email, '');

  v_name := coalesce(
    nullif(new.raw_user_meta_data->>'name',''),
    nullif(new.raw_user_meta_data->>'full_name',''),
    'Unknown ' || new.id
  );

  -- 1) If row exists for this auth_user_id, update it
  UPDATE public.members
  SET
    name = v_name,
    email = v_email,
    can_be_assigned = false,
    training_enabled = true,
    super = false
  WHERE auth_user_id = new.id;

  IF FOUND THEN
    RETURN new;
  END IF;

  -- 2) Else if email already exists (unique constraint), update that row instead
  IF v_email IS NOT NULL THEN
    UPDATE public.members
    SET
      auth_user_id = new.id,
      name = v_name,
      email = v_email,
      can_be_assigned = false,
      training_enabled = true,
      super = false
    WHERE email = v_email;

    IF FOUND THEN
      RETURN new;
    END IF;
  END IF;

  -- 3) Else insert a brand new row
  INSERT INTO public.members (
    auth_user_id,
    name,
    email,
    can_be_assigned,
    training_enabled,
    super
  )
  VALUES (
    new.id,
    v_name,
    v_email,
    false,
    true,
    false
  );

  RETURN new;
END;
$$;


ALTER FUNCTION "public"."handle_auth_user_created_members"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_auth_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_name text;
begin
  -- Prefer a provided name in metadata; fallback to email
  v_name := coalesce(
    new.raw_user_meta_data->>'name',
    new.raw_user_meta_data->>'full_name',
    new.email
  );

  if v_name is null then
    -- If there's truly no way to populate name, avoid inserting invalid rows
    -- (You can choose a different fallback strategy if needed.)
    raise exception 'Cannot create members row: missing name and email is null';
  end if;

  insert into public.members (name, auth_user_id, email)
  values (v_name, new.id, new.email)
  on conflict (name) do update
  set auth_user_id = excluded.auth_user_id,
      email = excluded.email;

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_auth_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."move_calling_to_archive"("row_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  shared_cols text;
  inserted_count integer;
begin
  /*
    Build a comma-separated list of columns that exist in BOTH
    public.callings and public.archive, in callings column order.
  */
  select string_agg(format('%I', c.column_name), ', ' order by c.ordinal_position)
    into shared_cols
  from information_schema.columns c
  join information_schema.columns a
    on a.table_schema = 'public'
   and a.table_name   = 'archive'
   and a.column_name  = c.column_name
  where c.table_schema = 'public'
    and c.table_name   = 'callings';

  if shared_cols is null then
    raise exception 'No shared columns found between public.callings and public.archive';
  end if;

  -- Insert matching row into archive using shared columns
  execute format(
    'insert into public.archive (%1$s)
     select %1$s
     from public.callings
     where id = $1',
    shared_cols
  )
  using row_id;

  get diagnostics inserted_count = row_count;

  if inserted_count = 0 then
    raise exception 'No calling found for id %', row_id;
  end if;

  -- Delete original row only after successful archive insert
  delete from public.callings
  where id = row_id;
end;
$_$;


ALTER FUNCTION "public"."move_calling_to_archive"("row_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."move_calling_to_archive_v2"("row_id" "uuid", "table_prefix" "text" DEFAULT 'prod'::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  callings_table text;
  archive_table text;
  shared_cols text;
  inserted_count integer;
BEGIN
  -- Validate prefix
  IF table_prefix NOT IN ('prod', 'train') THEN
    RAISE EXCEPTION 'Invalid table prefix: %. Must be prod or train', table_prefix;
  END IF;
  
  callings_table := table_prefix || '_callings';
  archive_table := table_prefix || '_archive';
  
  -- Build shared columns list
  SELECT string_agg(format('%I', c.column_name), ', ' ORDER BY c.ordinal_position)
    INTO shared_cols
  FROM information_schema.columns c
  JOIN information_schema.columns a
    ON a.table_schema = 'public'
   AND a.table_name = archive_table
   AND a.column_name = c.column_name
  WHERE c.table_schema = 'public'
    AND c.table_name = callings_table;
  
  IF shared_cols IS NULL THEN
    RAISE EXCEPTION 'No shared columns found between % and %', callings_table, archive_table;
  END IF;
  
  -- Insert into archive
  EXECUTE format(
    'INSERT INTO public.%I (%s) SELECT %s FROM public.%I WHERE id = $1',
    archive_table, shared_cols, shared_cols, callings_table
  ) USING row_id;
  
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  
  IF inserted_count = 0 THEN
    RAISE EXCEPTION 'No calling found for id % in table %', row_id, callings_table;
  END IF;
  
  -- Delete from callings
  EXECUTE format('DELETE FROM public.%I WHERE id = $1', callings_table) USING row_id;
END;
$_$;


ALTER FUNCTION "public"."move_calling_to_archive_v2"("row_id" "uuid", "table_prefix" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_members_auth_user_id_from_auth_users"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if new.email is null then
    return new;
  end if;

  update public.members m
  set auth_user_id = new.id
  where lower(m.email) = lower(new.email);

  return new;
end;
$$;


ALTER FUNCTION "public"."sync_members_auth_user_id_from_auth_users"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."app_notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "body" "text" NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sent_by_email" "text",
    "recipients" "text"[] DEFAULT '{}'::"text"[] NOT NULL
);


ALTER TABLE "public"."app_notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."archive" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "type" "text",
    "name" "text",
    "position" "text",
    "unit" "text",
    "sp_approved" boolean,
    "hc_sustained" boolean,
    "interview_by" "text",
    "prev_release" boolean DEFAULT false,
    "sus_assigned" "text",
    "set_apart_by" "text",
    "status" "text" DEFAULT 'In Progress'::"text",
    "interviewed" timestamp with time zone,
    "sustained" timestamp with time zone,
    "set_apart" "text",
    "lcr_recorded" boolean,
    "units_sustained" "text"[] DEFAULT '{}'::"text"[],
    "sp_approved_date" timestamp with time zone,
    "hc_sustained_date" timestamp with time zone,
    "hc_sustained_bypass" boolean DEFAULT false NOT NULL,
    "hc_sustained_bypass_by" "text",
    "hc_sustained_bypass_at" timestamp with time zone,
    "auth_user_id" "uuid",
    "units_release_announced" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "super" boolean DEFAULT false
);


ALTER TABLE "public"."archive" OWNER TO "postgres";


COMMENT ON TABLE "public"."archive" IS 'This is a duplicate of callings';



CREATE TABLE IF NOT EXISTS "public"."calling_hc_votes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "calling_id" "uuid" NOT NULL,
    "voter_name" "text" NOT NULL,
    "vote" "text" NOT NULL,
    "voted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "calling_hc_votes_vote_check" CHECK (("vote" = ANY (ARRAY['sustain'::"text", 'concern'::"text"])))
);


ALTER TABLE "public"."calling_hc_votes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."calling_hidden_for_members" (
    "calling_id" "uuid" NOT NULL,
    "member_name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."calling_hidden_for_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."callings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "type" "text",
    "name" "text",
    "position" "text",
    "unit" "text",
    "sp_approved" boolean,
    "hc_sustained" boolean,
    "interview_by" "text",
    "prev_release" boolean DEFAULT false,
    "sus_assigned" "text",
    "set_apart_by" "text",
    "status" "text" DEFAULT 'In Progress'::"text",
    "interviewed" timestamp with time zone,
    "sustained" timestamp with time zone,
    "set_apart" "text",
    "lcr_recorded" boolean,
    "units_sustained" "text"[] DEFAULT '{}'::"text"[],
    "sp_approved_date" timestamp with time zone,
    "hc_sustained_date" timestamp with time zone,
    "hc_sustained_bypass" boolean DEFAULT false NOT NULL,
    "hc_sustained_bypass_by" "text",
    "hc_sustained_bypass_at" timestamp with time zone,
    "units_release_announced" "text"[] DEFAULT '{}'::"text"[] NOT NULL
);


ALTER TABLE "public"."callings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."members" (
    "name" "text" NOT NULL,
    "role" "text" DEFAULT 'assign'::"text",
    "auth_user_id" "uuid",
    "email" "text",
    "can_be_assigned" boolean DEFAULT false NOT NULL,
    "super" boolean DEFAULT false,
    "training_enabled" boolean DEFAULT true NOT NULL,
    "receive_concern" boolean DEFAULT false
);


ALTER TABLE "public"."members" OWNER TO "postgres";


COMMENT ON COLUMN "public"."members"."receive_concern" IS 'Whether this member should receive concern notification emails';



CREATE TABLE IF NOT EXISTS "public"."prod_archive" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "type" "text",
    "name" "text",
    "position" "text",
    "unit" "text",
    "sp_approved" boolean,
    "hc_sustained" boolean,
    "interview_by" "text",
    "prev_release" boolean DEFAULT false,
    "sus_assigned" "text",
    "set_apart_by" "text",
    "status" "text" DEFAULT 'In Progress'::"text",
    "interviewed" timestamp with time zone,
    "sustained" timestamp with time zone,
    "set_apart" "text",
    "lcr_recorded" boolean,
    "units_sustained" "text"[] DEFAULT '{}'::"text"[],
    "sp_approved_date" timestamp with time zone,
    "hc_sustained_date" timestamp with time zone,
    "hc_sustained_bypass" boolean DEFAULT false NOT NULL,
    "hc_sustained_bypass_by" "text",
    "hc_sustained_bypass_at" timestamp with time zone,
    "auth_user_id" "uuid",
    "units_release_announced" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "super" boolean DEFAULT false
);


ALTER TABLE "public"."prod_archive" OWNER TO "postgres";


COMMENT ON TABLE "public"."prod_archive" IS 'Production archive table (duplicate of prod_callings)';



CREATE TABLE IF NOT EXISTS "public"."prod_calling_hc_votes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "calling_id" "uuid" NOT NULL,
    "voter_name" "text" NOT NULL,
    "vote" "text" NOT NULL,
    "voted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "prod_calling_hc_votes_vote_check" CHECK (("vote" = ANY (ARRAY['sustain'::"text", 'concern'::"text"])))
);


ALTER TABLE "public"."prod_calling_hc_votes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."prod_calling_hidden_for_members" (
    "calling_id" "uuid" NOT NULL,
    "member_name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."prod_calling_hidden_for_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."prod_callings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "type" "text",
    "name" "text",
    "position" "text",
    "unit" "text",
    "sp_approved" boolean,
    "hc_sustained" boolean,
    "interview_by" "text",
    "prev_release" boolean DEFAULT false,
    "sus_assigned" "text",
    "set_apart_by" "text",
    "status" "text" DEFAULT 'In Progress'::"text",
    "interviewed" timestamp with time zone,
    "sustained" timestamp with time zone,
    "set_apart" "text",
    "lcr_recorded" boolean,
    "units_sustained" "text"[] DEFAULT '{}'::"text"[],
    "sp_approved_date" timestamp with time zone,
    "hc_sustained_date" timestamp with time zone,
    "hc_sustained_bypass" boolean DEFAULT false NOT NULL,
    "hc_sustained_bypass_by" "text",
    "hc_sustained_bypass_at" timestamp with time zone,
    "units_release_announced" "text"[] DEFAULT '{}'::"text"[] NOT NULL
);


ALTER TABLE "public"."prod_callings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."prod_status_options" (
    "name" "text" NOT NULL
);


ALTER TABLE "public"."prod_status_options" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_subscriptions" (
    "id" bigint NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "subscription" "jsonb",
    "user_email" "text",
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "public"."push_subscriptions" OWNER TO "postgres";


COMMENT ON COLUMN "public"."push_subscriptions"."user_email" IS 'Email address of the user who subscribed to push notifications';



ALTER TABLE "public"."push_subscriptions" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."push_subscriptions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."status_options" (
    "name" "text" NOT NULL
);


ALTER TABLE "public"."status_options" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."train_archive" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "type" "text",
    "name" "text",
    "position" "text",
    "unit" "text",
    "sp_approved" boolean,
    "hc_sustained" boolean,
    "interview_by" "text",
    "prev_release" boolean DEFAULT false,
    "sus_assigned" "text",
    "set_apart_by" "text",
    "status" "text" DEFAULT 'In Progress'::"text",
    "interviewed" timestamp with time zone,
    "sustained" timestamp with time zone,
    "set_apart" "text",
    "lcr_recorded" boolean,
    "units_sustained" "text"[] DEFAULT '{}'::"text"[],
    "sp_approved_date" timestamp with time zone,
    "hc_sustained_date" timestamp with time zone,
    "hc_sustained_bypass" boolean DEFAULT false NOT NULL,
    "hc_sustained_bypass_by" "text",
    "hc_sustained_bypass_at" timestamp with time zone,
    "auth_user_id" "uuid",
    "units_release_announced" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "super" boolean DEFAULT false
);


ALTER TABLE "public"."train_archive" OWNER TO "postgres";


COMMENT ON TABLE "public"."train_archive" IS 'Training archive table (duplicate of train_callings)';



CREATE TABLE IF NOT EXISTS "public"."train_calling_hc_votes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "calling_id" "uuid" NOT NULL,
    "voter_name" "text" NOT NULL,
    "vote" "text" NOT NULL,
    "voted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "train_calling_hc_votes_vote_check" CHECK (("vote" = ANY (ARRAY['sustain'::"text", 'concern'::"text"])))
);


ALTER TABLE "public"."train_calling_hc_votes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."train_calling_hidden_for_members" (
    "calling_id" "uuid" NOT NULL,
    "member_name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."train_calling_hidden_for_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."train_callings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "type" "text",
    "name" "text",
    "position" "text",
    "unit" "text",
    "sp_approved" boolean,
    "hc_sustained" boolean,
    "interview_by" "text",
    "prev_release" boolean DEFAULT false,
    "sus_assigned" "text",
    "set_apart_by" "text",
    "status" "text" DEFAULT 'In Progress'::"text",
    "interviewed" timestamp with time zone,
    "sustained" timestamp with time zone,
    "set_apart" "text",
    "lcr_recorded" boolean,
    "units_sustained" "text"[] DEFAULT '{}'::"text"[],
    "sp_approved_date" timestamp with time zone,
    "hc_sustained_date" timestamp with time zone,
    "hc_sustained_bypass" boolean DEFAULT false NOT NULL,
    "hc_sustained_bypass_by" "text",
    "hc_sustained_bypass_at" timestamp with time zone,
    "units_release_announced" "text"[] DEFAULT '{}'::"text"[] NOT NULL
);


ALTER TABLE "public"."train_callings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."train_status_options" (
    "name" "text" NOT NULL
);


ALTER TABLE "public"."train_status_options" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."units" (
    "name" "text" NOT NULL
);


ALTER TABLE "public"."units" OWNER TO "postgres";


ALTER TABLE ONLY "public"."app_notifications"
    ADD CONSTRAINT "app_notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."archive"
    ADD CONSTRAINT "archive_auth_user_id_key" UNIQUE ("auth_user_id");



ALTER TABLE ONLY "public"."archive"
    ADD CONSTRAINT "archive_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."calling_hc_votes"
    ADD CONSTRAINT "calling_hc_votes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."calling_hidden_for_members"
    ADD CONSTRAINT "calling_hidden_for_members_pkey" PRIMARY KEY ("calling_id", "member_name");



ALTER TABLE ONLY "public"."callings"
    ADD CONSTRAINT "callings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."members"
    ADD CONSTRAINT "members_auth_user_id_key" UNIQUE ("auth_user_id");



ALTER TABLE ONLY "public"."members"
    ADD CONSTRAINT "members_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."members"
    ADD CONSTRAINT "members_pkey" PRIMARY KEY ("name");



ALTER TABLE ONLY "public"."prod_archive"
    ADD CONSTRAINT "prod_archive_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."prod_calling_hc_votes"
    ADD CONSTRAINT "prod_calling_hc_votes_calling_id_voter_name_key" UNIQUE ("calling_id", "voter_name");



ALTER TABLE ONLY "public"."prod_calling_hc_votes"
    ADD CONSTRAINT "prod_calling_hc_votes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."prod_calling_hidden_for_members"
    ADD CONSTRAINT "prod_calling_hidden_for_members_pkey" PRIMARY KEY ("calling_id", "member_name");



ALTER TABLE ONLY "public"."prod_callings"
    ADD CONSTRAINT "prod_callings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."prod_status_options"
    ADD CONSTRAINT "prod_status_options_pkey" PRIMARY KEY ("name");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."status_options"
    ADD CONSTRAINT "status_options_pkey" PRIMARY KEY ("name");



ALTER TABLE ONLY "public"."train_archive"
    ADD CONSTRAINT "train_archive_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."train_calling_hc_votes"
    ADD CONSTRAINT "train_calling_hc_votes_calling_id_voter_name_key" UNIQUE ("calling_id", "voter_name");



ALTER TABLE ONLY "public"."train_calling_hc_votes"
    ADD CONSTRAINT "train_calling_hc_votes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."train_calling_hidden_for_members"
    ADD CONSTRAINT "train_calling_hidden_for_members_pkey" PRIMARY KEY ("calling_id", "member_name");



ALTER TABLE ONLY "public"."train_callings"
    ADD CONSTRAINT "train_callings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."train_status_options"
    ADD CONSTRAINT "train_status_options_pkey" PRIMARY KEY ("name");



ALTER TABLE ONLY "public"."units"
    ADD CONSTRAINT "units_pkey" PRIMARY KEY ("name");



CREATE INDEX "calling_hc_votes_calling_id_idx" ON "public"."calling_hc_votes" USING "btree" ("calling_id");



CREATE UNIQUE INDEX "calling_hc_votes_calling_voter_unique" ON "public"."calling_hc_votes" USING "btree" ("calling_id", "voter_name");



CREATE INDEX "idx_archive_units_release_announced_gin" ON "public"."archive" USING "gin" ("units_release_announced");



CREATE INDEX "idx_calling_hidden_for_members_calling_id" ON "public"."calling_hidden_for_members" USING "btree" ("calling_id");



CREATE INDEX "idx_calling_hidden_for_members_member_name" ON "public"."calling_hidden_for_members" USING "btree" ("member_name");



CREATE INDEX "idx_callings_units_release_announced_gin" ON "public"."callings" USING "gin" ("units_release_announced");



CREATE INDEX "idx_members_receive_concern" ON "public"."members" USING "btree" ("receive_concern");



CREATE INDEX "idx_prod_archive_created_at" ON "public"."prod_archive" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_prod_calling_hc_votes_calling_id" ON "public"."prod_calling_hc_votes" USING "btree" ("calling_id");



CREATE INDEX "idx_prod_callings_created_at" ON "public"."prod_callings" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_prod_callings_name" ON "public"."prod_callings" USING "btree" ("name");



CREATE INDEX "idx_prod_callings_status" ON "public"."prod_callings" USING "btree" ("status");



CREATE INDEX "idx_train_archive_created_at" ON "public"."train_archive" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_train_calling_hc_votes_calling_id" ON "public"."train_calling_hc_votes" USING "btree" ("calling_id");



CREATE INDEX "idx_train_callings_created_at" ON "public"."train_callings" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_train_callings_name" ON "public"."train_callings" USING "btree" ("name");



CREATE INDEX "idx_train_callings_status" ON "public"."train_callings" USING "btree" ("status");



CREATE OR REPLACE TRIGGER "trg_calling_hc_votes_updated_at" BEFORE UPDATE ON "public"."calling_hc_votes" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



ALTER TABLE ONLY "public"."calling_hc_votes"
    ADD CONSTRAINT "calling_hc_votes_calling_id_fkey" FOREIGN KEY ("calling_id") REFERENCES "public"."callings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."calling_hidden_for_members"
    ADD CONSTRAINT "calling_hidden_for_members_calling_id_fkey" FOREIGN KEY ("calling_id") REFERENCES "public"."callings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."calling_hidden_for_members"
    ADD CONSTRAINT "calling_hidden_for_members_member_name_fkey" FOREIGN KEY ("member_name") REFERENCES "public"."members"("name") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON UPDATE CASCADE;



CREATE POLICY "Admins can insert callings" ON "public"."callings" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."members" "m"
  WHERE (("m"."auth_user_id" = "auth"."uid"()) AND ("m"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can read all push subscriptions" ON "public"."push_subscriptions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."members"
  WHERE (("members"."email" = ("auth"."jwt"() ->> 'email'::"text")) AND (("members"."super" = true) OR ("lower"(TRIM(BOTH FROM "members"."role")) = 'admin'::"text"))))));



CREATE POLICY "Admins can send notifications" ON "public"."app_notifications" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."members"
  WHERE (("members"."email" = ("auth"."jwt"() ->> 'email'::"text")) AND (("members"."super" = true) OR ("lower"(TRIM(BOTH FROM "members"."role")) = 'admin'::"text"))))));



CREATE POLICY "Allow all" ON "public"."callings" USING (true);



CREATE POLICY "Allow authenticated users full access to prod_calling_hc_votes" ON "public"."prod_calling_hc_votes" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Allow authenticated users full access to prod_calling_hidden_fo" ON "public"."prod_calling_hidden_for_members" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Allow authenticated users full access to prod_callings" ON "public"."prod_callings" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Allow authenticated users full access to train_calling_hc_votes" ON "public"."train_calling_hc_votes" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Allow authenticated users full access to train_calling_hidden_f" ON "public"."train_calling_hidden_for_members" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Allow authenticated users full access to train_callings" ON "public"."train_callings" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Allow authenticated users to delete from prod_archive" ON "public"."prod_archive" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated users to delete from train_archive" ON "public"."train_archive" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated users to insert into prod_archive" ON "public"."prod_archive" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Allow authenticated users to insert into train_archive" ON "public"."train_archive" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Allow authenticated users to read prod_archive" ON "public"."prod_archive" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated users to read prod_status_options" ON "public"."prod_status_options" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated users to read train_archive" ON "public"."train_archive" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated users to read train_status_options" ON "public"."train_status_options" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated users to update prod_archive" ON "public"."prod_archive" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Allow authenticated users to update train_archive" ON "public"."train_archive" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Allow public to see member names" ON "public"."members" FOR SELECT TO "anon" USING (true);



CREATE POLICY "Allow read status options" ON "public"."status_options" FOR SELECT USING (true);



CREATE POLICY "Authenticated users can insert notifications" ON "public"."app_notifications" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Users can delete their own push subscription" ON "public"."push_subscriptions" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can dismiss their own notifications" ON "public"."app_notifications" FOR UPDATE TO "authenticated" USING ((("auth"."jwt"() ->> 'email'::"text") = ANY ("recipients"))) WITH CHECK (((("auth"."jwt"() ->> 'email'::"text") = ANY ("recipients")) OR ("recipients" = '{}'::"text"[])));



CREATE POLICY "Users can insert their own push subscription" ON "public"."push_subscriptions" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read their own notifications" ON "public"."app_notifications" FOR SELECT TO "authenticated" USING ((("auth"."jwt"() ->> 'email'::"text") = ANY ("recipients")));



CREATE POLICY "Users can read their own push subscription" ON "public"."push_subscriptions" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users see only their notifications" ON "public"."app_notifications" FOR SELECT TO "authenticated" USING (((("auth"."jwt"() ->> 'email'::"text") = ANY ("recipients")) OR ("sent_by_email" = ("auth"."jwt"() ->> 'email'::"text"))));



ALTER TABLE "public"."app_notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."archive" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "archive_admin_delete" ON "public"."archive" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."members" "m"
  WHERE (("m"."auth_user_id" = "auth"."uid"()) AND ("m"."role" = 'admin'::"text")))));



CREATE POLICY "archive_admin_insert" ON "public"."archive" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."members" "m"
  WHERE (("m"."auth_user_id" = "auth"."uid"()) AND ("m"."role" = 'admin'::"text")))));



CREATE POLICY "archive_admin_select" ON "public"."archive" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."members" "m"
  WHERE (("m"."auth_user_id" = "auth"."uid"()) AND ("m"."role" = 'admin'::"text")))));



CREATE POLICY "archive_admin_update" ON "public"."archive" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."members" "m"
  WHERE (("m"."auth_user_id" = "auth"."uid"()) AND ("m"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."members" "m"
  WHERE (("m"."auth_user_id" = "auth"."uid"()) AND ("m"."role" = 'admin'::"text")))));



CREATE POLICY "authenticated users can read members" ON "public"."members" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."calling_hc_votes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."calling_hidden_for_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."callings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "hc votes delete all" ON "public"."calling_hc_votes" FOR DELETE TO "authenticated", "anon" USING (true);



CREATE POLICY "hc votes insert all" ON "public"."calling_hc_votes" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "hc votes select all" ON "public"."calling_hc_votes" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "hc votes update all" ON "public"."calling_hc_votes" FOR UPDATE TO "authenticated", "anon" USING (true) WITH CHECK (true);



ALTER TABLE "public"."members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."prod_archive" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."prod_calling_hc_votes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."prod_calling_hidden_for_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."prod_callings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."prod_status_options" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pubc_view_status" ON "public"."status_options" FOR SELECT TO "anon" USING (true);



CREATE POLICY "public_view_units" ON "public"."units" FOR SELECT TO "anon" USING (true);



CREATE POLICY "punlic_access_policy" ON "public"."members" FOR SELECT TO "anon" USING (true);



ALTER TABLE "public"."push_subscriptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "read visible callings" ON "public"."callings" FOR SELECT TO "authenticated" USING ((NOT (EXISTS ( SELECT 1
   FROM ("public"."calling_hidden_for_members" "chfm"
     JOIN "public"."members" "m" ON (("m"."name" = "chfm"."member_name")))
  WHERE (("chfm"."calling_id" = "callings"."id") AND ("m"."auth_user_id" = "auth"."uid"()))))));



ALTER TABLE "public"."status_options" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."train_archive" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."train_calling_hc_votes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."train_calling_hidden_for_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."train_callings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."train_status_options" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."units" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."delete_calling_permanently"("row_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_calling_permanently"("row_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_calling_permanently"("row_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_calling_permanently_v2"("row_id" "uuid", "table_prefix" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_calling_permanently_v2"("row_id" "uuid", "table_prefix" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_calling_permanently_v2"("row_id" "uuid", "table_prefix" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_callings_permanently"("row_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_callings_permanently"("row_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_callings_permanently"("row_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_auth_user_created_members"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_auth_user_created_members"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_auth_user_created_members"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_auth_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_auth_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_auth_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."move_calling_to_archive"("row_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."move_calling_to_archive"("row_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."move_calling_to_archive"("row_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."move_calling_to_archive_v2"("row_id" "uuid", "table_prefix" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."move_calling_to_archive_v2"("row_id" "uuid", "table_prefix" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."move_calling_to_archive_v2"("row_id" "uuid", "table_prefix" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_members_auth_user_id_from_auth_users"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_members_auth_user_id_from_auth_users"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_members_auth_user_id_from_auth_users"() TO "service_role";


















GRANT ALL ON TABLE "public"."app_notifications" TO "anon";
GRANT ALL ON TABLE "public"."app_notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."app_notifications" TO "service_role";



GRANT ALL ON TABLE "public"."archive" TO "anon";
GRANT ALL ON TABLE "public"."archive" TO "authenticated";
GRANT ALL ON TABLE "public"."archive" TO "service_role";



GRANT ALL ON TABLE "public"."calling_hc_votes" TO "anon";
GRANT ALL ON TABLE "public"."calling_hc_votes" TO "authenticated";
GRANT ALL ON TABLE "public"."calling_hc_votes" TO "service_role";



GRANT ALL ON TABLE "public"."calling_hidden_for_members" TO "anon";
GRANT ALL ON TABLE "public"."calling_hidden_for_members" TO "authenticated";
GRANT ALL ON TABLE "public"."calling_hidden_for_members" TO "service_role";



GRANT ALL ON TABLE "public"."callings" TO "anon";
GRANT ALL ON TABLE "public"."callings" TO "authenticated";
GRANT ALL ON TABLE "public"."callings" TO "service_role";



GRANT ALL ON TABLE "public"."members" TO "anon";
GRANT ALL ON TABLE "public"."members" TO "authenticated";
GRANT ALL ON TABLE "public"."members" TO "service_role";



GRANT ALL ON TABLE "public"."prod_archive" TO "anon";
GRANT ALL ON TABLE "public"."prod_archive" TO "authenticated";
GRANT ALL ON TABLE "public"."prod_archive" TO "service_role";



GRANT ALL ON TABLE "public"."prod_calling_hc_votes" TO "anon";
GRANT ALL ON TABLE "public"."prod_calling_hc_votes" TO "authenticated";
GRANT ALL ON TABLE "public"."prod_calling_hc_votes" TO "service_role";



GRANT ALL ON TABLE "public"."prod_calling_hidden_for_members" TO "anon";
GRANT ALL ON TABLE "public"."prod_calling_hidden_for_members" TO "authenticated";
GRANT ALL ON TABLE "public"."prod_calling_hidden_for_members" TO "service_role";



GRANT ALL ON TABLE "public"."prod_callings" TO "anon";
GRANT ALL ON TABLE "public"."prod_callings" TO "authenticated";
GRANT ALL ON TABLE "public"."prod_callings" TO "service_role";



GRANT ALL ON TABLE "public"."prod_status_options" TO "anon";
GRANT ALL ON TABLE "public"."prod_status_options" TO "authenticated";
GRANT ALL ON TABLE "public"."prod_status_options" TO "service_role";



GRANT ALL ON TABLE "public"."push_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."push_subscriptions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."push_subscriptions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."push_subscriptions_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."status_options" TO "anon";
GRANT ALL ON TABLE "public"."status_options" TO "authenticated";
GRANT ALL ON TABLE "public"."status_options" TO "service_role";



GRANT ALL ON TABLE "public"."train_archive" TO "anon";
GRANT ALL ON TABLE "public"."train_archive" TO "authenticated";
GRANT ALL ON TABLE "public"."train_archive" TO "service_role";



GRANT ALL ON TABLE "public"."train_calling_hc_votes" TO "anon";
GRANT ALL ON TABLE "public"."train_calling_hc_votes" TO "authenticated";
GRANT ALL ON TABLE "public"."train_calling_hc_votes" TO "service_role";



GRANT ALL ON TABLE "public"."train_calling_hidden_for_members" TO "anon";
GRANT ALL ON TABLE "public"."train_calling_hidden_for_members" TO "authenticated";
GRANT ALL ON TABLE "public"."train_calling_hidden_for_members" TO "service_role";



GRANT ALL ON TABLE "public"."train_callings" TO "anon";
GRANT ALL ON TABLE "public"."train_callings" TO "authenticated";
GRANT ALL ON TABLE "public"."train_callings" TO "service_role";



GRANT ALL ON TABLE "public"."train_status_options" TO "anon";
GRANT ALL ON TABLE "public"."train_status_options" TO "authenticated";
GRANT ALL ON TABLE "public"."train_status_options" TO "service_role";



GRANT ALL ON TABLE "public"."units" TO "anon";
GRANT ALL ON TABLE "public"."units" TO "authenticated";
GRANT ALL ON TABLE "public"."units" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































