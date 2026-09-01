--
-- PRism database schema
--
-- Generated with pg_dump from a database created by Laravel's migrations,
-- captured before those migrations were deleted. From here on this file is
-- the schema's source of truth: TypeORM runs with `synchronize: false` and
-- will never create or alter a table.
--
-- To provision a new database:
--   psql "$DB_URL" -f prism-api/schema.sql
--
-- Deliberately NOT included, because nothing reads them any more:
--   sessions, password_reset_tokens  - Laravel session and Breeze auth
--   jobs, job_batches, failed_jobs   - Laravel's queue; BullMQ uses Redis
--   cache, cache_locks               - Laravel's database cache driver
--   migrations                       - Laravel's own migration ledger
-- They still exist in the current production database and are harmless there;
-- dropping them is a separate decision, not something this file does.
--
-- The CHECK constraints below are what Laravel's enum() compiles to on
-- Postgres. Keep them: the entities declare those columns as varchar with a
-- TypeScript union, and the database is what actually enforces the values.
--


\restrict wjcdXnRhm7ejMSSnByBjuPVLFgZSRZ3tQUatnNqEFT04Sarm8p2Z46dAviqbFuv


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

SET default_tablespace = '';

SET default_table_access_method = heap;

-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.audit_logs (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    action character varying(64) NOT NULL,
    description text,
    metadata json,
    ip_address character varying(45),
    created_at timestamp(0) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


-- Name: audit_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -

CREATE SEQUENCE public.audit_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


-- Name: audit_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -

ALTER SEQUENCE public.audit_logs_id_seq OWNED BY public.audit_logs.id;


-- Name: commit_reviews; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.commit_reviews (
    id bigint NOT NULL,
    repository_id bigint NOT NULL,
    commit_sha character varying(64) NOT NULL,
    commit_message text,
    author character varying(255),
    branch character varying(255) NOT NULL,
    status character varying(16) DEFAULT 'pending'::character varying NOT NULL,
    overall_score smallint,
    summary text,
    security_issues json,
    performance_issues json,
    code_quality_issues json,
    suggested_fixes json,
    detected_languages json,
    ai_model_used character varying(255),
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);


-- Name: commit_reviews_id_seq; Type: SEQUENCE; Schema: public; Owner: -

CREATE SEQUENCE public.commit_reviews_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


-- Name: commit_reviews_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -

ALTER SEQUENCE public.commit_reviews_id_seq OWNED BY public.commit_reviews.id;


-- Name: personal_access_tokens; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.personal_access_tokens (
    id bigint NOT NULL,
    tokenable_type character varying(255) NOT NULL,
    tokenable_id bigint NOT NULL,
    name character varying(255) NOT NULL,
    token character varying(64) NOT NULL,
    abilities text,
    last_used_at timestamp(0) without time zone,
    expires_at timestamp(0) without time zone,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);


-- Name: personal_access_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: -

CREATE SEQUENCE public.personal_access_tokens_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


-- Name: personal_access_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -

ALTER SEQUENCE public.personal_access_tokens_id_seq OWNED BY public.personal_access_tokens.id;


-- Name: pull_requests; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.pull_requests (
    id bigint NOT NULL,
    repository_id bigint NOT NULL,
    github_pr_id bigint NOT NULL,
    pr_number integer NOT NULL,
    title character varying(255) NOT NULL,
    author character varying(255) NOT NULL,
    base_branch character varying(255) NOT NULL,
    head_branch character varying(255) NOT NULL,
    status character varying(255) DEFAULT 'pending'::character varying NOT NULL,
    diff_url character varying(255),
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone,
    detected_languages json,
    CONSTRAINT pull_requests_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'analyzing'::character varying, 'completed'::character varying, 'failed'::character varying])::text[])))
);


-- Name: pull_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -

CREATE SEQUENCE public.pull_requests_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


-- Name: pull_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -

ALTER SEQUENCE public.pull_requests_id_seq OWNED BY public.pull_requests.id;


-- Name: repositories; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.repositories (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    name character varying(255) NOT NULL,
    full_name character varying(255) NOT NULL,
    github_repo_id bigint NOT NULL,
    webhook_id bigint,
    webhook_secret character varying(255) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone,
    review_mode character varying(32) DEFAULT 'pr_only'::character varying NOT NULL,
    review_branches json
);


-- Name: repositories_id_seq; Type: SEQUENCE; Schema: public; Owner: -

CREATE SEQUENCE public.repositories_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


-- Name: repositories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -

ALTER SEQUENCE public.repositories_id_seq OWNED BY public.repositories.id;


-- Name: review_comments; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.review_comments (
    id bigint NOT NULL,
    review_id bigint NOT NULL,
    file_path character varying(255) NOT NULL,
    line_number integer,
    layer character varying(255) NOT NULL,
    severity character varying(255) NOT NULL,
    comment text NOT NULL,
    github_comment_id bigint,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone,
    CONSTRAINT review_comments_layer_check CHECK (((layer)::text = ANY ((ARRAY['security'::character varying, 'performance'::character varying, 'code_quality'::character varying])::text[]))),
    CONSTRAINT review_comments_severity_check CHECK (((severity)::text = ANY ((ARRAY['critical'::character varying, 'warning'::character varying, 'suggestion'::character varying])::text[])))
);


-- Name: review_comments_id_seq; Type: SEQUENCE; Schema: public; Owner: -

CREATE SEQUENCE public.review_comments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


-- Name: review_comments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -

ALTER SEQUENCE public.review_comments_id_seq OWNED BY public.review_comments.id;


-- Name: reviews; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.reviews (
    id bigint NOT NULL,
    pull_request_id bigint NOT NULL,
    security_issues json,
    performance_issues json,
    code_quality_issues json,
    overall_score smallint,
    summary text,
    ai_model_used character varying(255),
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone,
    suggested_fixes json
);


-- Name: reviews_id_seq; Type: SEQUENCE; Schema: public; Owner: -

CREATE SEQUENCE public.reviews_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


-- Name: reviews_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -

ALTER SEQUENCE public.reviews_id_seq OWNED BY public.reviews.id;


-- Name: users; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.users (
    id bigint NOT NULL,
    name character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    email_verified_at timestamp(0) without time zone,
    password character varying(255),
    remember_token character varying(100),
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone,
    github_id character varying(255),
    github_token text,
    github_avatar character varying(255),
    github_username character varying(255),
    email_notifications boolean DEFAULT true NOT NULL,
    slack_webhook_url character varying(255)
);


-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -

CREATE SEQUENCE public.users_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


-- Name: audit_logs id; Type: DEFAULT; Schema: public; Owner: -

ALTER TABLE ONLY public.audit_logs ALTER COLUMN id SET DEFAULT nextval('public.audit_logs_id_seq'::regclass);


-- Name: commit_reviews id; Type: DEFAULT; Schema: public; Owner: -

ALTER TABLE ONLY public.commit_reviews ALTER COLUMN id SET DEFAULT nextval('public.commit_reviews_id_seq'::regclass);


-- Name: personal_access_tokens id; Type: DEFAULT; Schema: public; Owner: -

ALTER TABLE ONLY public.personal_access_tokens ALTER COLUMN id SET DEFAULT nextval('public.personal_access_tokens_id_seq'::regclass);


-- Name: pull_requests id; Type: DEFAULT; Schema: public; Owner: -

ALTER TABLE ONLY public.pull_requests ALTER COLUMN id SET DEFAULT nextval('public.pull_requests_id_seq'::regclass);


-- Name: repositories id; Type: DEFAULT; Schema: public; Owner: -

ALTER TABLE ONLY public.repositories ALTER COLUMN id SET DEFAULT nextval('public.repositories_id_seq'::regclass);


-- Name: review_comments id; Type: DEFAULT; Schema: public; Owner: -

ALTER TABLE ONLY public.review_comments ALTER COLUMN id SET DEFAULT nextval('public.review_comments_id_seq'::regclass);


-- Name: reviews id; Type: DEFAULT; Schema: public; Owner: -

ALTER TABLE ONLY public.reviews ALTER COLUMN id SET DEFAULT nextval('public.reviews_id_seq'::regclass);


-- Name: users id; Type: DEFAULT; Schema: public; Owner: -

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


-- Name: commit_reviews commit_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.commit_reviews
    ADD CONSTRAINT commit_reviews_pkey PRIMARY KEY (id);


-- Name: commit_reviews commit_reviews_repo_sha_unique; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.commit_reviews
    ADD CONSTRAINT commit_reviews_repo_sha_unique UNIQUE (repository_id, commit_sha);


-- Name: personal_access_tokens personal_access_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.personal_access_tokens
    ADD CONSTRAINT personal_access_tokens_pkey PRIMARY KEY (id);


-- Name: personal_access_tokens personal_access_tokens_token_unique; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.personal_access_tokens
    ADD CONSTRAINT personal_access_tokens_token_unique UNIQUE (token);


-- Name: pull_requests pull_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.pull_requests
    ADD CONSTRAINT pull_requests_pkey PRIMARY KEY (id);


-- Name: repositories repositories_github_repo_id_unique; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.repositories
    ADD CONSTRAINT repositories_github_repo_id_unique UNIQUE (github_repo_id);


-- Name: repositories repositories_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.repositories
    ADD CONSTRAINT repositories_pkey PRIMARY KEY (id);


-- Name: review_comments review_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.review_comments
    ADD CONSTRAINT review_comments_pkey PRIMARY KEY (id);


-- Name: reviews reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_pkey PRIMARY KEY (id);


-- Name: users users_email_unique; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_unique UNIQUE (email);


-- Name: users users_github_id_unique; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_github_id_unique UNIQUE (github_id);


-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


-- Name: audit_logs_user_created_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX audit_logs_user_created_idx ON public.audit_logs USING btree (user_id, created_at);


-- Name: commit_reviews_repo_created_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX commit_reviews_repo_created_idx ON public.commit_reviews USING btree (repository_id, created_at);


-- Name: commit_reviews_repo_status_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX commit_reviews_repo_status_idx ON public.commit_reviews USING btree (repository_id, status);


-- Name: personal_access_tokens_tokenable_type_tokenable_id_index; Type: INDEX; Schema: public; Owner: -

CREATE INDEX personal_access_tokens_tokenable_type_tokenable_id_index ON public.personal_access_tokens USING btree (tokenable_type, tokenable_id);


-- Name: pull_requests_repo_created_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX pull_requests_repo_created_idx ON public.pull_requests USING btree (repository_id, created_at);


-- Name: pull_requests_repo_status_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX pull_requests_repo_status_idx ON public.pull_requests USING btree (repository_id, status);


-- Name: repositories_user_active_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX repositories_user_active_idx ON public.repositories USING btree (user_id, is_active);


-- Name: review_comments_review_layer_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX review_comments_review_layer_idx ON public.review_comments USING btree (review_id, layer);


-- Name: review_comments_review_severity_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX review_comments_review_severity_idx ON public.review_comments USING btree (review_id, severity);


-- Name: reviews_pr_created_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX reviews_pr_created_idx ON public.reviews USING btree (pull_request_id, created_at);


-- Name: audit_logs audit_logs_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


-- Name: commit_reviews commit_reviews_repository_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.commit_reviews
    ADD CONSTRAINT commit_reviews_repository_id_foreign FOREIGN KEY (repository_id) REFERENCES public.repositories(id) ON DELETE CASCADE;


-- Name: pull_requests pull_requests_repository_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.pull_requests
    ADD CONSTRAINT pull_requests_repository_id_foreign FOREIGN KEY (repository_id) REFERENCES public.repositories(id) ON DELETE CASCADE;


-- Name: repositories repositories_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.repositories
    ADD CONSTRAINT repositories_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


-- Name: review_comments review_comments_review_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.review_comments
    ADD CONSTRAINT review_comments_review_id_foreign FOREIGN KEY (review_id) REFERENCES public.reviews(id) ON DELETE CASCADE;


-- Name: reviews reviews_pull_request_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_pull_request_id_foreign FOREIGN KEY (pull_request_id) REFERENCES public.pull_requests(id) ON DELETE CASCADE;



\unrestrict wjcdXnRhm7ejMSSnByBjuPVLFgZSRZ3tQUatnNqEFT04Sarm8p2Z46dAviqbFuv

