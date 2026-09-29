-- StudyForge: the learner in the loop (docs/LIVING_TEXTBOOK_PLAN.md, phase 5).
-- Run once in the Supabase SQL Editor after 004_trust.sql. Safe to re-run.
--
--   book_reads.read_sections   section ids the reader marked as read
--   book_reads.quiz_scores     {chapter title: {score, total, at}} from "Quiz me on this chapter"

alter table public.book_reads add column if not exists read_sections jsonb not null default '[]';
alter table public.book_reads add column if not exists quiz_scores jsonb not null default '{}';
