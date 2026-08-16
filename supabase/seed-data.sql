-- Optional: the same 3 sample posts from earlier, as ready-to-run SQL.
-- Run this in the SQL Editor after schema.sql if you want sample content
-- to look at before writing your own. Safe to skip entirely.

insert into posts (slug, title, date, category, tags, excerpt, body_md, body_html, status)
values ('why-redis-is-fast', 'Why Redis Is Fast', '2026-07-18', 'Systems', ARRAY['redis', 'performance', 'data-structures'], 'It''s not the language it''s written in. It''s what it refuses to do.', 'Redis gets called "fast" so often the reason gets skipped over. The reason isn''t C, and it isn''t even that it''s in-memory — plenty of in-memory stores are slow. It''s what Redis *doesn''t* do.

## Single-threaded on purpose

Redis runs its core command loop on a single thread. That sounds like a limitation until you notice what it removes: no locks, no context switching between cores for a single operation, no cache invalidation between CPUs fighting over the same key. A command either runs to completion or it doesn''t start.

## The event loop does the waiting

Network I/O is handled by an event loop (historically epoll on Linux), so the single thread is never blocked waiting on a slow client — it''s blocked waiting on nothing, because the OS tells it exactly which sockets are ready.

## Data structures built for the job

A `ZADD` isn''t reimplementing a general-purpose sorted container — it''s a skip list tuned for exactly this access pattern. Same story for hashes, sets, and lists. Purpose-built structures beat general-purpose ones almost every time you can afford to build them.

> Speed, most of the time, is a list of things you decided not to do.

None of this is exotic. It''s closer to a design philosophy: pick one thread, remove contention, and spend the saved complexity budget on data structures instead of concurrency primitives.', '<p>Redis gets called "fast" so often the reason gets skipped over. The reason isn''t C, and it isn''t even that it''s in-memory — plenty of in-memory stores are slow. It''s what Redis <em>doesn''t</em> do.</p><h2>Single-threaded on purpose</h2><p>Redis runs its core command loop on a single thread. That sounds like a limitation until you notice what it removes: no locks, no context switching between cores for a single operation, no cache invalidation between CPUs fighting over the same key. A command either runs to completion or it doesn''t start.</p><h2>The event loop does the waiting</h2><p>Network I/O is handled by an event loop (historically epoll on Linux), so the single thread is never blocked waiting on a slow client — it''s blocked waiting on nothing, because the OS tells it exactly which sockets are ready.</p><h2>Data structures built for the job</h2><p>A <code>ZADD</code> isn''t reimplementing a general-purpose sorted container — it''s a skip list tuned for exactly this access pattern. Same story for hashes, sets, and lists. Purpose-built structures beat general-purpose ones almost every time you can afford to build them.</p><blockquote><p>Speed, most of the time, is a list of things you decided not to do.</p></blockquote><p>None of this is exotic. It''s closer to a design philosophy: pick one thread, remove contention, and spend the saved complexity budget on data structures instead of concurrency primitives.</p>', 'published')
on conflict (slug) do nothing;

insert into posts (slug, title, date, category, tags, excerpt, body_md, body_html, status)
values ('pragmatic-programmer-notes', 'Reading "The Pragmatic Programmer" — Notes', '2026-07-25', 'Book Notes', ARRAY['books', 'craft'], 'The parts that were obvious in hindsight, and the one that wasn''t.', 'Most of this book is advice that sounds obvious once you''ve been burned by ignoring it. A few notes that stuck.

## DRY is about knowledge, not lines of code

"Don''t repeat yourself" gets flattened into "don''t copy-paste," but the book''s actual claim is narrower and more useful: every piece of *knowledge* should have a single, unambiguous representation in a system. Two functions can look identical without violating DRY, and two functions can look nothing alike while violating it badly.

## Tracer bullets, not prototypes

A prototype is meant to be thrown away. A tracer bullet is a thin, real, end-to-end slice of the actual system — meant to be kept and built on. The distinction matters more than it sounds like it should; it changes what you''re willing to cut corners on.

## The one that wasn''t obvious

> Care about your craft — why spend your life developing software unless you care about doing it well?

It''s a plain sentence, but it''s the one I underlined. Most technical advice tells you what to do differently. This one is closer to asking why you''d bother reading the rest of the book at all.', '<p>Most of this book is advice that sounds obvious once you''ve been burned by ignoring it. A few notes that stuck.</p><h2>DRY is about knowledge, not lines of code</h2><p>"Don''t repeat yourself" gets flattened into "don''t copy-paste," but the book''s actual claim is narrower and more useful: every piece of <em>knowledge</em> should have a single, unambiguous representation in a system. Two functions can look identical without violating DRY, and two functions can look nothing alike while violating it badly.</p><h2>Tracer bullets, not prototypes</h2><p>A prototype is meant to be thrown away. A tracer bullet is a thin, real, end-to-end slice of the actual system — meant to be kept and built on. The distinction matters more than it sounds like it should; it changes what you''re willing to cut corners on.</p><h2>The one that wasn''t obvious</h2><blockquote><p>Care about your craft — why spend your life developing software unless you care about doing it well?</p></blockquote><p>It''s a plain sentence, but it''s the one I underlined. Most technical advice tells you what to do differently. This one is closer to asking why you''d bother reading the rest of the book at all.</p>', 'published')
on conflict (slug) do nothing;

insert into posts (slug, title, date, category, tags, excerpt, body_md, body_html, status)
values ('before-my-first-system-design-interview', 'What I Wish I Knew Before My First System Design Interview', '2026-08-02', 'Career', ARRAY['interviewing', 'system-design'], 'Nobody is grading you on knowing the right answer. They''re grading you on what you ask before giving one.', 'I walked into my first system design interview expecting a quiz. It''s closer to a conversation with no fixed script, and that mismatch cost me more than any gap in my technical knowledge did.

## The requirements are the interview

I jumped straight to drawing boxes. The candidates who did better spent the first several minutes asking questions — read/write ratio, consistency requirements, expected scale — before touching the whiteboard. The design is downstream of the requirements; skipping that step means designing for a system nobody described.

## "It depends" is a valid answer, with a condition attached

Saying a database choice "depends" and stopping there isn''t an answer. Saying it depends on write throughput, and stating which choice you''d make above and below some threshold, is.

## Narrate the trade-off, not just the decision

Every real design decision gives something up. Naming what you''re giving up — and why that''s an acceptable cost for this specific system — is most of what''s actually being evaluated.

None of this replaces knowing what a consistent hash ring is. But knowing the vocabulary without narrating the reasoning is a much smaller gap than the other way around.', '<p>I walked into my first system design interview expecting a quiz. It''s closer to a conversation with no fixed script, and that mismatch cost me more than any gap in my technical knowledge did.</p><h2>The requirements are the interview</h2><p>I jumped straight to drawing boxes. The candidates who did better spent the first several minutes asking questions — read/write ratio, consistency requirements, expected scale — before touching the whiteboard. The design is downstream of the requirements; skipping that step means designing for a system nobody described.</p><h2>"It depends" is a valid answer, with a condition attached</h2><p>Saying a database choice "depends" and stopping there isn''t an answer. Saying it depends on write throughput, and stating which choice you''d make above and below some threshold, is.</p><h2>Narrate the trade-off, not just the decision</h2><p>Every real design decision gives something up. Naming what you''re giving up — and why that''s an acceptable cost for this specific system — is most of what''s actually being evaluated.</p><p>None of this replaces knowing what a consistent hash ring is. But knowing the vocabulary without narrating the reasoning is a much smaller gap than the other way around.</p>', 'published')
on conflict (slug) do nothing;
